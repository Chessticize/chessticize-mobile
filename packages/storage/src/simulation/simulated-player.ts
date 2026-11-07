// Deterministic simulated player for Tactical Profile and Focused Run
// behavior. The player acts only through PracticeService's public commands,
// so every attempt, Rating update, puzzle selection and Tactical Profile
// refresh follows the same paths as a real user. Synthetic histories are
// development diagnostics; they are never calibration evidence.
import {
  buildAccessibleMoveOptions,
  curatedPuzzleThemes,
  isPuzzleMoveAccepted,
  type Puzzle,
  type SprintState,
  type TacticalProfileModelSignal,
  type TacticalProfileTaskFamily
} from "../../../core/src/index.ts";
import type { PracticeService } from "../practice-service.ts";
import type { TacticalProfileSnapshot } from "../tactical-profile-service.ts";

const GLICKO_LOGIT_SCALE = 400 / Math.LN10;
const DAY_MS = 24 * 60 * 60 * 1_000;
const MINUTE_MS = 60 * 1_000;
const ARROW_DUEL_REPLY_HANDOFF_MS = 1_200;

/** Ground truth for one simulated player. */
export type SimulatedPlayerProfile = {
  /** Latent Rating at which a neutral puzzle is solved at `baseSolveRate`. */
  skillRating: number;
  /** Per-puzzle solve probability for a neutral puzzle at `skillRating`. */
  baseSolveRate: number;
  /** Additive logit offsets per curated theme (negative is weaker). */
  themeSolveLogitOffsets?: Readonly<Record<string, number>>;
  /** Median seconds for one neutral decision at `skillRating`. */
  baseDecisionSeconds: number;
  /** Multiplicative completed-time factors per curated theme (>1 is slower). */
  themeSpeedMultipliers?: Readonly<Record<string, number>>;
  /** Standard deviation of the log-normal time noise. */
  timeNoiseSigma: number;
  /**
   * Planted theme effects fade linearly to neutral between these completed
   * mixed-Run indexes (zero-based). Omit for a stable player.
   */
  improvement?: { startRun: number; endRun: number };
  /** Latent Rating gained after each completed mixed Run. */
  skillGainPerRun?: number;
};

export type SimulationClock = {
  nowMs(): number;
  now(): string;
  advanceTo(ms: number): void;
};

export function createSimulationClock(startMs: number): SimulationClock {
  if (!Number.isFinite(startMs)) {
    throw new Error("Simulation clock start must be finite");
  }
  let current = startMs;
  return {
    nowMs: () => current,
    now: () => new Date(current).toISOString(),
    advanceTo: (ms) => {
      if (!Number.isFinite(ms)) {
        throw new Error("Simulation clock target must be finite");
      }
      current = Math.max(current, ms);
    }
  };
}

/** Small seeded PRNG (sfc32 over an FNV-1a seed) with a normal sampler. */
export class SeededRandom {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: string | number) {
    const text = String(seed);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    this.a = hash >>> 0;
    this.b = (hash ^ 0x9e3779b9) >>> 0;
    this.c = (hash ^ 0x85ebca6b) >>> 0;
    this.d = (hash ^ 0xc2b2ae35) >>> 0;
    for (let index = 0; index < 12; index += 1) {
      this.next();
    }
  }

  next(): number {
    const t = (((this.a + this.b) >>> 0) + this.d) >>> 0;
    this.d = (this.d + 1) >>> 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) >>> 0;
    this.c = ((this.c << 21) | (this.c >>> 11)) >>> 0;
    this.c = (this.c + t) >>> 0;
    return t / 4294967296;
  }

  normal(): number {
    const u = Math.max(this.next(), Number.EPSILON);
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }
}

export class SimulatedPlayer {
  readonly profile: SimulatedPlayerProfile;
  private readonly random: SeededRandom;
  private completedMixedRuns = 0;

  constructor(profile: SimulatedPlayerProfile, seed: string | number) {
    assertValidProfile(profile);
    this.profile = profile;
    this.random = new SeededRandom(`player:${seed}`);
  }

  get mixedRunsCompleted(): number {
    return this.completedMixedRuns;
  }

  /** Called by the driver after each mixed (evidence-bearing) Run. */
  recordMixedRunCompleted(): void {
    this.completedMixedRuns += 1;
  }

  /** Fraction of each planted effect that is still active (1 = full). */
  plantedEffectStrength(): number {
    const improvement = this.profile.improvement;
    if (!improvement) {
      return 1;
    }
    if (this.completedMixedRuns <= improvement.startRun) {
      return 1;
    }
    if (this.completedMixedRuns >= improvement.endRun) {
      return 0;
    }
    return 1 - (this.completedMixedRuns - improvement.startRun) /
      Math.max(1, improvement.endRun - improvement.startRun);
  }

  currentSkillRating(): number {
    return this.profile.skillRating +
      (this.profile.skillGainPerRun ?? 0) * this.completedMixedRuns;
  }

  /** Probability of finding one correct decision in a line puzzle. */
  lineSolveProbability(puzzle: Pick<Puzzle, "rating" | "themes">): number {
    const strength = this.plantedEffectStrength();
    const offsets = this.profile.themeSolveLogitOffsets ?? {};
    const themeOffset = curatedPuzzleThemes(puzzle.themes).reduce(
      (sum, theme) => sum + (offsets[theme] ?? 0) * strength,
      0
    );
    return logistic(
      logit(this.profile.baseSolveRate) +
      (this.currentSkillRating() - puzzle.rating) / GLICKO_LOGIT_SCALE +
      themeOffset
    );
  }

  /** Arrow Duel is a two-choice task: an unsolved choice is a coin flip. */
  arrowDuelChoiceProbability(puzzle: Pick<Puzzle, "rating" | "themes">): number {
    const solve = this.lineSolveProbability(puzzle);
    return solve + (1 - solve) / 2;
  }

  /** Seconds for one decision, including the log-normal time noise. */
  decisionSeconds(puzzle: Pick<Puzzle, "rating" | "themes">): number {
    const strength = this.plantedEffectStrength();
    const multipliers = this.profile.themeSpeedMultipliers ?? {};
    const themeMultiplier = curatedPuzzleThemes(puzzle.themes).reduce(
      (product, theme) => product * (1 + ((multipliers[theme] ?? 1) - 1) * strength),
      1
    );
    const difficulty = Math.exp(
      0.35 * (puzzle.rating - this.currentSkillRating()) / GLICKO_LOGIT_SCALE
    );
    const noise = Math.exp(this.profile.timeNoiseSigma * this.random.normal());
    return Math.max(
      0.8,
      this.profile.baseDecisionSeconds * themeMultiplier * difficulty * noise
    );
  }

  succeeds(probability: number): boolean {
    return this.random.next() < probability;
  }

  pick<T>(values: readonly T[]): T | undefined {
    return values.length === 0 ? undefined : values[this.random.int(values.length)];
  }
}

export type SimulatedRunKind = "standard" | "arrow_duel";

export type SimulatedRunResult = {
  sessionId: string;
  mode: SprintState["config"]["mode"];
  focused: boolean;
  status: SprintState["status"];
  endReason: SprintState["endReason"];
  attemptCount: number;
  startedAt: string;
  completedAt: string;
  ratingBefore: number;
  ratingAfter: number | undefined;
};

/**
 * Plays an already-started Run to completion through PracticeService and
 * returns its terminal state. The clock ends at the Run's completion time.
 */
export function playActiveRun(input: {
  practice: PracticeService;
  player: SimulatedPlayer;
  clock: SimulationClock;
  /** Safety bound; a correct Run never needs this many submissions. */
  maxSubmissions?: number;
}): SimulatedRunResult {
  const { practice, player, clock } = input;
  const active = practice.getActiveSprint();
  if (!active || active.status !== "active") {
    throw new Error("Simulated player needs an active Run");
  }
  let state: SprintState = active;
  const sessionId = state.id;
  const startedAt = state.startedAt;
  const ratingBefore = state.ratingBefore;
  let attemptCount = 0;
  let submissions = 0;
  const maxSubmissions = input.maxSubmissions ?? 1_000;

  while (state.status === "active") {
    if (submissions >= maxSubmissions) {
      throw new Error(`Simulated Run ${sessionId} exceeded ${maxSubmissions} submissions`);
    }
    const current: SprintState["currentPuzzle"] = state.currentPuzzle;
    if (!current) {
      throw new Error(`Simulated Run ${sessionId} has no current puzzle`);
    }
    const puzzleStartedMs = Date.parse(state.currentPuzzleStartedAt ?? state.startedAt);
    clock.advanceTo(puzzleStartedMs);
    const step: PuzzleStep = current.kind === "arrow_duel"
      ? playArrowDuelPuzzle(practice, player, clock, state)
      : playLinePuzzle(practice, player, clock, state);
    submissions += step.submissions;
    attemptCount += step.attempts;
    state = step.state;
  }

  return {
    sessionId,
    mode: state.config.mode,
    focused: state.config.tacticalFocus !== undefined,
    status: state.status,
    endReason: state.endReason,
    attemptCount,
    startedAt,
    completedAt: state.completedAt ?? clock.now(),
    ratingBefore,
    ratingAfter: state.ratingAfter
  };
}

type PuzzleStep = { state: SprintState; attempts: number; submissions: number };

function playLinePuzzle(
  practice: PracticeService,
  player: SimulatedPlayer,
  clock: SimulationClock,
  initial: SprintState
): PuzzleStep {
  let state = initial;
  const puzzleIndex = state.currentPuzzleIndex;
  const puzzle = state.currentPuzzle?.puzzle;
  if (!puzzle) {
    throw new Error("Expected a line puzzle");
  }
  // The solve decision is per puzzle; a failed puzzle fails at one of its
  // user decisions, chosen uniformly.
  const decisions = Math.max(1, Math.floor(puzzle.solutionMoves.length / 2));
  const solved = player.succeeds(player.lineSolveProbability(puzzle));
  const failingDecision = solved ? -1 : player.pick(
    Array.from({ length: decisions }, (_, index) => index)
  ) ?? 0;
  let decision = 0;
  let submissions = 0;
  let elapsedMs = 0;
  const startedMs = clock.nowMs();
  while (
    state.status === "active" &&
    state.currentPuzzleIndex === puzzleIndex &&
    state.currentPuzzle?.kind === "line"
  ) {
    const line = state.currentPuzzle;
    const expected = line.puzzle.solutionMoves[line.cursor];
    if (!expected) {
      throw new Error(`Puzzle ${line.puzzle.id} has no expected move`);
    }
    const move = decision === failingDecision
      ? wrongLegalMove(player, line.currentFen, expected) ?? expected
      : expected;
    decision += 1;
    elapsedMs += Math.round(player.decisionSeconds(line.puzzle) * 1_000);
    clock.advanceTo(startedMs + elapsedMs);
    const result = practice.submitMove(move, clock.now());
    submissions += 1;
    state = result.state;
    if (result.attempt) {
      return { state, attempts: 1, submissions };
    }
  }
  return { state, attempts: 0, submissions };
}

function playArrowDuelPuzzle(
  practice: PracticeService,
  player: SimulatedPlayer,
  clock: SimulationClock,
  initial: SprintState
): PuzzleStep {
  const duel = initial.currentPuzzle;
  if (duel?.kind !== "arrow_duel") {
    throw new Error("Expected an Arrow Duel puzzle");
  }
  const startedMs = clock.nowMs();
  const chooseCorrect = player.succeeds(player.arrowDuelChoiceProbability(duel.puzzle));
  clock.advanceTo(startedMs + Math.round(player.decisionSeconds(duel.puzzle) * 1_000));
  const choice = practice.submitMove(
    chooseCorrect ? duel.correctMove : duel.wrongMove,
    clock.now()
  );
  if (choice.attempt || choice.state.status !== "active") {
    return { state: choice.state, attempts: choice.attempt ? 1 : 0, submissions: 1 };
  }
  const handoff = choice.state.currentPuzzle;
  if (handoff?.kind !== "arrow_duel" || handoff.phase !== "reply_handoff") {
    return { state: choice.state, attempts: 0, submissions: 1 };
  }
  clock.advanceTo(clock.nowMs() + ARROW_DUEL_REPLY_HANDOFF_MS);
  const replyState = practice.beginArrowDuelReply(clock.now());
  const reply = replyState.currentPuzzle;
  if (reply?.kind !== "arrow_duel") {
    throw new Error("Arrow Duel reply did not begin");
  }
  const expectedReply = reply.puzzle.solutionMoves[1];
  if (!expectedReply) {
    throw new Error(`Arrow Duel puzzle ${reply.puzzle.id} has no reply move`);
  }
  const replySolved = player.succeeds(player.lineSolveProbability(reply.puzzle));
  const replyMove = replySolved
    ? expectedReply
    : wrongLegalMove(player, reply.currentFen, expectedReply) ?? expectedReply;
  clock.advanceTo(
    clock.nowMs() + Math.round(player.decisionSeconds(reply.puzzle) * 1_000)
  );
  const result = practice.submitMove(replyMove, clock.now());
  return { state: result.state, attempts: result.attempt ? 1 : 0, submissions: 2 };
}

function wrongLegalMove(
  player: SimulatedPlayer,
  fen: string,
  expected: string
): string | undefined {
  const wrong = buildAccessibleMoveOptions(fen)
    .map((option) => option.uci)
    .filter((uci) => !isPuzzleMoveAccepted(fen, expected, uci));
  return player.pick(wrong);
}

export type SimulatedSignalSummary = Pick<
  TacticalProfileModelSignal,
  "id" | "taskFamily" | "theme" | "reason" | "status" | "solveConfidence" |
  "speedConfidence" | "expectedFailuresPer100" | "completedTimeMultiplier" |
  "distinctPuzzleCount" | "distinctSessionCount"
>;

export type SimulatedRunRecord = SimulatedRunResult & {
  /** Zero-based count of mixed Runs completed before this one. */
  mixedRunIndex: number;
  phase: TacticalProfileSnapshot["phase"] | "unavailable";
  signals: readonly SimulatedSignalSummary[];
};

export type SimulatedHistoryPlan = {
  /** Mixed (evidence-bearing) Runs to play. */
  runs: number;
  /** Fraction of mixed Runs played as Arrow Duel. */
  arrowDuelShare?: number;
  runsPerDay?: number;
  /** Starts a Focused Run for this family after a Run that leaves a recommendation. */
  focusedRunFamily?: TacticalProfileTaskFamily;
  /** Read the Tactical Profile after every Run (the app's Home read). Defaults to true. */
  observeEveryRun?: boolean;
  /** Return true to stop after the given Run. */
  stopWhen?: (record: SimulatedRunRecord) => boolean;
};

/**
 * Plays a mixed history through PracticeService. Each Run starts on a
 * scheduled local slot so sessions spread over distinct days, and the
 * Tactical Profile is read after each Run like the Home screen does.
 */
export function simulateTrainingHistory(input: {
  practice: PracticeService;
  player: SimulatedPlayer;
  clock: SimulationClock;
  plan: SimulatedHistoryPlan;
  seed: string | number;
}): SimulatedRunRecord[] {
  const { practice, player, clock, plan } = input;
  const schedule = new SeededRandom(`schedule:${input.seed}`);
  const runsPerDay = Math.max(1, Math.trunc(plan.runsPerDay ?? 2));
  const arrowDuelShare = Math.min(1, Math.max(0, plan.arrowDuelShare ?? 0));
  const observeEveryRun = plan.observeEveryRun ?? true;
  const records: SimulatedRunRecord[] = [];
  const firstDayMs = Math.ceil(clock.nowMs() / DAY_MS) * DAY_MS;

  for (let runIndex = 0; runIndex < plan.runs; runIndex += 1) {
    const day = Math.floor(runIndex / runsPerDay);
    const slot = runIndex % runsPerDay;
    clock.advanceTo(
      firstDayMs + day * DAY_MS + 17 * 60 * MINUTE_MS + slot * 25 * MINUTE_MS +
      schedule.int(10) * MINUTE_MS
    );
    const kind: SimulatedRunKind =
      schedule.next() < arrowDuelShare ? "arrow_duel" : "standard";
    practice.startSprint(
      {
        mode: kind,
        puzzleSelectionSeed: `${input.seed}:run:${runIndex}`
      },
      clock.now()
    );
    const mixedRunIndex = player.mixedRunsCompleted;
    const result = playActiveRun({ practice, player, clock });
    player.recordMixedRunCompleted();
    const last = runIndex === plan.runs - 1;
    const record = {
      ...result,
      mixedRunIndex,
      ...(observeEveryRun || last
        ? observeProfile(practice, clock)
        : { phase: "unavailable" as const, signals: [] })
    };
    records.push(record);

    if (plan.focusedRunFamily !== undefined && hasRecommendation(record, plan.focusedRunFamily)) {
      clock.advanceTo(clock.nowMs() + 2 * MINUTE_MS);
      // A Focused Run is offered again only after fresh mixed evidence in its
      // family, so an unavailable plan is skipped like a user would.
      const prepared = practice.prepareFocusedRun(
        plan.focusedRunFamily,
        clock.now(),
        `${input.seed}:focus:${runIndex}`
      );
      if (prepared.status === "ready") {
        practice.startPreparedFocusedRun(prepared.prepared, clock.now());
        const focused = playActiveRun({ practice, player, clock });
        records.push({
          ...focused,
          mixedRunIndex: player.mixedRunsCompleted,
          ...observeProfile(practice, clock)
        });
      }
    }
    if (plan.stopWhen?.(record)) {
      break;
    }
  }
  return records;
}

export function observeProfile(
  practice: PracticeService,
  clock: SimulationClock
): Pick<SimulatedRunRecord, "phase" | "signals"> {
  const snapshot = practice.getTacticalProfileSnapshot(clock.now());
  if (!snapshot) {
    return { phase: "unavailable", signals: [] };
  }
  return {
    phase: snapshot.phase,
    signals: snapshot.evaluation.signals.map((signal) => ({
      id: signal.id,
      taskFamily: signal.taskFamily,
      theme: signal.theme,
      reason: signal.reason,
      status: signal.status,
      solveConfidence: signal.solveConfidence,
      speedConfidence: signal.speedConfidence,
      expectedFailuresPer100: signal.expectedFailuresPer100,
      completedTimeMultiplier: signal.completedTimeMultiplier,
      distinctPuzzleCount: signal.distinctPuzzleCount,
      distinctSessionCount: signal.distinctSessionCount
    }))
  };
}

function hasRecommendation(
  record: SimulatedRunRecord,
  taskFamily: TacticalProfileTaskFamily
): boolean {
  return record.signals.some(
    (signal) => signal.status === "recommended" && signal.taskFamily === taskFamily
  );
}

function assertValidProfile(profile: SimulatedPlayerProfile): void {
  if (!Number.isFinite(profile.skillRating)) {
    throw new Error("Simulated player skill Rating must be finite");
  }
  if (!(profile.baseSolveRate > 0 && profile.baseSolveRate < 1)) {
    throw new Error("Simulated player base solve rate must be between 0 and 1");
  }
  if (!(profile.baseDecisionSeconds > 0)) {
    throw new Error("Simulated player decision time must be positive");
  }
  if (!(profile.timeNoiseSigma >= 0)) {
    throw new Error("Simulated player time noise must be non-negative");
  }
  for (const value of Object.values(profile.themeSpeedMultipliers ?? {})) {
    if (!(value > 0)) {
      throw new Error("Simulated player speed multipliers must be positive");
    }
  }
}

function logistic(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function logit(probability: number): number {
  return Math.log(probability / (1 - probability));
}
