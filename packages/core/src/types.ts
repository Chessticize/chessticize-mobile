export type SprintMode = "standard" | "blitz" | "arrow_duel" | "custom";

export type SprintStatus = "active" | "paused" | "won" | "failed" | "abandoned";

export type AttemptResult = "correct" | "wrong";

export type AttemptSource = "sprint" | "scheduled_review";

export type SprintEndReason =
  | "target_reached"
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
  targetCorrect: number;
  maxMistakes: number;
  ratingKey: string;
  theme?: string;
}

export interface CustomSprintConfigRecord {
  id: string;
  mode: SprintMode;
  ratingKey: string;
  durationSeconds: number;
  perPuzzleSeconds: number;
  targetCorrect: number;
  maxMistakes: number;
  theme?: string;
  lastStartedAt: string;
  playCount: number;
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
  selectedMove?: string;
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
  result: AttemptResult;
  submittedMove: string;
  expectedMove: string;
  startedAt: string;
  completedAt: string;
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

export interface ReviewScheduleInput {
  context?: ReviewContext;
  previous?: ReviewQueueState;
  result: AttemptResult;
  now: string;
  timeZone?: string;
}
