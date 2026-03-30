import { AsyncLocalStorage } from "async_hooks";
import crypto from "crypto";

export interface RequestContext {
  requestId: string;
  userId?: string;
  userEmail?: string;
  userRole?: string;
  teamId?: string;
  startTime: number;
  ip: string;
  method: string;
  path: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getRequestId(): string {
  return storage.getStore()?.requestId || "unknown";
}

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function createContext(req: {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  method: string;
  path: string;
  user?: { id: string; email: string; role: string };
}): RequestContext {
  return {
    requestId: (req.headers["x-request-id"] as string) || crypto.randomUUID(),
    userId: req.user?.id,
    userEmail: req.user?.email,
    userRole: req.user?.role,
    startTime: Date.now(),
    ip: req.ip || "unknown",
    method: req.method,
    path: req.path,
  };
}
