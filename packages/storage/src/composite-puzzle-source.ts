import {
  isUserGamePuzzleId,
  namedThemesForSelection,
  type Puzzle
} from "../../core/src/index.ts";
import {
  isEligibleUserGamePuzzleForMode,
  storedUserPuzzleToPuzzle,
  type GameReviewStore
} from "./game-review-store.ts";
import {
  selectUniquePuzzles,
  selectUniquePuzzlesForRatingBands
} from "./puzzle-selection.ts";
import type {
  PuzzleSource,
  RatingBandPuzzleSelection,
  RatingBandPuzzleSelectionInput,
  SurvivalPuzzleBatch,
  SurvivalPuzzleBatchInput
} from "./puzzle-source.ts";
import type { PuzzleSelectionFilter } from "./query-types.ts";

export class CompositePuzzleSource implements PuzzleSource {
  private readonly packSource: PuzzleSource;
  private readonly userPuzzleStore: GameReviewStore;

  constructor(packSource: PuzzleSource, userPuzzleStore: GameReviewStore) {
    this.packSource = packSource;
    this.userPuzzleStore = userPuzzleStore;
  }

  countPuzzles(filter?: PuzzleSelectionFilter): number {
    if (filter === undefined) {
      return this.packSource.countPuzzles();
    }
    const source = filter.source ?? "pack";
    if (source === "pack" && !hasUserGameScopedIds(filter.includeIds)) {
      return this.packSource.countPuzzles(filter);
    }
    if (source === "user_game") {
      return this.selectUserGamePuzzles(filter).length;
    }
    return this.selectPuzzles(filter).length;
  }

  getPuzzle(id: string): Puzzle | undefined {
    if (isUserGamePuzzleId(id)) {
      const stored = this.userPuzzleStore.getUserPuzzle(id);
      return stored ? storedUserPuzzleToPuzzle(stored) : undefined;
    }
    return this.packSource.getPuzzle(id);
  }

  getPuzzles(ids: readonly string[]): Puzzle[] {
    const normalized = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (normalized.length === 0) {
      return [];
    }
    const userIds: string[] = [];
    const packIds: string[] = [];
    for (const id of normalized) {
      if (isUserGamePuzzleId(id)) {
        userIds.push(id);
      } else {
        packIds.push(id);
      }
    }

    const byId = new Map<string, Puzzle>();
    if (packIds.length > 0) {
      const packPuzzles = this.packSource.getPuzzles
        ? this.packSource.getPuzzles(packIds)
        : packIds
            .map((id) => this.packSource.getPuzzle(id))
            .filter((puzzle): puzzle is Puzzle => puzzle !== undefined);
      for (const puzzle of packPuzzles) {
        byId.set(puzzle.id, puzzle);
      }
    }
    for (const id of userIds) {
      const stored = this.userPuzzleStore.getUserPuzzle(id);
      if (stored) {
        byId.set(stored.id, storedUserPuzzleToPuzzle(stored));
      }
    }

    return normalized.flatMap((id) => {
      const puzzle = byId.get(id);
      return puzzle ? [puzzle] : [];
    });
  }

  selectPuzzles(filter: PuzzleSelectionFilter): Puzzle[] {
    const source = filter.source ?? "pack";
    if (source === "pack") {
      if (!hasUserGameScopedIds(filter.includeIds)) {
        return this.packSource.selectPuzzles(filter);
      }
      const userIds = filter.includeIds!.filter(isUserGamePuzzleId);
      const packIds = filter.includeIds!.filter((id) => !isUserGamePuzzleId(id));
      const candidates: Puzzle[] = [];
      if (packIds.length > 0) {
        candidates.push(...this.packSource.selectPuzzles({ ...filter, includeIds: packIds }));
      }
      if (userIds.length > 0) {
        candidates.push(...this.selectUserGamePuzzles({ ...filter, includeIds: userIds }));
      }
      return selectUniquePuzzles({
        puzzles: candidates,
        mode: filter.mode,
        limit: filter.limit,
        allPuzzlesArrowDuelEligible: filter.mode === "arrow_duel",
        ...(filter.minRating === undefined ? {} : { minRating: filter.minRating }),
        ...(filter.maxRating === undefined ? {} : { maxRating: filter.maxRating }),
        ...(filter.themes === undefined ? {} : { themes: filter.themes }),
        ...(filter.includeIds === undefined ? {} : { includeIds: filter.includeIds }),
        ...(filter.excludeIds === undefined ? {} : { excludeIds: filter.excludeIds }),
        ...(filter.randomSeed === undefined ? {} : { randomSeed: filter.randomSeed })
      });
    }

    if (source === "user_game") {
      return this.selectUserGamePuzzles(filter);
    }

    // source === "all"
    const userCandidates = this.selectUserGamePuzzles(filter);
    // Pack puzzles carry neither timeClass nor gameId, so when those user-game
    // metadata filters are set, only user-game puzzles can match.
    if (filter.timeClass !== undefined || filter.gameId !== undefined) {
      return userCandidates;
    }
    const packCandidates = this.packSource.selectPuzzles({
      ...filter,
      source: "pack"
    });
    return selectUniquePuzzles({
      puzzles: [...userCandidates, ...packCandidates],
      mode: filter.mode,
      limit: filter.limit,
      allPuzzlesArrowDuelEligible: filter.mode === "arrow_duel",
      ...(filter.minRating === undefined ? {} : { minRating: filter.minRating }),
      ...(filter.maxRating === undefined ? {} : { maxRating: filter.maxRating }),
      ...(filter.themes === undefined ? {} : { themes: filter.themes }),
      ...(filter.includeIds === undefined ? {} : { includeIds: filter.includeIds }),
      ...(filter.excludeIds === undefined ? {} : { excludeIds: filter.excludeIds }),
      ...(filter.randomSeed === undefined ? {} : { randomSeed: filter.randomSeed })
    });
  }

  countSurvivalPuzzles(
    input: Pick<SurvivalPuzzleBatchInput, "challengeType" | "level">
  ): number {
    return this.packSource.countSurvivalPuzzles(input);
  }

  selectSurvivalPuzzleBatch(input: SurvivalPuzzleBatchInput): SurvivalPuzzleBatch {
    return this.packSource.selectSurvivalPuzzleBatch(input);
  }

  selectPuzzlesForRatingBands(
    input: RatingBandPuzzleSelectionInput
  ): RatingBandPuzzleSelection[] {
    const source = input.filter.source ?? "pack";
    if (source === "pack") {
      if (this.packSource.selectPuzzlesForRatingBands) {
        return this.packSource.selectPuzzlesForRatingBands(input);
      }
      const widestHalfWidth = Math.max(...input.halfWidths, 0);
      const candidates = this.packSource.selectPuzzles({
        ...input.filter,
        minRating: Math.max(0, input.ratingAnchor - widestHalfWidth),
        maxRating: input.ratingAnchor + widestHalfWidth,
        preferredRating: input.ratingAnchor,
        limit: Math.max(input.filter.limit * 50, 200)
      });
      return selectUniquePuzzlesForRatingBands(candidates, input);
    }

    const candidates = this.selectPuzzles({
      ...input.filter,
      limit: Math.max(input.filter.limit * 50, 200)
    });
    return selectUniquePuzzlesForRatingBands(candidates, input);
  }

  selectPuzzlesExcludingThemes(
    filter: PuzzleSelectionFilter,
    excludedThemes: readonly string[]
  ): Puzzle[] {
    const source = filter.source ?? "pack";
    if (source === "pack" && this.packSource.selectPuzzlesExcludingThemes) {
      return this.packSource.selectPuzzlesExcludingThemes(filter, excludedThemes);
    }
    const excluded = new Set(namedThemesForSelection(excludedThemes));
    if (excluded.size === 0) {
      return this.selectPuzzles(filter);
    }
    const candidates = this.selectPuzzles({
      ...filter,
      limit: Math.max(filter.limit * 20, 200)
    });
    return candidates
      .filter((puzzle) => !puzzle.themes.some((theme) => excluded.has(theme)))
      .slice(0, filter.limit);
  }

  private selectUserGamePuzzles(filter: PuzzleSelectionFilter): Puzzle[] {
    return selectUserGamePuzzlesFromStore(this.userPuzzleStore, filter);
  }
}

export function selectUserGamePuzzlesFromStore(
  userPuzzleStore: GameReviewStore,
  filter: PuzzleSelectionFilter
): Puzzle[] {
  const puzzleKind: "line" | "arrow_duel" =
    filter.mode === "arrow_duel" ? "arrow_duel" : "line";
  const storedPuzzles = userPuzzleStore.listUserPuzzles({
    puzzleKind,
    includeArchived: false,
    ...(filter.gameId === undefined ? {} : { gameId: filter.gameId }),
    ...(filter.timeClass === undefined ? {} : { timeClass: filter.timeClass }),
    ...(filter.themes === undefined ? {} : { themes: filter.themes })
  });
  const eligible = storedPuzzles
    .map(storedUserPuzzleToPuzzle)
    .filter((puzzle) => isEligibleUserGamePuzzleForMode(puzzle, filter.mode));

  const targetRating = filter.preferredRating ?? filter.rating;
  const ordered =
    targetRating === undefined
      ? eligible
      : [...eligible].sort(
          (left, right) =>
            Math.abs(left.rating - targetRating) - Math.abs(right.rating - targetRating) ||
            (right.userGameMeta?.caliberScore ?? 0) - (left.userGameMeta?.caliberScore ?? 0) ||
            left.id.localeCompare(right.id)
        );

  return selectUniquePuzzles({
    puzzles: ordered,
    mode: filter.mode,
    limit: filter.limit,
    allPuzzlesArrowDuelEligible: filter.mode === "arrow_duel",
    ...(filter.minRating === undefined ? {} : { minRating: filter.minRating }),
    ...(filter.maxRating === undefined ? {} : { maxRating: filter.maxRating }),
    ...(filter.themes === undefined ? {} : { themes: filter.themes }),
    ...(filter.includeIds === undefined ? {} : { includeIds: filter.includeIds }),
    ...(filter.excludeIds === undefined ? {} : { excludeIds: filter.excludeIds }),
    ...(filter.randomSeed === undefined ? {} : { randomSeed: filter.randomSeed })
  });
}

function hasUserGameScopedIds(includeIds: readonly string[] | undefined): boolean {
  return includeIds !== undefined && includeIds.some(isUserGamePuzzleId);
}
