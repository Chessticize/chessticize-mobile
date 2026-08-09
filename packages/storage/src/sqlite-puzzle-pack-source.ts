import {
  buildServerEloPuzzleSelectionStrategies,
  hasArrowDuelPromotionCandidate,
  isArrowDuelDifficulty,
  isServerCompatibleArrowDuelPuzzle,
  namedThemesForSelection,
  restrictedArrowDuelDifficulties,
  SERVER_PUZZLE_MAX_RATING,
  SERVER_PUZZLE_MIN_RATING
} from "../../core/src/index.ts";
import type { Puzzle } from "../../core/src/index.ts";
import type { PuzzleSelectionFilter } from "./query-types.ts";
import {
  decodePuzzlePosition,
  decodeUciMove,
  decodeUciMoveLine,
  readPuzzlePackRowEncoding,
  type PuzzlePackBinaryValue,
  type PuzzlePackRowEncoding
} from "./puzzle-pack-binary-codec.ts";
import {
  selectUniquePuzzles,
  selectUniquePuzzlesForRatingBands
} from "./puzzle-selection.ts";
import type {
  PuzzleSource,
  RatingBandPuzzleSelection,
  RatingBandPuzzleSelectionInput
} from "./puzzle-source.ts";
import type { SyncSqliteDatabase } from "./sync-sqlite-store.ts";

interface PuzzlePackRow {
  id: string;
  initial_fen: string | PuzzlePackBinaryValue;
  solution_moves: string | PuzzlePackBinaryValue;
  rating: number;
  rating_deviation?: number;
  stockfish_eval: number;
  stockfish_bestmove: string | PuzzlePackBinaryValue;
  stockfish_eval_after_first_move: number;
  arrow_duel_difficulty?: number | null;
}

interface PuzzleCandidateRow {
  id: string;
  rating: number;
}

const MAX_SQL_ID_FILTER_VALUES = 900;

export type SQLitePuzzlePackArrowDuelEligibility = "validate" | "all" | "all_non_promotion";

export interface SQLitePuzzlePackSourceOptions {
  candidateMultiplier?: number;
  candidateFloor?: number;
  /** Controls repeated validation for a manifest-qualified pack. */
  arrowDuelEligibility?: SQLitePuzzlePackArrowDuelEligibility;
  /** Columns declared by the bundled manifest that this app build requires. */
  requiredPuzzleColumns?: readonly string[];
}

export class SQLitePuzzlePackCompatibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SQLitePuzzlePackCompatibilityError";
  }
}

export class SQLitePuzzlePackSource implements PuzzleSource {
  private readonly db: SyncSqliteDatabase;
  private readonly candidateMultiplier: number;
  private readonly candidateFloor: number;
  private readonly arrowDuelEligibility: SQLitePuzzlePackArrowDuelEligibility;
  private readonly rowEncoding: PuzzlePackRowEncoding;

  constructor(db: SyncSqliteDatabase, options: SQLitePuzzlePackSourceOptions = {}) {
    this.db = db;
    this.candidateMultiplier = options.candidateMultiplier ?? 50;
    this.candidateFloor = options.candidateFloor ?? 200;
    this.arrowDuelEligibility = options.arrowDuelEligibility ?? "validate";
    assertRequiredPuzzleColumns(db, options.requiredPuzzleColumns ?? []);
    this.rowEncoding = readPuzzlePackRowEncoding(db);
  }

  countPuzzles(filter?: PuzzleSelectionFilter): number {
    if (filter !== undefined) {
      const requiresArrowDuelSelection =
        filter.mode === "arrow_duel" && this.arrowDuelEligibility !== "all";
      if (requiresArrowDuelSelection || filter.includeIds !== undefined || filter.excludeIds !== undefined) {
        return this.selectPuzzles(filter).length;
      }
      const selectedThemes = namedThemesForSelection(filter.themes);
      const arrowDuelDifficulties = filter.mode === "arrow_duel"
        ? restrictedArrowDuelDifficulties(filter.arrowDuelDifficulties)
        : undefined;
      const minRating = filter.minRating ?? (filter.rating === undefined ? 0 : SERVER_PUZZLE_MIN_RATING);
      const maxRating = filter.maxRating ?? (filter.rating === undefined ? 4000 : SERVER_PUZZLE_MAX_RATING);
      if (selectedThemes.length === 0) {
        const row = this.db.prepare(
          `SELECT COUNT(*) AS count FROM (
             SELECT 1 FROM puzzles
             WHERE rating >= ? AND rating <= ?
             ${arrowDuelDifficulties === undefined
               ? ""
               : `AND arrow_duel_difficulty IN (${arrowDuelDifficulties.map(() => "?").join(", ")})`}
             ${positiveDifficultyIndexGuard("arrow_duel_difficulty", arrowDuelDifficulties)}
             LIMIT ?
           )`
        ).get(
          minRating,
          maxRating,
          ...(arrowDuelDifficulties ?? []),
          filter.limit
        ) as { count: number };
        return row.count;
      }
      const themeIds = selectedThemes
        .map((theme) => this.themeId(theme))
        .filter((themeId): themeId is number => themeId !== undefined);
      if (themeIds.length === 0) {
        return 0;
      }
      const row = this.db.prepare(`
        SELECT COUNT(*) AS count
        FROM (
          SELECT DISTINCT puzzle_themes.puzzle_id
          FROM puzzle_themes
          ${arrowDuelDifficulties === undefined
            ? ""
            : "JOIN puzzles ON puzzles.id = puzzle_themes.puzzle_id"}
          WHERE puzzle_themes.theme_id IN (${themeIds.map(() => "?").join(", ")})
            AND puzzle_themes.rating >= ?
            AND puzzle_themes.rating <= ?
            ${arrowDuelDifficulties === undefined
              ? ""
              : `AND puzzles.arrow_duel_difficulty IN (${arrowDuelDifficulties.map(() => "?").join(", ")})`}
            ${positiveDifficultyIndexGuard("puzzles.arrow_duel_difficulty", arrowDuelDifficulties)}
           LIMIT ?
        )
      `).get(
        ...themeIds,
        minRating,
        maxRating,
        ...(arrowDuelDifficulties ?? []),
        filter.limit
      ) as { count: number };
      return row.count;
    }
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM puzzles").get() as { count: number };
    return row.count;
  }

  getPuzzle(id: string): Puzzle | undefined {
    const row = this.db.prepare("SELECT * FROM puzzles WHERE id = ?").get(id) as PuzzlePackRow | undefined;
    return row ? this.puzzleFromRow(row) : undefined;
  }

  getPuzzles(ids: readonly string[]): Puzzle[] {
    const normalized = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    const puzzles: Puzzle[] = [];
    for (let offset = 0; offset < normalized.length; offset += MAX_SQL_ID_FILTER_VALUES) {
      const chunk = normalized.slice(offset, offset + MAX_SQL_ID_FILTER_VALUES);
      const rows = this.db.prepare(`
        SELECT *
        FROM puzzles
        WHERE id IN (${chunk.map(() => "?").join(", ")})
      `).all(...chunk) as PuzzlePackRow[];
      puzzles.push(...this.puzzlesFromRows(rows));
    }
    const byId = new Map(puzzles.map((puzzle) => [puzzle.id, puzzle]));
    return normalized.flatMap((id) => {
      const puzzle = byId.get(id);
      return puzzle ? [puzzle] : [];
    });
  }

  selectPuzzles(filter: PuzzleSelectionFilter): Puzzle[] {
    if (filter.rating !== undefined && filter.minRating === undefined && filter.maxRating === undefined) {
      return this.selectByRatingFallback(filter, filter.rating);
    }

    return selectUniquePuzzles({
      puzzles: this.queryCandidates(filter),
      mode: filter.mode,
      limit: filter.limit,
      ...(this.canSkipArrowDuelValidation ? { allPuzzlesArrowDuelEligible: true } : {}),
      ...(filter.rating === undefined ? {} : { rating: filter.rating }),
      ...(filter.minRating === undefined ? {} : { minRating: filter.minRating }),
      ...(filter.maxRating === undefined ? {} : { maxRating: filter.maxRating }),
      ...(filter.themes === undefined ? {} : { themes: filter.themes }),
      ...(filter.arrowDuelDifficulties === undefined
        ? {}
        : { arrowDuelDifficulties: filter.arrowDuelDifficulties }),
      ...(filter.includeIds === undefined ? {} : { includeIds: filter.includeIds }),
      ...(filter.excludeIds === undefined ? {} : { excludeIds: filter.excludeIds }),
      ...(filter.randomSeed === undefined ? {} : { randomSeed: filter.randomSeed })
    });
  }

  selectPuzzlesForRatingBands(
    input: RatingBandPuzzleSelectionInput
  ): RatingBandPuzzleSelection[] {
    const widestHalfWidth = Math.max(...input.halfWidths, 0);
    const candidateLimit = this.candidateLimit(input.filter.limit, true);
    const { randomSeed: _randomSeed, ...unseededFilter } =
      input.filter;
    const filter: PuzzleSelectionFilter = {
      ...unseededFilter,
      minRating: Math.max(0, input.ratingAnchor - widestHalfWidth),
      maxRating: input.ratingAnchor + widestHalfWidth,
      preferredRating: input.ratingAnchor,
      limit: candidateLimit
    };
    const candidates =
      input.excludedThemes === undefined ||
      input.excludedThemes.length === 0
        ? this.selectPuzzles(filter)
        : this.selectPuzzlesExcludingThemes(
            filter,
            input.excludedThemes
          );
    return selectUniquePuzzlesForRatingBands(candidates, input);
  }

  selectPuzzlesExcludingThemes(
    filter: PuzzleSelectionFilter,
    excludedThemes: readonly string[]
  ): Puzzle[] {
    const excludedThemeIds = namedThemesForSelection(excludedThemes)
      .map((theme) => this.themeId(theme))
      .filter((themeId): themeId is number => themeId !== undefined);
    if (excludedThemeIds.length === 0) {
      return this.selectPuzzles(filter);
    }
    const excludedIds = new Set(filter.excludeIds ?? []);
    const arrowDuelDifficulties = filter.mode === "arrow_duel"
      ? restrictedArrowDuelDifficulties(filter.arrowDuelDifficulties)
      : undefined;
    const shouldFilterPromotionCandidates =
      filter.mode === "arrow_duel"
      && this.arrowDuelEligibility === "all_non_promotion";
    const candidateLimit = this.candidateLimit(
      filter.limit,
      filter.randomSeed !== undefined || shouldFilterPromotionCandidates
    );
    if (
      filter.includeIds !== undefined &&
      filter.includeIds.length > MAX_SQL_ID_FILTER_VALUES
    ) {
      const excludedThemeSet = new Set(namedThemesForSelection(excludedThemes));
      return selectUniquePuzzles({
        puzzles: this.filterArrowDuelCandidates(
          this.getPuzzles(filter.includeIds)
            .filter((puzzle) =>
              !puzzle.themes.some((theme) => excludedThemeSet.has(theme))
            ),
          filter.mode
        ),
        mode: filter.mode,
        limit: filter.limit,
        ...(this.canSkipArrowDuelValidation ? { allPuzzlesArrowDuelEligible: true } : {}),
        ...(filter.rating === undefined ? {} : { rating: filter.rating }),
        ...(filter.minRating === undefined ? {} : { minRating: filter.minRating }),
        ...(filter.maxRating === undefined ? {} : { maxRating: filter.maxRating }),
        ...(filter.arrowDuelDifficulties === undefined
          ? {}
          : { arrowDuelDifficulties: filter.arrowDuelDifficulties }),
        includeIds: filter.includeIds,
        excludeIds: [...excludedIds],
        ...(filter.randomSeed === undefined ? {} : { randomSeed: filter.randomSeed })
      });
    }
    const idClauses: string[] = [];
    const idParams: string[] = [];
    if (
      filter.includeIds !== undefined &&
      filter.includeIds.length > 0 &&
      filter.includeIds.length <= MAX_SQL_ID_FILTER_VALUES
    ) {
      idClauses.push(`puzzles.id IN (${filter.includeIds.map(() => "?").join(", ")})`);
      idParams.push(...filter.includeIds);
    }
    if (
      filter.excludeIds !== undefined &&
      filter.excludeIds.length > 0 &&
      filter.excludeIds.length <= MAX_SQL_ID_FILTER_VALUES
    ) {
      idClauses.push(`puzzles.id NOT IN (${filter.excludeIds.map(() => "?").join(", ")})`);
      idParams.push(...filter.excludeIds);
    }
    const selectedFromRows = (rows: readonly PuzzlePackRow[]): Puzzle[] =>
      selectUniquePuzzles({
        puzzles: this.filterArrowDuelCandidates(
          this.puzzlesFromRows(rows),
          filter.mode
        ),
        mode: filter.mode,
        limit: filter.limit,
        ...(this.canSkipArrowDuelValidation ? { allPuzzlesArrowDuelEligible: true } : {}),
        ...(filter.rating === undefined ? {} : { rating: filter.rating }),
        ...(filter.minRating === undefined ? {} : { minRating: filter.minRating }),
        ...(filter.maxRating === undefined ? {} : { maxRating: filter.maxRating }),
        ...(filter.arrowDuelDifficulties === undefined
          ? {}
          : { arrowDuelDifficulties: filter.arrowDuelDifficulties }),
        ...(filter.includeIds === undefined ? {} : { includeIds: filter.includeIds }),
        excludeIds: [...excludedIds],
        ...(filter.randomSeed === undefined ? {} : { randomSeed: filter.randomSeed })
      });
    if (filter.preferredRating !== undefined) {
      const preferredRating = filter.preferredRating;
      const sideLimit = candidateLimit +
        (
          filter.excludeIds !== undefined &&
          filter.excludeIds.length > MAX_SQL_ID_FILTER_VALUES
            ? excludedIds.size
            : 0
        );
      const rowsOnSide = (
        operator: "<=" | ">",
        direction: "ASC" | "DESC"
      ): PuzzlePackRow[] => this.db.prepare(`
        SELECT puzzles.*
        FROM puzzles
        WHERE puzzles.rating >= ?
          AND puzzles.rating <= ?
          ${arrowDuelDifficulties === undefined
            ? ""
            : `AND puzzles.arrow_duel_difficulty IN (${arrowDuelDifficulties.map(() => "?").join(", ")})`}
          ${positiveDifficultyIndexGuard("puzzles.arrow_duel_difficulty", arrowDuelDifficulties)}
          ${idClauses.map((clause) => `AND ${clause}`).join("\n          ")}
          AND NOT EXISTS (
            SELECT 1
            FROM puzzle_themes
            WHERE puzzle_themes.puzzle_id = puzzles.id
              AND puzzle_themes.theme_id IN (${excludedThemeIds.map(() => "?").join(", ")})
          )
          AND puzzles.rating ${operator} ?
        ORDER BY puzzles.rating ${direction}, puzzles.id ASC
        LIMIT ?
      `).all(
        filter.minRating ?? 0,
        filter.maxRating ?? 4000,
        ...(arrowDuelDifficulties ?? []),
        ...idParams,
        ...excludedThemeIds,
        preferredRating,
        sideLimit
      ) as PuzzlePackRow[];
      const rows = [
        ...rowsOnSide("<=", "DESC"),
        ...rowsOnSide(">", "ASC")
      ]
        .sort((left, right) =>
          Math.abs(left.rating - preferredRating) -
            Math.abs(right.rating - preferredRating) ||
          left.id.localeCompare(right.id)
        )
        .filter((row) => !excludedIds.has(row.id))
        .slice(0, candidateLimit);
      return selectedFromRows(rows);
    }
    const queryPage = this.db.prepare(`
        SELECT puzzles.*
        FROM puzzles
        WHERE puzzles.rating >= ?
          AND puzzles.rating <= ?
          ${arrowDuelDifficulties === undefined
            ? ""
            : `AND puzzles.arrow_duel_difficulty IN (${arrowDuelDifficulties.map(() => "?").join(", ")})`}
          ${positiveDifficultyIndexGuard("puzzles.arrow_duel_difficulty", arrowDuelDifficulties)}
          ${idClauses.map((clause) => `AND ${clause}`).join("\n          ")}
          AND NOT EXISTS (
            SELECT 1
            FROM puzzle_themes
            WHERE puzzle_themes.puzzle_id = puzzles.id
              AND puzzle_themes.theme_id IN (${excludedThemeIds.map(() => "?").join(", ")})
          )
        ORDER BY puzzles.rating, puzzles.id
        LIMIT ? OFFSET ?
      `);
    const rows: PuzzlePackRow[] = [];
    const pageSize = candidateLimit;
    const maximumRowsToScan = candidateLimit +
      (filter.excludeIds !== undefined &&
        filter.excludeIds.length > MAX_SQL_ID_FILTER_VALUES
        ? excludedIds.size
        : 0);
    let offset = 0;
    while (rows.length < candidateLimit && offset < maximumRowsToScan) {
      const page = queryPage.all(
        filter.minRating ?? 0,
        filter.maxRating ?? 4000,
        ...(arrowDuelDifficulties ?? []),
        ...idParams,
        ...excludedThemeIds,
        pageSize,
        offset
      ) as PuzzlePackRow[];
      rows.push(...page.filter((row) => !excludedIds.has(row.id)));
      offset += page.length;
      if (page.length < pageSize) {
        break;
      }
    }
    return selectedFromRows(rows.slice(0, candidateLimit));
  }

  private selectByRatingFallback(filter: PuzzleSelectionFilter, rating: number): Puzzle[] {
    const selected: Puzzle[] = [];
    const excludedIds = new Set(filter.excludeIds ?? []);
    const strategies = buildServerEloPuzzleSelectionStrategies({
      rating,
      themes: namedThemesForSelection(filter.themes)
    });

    for (const strategy of strategies) {
      if (selected.length >= filter.limit) {
        break;
      }
      const candidateFilter: PuzzleSelectionFilter = {
        ...filter,
        minRating: strategy.minRating,
        maxRating: strategy.maxRating,
        themes: strategy.themes,
        ...(filter.arrowDuelDifficulties === undefined
          ? {}
          : { arrowDuelDifficulties: filter.arrowDuelDifficulties }),
        excludeIds: [...excludedIds],
        limit: filter.limit - selected.length
      };
      const additional = selectUniquePuzzles({
        puzzles: this.queryCandidates(candidateFilter),
        mode: filter.mode,
        limit: filter.limit - selected.length,
        ...(this.canSkipArrowDuelValidation ? { allPuzzlesArrowDuelEligible: true } : {}),
        minRating: strategy.minRating,
        maxRating: strategy.maxRating,
        themes: strategy.themes,
        ...(filter.includeIds === undefined ? {} : { includeIds: filter.includeIds }),
        ...(filter.randomSeed === undefined
          ? {}
          : { randomSeed: `${filter.randomSeed}:${strategy.minRating}:${strategy.maxRating}:${strategy.themes.join(",")}` })
      });
      selected.push(...additional);
      for (const puzzle of additional) {
        excludedIds.add(puzzle.id);
      }
    }

    return selected;
  }

  private queryCandidates(filter: PuzzleSelectionFilter): Puzzle[] {
    if (
      filter.includeIds !== undefined &&
      filter.includeIds.length > MAX_SQL_ID_FILTER_VALUES
    ) {
      return this.filterArrowDuelCandidates(
        this.getPuzzles(filter.includeIds),
        filter.mode
      );
    }
    const selectedThemes = namedThemesForSelection(filter.themes);
    const themeIds = selectedThemes
      .map((theme) => this.themeId(theme))
      .filter((themeId): themeId is number => themeId !== undefined);
    if (selectedThemes.length > 0 && themeIds.length === 0) {
      return [];
    }
    const hasInMemoryIdFilter =
      (filter.includeIds !== undefined && filter.includeIds.length > MAX_SQL_ID_FILTER_VALUES) ||
      (filter.excludeIds !== undefined && filter.excludeIds.length > MAX_SQL_ID_FILTER_VALUES);
    const shouldFilterPromotionCandidates =
      filter.mode === "arrow_duel" && this.arrowDuelEligibility === "all_non_promotion";
    const limit = this.candidateLimit(
      filter.limit,
      filter.randomSeed !== undefined || hasInMemoryIdFilter || shouldFilterPromotionCandidates
    );
    const rows = themeIds.length > 1
      ? this.mergeThemedCandidateRows(themeIds, filter, limit)
      : this.queryCandidateRows(filter, themeIds[0], limit);
    return this.filterArrowDuelCandidates(
      this.puzzlesFromRows(rows),
      filter.mode
    );
  }

  private get canSkipArrowDuelValidation(): boolean {
    return this.arrowDuelEligibility !== "validate";
  }

  private filterArrowDuelCandidates(
    puzzles: readonly Puzzle[],
    mode: PuzzleSelectionFilter["mode"]
  ): Puzzle[] {
    if (mode !== "arrow_duel" || this.arrowDuelEligibility === "all") {
      return [...puzzles];
    }
    if (this.arrowDuelEligibility === "all_non_promotion") {
      return puzzles.filter((puzzle) => !hasArrowDuelPromotionCandidate(puzzle));
    }
    return puzzles.filter(isServerCompatibleArrowDuelPuzzle);
  }

  private mergeThemedCandidateRows(
    themeIds: readonly number[],
    filter: PuzzleSelectionFilter,
    limit: number
  ): PuzzlePackRow[] {
    const rowsByTheme = themeIds.map((themeId) =>
      this.queryCandidateRows(filter, themeId, limit)
    );
    const selected: PuzzlePackRow[] = [];
    const seenIds = new Set<string>();
    const maximumRows = Math.max(0, ...rowsByTheme.map((rows) => rows.length));

    for (let rowIndex = 0; rowIndex < maximumRows && selected.length < limit; rowIndex += 1) {
      for (const rows of rowsByTheme) {
        const row = rows[rowIndex];
        if (!row || seenIds.has(row.id)) {
          continue;
        }
        seenIds.add(row.id);
        selected.push(row);
        if (selected.length >= limit) {
          break;
        }
      }
    }
    return selected;
  }

  private queryCandidateRows(
    filter: PuzzleSelectionFilter,
    themeId: number | undefined,
    limit: number
  ): PuzzlePackRow[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    let from = "puzzles";
    let selectedColumns = "puzzles.*";
    let ratingColumn = "puzzles.rating";
    let idColumn = "puzzles.id";
    const arrowDuelDifficulties = filter.mode === "arrow_duel"
      ? restrictedArrowDuelDifficulties(filter.arrowDuelDifficulties)
      : undefined;
    if (themeId !== undefined) {
      from = arrowDuelDifficulties === undefined
        ? "puzzle_themes"
        : "puzzle_themes JOIN puzzles ON puzzles.id = puzzle_themes.puzzle_id";
      selectedColumns =
        "puzzle_themes.puzzle_id AS id, puzzle_themes.rating AS rating";
      ratingColumn = "puzzle_themes.rating";
      idColumn = "puzzle_themes.puzzle_id";
      clauses.push("puzzle_themes.theme_id = ?");
      params.push(themeId);
    }
    clauses.push(`${ratingColumn} >= ?`, `${ratingColumn} <= ?`);
    params.push(filter.minRating ?? 0, filter.maxRating ?? 4000);
    if (arrowDuelDifficulties !== undefined) {
      clauses.push(
        `puzzles.arrow_duel_difficulty IN (${arrowDuelDifficulties.map(() => "?").join(", ")})`
      );
      params.push(...arrowDuelDifficulties);
      const indexGuard = positiveDifficultyIndexPredicate(
        "puzzles.arrow_duel_difficulty",
        arrowDuelDifficulties
      );
      if (indexGuard !== undefined) {
        clauses.push(indexGuard);
      }
    }
    if (filter.includeIds !== undefined && filter.includeIds.length > 0 && filter.includeIds.length <= MAX_SQL_ID_FILTER_VALUES) {
      clauses.push(`${idColumn} IN (${filter.includeIds.map(() => "?").join(", ")})`);
      params.push(...filter.includeIds);
    }
    if (filter.excludeIds !== undefined && filter.excludeIds.length > 0 && filter.excludeIds.length <= MAX_SQL_ID_FILTER_VALUES) {
      clauses.push(`${idColumn} NOT IN (${filter.excludeIds.map(() => "?").join(", ")})`);
      params.push(...filter.excludeIds);
    }

    const rowsAtOffset = (rowLimit: number, offset?: number): PuzzleCandidateRow[] => {
      const offsetClause = offset === undefined ? "" : " OFFSET ?";
      const sql = `
        SELECT ${selectedColumns}
        FROM ${from}
        WHERE ${clauses.join(" AND ")}
        ORDER BY ${ratingColumn} ASC, ${idColumn} ASC
        LIMIT ?${offsetClause}
      `;
      return this.db.prepare(sql).all(
        ...params,
        rowLimit,
        ...(offset === undefined ? [] : [offset])
      ) as PuzzleCandidateRow[];
    };
    const hydrateCandidateRows = (rows: PuzzleCandidateRow[]): PuzzlePackRow[] =>
      themeId === undefined ? rows as PuzzlePackRow[] : this.puzzleRowsForIds(rows.map((row) => row.id));
    const inMemoryExcludedIds =
      filter.excludeIds !== undefined &&
      filter.excludeIds.length > MAX_SQL_ID_FILTER_VALUES
        ? new Set(filter.excludeIds)
        : undefined;
    if (filter.preferredRating !== undefined) {
      const preferredRating = filter.preferredRating;
      const sideLimit = limit + (inMemoryExcludedIds?.size ?? 0);
      const rowsOnSide = (
        operator: "<=" | ">",
        direction: "ASC" | "DESC"
      ): PuzzleCandidateRow[] => this.db.prepare(`
        SELECT ${selectedColumns}
        FROM ${from}
        WHERE ${clauses.join(" AND ")}
          AND ${ratingColumn} ${operator} ?
        ORDER BY ${ratingColumn} ${direction}, ${idColumn} ASC
        LIMIT ?
      `).all(
        ...params,
        preferredRating,
        sideLimit
      ) as PuzzleCandidateRow[];
      const rows = [
        ...rowsOnSide("<=", "DESC"),
        ...rowsOnSide(">", "ASC")
      ]
        .sort((left, right) =>
          Math.abs(left.rating - preferredRating) -
            Math.abs(right.rating - preferredRating) ||
          left.id.localeCompare(right.id)
        )
        .filter((row) => !inMemoryExcludedIds?.has(row.id))
        .slice(0, limit);
      return hydrateCandidateRows(rows);
    }
    if (inMemoryExcludedIds !== undefined && filter.randomSeed === undefined) {
      const rows: PuzzleCandidateRow[] = [];
      const pageSize = Math.max(limit, this.candidateFloor);
      const maximumRowsToScan = limit + inMemoryExcludedIds.size;
      let offset = 0;
      while (rows.length < limit && offset < maximumRowsToScan) {
        const page = rowsAtOffset(
          Math.min(pageSize, maximumRowsToScan - offset),
          offset
        );
        rows.push(...page.filter((row) => !inMemoryExcludedIds.has(row.id)));
        offset += page.length;
        if (page.length < pageSize) {
          break;
        }
      }
      return hydrateCandidateRows(rows.slice(0, limit));
    }

    if (filter.randomSeed === undefined) {
      return hydrateCandidateRows(rowsAtOffset(limit));
    }

    const countRow = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM ${from}
      WHERE ${clauses.join(" AND ")}
    `).get(...params) as { count: number };
    if (countRow.count <= limit) {
      return hydrateCandidateRows(rowsAtOffset(limit));
    }

    const offset = seededOffset(
      filter.randomSeed,
      `${themeId ?? "all"}:${filter.minRating ?? 0}:${filter.maxRating ?? 4000}`,
      countRow.count
    );
    if (inMemoryExcludedIds !== undefined) {
      const rows: PuzzleCandidateRow[] = [];
      const pageSize = Math.max(limit, this.candidateFloor);
      let scanned = 0;
      while (rows.length < limit && scanned < countRow.count) {
        const pageOffset = (offset + scanned) % countRow.count;
        const rowsBeforeWrap = countRow.count - pageOffset;
        const rowLimit = Math.min(
          pageSize,
          rowsBeforeWrap,
          countRow.count - scanned
        );
        const page = rowsAtOffset(rowLimit, pageOffset);
        rows.push(...page.filter((row) => !inMemoryExcludedIds.has(row.id)));
        scanned += page.length;
        if (page.length === 0) {
          break;
        }
      }
      return hydrateCandidateRows(rows.slice(0, limit));
    }
    const rows = rowsAtOffset(limit, offset);
    if (rows.length < limit) {
      rows.push(...rowsAtOffset(limit - rows.length, 0));
    }
    return hydrateCandidateRows(rows);
  }

  private puzzleRowsForIds(ids: readonly string[]): PuzzlePackRow[] {
    const rowsById = new Map<string, PuzzlePackRow>();
    for (let offset = 0; offset < ids.length; offset += MAX_SQL_ID_FILTER_VALUES) {
      const chunk = ids.slice(offset, offset + MAX_SQL_ID_FILTER_VALUES);
      if (chunk.length === 0) {
        continue;
      }
      const rows = this.db.prepare(`
        SELECT *
        FROM puzzles
        WHERE id IN (${chunk.map(() => "?").join(", ")})
      `).all(...chunk) as PuzzlePackRow[];
      for (const row of rows) {
        rowsById.set(row.id, row);
      }
    }
    return ids
      .map((id) => rowsById.get(id))
      .filter((row): row is PuzzlePackRow => row !== undefined);
  }

  private puzzlesFromRows(rows: readonly PuzzlePackRow[]): Puzzle[] {
    const themesByPuzzle = this.themesForPuzzles(rows.map((row) => row.id));
    return rows.map((row) => this.puzzleFromRow(row, themesByPuzzle.get(row.id) ?? []));
  }

  private puzzleFromRow(row: PuzzlePackRow, themes = this.themesForPuzzle(row.id)): Puzzle {
    const binary = this.rowEncoding === "binary-v1";
    return {
      id: row.id,
      initialFen: binary
        ? expandFen(decodePuzzlePosition(binaryField(row.initial_fen, "initial_fen")))
        : expandFen(textField(row.initial_fen, "initial_fen")),
      solutionMoves: binary
        ? decodeUciMoveLine(binaryField(row.solution_moves, "solution_moves"))
        : splitWords(textField(row.solution_moves, "solution_moves")),
      rating: row.rating,
      ...(row.rating_deviation === undefined
        ? {}
        : { ratingDeviation: row.rating_deviation }),
      themes,
      source: "lichess",
      stockfishEval: row.stockfish_eval,
      stockfishBestMove: binary
        ? decodeUciMove(binaryField(row.stockfish_bestmove, "stockfish_bestmove"))
        : textField(row.stockfish_bestmove, "stockfish_bestmove"),
      stockfishEvalAfterFirstMove: row.stockfish_eval_after_first_move,
      ...arrowDuelDifficultyFromRow(row)
    };
  }

  private themesForPuzzle(id: string): string[] {
    return (this.db.prepare(`
      SELECT themes.name
      FROM puzzle_themes
      JOIN themes ON themes.id = puzzle_themes.theme_id
      WHERE puzzle_themes.puzzle_id = ?
      ORDER BY themes.name ASC
    `).all(id) as Array<{ name: string }>).map((row) => row.name);
  }

  private themesForPuzzles(ids: readonly string[]): Map<string, string[]> {
    const themesByPuzzle = new Map<string, string[]>();
    for (let offset = 0; offset < ids.length; offset += MAX_SQL_ID_FILTER_VALUES) {
      const chunk = ids.slice(offset, offset + MAX_SQL_ID_FILTER_VALUES);
      if (chunk.length === 0) {
        continue;
      }
      const rows = this.db.prepare(`
        SELECT puzzle_themes.puzzle_id, themes.name
        FROM puzzle_themes
        JOIN themes ON themes.id = puzzle_themes.theme_id
        WHERE puzzle_themes.puzzle_id IN (${chunk.map(() => "?").join(", ")})
        ORDER BY puzzle_themes.puzzle_id ASC, themes.name ASC
      `).all(...chunk) as Array<{ puzzle_id: string; name: string }>;
      for (const row of rows) {
        const themes = themesByPuzzle.get(row.puzzle_id) ?? [];
        themes.push(row.name);
        themesByPuzzle.set(row.puzzle_id, themes);
      }
    }
    return themesByPuzzle;
  }

  private themeId(theme: string): number | undefined {
    const row = this.db.prepare("SELECT id FROM themes WHERE name = ?").get(theme) as { id: number } | undefined;
    return row?.id;
  }

  private candidateLimit(limit: number, randomized: boolean): number {
    if (!randomized) {
      return limit;
    }
    return Math.max(limit * this.candidateMultiplier, limit + this.candidateFloor);
  }
}

function assertRequiredPuzzleColumns(
  db: SyncSqliteDatabase,
  requiredColumns: readonly string[]
): void {
  if (requiredColumns.length === 0) {
    return;
  }
  const availableColumns = new Set(
    (db.prepare("PRAGMA table_info(puzzles)").all() as Array<{ name?: unknown }>)
      .flatMap((row) => typeof row.name === "string" ? [row.name] : [])
  );
  const missingColumns = [...new Set(requiredColumns)]
    .filter((column) => !availableColumns.has(column));
  if (missingColumns.length > 0) {
    throw new SQLitePuzzlePackCompatibilityError(
      `Puzzle pack is missing required puzzles columns: ${missingColumns.join(", ")}`
    );
  }
}

function arrowDuelDifficultyFromRow(
  row: PuzzlePackRow
): { arrowDuelDifficulty?: NonNullable<Puzzle["arrowDuelDifficulty"]> } {
  if (row.arrow_duel_difficulty === undefined || row.arrow_duel_difficulty === null) {
    return {};
  }
  if (!isArrowDuelDifficulty(row.arrow_duel_difficulty)) {
    throw new Error(
      `Invalid Arrow Duel difficulty ${row.arrow_duel_difficulty} for puzzle ${row.id}`
    );
  }
  return { arrowDuelDifficulty: row.arrow_duel_difficulty };
}

function positiveDifficultyIndexGuard(
  column: string,
  difficulties: readonly number[] | undefined
): string {
  const predicate = positiveDifficultyIndexPredicate(column, difficulties);
  return predicate === undefined ? "" : `AND ${predicate}`;
}

function positiveDifficultyIndexPredicate(
  column: string,
  difficulties: readonly number[] | undefined
): string | undefined {
  return difficulties !== undefined && !difficulties.includes(0)
    ? `${column} BETWEEN 1 AND 4`
    : undefined;
}

function binaryField(
  value: string | PuzzlePackBinaryValue,
  field: string
): PuzzlePackBinaryValue {
  if (typeof value === "string") {
    throw new Error(`Binary puzzle pack field ${field} is not a BLOB`);
  }
  return value;
}

function textField(
  value: string | PuzzlePackBinaryValue,
  field: string
): string {
  if (typeof value !== "string") {
    throw new Error(`Legacy puzzle pack field ${field} is not TEXT`);
  }
  return value;
}

function seededOffset(seedInput: string | number, scope: string, candidateCount: number): number {
  let hash = 2166136261;
  const input = `${seedInput}:${scope}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % candidateCount;
}

function expandFen(fen: string): string {
  const fields = fen.trim().split(/\s+/);
  return fields.length === 4 ? `${fields.join(" ")} 0 1` : fields.join(" ");
}

function splitWords(value: string): string[] {
  return value ? value.trim().split(/\s+/).filter(Boolean) : [];
}
