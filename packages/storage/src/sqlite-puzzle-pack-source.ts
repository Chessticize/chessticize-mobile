import {
  buildServerEloPuzzleSelectionStrategies,
  isServerCompatibleArrowDuelPuzzle
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
}

export class SQLitePuzzlePackSource implements PuzzleSource {
  private readonly db: SyncSqliteDatabase;
  private readonly candidateMultiplier: number;
  private readonly candidateFloor: number;

  constructor(db: SyncSqliteDatabase, options: SQLitePuzzlePackSourceOptions = {}) {
    this.db = db;
    this.candidateMultiplier = options.candidateMultiplier ?? 50;
    this.candidateFloor = options.candidateFloor ?? 200;
  }

  countPuzzles(): number {
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
      ...(filter.rating === undefined ? {} : { rating: filter.rating }),
      ...(filter.minRating === undefined ? {} : { minRating: filter.minRating }),
      ...(filter.maxRating === undefined ? {} : { maxRating: filter.maxRating }),
      ...(filter.theme === undefined ? {} : { theme: filter.theme }),
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
      themes: filter.theme === undefined ? [] : [filter.theme]
    });

    for (const strategy of strategies) {
      if (selected.length >= filter.limit) {
        break;
      }
      const candidateFilter: PuzzleSelectionFilter = {
        ...filter,
          minRating: strategy.minRating,
          maxRating: strategy.maxRating,
          excludeIds: [...excludedIds],
          limit: filter.limit - selected.length
      };
      const strategyTheme = strategy.themes[0];
      if (strategyTheme !== undefined) {
        candidateFilter.theme = strategyTheme;
      } else {
        delete candidateFilter.theme;
      }
      const additional = selectUniquePuzzles({
        puzzles: this.queryCandidates(candidateFilter),
        mode: filter.mode,
        limit: filter.limit - selected.length,
        minRating: strategy.minRating,
        maxRating: strategy.maxRating,
        ...(strategy.themes.length === 0 ? {} : { theme: strategy.themes[0] }),
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
    const clauses = ["puzzles.rating >= ?", "puzzles.rating <= ?"];
    const params: Array<string | number> = [filter.minRating ?? 0, filter.maxRating ?? 4000];
    let from = "puzzles";
    if (filter.theme !== undefined) {
      const themeId = this.themeId(filter.theme);
      if (themeId === undefined) {
        return [];
      }
      from = "puzzle_themes JOIN puzzles ON puzzles.id = puzzle_themes.puzzle_id";
      clauses.unshift("puzzle_themes.theme_id = ?");
      params.unshift(themeId);
    }
    const hasInMemoryIdFilter =
      (filter.includeIds !== undefined && filter.includeIds.length > MAX_SQL_ID_FILTER_VALUES) ||
      (filter.excludeIds !== undefined && filter.excludeIds.length > MAX_SQL_ID_FILTER_VALUES);
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
      ORDER BY puzzles.rating ASC, puzzles.id ASC
      LIMIT ?
    `;
    params.push(this.candidateLimit(filter.limit, filter.randomSeed !== undefined || hasInMemoryIdFilter));
    const rows = this.db.prepare(sql).all(...params) as PuzzlePackRow[];
    const puzzles = rows.map((row) => this.puzzleFromRow(row));
    if (filter.mode === "arrow_duel") {
      return puzzles.filter(isServerCompatibleArrowDuelPuzzle);
    }
    return puzzles;
  }

  private puzzleFromRow(row: PuzzlePackRow): Puzzle {
    return {
      id: row.id,
      initialFen: expandFen(row.initial_fen),
      solutionMoves: splitWords(row.solution_moves),
      rating: row.rating,
      themes: this.themesForPuzzle(row.id),
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
