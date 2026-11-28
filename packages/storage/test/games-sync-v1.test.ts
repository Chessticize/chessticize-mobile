import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyMaiaGameMove,
  createMaiaGameState,
  DEFAULT_MAIA_SETUP_PREFERENCES,
  resignMaiaGame,
  type ExtractedGamePuzzle
} from "../../core/src/index.ts";
import {
  FakeGamesV1ZoneTransport,
  FakeProgressV2Transport,
  GAMES_V1_ZONE_NAME,
  MemoryStore,
  PracticeService,
  ProgressV2ChangeTokenExpiredError,
  SQLiteStore,
  syncGamesV1,
  syncPracticeProgressV2,
  type GamesV1ZoneTransport,
  type ImportedGameDraft,
  type PracticeStore,
  type StoredGamePlyEval
} from "../src/index.ts";

interface StoreHarness {
  label: string;
  create(): Promise<{
    store: PracticeStore;
    service: PracticeService;
    cleanup(): Promise<void>;
  }>;
}

const HARNESSES: StoreHarness[] = [
  {
    label: "MemoryStore",
    async create() {
      const store = new MemoryStore();
      const service = new PracticeService(store);
      service.saveSettings({
        ...service.getSettings(),
        sync: { iCloudEnabled: true }
      });
      return {
        store,
        service,
        async cleanup() {}
      };
    }
  },
  {
    label: "SQLiteStore",
    async create() {
      const dir = await mkdtemp(join(tmpdir(), "chessticize-games-v1-"));
      const dbPath = join(dir, "practice.sqlite");
      const store = new SQLiteStore(dbPath);
      store.migrate();
      const service = new PracticeService(store);
      service.saveSettings({
        ...service.getSettings(),
        sync: { iCloudEnabled: true }
      });
      return {
        store,
        service,
        async cleanup() {
          store.close();
          await rm(dir, { recursive: true, force: true });
        }
      };
    }
  }
];

function sampleGameDraft(
  id = "lichess:abc123",
  playedAt = "2026-11-25T12:00:00.000Z"
): ImportedGameDraft {
  return {
    id,
    platform: id.startsWith("chess_com:") ? "chess_com" : "lichess",
    username: "alice",
    userColor: "w",
    playedAt,
    timeControl: "600+0",
    timeClass: "rapid",
    rated: true,
    url: `https://lichess.org/${id.split(":")[1] ?? id}`,
    white: { username: "alice", rating: 1520, isAi: false },
    black: { username: "bob", rating: 1510, isAi: false },
    winner: "b",
    termination: "normal",
    eco: "C20",
    opening: "King's Pawn Game",
    pgn: "1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#"
  };
}

function samplePlyEvals(gameId: string, deep = false): StoredGamePlyEval[] {
  return [
    {
      gameId,
      ply: 1,
      moveNumber: 1,
      color: "w",
      uci: "e2e4",
      san: "e4",
      fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      fenAfter: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      evalKind: "cp",
      whiteScore: 20,
      sideToMoveScore: 20,
      whiteWinPercent: 52,
      moverWinPercentBefore: 52,
      moverWinPercentAfter: 52,
      winPercentLoss: 0,
      bestMove: "e2e4",
      classification: "best",
      clockBucket: "normal",
      isKeyMomentCandidate: false,
      fromPreExistingEval: false,
      deepVerified: deep
    },
    {
      gameId,
      ply: 2,
      moveNumber: 1,
      color: "b",
      uci: "e7e5",
      san: "e5",
      fenBefore: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      fenAfter: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
      evalKind: "cp",
      whiteScore: 25,
      sideToMoveScore: -25,
      whiteWinPercent: 53,
      moverWinPercentBefore: 48,
      moverWinPercentAfter: 47,
      winPercentLoss: 1,
      bestMove: "c7c5",
      classification: "good",
      clockBucket: "normal",
      isKeyMomentCandidate: false,
      fromPreExistingEval: false,
      deepVerified: deep
    }
  ];
}

function sampleExtractedPuzzle(
  idSeed = "shared1:p4",
  overrides: Partial<ExtractedGamePuzzle> = {}
): ExtractedGamePuzzle {
  return {
    idSeed,
    ply: 4,
    moveNumber: 4,
    puzzleKind: "line",
    momentKind: "opponent_blunder_missed",
    userColor: "w",
    puzzleColor: "w",
    initialFen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
    solutionMoves: ["g8f6", "h5f7"],
    prevCp: 50,
    cp: 950,
    winChanceSwing: 0.45,
    themes: ["mateIn1", "short"],
    lengthTag: "oneMove",
    phaseTag: "opening",
    timeSpentSec: 8,
    caliberScore: 84,
    estimatedRating: 1350,
    ratingSource: "sf_heuristic_v1",
    ...overrides
  };
}

function makeFinishedMaiaGame(params: {
  id: string;
  timeClass?: "blitz" | "rapid" | "classical";
  userRating: number;
  outcome: "win" | "loss";
  finishedAt: string;
}) {
  const timeControl =
    params.timeClass === "blitz"
      ? { initialMinutes: 5, incrementSeconds: 0, unlimited: false }
      : params.timeClass === "classical"
        ? { initialMinutes: 30, incrementSeconds: 0, unlimited: false }
        : { initialMinutes: 10, incrementSeconds: 0, unlimited: false };
  let game = createMaiaGameState({
    id: params.id,
    preferences: {
      ...DEFAULT_MAIA_SETUP_PREFERENCES,
      timeControl,
      rated: true,
      colorPreference: "w"
    },
    userRating: params.userRating,
    nowMs: Date.parse(params.finishedAt) - 60_000
  });
  if (params.outcome === "win") {
    game = applyMaiaGameMove(game, "e2e4", { nowMs: Date.parse(params.finishedAt) - 50_000 }).state;
    game = applyMaiaGameMove(game, "e7e5", { nowMs: Date.parse(params.finishedAt) - 40_000 }).state;
    game = applyMaiaGameMove(game, "d1h5", { nowMs: Date.parse(params.finishedAt) - 30_000 }).state;
    game = applyMaiaGameMove(game, "b8c6", { nowMs: Date.parse(params.finishedAt) - 20_000 }).state;
    game = applyMaiaGameMove(game, "f1c4", { nowMs: Date.parse(params.finishedAt) - 10_000 }).state;
    game = applyMaiaGameMove(game, "g8f6", { nowMs: Date.parse(params.finishedAt) - 5_000 }).state;
    game = applyMaiaGameMove(game, "h5f7", { nowMs: Date.parse(params.finishedAt) }).state;
    return { ...game, finishedAt: params.finishedAt };
  }
  game = applyMaiaGameMove(game, "e2e4", { nowMs: Date.parse(params.finishedAt) - 20_000 }).state;
  game = applyMaiaGameMove(game, "e7e5", { nowMs: Date.parse(params.finishedAt) - 10_000 }).state;
  return resignMaiaGame(game, params.finishedAt);
}

for (const harness of HARNESSES) {
  test(`[${harness.label}] linked account sync + dual-device game download dedupes cleanly and keeps richer analysis & Maia-2 puzzle ratings`, async () => {
    const devA = await harness.create();
    const devB = await harness.create();
    const zone = new FakeGamesV1ZoneTransport(GAMES_V1_ZONE_NAME);

    try {
      // 1) Device A links lichess:alice and syncs to iCloud.
      devA.service.upsertLinkedAccount({
        platform: "lichess",
        username: "alice",
        createdAt: "2026-11-25T10:00:00.000Z",
        lastSyncedAt: "2026-11-25T10:05:00.000Z"
      });
      await syncGamesV1(devA.service, zone, { now: () => "2026-11-25T10:06:00.000Z" });

      // 2) Device B pulls the linked account.
      await syncGamesV1(devB.service, zone, { now: () => "2026-11-25T10:07:00.000Z" });
      assert.equal(devB.service.listLinkedAccounts().length, 1);
      assert.equal(devB.service.listLinkedAccounts()[0]?.username, "alice");

      // 3) BOTH Device A and Device B independently download the SAME game from Lichess!
      const draft = sampleGameDraft("lichess:shared1");
      devA.service.upsertImportedGames([draft], "2026-11-25T12:01:00.000Z");
      devB.service.upsertImportedGames([draft], "2026-11-25T12:02:00.000Z");

      // Device B has a newer lastSyncedAt watermark and weaker pass1_done + heuristic puzzle rating.
      devB.service.upsertLinkedAccount({
        platform: "lichess",
        username: "alice",
        lastSyncedAt: "2026-11-25T12:15:00.000Z"
      });
      devB.service.saveGamePlyEvaluations("lichess:shared1", samplePlyEvals("lichess:shared1", false), {
        analysisStatus: "pass1_done",
        analysisCheckpointPly: 2,
        updatedAt: "2026-11-25T12:03:00.000Z"
      });
      devB.service.replaceGameUserPuzzles(
        "lichess:shared1",
        [sampleExtractedPuzzle("shared1:p4", { estimatedRating: 1320, ratingSource: "sf_heuristic_v1" })],
        { opponentName: "bob", playedAt: draft.playedAt, timeClass: "rapid", nowIso: "2026-11-25T12:03:30.000Z" }
      );

      // Device A finishes full deep analysis (complete) with Maia-2 puzzle rating!
      devA.service.saveGamePlyEvaluations("lichess:shared1", samplePlyEvals("lichess:shared1", true), {
        analysisStatus: "complete",
        analysisCheckpointPly: 2,
        whiteAccuracy: 88.5,
        blackAccuracy: 74.2,
        updatedAt: "2026-11-25T12:04:00.000Z"
      });
      devA.service.replaceGameUserPuzzles(
        "lichess:shared1",
        [sampleExtractedPuzzle("shared1:p4", { estimatedRating: 1475, ratingSource: "maia2_sf_v1" })],
        { opponentName: "bob", playedAt: draft.playedAt, timeClass: "rapid", nowIso: "2026-11-25T12:04:30.000Z" }
      );

      // 4) Device B pushes its weaker analysis FIRST, then Device A syncs, then Device B syncs.
      await syncGamesV1(devB.service, zone, { now: () => "2026-11-25T12:20:00.000Z" });
      await syncGamesV1(devA.service, zone, { now: () => "2026-11-25T12:21:00.000Z" });
      await syncGamesV1(devB.service, zone, { now: () => "2026-11-25T12:22:00.000Z" });

      // Both devices must have exactly 1 game, status = complete, deepVerified evals, maia2_sf_v1 rating, and max lastSyncedAt!
      for (const dev of [devA, devB]) {
        const accounts = dev.service.listLinkedAccounts();
        assert.equal(accounts.length, 1);
        assert.equal(accounts[0]?.lastSyncedAt, "2026-11-25T12:15:00.000Z");

        const games = dev.service.listImportedGames();
        assert.equal(games.length, 1);
        assert.equal(games[0]?.analysisStatus, "complete");
        assert.equal(games[0]?.whiteAccuracy, 88.5);
        assert.equal(games[0]?.puzzleCount, 1);
        assert.equal(
          dev.service.listGamePlyEvaluations("lichess:shared1").every((e) => e.deepVerified),
          true
        );

        const puzzles = dev.service.listUserPuzzles({ gameId: "lichess:shared1" });
        assert.equal(puzzles.length, 1);
        assert.equal(puzzles[0]?.rating, 1475);
        assert.equal(puzzles[0]?.ratingSource, "maia2_sf_v1");
      }

      // 5) Subsequent syncs must be zero-push no-ops (no echo loops!).
      const noopA = await syncGamesV1(devA.service, zone, { now: () => "2026-11-25T12:25:00.000Z" });
      const noopB = await syncGamesV1(devB.service, zone, { now: () => "2026-11-25T12:26:00.000Z" });
      assert.equal(noopA.pushedRecordCount, 0);
      assert.equal(noopB.pushedRecordCount, 0);
    } finally {
      await devA.cleanup();
      await devB.cleanup();
    }
  });

  test(`[${harness.label}] cascading game delete tombstones and account unlink/relink propagate reliably`, async () => {
    const devA = await harness.create();
    const devB = await harness.create();
    const zone = new FakeGamesV1ZoneTransport(GAMES_V1_ZONE_NAME);

    try {
      devA.service.upsertLinkedAccount({
        platform: "chess_com",
        username: "MagnusFan",
        createdAt: "2026-11-25T09:00:00.000Z"
      });
      const draft = sampleGameDraft("chess_com:g1");
      devA.service.upsertImportedGames([draft], "2026-11-25T09:01:00.000Z");
      devA.service.saveGamePlyEvaluations("chess_com:g1", samplePlyEvals("chess_com:g1", true), {
        analysisStatus: "complete",
        analysisCheckpointPly: 2,
        updatedAt: "2026-11-25T09:02:00.000Z"
      });
      const [createdPuzzle] = devA.service.replaceGameUserPuzzles(
        "chess_com:g1",
        [sampleExtractedPuzzle("cg1:p4")],
        { opponentName: "bob", playedAt: draft.playedAt, timeClass: "rapid", nowIso: "2026-11-25T09:02:30.000Z" }
      );
      devA.service.enrollReview(
        { puzzleId: createdPuzzle!.id, mode: "standard", ratingKey: "ug_my_games" },
        "2026-11-25T09:03:00.000Z"
      );

      await syncGamesV1(devA.service, zone, { now: () => "2026-11-25T09:05:00.000Z" });
      await syncGamesV1(devB.service, zone, { now: () => "2026-11-25T09:06:00.000Z" });
      assert.equal(devB.service.listImportedGames().length, 1);
      assert.equal(devB.service.listUserPuzzles().length, 1);
      assert.equal(devB.service.listReviewQueue().length, 1);

      // Device A deletes the game and unlinks the account.
      devA.service.deleteImportedGame("chess_com:g1");
      devA.service.removeLinkedAccount("chess_com", "MagnusFan");
      await syncGamesV1(devA.service, zone, { now: () => "2026-11-25T09:10:00.000Z" });

      // Device B pulls tombstones -> cascading removal of game, puzzles, review queue, and account.
      await syncGamesV1(devB.service, zone, { now: () => "2026-11-25T09:11:00.000Z" });
      assert.equal(devB.service.listImportedGames().length, 0);
      assert.equal(devB.service.listUserPuzzles().length, 0);
      assert.equal(devB.service.listReviewQueue().length, 0);
      assert.equal(devB.service.listLinkedAccounts().length, 0);

      // Device B later re-links the same account -> revives on Device A too!
      const relinkTime = new Date(Date.now() + 60_000).toISOString();
      devB.service.upsertLinkedAccount({
        platform: "chess_com",
        username: "MagnusFan",
        createdAt: relinkTime
      });
      await syncGamesV1(devB.service, zone, { now: () => relinkTime });
      await syncGamesV1(devA.service, zone, { now: () => relinkTime });
      assert.equal(devA.service.listLinkedAccounts().length, 1);
      assert.equal(devA.service.listLinkedAccounts()[0]?.username, "MagnusFan");
    } finally {
      await devA.cleanup();
      await devB.cleanup();
    }
  });

  test(`[${harness.label}] out-of-order Maia Play rated games converge bit-for-bit identically regardless of sync order, and deleting imported game preserves rating`, async () => {
    async function runOrder(first: "A" | "B") {
      const devA = await harness.create();
      const devB = await harness.create();
      const zone = new FakeGamesV1ZoneTransport(GAMES_V1_ZONE_NAME);
      try {
        devA.service.setInitialMaiaRating("rapid", 1400, "2026-11-27T09:00:00.000Z");
        devB.service.setInitialMaiaRating("rapid", 1400, "2026-11-27T09:00:00.000Z");

        const g1 = makeFinishedMaiaGame({
          id: "maia-g1",
          timeClass: "rapid",
          userRating: 1400,
          outcome: "win",
          finishedAt: "2026-11-27T10:00:00.000Z"
        });
        devA.service.completeMaiaGame(g1, "2026-11-27T10:00:00.000Z");
        const g3 = makeFinishedMaiaGame({
          id: "maia-g3",
          timeClass: "rapid",
          userRating: devA.service.getMaiaRating("rapid").rating,
          outcome: "loss",
          finishedAt: "2026-11-27T10:20:00.000Z"
        });
        devA.service.completeMaiaGame(g3, "2026-11-27T10:20:00.000Z");

        const g2 = makeFinishedMaiaGame({
          id: "maia-g2",
          timeClass: "rapid",
          userRating: 1400,
          outcome: "loss",
          finishedAt: "2026-11-27T10:10:00.000Z"
        });
        devB.service.completeMaiaGame(g2, "2026-11-27T10:10:00.000Z");
        const g4 = makeFinishedMaiaGame({
          id: "maia-g4",
          timeClass: "rapid",
          userRating: devB.service.getMaiaRating("rapid").rating,
          outcome: "win",
          finishedAt: "2026-11-27T10:30:00.000Z"
        });
        devB.service.completeMaiaGame(g4, "2026-11-27T10:30:00.000Z");

        const primary = first === "A" ? devA : devB;
        const secondary = first === "A" ? devB : devA;
        await syncGamesV1(primary.service, zone, { now: () => "2026-11-27T11:00:00.000Z" });
        await syncGamesV1(secondary.service, zone, { now: () => "2026-11-27T11:01:00.000Z" });
        await syncGamesV1(primary.service, zone, { now: () => "2026-11-27T11:02:00.000Z" });

        const ratingA = devA.service.getMaiaRating("rapid");
        const ratingB = devB.service.getMaiaRating("rapid");
        assert.deepEqual(ratingA, ratingB);
        assert.equal(ratingA.games, 4);
        assert.equal(ratingA.wins, 2);
        assert.equal(ratingA.losses, 2);
        assert.equal(ratingA.draws, 0);

        const firstImportedId = devA.service.listImportedGames()[0]!.id;
        devA.service.deleteImportedGame(firstImportedId);
        await syncGamesV1(devA.service, zone, { now: () => "2026-11-27T11:05:00.000Z" });
        await syncGamesV1(devB.service, zone, { now: () => "2026-11-27T11:06:00.000Z" });
        assert.deepEqual(devA.service.getMaiaRating("rapid"), ratingA);
        assert.deepEqual(devB.service.getMaiaRating("rapid"), ratingA);
        assert.equal(devB.service.listImportedGames().length, 3);

        return ratingA;
      } finally {
        await devA.cleanup();
        await devB.cleanup();
      }
    }

    const fromAFirst = await runOrder("A");
    const fromBFirst = await runOrder("B");
    assert.deepEqual(fromAFirst, fromBFirst);
  });

  test(`[${harness.label}] ug_* attempts, review schedules, and 2.0 settings sync via GamesV1 while keeping ProgressV2 100% 1.4.2-clean`, async () => {
    const devA = await harness.create();
    const devB = await harness.create();
    const progressV2Transport = new FakeProgressV2Transport();
    const gamesV1Zone = new FakeGamesV1ZoneTransport(GAMES_V1_ZONE_NAME);

    try {
      const draft = sampleGameDraft("lichess:ugsync");
      devA.service.upsertImportedGames([draft], "2026-11-26T08:00:00.000Z");
      const [createdPuzzle] = devA.service.replaceGameUserPuzzles(
        "lichess:ugsync",
        [sampleExtractedPuzzle("ugsync:p4")],
        { opponentName: "bob", playedAt: draft.playedAt, timeClass: "rapid", nowIso: "2026-11-26T08:01:00.000Z" }
      );
      const puzzleId = createdPuzzle!.id;

      devA.service.enrollReview(
        { puzzleId, mode: "standard", ratingKey: "ug_my_games" },
        "2026-11-26T08:02:00.000Z"
      );
      devA.service.recordReviewAttempt(
        {
          puzzleId,
          mode: "standard",
          ratingKey: "ug_my_games",
          result: "correct",
          submittedMove: "h5f7",
          expectedMove: "h5f7",
          startedAt: "2026-11-26T08:04:56.000Z"
        },
        "2026-11-26T08:05:00.000Z"
      );
      devA.service.saveSettings({
        ...devA.service.getSettings(),
        appearance: "dark",
        lightBoardTheme: "brown",
        darkBoardTheme: "forest",
        pieceSet: "merida",
        language: "zh-Hans",
        whatsNewSeenVersion: "2.0.0",
        arrowDuel: { opponentReplyEnabled: false },
        gameReview: {
          autoAddRecommendedToReview: true,
          autoSyncCooldownMinutes: 30
        }
      });
      devA.service.saveMaiaSetupPreferences({
        timeControl: { initialMinutes: 15, incrementSeconds: 10, unlimited: false },
        rated: false,
        opponentRating: 1700,
        colorPreference: "b",
        thinkingPace: "instant"
      });

      devB.service.saveSettings({
        ...devB.service.getSettings(),
        language: "ja",
        whatsNewSeenVersion: "1.4.2"
      });

      await syncPracticeProgressV2(devA.service, progressV2Transport, {
        desiredPhase: "sealed",
        deviceId: "ios-a",
        now: () => "2026-11-26T08:10:00.000Z"
      });
      await syncGamesV1(devA.service, gamesV1Zone, { now: () => "2026-11-26T08:10:01.000Z" });

      // Assert ProgressV2 NEVER contains any ug_* puzzle IDs or GamesV1 kinds (1.4.2 backward compatibility!)
      for (const record of progressV2Transport.records) {
        assert.equal(record.recordName.includes("ug_"), false, `Unexpected ug_ record in ProgressV2: ${record.recordName}`);
        assert.equal(record.recordName.startsWith("g1|"), false, `Unexpected g1 record in ProgressV2: ${record.recordName}`);
        assert.equal(record.payload.includes(puzzleId), false, `Unexpected user puzzle in ProgressV2: ${record.recordName}`);
      }

      await syncPracticeProgressV2(devB.service, progressV2Transport, {
        desiredPhase: "sealed",
        deviceId: "ios-b",
        now: () => "2026-11-26T08:11:00.000Z"
      });
      await syncGamesV1(devB.service, gamesV1Zone, { now: () => "2026-11-26T08:11:01.000Z" });

      assert.equal(devB.service.getUserPuzzle(puzzleId)?.id, puzzleId);
      assert.equal(devB.store.listAttempts({ puzzleId }).length, 1);
      assert.equal(
        devB.service.listReviewQueue().some((item) => item.puzzleId === puzzleId),
        true
      );

      const bSettings = devB.service.getSettings();
      assert.equal(bSettings.appearance, "dark");
      assert.equal(bSettings.lightBoardTheme, "brown");
      assert.equal(bSettings.darkBoardTheme, "forest");
      assert.equal(bSettings.pieceSet, "merida");
      assert.equal(bSettings.arrowDuel.opponentReplyEnabled, false);
      assert.equal(bSettings.gameReview?.autoAddRecommendedToReview, true);
      assert.equal(bSettings.gameReview?.autoSyncCooldownMinutes, 30);
      assert.equal(bSettings.language, "ja");
      assert.equal(bSettings.whatsNewSeenVersion, "1.4.2");

      assert.deepEqual(devB.service.getMaiaSetupPreferences(), {
        timeControl: { initialMinutes: 15, incrementSeconds: 10, unlimited: false },
        rated: false,
        opponentRating: 1700,
        colorPreference: "b",
        thinkingPace: "instant"
      });

      // Offline settings edit on Device B wins after sync -> reaches Device A.
      devB.service.saveSettings({
        ...devB.service.getSettings(),
        gameReview: {
          autoAddRecommendedToReview: false,
          autoSyncCooldownMinutes: 5
        }
      });
      await syncGamesV1(devB.service, gamesV1Zone, { now: () => "2026-11-26T08:20:00.000Z" });
      await syncGamesV1(devA.service, gamesV1Zone, { now: () => "2026-11-26T08:21:00.000Z" });
      assert.equal(devA.service.getSettings().gameReview?.autoAddRecommendedToReview, false);
      assert.equal(devA.service.getSettings().gameReview?.autoSyncCooldownMinutes, 5);
    } finally {
      await devA.cleanup();
      await devB.cleanup();
    }
  });
}

test("GamesV1 resolves multi-page child-before-parent records and recovers from expired change tokens", async () => {
  const devA = await HARNESSES[1]!.create();
  const devB = await HARNESSES[1]!.create();
  const backingZone = new FakeGamesV1ZoneTransport(GAMES_V1_ZONE_NAME);

  try {
    const draft = sampleGameDraft("lichess:paged1");
    devA.service.upsertImportedGames([draft], "2026-11-26T09:00:00.000Z");
    const [createdPuzzle] = devA.service.replaceGameUserPuzzles(
      "lichess:paged1",
      [sampleExtractedPuzzle("paged1:p4")],
      { opponentName: "bob", playedAt: draft.playedAt, timeClass: "rapid", nowIso: "2026-11-26T09:01:00.000Z" }
    );
    const puzzleId = createdPuzzle!.id;
    devA.service.enrollReview(
      { puzzleId, mode: "standard", ratingKey: "ug_my_games" },
      "2026-11-26T09:02:00.000Z"
    );
    await syncGamesV1(devA.service, backingZone, { now: () => "2026-11-26T09:05:00.000Z" });

    // Deliver records in REVERSE dependency order across 3 pages:
    // Page 1: ug_review_schedule, Page 2: user_puzzle, Page 3: imported_game + games_preferences
    const allRecords = backingZone.records;
    const revRecords = allRecords.filter((r) => r.kind === "ug_review_schedule");
    const puzRecords = allRecords.filter((r) => r.kind === "user_puzzle");
    const restRecords = allRecords.filter(
      (r) => r.kind !== "ug_review_schedule" && r.kind !== "user_puzzle"
    );

    let expireOnce = true;
    const pagedTransport: GamesV1ZoneTransport = {
      ensureZone: () => backingZone.ensureZone(),
      async fetchZoneChanges(previousToken?: string) {
        if (previousToken === "expired-token" && expireOnce) {
          expireOnce = false;
          throw new ProgressV2ChangeTokenExpiredError();
        }
        if (!previousToken) {
          return {
            records: revRecords as never,
            deletedRecords: [],
            nextToken: "p1",
            moreComing: true
          };
        }
        if (previousToken === "p1") {
          return {
            records: puzRecords as never,
            deletedRecords: [],
            nextToken: "p2",
            moreComing: true
          };
        }
        return {
          records: restRecords as never,
          deletedRecords: [],
          nextToken: "p3",
          moreComing: false
        };
      },
      modifyRecords: (input) => backingZone.modifyRecords(input)
    };

    devB.store.gamesV1!.writeState({
      zoneInitialized: true,
      serverChangeToken: "expired-token"
    });

    await syncGamesV1(devB.service, pagedTransport, { now: () => "2026-11-26T09:10:00.000Z" });
    assert.equal(expireOnce, false);
    assert.equal(devB.service.getImportedGame("lichess:paged1")?.id, "lichess:paged1");
    assert.equal(devB.service.getUserPuzzle(puzzleId)?.id, puzzleId);
    assert.equal(
      devB.service.listReviewQueue().some((item) => item.puzzleId === puzzleId),
      true
    );
  } finally {
    await devA.cleanup();
    await devB.cleanup();
  }
});
