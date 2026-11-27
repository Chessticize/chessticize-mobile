import React, { useMemo } from "react";
import { View } from "react-native";
import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import {
  parsePgnGame,
  type EngineAnalysisLine,
  type EngineSearchRequest,
  type ExtractedGamePuzzle,
  type GameHighlightMoment
} from "../../../packages/core/src/index.ts";
import type {
  StoredGamePlyEval,
  StoredImportedGame
} from "../../../packages/storage/src/game-review-store.ts";
import { MemoryStore } from "../../../packages/storage/src/memory-store.ts";
import { PracticeService } from "../../../packages/storage/src/practice-service.ts";
import {
  GameReviewScreen,
  type GameReviewBoardComponent,
  type GameReviewLiveEngine,
  type GameReviewMode
} from "../../mobile/src/components/gameReview/index.tsx";
import { usePracticeViewport } from "../../mobile/src/components/PracticeViewport.tsx";
import BoardPlaceholder from "./BoardPlaceholder.tsx";
import { LabTextSize, ACCESSIBILITY_LARGE_FONT_SCALE } from "./LabTextSize.tsx";
import { clickTestId, waitForTestId, waitForText } from "./storyPlay.ts";

const STORY_PGN = [
  '[Event "Rated Blitz game"]',
  '[White "Alice"]',
  '[Black "Bob"]',
  '[Result "0-1"]',
  '[TimeControl "300+0"]',
  "",
  "1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qf3 Nd4 5. Qc3 Nxe4 0-1"
].join("\n");

const PARSED_STORY_GAME = parsePgnGame(STORY_PGN);

type GameReviewStoryFixtureKind =
  | "scanning"
  | "arrow_duel_prompt"
  | "line_prompt"
  | "highlight_caught"
  | "free_engine"
  | "end_summary";

function buildStoryPlyEvals(gameId: string, count = PARSED_STORY_GAME.plies.length): StoredGamePlyEval[] {
  const entries: Array<{ cp: number; cls: StoredGamePlyEval["classification"]; win: number }> = [
    { cp: 20, cls: "book", win: 52 },
    { cp: 15, cls: "book", win: 51 },
    { cp: -30, cls: "inaccuracy", win: 47 },
    { cp: -20, cls: "best", win: 48 },
    { cp: -25, cls: "good", win: 48 },
    { cp: 900, cls: "blunder", win: 96 },
    { cp: -40, cls: "missed_win", win: 46 },
    { cp: -60, cls: "best", win: 44 },
    { cp: -350, cls: "blunder", win: 21 },
    { cp: -360, cls: "best", win: 20 }
  ];

  return PARSED_STORY_GAME.plies.slice(0, count).map((ply, index) => {
    const item = entries[index] ?? { cp: 0, cls: "good", win: 50 };
    const prevWin = index > 0 ? (entries[index - 1]?.win ?? 50) : 50;
    const moverBefore = ply.color === "w" ? prevWin : 100 - prevWin;
    const moverAfter = ply.color === "w" ? item.win : 100 - item.win;
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
      whiteScore: item.cp,
      sideToMoveScore: ply.color === "w" ? -item.cp : item.cp,
      whiteWinPercent: item.win,
      moverWinPercentBefore: moverBefore,
      moverWinPercentAfter: moverAfter,
      winPercentLoss: Math.max(0, moverBefore - moverAfter),
      classification: item.cls,
      clockBucket: "unknown",
      isKeyMomentCandidate: item.cls === "blunder" || item.cls === "missed_win",
      fromPreExistingEval: false,
      deepVerified: true
    };
  });
}

function buildStoryPuzzles(): {
  linePuzzle: ExtractedGamePuzzle;
  arrowDuelPuzzle: ExtractedGamePuzzle;
} {
  const ply6 = PARSED_STORY_GAME.plies[5]!;
  const ply9 = PARSED_STORY_GAME.plies[8]!;

  return {
    linePuzzle: {
      idSeed: "story-ply-6-line",
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
    },
    arrowDuelPuzzle: {
      idSeed: "story-ply-9-duel",
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
    }
  };
}

function createStoryEngine(kind: GameReviewStoryFixtureKind): GameReviewLiveEngine {
  if (kind === "scanning") {
    return {
      analyze: (req: EngineSearchRequest) =>
        new Promise<EngineAnalysisLine[]>((_resolve, reject) => {
          req.signal?.addEventListener("abort", () => {
            const error = new Error("Aborted");
            error.name = "AbortError";
            reject(error);
          });
        })
    };
  }

  return {
    analyze: async (req: EngineSearchRequest) => {
      const lines: EngineAnalysisLine[] = [
        {
          move: "f3d1",
          pv: ["f3d1", "d7d5", "e4d5"],
          multipv: 1,
          depth: 18,
          score: { kind: "cp", sideToMoveCentipawns: -40, whiteCentipawns: -40 }
        },
        {
          move: "f3g3",
          pv: ["f3g3", "d4c2", "e1d1"],
          multipv: 2,
          depth: 18,
          score: { kind: "cp", sideToMoveCentipawns: -160, whiteCentipawns: -160 }
        },
        {
          move: "f3c3",
          pv: ["f3c3", "f6e4", "c3d3"],
          multipv: 3,
          depth: 18,
          score: { kind: "cp", sideToMoveCentipawns: -350, whiteCentipawns: -350 }
        }
      ];
      req.onUpdate?.(lines);
      return lines;
    }
  };
}

function GameReviewStoryFrame({
  fixture,
  initialMode,
  initialFreeAnalysisOpen
}: {
  fixture: GameReviewStoryFixtureKind;
  initialMode?: GameReviewMode;
  initialFreeAnalysisOpen?: boolean;
}): React.JSX.Element {
  const viewport = usePracticeViewport();

  const { store, service, game, engine, highlights } = useMemo(() => {
    const memoryStore = new MemoryStore();
    const practiceService = new PracticeService(memoryStore);
    const { linePuzzle, arrowDuelPuzzle } = buildStoryPuzzles();
    const gameId = `story-game-${fixture}`;
    const draft: StoredImportedGame = {
      id: gameId,
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
      pgn: STORY_PGN,
      analysisStatus: fixture === "scanning" ? "partial" : "complete",
      analysisCheckpointPly: fixture === "scanning" ? 4 : PARSED_STORY_GAME.plies.length,
      whiteAccuracy: 74,
      blackAccuracy: 86,
      puzzleCount: 0,
      createdAt: "2026-11-20T12:05:00.000Z",
      updatedAt: "2026-11-20T12:05:00.000Z"
    };

    memoryStore.upsertImportedGames([draft], draft.createdAt);

    if (fixture === "scanning") {
      memoryStore.saveGamePlyEvaluations(gameId, buildStoryPlyEvals(gameId, 4), {
        analysisStatus: "partial",
        analysisCheckpointPly: 4
      });
    } else {
      memoryStore.saveGamePlyEvaluations(gameId, buildStoryPlyEvals(gameId), {
        analysisStatus: "complete",
        analysisCheckpointPly: PARSED_STORY_GAME.plies.length,
        whiteAccuracy: 74,
        blackAccuracy: 86
      });

      const puzzlesForFixture =
        fixture === "arrow_duel_prompt"
          ? [arrowDuelPuzzle]
          : fixture === "line_prompt"
            ? [linePuzzle]
            : fixture === "highlight_caught"
              ? []
              : [linePuzzle, arrowDuelPuzzle];

      memoryStore.replaceGameUserPuzzles(gameId, puzzlesForFixture, {
        opponentName: "Bob",
        playedAt: draft.playedAt,
        timeClass: draft.timeClass,
        ratingAnchor: 1550
      });
    }

    const storyHighlights: GameHighlightMoment[] =
      fixture === "highlight_caught"
        ? [
            {
              ply: 10,
              moveNumber: 5,
              momentKind: "opponent_blunder_caught",
              uci: "f6e4",
              san: "Nxe4",
              winChanceGain: 0.35
            }
          ]
        : [];

    return {
      store: memoryStore,
      service: practiceService,
      game: memoryStore.getImportedGame(gameId)!,
      engine: createStoryEngine(fixture),
      highlights: storyHighlights
    };
  }, [fixture]);

  return (
    <View style={{ height: viewport.height }}>
      <GameReviewScreen
        BoardComponent={BoardPlaceholder as unknown as GameReviewBoardComponent}
        engine={engine}
        game={game}
        initialFreeAnalysisOpen={initialFreeAnalysisOpen}
        initialHighlights={highlights}
        initialMode={initialMode}
        onBack={() => undefined}
        onPracticeGamePuzzles={() => undefined}
        practiceService={service}
        store={store}
      />
    </View>
  );
}

const meta = {
  title: "Game Review",
  component: GameReviewStoryFrame
} satisfies Meta<typeof GameReviewStoryFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Scanning: Story = {
  name: "Scanning (Pass 1 live)",
  args: { fixture: "scanning", initialMode: "moves" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "game-review-scan-banner");
    await waitForTestId(canvasElement, "game-review-eval-graph");
    await waitForText(canvasElement, "Analyzing game");
  }
};

export const KeyMomentArrowDuel: Story = {
  name: "Key Moment · Arrow Duel prompt",
  args: { fixture: "arrow_duel_prompt", initialMode: "moments" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "game-review-arrow-duel-overlay");
    await waitForTestId(canvasElement, "key-moment-candidate-f3d1");
    await waitForTestId(canvasElement, "key-moment-candidate-f3c3");
    await waitForTestId(canvasElement, "key-moment-escaped-badge");
  }
};

export const KeyMomentLine: Story = {
  name: "Key Moment · Line prompt",
  args: { fixture: "line_prompt", initialMode: "moments" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "key-moment-prompt-cue");
    await waitForText(canvasElement, "Line");
  }
};

export const RetrySolved: Story = {
  name: "Retry · Solved",
  args: { fixture: "arrow_duel_prompt", initialMode: "moments" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "key-moment-candidate-f3d1");
    await clickTestId(canvasElement, "key-moment-candidate-f3d1");
    await waitForTestId(canvasElement, "key-moment-solved-state");
    await waitForText(canvasElement, "Great find!");
    await waitForText(canvasElement, "Add to Review");
  }
};

export const RetryFailedAutoEnrolled: Story = {
  name: "Retry · Failed (Auto-enrolled)",
  args: { fixture: "arrow_duel_prompt", initialMode: "moments" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "key-moment-candidate-f3c3");
    await clickTestId(canvasElement, "key-moment-candidate-f3c3");
    await waitForTestId(canvasElement, "key-moment-failed-state");
    await waitForTestId(canvasElement, "key-moment-auto-enrolled-badge");
    await waitForTestId(canvasElement, "key-moment-punishment-line");
  }
};

export const HighlightCaught: Story = {
  name: "Highlight · Opponent blunder caught",
  args: { fixture: "highlight_caught", initialMode: "moments" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "key-moment-highlight-badge");
    await waitForText(canvasElement, "Great catch!");
  }
};

export const FreeEngineAnalysis: Story = {
  name: "Free Stockfish analysis",
  args: {
    fixture: "end_summary",
    initialMode: "moves",
    initialFreeAnalysisOpen: true
  },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "game-review-engine-panel");
    await waitForTestId(canvasElement, "game-review-engine-line-1");
    await waitForTestId(canvasElement, "game-review-engine-line-3");
  }
};

export const EndSummary: Story = {
  name: "End Summary",
  args: { fixture: "end_summary", initialMode: "moves" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "game-review-summary-card");
    await waitForText(canvasElement, "74%");
    await waitForText(canvasElement, "86%");
    await waitForTestId(canvasElement, "game-review-practice-puzzles-cta");
  }
};

export const AccessibilityLargeText: Story = {
  name: "Accessibility large text",
  args: { fixture: "arrow_duel_prompt", initialMode: "moments" },
  render: (args) => (
    <LabTextSize fontScale={ACCESSIBILITY_LARGE_FONT_SCALE}>
      <GameReviewStoryFrame {...args} />
    </LabTextSize>
  ),
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "game-review-screen");
    await waitForTestId(canvasElement, "key-moment-candidate-f3d1");
  }
};
