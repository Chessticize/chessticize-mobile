import { defaultSprintConfig, normalizeThemeSelection } from "./sprint-config.ts";
import type { PracticeRunRecord, SprintConfig } from "./types.ts";

export const STANDARD_PRACTICE_RUN_ID = "standard";
export const ARROW_DUEL_PRACTICE_RUN_ID = "arrow-duel";
export const PRACTICE_RUN_NAME_MAX_LENGTH = 40;
export const PRACTICE_RUN_RATING_KEY_PREFIX = "run:";
const PRACTICE_RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const BUILT_IN_UPDATED_AT = "1970-01-01T00:00:00.000Z";
const RESERVED_RUN_NAMES = new Set(["standard", "arrow duel"]);

export type PracticeRunNameErrorCode = "required" | "too_long" | "duplicate";

export class PracticeRunNameError extends Error {
  readonly code: PracticeRunNameErrorCode;

  constructor(code: PracticeRunNameErrorCode) {
    super(
      code === "required"
        ? "Enter a name for this run."
        : code === "too_long"
          ? `Run names can be at most ${PRACTICE_RUN_NAME_MAX_LENGTH} characters.`
          : "That name is already in use. Choose a unique name."
    );
    this.name = "PracticeRunNameError";
    this.code = code;
  }
}

export function defaultPracticeRuns(updatedAt = BUILT_IN_UPDATED_AT): PracticeRunRecord[] {
  return [
    builtInPracticeRun(STANDARD_PRACTICE_RUN_ID, "standard", "Standard", 0, updatedAt),
    builtInPracticeRun(ARROW_DUEL_PRACTICE_RUN_ID, "arrow_duel", "Arrow Duel", 1, updatedAt)
  ];
}

export function createCustomPracticeRun(input: {
  id: string;
  name: string;
  mode: "custom" | "arrow_duel";
  durationSeconds: number;
  perPuzzleSeconds: number;
  targetCorrect: number;
  maxMistakes: number;
  themes?: readonly string[];
  homeOrder: number;
  updatedAt: string;
  existingRuns: readonly PracticeRunRecord[];
}): PracticeRunRecord {
  const name = validatePracticeRunName(input.name, input.existingRuns);
  if (!PRACTICE_RUN_ID_PATTERN.test(input.id)) {
    throw new Error("Practice Run ID must be an opaque alphanumeric identifier");
  }
  if (input.existingRuns.some((run) => run.id === input.id)) {
    throw new Error(`Practice Run ID ${input.id} is already in use`);
  }
  assertPositiveInteger(input.durationSeconds, "durationSeconds");
  assertPositiveInteger(input.perPuzzleSeconds, "perPuzzleSeconds");
  assertPositiveInteger(input.targetCorrect, "targetCorrect");
  assertPositiveInteger(input.maxMistakes, "maxMistakes");
  if (!Number.isInteger(input.homeOrder) || input.homeOrder < 0) {
    throw new Error("homeOrder must be a non-negative integer");
  }
  return {
    id: input.id,
    kind: "custom",
    name,
    mode: input.mode,
    ratingKey: `${PRACTICE_RUN_RATING_KEY_PREFIX}${input.id}`,
    durationSeconds: input.durationSeconds,
    perPuzzleSeconds: input.perPuzzleSeconds,
    targetCorrect: input.targetCorrect,
    maxMistakes: input.maxMistakes,
    ...(normalizedRunThemes(input.themes).length === 0
      ? {}
      : { themes: normalizedRunThemes(input.themes) }),
    homeOrder: input.homeOrder,
    archived: false,
    updatedAt: input.updatedAt
  };
}

export function validatePracticeRunName(
  candidate: string,
  existingRuns: readonly PracticeRunRecord[],
  currentRunId?: string
): string {
  const name = candidate.trim();
  if (!name) {
    throw new PracticeRunNameError("required");
  }
  if (name.length > PRACTICE_RUN_NAME_MAX_LENGTH) {
    throw new PracticeRunNameError("too_long");
  }
  const normalized = normalizePracticeRunName(name);
  const duplicate = RESERVED_RUN_NAMES.has(normalized)
    || existingRuns.some(
      (run) => run.id !== currentRunId && normalizePracticeRunName(run.name) === normalized
    );
  if (duplicate) {
    throw new PracticeRunNameError("duplicate");
  }
  return name;
}

export function practiceRunSprintConfig(run: PracticeRunRecord): SprintConfig {
  return {
    mode: run.mode,
    durationSeconds: run.durationSeconds,
    perPuzzleSeconds: run.perPuzzleSeconds,
    targetCorrect: run.targetCorrect,
    maxMistakes: run.maxMistakes,
    ratingKey: run.ratingKey,
    ...(run.themes === undefined ? {} : { themes: [...run.themes] })
  };
}

export function orderPracticeRuns(runs: readonly PracticeRunRecord[]): PracticeRunRecord[] {
  return [...runs].sort(
    (left, right) => Number(left.archived) - Number(right.archived)
      || left.homeOrder - right.homeOrder
      || left.id.localeCompare(right.id)
  );
}

export function reorderPracticeRuns(
  runs: readonly PracticeRunRecord[],
  runId: string,
  targetRunId: string,
  updatedAt: string
): PracticeRunRecord[] {
  const active = orderPracticeRuns(runs).filter((run) => !run.archived);
  const from = active.findIndex((run) => run.id === runId);
  const to = active.findIndex((run) => run.id === targetRunId);
  if (from < 0 || to < 0 || from === to) {
    return runs.map(clonePracticeRun);
  }
  const reordered = [...active];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved!);
  const positions = new Map(reordered.map((run, index) => [run.id, index]));
  return runs.map((run) => {
    const homeOrder = positions.get(run.id);
    if (homeOrder === undefined || homeOrder === run.homeOrder) {
      return clonePracticeRun(run);
    }
    return { ...clonePracticeRun(run), homeOrder, updatedAt };
  });
}

export function archivePracticeRun(
  runs: readonly PracticeRunRecord[],
  runId: string,
  updatedAt: string
): PracticeRunRecord[] {
  return runs.map((run) => run.id === runId && !run.archived
    ? { ...clonePracticeRun(run), archived: true, updatedAt }
    : clonePracticeRun(run));
}

export function restorePracticeRun(
  runs: readonly PracticeRunRecord[],
  runId: string,
  updatedAt: string
): PracticeRunRecord[] {
  const nextOrder = runs.reduce(
    (maximum, run) => run.archived ? maximum : Math.max(maximum, run.homeOrder + 1),
    0
  );
  return runs.map((run) => run.id === runId && run.archived
    ? { ...clonePracticeRun(run), archived: false, homeOrder: nextOrder, updatedAt }
    : clonePracticeRun(run));
}

export function mergePracticeRunCatalogs(
  localRuns: readonly PracticeRunRecord[],
  remoteRuns: readonly PracticeRunRecord[]
): PracticeRunRecord[] {
  const merged = new Map<string, PracticeRunRecord>();
  for (const run of [...defaultPracticeRuns(), ...localRuns, ...remoteRuns]) {
    const normalized = canonicalizeBuiltInPracticeRun(run);
    const previous = merged.get(normalized.id);
    merged.set(normalized.id, previous ? preferredPracticeRun(previous, normalized) : normalized);
  }
  return uniquifyPracticeRunNames(orderPracticeRuns([...merged.values()]));
}

export function clonePracticeRun(run: PracticeRunRecord): PracticeRunRecord {
  return { ...run, ...(run.themes === undefined ? {} : { themes: [...run.themes] }) };
}

export function isPracticeRunRatingKey(value: string): boolean {
  return value.startsWith(PRACTICE_RUN_RATING_KEY_PREFIX)
    && PRACTICE_RUN_ID_PATTERN.test(value.slice(PRACTICE_RUN_RATING_KEY_PREFIX.length));
}

function builtInPracticeRun(
  id: typeof STANDARD_PRACTICE_RUN_ID | typeof ARROW_DUEL_PRACTICE_RUN_ID,
  mode: "standard" | "arrow_duel",
  name: "Standard" | "Arrow Duel",
  homeOrder: number,
  updatedAt: string
): PracticeRunRecord {
  const config = defaultSprintConfig(mode);
  return {
    id,
    kind: mode,
    name,
    mode,
    ratingKey: config.ratingKey,
    durationSeconds: config.durationSeconds,
    perPuzzleSeconds: config.perPuzzleSeconds,
    targetCorrect: config.targetCorrect,
    maxMistakes: config.maxMistakes,
    ...(config.themes === undefined ? {} : { themes: [...config.themes] }),
    homeOrder,
    archived: false,
    updatedAt
  };
}

function canonicalizeBuiltInPracticeRun(run: PracticeRunRecord): PracticeRunRecord {
  if (run.id !== STANDARD_PRACTICE_RUN_ID && run.id !== ARROW_DUEL_PRACTICE_RUN_ID) {
    return clonePracticeRun(run);
  }
  const canonical = defaultPracticeRuns(run.updatedAt).find((candidate) => candidate.id === run.id)!;
  return {
    ...canonical,
    archived: run.archived,
    homeOrder: run.homeOrder,
    updatedAt: run.updatedAt
  };
}

function preferredPracticeRun(left: PracticeRunRecord, right: PracticeRunRecord): PracticeRunRecord {
  const timestampComparison = right.updatedAt.localeCompare(left.updatedAt);
  if (timestampComparison !== 0) {
    return clonePracticeRun(timestampComparison > 0 ? right : left);
  }
  return clonePracticeRun(stablePracticeRunValue(right) > stablePracticeRunValue(left) ? right : left);
}

function stablePracticeRunValue(run: PracticeRunRecord): string {
  return JSON.stringify({
    ...run,
    themes: normalizeThemeSelection(run.themes)
  });
}

function uniquifyPracticeRunNames(runs: PracticeRunRecord[]): PracticeRunRecord[] {
  const used = new Set<string>();
  return runs.map((run) => {
    if (run.id === STANDARD_PRACTICE_RUN_ID || run.id === ARROW_DUEL_PRACTICE_RUN_ID) {
      used.add(normalizePracticeRunName(run.name));
      return clonePracticeRun(run);
    }
    let name = run.name.trim() || "Custom Run";
    let suffix = 2;
    while (used.has(normalizePracticeRunName(name))) {
      const suffixText = ` (${suffix})`;
      name = `${run.name.trim().slice(0, PRACTICE_RUN_NAME_MAX_LENGTH - suffixText.length)}${suffixText}`;
      suffix += 1;
    }
    used.add(normalizePracticeRunName(name));
    return { ...clonePracticeRun(run), name };
  });
}

function normalizePracticeRunName(name: string): string {
  return name.trim().toLocaleLowerCase("en-US");
}

function normalizedRunThemes(themes?: readonly string[]): string[] {
  return normalizeThemeSelection(themes).filter((theme) => theme !== "mixed");
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
}
