import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { AppState, Pressable, Text, View } from "react-native";
import {
  parsePgnGame,
  type EngineAnalysisLine,
  type EngineSearchRequest,
  type ExtractedGamePuzzle,
  type GameHighlightMoment
} from "../../../packages/core/src/index.ts";
import {
  MemoryStore,
  PracticeService,
  type StoredGamePlyEval,
  type StoredImportedGame
} from "../../../packages/storage/src/index.ts";
import {
  GameReviewScreen,
  reviewContextForUserPuzzle,
  type GameReviewBoardProps,
  type GameReviewLiveEngine
} from "../src/components/gameReview/index.tsx";
import { PracticeViewportProvider } from "../src/components/PracticeViewport.tsx";
import { ThemeProvider } from "../src/theme/index.ts";

const SAMPLE_PGN = [
  '[Event "Rated Blitz game"]',
  '[White "Alice"]',
  '[Black "Bob"]',
  '[Result "0-1"]',
  '[TimeControl "300+0"]',
  "",
  "1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qf3 Nd4 5. Qc3 Nxe4 0-1"
].join("\n");

const PARSED_SAMPLE = parsePgnGame(SAMPLE_PGN);

// Board test double exposing the current FEN, flip state, and a deterministic move trigger.
let latestBoardProps: GameReviewBoardProps | null = null;
function MockReviewBoard(props: GameReviewBoardProps): React.JSX.Element {
  latestBoardProps = props;
  return (
    <View testID="mock-review-board">
      <Text testID="mock-board-fen">{props.fen}</Text>
      <Text testID="mock-board-flipped">{props.flipped ? "black" : "white"}</Text>
    </View>
  );
}

function triggerBoardUciMove(uci: string): void {
  if (!latestBoardProps?.onMove) {
    throw new Error("Mock board has no onMove handler");
  }
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;
  latestBoardProps.onMove({
    move: {
      from,
      to,
      ...(promotion ? { promotion } : {})
    },
    state: {
      fen: latestBoardProps.fen,
      isPromotion: Boolean(promotion)
    }
  } as Parameters<NonNullable<GameReviewBoardProps["onMove"]>>[0]);
}

function createSampleGame(overrides: Partial<StoredImportedGame> = {}): StoredImportedGame {
  return {
    id: "game-767-1",
    platform: "lichess",
    username: "Alice",
    userColor: "w",
    playedAt: "2026-11-20T12:00:00.000Z",
    timeControl: "300+0",
    timeClass: "blitz",
    rated: true,
    white: { username: "Alice", rating: 1550, isAi: false },
    black: { username: "Bob", rating: 1540, isAi: false },
    winner: "b",
    termination: "resign",
    pgn: SAMPLE_PGN,
    analysisStatus: "complete",
    analysisCheckpointPly: PARSED_SAMPLE.plies.length,
    whiteAccuracy: 74,
    blackAccuracy: 86,
    puzzleCount: 2,
    createdAt: "2026-11-20T12:05:00.000Z",
    updatedAt: "2026-11-20T12:05:00.000Z",
    ...overrides
  };
}

function buildSamplePlyEvals(gameId: string): StoredGamePlyEval[] {
  const scoresByPly: Array<{ cp: number; cls: StoredGamePlyEval["classification"]; win: number }> = [
    { cp: 20, cls: "book", win: 52 },
    { cp: 15, cls: "book", win: 51 },
    { cp: -30, cls: "inaccuracy", win: 47 },
    { cp: -20, cls: "best", win: 48 },
    { cp: -25, cls: "good", win: 48 },
    { cp: 900, cls: "blunder", win: 96 }, // ply 6: 3... Nf6 allows Qxf7#
    { cp: -40, cls: "missed_win", win: 46 }, // ply 7: 4. Qf3 misses Qxf7#
    { cp: -60, cls: "best", win: 44 },
    { cp: -350, cls: "blunder", win: 21 }, // ply 9: 5. Qc3 drops e4
    { cp: -360, cls: "best", win: 20 }
  ];

  return PARSED_SAMPLE.plies.map((ply, index) => {
    const entry = scoresByPly[index] ?? { cp: 0, cls: "good", win: 50 };
    const prevWin = index > 0 ? (scoresByPly[index - 1]?.win ?? 50) : 50;
    const moverBefore = ply.color === "w" ? prevWin : 100 - prevWin;
    const moverAfter = ply.color === "w" ? entry.win : 100 - entry.win;
    return {
      gameId,
      ply: ply.ply,
      moveNumber: ply.moveNumber,
      color: ply.color,
      uci: ply.uci,
      san: ply.san,
      fenBefore: ply.fenBefore,
      fenAfter: ply.fenAfter,
      evalKind: "cp",
      whiteScore: entry.cp,
      sideToMoveScore: ply.color === "w" ? -entry.cp : entry.cp,
      whiteWinPercent: entry.win,
      moverWinPercentBefore: moverBefore,
      moverWinPercentAfter: moverAfter,
      winPercentLoss: Math.max(0, moverBefore - moverAfter),
      classification: entry.cls,
      clockBucket: "unknown",
      isKeyMomentCandidate: entry.cls === "blunder" || entry.cls === "missed_win",
      fromPreExistingEval: false,
      deepVerified: true
    };
  });
}

function buildSampleExtractedPuzzles(): ExtractedGamePuzzle[] {
  const ply6 = PARSED_SAMPLE.plies[5]!; // 3... Nf6
  const ply9 = PARSED_SAMPLE.plies[8]!; // 5. Qc3

  const linePuzzle: ExtractedGamePuzzle = {
    idSeed: "ply-6-line",
    ply: 6,
    moveNumber: 3,
    puzzleKind: "line",
    momentKind: "opponent_blunder_missed",
    userColor: "w",
    puzzleColor: "w",
    initialFen: ply6.fenBefore,
    solutionMoves: ["g8f6", "h5f7"],
    prevCp: -25,
    cp: 10000,
    winChanceSwing: 0.9,
    themes: ["mateIn1", "short"],
    lengthTag: "oneMove",
    phaseTag: "opening",
    caliberScore: 92
  };

  const arrowDuelPuzzle: ExtractedGamePuzzle = {
    idSeed: "ply-9-duel",
    ply: 9,
    moveNumber: 5,
    puzzleKind: "arrow_duel",
    momentKind: "own_blunder_escaped",
    userColor: "w",
    puzzleColor: "w",
    initialFen: ply9.fenBefore,
    solutionMoves: ["f3c3", "f6e4", "c3d3", "d7d5"],
    prevCp: -60,
    cp: -350,
    winChanceSwing: 0.45,
    arrowDuel: {
      bestMove: "f3d1",
      blunderMove: "f3c3",
      bestEvalWhite: -40,
      blunderEvalWhite: -350,
      punishmentLine: ["f6e4", "c3d3", "d7d5"],
      decisionFen: ply9.fenBefore
    },
    themes: ["hangingPiece", "fork"],
    lengthTag: "short",
    phaseTag: "opening",
    caliberScore: 84
  };

  return [linePuzzle, arrowDuelPuzzle];
}

function setupAnalyzedStore(): {
  store: MemoryStore;
  service: PracticeService;
  game: StoredImportedGame;
} {
  const store = new MemoryStore();
  const service = new PracticeService(store);
  const draft = createSampleGame();
  store.upsertImportedGames([draft], draft.createdAt);
  store.saveGamePlyEvaluations(draft.id, buildSamplePlyEvals(draft.id), {
    analysisStatus: "complete",
    analysisCheckpointPly: PARSED_SAMPLE.plies.length,
    whiteAccuracy: 74,
    blackAccuracy: 86,
    updatedAt: draft.updatedAt
  });
  store.replaceGameUserPuzzles(draft.id, buildSampleExtractedPuzzles(), {
    opponentName: "Bob",
    playedAt: draft.playedAt,
    timeClass: draft.timeClass,
    ratingAnchor: 1550
  });
  const storedGame = store.getImportedGame(draft.id)!;
  return { store, service, game: storedGame };
}

function findByTestId(
  renderer: TestRenderer.ReactTestRenderer,
  testID: string
): TestRenderer.ReactTestInstance {
  const matches = renderer.root.findAll((node) => node.props?.testID === testID);
  if (matches.length === 0) {
    throw new Error(`Could not find node with testID="${testID}"`);
  }
  return matches[0]!;
}

function queryByTestId(
  renderer: TestRenderer.ReactTestRenderer,
  testID: string
): TestRenderer.ReactTestInstance | null {
  const matches = renderer.root.findAll((node) => node.props?.testID === testID);
  return matches[0] ?? null;
}

function textContent(node: TestRenderer.ReactTestInstance): string {
  return node.findAllByType(Text)
    .map((textNode) => {
      const children = textNode.props.children;
      return Array.isArray(children) ? children.join("") : String(children ?? "");
    })
    .join(" ")
    .trim();
}

async function flushAsync(ticks = 6): Promise<void> {
  for (let index = 0; index < ticks; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("GameReviewScreen (#767)", () => {
  beforeEach(() => {
    latestBoardProps = null;
    (AppState as unknown as { __reset?: () => void }).__reset?.();
  });

  it("loads an already-analyzed game offline with zero engine calls and renders summary & eval graph", () => {
    const { store, service, game } = setupAnalyzedStore();
    const analyzeSpy = jest.fn<Promise<EngineAnalysisLine[]>, [EngineSearchRequest]>();
    const engine: GameReviewLiveEngine = { analyze: analyzeSpy };

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ThemeProvider appearance="light">
          <PracticeViewportProvider value={{ width: 390, height: 844, fontScale: 1 }}>
            <GameReviewScreen
              BoardComponent={MockReviewBoard}
              engine={engine}
              game={game}
              practiceService={service}
              store={store}
            />
          </PracticeViewportProvider>
        </ThemeProvider>
      );
    });

    expect(analyzeSpy).not.toHaveBeenCalled();
    expect(queryByTestId(renderer, "game-review-scan-banner")).toBeNull();
    expect(findByTestId(renderer, "game-review-eval-graph")).toBeTruthy();
    expect(findByTestId(renderer, "game-review-summary-card")).toBeTruthy();
    expect(textContent(findByTestId(renderer, "game-review-accuracy-white-value"))).toBe("74%");
    expect(textContent(findByTestId(renderer, "game-review-accuracy-black-value"))).toBe("86%");
    expect(textContent(findByTestId(renderer, "key-moment-counter"))).toBe("Key Moment 1 / 2");
    expect(textContent(findByTestId(renderer, "mock-board-flipped"))).toBe("white");

    act(() => renderer.unmount());
  });

  it("streams Pass-1 evaluations, runs Pass-2 extraction, saves puzzles, and transitions to complete", async () => {
    const store = new MemoryStore();
    const service = new PracticeService(store);
    const shortPgn = [
      '[Event "Blitz"]',
      '[White "Alice"]',
      '[Black "Bob"]',
      '[Result "*"]',
      '[TimeControl "300+0"]',
      "",
      "1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 *"
    ].join("\n");
    const draft = createSampleGame({
      id: "game-streaming-1",
      pgn: shortPgn,
      analysisStatus: "none",
      analysisCheckpointPly: 0,
      whiteAccuracy: undefined,
      blackAccuracy: undefined,
      puzzleCount: 0
    });
    store.upsertImportedGames([draft], draft.createdAt);
    const unanalyzedGame = store.getImportedGame(draft.id)!;

    const analyzeSpy = jest.fn(async (req: EngineSearchRequest): Promise<EngineAnalysisLine[]> => {
      // Return realistic evaluations; after 3... Nf6, White has mate in 1 (h5f7).
      if (req.fen.includes("r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3")) {
        return [
          {
            move: "h5f7",
            pv: ["h5f7"],
            multipv: 1,
            depth: 12,
            score: { kind: "mate", sideToMoveMate: 1, whiteMate: 1 }
          }
        ];
      }
      return [
        {
          move: "e2e4",
          pv: ["e2e4"],
          multipv: 1,
          depth: 12,
          score: { kind: "cp", sideToMoveCentipawns: 20, whiteCentipawns: 20 }
        }
      ];
    });
    const engine: GameReviewLiveEngine = { analyze: analyzeSpy };

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ThemeProvider appearance="light">
          <PracticeViewportProvider value={{ width: 390, height: 844, fontScale: 1 }}>
            <GameReviewScreen
              BoardComponent={MockReviewBoard}
              checkpointIntervalPlies={2}
              engine={engine}
              game={unanalyzedGame}
              practiceService={service}
              store={store}
            />
          </PracticeViewportProvider>
        </ThemeProvider>
      );
    });

    await flushAsync(20);

    expect(analyzeSpy).toHaveBeenCalled();
    const updatedGame = store.getImportedGame(draft.id);
    expect(updatedGame?.analysisStatus).toBe("complete");
    expect(store.listGamePlyEvaluations(draft.id)).toHaveLength(6);
    expect(queryByTestId(renderer, "game-review-scan-banner")).toBeNull();
    expect(findByTestId(renderer, "eval-graph-point-6")).toBeTruthy();

    act(() => renderer.unmount());
  });

  it("jumps directly to the tapped ply when tapping the interactive Eval Graph and supports move navigation + flip", () => {
    const { store, service, game } = setupAnalyzedStore();

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ThemeProvider appearance="light">
          <PracticeViewportProvider value={{ width: 390, height: 844, fontScale: 1 }}>
            <GameReviewScreen
              BoardComponent={MockReviewBoard}
              game={game}
              practiceService={service}
              store={store}
            />
          </PracticeViewportProvider>
        </ThemeProvider>
      );
    });

    // Tap ply 5 on Eval Graph
    act(() => {
      findByTestId(renderer, "eval-graph-point-5").props.onPress();
    });
    expect(textContent(findByTestId(renderer, "mock-board-fen"))).toBe(
      PARSED_SAMPLE.plies[4]!.fenAfter
    );

    // Step forward to ply 6
    act(() => {
      findByTestId(renderer, "game-review-step-next").props.onPress();
    });
    expect(textContent(findByTestId(renderer, "mock-board-fen"))).toBe(
      PARSED_SAMPLE.plies[5]!.fenAfter
    );

    // Flip board
    act(() => {
      findByTestId(renderer, "game-review-flip-board").props.onPress();
    });
    expect(textContent(findByTestId(renderer, "mock-board-flipped"))).toBe("black");

    act(() => renderer.unmount());
  });

  it("handles Line Key Moment Retry: solved does NOT auto-enroll in Review (manual toggle works), failed auto-enrolls in Review", () => {
    const { store, service, game } = setupAnalyzedStore();
    const puzzles = store.listUserPuzzles({ gameId: game.id });
    const linePuzzle = puzzles.find((p) => p.puzzleKind === "line")!;
    const lineCtx = reviewContextForUserPuzzle(linePuzzle);

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ThemeProvider appearance="light">
          <PracticeViewportProvider value={{ width: 390, height: 844, fontScale: 1 }}>
            <GameReviewScreen
              BoardComponent={MockReviewBoard}
              game={game}
              practiceService={service}
              store={store}
            />
          </PracticeViewportProvider>
        </ThemeProvider>
      );
    });

    // Moment 1 is the Line puzzle (3... Nf6 -> White plays h5f7#). Answer must be hidden in prompt.
    expect(queryByTestId(renderer, "game-review-arrow-overlay")).toBeNull();
    expect(textContent(findByTestId(renderer, "game-review-eval-bar-label"))).toBe("—");

    // Solve it correctly on board
    act(() => {
      triggerBoardUciMove("h5f7");
    });

    expect(findByTestId(renderer, "key-moment-solved-state")).toBeTruthy();
    expect(service.getReviewQueueState(lineCtx)).toBeUndefined();

    // One-tap manual enrollment into Review
    act(() => {
      findByTestId(renderer, "key-moment-review-toggle").props.onPress();
    });
    expect(service.getReviewQueueState(lineCtx)).toBeDefined();

    // Remove back out, then retry and fail it to verify auto-enrollment
    act(() => {
      findByTestId(renderer, "key-moment-review-toggle").props.onPress();
    });
    expect(service.getReviewQueueState(lineCtx)).toBeUndefined();

    // Switch to Retry via skip -> retry OR recreate clean failure in a fresh screen
    act(() => renderer.unmount());

    const second = setupAnalyzedStore();
    const secondLine = second.store
      .listUserPuzzles({ gameId: second.game.id })
      .find((p) => p.puzzleKind === "line")!;
    const secondCtx = reviewContextForUserPuzzle(secondLine);

    act(() => {
      renderer = TestRenderer.create(
        <ThemeProvider appearance="light">
          <PracticeViewportProvider value={{ width: 390, height: 844, fontScale: 1 }}>
            <GameReviewScreen
              BoardComponent={MockReviewBoard}
              game={second.game}
              practiceService={second.service}
              store={second.store}
            />
          </PracticeViewportProvider>
        </ThemeProvider>
      );
    });

    // Play wrong move (4. Qf3 = h5f3 instead of h5f7#)
    act(() => {
      triggerBoardUciMove("h5f3");
    });

    expect(findByTestId(renderer, "key-moment-failed-state")).toBeTruthy();
    expect(findByTestId(renderer, "key-moment-auto-enrolled-badge")).toBeTruthy();
    expect(second.service.getReviewQueueState(secondCtx)).toBeDefined();

    // User can still remove it from Review
    act(() => {
      findByTestId(renderer, "key-moment-review-toggle").props.onPress();
    });
    expect(second.service.getReviewQueueState(secondCtx)).toBeUndefined();

    act(() => renderer.unmount());
  });

  it("handles Arrow Duel Key Moment Retry: shows both candidates, escaped tag, punishment line on fail & auto-enrolls in Review", () => {
    const { store, service, game } = setupAnalyzedStore();
    const duelPuzzle = store
      .listUserPuzzles({ gameId: game.id })
      .find((p) => p.puzzleKind === "arrow_duel")!;
    const duelCtx = reviewContextForUserPuzzle(duelPuzzle);

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ThemeProvider appearance="light">
          <PracticeViewportProvider value={{ width: 390, height: 844, fontScale: 1 }}>
            <GameReviewScreen
              BoardComponent={MockReviewBoard}
              game={game}
              practiceService={service}
              store={store}
            />
          </PracticeViewportProvider>
        </ThemeProvider>
      );
    });

    // Advance to Key Moment 2 (Arrow Duel)
    act(() => {
      findByTestId(renderer, "key-moment-next").props.onPress();
    });

    expect(findByTestId(renderer, "game-review-arrow-duel-overlay")).toBeTruthy();
    expect(findByTestId(renderer, "key-moment-escaped-badge")).toBeTruthy();
    expect(findByTestId(renderer, "key-moment-candidate-f3d1")).toBeTruthy();
    expect(findByTestId(renderer, "key-moment-candidate-f3c3")).toBeTruthy();

    // Tap the blunder candidate (f3c3) -> fails, shows punishment line, auto-enrolls in Review
    act(() => {
      findByTestId(renderer, "key-moment-candidate-f3c3").props.onPress();
    });

    expect(findByTestId(renderer, "key-moment-failed-state")).toBeTruthy();
    expect(findByTestId(renderer, "key-moment-punishment-line")).toBeTruthy();
    expect(findByTestId(renderer, "key-moment-auto-enrolled-badge")).toBeTruthy();
    expect(service.getReviewQueueState(duelCtx)).toBeDefined();

    // Step forward through the punishment line
    act(() => {
      findByTestId(renderer, "key-moment-refutation-next").props.onPress();
    });
    expect(textContent(findByTestId(renderer, "mock-board-fen"))).not.toBe(duelPuzzle.initialFen);

    // Retry and choose best move (f3d1) -> solved!
    act(() => {
      findByTestId(renderer, "key-moment-retry-button").props.onPress();
    });
    act(() => {
      findByTestId(renderer, "key-moment-candidate-f3d1").props.onPress();
    });
    expect(findByTestId(renderer, "key-moment-solved-state")).toBeTruthy();
    expect(findByTestId(renderer, "key-moment-refutation-toggle")).toBeTruthy();

    act(() => renderer.unmount());
  });

  it("celebrates opponent_*_caught highlights without creating a puzzle or forcing a retry", () => {
    const { store, service, game } = setupAnalyzedStore();
    store.replaceGameUserPuzzles(game.id, [], {});
    const cleanGame = store.getImportedGame(game.id)!;
    const highlight: GameHighlightMoment = {
      ply: 10,
      moveNumber: 5,
      momentKind: "opponent_blunder_caught",
      uci: "f6e4",
      san: "Nxe4",
      winChanceGain: 0.35
    };

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ThemeProvider appearance="light">
          <PracticeViewportProvider value={{ width: 390, height: 844, fontScale: 1 }}>
            <GameReviewScreen
              BoardComponent={MockReviewBoard}
              game={cleanGame}
              initialHighlights={[highlight]}
              practiceService={service}
              store={store}
            />
          </PracticeViewportProvider>
        </ThemeProvider>
      );
    });

    expect(findByTestId(renderer, "key-moment-highlight-badge")).toBeTruthy();
    expect(textContent(findByTestId(renderer, "key-moment-highlight-detail"))).toContain("Nxe4");
    expect(store.listUserPuzzles({ gameId: game.id })).toHaveLength(0);

    act(() => renderer.unmount());
  });

  it("runs Live Free Stockfish Analysis at interactive priority (MultiPV=3) and snaps back from exploration", async () => {
    const { store, service, game } = setupAnalyzedStore();
    const requests: EngineSearchRequest[] = [];
    const engine: GameReviewLiveEngine = {
      analyze: async (req) => {
        requests.push(req);
        const lines: EngineAnalysisLine[] = [
          {
            move: "g1f3",
            pv: ["g1f3", "b8c6", "f1b5"],
            multipv: 1,
            depth: 18,
            score: { kind: "cp", sideToMoveCentipawns: 35, whiteCentipawns: 35 }
          },
          {
            move: "f1c4",
            pv: ["f1c4", "g8f6"],
            multipv: 2,
            depth: 18,
            score: { kind: "cp", sideToMoveCentipawns: 20, whiteCentipawns: 20 }
          },
          {
            move: "d2d4",
            pv: ["d2d4", "e5d4"],
            multipv: 3,
            depth: 18,
            score: { kind: "cp", sideToMoveCentipawns: 10, whiteCentipawns: 10 }
          }
        ];
        req.onUpdate?.(lines);
        return lines;
      }
    };

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ThemeProvider appearance="light">
          <PracticeViewportProvider value={{ width: 390, height: 844, fontScale: 1 }}>
            <GameReviewScreen
              BoardComponent={MockReviewBoard}
              engine={engine}
              game={game}
              initialMode="moves"
              practiceService={service}
              store={store}
            />
          </PracticeViewportProvider>
        </ThemeProvider>
      );
    });

    // Jump to ply 2 (after 1. e4 e5, White to move)
    act(() => {
      findByTestId(renderer, "move-strip-ply-2").props.onPress();
    });
    const ply2Fen = PARSED_SAMPLE.plies[1]!.fenAfter;
    expect(textContent(findByTestId(renderer, "mock-board-fen"))).toBe(ply2Fen);

    // Toggle Engine on
    act(() => {
      findByTestId(renderer, "game-review-engine-toggle").props.onPress();
    });
    await flushAsync(8);

    expect(requests.length).toBeGreaterThanOrEqual(1);
    expect(requests[0]).toEqual(
      expect.objectContaining({
        fen: ply2Fen,
        multiPv: 3,
        depth: 18,
        priority: "interactive"
      })
    );
    expect(findByTestId(renderer, "game-review-engine-line-1")).toBeTruthy();
    expect(findByTestId(renderer, "game-review-engine-line-3")).toBeTruthy();

    // Tap first engine candidate line to explore off-line
    act(() => {
      findByTestId(renderer, "game-review-engine-line-1").props.onPress();
    });
    expect(textContent(findByTestId(renderer, "mock-board-fen"))).not.toBe(ply2Fen);
    expect(findByTestId(renderer, "game-review-back-to-game")).toBeTruthy();

    // Tap "Back to game" to snap back to ply 2
    act(() => {
      findByTestId(renderer, "game-review-back-to-game").props.onPress();
    });
    expect(textContent(findByTestId(renderer, "mock-board-fen"))).toBe(ply2Fen);
    expect(queryByTestId(renderer, "game-review-back-to-game")).toBeNull();

    act(() => renderer.unmount());
  });

  it("aborts active Pass-1 scan cleanly on app background and persists partial checkpoint", async () => {
    const store = new MemoryStore();
    const service = new PracticeService(store);
    const draft = createSampleGame({
      id: "game-background-1",
      analysisStatus: "none",
      analysisCheckpointPly: 0,
      whiteAccuracy: undefined,
      blackAccuracy: undefined,
      puzzleCount: 0
    });
    store.upsertImportedGames([draft], draft.createdAt);
    const unanalyzed = store.getImportedGame(draft.id)!;

    let callCount = 0;
    let releaseBlockedCall: (() => void) | undefined;
    const abortedSignals: boolean[] = [];

    const engine: GameReviewLiveEngine = {
      analyze: (req) => {
        callCount += 1;
        req.signal?.addEventListener("abort", () => {
          abortedSignals.push(true);
        });
        // Resolve first 3 positions immediately (2 plies evaluated), then stall on the 4th.
        if (callCount <= 3) {
          return Promise.resolve([
            {
              move: "e2e4",
              pv: ["e2e4"],
              multipv: 1,
              depth: 12,
              score: { kind: "cp", sideToMoveCentipawns: 15, whiteCentipawns: 15 }
            }
          ]);
        }
        return new Promise<EngineAnalysisLine[]>((resolve, reject) => {
          releaseBlockedCall = () => resolve([]);
          req.signal?.addEventListener("abort", () => {
            const abortError = new Error("Aborted");
            abortError.name = "AbortError";
            reject(abortError);
          });
        });
      }
    };

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ThemeProvider appearance="light">
          <PracticeViewportProvider value={{ width: 390, height: 844, fontScale: 1 }}>
            <GameReviewScreen
              BoardComponent={MockReviewBoard}
              checkpointIntervalPlies={10}
              engine={engine}
              game={unanalyzed}
              practiceService={service}
              store={store}
            />
          </PracticeViewportProvider>
        </ThemeProvider>
      );
    });

    await flushAsync(10);
    expect(callCount).toBe(4);

    // Emit AppState background transition
    act(() => {
      (AppState as unknown as { __emit: (state: string) => void }).__emit("background");
    });
    await flushAsync(8);

    expect(abortedSignals.length).toBeGreaterThanOrEqual(1);
    const persisted = store.getImportedGame(draft.id);
    expect(persisted?.analysisStatus).toBe("partial");
    expect(persisted?.analysisCheckpointPly).toBeGreaterThanOrEqual(2);
    expect(store.listGamePlyEvaluations(draft.id).length).toBeGreaterThanOrEqual(2);
    expect(findByTestId(renderer, "game-review-scan-paused")).toBeTruthy();

    const release = releaseBlockedCall as (() => void) | undefined;
    release?.();
    act(() => renderer.unmount());
  });

  it("renders two-column rail layout on tablet landscape and fires Practice CTA callback", () => {
    const { store, service, game } = setupAnalyzedStore();
    const onPractice = jest.fn();

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ThemeProvider appearance="dark">
          <PracticeViewportProvider value={{ width: 1024, height: 768, fontScale: 1 }}>
            <GameReviewScreen
              BoardComponent={MockReviewBoard}
              game={game}
              onPracticeGamePuzzles={onPractice}
              practiceService={service}
              store={store}
            />
          </PracticeViewportProvider>
        </ThemeProvider>
      );
    });

    expect(findByTestId(renderer, "game-review-rail-layout")).toBeTruthy();
    act(() => {
      findByTestId(renderer, "game-review-practice-puzzles-cta").props.onPress();
    });
    expect(onPractice).toHaveBeenCalledWith(game.id);

    // Ensure Pressable buttons exist cleanly
    expect(renderer.root.findAllByType(Pressable).length).toBeGreaterThan(4);
    act(() => renderer.unmount());
  });
});
