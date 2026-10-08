import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  activeSubscriptions,
  deleteSubscription,
  loadSubscriptions,
  SubscriptionRecord
} from "./subscription-store.ts";
import { EventOutbox, OutboxRecord } from "./event-outbox.ts";
import { deliverWebhook, WebhookResponse } from "./webhook-security.ts";
import { EventName, eventPayloadSchemas, PRINCIPAL, TURN_RESULT_EXCERPT_MAX } from "./events.ts";

// Emits MCP Events from real OpenCode transitions.
//
// Source of truth: OpenCode's own /event stream (session.idle, session.status,
// session.error, permission.asked, question.asked) plus the same endpoints
// get_mission already reads. No extra process and no periodic polling: the
// stream lives inside the adapter process, and a one-shot reconcile runs on
// each (re)connect to cover transitions missed while disconnected.

export type MissionMap = Record<string, { session_id: string; title: string }>;
export type OcClient = (route: string, init?: RequestInit) => Promise<any>;

export type Emission = {
  name: EventName;
  missionId: string;
  sessionId: string;
  // Stable identity of the underlying OpenCode fact; used for de-duplication.
  key: string;
  // When the transition happened (ms). null = still-pending state (permission/question).
  occurredAt: number | null;
  data: Record<string, string | boolean>;
};

const MAX_RESULT_BYTES = 128 * 1024;
const DELIVERY_ATTEMPTS = 3;
// Bounded follow-up rounds after a failed round. Timers exist only while a
// record is pending; after the last round the record becomes "exhausted".
export const RETRY_ROUND_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
const RELEVANT_TYPES = new Set([
  "permission.asked",
  "permission.updated",
  "question.asked",
  "session.idle",
  "session.status"
]);

export function textParts(message: any): string {
  return (message?.parts ?? [])
    .filter((p: any) => p?.type === "text" && typeof p.text === "string")
    .map((p: any) => p.text)
    .join("\n")
    .trim();
}

export function latestAssistant(messages: any[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const role = m?.info?.role ?? m?.role;
    if (role === "assistant") {
      const text = textParts(m);
      if (text) return text;
    }
  }
  return null;
}

function truncateUtf8(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= maxBytes) return text;
  return buf.subarray(0, maxBytes).toString("utf8").replace(/�$/, "") +
    "\n…[truncated]";
}

function describeError(error: any): string {
  const name = typeof error?.name === "string" ? error.name : "Error";
  const message = error?.data?.message ?? error?.message;
  return typeof message === "string" && message ? `${name}: ${message}` : name;
}

export type SessionSnapshot = {
  missionId: string;
  sessionId: string;
  // Raw OpenCode SessionStatus for this session; undefined means idle.
  status: any;
  messages: any[];
  pendingPermissions: number;
  pendingQuestions: number;
  // Last session.error observed on the stream for this session, if any.
  lastSessionError?: { error: any; at: number };
};

// A technically finished turn: OpenCode can assert that the model stopped,
// never that the mission succeeded. Emitted as mission.turn_completed.
export type TurnCompleted = {
  kind: "turn_completed";
  missionId: string;
  sessionId: string;
  turnId: string;
  completedAt: number;
  result: string;
};

// Classifies a settled OpenCode turn. Returns mission.failed emissions (an
// OpenCode error is a fact), a TurnCompleted record (end of turn only), or null
// whenever evidence is insufficient: never infers anything from running, retry,
// mere inactivity, or what the model's text claims.
export function classifyTurn(s: SessionSnapshot): Emission | TurnCompleted | null {
  const statusType = s.status?.type ?? (typeof s.status === "string" ? s.status : "idle");
  if (statusType !== "idle") return null;

  const last = s.messages[s.messages.length - 1];
  if (!last) return null;
  const info = last.info ?? last;
  const base = { missionId: s.missionId, sessionId: s.sessionId };

  if (info.role === "user") {
    // Turn ended without any assistant reply: only an explicit OpenCode error counts.
    const created = info.time?.created ?? 0;
    if (s.lastSessionError && s.lastSessionError.at >= created) {
      return {
        ...base,
        name: "mission.failed",
        key: `failed:noreply:${info.id}`,
        occurredAt: s.lastSessionError.at,
        data: {
          mission_id: s.missionId,
          session_id: s.sessionId,
          error: describeError(s.lastSessionError.error)
        }
      };
    }
    return null;
  }

  if (info.role !== "assistant" || typeof info.time?.completed !== "number") {
    return null;
  }

  if (info.error) {
    return {
      ...base,
      name: "mission.failed",
      key: `failed:${info.id}`,
      occurredAt: info.time.completed,
      data: {
        mission_id: s.missionId,
        session_id: s.sessionId,
        error: describeError(info.error)
      }
    };
  }

  const text = textParts(last);
  if (
    info.finish === "stop" &&
    s.pendingPermissions === 0 &&
    s.pendingQuestions === 0 &&
    text
  ) {
    return {
      kind: "turn_completed",
      missionId: s.missionId,
      sessionId: s.sessionId,
      turnId: info.id,
      completedAt: info.time.completed,
      result: truncateUtf8(text, MAX_RESULT_BYTES)
    };
  }

  return null;
}

function isTurnCompleted(x: Emission | TurnCompleted | null): x is TurnCompleted {
  return (x as TurnCompleted | null)?.kind === "turn_completed";
}

// High-confidence credential shapes only; defense in depth, not a DLP.
const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bwhsec_[A-Za-z0-9+/=]{16,}/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi
];
// Also matches prefixed env names such as OPENCODE_SERVER_PASSWORD=… or GITHUB_TOKEN: …
const SECRET_ASSIGNMENT =
  /\b([A-Za-z0-9_-]*?(?:password|passwd|secret|token|api[_-]?key)|authorization)(\s*[:=]\s*)("[^"]*"|'[^']*'|\S+)/gi;

export function redactSecrets(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) out = out.replace(re, "[REDACTED]");
  return out.replace(SECRET_ASSIGNMENT, (_m, key, sep) => `${key}${sep}[REDACTED]`);
}

// Redact first (so a cut cannot expose half a secret), then bound by UTF-16
// length without splitting a surrogate pair (also satisfies JSON maxLength).
export function turnResultExcerpt(text: string): { excerpt: string; truncated: boolean } {
  const redacted = redactSecrets(text);
  if (redacted.length <= TURN_RESULT_EXCERPT_MAX) return { excerpt: redacted, truncated: false };
  let excerpt = redacted.slice(0, TURN_RESULT_EXCERPT_MAX);
  if (/[\uD800-\uDBFF]$/.test(excerpt)) excerpt = excerpt.slice(0, -1);
  return { excerpt, truncated: true };
}

// mission.turn_completed: technical end of turn, identified by the OpenCode
// assistant message id. Never a statement about mission success.
export function turnCompletedEmission(turn: TurnCompleted): Emission {
  const { excerpt, truncated } = turnResultExcerpt(turn.result);
  return {
    name: "mission.turn_completed",
    missionId: turn.missionId,
    sessionId: turn.sessionId,
    key: `turn:${turn.turnId}`,
    occurredAt: turn.completedAt,
    data: {
      mission_id: turn.missionId,
      session_id: turn.sessionId,
      turn_id: turn.turnId,
      result_excerpt: excerpt,
      result_truncated: truncated
    }
  };
}

export function permissionEmission(missionId: string, sessionId: string, p: any): Emission | null {
  const id = p?.id ?? p?.permissionID;
  if (typeof id !== "string" || !id) return null;
  const permission = p?.permission ?? p?.type ?? p?.title;
  return {
    name: "permission.required",
    missionId,
    sessionId,
    key: `permission:${id}`,
    occurredAt: null,
    data: {
      mission_id: missionId,
      session_id: sessionId,
      permission_id: id,
      permission: typeof permission === "string" ? permission : "unknown"
    }
  };
}

export function questionEmission(missionId: string, sessionId: string, q: any): Emission | null {
  const id = q?.id;
  if (typeof id !== "string" || !id) return null;
  const text = (Array.isArray(q?.questions) ? q.questions : [])
    .map((x: any) => x?.question)
    .filter((x: unknown) => typeof x === "string" && x)
    .join(" | ");
  return {
    name: "mission.blocked",
    missionId,
    sessionId,
    key: `question:${id}`,
    occurredAt: null,
    data: {
      mission_id: missionId,
      session_id: sessionId,
      reason: `question: ${text || "OpenCode is waiting for an answer"}`
    }
  };
}

// A plain retry is transient and is NOT a block. Only a retry that carries an
// explicit provider action (user must act) is reported as mission.blocked.
export function retryActionEmission(
  missionId: string,
  sessionId: string,
  status: any,
  turnId: string
): Emission | null {
  const action = status?.type === "retry" ? status?.action : undefined;
  if (!action || typeof action.reason !== "string") return null;
  return {
    name: "mission.blocked",
    missionId,
    sessionId,
    key: `retry-action:${turnId}:${action.reason}`,
    occurredAt: null,
    data: {
      mission_id: missionId,
      session_id: sessionId,
      reason: [action.title, action.message].filter(Boolean).join(": ") || action.reason
    }
  };
}

function lastUserMessageId(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const info = messages[i]?.info ?? messages[i];
    if (info?.role === "user" && typeof info.id === "string") return info.id;
  }
  return "none";
}

const ID_FIELDS = new Set(["mission_id", "session_id", "turn_id", "permission_id"]);

// Untrusted text (model output, provider errors, question text) is redacted and
// bounded before it is persisted, logged or sent. Heuristic: not a DLP.
export function sanitizePayload(data: Record<string, string | boolean>): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = typeof v === "string" && !ID_FIELDS.has(k)
      ? turnResultExcerpt(v).excerpt
      : v;
  }
  return out;
}

// For lastError and logs: no URLs (callback paths), no credentials, bounded.
export function sanitizeError(e: unknown): string {
  const raw = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return redactSecrets(raw).replace(/https?:\/\/\S+/g, "[url]").slice(0, 300);
}

export function eventIdFor(subscriptionId: string, eventKey: string): string {
  return "evt_" +
    crypto.createHash("sha256").update(`${subscriptionId}|${eventKey}`).digest("hex").slice(0, 32);
}

export type DeliveryOutcome = {
  subscriptionId: string;
  key: string;
  outcome:
    | "delivered" | "duplicate" | "retry_pending" | "predates_subscription"
    | "gone" | "rejected" | "failed" | "exhausted" | "expired" | "revoked";
  status?: number;
};

export type EmitterOptions = {
  oc: OcClient;
  missions: () => MissionMap;
  outboxFile?: string;
  deliver?: typeof deliverWebhook;
  sleep?: (ms: number) => Promise<void>;
  schedule?: (fn: () => void, ms: number) => void;
  log?: (message: string) => void;
  // Observability hook for each technical end of turn (also emitted as mission.turn_completed).
  onTurnCompleted?: (turn: TurnCompleted) => void;
};

export class MissionEventEmitter {
  readonly outbox: EventOutbox;
  private inFlight = new Set<string>();
  private timers = new Set<string>();
  private sessionErrors = new Map<string, { error: any; at: number }>();
  private queues = new Map<string, Promise<unknown>>();
  private deliver: typeof deliverWebhook;
  private sleep: (ms: number) => Promise<void>;
  private schedule: (fn: () => void, ms: number) => void;
  private log: (message: string) => void;

  constructor(private opts: EmitterOptions) {
    // Throws OutboxLockedError if another live process owns the outbox.
    this.outbox = new EventOutbox(
      opts.outboxFile ??
        process.env.MCP_EVENT_OUTBOX_FILE ??
        path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", ".event-outbox.json")
    );
    this.deliver = opts.deliver ?? deliverWebhook;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.schedule = opts.schedule ?? ((fn, ms) => setTimeout(fn, ms).unref());
    this.log = opts.log ?? ((m) => console.error(m));
  }

  private missionForSession(sessionId: string): string | null {
    for (const [missionId, m] of Object.entries(this.opts.missions())) {
      if (m.session_id === sessionId) return missionId;
    }
    return null;
  }

  private subscriptionsFor(missionId: string, name?: EventName): SubscriptionRecord[] {
    return activeSubscriptions().filter(
      (s) =>
        s.principal === PRINCIPAL &&
        s.arguments?.mission_id === missionId &&
        (name === undefined || s.name === name)
    );
  }

  // Resolves once all queued per-session work (including work queued while
  // waiting) has finished. Used by tests and orderly shutdown.
  async settled(): Promise<void> {
    for (;;) {
      const snapshot = [...this.queues.values()];
      await Promise.all(snapshot);
      const now = [...this.queues.values()];
      if (now.length === snapshot.length && now.every((p, i) => p === snapshot[i])) return;
    }
  }

  // Serializes work per session so concurrent stream events cannot race.
  private enqueue<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(sessionId) ?? Promise.resolve();
    const next = prev.then(task, task);
    this.queues.set(sessionId, next.catch(() => undefined));
    return next;
  }

  async emit(emission: Emission): Promise<DeliveryOutcome[]> {
    const data = sanitizePayload(emission.data);
    const parsed = eventPayloadSchemas[emission.name].safeParse(data);
    if (!parsed.success) {
      this.log(`event ${emission.name} dropped: payload does not match schema`);
      return [];
    }

    const outcomes: DeliveryOutcome[] = [];
    for (const sub of this.subscriptionsFor(emission.missionId, emission.name)) {
      const key = `${sub.id}|${emission.key}`;
      const base = { subscriptionId: sub.id, key: emission.key };
      const existing = this.outbox.get(key);

      if (existing) {
        // Never a second record for the same fact; pending ones are owned by
        // their retry schedule (no backoff bypass).
        outcomes.push({ ...base, outcome: existing.status === "pending" ? "retry_pending" : "duplicate" });
        continue;
      }
      if (emission.occurredAt !== null && emission.occurredAt < Date.parse(sub.createdAt)) {
        outcomes.push({ ...base, outcome: "predates_subscription" });
        continue;
      }

      const now = new Date().toISOString();
      const record: OutboxRecord = {
        key,
        subscriptionId: sub.id,
        eventKey: emission.key,
        eventId: eventIdFor(sub.id, emission.key),
        name: emission.name,
        missionId: emission.missionId,
        sessionId: emission.sessionId,
        data,
        occurredAt: emission.occurredAt === null ? null : new Date(emission.occurredAt).toISOString(),
        status: "pending",
        attempts: 0,
        rounds: 0,
        nextAttemptAt: now,
        lastStatus: null,
        lastError: null,
        createdAt: now,
        updatedAt: now
      };
      this.outbox.put(record); // durable before the first attempt
      outcomes.push(await this.attemptRound(key));
    }
    return outcomes;
  }

  // One round = up to DELIVERY_ATTEMPTS sends. Every state change is persisted.
  private async attemptRound(key: string): Promise<DeliveryOutcome> {
    const record = this.outbox.get(key);
    if (!record) return { subscriptionId: "", key, outcome: "revoked" };
    const base = { subscriptionId: record.subscriptionId, key: record.eventKey };
    if (record.status !== "pending") {
      return { ...base, outcome: "duplicate" };
    }
    if (this.inFlight.has(key)) return { ...base, outcome: "retry_pending" };

    const finish = (status: OutboxRecord["status"], extra: Partial<OutboxRecord> = {}) => {
      this.outbox.put({ ...record, ...extra, status, nextAttemptAt: null });
    };

    const sub = loadSubscriptions()[record.subscriptionId];
    if (!sub || sub.principal !== PRINCIPAL) {
      finish("revoked");
      return { ...base, outcome: "revoked" };
    }
    if (sub.expiresAt !== null && Date.parse(sub.expiresAt) <= Date.now()) {
      finish("expired");
      return { ...base, outcome: "expired" };
    }

    this.inFlight.add(key);
    try {
      for (let i = 0; i < DELIVERY_ATTEMPTS; i++) {
        let res: WebhookResponse | undefined;
        let error: string | null = null;
        try {
          // Same eventId (webhook-id) every time; fresh timestamp and signature.
          res = await this.deliver(sub.delivery, sub.id, {
            eventId: record.eventId,
            name: record.name,
            timestamp: new Date().toISOString(),
            data: record.data,
            cursor: null
          });
        } catch (e) {
          error = sanitizeError(e);
          this.log(`event ${record.name} ${record.eventId} attempt failed: ${error}`);
        }
        record.attempts += 1;
        record.lastStatus = res?.status ?? null;
        record.lastError = error ?? (res && (res.status < 200 || res.status >= 300) ? `HTTP ${res.status}` : null);

        if (res && res.status >= 200 && res.status < 300) {
          finish("delivered");
          return { ...base, outcome: "delivered", status: res.status };
        }
        if (res?.status === 410) {
          deleteSubscription(sub.id);
          finish("gone");
          return { ...base, outcome: "gone", status: 410 };
        }
        if (res?.status === 413) {
          finish("rejected");
          return { ...base, outcome: "rejected", status: 413 };
        }
        this.outbox.put(record); // attempt count survives a crash mid-round
        if (i < DELIVERY_ATTEMPTS - 1) await this.sleep(1000 * 4 ** i);
      }

      record.rounds += 1;
      if (record.rounds > RETRY_ROUND_DELAYS_MS.length) {
        finish("exhausted");
        this.log(`event ${record.name} ${record.eventId} exhausted after ${record.attempts} attempts`);
        return { ...base, outcome: "exhausted", status: record.lastStatus ?? undefined };
      }
      const delay = RETRY_ROUND_DELAYS_MS[record.rounds - 1];
      record.nextAttemptAt = new Date(Date.now() + delay).toISOString();
      this.outbox.put(record);
      this.scheduleAttempt(record);
      return { ...base, outcome: "failed", status: record.lastStatus ?? undefined };
    } finally {
      this.inFlight.delete(key);
    }
  }

  private scheduleAttempt(record: OutboxRecord): void {
    if (this.timers.has(record.key)) return;
    this.timers.add(record.key);
    const due = record.nextAttemptAt ? Date.parse(record.nextAttemptAt) - Date.now() : 0;
    this.schedule(() => {
      this.timers.delete(record.key);
      void this.enqueue(record.sessionId, () => this.attemptRound(record.key))
        .catch((e) => this.log(`retry failed: ${sanitizeError(e)}`));
    }, Math.max(0, due));
  }

  // Durable recovery: every pending record (including ones written right
  // before a crash, never attempted) is retried now or at its nextAttemptAt.
  async resumePending(): Promise<DeliveryOutcome[]> {
    const outcomes: DeliveryOutcome[] = [];
    for (const record of this.outbox.pending()) {
      const due = record.nextAttemptAt === null || Date.parse(record.nextAttemptAt) <= Date.now();
      if (due && !this.timers.has(record.key)) {
        outcomes.push(await this.enqueue(record.sessionId, () => this.attemptRound(record.key)));
      } else {
        this.scheduleAttempt(record);
      }
    }
    return outcomes;
  }

  private async snapshot(missionId: string, sessionId: string): Promise<{
    snap: SessionSnapshot;
    permissions: any[];
    questions: any[];
  }> {
    const [statuses, messages, permissions, questions] = await Promise.all([
      this.opts.oc("/session/status"),
      this.opts.oc(`/session/${encodeURIComponent(sessionId)}/message`),
      this.opts.oc("/permission"),
      this.opts.oc("/question").catch(() => [])
    ]);
    const forSession = (list: any) =>
      (Array.isArray(list) ? list : []).filter(
        (x: any) => (x?.sessionID ?? x?.session_id) === sessionId
      );
    const pendingPermissions = forSession(permissions);
    const pendingQuestions = forSession(questions);
    return {
      snap: {
        missionId,
        sessionId,
        status: statuses?.[sessionId],
        messages: Array.isArray(messages) ? messages : [],
        pendingPermissions: pendingPermissions.length,
        pendingQuestions: pendingQuestions.length,
        lastSessionError: this.sessionErrors.get(sessionId)
      },
      permissions: pendingPermissions,
      questions: pendingQuestions
    };
  }

  // Evaluation of one mission from OpenCode's current state.
  // pendingOnly: only still-actionable states (permission, question, retry
  // action); used right after a subscription so no historical closure is sent.
  async evaluateMission(missionId: string, pendingOnly = false): Promise<DeliveryOutcome[]> {
    const mission = this.opts.missions()[missionId];
    if (!mission || this.subscriptionsFor(missionId).length === 0) return [];
    const sessionId = mission.session_id;

    return this.enqueue(sessionId, async () => {
      const { snap, permissions, questions } = await this.snapshot(missionId, sessionId);
      const emissions: (Emission | null)[] = [
        ...permissions.map((p) => permissionEmission(missionId, sessionId, p)),
        ...questions.map((q) => questionEmission(missionId, sessionId, q)),
        retryActionEmission(missionId, sessionId, snap.status, lastUserMessageId(snap.messages))
      ];
      if (!pendingOnly) {
        const turn = classifyTurn(snap);
        if (isTurnCompleted(turn)) {
          // Technical end of turn → mission.turn_completed (never mission.completed).
          this.opts.onTurnCompleted?.(turn);
          emissions.push(turnCompletedEmission(turn));
        } else {
          emissions.push(turn);
        }
      }
      const outcomes: DeliveryOutcome[] = [];
      for (const e of emissions) {
        if (e) outcomes.push(...(await this.emit(e)));
      }
      return outcomes;
    });
  }

  // Called after a successful events/subscribe for this mission.
  async evaluatePending(missionId: string): Promise<DeliveryOutcome[]> {
    return this.evaluateMission(missionId, true);
  }

  // One-shot catch-up for every subscribed mission (startup / stream reconnect).
  async reconcile(): Promise<void> {
    try {
      await this.resumePending();
    } catch (e: any) {
      this.log(`resume pending failed: ${sanitizeError(e)}`);
    }
    const missionIds = new Set(
      activeSubscriptions()
        .filter((s) => s.principal === PRINCIPAL)
        .map((s) => s.arguments?.mission_id)
        .filter((id): id is string => typeof id === "string")
    );
    for (const missionId of missionIds) {
      try {
        await this.evaluateMission(missionId);
      } catch (e: any) {
        this.log(`reconcile ${missionId} failed: ${sanitizeError(e)}`);
      }
    }
  }

  async handleOpenCodeEvent(raw: any): Promise<DeliveryOutcome[]> {
    // /global/event wraps the instance event in { directory, payload }.
    const event = raw?.payload?.type ? raw.payload : raw;
    const type = event?.type;
    const props = event?.properties ?? {};
    const sessionId = props.sessionID;
    if (typeof type !== "string" || typeof sessionId !== "string") return [];

    if (type === "session.error") {
      this.sessionErrors.set(sessionId, { error: props.error, at: Date.now() });
      return [];
    }
    // The stream is chatty; skip irrelevant types before touching the store.
    if (!RELEVANT_TYPES.has(type)) return [];

    const missionId = this.missionForSession(sessionId);
    if (!missionId || this.subscriptionsFor(missionId).length === 0) return [];

    switch (type) {
      case "permission.asked":
      case "permission.updated": {
        const e = permissionEmission(missionId, sessionId, props);
        return e ? this.enqueue(sessionId, () => this.emit(e)) : [];
      }
      case "question.asked": {
        const e = questionEmission(missionId, sessionId, props);
        return e ? this.enqueue(sessionId, () => this.emit(e)) : [];
      }
      case "session.idle":
        return this.evaluateMission(missionId);
      case "session.status": {
        const statusType = props.status?.type;
        if (statusType === "idle") return this.evaluateMission(missionId);
        if (statusType === "retry" && props.status?.action) return this.evaluateMission(missionId);
        return [];
      }
      default:
        return [];
    }
  }
}

// Parses an SSE byte stream into JSON `data:` payloads.
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<any> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const data = chunk
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.replace(/^data:\s?/, ""))
        .join("\n");
      if (!data) continue;
      try {
        yield JSON.parse(data);
      } catch {
        // Ignore malformed frames; never synthesize events from them.
      }
    }
  }
}

export type StreamOptions = {
  url: string;
  headers?: Record<string, string>;
  emitter: MissionEventEmitter;
  signal?: AbortSignal;
  log?: (message: string) => void;
  fetchImpl?: typeof fetch;
};

// Keeps one SSE connection to OpenCode inside the adapter process.
// Backoff 1s → 30s on disconnect; reconcile after every successful connect.
export async function runOpenCodeEventStream(opts: StreamOptions): Promise<void> {
  const log = opts.log ?? ((m) => console.error(m));
  let backoff = 1000;
  while (!opts.signal?.aborted) {
    try {
      const response = await (opts.fetchImpl ?? fetch)(opts.url, {
        headers: { Accept: "text/event-stream", ...(opts.headers ?? {}) },
        signal: opts.signal
      });
      if (!response.ok || !response.body) {
        throw new Error(`OpenCode event stream HTTP ${response.status}`);
      }
      log("OpenCode event stream connected");
      backoff = 1000;
      void opts.emitter.reconcile();
      for await (const event of parseSse(response.body)) {
        opts.emitter.handleOpenCodeEvent(event).catch((e) =>
          log(`event handling failed: ${e?.message ?? e}`)
        );
      }
      log("OpenCode event stream ended");
    } catch (e: any) {
      if (opts.signal?.aborted) break;
      log(`OpenCode event stream error: ${e?.message ?? e}`);
    }
    if (opts.signal?.aborted) break;
    await new Promise((r) => setTimeout(r, backoff));
    backoff = Math.min(backoff * 2, 30_000);
  }
}
