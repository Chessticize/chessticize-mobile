/*
 * Adapted from Chessticize/chessticize-worker, lychee-org/retagger, and lichess-org/puzzler.
 * Original work Copyright 2020 lichess.org
 * Forked work Copyright 2023 lychee-org
 * Modified work Copyright 2024-2026 chessticize.com
 * Licensed under the MIT License.
 */

export type {
  ExtractedArrowDuelMeta,
  ExtractedGamePuzzle,
  ExtractGamePuzzlesInput,
  ExtractGamePuzzlesOptions,
  ExtractGamePuzzlesResult,
  GameHighlightMoment,
  GamePlyEvalInput,
  GamePuzzleMomentKind,
  OpponentCaughtMomentKind,
  OwnMomentKind,
  PuzzleExtractionEngine,
  PuzzleExtractionEngineRequest,
  PuzzleLengthTag,
  PuzzlePhaseTag,
  SearchLimitConfig
} from "./types.ts";

export {
  compareRelativeScores,
  cpScore,
  fenAfterUci,
  fenFullmoveNumber,
  fenPositionKey,
  fenSideToMove,
  isForcedMateWithin,
  isIrreversibleMove,
  isLegalUci,
  mateScore,
  moveToUci,
  negateRelativeScore,
  normalizeUci,
  oppositeColor,
  parseClockSecondsFromComment,
  parseTimeControl,
  parseUciMove,
  relativeScoreRank,
  relativeScoreToCp,
  sanForUci,
  scoreForPov,
  tryPlayUci,
  WIN_CHANCES_MULTIPLIER,
  winChances
} from "./score.ts";
export type { RelativeScore } from "./score.ts";

export {
  ARROW_DUEL_MATE_SCORE,
  ARROW_DUEL_MIN_BEST_CP,
  ARROW_DUEL_MIN_CP_SWING,
  ARROW_DUEL_MIN_WIN_CHANCE_SWING,
  DEFAULT_ARROW_DUEL_LIMIT,
  verifyArrowDuelPair
} from "./arrow-duel.ts";
export type { VerifyArrowDuelPairParams } from "./arrow-duel.ts";

export {
  attacksFrom,
  checkZugzwang,
  coordsToSquare,
  detectLengthTag,
  detectPhaseTag,
  isCuratedTheme,
  KING_VALUES,
  LENGTH_TAGS,
  MATE_TAGS,
  PIECE_VALUES,
  squareDistance,
  squareFile,
  squareRank,
  squaresBetween,
  squaresRay,
  tagPuzzle,
  tagPuzzleWithPvEnrichment
} from "./tagger.ts";
export type { EnrichTagsInput, TagPuzzleInput, TagPuzzleResult } from "./tagger.ts";

export {
  ARROW_DUEL_ELO_GRID,
  DEFAULT_MAX_REVIEW_ABOVE_USER_RATING,
  DIFFICULTY_MAX_RATING,
  DIFFICULTY_MIN_RATING,
  DIFFICULTY_SF_DEPTHS,
  MAIA2_MOBILE_ELOS,
  estimateGamePuzzleDifficulty,
  evaluateTreeEnsemble,
  extractDifficultyMaia2Features,
  extractDifficultyStockfishFeatures,
  extractDifficultyStructuralFeatures,
  getDefaultDifficultyModels,
  isWithinReviewDifficultyBand,
  registerDefaultDifficultyModels,
  solvePromptedArrowDuelRating
} from "./difficulty.ts";
export type {
  EstimatePuzzleDifficultyOptions,
  ExportedDecisionTree,
  ExportedTreeEnsemble,
  HumanPolicyEloStats,
  HumanPolicyModel,
  HumanPolicyMoveRequest,
  HumanPolicyMoveResult,
  PuzzleDifficultyEstimate
} from "./difficulty.ts";

export {
  MAIA2_BOARD_SIZE,
  MAIA2_TENSOR_CHANNELS,
  MAIA2_TENSOR_FLOATS,
  MAIA2_VOCAB_SIZE,
  createMaia2HumanPolicyModel,
  decodeMaia2MaskedProbabilities,
  encodeFenToMaia2Tensor,
  encodeLegalMovesForMaia2,
  maia2EloCategory,
  mirrorUciMove,
  summarizeMaia2EloStats
} from "./maia2-encoding.ts";
export type {
  EncodedMaia2Board,
  EncodedMaia2LegalMoves,
  Maia2TensorBatchInput,
  Maia2TensorRunner,
  ManagedHumanPolicyModel
} from "./maia2-encoding.ts";
export { MAIA2_MOVE_TO_INDEX, MAIA2_MOVE_VOCAB } from "./maia2-vocab.ts";

export {
  DEFAULT_MAX_RECOMMENDED_PUZZLES_PER_GAME,
  isEligibleForRecommendedGamePuzzleReview,
  selectRecommendedGamePuzzleIds
} from "./recommended-review.ts";
export type {
  RecommendedGamePuzzleCandidate,
  RecommendedGamePuzzleEligibilityOptions,
  SelectRecommendedGamePuzzlesOptions
} from "./recommended-review.ts";

export {
  ALREADY_WINNING_CP,
  CHECK_FOUND_LINE_DEPTH,
  CHECK_FOUND_LINE_MAX_WIN_CHANCE_DROP,
  CHECK_FOUND_LINE_THRESHOLD_CP,
  checkIfUserFoundLine,
  computeCaliberScore,
  DEFAULT_DEEP_LIMIT,
  DEFAULT_MATE_DEFENSE_LIMIT,
  DEFAULT_MAX_PUZZLES_PER_GAME,
  extractGamePuzzles,
  isAutoReviewCaliberEligible,
  isValidAttack,
  maintainsAdvantage,
  MAX_MATE_SOON,
  MIN_OPPORTUNITY_SCORE_CP,
  SEVERE_TIME_TROUBLE_SEC,
  WIN_CHANCE_SWING_THRESHOLD
} from "./extractor.ts";
export type { EngineMoveCandidate, NextMovesPair } from "./extractor.ts";
