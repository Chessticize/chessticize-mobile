export type SprintMode = "standard" | "blitz" | "arrow_duel" | "custom";

export type SprintStatus = "active" | "paused" | "won" | "failed" | "abandoned";

export type AttemptResult = "correct" | "wrong";

export type AttemptOutcome = AttemptResult | "timed_out" | "incomplete";

export type AttemptTimingStatus = "slow" | "timed_out";

export type AttemptSource = "sprint" | "scheduled_review";

export type SprintEndReason =
  | "target_reached"
  | "attempt_limit"
  | "max_mistakes"
  | "time_expired"
  | "puzzles_exhausted"
  | "abandoned";

export interface Puzzle {
  id: string;
  initialFen: string;
  solutionMoves: string[];
  rating: number;
  ratingDeviation?: number;
  popularity?: number;
  nbPlays?: number;
  themes: string[];
  gameUrl?: string;
  openingTags?: string[];
  source: "lichess" | "synthetic";
  stockfishEval?: number;
  stockfishBestMove?: string;
  stockfishEvalAfterFirstMove?: number;
}

export interface SprintConfig {
  mode: SprintMode;
  durationSeconds: number;
  perPuzzleSeconds: number;
  /** Optional only for persisted legacy configs; new configs always populate it. */
  puzzleTiming?: PuzzleTimingPolicy;
  targetCorrect: number;
  maxMistakes: number;
  ratingKey: string;
  /** Optional only for persisted legacy configs; current Arrow Duel configs populate it. */
  opponentReply?: OpponentReplyConfig;
  themes?: string[];
  /** A fixed attempt ceiling used by bounded interventions such as Tactical Focus. */
  maxAttempts?: number;
  /** Interventions can reuse a Run's Rating for selection without mutating it. */
  ratingPolicy?: "rated" | "unrated";
  /** Explicit intervention identity; never infer this from display copy or a rating key. */
  tacticalFocus?: {
    taskFamily: "line" | "arrow_duel";
    themes: string[];
    mixedControlCount: number;
    ratingAnchor: number;
    minRating: number;
    maxRating: number;
  };
}

export interface PuzzleTimingPolicy {
  slowAfterSeconds: number | null;
  timeoutAfterSeconds: number | null;
}

export interface OpponentReplyConfig {
  enabled: boolean;
  seconds: number;
}

export interface CustomSprintConfigRecord {
  id: string;
  mode: SprintMode;
  ratingKey: string;
  durationSeconds: number;
  perPuzzleSeconds: number;
  targetCorrect: number;
  maxMistakes: number;
  themes?: string[];
  lastStartedAt: string;
  playCount: number;
}

export type PracticeRunKind = "standard" | "arrow_duel" | "custom";

export interface PracticeRunRecord {
  id: string;
  kind: PracticeRunKind;
  name: string;
  mode: "standard" | "custom" | "arrow_duel";
  ratingKey: string;
  durationSeconds: number;
  perPuzzleSeconds: number;
  /** Optional only for imported legacy Runs; current Runs always populate it. */
  puzzleTiming?: PuzzleTimingPolicy;
  targetCorrect: number;
  maxMistakes: number;
  /** Optional only for imported legacy Runs; current Arrow Duel Runs populate it. */
  opponentReply?: OpponentReplyConfig;
  themes?: string[];
  homeOrder: number;
  archived: boolean;
  updatedAt: string;
}

export interface PracticeRunSnapshot {
  id: string;
  kind: PracticeRunKind;
  name: string;
}

export interface RatingRecord {
  key: string;
  generation: number;
  rating: number;
  ratingDeviation?: number;
  volatility?: number;
  games: number;
}

export interface PuzzleLineState {
  kind: "line";
  puzzle: Puzzle;
  currentFen: string;
  playedMoves: string[];
  cursor: number;
  autoPlayedMoves: string[];
  solved: boolean;
}

export interface ArrowDuelState {
  kind: "arrow_duel";
  puzzle: Puzzle;
  currentFen: string;
  candidates: string[];
  correctMove: string;
  wrongMove: string;
  phase: "choice" | "reply_handoff" | "reply";
  selectedMove?: string;
  replyPauseStartedAt?: string;
  replyStartedAt?: string;
  replyDeadlineAt?: string;
  solved: boolean;
}

export type CurrentPuzzleState = PuzzleLineState | ArrowDuelState;

export interface PuzzleFeedback {
  result: AttemptResult;
  puzzleSolved: boolean;
  submittedMove: string;
  expectedMove: string;
  autoPlayedMoves: string[];
  currentFen: string;
  review?: ArrowDuelReview;
}

export interface ArrowDuelReview {
  arrows: ArrowDuelReviewArrow[];
  selectedMove: string;
  punishmentLine: string[];
}

export interface ArrowDuelReviewArrow {
  move: string;
  role: "correct" | "wrong";
  color: "green" | "red";
  selected: boolean;
}

export interface SprintState {
  id: string;
  config: SprintConfig;
  run?: PracticeRunSnapshot;
  ratingGeneration?: number;
  status: SprintStatus;
  startedAt: string;
  deadlineAt: string;
  currentPuzzleStartedAt?: string;
  currentPuzzleDeadlineAt?: string;
  pausedAt?: string;
  totalPausedMs?: number;
  completedAt?: string;
  endReason?: SprintEndReason;
  correctCount: number;
  mistakeCount: number;
  currentStreak: number;
  bestStreak: number;
  hasUserSubmittedMove: boolean;
  currentPuzzleIndex: number;
  puzzles: Puzzle[];
  currentPuzzle?: CurrentPuzzleState;
  ratingBefore: number;
  ratingAfter?: number;
  ratingGamesBefore?: number;
  ratingDeviationBefore?: number;
  ratingDeviationAfter?: number;
  volatilityBefore?: number;
  volatilityAfter?: number;
}

export interface AttemptEvent {
  id: string;
  source: AttemptSource;
  sessionId: string;
  puzzleId: string;
  mode: SprintMode;
  ratingKey: string;
  result: AttemptOutcome;
  submittedMove?: string;
  expectedMove: string;
  startedAt: string;
  completedAt: string;
  elapsedMs?: number;
  timingStatus?: AttemptTimingStatus;
  ratingBefore: number;
  ratingAfter?: number;
  arrowDuelCandidateOrder?: string[];
  unclear?: boolean;
  unclearUpdatedAt?: string;
}

export interface SessionMistakeReviewItem {
  puzzle: Puzzle;
  attempt: AttemptEvent;
}

export interface SessionReplayItem {
  puzzle: Puzzle;
  attempt: AttemptEvent;
  inReview: boolean;
}

export interface SprintCommandResult {
  state: SprintState;
  feedback?: PuzzleFeedback;
  attempt?: AttemptEvent;
}

export interface ReviewQueueState {
  puzzleId: string;
  mode: SprintMode;
  ratingKey: string;
  dueDay: string;
  intervalDays: number;
  reviewCount: number;
  successStreak: number;
  lapseCount: number;
  lastResult: AttemptResult | null;
  lastReviewedAt: string | null;
  enrolledAt?: string;
}

export interface ReviewQueueItem {
  puzzle: Puzzle;
  review: ReviewQueueState;
}

export interface ReviewContext {
  puzzleId: string;
  mode: SprintMode;
  ratingKey: string;
}

export interface ReviewScheduleRemoval extends ReviewContext {
  removedAt: string;
}

export interface ReviewScheduleInput {
  context?: ReviewContext;
  previous?: ReviewQueueState;
  result: AttemptResult;
  now: string;
  timeZone?: string;
}
