// Dedicated mobile network adapter for optional, user-triggered public game
// import. Kept strictly isolated and fail-closed by scripts/mobile-data-egress-audit.mjs.
import {
  GAME_IMPORT_USER_AGENT,
  GameImportError,
  type GameImportHttpClient,
  type GameImportHttpRequestOptions,
  type GameImportHttpResponse
} from "../../../../packages/core/src/game-import/index.ts";

export const DEFAULT_PUBLIC_GAME_IMPORT_TIMEOUT_MS = 15_000;

export const ALLOWED_PUBLIC_GAME_IMPORT_ENDPOINTS = Object.freeze([
  Object.freeze({ hostname: "api.chess.com", pathPrefix: "/pub/" }),
  Object.freeze({ hostname: "lichess.org", pathPrefix: "/api/" })
] as const);

export type PublicGameImportFetch = (
  input: string,
  init: {
    method: "GET";
    credentials: "omit";
    headers: Record<string, string>;
    signal: AbortSignal;
  }
) => Promise<{
  status: number;
  text(): Promise<string>;
}>;

export interface PublicGameImportClientOptions {
  timeoutMs?: number;
  fetchImpl?: PublicGameImportFetch;
}

export function assertAllowedPublicGameImportUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch (error) {
    throw new GameImportError(
      "disallowed_host",
      `Blocked invalid public game import URL: ${rawUrl}`,
      { cause: error }
    );
  }

  if (parsed.protocol !== "https:") {
    throw new GameImportError(
      "disallowed_host",
      `Blocked non-HTTPS public game import URL: ${parsed.protocol}`
    );
  }

  if (parsed.username !== "" || parsed.password !== "") {
    throw new GameImportError(
      "disallowed_host",
      "Blocked public game import URL containing embedded credentials."
    );
  }

  if (parsed.port !== "") {
    throw new GameImportError(
      "disallowed_host",
      `Blocked public game import URL with non-default port: ${parsed.port}`
    );
  }

  const normalizedHostname = parsed.hostname.toLowerCase();
  const decodedPathCheck = rawUrl.toLowerCase();
  if (
    parsed.pathname.includes("..") ||
    decodedPathCheck.includes("%2e") ||
    decodedPathCheck.includes("%5c")
  ) {
    throw new GameImportError(
      "disallowed_host",
      "Blocked public game import URL containing path traversal characters."
    );
  }

  const allowed = ALLOWED_PUBLIC_GAME_IMPORT_ENDPOINTS.some(
    (endpoint) =>
      normalizedHostname === endpoint.hostname &&
      parsed.pathname.startsWith(endpoint.pathPrefix)
  );

  if (!allowed) {
    throw new GameImportError(
      "disallowed_host",
      `Blocked disallowed public game import destination: ${normalizedHostname}${parsed.pathname}`
    );
  }

  return parsed;
}

export function createPublicGameImportClient(
  clientOptions: PublicGameImportClientOptions = {}
): GameImportHttpClient {
  const timeoutMs =
    clientOptions.timeoutMs ?? DEFAULT_PUBLIC_GAME_IMPORT_TIMEOUT_MS;
  const fetchOverride = clientOptions.fetchImpl;

  return {
    async getText(
      url: string,
      options?: GameImportHttpRequestOptions
    ): Promise<GameImportHttpResponse> {
      const validatedUrl = assertAllowedPublicGameImportUrl(url);
      const callerSignal = options?.signal;

      if (callerSignal?.aborted) {
        throw new GameImportError(
          "aborted",
          "Public game import request was aborted."
        );
      }

      const headers = buildSanitizedHeaders(options?.headers);
      const controller = new AbortController();
      let timedOut = false;

      const onCallerAbort = (): void => {
        controller.abort();
      };
      callerSignal?.addEventListener("abort", onCallerAbort, { once: true });

      const timer =
        timeoutMs > 0
          ? setTimeout(() => {
              timedOut = true;
              controller.abort();
            }, timeoutMs)
          : undefined;

      try {
        const requestInit = {
          method: "GET" as const,
          credentials: "omit" as const,
          headers,
          signal: controller.signal
        };
        const response = fetchOverride
          ? await fetchOverride(validatedUrl.toString(), requestInit)
          : await fetch(validatedUrl.toString(), requestInit);
        const text = await response.text();
        return {
          status: response.status,
          text
        };
      } catch (error) {
        if (error instanceof GameImportError) {
          throw error;
        }
        if (timedOut) {
          throw new GameImportError(
            "network",
            `Public game import request timed out after ${timeoutMs}ms.`,
            { cause: error }
          );
        }
        if (callerSignal?.aborted || (error instanceof Error && error.name === "AbortError")) {
          throw new GameImportError(
            "aborted",
            "Public game import request was aborted.",
            { cause: error }
          );
        }
        throw new GameImportError(
          "network",
          `Public game import network request failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { cause: error }
        );
      } finally {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        callerSignal?.removeEventListener("abort", onCallerAbort);
      }
    }
  };
}

function buildSanitizedHeaders(
  rawHeaders: Record<string, string> | undefined
): Record<string, string> {
  const sanitized: Record<string, string> = {
    "User-Agent": GAME_IMPORT_USER_AGENT
  };

  if (rawHeaders) {
    for (const [key, value] of Object.entries(rawHeaders)) {
      if (key.toLowerCase() === "accept" && value.trim().length > 0) {
        sanitized.Accept = value.trim();
        break;
      }
    }
  }

  return sanitized;
}
