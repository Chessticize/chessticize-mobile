import React from "react";
import TestRenderer, { act, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { AppState } from "react-native";
import {
  type EngineAnalysisLine,
  type GameImportHttpClient,
  type GameReviewEngine,
  type GameReviewEngineRequest,
  type ImportedGameDraft,
  type PuzzleExtractionEngine
} from "../../../packages/core/src/index.ts";
import { MemoryStore } from "../../../packages/storage/src/memory-store.ts";
import { PracticeService } from "../../../packages/storage/src/practice-service.ts";
import { MemoryTacticalProfileRepository } from "../../../packages/storage/src/tactical-profile-repository.ts";
import { GamesHubScreen } from "../src/components/games/GamesHubScreen.tsx";
import { PracticePocScreen } from "../src/components/PracticePocScreen.tsx";
import {
  composePackBackedMobilePracticeService,
  createMobilePracticeService,
  getPracticeStoreForGameReview
} from "../src/platform/mobilePractice.ts";
import {
  MOBILE_APPLICATION_METADATA_LINKS,
  type MobilePlatformCapabilities
} from "../src/platform/mobilePlatformCapabilities.ts";
import {
  mobileBackDestination,
  resolveMobileBackIntent,
  type MobileBackState
} from "../src/navigation/mobileBackContract.ts";

const appStateMock = AppState as unknown as {
  __emit: (nextState: string) => void;
  __reset: () => void;
};

const NOW_ISO = "2026-11-27T18:00:00.000Z";
const NOW_MS = Date.parse(NOW_ISO);

const SAMPLE_PGN_1 = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.11.27"]
[White "alice"]
[Black "bob"]
[Result "1-0"]
[WhiteElo "1620"]
[BlackElo "1595"]
[TimeControl "300+0"]
[ECO "C50"]
[Opening "Italian Game"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 1-0`;

const SAMPLE_PGN_2 = `[Event "Rated Rapid game"]
[Site "https://lichess.org/AbCdEf12"]
[Date "2026.11.26"]
[White "carol"]
[Black "alice"]
[Result "1-0"]
[WhiteElo "1710"]
[BlackElo "1615"]
[TimeControl "600+5"]
[ECO "B20"]
[Opening "Sicilian Defense"]

1. e4 c5 2. Nf3 d6 3. d4 cxd4 1-0`;

const mounted: ReactTestRenderer[] = [];

function render(element: React.ReactElement): ReactTestRenderer {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  mounted.push(renderer!);
  return renderer!;
}

function findByTestID(renderer: ReactTestRenderer, testID: string): ReactTestInstance {
  const matches = renderer.root.findAll(
    (node) => typeof node.type === "string" && node.props.testID === testID
  );
  if (matches.length === 0) {
    throw new Error(`Expected node with testID="${testID}"`);
  }
  return matches[0]!;
}

function hasTestID(renderer: ReactTestRenderer, testID: string): boolean {
  return renderer.root.findAll(
    (node) => typeof node.type === "string" && node.props.testID === testID
  ).length > 0;
}

function press(renderer: ReactTestRenderer, testID: string): void {
  const node = renderer.root.findAll(
    (candidate) => candidate.props.testID === testID && typeof candidate.props.onPress === "function"
  )[0];
  if (!node) {
    throw new Error(`Expected pressable with testID="${testID}"`);
  }
  act(() => {
    node.props.onPress();
  });
}

async function pressAsync(renderer: ReactTestRenderer, testID: string): Promise<void> {
  const node = renderer.root.findAll(
    (candidate) => candidate.props.testID === testID && typeof candidate.props.onPress === "function"
  )[0];
  if (!node) {
    throw new Error(`Expected pressable with testID="${testID}"`);
  }
  await act(async () => {
    await node.props.onPress();
  });
}

function changeText(renderer: ReactTestRenderer, testID: string, value: string): void {
  const node = findByTestID(renderer, testID);
  act(() => {
    node.props.onChangeText(value);
  });
}

function textContent(node: ReactTestInstance): string {
  const parts: string[] = [];
  const visit = (current: ReactTestInstance | string | number): void => {
    if (typeof current === "string" || typeof current === "number") {
      parts.push(String(current));
      return;
    }
    if ((current.type as unknown) === "Text") {
      const children = current.props.children;
      if (Array.isArray(children)) {
        parts.push(children.join(""));
      } else if (children !== undefined && children !== null) {
        parts.push(String(children));
      }
      return;
    }
    for (const child of current.children) {
      visit(child);
    }
  };
  visit(node);
  return parts.join(" ");
}

function makeDraft(overrides: Partial<ImportedGameDraft> = {}): ImportedGameDraft {
  return {
    id: overrides.id ?? "https://www.chess.com/game/live/1001",
    platform: overrides.platform ?? "chess_com",
    username: overrides.username ?? "alice",
    userColor: overrides.userColor ?? "w",
    playedAt: overrides.playedAt ?? NOW_ISO,
    timeControl: overrides.timeControl ?? "300+0",
    timeClass: overrides.timeClass ?? "blitz",
    rated: overrides.rated ?? true,
    white: overrides.white ?? { username: "alice", rating: 1620, isAi: false },
    black: overrides.black ?? { username: "bob", rating: 1595, isAi: false },
    winner: overrides.winner ?? "w",
    termination: overrides.termination ?? "resign",
    eco: overrides.eco ?? "C50",
    opening: overrides.opening ?? "Italian Game",
    pgn: overrides.pgn ?? SAMPLE_PGN_1
  };
}

function makeCapabilities(service: PracticeService): MobilePlatformCapabilities {
  return {
    storage: { practiceService: service },
    progressProtection: { kind: "icloud_sync" },
    progressSync: { client: null, diagnostics: null },
    stockfish: { createTransport: () => null, prewarm: async () => false },
    reminders: { platform: "ios", scheduler: null, notificationClient: null },
    moveFeedback: { client: null },
    uiHaptics: { client: null },
    appReview: { client: null },
    applicationMetadata: {
      versionName: "2.0.0",
      ...MOBILE_APPLICATION_METADATA_LINKS
    }
  };
}

function makeFastFakeEngine(): GameReviewEngine & PuzzleExtractionEngine {
  return {
    async analyze(): Promise<EngineAnalysisLine[]> {
      return [
        {
          depth: 12,
          multipv: 1,
          move: "e2e4",
          pv: ["e2e4", "e7e5"],
          score: { kind: "cp", sideToMoveCentipawns: 20, whiteCentipawns: 20 }
        }
      ];
    }
  };
}

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((renderer) => renderer.unmount());
  });
  appStateMock.__reset();
});

describe("GamesHubScreen", () => {
  it("renders empty onboarding with zero background network calls, then links Chess.com and deduplicates games", async () => {
    const service = new PracticeService(new MemoryStore());
    const requests: string[] = [];
    const httpClient: GameImportHttpClient = {
      async getText(url) {
        requests.push(url);
        if (url.endsWith("/games/archives")) {
          return {
            status: 200,
            text: JSON.stringify({
              archives: ["https://api.chess.com/pub/player/alice/games/2026/11"]
            })
          };
        }
        return {
          status: 200,
          text: JSON.stringify({
            games: [
              {
                url: "https://www.chess.com/game/live/1001",
                pgn: SAMPLE_PGN_1,
                time_control: "300",
                time_class: "blitz",
                end_time: Math.floor(NOW_MS / 1000),
                rated: true,
                rules: "chess",
                white: { username: "alice", rating: 1620, result: "win" },
                black: { username: "bob", rating: 1595, result: "resigned" }
              },
              {
                url: "https://www.chess.com/game/live/1001",
                pgn: SAMPLE_PGN_1,
                time_control: "300",
                time_class: "blitz",
                end_time: Math.floor(NOW_MS / 1000),
                rated: true,
                rules: "chess",
                white: { username: "alice", rating: 1620, result: "win" },
                black: { username: "bob", rating: 1595, result: "resigned" }
              }
            ]
          })
        };
      }
    };

    const onOpenGameReview = jest.fn();
    const renderer = render(
      <GamesHubScreen
        httpClient={httpClient}
        nowMs={NOW_MS}
        service={service}
        onOpenGameReview={onOpenGameReview}
      />
    );

    expect(hasTestID(renderer, "games-empty-state")).toBe(true);
    expect(requests).toHaveLength(0);

    press(renderer, "games-empty-link-account");
    expect(hasTestID(renderer, "games-import-modal")).toBe(true);

    changeText(renderer, "games-import-username-input", "alice");
    await pressAsync(renderer, "games-import-link-submit");

    // Modal stays open after Link & Sync so users can add multiple accounts, and clears the username input.
    expect(hasTestID(renderer, "games-import-modal")).toBe(true);
    expect(findByTestID(renderer, "games-import-username-input").props.value).toBe("");
    expect(hasTestID(renderer, "games-import-status")).toBe(true);
    press(renderer, "games-import-close");
    expect(hasTestID(renderer, "games-import-modal")).toBe(false);

    expect(requests.length).toBe(2);
    expect(hasTestID(renderer, "games-empty-state")).toBe(false);
    expect(hasTestID(renderer, "games-list")).toBe(true);
    expect(hasTestID(renderer, "game-row-https://www.chess.com/game/live/1001")).toBe(true);
    expect(service.listImportedGames()).toHaveLength(1);
    expect(hasTestID(renderer, "games-sync-summary")).toBe(false);

    // Re-syncing the same game keeps no duplicates and omits any persistent sync summary badge.
    await pressAsync(renderer, "games-sync-button");
    expect(service.listImportedGames()).toHaveLength(1);
    expect(hasTestID(renderer, "games-sync-summary")).toBe(false);

    // Tapping the game row opens Game Review with the gameId.
    press(renderer, "game-row-https://www.chess.com/game/live/1001");
    expect(onOpenGameReview).toHaveBeenCalledWith("https://www.chess.com/game/live/1001");
  });

  it("imports multi-game PGN offline and reports duplicate skips", () => {
    const service = new PracticeService(new MemoryStore());
    const renderer = render(
      <GamesHubScreen
        nowMs={NOW_MS}
        service={service}
        onOpenGameReview={jest.fn()}
      />
    );

    press(renderer, "games-empty-import-pgn");
    expect(hasTestID(renderer, "games-import-pgn-form")).toBe(true);

    changeText(renderer, "games-import-pgn-input", `${SAMPLE_PGN_1}\n\n${SAMPLE_PGN_2}`);
    press(renderer, "games-import-pgn-submit");

    expect(service.listImportedGames()).toHaveLength(2);
    expect(textContent(findByTestID(renderer, "games-import-status"))).toContain("Imported 2 games");

    // Importing the same multi-game PGN again reports skipped duplicates.
    press(renderer, "games-import-pgn-submit");
    expect(service.listImportedGames()).toHaveLength(2);
    expect(textContent(findByTestID(renderer, "games-import-status"))).toContain("Imported 0, skipped 2");
  });

  it("filters games by analysis status and time class and resets filters cleanly", () => {
    const service = new PracticeService(new MemoryStore());
    service.upsertImportedGames([
      makeDraft({
        id: "g-blitz-unanalyzed",
        platform: "chess_com",
        username: "alice",
        timeClass: "blitz",
        black: { username: "BlitzFoe", rating: 1550, isAi: false }
      }),
      makeDraft({
        id: "g-rapid-analyzed",
        platform: "lichess",
        username: "alice_li",
        timeClass: "rapid",
        black: { username: "RapidFoe", rating: 1700, isAi: false }
      }),
      makeDraft({
        id: "g-bullet-partial",
        platform: "chess_com",
        username: "alice",
        timeClass: "bullet",
        black: { username: "BulletFoe", rating: 1480, isAi: false }
      })
    ]);
    service.saveGamePlyEvaluations("g-rapid-analyzed", [], {
      analysisStatus: "complete",
      analysisCheckpointPly: 6,
      whiteAccuracy: 84,
      blackAccuracy: 77
    });
    service.saveGamePlyEvaluations("g-bullet-partial", [], {
      analysisStatus: "partial",
      analysisCheckpointPly: 2
    });

    const renderer = render(
      <GamesHubScreen
        nowMs={NOW_MS}
        service={service}
        onOpenGameReview={jest.fn()}
      />
    );

    expect(hasTestID(renderer, "game-row-g-blitz-unanalyzed")).toBe(true);
    expect(hasTestID(renderer, "game-row-g-rapid-analyzed")).toBe(true);
    expect(hasTestID(renderer, "game-row-g-bullet-partial")).toBe(true);
    expect(textContent(findByTestID(renderer, "game-row-status-g-rapid-analyzed"))).toContain("84%");
    expect(textContent(findByTestID(renderer, "game-row-status-g-bullet-partial"))).toContain("Resume");
    expect(textContent(findByTestID(renderer, "game-row-status-g-blitz-unanalyzed"))).toContain("Review");

    // Expand collapsible filter drawer (matches History pattern)
    press(renderer, "games-filter-toggle");

    // Account filter inside drawer narrows games to the selected account.
    press(renderer, "games-filter-account-lichess:alice_li");
    expect(hasTestID(renderer, "game-row-g-rapid-analyzed")).toBe(true);
    expect(hasTestID(renderer, "game-row-g-blitz-unanalyzed")).toBe(false);
    press(renderer, "games-filter-account-all");

    press(renderer, "games-filter-status-analyzed");
    expect(hasTestID(renderer, "game-row-g-rapid-analyzed")).toBe(true);
    expect(hasTestID(renderer, "game-row-g-blitz-unanalyzed")).toBe(false);
    expect(hasTestID(renderer, "game-row-g-bullet-partial")).toBe(false);

    press(renderer, "games-filter-status-unanalyzed");
    expect(hasTestID(renderer, "game-row-g-rapid-analyzed")).toBe(false);
    expect(hasTestID(renderer, "game-row-g-blitz-unanalyzed")).toBe(true);
    expect(hasTestID(renderer, "game-row-g-bullet-partial")).toBe(true);

    // Unused time classes (e.g. classical) are hidden; present time classes remain filterable.
    expect(hasTestID(renderer, "games-filter-time-classical")).toBe(false);
    expect(hasTestID(renderer, "games-filter-time-rapid")).toBe(true);
    expect(hasTestID(renderer, "games-filter-time-blitz")).toBe(true);

    // Combining status="unanalyzed" with timeClass="rapid" (which is analyzed) yields empty state.
    press(renderer, "games-filter-time-rapid");
    expect(hasTestID(renderer, "games-filtered-empty")).toBe(true);

    press(renderer, "games-reset-filters");
    expect(hasTestID(renderer, "game-row-g-rapid-analyzed")).toBe(true);
    expect(hasTestID(renderer, "game-row-g-blitz-unanalyzed")).toBe(true);
  });

  it("auto-syncs incrementally on mount when autoSyncOnMount is enabled", async () => {
    const service = new PracticeService(new MemoryStore());
    service.upsertLinkedAccount({
      platform: "lichess",
      username: "alice",
      lastSyncedAt: "2026-11-19T12:00:00.000Z"
    });
    const requests: string[] = [];
    const httpClient: GameImportHttpClient = {
      async getText(url) {
        requests.push(url);
        return {
          status: 200,
          text: `${JSON.stringify({
            id: "autoSync1",
            rated: true,
            speed: "blitz",
            createdAt: Date.parse("2026-11-20T12:00:00.000Z"),
            status: "resign",
            winner: "white",
            players: {
              white: { user: { name: "alice" }, rating: 1600 },
              black: { user: { name: "bob" }, rating: 1590 }
            },
            pgn: SAMPLE_PGN_1
          })}\n`
        };
      }
    };

    const renderer = render(
      <GamesHubScreen
        autoSyncOnMount
        httpClient={httpClient}
        nowMs={NOW_MS}
        service={service}
        onOpenGameReview={jest.fn()}
      />
    );
    for (let tick = 0; tick < 6; tick += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    expect(requests.length).toBe(1);
    expect(requests[0]).toContain("since=");
    expect(service.listImportedGames()).toHaveLength(1);
    expect(hasTestID(renderer, "game-row-https://lichess.org/autoSync1")).toBe(true);
    expect(hasTestID(renderer, "games-sync-summary")).toBe(false);
  });

  it("displays all user puzzles ordered by game recency with Add All to Review, Replay launch, and Game link", () => {
    const service = new PracticeService(new MemoryStore());
    service.upsertImportedGames([
      makeDraft({
        id: "g-older",
        playedAt: "2026-11-18T12:00:00.000Z",
        black: { username: "OldFoe", rating: 1500, isAi: false }
      }),
      makeDraft({
        id: "g-newer",
        playedAt: "2026-11-20T12:00:00.000Z",
        black: { username: "NewFoe", rating: 1600, isAi: false }
      })
    ]);
    const oldPuzzles = service.replaceGameUserPuzzles(
      "g-older",
      [
        {
          idSeed: "old-ply-10",
          ply: 10,
          moveNumber: 5,
          puzzleKind: "line",
          momentKind: "opponent_blunder_missed",
          userColor: "w",
          puzzleColor: "w",
          initialFen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
          solutionMoves: ["c6d4", "f3d4", "e5d4"],
          prevCp: 20,
          cp: 320,
          winChanceSwing: 25,
          themes: ["fork"],
          lengthTag: "short",
          phaseTag: "opening",
          caliberScore: 80
        }
      ],
      { opponentName: "OldFoe", playedAt: "2026-11-18T12:00:00.000Z", timeClass: "blitz" }
    );
    const newPuzzles = service.replaceGameUserPuzzles(
      "g-newer",
      [
        {
          idSeed: "new-ply-8",
          ply: 8,
          moveNumber: 4,
          puzzleKind: "line",
          momentKind: "opponent_blunder_missed",
          userColor: "w",
          puzzleColor: "w",
          initialFen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
          solutionMoves: ["c6d4", "f3d4", "e5d4"],
          prevCp: 20,
          cp: 320,
          winChanceSwing: 25,
          themes: ["pin"],
          lengthTag: "short",
          phaseTag: "opening",
          caliberScore: 85
        }
      ],
      { opponentName: "NewFoe", playedAt: "2026-11-20T12:00:00.000Z", timeClass: "rapid" }
    );

    const onPractice = jest.fn();
    const onOpenGame = jest.fn();
    const renderer = render(
      <GamesHubScreen
        nowMs={NOW_MS}
        service={service}
        onOpenGameReview={onOpenGame}
        onPracticeMyGamePuzzles={onPractice}
      />
    );

    press(renderer, "games-hub-view-puzzles");
    expect(hasTestID(renderer, "games-puzzles-view")).toBe(true);

    // Tapping a puzzle launches Replay with game-ordered IDs (newest game first!) at its index.
    press(renderer, `games-puzzle-play-${oldPuzzles[0]!.id}`);
    expect(onPractice).toHaveBeenCalledWith({
      puzzleIds: [newPuzzles[0]!.id, oldPuzzles[0]!.id],
      initialIndex: 1
    });

    // Tapping Game › opens the source game in Game Review.
    press(renderer, `games-puzzle-open-game-${newPuzzles[0]!.id}`);
    expect(onOpenGame).toHaveBeenCalledWith("g-newer");

    // Add All to Review enrolls both puzzles.
    press(renderer, "games-puzzles-add-all-review");
    expect(service.listReviewQueue().length).toBe(2);
  });

  it("runs foreground batch analysis, auto-pauses on AppState background saving a checkpoint, and resumes to completion", async () => {
    const service = new PracticeService(new MemoryStore());
    service.upsertImportedGames([
      makeDraft({ id: "g-batch-1", pgn: SAMPLE_PGN_1 })
    ]);

    let engineCallCount = 0;
    let releaseBlockedCall: (() => void) | null = null;
    const controllableEngine: GameReviewEngine & PuzzleExtractionEngine = {
      analyze(request: GameReviewEngineRequest): Promise<EngineAnalysisLine[]> {
        engineCallCount += 1;
        // Let the first 2 plies finish immediately, then hold ply 3 until aborted or released.
        if (engineCallCount === 3) {
          return new Promise<EngineAnalysisLine[]>((resolve, reject) => {
            const onAbort = (): void => {
              const err = new Error("Aborted");
              err.name = "AbortError";
              reject(err);
            };
            if (request.signal?.aborted) {
              onAbort();
              return;
            }
            request.signal?.addEventListener("abort", onAbort, { once: true });
            releaseBlockedCall = () => {
              resolve([
                {
                  depth: 12,
                  multipv: 1,
                  move: "e2e4",
                  pv: ["e2e4"],
                  score: { kind: "cp", sideToMoveCentipawns: 20, whiteCentipawns: 20 }
                }
              ]);
            };
          });
        }
        return Promise.resolve([
          {
            depth: 12,
            multipv: 1,
            move: "e2e4",
            pv: ["e2e4", "e7e5"],
            score: { kind: "cp", sideToMoveCentipawns: 15, whiteCentipawns: 15 }
          }
        ]);
      }
    };

    const renderer = render(
      <GamesHubScreen
        analysisEngine={controllableEngine}
        nowMs={NOW_MS}
        service={service}
        onOpenGameReview={jest.fn()}
      />
    );

    // Zero engine calls before user taps Analyze recent.
    expect(engineCallCount).toBe(0);

    await act(async () => {
      press(renderer, "games-analyze-recent");
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(hasTestID(renderer, "games-batch-banner")).toBe(true);
    expect(textContent(findByTestID(renderer, "games-batch-status-text"))).toContain("Analyzing 1 of 1");

    // Simulate OS moving app to background -> immediately auto-pauses and saves partial checkpoint.
    await act(async () => {
      appStateMock.__emit("background");
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(textContent(findByTestID(renderer, "games-batch-status-text"))).toContain("Paused");
    expect(textContent(findByTestID(renderer, "games-batch-detail-text"))).toContain("Checkpoint saved");
    const checkpointGame = service.getImportedGame("g-batch-1");
    expect(checkpointGame?.analysisStatus).toBe("partial");
    expect(checkpointGame?.analysisCheckpointPly).toBeGreaterThanOrEqual(1);
    expect(service.listGamePlyEvaluations("g-batch-1").length).toBeGreaterThanOrEqual(1);

    // User explicitly taps Resume in foreground -> finishes game cleanly.
    await act(async () => {
      press(renderer, "games-batch-resume");
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(releaseBlockedCall).not.toBeNull();
    expect(service.getImportedGame("g-batch-1")?.analysisStatus).toBe("complete");
    expect(textContent(findByTestID(renderer, "games-batch-status-text"))).toContain("Analyzed 1 game");
  });

  it("supports Pause and Cancel controls during batch analysis", async () => {
    const service = new PracticeService(new MemoryStore());
    service.upsertImportedGames([
      makeDraft({ id: "g-cancel-1", pgn: SAMPLE_PGN_1 })
    ]);

    const slowEngine: GameReviewEngine & PuzzleExtractionEngine = {
      analyze(request): Promise<EngineAnalysisLine[]> {
        return new Promise((resolve, reject) => {
          const onAbort = (): void => {
            const err = new Error("Aborted");
            err.name = "AbortError";
            reject(err);
          };
          request.signal?.addEventListener("abort", onAbort, { once: true });
          void resolve;
        });
      }
    };

    const renderer = render(
      <GamesHubScreen
        analysisEngine={slowEngine}
        nowMs={NOW_MS}
        service={service}
        onOpenGameReview={jest.fn()}
      />
    );

    await act(async () => {
      press(renderer, "games-analyze-recent");
      await Promise.resolve();
    });
    expect(hasTestID(renderer, "games-batch-pause")).toBe(true);

    await act(async () => {
      press(renderer, "games-batch-cancel");
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(hasTestID(renderer, "games-batch-banner")).toBe(false);
  });

  it("shows clear 404, 429, and offline errors while keeping local games browsable and analyzable", async () => {
    const service = new PracticeService(new MemoryStore());
    service.upsertImportedGames([makeDraft({ id: "g-local-offline" })]);
    service.upsertLinkedAccount({ platform: "lichess", username: "alice" });

    let mode: "404" | "429" | "offline" = "offline";
    const failingClient: GameImportHttpClient = {
      async getText() {
        if (mode === "404") {
          return { status: 404, text: "" };
        }
        if (mode === "429") {
          return { status: 429, text: "" };
        }
        throw new Error("Network request failed");
      }
    };

    const onOpenGameReview = jest.fn();
    const renderer = render(
      <GamesHubScreen
        analysisEngine={makeFastFakeEngine()}
        httpClient={failingClient}
        nowMs={NOW_MS}
        service={service}
        onOpenGameReview={onOpenGameReview}
      />
    );

    // Offline sync error still keeps local games interactive.
    await pressAsync(renderer, "games-sync-button");
    expect(textContent(findByTestID(renderer, "games-hub-error"))).toContain("offline");
    press(renderer, "game-row-g-local-offline");
    expect(onOpenGameReview).toHaveBeenCalledWith("g-local-offline");

    // 404 in modal shows username not found error.
    mode = "404";
    press(renderer, "games-header-import");
    press(renderer, "games-import-tab-lichess");
    changeText(renderer, "games-import-username-input", "ghost_user_404");
    await pressAsync(renderer, "games-import-link-submit");
    expect(textContent(findByTestID(renderer, "games-import-error"))).toContain("Username not found");

    // 429 in modal shows rate-limited error.
    mode = "429";
    await pressAsync(renderer, "games-import-link-submit");
    expect(textContent(findByTestID(renderer, "games-import-error"))).toContain("Too many requests");
  });

  it("shows Practice My Game Puzzles CTA when user puzzles exist", () => {
    const service = new PracticeService(new MemoryStore());
    service.upsertImportedGames([makeDraft({ id: "g-with-puzzles" })]);
    service.replaceGameUserPuzzles(
      "g-with-puzzles",
      [
        {
          idSeed: "ply-10",
          ply: 10,
          moveNumber: 5,
          puzzleKind: "line",
          momentKind: "opponent_blunder_missed",
          userColor: "w",
          puzzleColor: "w",
          initialFen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
          solutionMoves: ["c6d4", "f3d4", "e5d4"],
          prevCp: 20,
          cp: 320,
          winChanceSwing: 25,
          themes: ["fork"],
          lengthTag: "short",
          phaseTag: "opening",
          caliberScore: 80
        }
      ],
      { opponentName: "bob", timeClass: "blitz" }
    );

    const onPractice = jest.fn();
    const renderer = render(
      <GamesHubScreen
        nowMs={NOW_MS}
        service={service}
        onOpenGameReview={jest.fn()}
        onPracticeMyGamePuzzles={onPractice}
      />
    );

    // Practice My Game Puzzles CTA lives in the Puzzles tab to avoid duplicating Games view
    expect(hasTestID(renderer, "games-practice-puzzles-cta")).toBe(false);
    press(renderer, "games-hub-view-puzzles");
    expect(textContent(findByTestID(renderer, "games-practice-puzzles-cta"))).toContain(
      "Practice My Game Puzzles (1)"
    );
    press(renderer, "games-practice-puzzles-cta");
    expect(onPractice).toHaveBeenCalledTimes(1);
  });

  it("supports importing up to 100 games and loading older games on demand via until cursor", async () => {
    const service = new PracticeService(new MemoryStore());
    const oldestPlayedAt = "2026-03-05T12:00:00.000Z";
    const oldestMs = Date.parse(oldestPlayedAt);
    service.upsertLinkedAccount({
      platform: "lichess",
      username: "alice",
      lastSyncedAt: "2026-03-10T12:00:00.000Z"
    });
    service.upsertImportedGames([
      makeDraft({
        id: "https://lichess.org/existing1",
        platform: "lichess",
        username: "alice",
        playedAt: oldestPlayedAt
      })
    ]);

    const requestedUrls: string[] = [];
    const client: GameImportHttpClient = {
      async getText(url) {
        requestedUrls.push(url);
        return {
          status: 200,
          text: JSON.stringify({
            id: "OlderGame1",
            variant: "standard",
            speed: "blitz",
            rated: true,
            lastMoveAt: oldestMs - 86_400_000,
            status: "mate",
            winner: "white",
            players: {
              white: { user: { name: "alice", id: "alice" }, rating: 1500 },
              black: { user: { name: "bob", id: "bob" }, rating: 1490 }
            },
            pgn: SAMPLE_PGN_1
          })
        };
      }
    };

    const renderer = render(
      <GamesHubScreen
        httpClient={client}
        nowMs={NOW_MS}
        service={service}
        onOpenGameReview={jest.fn()}
      />
    );

    // Import modal exposes 100 recent games option
    press(renderer, "games-header-import");
    expect(hasTestID(renderer, "games-import-max-100")).toBe(true);
    press(renderer, "games-import-close");

    // Pressing Import older games (+50) passes until=<oldestMs> and inserts the older game
    await pressAsync(renderer, "games-load-older");
    expect(requestedUrls[0]).toContain(`until=${oldestMs}`);
    expect(service.listImportedGames().some((g) => g.id === "https://lichess.org/OlderGame1")).toBe(true);
    // Preserves forward sync cursor
    expect(service.listLinkedAccounts()[0]?.lastSyncedAt).toBe("2026-03-10T12:00:00.000Z");

    // With 2+ linked accounts and no account filter, Import more… opens a picker so user chooses which account imports +50.
    service.upsertLinkedAccount({
      platform: "chess_com",
      username: "alice_cc",
      lastSyncedAt: "2026-03-10T12:00:00.000Z"
    });
    const rendererMulti = render(
      <GamesHubScreen
        httpClient={client}
        nowMs={NOW_MS}
        service={service}
        onOpenGameReview={jest.fn()}
      />
    );
    requestedUrls.length = 0;
    press(rendererMulti, "games-load-older");
    expect(hasTestID(rendererMulti, "games-import-older-picker")).toBe(true);
    expect(requestedUrls).toHaveLength(0);

    await pressAsync(rendererMulti, "games-older-picker-lichess-alice");
    expect(hasTestID(rendererMulti, "games-import-older-picker")).toBe(false);
    expect(requestedUrls).toHaveLength(1);
    expect(requestedUrls[0]).toContain("lichess.org/api/games/user/alice");
  });

  it("paginates large games lists in 50-item pages and supports theme/type filters in Puzzles view", () => {
    const service = new PracticeService(new MemoryStore());
    const manyGames = Array.from({ length: 65 }, (_, index) =>
      makeDraft({
        id: `g-page-${index}`,
        playedAt: new Date(NOW_MS - index * 60_000).toISOString()
      })
    );
    service.upsertImportedGames(manyGames);
    service.replaceGameUserPuzzles(
      "g-page-0",
      [
        {
          idSeed: "p-fork",
          ply: 10,
          moveNumber: 5,
          puzzleKind: "line",
          momentKind: "opponent_blunder_missed",
          userColor: "w",
          puzzleColor: "w",
          initialFen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
          solutionMoves: ["c6d4", "f3d4", "e5d4"],
          prevCp: 20,
          cp: 320,
          winChanceSwing: 25,
          themes: ["fork"],
          lengthTag: "short",
          phaseTag: "opening",
          caliberScore: 80
        },
        {
          idSeed: "p-pin",
          ply: 14,
          moveNumber: 7,
          puzzleKind: "arrow_duel",
          momentKind: "own_blunder_punished",
          userColor: "w",
          puzzleColor: "w",
          initialFen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
          solutionMoves: ["c6d4", "f3d4"],
          prevCp: 20,
          cp: -280,
          winChanceSwing: 30,
          themes: ["pin"],
          lengthTag: "oneMove",
          phaseTag: "opening",
          caliberScore: 85
        }
      ],
      { opponentName: "bob", timeClass: "blitz" }
    );

    const renderer = render(
      <GamesHubScreen
        nowMs={NOW_MS}
        service={service}
        onOpenGameReview={jest.fn()}
        onPracticeMyGamePuzzles={jest.fn()}
      />
    );

    // Games list paginates at 50 initially and reveals the rest via Show more.
    expect(hasTestID(renderer, "game-row-g-page-0")).toBe(true);
    expect(hasTestID(renderer, "game-row-g-page-49")).toBe(true);
    expect(hasTestID(renderer, "game-row-g-page-50")).toBe(false);
    expect(textContent(findByTestID(renderer, "games-show-more"))).toContain("50/65");

    press(renderer, "games-show-more");
    expect(hasTestID(renderer, "game-row-g-page-64")).toBe(true);
    expect(hasTestID(renderer, "games-show-more")).toBe(false);

    // Puzzles view exposes type and tactical theme filters inside the filter drawer.
    press(renderer, "games-hub-view-puzzles");
    press(renderer, "games-filter-toggle");
    expect(hasTestID(renderer, "games-puzzle-kind-filters")).toBe(true);
    expect(hasTestID(renderer, "games-puzzle-theme-filters")).toBe(true);

    const puzzles = service.listUserPuzzles();
    const forkPuzzle = puzzles.find((p) => p.themes.includes("fork"))!;
    const pinPuzzle = puzzles.find((p) => p.themes.includes("pin"))!;

    press(renderer, "games-filter-puzzle-theme-fork");
    expect(hasTestID(renderer, `games-puzzle-row-${forkPuzzle.id}`)).toBe(true);
    expect(hasTestID(renderer, `games-puzzle-row-${pinPuzzle.id}`)).toBe(false);

    press(renderer, "games-filter-drawer-reset");
    expect(hasTestID(renderer, `games-puzzle-row-${pinPuzzle.id}`)).toBe(true);
  });

  it("renders Games as the 5th tab in PracticePocScreen and wires back intent cleanly", () => {
    const service = createMobilePracticeService();
    service.upsertImportedGames([makeDraft({ id: "g-host-tab" })]);
    const onOpenGameReview = jest.fn();

    const renderer = render(
      <PracticePocScreen
        initialTab="practice"
        platformCapabilities={makeCapabilities(service)}
        onOpenGameReview={onOpenGameReview}
      />
    );

    expect(hasTestID(renderer, "games-tab")).toBe(true);
    press(renderer, "games-tab");
    expect(hasTestID(renderer, "games-hub-screen")).toBe(true);

    press(renderer, "game-row-g-host-tab");
    expect(onOpenGameReview).toHaveBeenCalledWith("g-host-tab");

    const gameReviewState: MobileBackState = {
      activePractice: false,
      activeSurvival: false,
      detail: { kind: "game-review", owner: "games" },
      tab: "games",
      topTransient: null
    };
    const backFromReview = resolveMobileBackIntent(gameReviewState, "button");
    expect(backFromReview).toEqual({ kind: "return-to-owner", owner: "games" });
    expect(mobileBackDestination(backFromReview, gameReviewState)).toEqual({
      label: "Games",
      testID: "tab-games"
    });

    const gamesRootState: MobileBackState = {
      activePractice: false,
      activeSurvival: false,
      detail: null,
      tab: "games",
      topTransient: null
    };
    expect(resolveMobileBackIntent(gamesRootState, "button")).toEqual({
      kind: "return-to-practice"
    });
  });

  it("composes CompositePuzzleSource in pack-backed mobile PracticeService so ug_* puzzles work seamlessly", () => {
    const userStore = new MemoryStore();
    const packStore = new MemoryStore();
    const service = composePackBackedMobilePracticeService(
      userStore,
      packStore,
      new MemoryTacticalProfileRepository()
    );
    const reviewStore = getPracticeStoreForGameReview(service);
    reviewStore.upsertImportedGames([makeDraft({ id: "g-composite-1" })]);
    const [stored] = reviewStore.replaceGameUserPuzzles(
      "g-composite-1",
      [
        {
          idSeed: "ply-12",
          ply: 12,
          moveNumber: 6,
          puzzleKind: "line",
          momentKind: "opponent_blunder_missed",
          userColor: "w",
          puzzleColor: "w",
          initialFen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
          solutionMoves: ["c6d4", "f3d4", "e5d4"],
          prevCp: 20,
          cp: 340,
          winChanceSwing: 28,
          themes: ["fork"],
          lengthTag: "short",
          phaseTag: "opening",
          caliberScore: 85
        }
      ],
      { opponentName: "bob", timeClass: "blitz" }
    );

    expect(stored?.id.startsWith("ug_")).toBe(true);
    const sprint = service.startMyGamePuzzlesSession({ targetCorrect: 1 }, NOW_ISO);
    expect(sprint.puzzles[0]?.id).toBe(stored?.id);
  });

  it("skips out-of-band over-rated puzzles during Add All to Review while allowing manual enrollment", () => {
    const store = new MemoryStore();
    const service = new PracticeService(store);
    service.upsertImportedGames([
      makeDraft({
        id: "g-diff-filter",
        userColor: "w",
        white: { username: "alice", rating: 1400, isAi: false },
        black: { username: "bob", rating: 1420, isAi: false }
      })
    ]);
    const stored = store.replaceGameUserPuzzles(
      "g-diff-filter",
      [
        {
          idSeed: "ply-10",
          ply: 10,
          moveNumber: 5,
          puzzleKind: "line",
          momentKind: "opponent_blunder_missed",
          userColor: "w",
          puzzleColor: "w",
          initialFen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
          solutionMoves: ["c6d4", "f3d4", "e5d4"],
          prevCp: 20,
          cp: 340,
          winChanceSwing: 28,
          themes: ["fork"],
          lengthTag: "short",
          phaseTag: "opening",
          caliberScore: 85,
          estimatedRating: 1380,
          ratingSource: "maia2_sf_v1"
        },
        {
          idSeed: "ply-20",
          ply: 20,
          moveNumber: 10,
          puzzleKind: "line",
          momentKind: "opponent_mistake_missed",
          userColor: "w",
          puzzleColor: "w",
          initialFen: "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R b KQkq - 0 4",
          solutionMoves: ["d7d6", "c2c3", "e8g8"],
          prevCp: 10,
          cp: 280,
          winChanceSwing: 25,
          themes: ["quietMove"],
          lengthTag: "short",
          phaseTag: "middlegame",
          caliberScore: 60,
          estimatedRating: 1950,
          ratingSource: "maia2_sf_v1"
        }
      ],
      { opponentName: "bob", timeClass: "rapid" }
    );

    const renderer = render(
      <GamesHubScreen
        nowMs={NOW_MS}
        service={service}
        onOpenGameReview={jest.fn()}
        onPracticeMyGamePuzzles={jest.fn()}
      />
    );

    press(renderer, "games-hub-view-puzzles");
    // Add All to Review enrolls the ~1380 puzzle and skips the ~1950 (> 1400 + 300) puzzle.
    press(renderer, "games-puzzles-add-all-review");
    const enrolled = service.listReviewQueue();
    expect(enrolled.length).toBe(1);
    expect(enrolled[0]?.puzzleId).toBe(stored[0]?.id);

    // Difficulty filter pills toggle between At my level and Stretch puzzles cleanly.
    press(renderer, "games-filter-toggle");
    expect(hasTestID(renderer, "games-puzzle-difficulty-filters")).toBe(true);
    press(renderer, "games-filter-puzzle-difficulty-at_level");
    expect(hasTestID(renderer, `games-puzzle-row-${stored[0]!.id}`)).toBe(true);
    expect(hasTestID(renderer, `games-puzzle-row-${stored[1]!.id}`)).toBe(false);

    press(renderer, "games-filter-puzzle-difficulty-stretch");
    expect(hasTestID(renderer, `games-puzzle-row-${stored[0]!.id}`)).toBe(false);
    expect(hasTestID(renderer, `games-puzzle-row-${stored[1]!.id}`)).toBe(true);
  });

  it("automatically backfills difficulty ratings for existing unrated user puzzles when an engine is available", async () => {
    const store = new MemoryStore();
    const service = new PracticeService(store);
    service.upsertImportedGames([
      makeDraft({
        id: "g-backfill",
        userColor: "w",
        white: { username: "alice", rating: 1400, isAi: false },
        black: { username: "bob", rating: 1400, isAi: false }
      })
    ]);
    const stored = store.replaceGameUserPuzzles(
      "g-backfill",
      [
        {
          idSeed: "ply-10",
          ply: 10,
          moveNumber: 5,
          puzzleKind: "line",
          momentKind: "opponent_blunder_missed",
          userColor: "w",
          puzzleColor: "w",
          initialFen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
          solutionMoves: ["c6d4", "f3d4", "e5d4"],
          prevCp: 20,
          cp: 340,
          winChanceSwing: 28,
          themes: ["fork"],
          lengthTag: "short",
          phaseTag: "opening",
          caliberScore: 85
        }
      ],
      { opponentName: "bob", timeClass: "rapid", ratingAnchor: 1400 }
    );
    expect(stored[0]?.ratingSource).toBe("game_anchor");

    const stubEngine = {
      async analyze() {
        return [
          {
            multipv: 1,
            depth: 8,
            move: "f3d4",
            score: { kind: "cp" as const, sideToMoveCentipawns: 340, whiteCentipawns: 340 },
            pv: ["f3d4", "e5d4"]
          },
          {
            multipv: 2,
            depth: 8,
            move: "c2c3",
            score: { kind: "cp" as const, sideToMoveCentipawns: 20, whiteCentipawns: 20 },
            pv: ["c2c3", "d4f3"]
          }
        ];
      }
    };

    render(
      <GamesHubScreen
        analysisEngine={stubEngine}
        nowMs={NOW_MS}
        service={service}
        onOpenGameReview={jest.fn()}
        onPracticeMyGamePuzzles={jest.fn()}
      />
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });

    const updated = store.getUserPuzzle(stored[0]!.id);
    expect(updated?.ratingSource).toBe("sf_heuristic_v1");
    expect(updated?.rating).toBeGreaterThanOrEqual(600);
    expect(updated?.rating).toBeLessThanOrEqual(2200);
  });

  it("does not submit on keyboard Done and supports Unlink-only vs Unlink-and-delete-data confirmations", () => {
    const service = new PracticeService(new MemoryStore());
    service.upsertLinkedAccount({ platform: "chess_com", username: "alice" });
    service.upsertLinkedAccount({ platform: "lichess", username: "bob" });
    service.upsertImportedGames([
      makeDraft({ id: "g-alice-1", platform: "chess_com", username: "alice" }),
      makeDraft({ id: "g-bob-1", platform: "lichess", username: "bob" })
    ]);
    service.replaceGameUserPuzzles(
      "g-alice-1",
      [
        {
          idSeed: "alice-ply-6",
          ply: 6,
          moveNumber: 3,
          puzzleKind: "line",
          momentKind: "opponent_blunder_missed",
          userColor: "w",
          puzzleColor: "w",
          initialFen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
          solutionMoves: ["c6d4", "f3d4", "e5d4"],
          prevCp: 20,
          cp: 340,
          winChanceSwing: 28,
          themes: ["fork"],
          lengthTag: "short",
          phaseTag: "opening",
          caliberScore: 85
        }
      ],
      { opponentName: "foe", timeClass: "blitz" }
    );
    const bobPuzzles = service.replaceGameUserPuzzles(
      "g-bob-1",
      [
        {
          idSeed: "bob-ply-6",
          ply: 6,
          moveNumber: 3,
          puzzleKind: "line",
          momentKind: "opponent_blunder_missed",
          userColor: "w",
          puzzleColor: "w",
          initialFen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
          solutionMoves: ["c6d4", "f3d4", "e5d4"],
          prevCp: 20,
          cp: 340,
          winChanceSwing: 28,
          themes: ["fork"],
          lengthTag: "short",
          phaseTag: "opening",
          caliberScore: 85
        }
      ],
      { opponentName: "foe", timeClass: "rapid" }
    );
    service.enrollReview({
      puzzleId: bobPuzzles[0]!.id,
      mode: "standard",
      ratingKey: "ug_my_game_puzzles:standard"
    });

    const renderer = render(
      <GamesHubScreen
        nowMs={NOW_MS}
        service={service}
        onOpenGameReview={jest.fn()}
      />
    );

    press(renderer, "games-header-import");
    const usernameInput = findByTestID(renderer, "games-import-username-input");
    expect(usernameInput.props.onSubmitEditing).toBeUndefined();

    // Unlink alice only: removes linked account but keeps imported games & puzzles.
    press(renderer, "games-remove-account-chess_com-alice");
    expect(hasTestID(renderer, "games-unlink-confirm-chess_com-alice")).toBe(true);
    press(renderer, "games-unlink-only-chess_com-alice");
    expect(service.listLinkedAccounts().map((a) => a.username)).toEqual(["bob"]);
    expect(service.getImportedGame("g-alice-1")).toBeDefined();
    expect(service.listUserPuzzles({ gameId: "g-alice-1" })).toHaveLength(1);

    // Unlink bob & delete data: removes linked account, bob's games, bob's user puzzles, and review entry.
    press(renderer, "games-remove-account-lichess-bob");
    expect(hasTestID(renderer, "games-unlink-confirm-lichess-bob")).toBe(true);
    press(renderer, "games-unlink-delete-lichess-bob");
    expect(service.listLinkedAccounts()).toHaveLength(0);
    expect(service.getImportedGame("g-bob-1")).toBeUndefined();
    expect(service.listUserPuzzles({ gameId: "g-bob-1" })).toHaveLength(0);
    expect(service.listReviewQueue()).toHaveLength(0);
    // Alice's retained data remains untouched.
    expect(service.getImportedGame("g-alice-1")).toBeDefined();
    expect(service.listUserPuzzles({ gameId: "g-alice-1" })).toHaveLength(1);
  });
});
