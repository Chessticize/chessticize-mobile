export type GamePlatform = "chess_com" | "lichess" | "pgn" | "maia";

export type GameColor = "w" | "b";

export type GameWinner = "w" | "b" | "none";

export type GameTermination =
  | "mate"
  | "resign"
  | "timeout"
  | "draw"
  | "abandoned"
  | "unknown";

export type GameTimeClass =
  | "ultraBullet"
  | "bullet"
  | "blitz"
  | "rapid"
  | "classical"
  | "daily"
  | "correspondence"
  | "unknown";

export interface ImportedPlayer {
  username: string;
  rating?: number;
  isAi: boolean;
}

export interface ImportedGameDraft {
  id: string;
  platform: GamePlatform;
  username: string;
  userColor: GameColor;
  playedAt: string;
  timeControl: string;
  timeClass: GameTimeClass;
  rated: boolean;
  url?: string;
  white: ImportedPlayer;
  black: ImportedPlayer;
  winner: GameWinner;
  termination: GameTermination;
  eco?: string;
  opening?: string;
  pgn: string;
}

export type GameImportErrorCode =
  | "not_found"
  | "rate_limited"
  | "network"
  | "invalid_response"
  | "invalid_pgn"
  | "aborted"
  | "disallowed_host";

export interface GameImportErrorOptions {
  status?: number;
  cause?: unknown;
}

export class GameImportError extends Error {
  readonly code: GameImportErrorCode;
  readonly status?: number;
  readonly cause?: unknown;

  constructor(
    code: GameImportErrorCode,
    message: string,
    options?: GameImportErrorOptions
  ) {
    super(message);
    this.name = "GameImportError";
    this.code = code;
    if (options?.status !== undefined) {
      this.status = options.status;
    }
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export interface GameImportHttpRequestOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface GameImportHttpResponse {
  status: number;
  text: string;
}

export interface GameImportHttpClient {
  getText(
    url: string,
    options?: GameImportHttpRequestOptions
  ): Promise<GameImportHttpResponse>;
}

export interface RemoteGameImportOptions {
  username: string;
  since?: Date | number | string;
  until?: Date | number | string;
  maxGames?: number;
  signal?: AbortSignal;
}

export const GAME_IMPORT_USER_AGENT = "ChessticizeMobile/2.0";

export function normalizeSinceMs(
  since: Date | number | string | undefined
): number | undefined {
  if (since === undefined) {
    return undefined;
  }
  if (since instanceof Date) {
    const ms = since.getTime();
    return Number.isFinite(ms) ? ms : undefined;
  }
  if (typeof since === "number") {
    return Number.isFinite(since) ? Math.floor(since) : undefined;
  }
  const parsed = Date.parse(since);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function isAbortLikeError(error: unknown): boolean {
  if (error instanceof GameImportError) {
    return error.code === "aborted";
  }
  if (error instanceof Error) {
    return error.name === "AbortError";
  }
  return false;
}

export function extractPgnHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const tagPattern = /^\s*\[([A-Za-z0-9_]+)\s+"((?:\\.|[^"\\])*)"\]\s*$/gmu;
  for (const match of pgn.matchAll(tagPattern)) {
    const key = match[1];
    const rawValue = match[2];
    if (key !== undefined && rawValue !== undefined) {
      headers[key] = rawValue.replace(/\\(["\\])/gu, "$1").trim();
    }
  }
  return headers;
}

export function normalizeTimeClass(
  raw: string | undefined,
  fallbackTimeControl?: string
): GameTimeClass {
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    switch (normalized) {
      case "ultrabullet":
        return "ultraBullet";
      case "bullet":
        return "bullet";
      case "blitz":
        return "blitz";
      case "rapid":
        return "rapid";
      case "classical":
        return "classical";
      case "daily":
        return "daily";
      case "correspondence":
        return "correspondence";
      default:
        break;
    }
  }
  if (fallbackTimeControl !== undefined) {
    return inferTimeClassFromTimeControl(fallbackTimeControl);
  }
  return "unknown";
}

export function inferTimeClassFromTimeControl(
  timeControl: string
): GameTimeClass {
  const trimmed = timeControl.trim();
  if (!trimmed || trimmed === "-" || trimmed === "?") {
    return "unknown";
  }
  if (trimmed.includes("/")) {
    return "daily";
  }
  const match = /^(\d+)(?:\+(\d+))?$/u.exec(trimmed);
  if (!match) {
    return "unknown";
  }
  const initialSeconds = Number.parseInt(match[1] ?? "", 10);
  const incrementSeconds = match[2] ? Number.parseInt(match[2], 10) : 0;
  if (!Number.isFinite(initialSeconds) || !Number.isFinite(incrementSeconds)) {
    return "unknown";
  }
  const estimatedSeconds = initialSeconds + 40 * incrementSeconds;
  if (estimatedSeconds < 30) {
    return "ultraBullet";
  }
  if (estimatedSeconds < 180) {
    return "bullet";
  }
  if (estimatedSeconds < 480) {
    return "blitz";
  }
  if (estimatedSeconds < 1500) {
    return "rapid";
  }
  return "classical";
}

export function extractOpeningNameFromEcoUrl(
  rawUrl: string | undefined
): string | undefined {
  if (!rawUrl) {
    return undefined;
  }
  const match = /\/openings\/([^/?#]+)/iu.exec(rawUrl.trim());
  const slug = match?.[1];
  if (!slug) {
    return undefined;
  }
  const decoded = decodeUrlSegmentSafe(slug).replace(/-/gu, " ").trim();
  return decoded.length > 0 ? decoded : undefined;
}

export function canonicalizeKnownGameUrl(
  rawUrl: string | undefined
): string | undefined {
  if (!rawUrl) {
    return undefined;
  }
  const trimmed = rawUrl.trim();
  if (!/^https?:\/\//iu.test(trimmed)) {
    return undefined;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }
  const host = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.replace(/\/+$/u, "");

  if (host === "chess.com" || host === "www.chess.com") {
    const match = /^\/(?:[a-z]{2}\/)?game\/(live|daily)\/(\d+)$/iu.exec(pathname);
    if (match?.[1] && match[2]) {
      return `https://www.chess.com/game/${match[1].toLowerCase()}/${match[2]}`;
    }
    return undefined;
  }

  if (host === "lichess.org" || host === "www.lichess.org") {
    const match = /^\/([A-Za-z0-9]{8})(?:[A-Za-z0-9]{4})?(?:\/(?:white|black))?$/u.exec(
      pathname
    );
    if (match?.[1]) {
      return `https://lichess.org/${match[1]}`;
    }
    return undefined;
  }

  return undefined;
}

function decodeUrlSegmentSafe(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
