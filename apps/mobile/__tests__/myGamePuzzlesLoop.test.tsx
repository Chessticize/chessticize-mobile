import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import {
  type ExtractedGamePuzzle,
  type ImportedGameDraft
} from "../../../packages/core/src/index.ts";
import { MemoryStore, PracticeService } from "../../../packages/storage/src/index.ts";
import {
  GamesHubScreen,
  type MyGamePuzzlesLaunchOptions
} from "../src/components/games/GamesHubScreen.tsx";
import { PracticePocScreen } from "../src/components/PracticePocScreen.tsx";
import { createTestMobilePlatformCapabilities } from "../src/testing/testMobilePlatformCapabilities.ts";
import { ThemeProvider } from "../src/theme/index.ts";

function makeDraft(index: number, timeClass: "blitz" | "rapid"): ImportedGameDraft {
  return {
    id: `https://www.chess.com/game/live/loop-${index}`,
    platform: "chess_com",
    username: "HeroUser",
    userColor: "w",
    playedAt: `2026-11-2${index}T12:00:00.000Z`,
    timeControl: timeClass === "blitz" ? "300+0" : "600+0",
    timeClass,
    rated: true,
    url: `https://www.chess.com/game/live/loop-${index}`,
    white: { username: "HeroUser", rating: 1550, isAi: false },
    black: { username: `Rival${index}`, rating: 1560, isAi: false },
    winner: "b",
    termination: "mate",
    eco: "A00",
    opening: "Fool's Opening",
    pgn: `[Event "Live"]\n[White "HeroUser"]\n[Black "Rival${index}"]\n[Result "0-1"]\n[TimeControl "${timeClass === "blitz" ? "300+0" : "600+0"}"]\n\n1. f3 e5 2. g4 Qh4# 0-1`
  };
}

function makeArrowDuelPuzzle(index: number): ExtractedGamePuzzle {
  return {
    idSeed: `loop-ad-${index}`,
    ply: 3,
    moveNumber: 2,
    puzzleKind: "arrow_duel",
    momentKind: "own_mistake_punished",
    userColor: "w",
    puzzleColor: "w",
    initialFen: "rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2",
    solutionMoves: ["g2g4", "d8h4"],
    prevCp: 0,
    cp: -10000,
    winChanceSwing: 0.95,
    arrowDuel: {
      bestMove: "e2e4",
      blunderMove: "g2g4",
      bestEvalWhite: 10,
      blunderEvalWhite: -10000,
      punishmentLine: ["d8h4"],
      decisionFen: "rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2"
    },
    themes: ["fork", "mateIn1"],
    lengthTag: "oneMove",
    phaseTag: "opening",
    clockRemainingSec: 9,
    timeSpentSec: 1.5,
    caliberScore: 90
  };
}

function makeLinePuzzle(index: number): ExtractedGamePuzzle {
  return {
    idSeed: `loop-line-${index}`,
    ply: 2,
    moveNumber: 2,
    puzzleKind: "line",
    momentKind: "opponent_mistake_missed",
    userColor: "w",
    puzzleColor: "w",
    initialFen: "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2",
    solutionMoves: ["d8h4"],
    prevCp: 0,
    cp: 10000,
    winChanceSwing: 0.95,
    themes: ["fork"],
    lengthTag: "oneMove",
    phaseTag: "opening",
    clockRemainingSec: 120,
    timeSpentSec: 12,
    caliberScore: 85
  };
}

function renderWithTheme(element: React.ReactElement): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<ThemeProvider>{element}</ThemeProvider>);
  });
  return renderer;
}

function findByTestID(root: ReactTestInstance, testID: string): ReactTestInstance | null {
  return root.findAll((node) => node.props?.testID === testID)[0] ?? null;
}

describe("Wave 4 My Game Puzzles closed-loop experience (#768)", () => {
  test("InGameDiagnosisCard stays hidden for <3 analyzed games and appears with blindspot drill for >=3", () => {
    const store = new MemoryStore();
    const service = new PracticeService(store);
    const launches: Array<MyGamePuzzlesLaunchOptions | undefined> = [];

    // Seed 2 analyzed games -> diagnosis card must remain hidden
    service.upsertImportedGames([makeDraft(1, "blitz"), makeDraft(2, "rapid")]);
    for (const id of [
      "https://www.chess.com/game/live/loop-1",
      "https://www.chess.com/game/live/loop-2"
    ]) {
      service.saveGamePlyEvaluations(id, [], {
        analysisStatus: "complete",
        analysisCheckpointPly: 4,
        whiteAccuracy: 74,
        blackAccuracy: 88
      });
    }

    const rendererSmall = renderWithTheme(
      <GamesHubScreen
        service={service}
        onOpenGameReview={jest.fn()}
        onPracticeMyGamePuzzles={(opts) => launches.push(opts)}
      />
    );
    expect(findByTestID(rendererSmall.root, "games-diagnosis-card")).toBeNull();
    act(() => rendererSmall.unmount());

    // Add a 3rd analyzed game with Arrow Duel + Line puzzles -> diagnosis & mode buttons appear
    service.upsertImportedGames([makeDraft(3, "blitz")]);
    service.saveGamePlyEvaluations("https://www.chess.com/game/live/loop-3", [], {
      analysisStatus: "complete",
      analysisCheckpointPly: 4,
      whiteAccuracy: 68,
      blackAccuracy: 91
    });
    service.replaceGameUserPuzzles(
      "https://www.chess.com/game/live/loop-1",
      [makeArrowDuelPuzzle(1), makeLinePuzzle(1)],
      { opponentName: "Rival1", timeClass: "blitz" }
    );
    service.replaceGameUserPuzzles(
      "https://www.chess.com/game/live/loop-2",
      [makeArrowDuelPuzzle(2)],
      { opponentName: "Rival2", timeClass: "rapid" }
    );
    service.replaceGameUserPuzzles(
      "https://www.chess.com/game/live/loop-3",
      [makeArrowDuelPuzzle(3)],
      { opponentName: "Rival3", timeClass: "blitz" }
    );

    const rendererFull = renderWithTheme(
      <GamesHubScreen
        service={service}
        onOpenGameReview={jest.fn()}
        onPracticeMyGamePuzzles={(opts) => launches.push(opts)}
      />
    );

    expect(findByTestID(rendererFull.root, "games-diagnosis-card")).not.toBeNull();
    expect(findByTestID(rendererFull.root, "games-diagnosis-clock")).not.toBeNull();
    expect(findByTestID(rendererFull.root, "games-diagnosis-time-classes")).not.toBeNull();

    // Tapping a blindspot motif chip on Games view launches theme-filtered My Game Puzzles
    const forkChip = findByTestID(rendererFull.root, "games-diagnosis-blindspot-fork");
    expect(forkChip).not.toBeNull();
    act(() => {
      forkChip!.props.onPress();
    });
    expect(launches[0]).toEqual({ themes: ["fork"] });

    // Switch to the Puzzles view: redundant quick-launch mode buttons are omitted;
    // mode filtering lives in the filter drawer and feeds the primary Practice CTA.
    const puzzlesTabBtn = findByTestID(rendererFull.root, "games-hub-view-puzzles");
    expect(puzzlesTabBtn).not.toBeNull();
    act(() => {
      puzzlesTabBtn!.props.onPress();
    });

    expect(findByTestID(rendererFull.root, "games-practice-arrow-duel")).toBeNull();
    expect(findByTestID(rendererFull.root, "games-practice-lines")).toBeNull();

    // Expand filter drawer, filter to Arrow Duel, and tap primary CTA
    const filterToggle = findByTestID(rendererFull.root, "games-filter-toggle");
    expect(filterToggle).not.toBeNull();
    act(() => {
      filterToggle!.props.onPress();
    });
    const arrowDuelFilter = findByTestID(rendererFull.root, "games-filter-puzzle-kind-arrow_duel");
    expect(arrowDuelFilter).not.toBeNull();
    act(() => {
      arrowDuelFilter!.props.onPress();
    });
    const practiceCta = findByTestID(rendererFull.root, "games-practice-puzzles-cta");
    expect(practiceCta).not.toBeNull();
    act(() => {
      practiceCta!.props.onPress();
    });
    expect(launches[1]?.puzzleIds).toHaveLength(3);

    // Filter to Standard and tap primary CTA
    const lineFilter = findByTestID(rendererFull.root, "games-filter-puzzle-kind-line");
    expect(lineFilter).not.toBeNull();
    act(() => {
      lineFilter!.props.onPress();
    });
    act(() => {
      findByTestID(rendererFull.root, "games-practice-puzzles-cta")!.props.onPress();
    });
    expect(launches[2]?.puzzleIds).toHaveLength(1);

    act(() => rendererFull.unmount());
  });

  test("Practice Home surfaces From Your Games entry when user puzzles exist and session provenance jumps to Game Review", () => {
    const store = new MemoryStore();
    const service = new PracticeService(store);
    const game = makeDraft(1, "blitz");
    service.upsertImportedGames([game]);
    service.saveGamePlyEvaluations(game.id, [], {
      analysisStatus: "complete",
      analysisCheckpointPly: 4,
      whiteAccuracy: 71,
      blackAccuracy: 90
    });
    service.replaceGameUserPuzzles(game.id, [makeArrowDuelPuzzle(1)], {
      opponentName: "Rival1",
      timeClass: "blitz"
    });

    const capabilities = createTestMobilePlatformCapabilities({ practiceService: service });
    const renderer = renderWithTheme(<PracticePocScreen platformCapabilities={capabilities} />);

    // Quick entry appears on Practice Home when user puzzles > 0
    const quickEntry = findByTestID(renderer.root, "practice-home-my-game-puzzles");
    expect(quickEntry).not.toBeNull();

    // Launch My Game Puzzles session directly from Practice Home
    act(() => {
      quickEntry!.props.onPress();
    });

    // Opens open-ended Replay session (not a timed Sprint) with source-game provenance link
    const provenance = findByTestID(renderer.root, "review-open-source-game");
    expect(provenance).not.toBeNull();

    // Tapping the provenance pill opens the exact source game in Game Review
    act(() => {
      provenance!.props.onPress();
    });

    expect(findByTestID(renderer.root, "game-review-screen")).not.toBeNull();
    act(() => renderer.unmount());
  });
});
