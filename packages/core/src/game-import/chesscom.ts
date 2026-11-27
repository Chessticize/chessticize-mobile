import {
  GAME_IMPORT_USER_AGENT,
  GameImportError,
  canonicalizeKnownGameUrl,
  extractOpeningNameFromEcoUrl,
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

export const CHESSCOM_API_BASE = "https://api.chess.com/pub";
export const DEFAULT_CHESSCOM_MAX_GAMES = 50;

interface ChessComPlayerPayload {
  username?: unknown;
  rating?: unknown;
  result?: unknown;
}

interface ChessComGamePayload {
  url?: unknown;
  uuid?: unknown;
  pgn?: unknown;
  time_control?: unknown;
  time_class?: unknown;
  end_time?: unknown;
  rated?: unknown;
  rules?: unknown;
  eco?: unknown;
  white?: ChessComPlayerPayload;
  black?: ChessComPlayerPayload;
}

interface ParsedArchiveEntry {
  url: string;
  year: number;
  month: number;
}

export async function importChessComGames(
  httpClient: GameImportHttpClient,
  options: RemoteGameImportOptions
): Promise<ImportedGameDraft[]> {
  const trimmedUsername = options.username.trim();
  if (!trimmedUsername) {
    throw new GameImportError("not_found", "Chess.com username is required.");
  }

  const maxGames = options.maxGames ?? DEFAULT_CHESSCOM_MAX_GAMES;
  if (maxGames <= 0) {
    return [];
  }

  const normalizedUsername = trimmedUsername.toLowerCase();
  const sinceMs = normalizeSinceMs(options.since);
  const sinceDate = sinceMs !== undefined ? new Date(sinceMs) : undefined;
  const sinceYear = sinceDate?.getUTCFullYear();
  const sinceMonth = sinceDate !== undefined ? sinceDate.getUTCMonth() + 1 : undefined;
  const untilMs = normalizeSinceMs(options.until);
  const untilDate = untilMs !== undefined ? new Date(untilMs) : undefined;
  const untilYear = untilDate?.getUTCFullYear();
  const untilMonth = untilDate !== undefined ? untilDate.getUTCMonth() + 1 : undefined;

  const archivesUrl = `${CHESSCOM_API_BASE}/player/${encodeURIComponent(
    normalizedUsername
  )}/games/archives`;

  const archivesResponse = await requestChessComText(
    httpClient,
    archivesUrl,
    options.signal
  );
  const archivesPayload = parseJsonObject(
    archivesResponse.text,
    "Invalid JSON in Chess.com archives response."
  );
  if (!Array.isArray(archivesPayload.archives)) {
    throw new GameImportError(
      "invalid_response",
      "Chess.com archives response is missing an archives array."
    );
  }

  const archives = parseAndSortArchiveUrls(archivesPayload.archives);
  const results: ImportedGameDraft[] = [];

  for (const archive of archives) {
    if (
      untilYear !== undefined &&
      untilMonth !== undefined &&
      (archive.year > untilYear ||
        (archive.year === untilYear && archive.month > untilMonth))
    ) {
      continue;
    }
    if (
      sinceYear !== undefined &&
      sinceMonth !== undefined &&
      (archive.year < sinceYear ||
        (archive.year === sinceYear && archive.month < sinceMonth))
    ) {
      break;
    }

    const archiveResponse = await requestChessComText(
      httpClient,
      archive.url,
      options.signal
    );
    const archivePayload = parseJsonObject(
      archiveResponse.text,
      `Invalid JSON in Chess.com archive ${archive.url}.`
    );
    if (!Array.isArray(archivePayload.games)) {
      throw new GameImportError(
        "invalid_response",
        `Chess.com archive ${archive.url} is missing a games array.`
      );
    }

    const classicalGames = archivePayload.games
      .filter((entry): entry is ChessComGamePayload => isStandardChessComGame(entry))
      .sort((left, right) => Number(right.end_time) - Number(left.end_time));

    for (const rawGame of classicalGames) {
      const endTimeSeconds = rawGame.end_time as number;
      const playedAtMs = Math.floor(endTimeSeconds * 1000);
      if (untilMs !== undefined && playedAtMs >= untilMs) {
        continue;
      }
      if (sinceMs !== undefined && playedAtMs <= sinceMs) {
        break;
      }

      const normalized = normalizeChessComGame(rawGame, normalizedUsername);
      if (!normalized) {
        continue;
      }

      results.push(normalized);
      if (results.length >= maxGames) {
        return results;
      }
    }
  }

  return results;
}

async function requestChessComText(
  httpClient: GameImportHttpClient,
  url: string,
  signal: AbortSignal | undefined
): Promise<GameImportHttpResponse> {
  if (signal?.aborted) {
    throw new GameImportError("aborted", "Chess.com game import was aborted.");
  }

  let response: GameImportHttpResponse;
  try {
    response = await httpClient.getText(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": GAME_IMPORT_USER_AGENT
      },
      ...(signal ? { signal } : {})
    });
  } catch (error) {
    if (error instanceof GameImportError) {
      throw error;
    }
    if (signal?.aborted || isAbortLikeError(error)) {
      throw new GameImportError("aborted", "Chess.com game import was aborted.", {
        cause: error
      });
    }
    throw new GameImportError(
      "network",
      `Failed to contact Chess.com API: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error }
    );
  }

  if (response.status === 404) {
    throw new GameImportError(
      "not_found",
      "Chess.com player was not found.",
      { status: 404 }
    );
  }
  if (response.status === 429) {
    throw new GameImportError(
      "rate_limited",
      "Chess.com API rate limit exceeded. Please try again later.",
      { status: 429 }
    );
  }
  if (response.status < 200 || response.status >= 300) {
    throw new GameImportError(
      "network",
      `Chess.com API returned HTTP ${response.status}.`,
      { status: response.status }
    );
  }

  return response;
}

function parseJsonObject(text: string, errorMessage: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new GameImportError("invalid_response", errorMessage, { cause: error });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new GameImportError("invalid_response", errorMessage);
  }
  return parsed as Record<string, unknown>;
}

function parseAndSortArchiveUrls(rawArchives: readonly unknown[]): ParsedArchiveEntry[] {
  const parsed: ParsedArchiveEntry[] = [];
  for (const entry of rawArchives) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    const match = /\/(\d{4})\/(\d{1,2})\/?$/u.exec(trimmed);
    if (!match?.[1] || !match[2]) {
      continue;
    }
    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    if (month < 1 || month > 12) {
      continue;
    }
    parsed.push({ url: trimmed, year, month });
  }
  return parsed.sort((left, right) => {
    if (left.year !== right.year) {
      return right.year - left.year;
    }
    return right.month - left.month;
  });
}

function isStandardChessComGame(entry: unknown): entry is ChessComGamePayload {
  if (!entry || typeof entry !== "object") {
    return false;
  }
  const game = entry as ChessComGamePayload;
  return (
    game.rules === "chess" &&
    typeof game.pgn === "string" &&
    game.pgn.trim().length > 0 &&
    typeof game.end_time === "number" &&
    Number.isFinite(game.end_time)
  );
}

function normalizeChessComGame(
  rawGame: ChessComGamePayload,
  normalizedUsername: string
): ImportedGameDraft | undefined {
  const whiteRaw = rawGame.white ?? {};
  const blackRaw = rawGame.black ?? {};
  const whiteUsername =
    typeof whiteRaw.username === "string" ? whiteRaw.username.trim() : "";
  const blackUsername =
    typeof blackRaw.username === "string" ? blackRaw.username.trim() : "";

  let userColor: GameColor;
  let resolvedUsername: string;
  if (whiteUsername.toLowerCase() === normalizedUsername) {
    userColor = "w";
    resolvedUsername = whiteUsername;
  } else if (blackUsername.toLowerCase() === normalizedUsername) {
    userColor = "b";
    resolvedUsername = blackUsername;
  } else {
    return undefined;
  }

  const whiteResult =
    typeof whiteRaw.result === "string" ? whiteRaw.result.toLowerCase() : "";
  const blackResult =
    typeof blackRaw.result === "string" ? blackRaw.result.toLowerCase() : "";

  let winner: GameWinner = "none";
  if (whiteResult === "win") {
    winner = "w";
  } else if (blackResult === "win") {
    winner = "b";
  }

  const termination = mapChessComTermination(winner, whiteResult, blackResult);
  const pgn = (rawGame.pgn as string).trim();
  const headers = extractPgnHeaders(pgn);
  const timeControl =
    typeof rawGame.time_control === "string" ? rawGame.time_control.trim() : "";
  const timeClass = normalizeTimeClass(
    typeof rawGame.time_class === "string" ? rawGame.time_class : undefined,
    timeControl
  );

  const rawUrl = typeof rawGame.url === "string" ? rawGame.url.trim() : undefined;
  const canonicalUrl = canonicalizeKnownGameUrl(rawUrl) ?? rawUrl;
  const fallbackId =
    typeof rawGame.uuid === "string" && rawGame.uuid.trim().length > 0
      ? `chess_com_${rawGame.uuid.trim()}`
      : `chess_com_${normalizedUsername}_${Math.floor(rawGame.end_time as number)}`;
  const id = canonicalUrl && canonicalUrl.length > 0 ? canonicalUrl : fallbackId;

  const ecoHeader = headers.ECO;
  const eco = ecoHeader && ecoHeader !== "?" ? ecoHeader : undefined;
  const openingHeader = headers.Opening;
  const opening =
    (openingHeader && openingHeader !== "?" ? openingHeader : undefined) ??
    extractOpeningNameFromEcoUrl(headers.ECOUrl) ??
    extractOpeningNameFromEcoUrl(
      typeof rawGame.eco === "string" ? rawGame.eco : undefined
    );

  const white: ImportedPlayer = {
    username: whiteUsername || "White",
    isAi: false,
    ...(typeof whiteRaw.rating === "number" && Number.isFinite(whiteRaw.rating)
      ? { rating: Math.round(whiteRaw.rating) }
      : {})
  };
  const black: ImportedPlayer = {
    username: blackUsername || "Black",
    isAi: false,
    ...(typeof blackRaw.rating === "number" && Number.isFinite(blackRaw.rating)
      ? { rating: Math.round(blackRaw.rating) }
      : {})
  };

  return {
    id,
    platform: "chess_com",
    username: resolvedUsername,
    userColor,
    playedAt: new Date(Math.floor((rawGame.end_time as number) * 1000)).toISOString(),
    timeControl,
    timeClass,
    rated: rawGame.rated === true,
    ...(canonicalUrl ? { url: canonicalUrl } : {}),
    white,
    black,
    winner,
    termination,
    ...(eco ? { eco } : {}),
    ...(opening ? { opening } : {}),
    pgn
  };
}

function mapChessComTermination(
  winner: GameWinner,
  whiteResult: string,
  blackResult: string
): GameTermination {
  const decisiveResult =
    winner === "w" ? blackResult : winner === "b" ? whiteResult : whiteResult || blackResult;

  switch (decisiveResult) {
    case "checkmated":
      return "mate";
    case "resigned":
      return "resign";
    case "timeout":
      return "timeout";
    case "abandoned":
      return "abandoned";
    case "agreed":
    case "stalemate":
    case "repetition":
    case "insufficient":
    case "50move":
    case "timevsinsufficient":
      return "draw";
    default:
      return winner === "none" ? "draw" : "unknown";
  }
}
