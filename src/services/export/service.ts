import { db } from "../../shared/database";
import { logger } from "../../shared/logger";
import { ValidationError } from "../../shared/errors";

export type ExportFormat = "json" | "csv";
export type ExportResource = "users" | "events" | "audit_log" | "notifications";

interface ExportOptions {
  resource: ExportResource;
  format: ExportFormat;
  filters?: {
    from?: string;
    to?: string;
    userId?: string;
  };
  fields?: string[];
  limit?: number;
}

const RESOURCE_CONFIG: Record<ExportResource, { table: string; defaultFields: string[]; timestampColumn: string }> = {
  users: {
    table: "users",
    defaultFields: ["id", "email", "name", "role", "created_at", "updated_at"],
    timestampColumn: "created_at",
  },
  events: {
    table: "analytics_events",
    defaultFields: ["id", "type", "user_id", "metadata", "timestamp"],
    timestampColumn: "timestamp",
  },
  audit_log: {
    table: "audit_log",
    defaultFields: ["id", "actor_id", "action", "resource_type", "resource_id", "details", "ip_address", "created_at"],
    timestampColumn: "created_at",
  },
  notifications: {
    table: "notifications",
    defaultFields: ["id", "user_id", "type", "title", "body", "read", "created_at"],
    timestampColumn: "created_at",
  },
};

const MAX_EXPORT_ROWS = 50000;

export class DataExportService {
  async export(options: ExportOptions): Promise<{ data: string; contentType: string; filename: string; rowCount: number }> {
    const config = RESOURCE_CONFIG[options.resource];
    if (!config) throw new ValidationError(`Unknown resource: ${options.resource}`);

    const fields = options.fields?.length ? this.validateFields(options.fields, config.defaultFields) : config.defaultFields;
    const limit = Math.min(options.limit || MAX_EXPORT_ROWS, MAX_EXPORT_ROWS);

    const { query, params } = this.buildQuery(config, fields, options.filters, limit);

    logger.info("Data export started", {
      resource: options.resource,
      format: options.format,
      filters: options.filters,
      limit,
    });

    const result = await db.query(query, params);
    const rows = result.rows;

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
    const filename = `${options.resource}_export_${timestamp}`;

    if (options.format === "csv") {
      return {
        data: this.toCSV(rows, fields),
        contentType: "text/csv",
        filename: `${filename}.csv`,
        rowCount: rows.length,
      };
    }

    return {
      data: JSON.stringify({ exported_at: new Date().toISOString(), resource: options.resource, count: rows.length, data: rows }, null, 2),
      contentType: "application/json",
      filename: `${filename}.json`,
      rowCount: rows.length,
    };
  }

  async getExportableResources(): Promise<{ resource: string; fields: string[]; estimatedRows: number }[]> {
    const resources = [];

    for (const [resource, config] of Object.entries(RESOURCE_CONFIG)) {
      try {
        const countResult = await db.query(`SELECT COUNT(*) FROM ${config.table}`);
        resources.push({
          resource,
          fields: config.defaultFields,
          estimatedRows: parseInt(countResult.rows[0].count),
        });
      } catch {
        // Table might not exist yet
        resources.push({ resource, fields: config.defaultFields, estimatedRows: 0 });
      }
    }

    return resources;
  }

  private buildQuery(
    config: { table: string; timestampColumn: string },
    fields: string[],
    filters?: ExportOptions["filters"],
    limit?: number
  ): { query: string; params: any[] } {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters?.from) {
      conditions.push(`${config.timestampColumn} >= $${idx++}`);
      params.push(filters.from);
    }
    if (filters?.to) {
      conditions.push(`${config.timestampColumn} <= $${idx++}`);
      params.push(filters.to);
    }
    if (filters?.userId) {
      const userCol = config.table === "audit_log" ? "actor_id" : "user_id";
      conditions.push(`${userCol} = $${idx++}`);
      params.push(filters.userId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit || MAX_EXPORT_ROWS);

    return {
      query: `SELECT ${fields.join(", ")} FROM ${config.table} ${where} ORDER BY ${config.timestampColumn} DESC LIMIT $${idx}`,
      params,
    };
  }

  private validateFields(requested: string[], allowed: string[]): string[] {
    const invalid = requested.filter((f) => !allowed.includes(f));
    if (invalid.length > 0) {
      throw new ValidationError(`Invalid fields: ${invalid.join(", ")}. Allowed: ${allowed.join(", ")}`);
    }
    return requested;
  }

  private toCSV(rows: Record<string, any>[], fields: string[]): string {
    if (rows.length === 0) return fields.join(",") + "\n";

    const header = fields.join(",");
    const lines = rows.map((row) =>
      fields.map((field) => {
        const value = row[field];
        if (value === null || value === undefined) return "";
        const str = typeof value === "object" ? JSON.stringify(value) : String(value);
        // Escape CSV special characters
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(",")
    );

    return [header, ...lines].join("\n") + "\n";
  }
}
