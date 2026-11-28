import {
  GameImportError,
  type GameTimeClass,
  type SupportedLocale
} from "../../../../../packages/core/src/index.ts";
import type {
  GameAnalysisStatus,
  LinkedGameAccountPlatform,
  StoredImportedGame
} from "../../../../../packages/storage/src/game-review-store.ts";
import {
  formatLocalDateLabelForLocale,
  translate
} from "../../i18n/index.ts";

export type GamesStatusFilter = "all" | "unanalyzed" | "analyzed";
export type GamesTimeClassFilter = "all" | "bullet" | "blitz" | "rapid" | "classical";
export type GameOutcome = "win" | "loss" | "draw";

export const GAMES_STATUS_FILTERS: readonly GamesStatusFilter[] = [
  "all",
  "unanalyzed",
  "analyzed"
];

export const GAMES_TIME_CLASS_FILTERS: readonly GamesTimeClassFilter[] = [
  "all",
  "bullet",
  "blitz",
  "rapid",
  "classical"
];

export function gameOutcomeForUser(game: Pick<StoredImportedGame, "userColor" | "winner">): GameOutcome {
  if (game.winner === "none") {
    return "draw";
  }
  return game.winner === game.userColor ? "win" : "loss";
}

export function gameOpponentForUser(game: Pick<StoredImportedGame, "userColor" | "white" | "black">): {
  username: string;
  rating?: number;
} {
  const opponent = game.userColor === "w" ? game.black : game.white;
  return {
    username: opponent.username,
    ...(opponent.rating === undefined ? {} : { rating: opponent.rating })
  };
}

export function gameUserAccuracy(
  game: Pick<StoredImportedGame, "userColor" | "whiteAccuracy" | "blackAccuracy">
): number | undefined {
  const value = game.userColor === "w" ? game.whiteAccuracy : game.blackAccuracy;
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : undefined;
}

export function matchesGamesTimeClassFilter(
  timeClass: GameTimeClass | string,
  filter: GamesTimeClassFilter
): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "bullet") {
    return timeClass === "bullet" || timeClass === "ultraBullet";
  }
  if (filter === "classical") {
    return timeClass === "classical" || timeClass === "daily" || timeClass === "correspondence";
  }
  return timeClass === filter;
}

export function matchesGamesStatusFilter(
  status: GameAnalysisStatus,
  filter: GamesStatusFilter
): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "analyzed") {
    return status === "complete" || status === "pass1_done";
  }
  return status === "none" || status === "partial";
}

export function gameTimeClassLabel(
  timeClass: GameTimeClass | string,
  locale: SupportedLocale
): string {
  switch (timeClass) {
    case "ultraBullet":
    case "bullet":
      return translate(locale, "games.timeClass.bullet");
    case "blitz":
      return translate(locale, "games.timeClass.blitz");
    case "rapid":
      return translate(locale, "games.timeClass.rapid");
    case "classical":
      return translate(locale, "games.timeClass.classical");
    case "daily":
    case "correspondence":
      return translate(locale, "games.timeClass.daily");
    default:
      return translate(locale, "games.timeClass.other");
  }
}

export function gamePlatformLabel(
  platform: LinkedGameAccountPlatform,
  locale: SupportedLocale
): string {
  return platform === "chess_com"
    ? translate(locale, "games.modal.sourceChessCom")
    : translate(locale, "games.modal.sourceLichess");
}

export function gameResultLabel(outcome: GameOutcome, locale: SupportedLocale): string {
  switch (outcome) {
    case "win":
      return translate(locale, "games.result.win");
    case "loss":
      return translate(locale, "games.result.loss");
    case "draw":
      return translate(locale, "games.result.draw");
  }
}

export function gameResultShortLabel(outcome: GameOutcome, locale: SupportedLocale): string {
  switch (outcome) {
    case "win":
      return translate(locale, "games.result.winShort");
    case "loss":
      return translate(locale, "games.result.lossShort");
    case "draw":
      return translate(locale, "games.result.drawShort");
  }
}

export function gameRelativeDateLabel(
  playedAt: string,
  nowMs: number,
  locale: SupportedLocale
): string {
  if (!playedAt || playedAt.startsWith("1970-01-01")) {
    return "";
  }
  return formatLocalDateLabelForLocale(playedAt, nowMs, locale);
}

export function gameOpeningLabel(game: Pick<StoredImportedGame, "eco" | "opening">): string | null {
  if (game.opening && game.opening.trim().length > 0) {
    return game.opening.trim();
  }
  if (game.eco && game.eco.trim().length > 0) {
    return game.eco.trim();
  }
  return null;
}

export function gameImportErrorMessage(
  error: unknown,
  locale: SupportedLocale
): string {
  if (error instanceof GameImportError) {
    switch (error.code) {
      case "not_found":
        return translate(locale, "games.error.notFound");
      case "rate_limited":
        return translate(locale, "games.error.rateLimited");
      case "network":
        return translate(locale, "games.error.network");
      case "invalid_pgn":
        return translate(locale, "games.error.invalidPgn");
      case "invalid_response":
        return translate(locale, "games.error.invalidResponse");
      default:
        return translate(locale, "games.error.generic");
    }
  }
  return translate(locale, "games.error.generic");
}
