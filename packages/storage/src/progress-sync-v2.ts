import type {
  ExportedReviewQueueState,
  ExportedSprintSession,
  LocalDataImport,
  LocalDataImportResult,
  PracticeSettings
} from "./practice-store.ts";
import type {
  PracticeRunRecord,
  RatingRecord,
  ReviewScheduleRemoval
} from "../../core/src/index.ts";
import type { AttemptHistoryRow } from "./query-types.ts";
import {
  isCanonicalLocalDataExport,
  normalizeLegacyProgressSyncSnapshot
} from "./local-data-export-validation.ts";
import type {
  ProgressV2LocalState,
  ProgressV2OutboxEntry,
  ProgressV2Persistence,
  ProgressV2Phase,
  ProgressV2RecordIdentity,
  ProgressV2RecordKind,
  ProgressV2Tombstone
} from "./progress-v2-persistence.ts";

export const PROGRESS_V2_FORMAT_VERSION = 2 as const;
export const PROGRESS_V2_ZONE_NAME = "ProgressV2";
export const PROGRESS_V2_RECORD_TYPE = "ProgressV2Record";
export const PROGRESS_V2_WRITER_VERSION = "1.4-v2";

export interface ProgressV2Record {
  recordName: string;
  kind: ProgressV2RecordKind;
  schemaVersion: typeof PROGRESS_V2_FORMAT_VERSION;
  payload: string;
}

export interface ProgressV2DeletedRecord {
  recordName: string;
}

export interface ProgressV2ChangePage {
  records: ProgressV2Record[];
  deletedRecords: ProgressV2DeletedRecord[];
  nextToken: string;
  moreComing: boolean;
}

export interface ProgressV2ModifyResult {
  savedRecordNames: string[];
  deletedRecordNames: string[];
  errors: Array<{ recordName: string; code: string; message: string }>;
}

export type ProgressV1MetadataResult =
  | { status: "missing" }
  | { status: "available"; changeTag: string };

export interface ProgressV2Transport {
  ensureZone(): Promise<void>;
  fetchZoneChanges(previousToken?: string): Promise<ProgressV2ChangePage>;
  modifyRecords(input: {
    saving: readonly ProgressV2Record[];
    deleting: readonly string[];
  }): Promise<ProgressV2ModifyResult>;
  fetchLegacyMetadata(): Promise<ProgressV1MetadataResult>;
  fetchLegacySnapshot(changeTag: string): Promise<unknown>;
}

export interface ProgressV2SyncStore {
  getSettings(): PracticeSettings;
  importLocalData(data: LocalDataImport): LocalDataImportResult;
  applyProgressV2RemoteBatch(
    data: LocalDataImport,
    tombstones: readonly ProgressV2Tombstone[],
    patch: import("./progress-v2-persistence.ts").ProgressV2StatePatch,
    restage: readonly ProgressV2RecordIdentity[]
  ): LocalDataImportResult;
  readonly progressV2: ProgressV2Persistence;
}

export interface ProgressV2SyncOptions {
  deviceId: string;
  now?: () => string;
  desiredPhase?: ProgressV2Phase;
  isCurrent?: () => boolean;
}

export interface ProgressV2SyncResult {
  status: "disabled" | "synced";
  phase: ProgressV2Phase;
  pulledRecordCount: number;
  pushedRecordCount: number;
  imported: LocalDataImportResult;
  legacy: { status: "skipped_sealed" | "missing" | "unchanged" | "imported" };
}

interface PresentPayload {
  formatVersion: typeof PROGRESS_V2_FORMAT_VERSION;
  kind: ProgressV2RecordKind;
  entityKey: string;
  state: "present";
  value: unknown;
}

interface DeletedPayload {
  formatVersion: typeof PROGRESS_V2_FORMAT_VERSION;
  kind: ProgressV2RecordKind;
  entityKey: string;
  state: "deleted";
  deletedAt: string;
}

interface ManifestPayload {
  formatVersion: typeof PROGRESS_V2_FORMAT_VERSION;
  kind: "manifest";
  entityKey: "default";
  state: "present";
  value: {
    phase: ProgressV2Phase;
    minimumWriterVersion: string;
    migrationStartedAt: string;
    lastV1ChangeTag?: string;
    lastV1ImportAt?: string;
    sealedAt?: string;
  };
}

type ProgressV2Payload = PresentPayload | DeletedPayload | ManifestPayload;

const EMPTY_IMPORT_RESULT: LocalDataImportResult = {
  ratings: 0,
  attempts: 0,
  reviewQueue: 0,
  sprintSessions: 0,
  practiceRuns: 0
};

export class ProgressV2ChangeTokenExpiredError extends Error {
  constructor(message = "The CloudKit V2 change token expired") {
    super(message);
    this.name = "ProgressV2ChangeTokenExpiredError";
  }
}

export class ProgressV2SyncCancelledError extends Error {
  constructor() {
    super("iCloud progress sync was cancelled because its settings generation changed");
    this.name = "ProgressV2SyncCancelledError";
  }
}

export async function syncPracticeProgressV2(
  store: ProgressV2SyncStore,
  transport: ProgressV2Transport,
  options: ProgressV2SyncOptions
): Promise<ProgressV2SyncResult> {
  const initialState = store.progressV2.readState();
  if (!store.getSettings().sync.iCloudEnabled) {
    return {
      status: "disabled",
      phase: initialState.phase,
      pulledRecordCount: 0,
      pushedRecordCount: 0,
      imported: { ...EMPTY_IMPORT_RESULT },
      legacy: { status: "unchanged" }
    };
  }
  assertCurrent(options);
  await transport.ensureZone();
  assertCurrent(options);
  store.progressV2.writeState({ zoneInitialized: true });

  const now = options.now ?? (() => new Date().toISOString());
  let state = store.progressV2.readState();
  let pulledRecordCount = 0;
  const imported = { ...EMPTY_IMPORT_RESULT };
  let moreComing = true;
  let token = state.serverChangeToken;
  let rebuiltExpiredToken = false;
  while (moreComing) {
    let page: ProgressV2ChangePage;
    try {
      page = await transport.fetchZoneChanges(token);
    } catch (error) {
      if (
        error instanceof ProgressV2ChangeTokenExpiredError &&
        token !== undefined &&
        !rebuiltExpiredToken
      ) {
        rebuiltExpiredToken = true;
        token = undefined;
        store.progressV2.writeState({
          serverChangeToken: null,
          serverChangeTokenFingerprint: null
        });
        continue;
      }
      throw error;
    }
    assertCurrent(options);
    pulledRecordCount += page.records.length + page.deletedRecords.length;
    token = page.nextToken;
    moreComing = page.moreComing;
    const local = store.progressV2.exportData();
    const physical = planPhysicalRecordDeletions(local, page.deletedRecords, now());
    const physicallyDeletedNames = new Set(page.deletedRecords.map((item) => item.recordName));
    const decoded = incrementalImportForRecords(
      local,
      page.records.filter((record) => !physicallyDeletedNames.has(record.recordName)),
      {
        currentPhase: store.progressV2.readState().phase,
        skipRemotePreferences: initialState.serverChangeToken !== undefined &&
          store.progressV2.hasOutbox({ kind: "preferences", entityKey: "default" })
      }
    );
    const batchResult = store.applyProgressV2RemoteBatch(
      decoded.data,
      [...decoded.tombstones, ...physical.tombstones],
      {
        ...decoded.statePatch,
        serverChangeToken: token,
        serverChangeTokenFingerprint: fingerprintOpaqueToken(token),
        lastPullAt: now()
      },
      [...physical.restage, ...decoded.restage]
    );
    addImportResult(imported, batchResult);
  }

  state = store.progressV2.readState();
  const desiredPhase = state.phase === "sealed"
    ? "sealed"
    : options.desiredPhase ?? state.phase;
  if (desiredPhase !== state.phase) {
    const phaseChangedAt = now();
    store.progressV2.commitStateAndStage(
      {
        phase: desiredPhase,
        ...(desiredPhase === "sealed" ? { sealedAt: phaseChangedAt } : {})
      },
      [{ kind: "manifest", entityKey: "default" }],
      phaseChangedAt
    );
    state = store.progressV2.readState();
  }

  let legacy: ProgressV2SyncResult["legacy"];
  if (state.phase === "sealed") {
    legacy = { status: "skipped_sealed" };
  } else {
    const metadata = await transport.fetchLegacyMetadata();
    assertCurrent(options);
    store.progressV2.writeState({
      lastV1CheckAt: now(),
      lastV1CheckStatus: metadata.status
    });
    if (metadata.status === "missing") {
      legacy = { status: "missing" };
    } else if (metadata.changeTag === state.lastV1ChangeTag) {
      legacy = { status: "unchanged" };
    } else {
      const rawSnapshot = await transport.fetchLegacySnapshot(metadata.changeTag);
      assertCurrent(options);
      const snapshot = normalizeLegacyProgressSyncSnapshot(rawSnapshot);
      if (!snapshot) {
        throw new Error("Progress V1 bridge snapshot is invalid");
      }
      addImportResult(imported, store.importLocalData(
        filterLegacyDataAgainstTombstones(
          snapshot.data,
          store.progressV2.listTombstones()
        )
      ));
      store.progressV2.writeState({
        pendingV1ChangeTag: metadata.changeTag,
        lastV1ImportAt: now()
      });
      legacy = { status: "imported" };
    }
  }

  let pushedRecordCount = await flushProgressV2Outbox(store.progressV2, transport, options, now);
  state = store.progressV2.readState();
  if (state.pendingV1ChangeTag !== undefined && store.progressV2.listOutbox(1).length === 0) {
    store.progressV2.commitStateAndStage(
      {
        lastV1ChangeTag: state.pendingV1ChangeTag,
        pendingV1ChangeTag: null
      },
      [{ kind: "manifest", entityKey: "default" }],
      now()
    );
    pushedRecordCount += await flushProgressV2Outbox(store.progressV2, transport, options, now);
  }

  return {
    status: "synced",
    phase: store.progressV2.readState().phase,
    pulledRecordCount,
    pushedRecordCount,
    imported,
    legacy
  };
}

function filterLegacyDataAgainstTombstones(
  data: LocalDataImport,
  tombstones: readonly ProgressV2Tombstone[]
): LocalDataImport {
  const deleted = new Set(tombstones.map(identityMapKey));
  const deletedSessionIds = new Set(
    tombstones
      .filter((item) => item.kind === "sprint_session")
      .map((item) => item.entityKey)
  );
  return {
    ...data,
    attempts: data.attempts.filter((attempt) =>
      !deleted.has(identityMapKey({ kind: "attempt", entityKey: attempt.id })) &&
      !deletedSessionIds.has(attempt.sessionId)
    ),
    sprintSessions: data.sprintSessions.filter((session) =>
      !deleted.has(identityMapKey({ kind: "sprint_session", entityKey: session.id }))
    ),
    practiceRuns: (data.practiceRuns ?? []).filter((run) =>
      !deleted.has(identityMapKey({ kind: "practice_run", entityKey: run.id }))
    ),
    reviewQueue: data.reviewQueue.filter((review) =>
      !deleted.has(identityMapKey({
        kind: "review_schedule",
        entityKey: reviewEntityKey(review.puzzleId, review.mode, review.ratingKey)
      }))
    ),
    reviewRemovals: (data.reviewRemovals ?? []).filter((removal) =>
      !deleted.has(identityMapKey({
        kind: "review_schedule",
        entityKey: reviewEntityKey(removal.puzzleId, removal.mode, removal.ratingKey)
      }))
    )
  };
}

async function flushProgressV2Outbox(
  persistence: ProgressV2Persistence,
  transport: ProgressV2Transport,
  options: ProgressV2SyncOptions,
  now: () => string
): Promise<number> {
  let pushed = 0;
  while (true) {
    const outbox = persistence.listOutbox();
    if (outbox.length === 0) {
      return pushed;
    }
    const records = encodeOutbox(persistence, outbox, persistence.readState());
    const modified = await transport.modifyRecords({ saving: records, deleting: [] });
    assertCurrent(options);
    const confirmed = new Set(modified.savedRecordNames);
    const acknowledged = outbox.filter((entry) => confirmed.has(progressV2RecordName(entry)));
    if (acknowledged.length > 0) {
      persistence.acknowledgeOutbox(acknowledged, now());
      pushed += acknowledged.length;
    }
    if (modified.errors.length > 0 || acknowledged.length !== outbox.length) {
      throw new Error("CloudKit V2 only partially saved the progress outbox");
    }
  }
}

function incrementalImportForRecords(
  local: ReturnType<ProgressV2Persistence["exportData"]>,
  records: readonly ProgressV2Record[],
  options: { currentPhase: ProgressV2Phase; skipRemotePreferences: boolean }
): {
  data: LocalDataImport;
  tombstones: ProgressV2Tombstone[];
  restage: ProgressV2RecordIdentity[];
  statePatch: {
    phase?: ProgressV2Phase;
    seededAt?: string;
    lastV1ChangeTag?: string;
    lastV1ImportAt?: string;
    sealedAt?: string;
  };
} {
  const data: LocalDataImport = {
    schemaVersion: 1,
    settings: local.settings,
    ratings: [],
    attempts: [],
    reviewQueue: [],
    reviewRemovals: [],
    sprintSessions: [],
    practiceRuns: []
  };
  const statePatch: {
    phase?: ProgressV2Phase;
    seededAt?: string;
    lastV1ChangeTag?: string;
    lastV1ImportAt?: string;
    sealedAt?: string;
  } = {};
  const tombstones: ProgressV2Tombstone[] = [];
  const restage: ProgressV2RecordIdentity[] = [];
  for (const record of records) {
    const payload = decodeProgressV2Record(record);
    if (payload.state === "deleted") {
      tombstones.push({
        kind: payload.kind,
        entityKey: payload.entityKey,
        deletedAt: payload.deletedAt
      });
      continue;
    }
    if (payload.kind === "manifest") {
      if (!isObject(payload.value) ||
          (payload.value.phase !== "bridging" && payload.value.phase !== "sealed") ||
          typeof payload.value.minimumWriterVersion !== "string") {
        throw new Error("Progress V2 manifest phase is invalid");
      }
      if (options.currentPhase === "sealed" || payload.value.phase === "sealed") {
        statePatch.phase = "sealed";
        if (options.currentPhase === "sealed" && payload.value.phase === "bridging") {
          restage.push({ kind: "manifest", entityKey: "default" });
        }
      } else if (statePatch.phase !== "sealed") {
        statePatch.phase = payload.value.phase;
      }
      if (typeof payload.value.migrationStartedAt !== "string") {
        throw new Error("Progress V2 manifest migration timestamp is invalid");
      }
      statePatch.seededAt = payload.value.migrationStartedAt;
      if (typeof payload.value.lastV1ChangeTag === "string") {
        statePatch.lastV1ChangeTag = payload.value.lastV1ChangeTag;
      }
      if (typeof payload.value.lastV1ImportAt === "string") {
        statePatch.lastV1ImportAt = payload.value.lastV1ImportAt;
      }
      if (typeof payload.value.sealedAt === "string") {
        statePatch.sealedAt = payload.value.sealedAt;
      }
      continue;
    }
    switch (payload.kind) {
      case "preferences": {
        if (options.skipRemotePreferences) break;
        if (!isObject(payload.value) || !isObject(payload.value.notifications) || !isObject(payload.value.moveFeedback)) {
          throw new Error("Progress V2 preferences payload is invalid");
        }
        data.settings = {
          ...data.settings,
          notifications: payload.value.notifications as PracticeSettings["notifications"],
          moveFeedback: payload.value.moveFeedback as PracticeSettings["moveFeedback"]
        };
        break;
      }
      case "rating":
        data.ratings.push(payload.value as RatingRecord);
        break;
      case "attempt":
        data.attempts.push(payload.value as AttemptHistoryRow);
        break;
      case "sprint_session":
        data.sprintSessions.push(payload.value as ExportedSprintSession);
        break;
      case "practice_run":
        data.practiceRuns?.push(payload.value as PracticeRunRecord);
        break;
      case "review_schedule": {
        if (!isObject(payload.value) || (payload.value.kind !== "scheduled" && payload.value.kind !== "removed")) {
          throw new Error("Progress V2 review schedule payload is invalid");
        }
        if (payload.value.kind === "scheduled") {
          data.reviewQueue.push(payload.value.review as ExportedReviewQueueState);
        } else {
          data.reviewRemovals?.push(payload.value.removal as ReviewScheduleRemoval);
        }
        break;
      }
    }
  }
  data.ratings.sort((left, right) => left.key.localeCompare(right.key) || left.generation - right.generation);
  data.sprintSessions.sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.id.localeCompare(right.id));
  data.attempts.sort((left, right) => left.completedAt.localeCompare(right.completedAt) || left.id.localeCompare(right.id));
  if (!isCanonicalLocalDataExport({
    ...data,
    practiceRuns: data.practiceRuns ?? []
  })) {
    throw new Error("Progress V2 record batch contains invalid domain data");
  }
  return { data, tombstones, restage, statePatch };
}

function planPhysicalRecordDeletions(
  local: ReturnType<ProgressV2Persistence["exportData"]>,
  deletedRecords: readonly ProgressV2DeletedRecord[],
  deletedAt: string
): { tombstones: ProgressV2Tombstone[]; restage: ProgressV2RecordIdentity[] } {
  const tombstones: ProgressV2Tombstone[] = [];
  const restage: ProgressV2RecordIdentity[] = [];
  const localRatings = new Set(
    local.ratings.map((rating) => ratingEntityKey(rating.key, rating.generation))
  );
  for (const deletedRecord of deletedRecords) {
    const identity = parseProgressV2RecordName(deletedRecord.recordName);
    if (!identity) {
      throw new Error(`CloudKit deleted an invalid Progress V2 record ${deletedRecord.recordName}`);
    }
    switch (identity.kind) {
      case "attempt":
      case "practice_run":
      case "review_schedule":
      case "sprint_session":
        tombstones.push({ ...identity, deletedAt });
        break;
      case "manifest":
      case "preferences":
        restage.push(identity);
        break;
      case "rating":
        if (localRatings.has(identity.entityKey)) restage.push(identity);
        break;
    }
  }
  return { tombstones, restage };
}

function addImportResult(target: LocalDataImportResult, incoming: LocalDataImportResult): void {
  target.ratings += incoming.ratings;
  target.attempts += incoming.attempts;
  target.reviewQueue += incoming.reviewQueue;
  target.sprintSessions += incoming.sprintSessions;
  target.practiceRuns += incoming.practiceRuns;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function progressV2RecordName(identity: ProgressV2RecordIdentity): string {
  return `v2|${identity.kind}|${encodeURIComponent(identity.entityKey)}`;
}

export function parseProgressV2RecordName(recordName: string): ProgressV2RecordIdentity | undefined {
  const match = /^v2\|([^|]+)\|(.*)$/.exec(recordName);
  if (!match || !isProgressV2RecordKind(match[1])) {
    return undefined;
  }
  try {
    return { kind: match[1], entityKey: decodeURIComponent(match[2] ?? "") };
  } catch {
    return undefined;
  }
}

export function decodeProgressV2Record(record: ProgressV2Record): ProgressV2Payload {
  if (record.schemaVersion !== PROGRESS_V2_FORMAT_VERSION || record.kind.length === 0) {
    throw new Error(`Unsupported Progress V2 record ${record.recordName}`);
  }
  const parsed = JSON.parse(record.payload) as unknown;
  if (!isProgressV2Payload(parsed) || parsed.kind !== record.kind) {
    throw new Error(`Invalid Progress V2 payload for ${record.recordName}`);
  }
  const identity = parseProgressV2RecordName(record.recordName);
  if (!identity || identity.kind !== parsed.kind || identity.entityKey !== parsed.entityKey) {
    throw new Error(`Progress V2 record identity mismatch for ${record.recordName}`);
  }
  return parsed;
}

function encodeOutbox(
  persistence: ProgressV2Persistence,
  outbox: readonly ProgressV2OutboxEntry[],
  state: ProgressV2LocalState
): ProgressV2Record[] {
  const data = persistence.exportData();
  const values = new Map<string, unknown>();
  values.set(identityMapKey({ kind: "preferences", entityKey: "default" }), {
    notifications: data.settings.notifications,
    moveFeedback: data.settings.moveFeedback
  });
  for (const rating of data.ratings) {
    values.set(identityMapKey({ kind: "rating", entityKey: ratingEntityKey(rating.key, rating.generation) }), rating);
  }
  for (const attempt of data.attempts) {
    values.set(identityMapKey({ kind: "attempt", entityKey: attempt.id }), attempt);
  }
  for (const session of data.sprintSessions) {
    values.set(identityMapKey({ kind: "sprint_session", entityKey: session.id }), session);
  }
  for (const run of data.practiceRuns) {
    values.set(identityMapKey({ kind: "practice_run", entityKey: run.id }), run);
  }
  for (const review of data.reviewQueue) {
    values.set(identityMapKey({
      kind: "review_schedule",
      entityKey: reviewEntityKey(review.puzzleId, review.mode, review.ratingKey)
    }), { kind: "scheduled", review });
  }
  for (const removal of data.reviewRemovals ?? []) {
    values.set(identityMapKey({
      kind: "review_schedule",
      entityKey: reviewEntityKey(removal.puzzleId, removal.mode, removal.ratingKey)
    }), { kind: "removed", removal });
  }
  const tombstones = new Map(
    persistence.listTombstones().map((item) => [identityMapKey(item), item])
  );

  return outbox.map((entry) => {
    let payload: ProgressV2Payload;
    if (entry.kind === "manifest") {
      if (state.seededAt === undefined) {
        throw new Error("Progress V2 migration start timestamp is unavailable");
      }
      payload = {
        formatVersion: PROGRESS_V2_FORMAT_VERSION,
        kind: "manifest",
        entityKey: "default",
        state: "present",
        value: {
          phase: state.phase,
          minimumWriterVersion: PROGRESS_V2_WRITER_VERSION,
          migrationStartedAt: state.seededAt,
          ...(state.lastV1ChangeTag === undefined ? {} : { lastV1ChangeTag: state.lastV1ChangeTag }),
          ...(state.lastV1ImportAt === undefined ? {} : { lastV1ImportAt: state.lastV1ImportAt }),
          ...(state.sealedAt === undefined ? {} : { sealedAt: state.sealedAt })
        }
      };
    } else {
      const tombstone = tombstones.get(identityMapKey(entry));
      if (tombstone) {
        payload = deletedPayload(tombstone);
      } else {
        const value = values.get(identityMapKey(entry));
        if (value === undefined) {
          throw new Error(`Progress V2 outbox points to missing ${entry.kind} ${entry.entityKey}`);
        }
        payload = {
          formatVersion: PROGRESS_V2_FORMAT_VERSION,
          kind: entry.kind,
          entityKey: entry.entityKey,
          state: "present",
          value
        };
      }
    }
    return {
      recordName: progressV2RecordName(entry),
      kind: entry.kind,
      schemaVersion: PROGRESS_V2_FORMAT_VERSION,
      payload: canonicalJson(payload)
    };
  });
}

function deletedPayload(tombstone: ProgressV2Tombstone): DeletedPayload {
  return {
    formatVersion: PROGRESS_V2_FORMAT_VERSION,
    kind: tombstone.kind,
    entityKey: tombstone.entityKey,
    state: "deleted",
    deletedAt: tombstone.deletedAt
  };
}

function assertCurrent(options: ProgressV2SyncOptions): void {
  if (options.isCurrent && !options.isCurrent()) {
    throw new ProgressV2SyncCancelledError();
  }
}

function isProgressV2Payload(value: unknown): value is ProgressV2Payload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<ProgressV2Payload>;
  return candidate.formatVersion === PROGRESS_V2_FORMAT_VERSION &&
    isProgressV2RecordKind(candidate.kind) &&
    typeof candidate.entityKey === "string" &&
    (candidate.state === "present" ||
      (candidate.state === "deleted" && typeof (candidate as Partial<DeletedPayload>).deletedAt === "string"));
}

function isProgressV2RecordKind(value: unknown): value is ProgressV2RecordKind {
  return value === "attempt" ||
    value === "manifest" ||
    value === "practice_run" ||
    value === "preferences" ||
    value === "rating" ||
    value === "review_schedule" ||
    value === "sprint_session";
}

function identityMapKey(identity: ProgressV2RecordIdentity): string {
  return `${identity.kind}\u0000${identity.entityKey}`;
}

export function ratingEntityKey(key: string, generation: number): string {
  return `${key}\u001f${generation}`;
}

export function reviewEntityKey(puzzleId: string, mode: string, ratingKey: string): string {
  return `${puzzleId}\u001f${mode}\u001f${ratingKey}`;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalValue(child)])
  );
}

export function fingerprintOpaqueToken(token: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const codePoint of token) {
    hash ^= BigInt(codePoint.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export class FakeProgressV2Transport implements ProgressV2Transport {
  legacyMetadataFetchCount = 0;
  legacySnapshotFetchCount = 0;
  legacyWriteCount = 0;
  zoneChangeFetchCount = 0;
  zoneInitializationCount = 0;
  readonly modifyBatches: Array<{
    saving: ProgressV2Record[];
    deleting: string[];
  }> = [];
  private readonly zoneRecords = new Map<string, ProgressV2Record>();
  private readonly changes: Array<{ token: number; record?: ProgressV2Record; deletedRecordName?: string }> = [];
  private legacy: "missing" | { changeTag: string; snapshot: unknown };
  private disorderNextFetch = false;
  private expireNextFetch = false;
  private readonly failNextKinds = new Set<ProgressV2RecordKind>();

  constructor(options: {
    legacy?: "missing" | { changeTag: string; snapshot: unknown };
    records?: readonly ProgressV2Record[];
  } = {}) {
    this.legacy = options.legacy ?? "missing";
    for (const record of options.records ?? []) {
      this.saveRecord(record);
    }
  }

  get records(): ProgressV2Record[] {
    return [...this.zoneRecords.values()].sort((left, right) => left.recordName.localeCompare(right.recordName));
  }

  setLegacy(legacy: "missing" | { changeTag: string; snapshot: unknown }): void {
    this.legacy = legacy;
  }

  duplicateAndReverseNextFetch(): void {
    this.disorderNextFetch = true;
  }

  expireNextTokenFetch(): void {
    this.expireNextFetch = true;
  }

  failNextSaveForKind(kind: ProgressV2RecordKind): void {
    this.failNextKinds.add(kind);
  }

  physicallyDeleteRecord(recordName: string): void {
    this.zoneRecords.delete(recordName);
    this.changes.push({ token: this.changes.length + 1, deletedRecordName: recordName });
  }

  async ensureZone(): Promise<void> {
    this.zoneInitializationCount += 1;
  }

  async fetchZoneChanges(previousToken?: string): Promise<ProgressV2ChangePage> {
    this.zoneChangeFetchCount += 1;
    if (this.expireNextFetch && previousToken !== undefined) {
      this.expireNextFetch = false;
      throw new ProgressV2ChangeTokenExpiredError();
    }
    const previous = previousToken === undefined ? 0 : Number(previousToken);
    if (!Number.isInteger(previous) || previous < 0 || previous > this.changes.length) {
      throw new ProgressV2ChangeTokenExpiredError();
    }
    let changes = this.changes.slice(previous);
    if (this.disorderNextFetch) {
      this.disorderNextFetch = false;
      changes = [...changes].reverse().flatMap((change) => [change, change]);
    }
    return {
      records: changes.flatMap((change) => change.record ? [cloneJson(change.record)] : []),
      deletedRecords: changes.flatMap((change) => change.deletedRecordName ? [{ recordName: change.deletedRecordName }] : []),
      nextToken: String(this.changes.length),
      moreComing: false
    };
  }

  async modifyRecords(input: {
    saving: readonly ProgressV2Record[];
    deleting: readonly string[];
  }): Promise<ProgressV2ModifyResult> {
    this.modifyBatches.push({
      saving: cloneJson([...input.saving]),
      deleting: [...input.deleting]
    });
    const savedRecordNames: string[] = [];
    const errors: ProgressV2ModifyResult["errors"] = [];
    for (const record of input.saving) {
      if (this.failNextKinds.delete(record.kind)) {
        errors.push({
          recordName: record.recordName,
          code: "fake_partial_failure",
          message: `Fake CloudKit rejected one ${record.kind} record`
        });
      } else {
        this.saveRecord(record);
        savedRecordNames.push(record.recordName);
      }
    }
    for (const recordName of input.deleting) {
      this.zoneRecords.delete(recordName);
      this.changes.push({ token: this.changes.length + 1, deletedRecordName: recordName });
    }
    return {
      savedRecordNames,
      deletedRecordNames: [...input.deleting],
      errors
    };
  }

  async fetchLegacyMetadata(): Promise<ProgressV1MetadataResult> {
    this.legacyMetadataFetchCount += 1;
    return this.legacy === "missing"
      ? { status: "missing" }
      : { status: "available", changeTag: this.legacy.changeTag };
  }

  async fetchLegacySnapshot(changeTag: string): Promise<unknown> {
    this.legacySnapshotFetchCount += 1;
    if (this.legacy === "missing" || this.legacy.changeTag !== changeTag) {
      throw new Error("The requested V1 snapshot is unavailable");
    }
    return cloneJson(this.legacy.snapshot);
  }

  private saveRecord(record: ProgressV2Record): void {
    const cloned = cloneJson(record);
    this.zoneRecords.set(record.recordName, cloned);
    this.changes.push({ token: this.changes.length + 1, record: cloned });
  }
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
