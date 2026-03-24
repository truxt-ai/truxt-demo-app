type Condition = {
  field: string;
  op: "=" | "!=" | ">" | "<" | ">=" | "<=" | "IN" | "LIKE" | "ILIKE" | "BETWEEN";
  value: any;
};

export class QueryBuilder {
  private table: string;
  private conditions: Condition[] = [];
  private orderByFields: { field: string; direction: "ASC" | "DESC" }[] = [];
  private limitValue?: number;
  private offsetValue?: number;
  private selectFields: string[] = ["*"];

  constructor(table: string) {
    this.table = table;
  }

  select(...fields: string[]): this {
    this.selectFields = fields;
    return this;
  }

  where(field: string, op: Condition["op"], value: any): this {
    this.conditions.push({ field, op, value });
    return this;
  }

  orderBy(field: string, direction: "ASC" | "DESC" = "ASC"): this {
    this.orderByFields.push({ field, direction });
    return this;
  }

  limit(n: number): this {
    this.limitValue = n;
    return this;
  }

  offset(n: number): this {
    this.offsetValue = n;
    return this;
  }

  build(): { text: string; values: any[] } {
    const values: any[] = [];
    let idx = 1;

    let sql = `SELECT ${this.selectFields.join(", ")} FROM ${this.table}`;

    if (this.conditions.length > 0) {
      const whereClauses = this.conditions.map((c) => {
        if (c.op === "IN") {
          const placeholders = (c.value as any[]).map(() => `$${idx++}`).join(", ");
          values.push(...c.value);
          return `${c.field} IN (${placeholders})`;
        }
        if (c.op === "BETWEEN") {
          values.push(c.value[0], c.value[1]);
          return `${c.field} BETWEEN $${idx++} AND $${idx++}`;
        }
        values.push(c.value);
        return `${c.field} ${c.op} $${idx++}`;
      });
      sql += ` WHERE ${whereClauses.join(" AND ")}`;
    }

    if (this.orderByFields.length > 0) {
      sql += ` ORDER BY ${this.orderByFields.map((o) => `${o.field} ${o.direction}`).join(", ")}`;
    }

    if (this.limitValue !== undefined) {
      sql += ` LIMIT $${idx++}`;
      values.push(this.limitValue);
    }

    if (this.offsetValue !== undefined) {
      sql += ` OFFSET $${idx++}`;
      values.push(this.offsetValue);
    }

    return { text: sql, values };
  }
}
