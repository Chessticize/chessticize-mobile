import test from "node:test";
import assert from "node:assert/strict";
import {
  CHESSCOM_API_BASE,
  GAME_IMPORT_USER_AGENT,
  GameImportError,
  LICHESS_MIN_SINCE_MS,
  computeDeterministicPgnId,
  importChessComGames,
  importLichessGames,
  importPgnBatch,
  parseLichessNdjson,
  splitPgnGames,
  type GameImportHttpClient,
  type GameImportHttpRequestOptions,
  type GameImportHttpResponse
} from "../src/game-import/index.ts";

interface RecordedRequest {
  url: string;
  options?: GameImportHttpRequestOptions;
}

function createFakeHttpClient(
  handler: (
    url: string,
    options?: GameImportHttpRequestOptions
  ) => Promise<GameImportHttpResponse> | GameImportHttpResponse
): { client: GameImportHttpClient; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const client: GameImportHttpClient = {
    async getText(url, options) {
      requests.push(options ? { url, options } : { url });
      return await handler(url, options);
    }
  };
  return { client, requests };
}

test("Chess.com importer fetches archives newest-first, filters variants/since/maxGames, and normalizes metadata", async () => {
  const archivesUrl = `${CHESSCOM_API_BASE}/player/alice_chess/games/archives`;
  const febArchive = `${CHESSCOM_API_BASE}/player/alice_chess/games/2026/02`;
  const marArchive = `${CHESSCOM_API_BASE}/player/alice_chess/games/2026/03`;
  const janArchive = `${CHESSCOM_API_BASE}/player/alice_chess/games/2026/01`;

  const responses = new Map<string, GameImportHttpResponse>([
    [
      archivesUrl,
      {
        status: 200,
        text: JSON.stringify({
          archives: [janArchive, marArchive, febArchive]
        })
      }
    ],
    [
      marArchive,
      {
        status: 200,
        text: JSON.stringify({
          games: [
            {
              url: "https://www.chess.com/game/live/1002",
              rules: "chess960",
              time_class: "blitz",
              time_control: "180+2",
              end_time: 1773100000,
              rated: true,
              white: { username: "Alice_Chess", rating: 1520, result: "win" },
              black: { username: "Opponent960", rating: 1500, result: "resigned" },
              pgn: "[Event \"Live Chess\"]\n\n1. e4 e5 1-0"
            },
            {
              url: "https://www.chess.com/game/live/1003",
              rules: "chess",
              time_class: "rapid",
              time_control: "600",
              end_time: 1773200000,
              rated: true,
              white: { username: "Alice_Chess", rating: 1545, result: "win" },
              black: { username: "BobMaster", rating: 1530, result: "checkmated" },
              pgn: [
                "[Event \"Live Chess\"]",
                "[ECO \"C50\"]",
                "[ECOUrl \"https://www.chess.com/openings/Italian-Game\"]",
                "",
                "1. e4 e5 2. Nf3 Nc6 3. Bc4 1-0"
              ].join("\n")
            },
            {
              url: "https://www.chess.com/game/live/1001",
              rules: "chess",
              time_control: "180+2",
              end_time: 1773000000,
              rated: false,
              white: { username: "Carl", rating: 1490, result: "agreed" },
              black: { username: "Alice_Chess", rating: 1540, result: "agreed" },
              pgn: [
                "[Event \"Live Chess\"]",
                "[ECO \"B20\"]",
                "[Opening \"Sicilian Defense\"]",
                "",
                "1. e4 c5 1/2-1/2"
              ].join("\n")
            },
            {
              url: "https://www.chess.com/game/live/1000",
              rules: "chess",
              time_class: "blitz",
              time_control: "180",
              end_time: 1772900000,
              rated: true,
              white: { username: "Alice_Chess", rating: 1535, result: "timeout" },
              black: { username: "Dan", rating: 1550, result: "win" },
              pgn: "   "
            }
          ]
        })
      }
    ],
    [
      febArchive,
      {
        status: 200,
        text: JSON.stringify({
          games: [
            {
              url: "https://www.chess.com/game/live/999",
              rules: "chess",
              time_class: "blitz",
              time_control: "180",
              end_time: 1771500000,
              rated: true,
              white: { username: "Eve", rating: 1600, result: "win" },
              black: { username: "Alice_Chess", rating: 1530, result: "timeout" },
              pgn: "[Event \"Live Chess\"]\n\n1. d4 d5 1-0"
            },
            {
              url: "https://www.chess.com/game/live/998",
              rules: "chess",
              time_class: "blitz",
              time_control: "180",
              end_time: 1770000000,
              rated: true,
              white: { username: "Alice_Chess", rating: 1525, result: "resigned" },
              black: { username: "Frank", rating: 1540, result: "win" },
              pgn: "[Event \"Live Chess\"]\n\n1. c4 e5 0-1"
            }
          ]
        })
      }
    ],
    [
      janArchive,
      {
        status: 200,
        text: JSON.stringify({ games: [] })
      }
    ]
  ]);

  const { client, requests } = createFakeHttpClient((url) => {
    const response = responses.get(url);
    assert.ok(response, `Unexpected URL requested: ${url}`);
    return response;
  });

  const games = await importChessComGames(client, {
    username: "  Alice_Chess ",
    since: new Date(1771000000 * 1000),
    maxGames: 5
  });

  // Stopped before fetching January archive because February already reached `since`.
  assert.deepEqual(
    requests.map((entry) => entry.url),
    [archivesUrl, marArchive, febArchive]
  );
  assert.equal(
    requests[0]?.options?.headers?.["User-Agent"],
    GAME_IMPORT_USER_AGENT
  );

  assert.equal(games.length, 3);
  assert.equal(games[0]?.id, "https://www.chess.com/game/live/1003");
  assert.equal(games[0]?.platform, "chess_com");
  assert.equal(games[0]?.userColor, "w");
  assert.equal(games[0]?.winner, "w");
  assert.equal(games[0]?.termination, "mate");
  assert.equal(games[0]?.timeClass, "rapid");
  assert.equal(games[0]?.eco, "C50");
  assert.equal(games[0]?.opening, "Italian Game");
  assert.equal(games[0]?.white.rating, 1545);
  assert.equal(games[0]?.black.rating, 1530);

  assert.equal(games[1]?.id, "https://www.chess.com/game/live/1001");
  assert.equal(games[1]?.userColor, "b");
  assert.equal(games[1]?.winner, "none");
  assert.equal(games[1]?.termination, "draw");
  assert.equal(games[1]?.timeClass, "blitz");
  assert.equal(games[1]?.rated, false);
  assert.equal(games[1]?.eco, "B20");
  assert.equal(games[1]?.opening, "Sicilian Defense");

  assert.equal(games[2]?.id, "https://www.chess.com/game/live/999");
  assert.equal(games[2]?.userColor, "b");
  assert.equal(games[2]?.winner, "w");
  assert.equal(games[2]?.termination, "timeout");
});

test("Chess.com importer honors maxGames and avoids fetching older archives once full", async () => {
  const archivesUrl = `${CHESSCOM_API_BASE}/player/bob/games/archives`;
  const marArchive = `${CHESSCOM_API_BASE}/player/bob/games/2026/03`;
  const febArchive = `${CHESSCOM_API_BASE}/player/bob/games/2026/02`;

  const { client, requests } = createFakeHttpClient((url) => {
    if (url === archivesUrl) {
      return {
        status: 200,
        text: JSON.stringify({ archives: [febArchive, marArchive] })
      };
    }
    if (url === marArchive) {
      return {
        status: 200,
        text: JSON.stringify({
          games: [
            {
              url: "https://www.chess.com/game/live/1",
              rules: "chess",
              end_time: 1773000100,
              white: { username: "bob", result: "win" },
              black: { username: "opp1", result: "resigned" },
              pgn: "1. e4 e5 1-0"
            },
            {
              url: "https://www.chess.com/game/live/2",
              rules: "chess",
              end_time: 1773000200,
              white: { username: "bob", result: "abandoned" },
              black: { username: "opp2", result: "win" },
              pgn: "1. d4 d5 0-1"
            }
          ]
        })
      };
    }
    throw new Error(`Should not fetch older archive: ${url}`);
  });

  const games = await importChessComGames(client, { username: "bob", maxGames: 1 });
  assert.equal(games.length, 1);
  assert.equal(games[0]?.id, "https://www.chess.com/game/live/2");
  assert.equal(games[0]?.termination, "abandoned");
  assert.deepEqual(
    requests.map((entry) => entry.url),
    [archivesUrl, marArchive]
  );
});

test("Chess.com importer maps 404, 429, 5xx, invalid JSON, and network throws to typed GameImportError", async () => {
  const cases: Array<{
    name: string;
    handler: () => Promise<GameImportHttpResponse> | GameImportHttpResponse;
    expectedCode: GameImportError["code"];
  }> = [
    {
      name: "404 not found",
      handler: () => ({ status: 404, text: "{}" }),
      expectedCode: "not_found"
    },
    {
      name: "429 rate limited",
      handler: () => ({ status: 429, text: "slow down" }),
      expectedCode: "rate_limited"
    },
    {
      name: "503 server error",
      handler: () => ({ status: 503, text: "unavailable" }),
      expectedCode: "network"
    },
    {
      name: "malformed JSON",
      handler: () => ({ status: 200, text: "<html>not json</html>" }),
      expectedCode: "invalid_response"
    },
    {
      name: "transport failure",
      handler: () => {
        throw new Error("socket hang up");
      },
      expectedCode: "network"
    }
  ];

  for (const testCase of cases) {
    const { client } = createFakeHttpClient(testCase.handler);
    await assert.rejects(
      () => importChessComGames(client, { username: "missing_user" }),
      (error: unknown) => {
        assert.ok(error instanceof GameImportError, testCase.name);
        assert.equal(error.code, testCase.expectedCode, testCase.name);
        return true;
      }
    );
  }
});

test("Lichess importer builds clamped query, parses NDJSON with AI games, skips non-standard variants, and preserves eval/clk annotations", async () => {
  const ndjson = [
    JSON.stringify({
      id: "AbCdEf12",
      variant: "standard",
      speed: "blitz",
      rated: true,
      lastMoveAt: 1773200000000,
      status: "mate",
      winner: "white",
      clock: { initial: 180, increment: 2 },
      opening: { eco: "B90", name: "Sicilian Defense: Najdorf Variation" },
      players: {
        white: { user: { name: "DrNykterstein", id: "drnykterstein" }, rating: 2850 },
        black: { user: { name: "Challenger", id: "challenger" }, rating: 2700 }
      },
      pgn: "1. e4 { [%eval 0.17] [%clk 0:03:00] } 1... c5 { [%eval 0.25] [%clk 0:03:00] } 1-0"
    }),
    "",
    JSON.stringify({
      id: "Var96001",
      variant: "chess960",
      speed: "rapid",
      rated: false,
      createdAt: 1773150000000,
      status: "resign",
      winner: "black",
      players: {
        white: { user: { name: "DrNykterstein", id: "drnykterstein" } },
        black: { user: { name: "Other", id: "other" } }
      },
      pgn: "1. d4 d5 0-1"
    }),
    JSON.stringify({
      id: "AiGame99",
      variant: "standard",
      speed: "rapid",
      rated: false,
      lastMoveAt: 1773100000000,
      status: "outoftime",
      winner: "black",
      clock: { initial: 600, increment: 0 },
      players: {
        white: { aiLevel: 5 },
        black: { user: { name: "DrNykterstein", id: "drnykterstein" }, rating: 2800 }
      },
      pgn: "1. e4 { [%clk 0:10:00] } 1... e5 { [%clk 0:10:00] } 0-1"
    }),
    JSON.stringify({
      id: "DrawGm01",
      variant: "standard",
      speed: "classical",
      rated: true,
      createdAt: 1773050000000,
      status: "stalemate",
      clock: { initial: 1800, increment: 30 },
      players: {
        white: { user: { name: "DrNykterstein", id: "drnykterstein" }, rating: 2810 },
        black: { user: { name: "Opponent2", id: "opponent2" }, rating: 2790 }
      },
      pgn: "1. c4 c5 1/2-1/2"
    })
  ].join("\n");

  const { client, requests } = createFakeHttpClient(() => ({
    status: 200,
    text: ndjson
  }));

  const games = await importLichessGames(client, {
    username: "DrNykterstein",
    since: new Date("2010-01-01T00:00:00.000Z"),
    maxGames: 10
  });

  assert.equal(requests.length, 1);
  assert.equal(
    requests[0]?.url,
    `https://lichess.org/api/games/user/DrNykterstein?pgnInJson=true&clocks=true&evals=true&max=10&since=${LICHESS_MIN_SINCE_MS}`
  );
  assert.equal(requests[0]?.options?.headers?.Accept, "application/x-ndjson");
  assert.equal(
    requests[0]?.options?.headers?.["User-Agent"],
    GAME_IMPORT_USER_AGENT
  );

  assert.equal(games.length, 3);

  assert.equal(games[0]?.id, "https://lichess.org/AbCdEf12");
  assert.equal(games[0]?.platform, "lichess");
  assert.equal(games[0]?.userColor, "w");
  assert.equal(games[0]?.winner, "w");
  assert.equal(games[0]?.termination, "mate");
  assert.equal(games[0]?.timeControl, "180+2");
  assert.equal(games[0]?.timeClass, "blitz");
  assert.equal(games[0]?.eco, "B90");
  assert.equal(games[0]?.opening, "Sicilian Defense: Najdorf Variation");
  assert.match(games[0]!.pgn, /\[%eval 0\.17\]/u);
  assert.match(games[0]!.pgn, /\[%clk 0:03:00\]/u);

  assert.equal(games[1]?.id, "https://lichess.org/AiGame99");
  assert.equal(games[1]?.userColor, "b");
  assert.equal(games[1]?.winner, "b");
  assert.equal(games[1]?.termination, "timeout");
  assert.equal(games[1]?.timeControl, "600+0");
  assert.equal(games[1]?.white.isAi, true);
  assert.equal(games[1]?.white.username, "AI Level 5");
  assert.equal(games[1]?.black.isAi, false);

  assert.equal(games[2]?.id, "https://lichess.org/DrawGm01");
  assert.equal(games[2]?.winner, "none");
  assert.equal(games[2]?.termination, "draw");
  assert.equal(games[2]?.timeClass, "classical");
});

test("Lichess importer maps 404, 429, invalid NDJSON, and abort errors", async () => {
  const { client: notFoundClient } = createFakeHttpClient(() => ({
    status: 404,
    text: "Not found"
  }));
  await assert.rejects(
    () => importLichessGames(notFoundClient, { username: "nobody_here" }),
    (error: unknown) =>
      error instanceof GameImportError && error.code === "not_found"
  );

  const { client: rateLimitClient } = createFakeHttpClient(() => ({
    status: 429,
    text: "Rate limited"
  }));
  await assert.rejects(
    () => importLichessGames(rateLimitClient, { username: "busy_user" }),
    (error: unknown) =>
      error instanceof GameImportError && error.code === "rate_limited"
  );

  assert.throws(
    () => parseLichessNdjson("{not valid json}\n", { username: "alice" }),
    (error: unknown) =>
      error instanceof GameImportError && error.code === "invalid_response"
  );

  const controller = new AbortController();
  controller.abort();
  const { client: abortClient } = createFakeHttpClient(() => ({
    status: 200,
    text: ""
  }));
  await assert.rejects(
    () =>
      importLichessGames(abortClient, {
        username: "alice",
        signal: controller.signal
      }),
    (error: unknown) =>
      error instanceof GameImportError && error.code === "aborted"
  );
});

test("PGN batch importer splits multi-game bundles, isolates malformed games, infers userColor, and produces deterministic dedupe IDs", () => {
  const pgnBundle = [
    // Game 1: Lichess URL -> canonical URL ID, matched as Black via preferredUsernames
    `[Event "Rated Blitz game"]`,
    `[Site "https://lichess.org/AbCdEf12"]`,
    `[UTCDate "2026.03.10"]`,
    `[UTCTime "14:30:00"]`,
    `[White "RivalPlayer"]`,
    `[Black "MyHandle"]`,
    `[WhiteElo "1800"]`,
    `[BlackElo "1825"]`,
    `[TimeControl "180+2"]`,
    `[ECO "C50"]`,
    `[Opening "Italian Game"]`,
    `[Termination "Normal"]`,
    `[Result "0-1"]`,
    ``,
    `1. e4 { [%eval 0.2] [not a header] } 1... e5 2. Nf3 Nc6 3. Bc4 Nf6 0-1`,
    ``,
    // Game 2: Malformed illegal move -> skipped without aborting batch
    `[Event "Broken Game"]`,
    `[White "MyHandle"]`,
    `[Black "Someone"]`,
    `[Result "1-0"]`,
    ``,
    `1. e4 e5 2. Qh8# 1-0`,
    ``,
    // Game 3: Offline OTB game with no URL -> deterministic pgn_ hash ID
    `[Event "Club Championship"]`,
    `[Site "Local Club"]`,
    `[Date "2026.02.15"]`,
    `[White "Alice"]`,
    `[Black "Bob"]`,
    `[Result "1-0"]`,
    ``,
    `1. f3 e5 2. g4 Qh4# 0-1`,
    ``,
    // Game 4: Chess.com Link header -> canonical Chess.com URL ID
    `[Event "Live Chess"]`,
    `[Site "Chess.com"]`,
    `[Date "2026.03.01"]`,
    `[White "MyHandle"]`,
    `[Black "OpponentX"]`,
    `[Result "1-0"]`,
    `[Termination "MyHandle won by resignation"]`,
    `[Link "https://www.chess.com/game/live/777888999"]`,
    ``,
    `1. d4 d5 2. c4 e6 1-0`
  ].join("\n");

  const split = splitPgnGames(pgnBundle);
  assert.equal(split.length, 4);

  const firstPass = importPgnBatch(pgnBundle, {
    preferredUsernames: ["myhandle"],
    defaultUserColor: "b"
  });
  const secondPass = importPgnBatch(pgnBundle, {
    preferredUsernames: ["MYHANDLE"],
    defaultUserColor: "b"
  });

  assert.equal(firstPass.games.length, 3);
  assert.equal(firstPass.skippedCount, 1);
  assert.equal(firstPass.errors.length, 1);
  assert.match(firstPass.errors[0]!, /^Game 2:/u);

  // Game 1: Lichess canonical URL matches API importer ID format
  assert.equal(firstPass.games[0]?.id, "https://lichess.org/AbCdEf12");
  assert.equal(firstPass.games[0]?.platform, "pgn");
  assert.equal(firstPass.games[0]?.userColor, "b");
  assert.equal(firstPass.games[0]?.username, "MyHandle");
  assert.equal(firstPass.games[0]?.rated, true);
  assert.equal(firstPass.games[0]?.timeClass, "blitz");
  assert.equal(firstPass.games[0]?.playedAt, "2026-03-10T14:30:00.000Z");

  // Game 3: Fallback defaultUserColor ("b") and deterministic hash ID
  const otbGame = firstPass.games[1]!;
  assert.match(otbGame.id, /^pgn_[0-9a-f]{32}$/u);
  assert.equal(otbGame.userColor, "b");
  assert.equal(otbGame.username, "Bob");
  assert.equal(otbGame.termination, "mate");
  assert.equal(otbGame.url, undefined);

  // Game 4: Chess.com Link URL
  assert.equal(firstPass.games[2]?.id, "https://www.chess.com/game/live/777888999");
  assert.equal(firstPass.games[2]?.userColor, "w");
  assert.equal(firstPass.games[2]?.termination, "resign");

  // Re-importing produces identical deterministic IDs
  assert.deepEqual(
    firstPass.games.map((g) => g.id),
    secondPass.games.map((g) => g.id)
  );
});

test("PGN batch importer handles 60-game batches and deduplicates repeated entries cleanly", () => {
  const singleGameTemplate = (index: number): string =>
    [
      `[Event "Batch Round ${index}"]`,
      `[Date "2026.03.${String((index % 28) + 1).padStart(2, "0")}"]`,
      `[White "Player_${index}"]`,
      `[Black "Tester"]`,
      `[Result "1-0"]`,
      ``,
      `1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`
    ].join("\n");

  const sixtyGames = Array.from({ length: 60 }, (_, idx) =>
    singleGameTemplate(idx + 1)
  );
  // Add one exact duplicate of game 1 with extra commentary/whitespace
  const duplicateWithComments = [
    `[Event "Batch Round 1"]`,
    `[Date "2026.03.02"]`,
    `[White "player_1"]`,
    `[Black "TESTER"]`,
    `[Result "1-0"]`,
    ``,
    `1. e4 { good move } e5   2. Nf3 Nc6 3. Bb5 a6 1-0`
  ].join("\n");

  const result = importPgnBatch([...sixtyGames, duplicateWithComments].join("\n\n"), {
    preferredUsernames: ["Tester"]
  });

  assert.equal(result.games.length, 60);
  assert.equal(result.skippedCount, 1);
  assert.deepEqual(result.errors, []);
  assert.equal(new Set(result.games.map((g) => g.id)).size, 60);
  assert.ok(result.games.every((g) => g.userColor === "b"));

  const hash1 = computeDeterministicPgnId({
    white: "Player_1",
    black: "Tester",
    date: "2026.03.02",
    result: "1-0",
    normalizedMovetext: "e4 e5 Nf3 Nc6 Bb5 a6"
  });
  assert.equal(result.games[0]?.id, hash1);
});

test("Chess.com and Lichess importers support until cursor for importing older games", async () => {
  const archivesUrl = `${CHESSCOM_API_BASE}/player/older_user/games/archives`;
  const marArchive = `${CHESSCOM_API_BASE}/player/older_user/games/2026/03`;
  const febArchive = `${CHESSCOM_API_BASE}/player/older_user/games/2026/02`;

  const { client: chessComClient, requests: chessComRequests } = createFakeHttpClient((url) => {
    if (url === archivesUrl) {
      return {
        status: 200,
        text: JSON.stringify({ archives: [febArchive, marArchive] })
      };
    }
    if (url === febArchive) {
      return {
        status: 200,
        text: JSON.stringify({
          games: [
            {
              url: "https://www.chess.com/game/live/202",
              rules: "chess",
              end_time: 1771500000,
              white: { username: "older_user", result: "win" },
              black: { username: "opp2", result: "resigned" },
              pgn: "1. e4 e5 1-0"
            },
            {
              url: "https://www.chess.com/game/live/201",
              rules: "chess",
              end_time: 1771000000,
              white: { username: "older_user", result: "win" },
              black: { username: "opp1", result: "resigned" },
              pgn: "1. d4 d5 1-0"
            }
          ]
        })
      };
    }
    throw new Error(`Should not fetch newer archive: ${url}`);
  });

  // March 2026 starts at 1772323200000 ms, so until in mid-Feb skips March archive completely.
  const olderChessCom = await importChessComGames(chessComClient, {
    username: "older_user",
    until: 1771500000 * 1000,
    maxGames: 50
  });
  assert.deepEqual(
    chessComRequests.map((entry) => entry.url),
    [archivesUrl, febArchive]
  );
  assert.equal(olderChessCom.length, 1);
  assert.equal(olderChessCom[0]?.id, "https://www.chess.com/game/live/201");

  const { client: lichessClient, requests: lichessRequests } = createFakeHttpClient(() => ({
    status: 200,
    text: [
      JSON.stringify({
        id: "SameTime1",
        variant: "standard",
        speed: "blitz",
        rated: true,
        lastMoveAt: 1771500000000,
        status: "mate",
        winner: "white",
        players: {
          white: { user: { name: "older_li", id: "older_li" } },
          black: { user: { name: "opp", id: "opp" } }
        },
        pgn: "1. e4 e5 1-0"
      }),
      JSON.stringify({
        id: "OlderLi01",
        variant: "standard",
        speed: "blitz",
        rated: true,
        lastMoveAt: 1771000000000,
        status: "mate",
        winner: "white",
        players: {
          white: { user: { name: "older_li", id: "older_li" } },
          black: { user: { name: "opp", id: "opp" } }
        },
        pgn: "1. d4 d5 1-0"
      })
    ].join("\n")
  }));

  const olderLichess = await importLichessGames(lichessClient, {
    username: "older_li",
    until: 1771500000000,
    maxGames: 50
  });
  assert.ok(lichessRequests[0]?.url.includes("until=1771500000000"));
  assert.equal(olderLichess.length, 1);
  assert.equal(olderLichess[0]?.id, "https://lichess.org/OlderLi01");
});
