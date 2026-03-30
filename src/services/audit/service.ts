type AuditLogEntry = {
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
};

export class AuditService {
  async log(entry: AuditLogEntry): Promise<void> {
    // Minimal implementation for now; replace with persistent storage when audit table is available.
    void entry;
    return;
  }
}
