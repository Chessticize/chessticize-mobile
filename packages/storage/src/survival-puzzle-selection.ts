import { isServerCompatibleArrowDuelPuzzle } from "../../core/src/index.ts";
import type { Puzzle } from "../../core/src/index.ts";
import type {
  SurvivalPuzzleBatch,
  SurvivalPuzzleBatchInput
} from "./puzzle-source.ts";

export function eligibleSurvivalPuzzles(
  puzzles: readonly Puzzle[],
  input: Pick<SurvivalPuzzleBatchInput, "challengeType" | "level">
): Puzzle[] {
  return [...new Map(puzzles.map((puzzle) => [puzzle.id, puzzle])).values()]
    .filter((puzzle) => (
      puzzle.rating >= input.level.minRating &&
      puzzle.rating <= input.level.maxRating &&
      (
        input.challengeType === "puzzle" ||
        isServerCompatibleArrowDuelPuzzle(puzzle)
      )
    ))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function selectSurvivalPuzzleBatchFromPuzzles(
  puzzles: readonly Puzzle[],
  input: SurvivalPuzzleBatchInput
): SurvivalPuzzleBatch {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1) {
    throw new Error("Survival puzzle batch limit must be a positive integer");
  }
  const eligible = eligibleSurvivalPuzzles(puzzles, input);
  if (eligible.length === 0) {
    return { puzzles: [] };
  }
  if (!input.cursor) {
    const offset = seededOffset(
      input.selectionSeed,
      `${input.challengeType}:${input.level.minRating}:${input.level.maxRating}`,
      eligible.length
    );
    const rotated = [...eligible.slice(offset), ...eligible.slice(0, offset)];
    const selected = rotated.slice(0, input.limit);
    return {
      puzzles: selected,
      cursor: {
        startPuzzleId: selected[0]!.id,
        afterPuzzleId: selected.at(-1)!.id,
        wrapped: offset + selected.length > eligible.length
      }
    };
  }
  const startIndex = eligible.findIndex((puzzle) => puzzle.id === input.cursor!.startPuzzleId);
  const afterIndex = eligible.findIndex((puzzle) => puzzle.id === input.cursor!.afterPuzzleId);
  if (startIndex < 0 || afterIndex < 0) {
    throw new Error("Stored Survival puzzle cursor is unavailable in this pack");
  }
  const ordered = input.cursor.wrapped
    ? eligible.slice(afterIndex + 1, startIndex)
    : [
        ...eligible.slice(afterIndex + 1),
        ...eligible.slice(0, startIndex)
      ];
  const selected = ordered.slice(0, input.limit);
  if (selected.length === 0) {
    return { puzzles: [], cursor: { ...input.cursor } };
  }
  const lastIndex = eligible.findIndex((puzzle) => puzzle.id === selected.at(-1)!.id);
  return {
    puzzles: selected,
    cursor: {
      startPuzzleId: input.cursor.startPuzzleId,
      afterPuzzleId: selected.at(-1)!.id,
      wrapped: input.cursor.wrapped || lastIndex < afterIndex
    }
  };
}

export function seededOffset(
  seedInput: string | number,
  scope: string,
  candidateCount: number
): number {
  if (!Number.isSafeInteger(candidateCount) || candidateCount < 1) {
    throw new Error("Seeded offset requires a positive candidate count");
  }
  let hash = 2166136261;
  const input = `${seedInput}:${scope}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % candidateCount;
}
