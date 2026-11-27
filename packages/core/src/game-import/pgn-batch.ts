import { Chess } from "chess.js";
import {
  canonicalizeKnownGameUrl,
  extractOpeningNameFromEcoUrl,
  extractPgnHeaders,
  inferTimeClassFromTimeControl,
  normalizeTimeClass,
  type GameColor,
  type GameTermination,
  type GameTimeClass,
  type GameWinner,
  type ImportedGameDraft,
  type ImportedPlayer
} from "./types.ts";

export interface PgnBatchImportOptions {
  preferredUsernames?: readonly string[];
  defaultUserColor?: GameColor;
  fallbackPlayedAt?: string;
}

export interface PgnBatchImportResult {
  games: ImportedGameDraft[];
  skippedCount: number;
  errors: string[];
}

const PGN_TAG_LINE_PATTERN = /^\s*\[[A-Za-z0-9_]+\s+"(?:\\.|[^"\\])*"\]\s*$/u;
const RESULT_TOKEN_END_PATTERN = /(?:^|\s)(?:1-0|0-1|1\/2-1\/2|\*)\s*$/u;
const DEFAULT_FALLBACK_PLAYED_AT = "1970-01-01T00:00:00.000Z";

export function splitPgnGames(pgnText: string): string[] {
  const cleaned = pgnText.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
  const lines = cleaned.split("\n");

  const chunks: string[] = [];
  let currentLines: string[] = [];
  let hasMovetext = false;
  let endedWithResultAfterBlank = false;
  let sawBlankAfterResult = false;
  let inBraceComment = false;
  let variationDepth = 0;

  const flushCurrent = (): void => {
    const joined = currentLines.join("\n").trim();
    if (joined.length > 0) {
      chunks.push(joined);
    }
    currentLines = [];
    hasMovetext = false;
    endedWithResultAfterBlank = false;
    sawBlankAfterResult = false;
    inBraceComment = false;
    variationDepth = 0;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const atTopLevel = !inBraceComment && variationDepth === 0;

    if (atTopLevel && PGN_TAG_LINE_PATTERN.test(trimmed)) {
      if (hasMovetext) {
        flushCurrent();
      }
      currentLines.push(line);
      continue;
    }

    if (trimmed.length === 0) {
      if (currentLines.length > 0) {
        currentLines.push(line);
        if (atTopLevel && endedWithResultAfterBlank) {
          sawBlankAfterResult = true;
        }
      }
      continue;
    }

    if (atTopLevel && sawBlankAfterResult && /^1\.\s*\S/u.test(trimmed)) {
      flushCurrent();
    }

    currentLines.push(line);
    hasMovetext = true;
    sawBlankAfterResult = false;

    const scanResult = scanMovetextLine(line, inBraceComment, variationDepth);
    inBraceComment = scanResult.inBraceComment;
    variationDepth = scanResult.variationDepth;

    if (!inBraceComment && variationDepth === 0) {
      endedWithResultAfterBlank = RESULT_TOKEN_END_PATTERN.test(
        scanResult.topLevelText
      );
    } else {
      endedWithResultAfterBlank = false;
    }
  }

  flushCurrent();
  return chunks;
}

export function importPgnBatch(
  pgnText: string,
  options: PgnBatchImportOptions = {}
): PgnBatchImportResult {
  const rawGames = splitPgnGames(pgnText);
  if (rawGames.length === 0) {
    return { games: [], skippedCount: 0, errors: [] };
  }

  const preferredUsernames = (options.preferredUsernames ?? [])
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 0);
  const defaultUserColor: GameColor = options.defaultUserColor ?? "w";
  const fallbackPlayedAt = options.fallbackPlayedAt ?? DEFAULT_FALLBACK_PLAYED_AT;

  const games: ImportedGameDraft[] = [];
  const errors: string[] = [];
  const seenIds = new Set<string>();
  let skippedCount = 0;

  for (let index = 0; index < rawGames.length; index += 1) {
    const rawPgn = rawGames[index]!;
    const gameNumber = index + 1;

    const parsed = parseSinglePgnGame(rawPgn, {
      preferredUsernames,
      defaultUserColor,
      fallbackPlayedAt
    });

    if ("error" in parsed) {
      skippedCount += 1;
      errors.push(`Game ${gameNumber}: ${parsed.error}`);
      continue;
    }

    if (seenIds.has(parsed.game.id)) {
      skippedCount += 1;
      continue;
    }
    seenIds.add(parsed.game.id);
    games.push(parsed.game);
  }

  return { games, skippedCount, errors };
}

export function computeDeterministicPgnId(input: {
  white: string;
  black: string;
  date: string;
  result: string;
  normalizedMovetext: string;
}): string {
  const payload = [
    input.white.trim().toLowerCase(),
    input.black.trim().toLowerCase(),
    input.date.trim(),
    input.result.trim(),
    input.normalizedMovetext.trim()
  ].join("|");

  const hashA = fnv1a64Hex(payload, 0xcbf29ce484222325n);
  const hashB = fnv1a64Hex(`pgn-v1:${payload}`, 0x84222325cbf29ce4n);
  return `pgn_${hashA}${hashB}`;
}

function parseSinglePgnGame(
  rawPgn: string,
  options: {
    preferredUsernames: readonly string[];
    defaultUserColor: GameColor;
    fallbackPlayedAt: string;
  }
): { game: ImportedGameDraft } | { error: string } {
  const headers = extractPgnHeaders(rawPgn);
  const variant = headers.Variant?.trim().toLowerCase();
  if (variant && variant !== "standard") {
    return { error: `Unsupported chess variant "${headers.Variant}".` };
  }

  const chess = new Chess();
  try {
    chess.loadPgn(rawPgn);
  } catch (error) {
    return {
      error: `Invalid PGN: ${error instanceof Error ? error.message : String(error)}`
    };
  }

  const history = chess.history();
  if (history.length === 0) {
    return { error: "PGN contains no playable moves." };
  }

  const whiteUsername = cleanHeaderName(headers.White, "White");
  const blackUsername = cleanHeaderName(headers.Black, "Black");

  const { userColor, username } = resolveBatchUser(
    whiteUsername,
    blackUsername,
    options.preferredUsernames,
    options.defaultUserColor
  );

  const whiteRating = parseOptionalRating(headers.WhiteElo);
  const blackRating = parseOptionalRating(headers.BlackElo);
  const white: ImportedPlayer = {
    username: whiteUsername,
    isAi: isLikelyAiPlayer(whiteUsername, headers.WhiteTitle),
    ...(whiteRating !== undefined ? { rating: whiteRating } : {})
  };
  const black: ImportedPlayer = {
    username: blackUsername,
    isAi: isLikelyAiPlayer(blackUsername, headers.BlackTitle),
    ...(blackRating !== undefined ? { rating: blackRating } : {})
  };

  const resultHeader = resolveResultToken(headers.Result, rawPgn);
  const winner: GameWinner =
    resultHeader === "1-0" ? "w" : resultHeader === "0-1" ? "b" : "none";
  const termination = resolvePgnTermination(headers.Termination, winner, resultHeader, chess);

  const rawTimeControl = headers.TimeControl?.trim() ?? "";
  const timeControl = rawTimeControl === "-" || rawTimeControl === "?" ? "" : rawTimeControl;
  const timeClass = resolvePgnTimeClass(headers.Event, timeControl);
  const rated = isRatedEvent(headers.Event);

  const canonicalUrl =
    canonicalizeKnownGameUrl(headers.Link) ??
    canonicalizeKnownGameUrl(headers.Site);
  const dateKey = headers.UTCDate || headers.Date || "";
  const playedAt = parsePgnPlayedAt(
    headers.UTCDate,
    headers.UTCTime,
    headers.Date,
    options.fallbackPlayedAt
  );

  const id =
    canonicalUrl ??
    computeDeterministicPgnId({
      white: whiteUsername,
      black: blackUsername,
      date: dateKey,
      result: resultHeader,
      normalizedMovetext: history.join(" ")
    });

  const eco = headers.ECO && headers.ECO !== "?" ? headers.ECO : undefined;
  const opening =
    (headers.Opening && headers.Opening !== "?" ? headers.Opening : undefined) ??
    extractOpeningNameFromEcoUrl(headers.ECOUrl);

  return {
    game: {
      id,
      platform: "pgn",
      username,
      userColor,
      playedAt,
      timeControl,
      timeClass,
      rated,
      ...(canonicalUrl ? { url: canonicalUrl } : {}),
      white,
      black,
      winner,
      termination,
      ...(eco ? { eco } : {}),
      ...(opening ? { opening } : {}),
      pgn: rawPgn.trim()
    }
  };
}

function scanMovetextLine(
  line: string,
  initialInBraceComment: boolean,
  initialVariationDepth: number
): { inBraceComment: boolean; variationDepth: number; topLevelText: string } {
  let inBraceComment = initialInBraceComment;
  let variationDepth = initialVariationDepth;
  let topLevelText = "";

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (inBraceComment) {
      if (ch === "}") {
        inBraceComment = false;
      }
      continue;
    }
    if (ch === ";") {
      break;
    }
    if (ch === "{") {
      inBraceComment = true;
      continue;
    }
    if (ch === "(") {
      variationDepth += 1;
      continue;
    }
    if (ch === ")") {
      variationDepth = Math.max(0, variationDepth - 1);
      continue;
    }
    if (variationDepth === 0) {
      topLevelText += ch;
    }
  }

  return { inBraceComment, variationDepth, topLevelText };
}

function cleanHeaderName(raw: string | undefined, fallback: string): string {
  const trimmed = raw?.trim() ?? "";
  return trimmed && trimmed !== "?" ? trimmed : fallback;
}

function resolveBatchUser(
  whiteUsername: string,
  blackUsername: string,
  preferredUsernames: readonly string[],
  defaultUserColor: GameColor
): { userColor: GameColor; username: string } {
  const whiteLower = whiteUsername.toLowerCase();
  const blackLower = blackUsername.toLowerCase();

  for (const preferred of preferredUsernames) {
    if (whiteLower === preferred) {
      return { userColor: "w", username: whiteUsername };
    }
    if (blackLower === preferred) {
      return { userColor: "b", username: blackUsername };
    }
  }

  return {
    userColor: defaultUserColor,
    username: defaultUserColor === "w" ? whiteUsername : blackUsername
  };
}

function parseOptionalRating(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!/^\d{2,5}$/u.test(trimmed)) {
    return undefined;
  }
  const value = Number.parseInt(trimmed, 10);
  return Number.isFinite(value) ? value : undefined;
}

function isLikelyAiPlayer(username: string, title: string | undefined): boolean {
  if (title?.trim().toUpperCase() === "BOT") {
    return true;
  }
  return /^(?:lichess ai|stockfish|ai level)/iu.test(username.trim());
}

function resolveResultToken(headerResult: string | undefined, rawPgn: string): string {
  const cleaned = headerResult?.trim();
  if (cleaned === "1-0" || cleaned === "0-1" || cleaned === "1/2-1/2" || cleaned === "*") {
    return cleaned;
  }
  const tailMatch = /(?:^|\s)(1-0|0-1|1\/2-1\/2|\*)\s*$/u.exec(rawPgn.trim());
  return tailMatch?.[1] ?? "*";
}

function resolvePgnTermination(
  rawTermination: string | undefined,
  winner: GameWinner,
  resultToken: string,
  chess: Chess
): GameTermination {
  const text = rawTermination?.trim().toLowerCase() ?? "";
  if (text.includes("checkmate") || /\bmate\b/u.test(text)) {
    return "mate";
  }
  if (text.includes("resign")) {
    return "resign";
  }
  if (text.includes("time") || text.includes("forfeit")) {
    return "timeout";
  }
  if (text.includes("abandon")) {
    return "abandoned";
  }
  if (
    text.includes("draw") ||
    text.includes("stalemate") ||
    text.includes("repetition") ||
    text.includes("insufficient") ||
    text.includes("agreement") ||
    text.includes("50-move")
  ) {
    return "draw";
  }
  if (chess.isCheckmate()) {
    return "mate";
  }
  if (resultToken === "1/2-1/2" || chess.isDraw()) {
    return "draw";
  }
  return winner === "none" ? "unknown" : "unknown";
}

function resolvePgnTimeClass(
  eventHeader: string | undefined,
  timeControl: string
): GameTimeClass {
  const fromControl = inferTimeClassFromTimeControl(timeControl);
  if (fromControl !== "unknown") {
    return fromControl;
  }
  const eventLower = eventHeader?.toLowerCase() ?? "";
  for (const candidate of [
    "ultrabullet",
    "bullet",
    "blitz",
    "rapid",
    "classical",
    "correspondence",
    "daily"
  ]) {
    if (eventLower.includes(candidate)) {
      return normalizeTimeClass(candidate);
    }
  }
  return "unknown";
}

function isRatedEvent(eventHeader: string | undefined): boolean {
  if (!eventHeader) {
    return false;
  }
  const lower = eventHeader.toLowerCase();
  if (lower.includes("unrated") || lower.includes("casual")) {
    return false;
  }
  return /\brated\b/u.test(lower);
}

function parsePgnPlayedAt(
  utcDate: string | undefined,
  utcTime: string | undefined,
  dateHeader: string | undefined,
  fallbackPlayedAt: string
): string {
  const rawDate = (utcDate && !utcDate.includes("?") ? utcDate : undefined) ?? dateHeader;
  if (!rawDate) {
    return fallbackPlayedAt;
  }
  const dateMatch = /^(\d{4})[.-](\d{2}|\?\?)[.-](\d{2}|\?\?)$/u.exec(rawDate.trim());
  if (!dateMatch?.[1]) {
    return fallbackPlayedAt;
  }
  const year = Number.parseInt(dateMatch[1], 10);
  const month = dateMatch[2] === "??" ? 1 : Number.parseInt(dateMatch[2] ?? "1", 10);
  const day = dateMatch[3] === "??" ? 1 : Number.parseInt(dateMatch[3] ?? "1", 10);

  let hour = 0;
  let minute = 0;
  let second = 0;
  if (utcTime) {
    const timeMatch = /^(\d{2}):(\d{2}):(\d{2})$/u.exec(utcTime.trim());
    if (timeMatch?.[1] && timeMatch[2] && timeMatch[3]) {
      hour = Number.parseInt(timeMatch[1], 10);
      minute = Number.parseInt(timeMatch[2], 10);
      second = Number.parseInt(timeMatch[3], 10);
    }
  }

  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second);
  if (!Number.isFinite(timestamp)) {
    return fallbackPlayedAt;
  }
  return new Date(timestamp).toISOString();
}

function fnv1a64Hex(input: string, offsetBasis: bigint): string {
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  let hash = offsetBasis;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}
