import {
  buildServerEloPuzzleSelectionStrategies,
  isServerCompatibleArrowDuelPuzzle,
  normalizeThemeSelection,
  SERVER_PUZZLE_MAX_RATING,
  SERVER_PUZZLE_MIN_RATING
} from "../../core/src/index.ts";
import type { Puzzle } from "../../core/src/index.ts";
import type { PuzzleSelectionFilter } from "./query-types.ts";
import { selectUniquePuzzles } from "./puzzle-selection.ts";
import type { PuzzleSource } from "./puzzle-source.ts";
import type { SyncSqliteDatabase } from "./sync-sqlite-store.ts";

interface PuzzlePackRow {
  id: string;
  initial_fen: string;
  solution_moves: string;
  rating: number;
  stockfish_eval: number;
  stockfish_bestmove: string;
  stockfish_eval_after_first_move: number;
}

const MAX_SQL_ID_FILTER_VALUES = 900;

export interface SQLitePuzzlePackSourceOptions {
  candidateMultiplier?: number;
  candidateFloor?: number;
  allPuzzlesArrowDuelEligible?: boolean;
}

export class SQLitePuzzlePackSource implements PuzzleSource {
  private readonly db: SyncSqliteDatabase;
  private readonly candidateMultiplier: number;
  private readonly candidateFloor: number;
  private readonly allPuzzlesArrowDuelEligible: boolean;

  constructor(db: SyncSqliteDatabase, options: SQLitePuzzlePackSourceOptions = {}) {
    this.db = db;
    this.candidateMultiplier = options.candidateMultiplier ?? 50;
    this.candidateFloor = options.candidateFloor ?? 200;
    this.allPuzzlesArrowDuelEligible = options.allPuzzlesArrowDuelEligible ?? false;
  }

  countPuzzles(filter?: PuzzleSelectionFilter): number {
    if (filter !== undefined) {
      if ((filter.mode === "arrow_duel" && !this.allPuzzlesArrowDuelEligible) ||
          filter.includeIds !== undefined || filter.excludeIds !== undefined) {
        return this.selectPuzzles(filter).length;
      }
      const selectedThemes = normalizeThemeSelection(filter.themes);
      const minRating = filter.minRating ?? (filter.rating === undefined ? 0 : SERVER_PUZZLE_MIN_RATING);
      const maxRating = filter.maxRating ?? (filter.rating === undefined ? 4000 : SERVER_PUZZLE_MAX_RATING);
      if (selectedThemes.length === 0) {
        const row = this.db.prepare(
          `SELECT COUNT(*) AS count FROM (
             SELECT 1 FROM puzzles WHERE rating >= ? AND rating <= ? LIMIT ?
           )`
        ).get(minRating, maxRating, filter.limit) as { count: number };
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
          SELECT DISTINCT puzzle_id
          FROM puzzle_themes
          WHERE theme_id IN (${themeIds.map(() => "?").join(", ")})
            AND rating >= ?
            AND rating <= ?
          LIMIT ?
        )
      `).get(...themeIds, minRating, maxRating, filter.limit) as { count: number };
      return row.count;
    }
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM puzzles").get() as { count: number };
    return row.count;
  }

  getPuzzle(id: string): Puzzle | undefined {
    const row = this.db.prepare("SELECT * FROM puzzles WHERE id = ?").get(id) as PuzzlePackRow | undefined;
    return row ? this.puzzleFromRow(row) : undefined;
  }

  selectPuzzles(filter: PuzzleSelectionFilter): Puzzle[] {
    if (filter.rating !== undefined && filter.minRating === undefined && filter.maxRating === undefined) {
      return this.selectByRatingFallback(filter, filter.rating);
    }

    return selectUniquePuzzles({
      puzzles: this.queryCandidates(filter),
      mode: filter.mode,
      limit: filter.limit,
      ...(this.allPuzzlesArrowDuelEligible ? { allPuzzlesArrowDuelEligible: true } : {}),
      ...(filter.rating === undefined ? {} : { rating: filter.rating }),
      ...(filter.minRating === undefined ? {} : { minRating: filter.minRating }),
      ...(filter.maxRating === undefined ? {} : { maxRating: filter.maxRating }),
      ...(filter.themes === undefined ? {} : { themes: filter.themes }),
      ...(filter.includeIds === undefined ? {} : { includeIds: filter.includeIds }),
      ...(filter.excludeIds === undefined ? {} : { excludeIds: filter.excludeIds }),
      ...(filter.randomSeed === undefined ? {} : { randomSeed: filter.randomSeed })
    });
  }

  private selectByRatingFallback(filter: PuzzleSelectionFilter, rating: number): Puzzle[] {
    const selected: Puzzle[] = [];
    const excludedIds = new Set(filter.excludeIds ?? []);
    const strategies = buildServerEloPuzzleSelectionStrategies({
      rating,
      themes: normalizeThemeSelection(filter.themes)
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
        excludeIds: [...excludedIds],
        limit: filter.limit - selected.length
      };
      const additional = selectUniquePuzzles({
        puzzles: this.queryCandidates(candidateFilter),
        mode: filter.mode,
        limit: filter.limit - selected.length,
        ...(this.allPuzzlesArrowDuelEligible ? { allPuzzlesArrowDuelEligible: true } : {}),
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
    const selectedThemes = normalizeThemeSelection(filter.themes);
    const themeIds = selectedThemes
      .map((theme) => this.themeId(theme))
      .filter((themeId): themeId is number => themeId !== undefined);
    if (selectedThemes.length > 0 && themeIds.length === 0) {
      return [];
    }
    const hasInMemoryIdFilter =
      (filter.includeIds !== undefined && filter.includeIds.length > MAX_SQL_ID_FILTER_VALUES) ||
      (filter.excludeIds !== undefined && filter.excludeIds.length > MAX_SQL_ID_FILTER_VALUES);
    const limit = this.candidateLimit(
      filter.limit,
      filter.randomSeed !== undefined || hasInMemoryIdFilter
    );
    const rows = themeIds.length > 1
      ? this.mergeThemedCandidateRows(themeIds, filter, limit)
      : this.queryCandidateRows(filter, themeIds[0], limit);
    const puzzles = this.puzzlesFromRows(rows);
    if (filter.mode === "arrow_duel" && !this.allPuzzlesArrowDuelEligible) {
      return puzzles.filter(isServerCompatibleArrowDuelPuzzle);
    }
    return puzzles;
  }

  private mergeThemedCandidateRows(
    themeIds: readonly number[],
    filter: PuzzleSelectionFilter,
    limit: number
  ): PuzzlePackRow[] {
    const rowsById = new Map<string, PuzzlePackRow>();
    for (const themeId of themeIds) {
      for (const row of this.queryCandidateRows(filter, themeId, limit)) {
        rowsById.set(row.id, row);
      }
    }
    return [...rowsById.values()]
      .sort((left, right) => left.rating - right.rating || left.id.localeCompare(right.id))
      .slice(0, limit);
  }

  private queryCandidateRows(
    filter: PuzzleSelectionFilter,
    themeId: number | undefined,
    limit: number
  ): PuzzlePackRow[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    let from = "puzzles";
    let ratingColumn = "puzzles.rating";
    let idColumn = "puzzles.id";
    if (themeId !== undefined) {
      from = "puzzle_themes JOIN puzzles ON puzzles.id = puzzle_themes.puzzle_id";
      ratingColumn = "puzzle_themes.rating";
      idColumn = "puzzle_themes.puzzle_id";
      clauses.push("puzzle_themes.theme_id = ?");
      params.push(themeId);
    }
    clauses.push(`${ratingColumn} >= ?`, `${ratingColumn} <= ?`);
    params.push(filter.minRating ?? 0, filter.maxRating ?? 4000);
    if (filter.includeIds !== undefined && filter.includeIds.length > 0 && filter.includeIds.length <= MAX_SQL_ID_FILTER_VALUES) {
      clauses.push(`puzzles.id IN (${filter.includeIds.map(() => "?").join(", ")})`);
      params.push(...filter.includeIds);
    }
    if (filter.excludeIds !== undefined && filter.excludeIds.length > 0 && filter.excludeIds.length <= MAX_SQL_ID_FILTER_VALUES) {
      clauses.push(`puzzles.id NOT IN (${filter.excludeIds.map(() => "?").join(", ")})`);
      params.push(...filter.excludeIds);
    }

    const sql = `
      SELECT puzzles.*
      FROM ${from}
      WHERE ${clauses.join(" AND ")}
      ORDER BY ${ratingColumn} ASC, ${idColumn} ASC
      LIMIT ?
    `;
    params.push(limit);
    return this.db.prepare(sql).all(...params) as PuzzlePackRow[];
  }

  private puzzlesFromRows(rows: readonly PuzzlePackRow[]): Puzzle[] {
    const themesByPuzzle = this.themesForPuzzles(rows.map((row) => row.id));
    return rows.map((row) => this.puzzleFromRow(row, themesByPuzzle.get(row.id) ?? []));
  }

  private puzzleFromRow(row: PuzzlePackRow, themes = this.themesForPuzzle(row.id)): Puzzle {
    return {
      id: row.id,
      initialFen: expandFen(row.initial_fen),
      solutionMoves: splitWords(row.solution_moves),
      rating: row.rating,
      themes,
      source: "lichess",
      stockfishEval: row.stockfish_eval,
      stockfishBestMove: row.stockfish_bestmove,
      stockfishEvalAfterFirstMove: row.stockfish_eval_after_first_move
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

function expandFen(fen: string): string {
  const fields = fen.trim().split(/\s+/);
  return fields.length === 4 ? `${fields.join(" ")} 0 1` : fields.join(" ");
}

function splitWords(value: string): string[] {
  return value ? value.trim().split(/\s+/).filter(Boolean) : [];
}
