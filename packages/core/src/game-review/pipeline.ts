import type {
  ExtractedGamePuzzle,
  ExtractGamePuzzlesOptions,
  ExtractGamePuzzlesResult,
  GameHighlightMoment,
  GamePlyEvalInput,
  HumanPolicyModel,
  PuzzleExtractionEngine
} from "../game-puzzles/index.ts";
import { extractGamePuzzles } from "../game-puzzles/index.ts";
import {
  evaluateGamePass1,
  type EvaluateGamePass1Options,
  type GameReviewEngine,
  type GameReviewReport
} from "./evaluator.ts";
import type { ParsedGame } from "./pgn-parser.ts";

export interface FullGameReviewPipelineInput {
  gameId?: string;
  pgn: string | ParsedGame;
  userColor: "w" | "b";
  engine: GameReviewEngine & PuzzleExtractionEngine;
  timeControl?: string;
  /** Optional on-device human policy model (e.g. Maia-2) for puzzle difficulty estimation. */
  humanPolicy?: HumanPolicyModel;
  /** Optional player rating for difficulty-aware caliber ranking of extracted puzzles. */
  userRating?: number;
  pass1Options?: EvaluateGamePass1Options;
  extractionOptions?: ExtractGamePuzzlesOptions;
  onPass1Complete?: (report: GameReviewReport) => void;
}

export interface FullGameReviewPipelineResult {
  report: GameReviewReport;
  puzzles: ExtractedGamePuzzle[];
  highlights: GameHighlightMoment[];
  allCandidatePuzzles: ExtractedGamePuzzle[];
}

export function gameReviewReportToPlyEvalInputs(
  report: GameReviewReport
): GamePlyEvalInput[] {
  return report.plies.map((ply) => ({
    ply: ply.ply,
    uci: ply.uci,
    san: ply.san,
    fenBefore: ply.fenBefore,
    fenAfter: ply.fenAfter,
    evalAfter: ply.scoreAfter,
    ...(ply.clockRemainingSec !== undefined
      ? { clockRemainingSec: ply.clockRemainingSec }
      : {})
  }));
}

export async function runFullGameReviewPipeline(
  input: FullGameReviewPipelineInput
): Promise<FullGameReviewPipelineResult> {
  const report = await evaluateGamePass1({
    pgn: input.pgn,
    engine: input.engine,
    userColor: input.userColor,
    ...(input.pass1Options !== undefined ? { options: input.pass1Options } : {})
  });

  input.onPass1Complete?.(report);

  if (!report.isComplete || input.pass1Options?.signal?.aborted || input.extractionOptions?.signal?.aborted) {
    return {
      report,
      puzzles: [],
      highlights: [],
      allCandidatePuzzles: []
    };
  }

  const timeControl = input.timeControl ?? report.parsedGame.timeControl;
  const extractionOptions: ExtractGamePuzzlesOptions = {
    estimateDifficulty: true,
    ...(input.humanPolicy !== undefined ? { humanPolicy: input.humanPolicy } : {}),
    ...(input.userRating !== undefined ? { userRating: input.userRating } : {}),
    ...input.extractionOptions
  };
  const extraction: ExtractGamePuzzlesResult = await extractGamePuzzles(
    {
      ...(input.gameId !== undefined ? { gameId: input.gameId } : {}),
      userColor: input.userColor,
      plies: gameReviewReportToPlyEvalInputs(report),
      ...(timeControl !== undefined ? { timeControl } : {})
    },
    input.engine,
    extractionOptions
  );

  return {
    report,
    puzzles: extraction.puzzles,
    highlights: extraction.highlights,
    allCandidatePuzzles: extraction.allCandidatePuzzles
  };
}
