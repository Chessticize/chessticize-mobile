import type React from "react";
import type { MoveResult } from "react-native-chessboard";
import type {
  AnalysisScore,
  ArrowDuelState,
  EngineAnalysisLine,
  EngineSearchRequest,
  GameHighlightMoment,
  GamePlyEvaluation,
  GameReviewEngine,
  MoveClassification,
  ParsedGame,
  PuzzleExtractionEngine,
  PuzzleLineState,
  ReviewContext
} from "../../../../../packages/core/src/index.ts";
import type {
  GameAnalysisStatus,
  GameReviewStore,
  StoredImportedGame,
  StoredUserPuzzle
} from "../../../../../packages/storage/src/game-review-store.ts";
import type { PracticeService } from "../../../../../packages/storage/src/practice-service.ts";

export interface GameReviewLiveEngine extends GameReviewEngine, PuzzleExtractionEngine {
  analyze(request: EngineSearchRequest): Promise<EngineAnalysisLine[]>;
}

export type GameReviewMode = "moments" | "moves";

export type GameReviewScanPhase =
  | "idle"
  | "scanning_pass1"
  | "extracting_pass2"
  | "complete"
  | "paused"
  | "error";

export type GameReviewBoardProps = {
  boardSize?: number;
  colors?: Record<string, string | undefined>;
  fen: string;
  flipped?: boolean;
  gestureEnabled?: boolean;
  onMove?: (result: MoveResult) => void;
  spriteSource?: unknown;
  squareHighlights?: ReadonlyArray<{ square: string; color: string }>;
};

export type GameReviewBoardComponent = React.ComponentType<GameReviewBoardProps>;

export type KeyMomentPuzzleItem = {
  id: string;
  kind: "puzzle";
  ply: number;
  moveNumber: number;
  puzzle: StoredUserPuzzle;
  playedMoveUci?: string;
  playedMoveSan?: string;
  bestMoveUci?: string;
  bestMoveSan?: string;
  bestEvalLabel?: string;
  playedEvalLabel?: string;
  escapedPunishment: boolean;
  decisionFen: string;
};

export type KeyMomentHighlightItem = {
  id: string;
  kind: "highlight";
  ply: number;
  moveNumber: number;
  highlight: GameHighlightMoment;
  fenBefore: string;
  fenAfter: string;
};

export type KeyMomentSwingItem = {
  id: string;
  kind: "swing";
  ply: number;
  moveNumber: number;
  color: "w" | "b";
  classification: MoveClassification;
  playedMoveUci: string;
  playedMoveSan: string;
  bestMoveUci?: string;
  bestMoveSan?: string;
  evalAfterLabel: string;
  fenBefore: string;
  fenAfter: string;
};

export type KeyMomentItem = KeyMomentPuzzleItem | KeyMomentHighlightItem | KeyMomentSwingItem;

export type KeyMomentRetryStatus = "prompt" | "solved" | "failed" | "skipped" | "highlight" | "swing";

export type KeyMomentRetryState = {
  momentId: string;
  status: KeyMomentRetryStatus;
  lineState?: PuzzleLineState;
  duelState?: ArrowDuelState;
  candidates?: string[];
  selectedMove?: string;
  expectedMove?: string;
  punishmentStartFen?: string;
  punishmentLine: string[];
  showingRefutation: boolean;
  refutationStep: number;
  autoEnrolledInReview: boolean;
  reviewContext?: ReviewContext;
};

export type GameReviewBoardArrow = {
  move: string;
  role: "candidate" | "best" | "blunder" | "engine" | "highlight";
  selected?: boolean;
};

export type SideClassificationCounts = {
  accuracy: number;
  best: number;
  inaccuracy: number;
  mistake: number;
  blunder: number;
  missedWin: number;
};

export type GameReviewSummaryData = {
  white: SideClassificationCounts;
  black: SideClassificationCounts;
  userColor: "w" | "b";
  puzzles: StoredUserPuzzle[];
};

export type GameReviewEvalGraphPoint = {
  ply: number;
  moveNumber: number;
  color?: "w" | "b";
  san?: string;
  whiteWinPercent: number;
  score: AnalysisScore;
  classification?: MoveClassification;
  isHighlight?: boolean;
  isKeyMoment?: boolean;
};

export interface UseGameReviewControllerParams {
  game: StoredImportedGame;
  store: GameReviewStore;
  practiceService: PracticeService;
  engine?: GameReviewLiveEngine | null;
  initialHighlights?: readonly GameHighlightMoment[];
  initialMode?: GameReviewMode;
  initialPly?: number;
  initialFreeAnalysisOpen?: boolean;
  pass1Depth?: number;
  pass1Nodes?: number;
  freeAnalysisDepth?: number;
  checkpointIntervalPlies?: number;
  animateKeyMomentJump?: boolean;
}

export interface GameReviewController {
  game: StoredImportedGame;
  parsedGame: ParsedGame | null;
  parseError: string | null;
  analysisStatus: GameAnalysisStatus;
  scanPhase: GameReviewScanPhase;
  scanProgress: { completedPlies: number; totalPlies: number };
  scanError: string | null;
  plyEvaluations: GamePlyEvaluation[];
  evalByPly: ReadonlyMap<number, GamePlyEvaluation>;
  evalGraphPoints: GameReviewEvalGraphPoint[];
  currentPly: number;
  currentPlyEval: GamePlyEvaluation | null;
  currentFen: string;
  currentScore: AnalysisScore;
  currentWhiteWinPercent: number;
  currentLastMoveUci: string | null;
  criticalPlies: number[];
  flipped: boolean;
  mode: GameReviewMode;
  keyMoments: KeyMomentItem[];
  activeMomentIndex: number;
  activeMoment: KeyMomentItem | null;
  activeRetryState: KeyMomentRetryState | null;
  retryStatesByMomentId: Readonly<Record<string, KeyMomentRetryState>>;
  boardArrows: GameReviewBoardArrow[];
  arrowDuelCandidates: string[] | null;
  isPromptHidingAnswer: boolean;
  userPuzzles: StoredUserPuzzle[];
  enrolledPuzzleIds: ReadonlySet<string>;
  summary: GameReviewSummaryData;
  freeAnalysisOpen: boolean;
  freeAnalysisLoading: boolean;
  freeAnalysisLines: EngineAnalysisLine[];
  freeAnalysisError: string | null;
  showEngineArrows: boolean;
  whyOpen: boolean;
  whyLoading: boolean;
  whyBaseFen: string | null;
  whyMoves: string[];
  whyStep: number;
  whyError: string | null;
  isExploringOffLine: boolean;
  explorationPliesCount: number;
  isFastForwarding: boolean;
  setMode: (mode: GameReviewMode) => void;
  selectPly: (ply: number) => void;
  stepFirst: () => void;
  stepPrev: () => void;
  stepNext: () => void;
  stepLast: () => void;
  jumpToPrevCriticalPly: () => void;
  jumpToNextCriticalPly: () => void;
  toggleFlip: () => void;
  selectKeyMoment: (index: number) => void;
  prevKeyMoment: () => void;
  nextKeyMoment: () => void;
  skipActiveKeyMoment: () => void;
  retryActiveKeyMoment: () => void;
  submitBoardMove: (uci: string) => void;
  selectArrowDuelCandidate: (uci: string) => void;
  toggleRefutationPlayback: () => void;
  stepRefutationForward: () => void;
  stepRefutationBackward: () => void;
  togglePuzzleReviewEnrollment: (puzzle: StoredUserPuzzle) => void;
  enrollAllPuzzlesInReview: () => void;
  toggleFreeAnalysis: () => void;
  toggleShowEngineArrows: () => void;
  toggleWhyRefutation: () => void;
  closeWhyRefutation: () => void;
  stepWhyBackward: () => void;
  stepWhyForward: () => void;
  playEngineLineMove: (uci: string) => void;
  returnToGameLine: () => void;
  resumeAnalysis: () => void;
}
