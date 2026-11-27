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
