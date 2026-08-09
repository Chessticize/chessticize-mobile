import type { LocalDataExport } from "./practice-store.ts";

export type ProgressV2Phase = "bridging" | "sealed";

export type ProgressV2RecordKind =
  | "attempt"
  | "manifest"
  | "practice_run"
  | "preferences"
  | "rating"
  | "review_schedule"
  | "sprint_session";

export interface ProgressV2RecordIdentity {
  kind: ProgressV2RecordKind;
  entityKey: string;
}

export interface ProgressV2OutboxEntry extends ProgressV2RecordIdentity {
  enqueuedAt: string;
  revision: number;
}

export interface ProgressV2OutboxStats {
  pendingCount: number;
  oldestEnqueuedAt?: string;
}

export interface ProgressV2Tombstone extends ProgressV2RecordIdentity {
  deletedAt: string;
}

export interface ProgressV2LocalState {
  phase: ProgressV2Phase;
  zoneInitialized: boolean;
  serverChangeToken?: string;
  serverChangeTokenFingerprint?: string;
  seededAt?: string;
  lastPullAt?: string;
  lastPushAt?: string;
  lastV1ChangeTag?: string;
  pendingV1ChangeTag?: string;
  lastV1ImportAt?: string;
  lastV1CheckAt?: string;
  lastV1CheckStatus?: "available" | "missing";
  sealedAt?: string;
}

export type ProgressV2StatePatch = {
  phase?: ProgressV2Phase;
  zoneInitialized?: boolean;
  serverChangeToken?: string | null;
  serverChangeTokenFingerprint?: string | null;
  seededAt?: string | null;
  lastPullAt?: string | null;
  lastPushAt?: string | null;
  lastV1ChangeTag?: string | null;
  pendingV1ChangeTag?: string | null;
  lastV1ImportAt?: string | null;
  lastV1CheckAt?: string | null;
  lastV1CheckStatus?: "available" | "missing" | null;
  sealedAt?: string | null;
};

export interface ProgressV2Persistence {
  exportData(): LocalDataExport;
  readState(): ProgressV2LocalState;
  writeState(patch: ProgressV2StatePatch): void;
  stageOutbox(entries: readonly ProgressV2RecordIdentity[], enqueuedAt: string): void;
  listOutbox(limit?: number): ProgressV2OutboxEntry[];
  hasOutbox(identity: ProgressV2RecordIdentity): boolean;
  getOutboxStats(): ProgressV2OutboxStats;
  acknowledgeOutbox(entries: readonly ProgressV2OutboxEntry[], pushedAt: string): void;
  listTombstones(): ProgressV2Tombstone[];
  applyTombstones(tombstones: readonly ProgressV2Tombstone[]): void;
  applyRemoteBatch<T>(patch: ProgressV2StatePatch, work: () => T): T;
  commitStateAndStage(
    patch: ProgressV2StatePatch,
    entries: readonly ProgressV2RecordIdentity[],
    enqueuedAt: string
  ): void;
}

export interface ProgressV2PersistenceHost {
  readonly progressV2?: ProgressV2Persistence;
}

export interface ProgressV2Diagnostics {
  phase: ProgressV2Phase;
  zoneInitialized: boolean;
  serverChangeTokenFingerprint?: string;
  pendingOutboxCount: number;
  oldestPendingOutboxAt?: string;
  lastPullAt?: string;
  lastPushAt?: string;
  lastV1ChangeTag?: string;
  pendingV1ChangeTag?: string;
  lastV1ImportAt?: string;
  lastV1CheckAt?: string;
  lastV1CheckStatus?: "available" | "missing";
}

export class InMemoryProgressV2Persistence implements ProgressV2Persistence {
  private readonly dataExporter: () => LocalDataExport;
  private readonly tombstoneApplier: (tombstones: readonly ProgressV2Tombstone[]) => void;
  private readonly clock: () => string;
  private state: ProgressV2LocalState;
  private readonly outbox = new Map<string, ProgressV2OutboxEntry>();
  private readonly tombstones = new Map<string, ProgressV2Tombstone>();
  private readonly observed = new Map<string, string>();
  private suppressOutbox = false;

  constructor(
    dataExporter: () => LocalDataExport,
    tombstoneApplier: (tombstones: readonly ProgressV2Tombstone[]) => void,
    clock: () => string = () => new Date().toISOString()
  ) {
    this.dataExporter = dataExporter;
    this.tombstoneApplier = tombstoneApplier;
    this.clock = clock;
    this.state = {
      phase: "bridging",
      zoneInitialized: false,
      seededAt: this.clock()
    };
    this.stageOutbox(
      [{ kind: "manifest", entityKey: "default" }],
      this.state.seededAt ?? this.clock()
    );
  }

  exportData(): LocalDataExport {
    return this.dataExporter();
  }

  readState(): ProgressV2LocalState {
    return { ...this.state };
  }

  writeState(patch: ProgressV2StatePatch): void {
    this.state = applyStatePatch(this.state, patch);
  }

  stageOutbox(entries: readonly ProgressV2RecordIdentity[], enqueuedAt: string): void {
    for (const entry of entries) {
      const key = memoryIdentityKey(entry);
      this.outbox.set(key, {
        ...entry,
        enqueuedAt,
        revision: (this.outbox.get(key)?.revision ?? 0) + 1
      });
    }
  }

  listOutbox(limit = 400): ProgressV2OutboxEntry[] {
    this.reconcileObservedData();
    return [...this.outbox.values()]
      .sort((left, right) =>
        Number(left.kind === "manifest") - Number(right.kind === "manifest") ||
        left.enqueuedAt.localeCompare(right.enqueuedAt) ||
        left.kind.localeCompare(right.kind) ||
        left.entityKey.localeCompare(right.entityKey)
      )
      .slice(0, Math.max(1, Math.min(400, Math.trunc(limit))));
  }

  getOutboxStats(): ProgressV2OutboxStats {
    const oldest = [...this.outbox.values()]
      .sort((left, right) => left.enqueuedAt.localeCompare(right.enqueuedAt))[0];
    return {
      pendingCount: this.outbox.size,
      ...(oldest === undefined ? {} : { oldestEnqueuedAt: oldest.enqueuedAt })
    };
  }

  hasOutbox(identity: ProgressV2RecordIdentity): boolean {
    this.reconcileObservedData();
    return this.outbox.has(memoryIdentityKey(identity));
  }

  acknowledgeOutbox(entries: readonly ProgressV2OutboxEntry[], pushedAt: string): void {
    this.reconcileObservedData();
    for (const entry of entries) {
      const key = memoryIdentityKey(entry);
      const current = this.outbox.get(key);
      if (current?.revision === entry.revision) {
        this.outbox.delete(key);
      }
    }
    this.writeState({ lastPushAt: pushedAt });
  }

  listTombstones(): ProgressV2Tombstone[] {
    return [...this.tombstones.values()]
      .map((item) => ({ ...item }))
      .sort((left, right) =>
        left.kind.localeCompare(right.kind) || left.entityKey.localeCompare(right.entityKey)
      );
  }

  applyTombstones(tombstones: readonly ProgressV2Tombstone[]): void {
    const accepted: ProgressV2Tombstone[] = [];
    for (const tombstone of tombstones) {
      const key = memoryIdentityKey(tombstone);
      const previous = this.tombstones.get(key);
      if (!previous || tombstone.deletedAt > previous.deletedAt) {
        const cloned = { ...tombstone };
        this.tombstones.set(key, cloned);
        accepted.push(cloned);
      }
    }
    if (accepted.length > 0) {
      this.tombstoneApplier(accepted);
    }
  }

  stageLocalTombstones(
    tombstones: readonly ProgressV2Tombstone[],
    enqueuedAt: string
  ): void {
    for (const tombstone of tombstones) {
      const key = memoryIdentityKey(tombstone);
      const previous = this.tombstones.get(key);
      if (!previous || tombstone.deletedAt > previous.deletedAt) {
        this.tombstones.set(key, { ...tombstone });
      }
    }
    this.stageOutbox(tombstones, enqueuedAt);
  }

  applyRemoteBatch<T>(patch: ProgressV2StatePatch, work: () => T): T {
    // Preserve local work created since the last observation before remote
    // imports update the observation baseline under suppression.
    this.reconcileObservedData();
    this.suppressOutbox = true;
    try {
      const result = work();
      this.reconcileObservedData();
      this.writeState(patch);
      return result;
    } finally {
      this.suppressOutbox = false;
    }
  }

  commitStateAndStage(
    patch: ProgressV2StatePatch,
    entries: readonly ProgressV2RecordIdentity[],
    enqueuedAt: string
  ): void {
    this.writeState(patch);
    this.stageOutbox(entries, enqueuedAt);
  }

  private reconcileObservedData(): void {
    const current = memoryRecordSignatures(this.dataExporter(), this.tombstones.values());
    for (const [key, record] of current) {
      if (this.observed.get(key) !== record.signature) {
        this.observed.set(key, record.signature);
        if (!this.suppressOutbox) {
          this.stageOutbox([record.identity], this.clock());
        }
      }
    }
  }
}

function applyStatePatch(
  current: ProgressV2LocalState,
  patch: ProgressV2StatePatch
): ProgressV2LocalState {
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[key];
    } else if (value !== undefined) {
      next[key] = value;
    }
  }
  return next as unknown as ProgressV2LocalState;
}

function memoryRecordSignatures(
  data: LocalDataExport,
  tombstones: Iterable<ProgressV2Tombstone>
): Map<string, { identity: ProgressV2RecordIdentity; signature: string }> {
  const records = new Map<string, { identity: ProgressV2RecordIdentity; signature: string }>();
  const add = (identity: ProgressV2RecordIdentity, value: unknown) => {
    records.set(memoryIdentityKey(identity), { identity, signature: stableMemoryJson(value) });
  };
  add({ kind: "preferences", entityKey: "default" }, {
    notifications: data.settings.notifications,
    moveFeedback: data.settings.moveFeedback
  });
  for (const rating of data.ratings) add({ kind: "rating", entityKey: `${rating.key}\u001f${rating.generation}` }, rating);
  for (const attempt of data.attempts) add({ kind: "attempt", entityKey: attempt.id }, attempt);
  for (const session of data.sprintSessions) add({ kind: "sprint_session", entityKey: session.id }, session);
  for (const run of data.practiceRuns) add({ kind: "practice_run", entityKey: run.id }, run);
  for (const review of data.reviewQueue) {
    add(
      { kind: "review_schedule", entityKey: `${review.puzzleId}\u001f${review.mode}\u001f${review.ratingKey}` },
      { kind: "scheduled", review }
    );
  }
  for (const removal of data.reviewRemovals ?? []) {
    add(
      { kind: "review_schedule", entityKey: `${removal.puzzleId}\u001f${removal.mode}\u001f${removal.ratingKey}` },
      { kind: "removed", removal }
    );
  }
  for (const tombstone of tombstones) add(tombstone, tombstone);
  return records;
}

function memoryIdentityKey(identity: ProgressV2RecordIdentity): string {
  return `${identity.kind}\u0000${identity.entityKey}`;
}

function stableMemoryJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableMemoryJson).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableMemoryJson(child)}`)
    .join(",")}}`;
}
