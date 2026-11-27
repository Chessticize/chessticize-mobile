import {
  GAME_IMPORT_USER_AGENT,
  GameImportError,
  extractPgnHeaders,
  isAbortLikeError,
  normalizeSinceMs,
  normalizeTimeClass,
  type GameColor,
  type GameImportHttpClient,
  type GameImportHttpResponse,
  type GameTermination,
  type GameWinner,
  type ImportedGameDraft,
  type ImportedPlayer,
  type RemoteGameImportOptions
} from "./types.ts";

export const LICHESS_API_BASE = "https://lichess.org/api";
export const LICHESS_MIN_SINCE_MS = 1356998400070;
export const DEFAULT_LICHESS_MAX_GAMES = 50;

interface LichessUserPayload {
  name?: unknown;
  id?: unknown;
}

interface LichessPlayerPayload {
  user?: LichessUserPayload;
  rating?: unknown;
  aiLevel?: unknown;
}

interface LichessClockPayload {
  initial?: unknown;
  increment?: unknown;
}

interface LichessOpeningPayload {
  eco?: unknown;
  name?: unknown;
}

interface LichessGamePayload {
  id?: unknown;
  variant?: unknown;
  speed?: unknown;
  rated?: unknown;
  createdAt?: unknown;
  lastMoveAt?: unknown;
  status?: unknown;
  winner?: unknown;
  players?: {
    white?: LichessPlayerPayload;
    black?: LichessPlayerPayload;
  };
  clock?: LichessClockPayload;
  daysPerTurn?: unknown;
  opening?: LichessOpeningPayload;
  pgn?: unknown;
}

export async function importLichessGames(
  httpClient: GameImportHttpClient,
  options: RemoteGameImportOptions
): Promise<ImportedGameDraft[]> {
  const trimmedUsername = options.username.trim();
  if (!trimmedUsername) {
    throw new GameImportError("not_found", "Lichess username is required.");
  }

  const maxGames = options.maxGames ?? DEFAULT_LICHESS_MAX_GAMES;
  if (maxGames <= 0) {
    return [];
  }

  const sinceMs = normalizeSinceMs(options.since);
  const queryParts = [
    "pgnInJson=true",
    "clocks=true",
    "evals=true",
    `max=${Math.floor(maxGames)}`
  ];
  if (sinceMs !== undefined) {
    const clampedSinceMs = Math.max(sinceMs, LICHESS_MIN_SINCE_MS);
    queryParts.push(`since=${clampedSinceMs}`);
  }

  const url = `${LICHESS_API_BASE}/games/user/${encodeURIComponent(
    trimmedUsername
  )}?${queryParts.join("&")}`;

  const response = await requestLichessNdjson(httpClient, url, options.signal);
  return parseLichessNdjson(response.text, {
    username: trimmedUsername,
    ...(sinceMs !== undefined ? { sinceMs } : {}),
    maxGames
  });
}

export function parseLichessNdjson(
  ndjson: string,
  options: { username: string; sinceMs?: number; maxGames?: number }
): ImportedGameDraft[] {
  const normalizedUsername = options.username.trim().toLowerCase();
  const maxGames = options.maxGames ?? DEFAULT_LICHESS_MAX_GAMES;
  if (maxGames <= 0) {
    return [];
  }

  const results: ImportedGameDraft[] = [];
  const lines = ndjson.split(/\r?\n/u);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new GameImportError(
        "invalid_response",
        "Invalid NDJSON line in Lichess games response.",
        { cause: error }
      );
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new GameImportError(
        "invalid_response",
        "Unexpected non-object entry in Lichess NDJSON response."
      );
    }

    const game = parsed as LichessGamePayload;
    const variant = typeof game.variant === "string" ? game.variant : "standard";
    if (variant !== "standard") {
      continue;
    }

    if (
      typeof game.id !== "string" ||
      game.id.trim().length === 0 ||
      typeof game.pgn !== "string" ||
      game.pgn.trim().length === 0
    ) {
      continue;
    }

    const playedAtMs = resolveLichessTimestampMs(game.lastMoveAt ?? game.createdAt);
    if (
      playedAtMs !== undefined &&
      options.sinceMs !== undefined &&
      playedAtMs <= options.sinceMs
    ) {
      continue;
    }

    const normalized = normalizeLichessGame(game, normalizedUsername, playedAtMs);
    if (!normalized) {
      continue;
    }

    results.push(normalized);
    if (results.length >= maxGames) {
      break;
    }
  }

  return results;
}

async function requestLichessNdjson(
  httpClient: GameImportHttpClient,
  url: string,
  signal: AbortSignal | undefined
): Promise<GameImportHttpResponse> {
  if (signal?.aborted) {
    throw new GameImportError("aborted", "Lichess game import was aborted.");
  }

  let response: GameImportHttpResponse;
  try {
    response = await httpClient.getText(url, {
      headers: {
        Accept: "application/x-ndjson",
        "User-Agent": GAME_IMPORT_USER_AGENT
      },
      ...(signal ? { signal } : {})
    });
  } catch (error) {
    if (error instanceof GameImportError) {
      throw error;
    }
    if (signal?.aborted || isAbortLikeError(error)) {
      throw new GameImportError("aborted", "Lichess game import was aborted.", {
        cause: error
      });
    }
    throw new GameImportError(
      "network",
      `Failed to contact Lichess API: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error }
    );
  }

  if (response.status === 404) {
    throw new GameImportError("not_found", "Lichess player was not found.", {
      status: 404
    });
  }
  if (response.status === 429) {
    throw new GameImportError(
      "rate_limited",
      "Lichess API rate limit exceeded. Please try again later.",
      { status: 429 }
    );
  }
  if (response.status < 200 || response.status >= 300) {
    throw new GameImportError(
      "network",
      `Lichess API returned HTTP ${response.status}.`,
      { status: response.status }
    );
  }

  return response;
}

function resolveLichessTimestampMs(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return undefined;
  }
  return raw > 1e12 ? Math.floor(raw) : Math.floor(raw * 1000);
}

function normalizeLichessGame(
  rawGame: LichessGamePayload,
  normalizedUsername: string,
  playedAtMs: number | undefined
): ImportedGameDraft | undefined {
  const whiteRaw = rawGame.players?.white ?? {};
  const blackRaw = rawGame.players?.black ?? {};

  const whiteUserName = extractLichessPlayerName(whiteRaw);
  const blackUserName = extractLichessPlayerName(blackRaw);
  const whiteUserId =
    typeof whiteRaw.user?.id === "string" ? whiteRaw.user.id.trim().toLowerCase() : "";
  const blackUserId =
    typeof blackRaw.user?.id === "string" ? blackRaw.user.id.trim().toLowerCase() : "";

  let userColor: GameColor;
  let resolvedUsername: string;
  if (
    whiteUserName.toLowerCase() === normalizedUsername ||
    whiteUserId === normalizedUsername
  ) {
    userColor = "w";
    resolvedUsername = whiteUserName || normalizedUsername;
  } else if (
    blackUserName.toLowerCase() === normalizedUsername ||
    blackUserId === normalizedUsername
  ) {
    userColor = "b";
    resolvedUsername = blackUserName || normalizedUsername;
  } else {
    return undefined;
  }

  const whiteIsAi = !whiteRaw.user || typeof whiteRaw.aiLevel === "number";
  const blackIsAi = !blackRaw.user || typeof blackRaw.aiLevel === "number";

  const white: ImportedPlayer = {
    username:
      whiteUserName ||
      (typeof whiteRaw.aiLevel === "number" ? `AI Level ${whiteRaw.aiLevel}` : "AI"),
    isAi: whiteIsAi,
    ...(typeof whiteRaw.rating === "number" && Number.isFinite(whiteRaw.rating)
      ? { rating: Math.round(whiteRaw.rating) }
      : {})
  };
  const black: ImportedPlayer = {
    username:
      blackUserName ||
      (typeof blackRaw.aiLevel === "number" ? `AI Level ${blackRaw.aiLevel}` : "AI"),
    isAi: blackIsAi,
    ...(typeof blackRaw.rating === "number" && Number.isFinite(blackRaw.rating)
      ? { rating: Math.round(blackRaw.rating) }
      : {})
  };

  let winner: GameWinner = "none";
  if (rawGame.winner === "white") {
    winner = "w";
  } else if (rawGame.winner === "black") {
    winner = "b";
  }

  const termination = mapLichessStatus(
    typeof rawGame.status === "string" ? rawGame.status : undefined
  );
  const timeControl = formatLichessTimeControl(rawGame.clock, rawGame.daysPerTurn);
  const timeClass = normalizeTimeClass(
    typeof rawGame.speed === "string" ? rawGame.speed : undefined,
    timeControl
  );

  const gameId = (rawGame.id as string).trim();
  const url = `https://lichess.org/${gameId}`;
  const pgn = (rawGame.pgn as string).trim();
  const headers = extractPgnHeaders(pgn);

  const eco =
    (typeof rawGame.opening?.eco === "string" && rawGame.opening.eco.trim()
      ? rawGame.opening.eco.trim()
      : undefined) ??
    (headers.ECO && headers.ECO !== "?" ? headers.ECO : undefined);
  const opening =
    (typeof rawGame.opening?.name === "string" && rawGame.opening.name.trim()
      ? rawGame.opening.name.trim()
      : undefined) ??
    (headers.Opening && headers.Opening !== "?" ? headers.Opening : undefined);

  return {
    id: url,
    platform: "lichess",
    username: resolvedUsername,
    userColor,
    playedAt: new Date(playedAtMs ?? 0).toISOString(),
    timeControl,
    timeClass,
    rated: rawGame.rated === true,
    url,
    white,
    black,
    winner,
    termination,
    ...(eco ? { eco } : {}),
    ...(opening ? { opening } : {}),
    pgn
  };
}

function extractLichessPlayerName(player: LichessPlayerPayload): string {
  if (typeof player.user?.name === "string" && player.user.name.trim()) {
    return player.user.name.trim();
  }
  if (typeof player.user?.id === "string" && player.user.id.trim()) {
    return player.user.id.trim();
  }
  return "";
}

function mapLichessStatus(status: string | undefined): GameTermination {
  switch (status?.trim().toLowerCase()) {
    case "mate":
      return "mate";
    case "resign":
      return "resign";
    case "timeout":
    case "outoftime":
      return "timeout";
    case "draw":
    case "stalemate":
      return "draw";
    case "abandon":
    case "abandoned":
    case "nostart":
      return "abandoned";
    default:
      return "unknown";
  }
}

function formatLichessTimeControl(
  clock: LichessClockPayload | undefined,
  daysPerTurn: unknown
): string {
  if (
    clock &&
    typeof clock.initial === "number" &&
    Number.isFinite(clock.initial)
  ) {
    const increment =
      typeof clock.increment === "number" && Number.isFinite(clock.increment)
        ? Math.floor(clock.increment)
        : 0;
    return `${Math.floor(clock.initial)}+${increment}`;
  }
  if (typeof daysPerTurn === "number" && Number.isFinite(daysPerTurn) && daysPerTurn > 0) {
    return `1/${Math.floor(daysPerTurn * 86400)}`;
  }
  return "";
}
