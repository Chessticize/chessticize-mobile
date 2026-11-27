import {
  GAME_IMPORT_USER_AGENT,
  GameImportError
} from "../../../packages/core/src/game-import/index.ts";
import {
  assertAllowedPublicGameImportUrl,
  createPublicGameImportClient,
  type PublicGameImportFetch
} from "../src/platform/publicGameImportClient";

describe("publicGameImportClient", () => {
  it("allows only HTTPS Chess.com /pub/ and Lichess /api/ endpoints", () => {
    expect(
      assertAllowedPublicGameImportUrl(
        "https://api.chess.com/pub/player/hikaru/games/archives"
      ).hostname
    ).toBe("api.chess.com");

    expect(
      assertAllowedPublicGameImportUrl(
        "https://lichess.org/api/games/user/DrNykterstein?pgnInJson=true"
      ).hostname
    ).toBe("lichess.org");
  });

  it("rejects disallowed protocols, hosts, paths, credentials, ports, and path traversal fail-closed", () => {
    const blockedUrls = [
      "http://api.chess.com/pub/player/hikaru/games/archives",
      "http://lichess.org/api/games/user/DrNykterstein",
      "https://evil.example/pub/player/hikaru/games/archives",
      "https://api.chess.com.evil.example/pub/player/hikaru/games/archives",
      "https://sub.lichess.org/api/games/user/DrNykterstein",
      "https://api.chess.com/private/account",
      "https://lichess.org/account/profile",
      "https://user:pass@api.chess.com/pub/player/hikaru/games/archives",
      "https://api.chess.com:8443/pub/player/hikaru/games/archives",
      "https://api.chess.com/pub/../private/data",
      "https://api.chess.com/pub/%2e%2e/private/data",
      "not-a-valid-url"
    ];

    for (const url of blockedUrls) {
      let caught: unknown;
      try {
        assertAllowedPublicGameImportUrl(url);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(GameImportError);
      expect((caught as GameImportError).code).toBe("disallowed_host");
    }
  });

  it("sends GET with credentials omit, sanitized Accept/User-Agent headers only, and returns response text", async () => {
    const fetchMock = jest.fn<
      ReturnType<PublicGameImportFetch>,
      Parameters<PublicGameImportFetch>
    >(async () => ({
      status: 200,
      text: async () => '{"archives":[]}'
    }));

    const client = createPublicGameImportClient({
      fetchImpl: fetchMock,
      timeoutMs: 5_000
    });

    const response = await client.getText(
      "https://api.chess.com/pub/player/alice/games/archives",
      {
        headers: {
          Accept: "application/json",
          Authorization: "Bearer secret-should-be-stripped",
          Cookie: "session=should-be-stripped",
          "X-Device-Id": "device-123"
        }
      }
    );

    expect(response).toEqual({ status: 200, text: '{"archives":[]}' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [calledUrl, calledInit] = fetchMock.mock.calls[0]!;
    expect(calledUrl).toBe("https://api.chess.com/pub/player/alice/games/archives");
    expect(calledInit.method).toBe("GET");
    expect(calledInit.credentials).toBe("omit");
    expect(calledInit.headers).toEqual({
      Accept: "application/json",
      "User-Agent": GAME_IMPORT_USER_AGENT
    });
    expect(calledInit.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects disallowed URLs before invoking fetch", async () => {
    const fetchMock = jest.fn() as unknown as PublicGameImportFetch;
    const client = createPublicGameImportClient({ fetchImpl: fetchMock });

    await expect(
      client.getText("https://telemetry.chessticize.invalid/upload")
    ).rejects.toMatchObject({
      name: "GameImportError",
      code: "disallowed_host"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps caller abort to aborted and timeout expiration to network error", async () => {
    const callerController = new AbortController();
    const abortingFetch: PublicGameImportFetch = jest.fn(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => {
            const abortError = new Error("Aborted");
            abortError.name = "AbortError";
            reject(abortError);
          });
        })
    );

    const client = createPublicGameImportClient({
      fetchImpl: abortingFetch,
      timeoutMs: 10_000
    });

    const pending = client.getText(
      "https://lichess.org/api/games/user/alice?pgnInJson=true",
      { signal: callerController.signal }
    );
    callerController.abort();

    await expect(pending).rejects.toMatchObject({
      name: "GameImportError",
      code: "aborted"
    });

    const timeoutClient = createPublicGameImportClient({
      fetchImpl: abortingFetch,
      timeoutMs: 25
    });

    await expect(
      timeoutClient.getText(
        "https://lichess.org/api/games/user/alice?pgnInJson=true"
      )
    ).rejects.toMatchObject({
      name: "GameImportError",
      code: "network"
    });
  });
});
