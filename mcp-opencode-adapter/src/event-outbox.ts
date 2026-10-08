import fs from "node:fs";
import type { EventName } from "./events.ts";

// Durable outbox for MCP Events deliveries, one record per
// (subscription_id, event_key). Same persistence pattern as subscription-store:
// a JSON file (mode 0600) rewritten atomically (tmp + rename), re-read on every
// operation. A pid lock file keeps a second adapter process from writing it.
//
// Delivery is at-least-once with a stable eventId: a crash after the receiver
// accepted but before "delivered" is persisted causes an idempotent resend.

export type OutboxStatus =
  | "pending"    // will be (re)attempted
  | "delivered"  // receiver answered 2xx
  | "gone"       // 410: subscription removed, not retried
  | "rejected"   // 413: not retried
  | "exhausted"  // bounded retries used up; kept as evidence
  | "expired"    // subscription expired before delivery
  | "revoked";   // subscription no longer exists

export type OutboxRecord = {
  key: string;
  subscriptionId: string;
  eventKey: string;
  eventId: string;
  name: EventName;
  missionId: string;
  sessionId: string;
  // Validated, sanitized payload. Never the subscription secret or callback URL.
  data: Record<string, string | boolean>;
  occurredAt: string | null;
  status: OutboxStatus;
  attempts: number;
  rounds: number;
  nextAttemptAt: string | null;
  lastStatus: number | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

type OutboxState = Record<string, OutboxRecord>;

// Terminal records kept as evidence; pending records are never pruned.
const MAX_TERMINAL_RECORDS = 1000;

export class OutboxLockedError extends Error {
  constructor(readonly pid: number) {
    super(`event outbox is locked by running pid ${pid}`);
    this.name = "OutboxLockedError";
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    return e?.code === "EPERM";
  }
}

export class EventOutbox {
  readonly lockFile: string;

  constructor(readonly file: string) {
    this.lockFile = file + ".lock";
    this.acquireLock();
  }

  // One writer process per outbox. Same pid (in-process restart) or a dead
  // pid (crash) may take the lock over.
  private acquireLock(): void {
    for (let i = 0; i < 2; i++) {
      try {
        fs.writeFileSync(this.lockFile, String(process.pid), { flag: "wx", mode: 0o600 });
        process.once("exit", () => this.releaseLock());
        return;
      } catch (e: any) {
        if (e?.code !== "EEXIST") throw e;
      }
      const holder = Number(fs.readFileSync(this.lockFile, "utf8").trim());
      if (holder === process.pid) return;
      if (Number.isInteger(holder) && holder > 0 && pidAlive(holder)) {
        throw new OutboxLockedError(holder);
      }
      fs.rmSync(this.lockFile, { force: true }); // stale lock from a dead process
    }
    throw new Error("could not acquire event outbox lock");
  }

  releaseLock(): void {
    try {
      if (fs.readFileSync(this.lockFile, "utf8").trim() === String(process.pid)) {
        fs.rmSync(this.lockFile, { force: true });
      }
    } catch {
      // already gone
    }
  }

  private load(): OutboxState {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Invalid event outbox state");
      }
      return parsed as OutboxState;
    } catch (error: any) {
      if (error?.code === "ENOENT") return {};
      throw error;
    }
  }

  private save(state: OutboxState): void {
    const terminal = Object.values(state)
      .filter((r) => r.status !== "pending")
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    for (const r of terminal.slice(0, Math.max(0, terminal.length - MAX_TERMINAL_RECORDS))) {
      delete state[r.key];
    }
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  get(key: string): OutboxRecord | undefined {
    return this.load()[key];
  }

  put(record: OutboxRecord): void {
    const state = this.load();
    state[record.key] = { ...record, updatedAt: new Date().toISOString() };
    this.save(state);
  }

  pending(): OutboxRecord[] {
    return Object.values(this.load()).filter((r) => r.status === "pending");
  }

  all(): OutboxRecord[] {
    return Object.values(this.load());
  }
}
