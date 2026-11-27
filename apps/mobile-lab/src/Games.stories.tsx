import React, { useMemo } from "react";
import { ScrollView, View } from "react-native";
import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ImportedGameDraft } from "../../../packages/core/src/index.ts";
import { MemoryStore } from "../../../packages/storage/src/memory-store.ts";
import { PracticeService } from "../../../packages/storage/src/practice-service.ts";
import { GamesHubScreen, type GamesHubScreenProps } from "../../mobile/src/components/games/GamesHubScreen.tsx";
import type { GamesBatchAnalysisState } from "../../mobile/src/components/games/useGamesBatchAnalysis.ts";
import type { GamesImportTab } from "../../mobile/src/components/games/GamesImportModal.tsx";
import { useTheme } from "../../mobile/src/theme/index.ts";

const STORY_NOW_ISO = "2026-11-27T18:00:00.000Z";
const STORY_NOW_MS = Date.parse(STORY_NOW_ISO);

const STORY_PGN_ITALIAN = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.11.27"]
[White "StoryPlayer"]
[Black "TacticalFox"]
[Result "1-0"]
[WhiteElo "1640"]
[BlackElo "1625"]
[TimeControl "300+0"]
[ECO "C50"]
[Opening "Italian Game"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 1-0`;

const STORY_PGN_SICILIAN = `[Event "Rated Rapid game"]
[Site "https://lichess.org/AbCdEf12"]
[Date "2026.11.26"]
[White "EndgameOwl"]
[Black "StoryPlayer"]
[Result "1-0"]
[WhiteElo "1715"]
[BlackElo "1632"]
[TimeControl "600+5"]
[ECO "B90"]
[Opening "Sicilian Najdorf"]

1. e4 c5 2. Nf3 d6 3. d4 cxd4 1-0`;

const STORY_PGN_FRENCH = `[Event "Rated Bullet game"]
[Site "https://lichess.org/GhIjKl34"]
[Date "2026.11.25"]
[White "StoryPlayer"]
[Black "BlitzHawk"]
[Result "1/2-1/2"]
[WhiteElo "1610"]
[BlackElo "1605"]
[TimeControl "60+0"]
[ECO "C00"]
[Opening "French Defense"]

1. e4 e6 2. d4 d5 1/2-1/2`;

const SAMPLE_GAMES: ImportedGameDraft[] = [
  {
    id: "https://www.chess.com/game/live/9001",
    platform: "chess_com",
    username: "StoryPlayer",
    userColor: "w",
    playedAt: "2026-11-27T16:30:00.000Z",
    timeControl: "300+0",
    timeClass: "blitz",
    rated: true,
    white: { username: "StoryPlayer", rating: 1640, isAi: false },
    black: { username: "TacticalFox", rating: 1625, isAi: false },
    winner: "w",
    termination: "resign",
    eco: "C50",
    opening: "Italian Game",
    pgn: STORY_PGN_ITALIAN
  },
  {
    id: "https://lichess.org/AbCdEf12",
    platform: "lichess",
    username: "StoryPlayer",
    userColor: "b",
    playedAt: "2026-11-26T19:15:00.000Z",
    timeControl: "600+5",
    timeClass: "rapid",
    rated: true,
    white: { username: "EndgameOwl", rating: 1715, isAi: false },
    black: { username: "StoryPlayer", rating: 1632, isAi: false },
    winner: "w",
    termination: "mate",
    eco: "B90",
    opening: "Sicilian Najdorf",
    pgn: STORY_PGN_SICILIAN
  },
  {
    id: "https://lichess.org/GhIjKl34",
    platform: "lichess",
    username: "StoryPlayer",
    userColor: "w",
    playedAt: "2026-11-25T12:00:00.000Z",
    timeControl: "60+0",
    timeClass: "bullet",
    rated: true,
    white: { username: "StoryPlayer", rating: 1610, isAi: false },
    black: { username: "BlitzHawk", rating: 1605, isAi: false },
    winner: "none",
    termination: "draw",
    eco: "C00",
    opening: "French Defense",
    pgn: STORY_PGN_FRENCH
  }
];

function createPopulatedGamesService(): PracticeService {
  const service = new PracticeService(new MemoryStore());
  service.upsertLinkedAccount({
    platform: "chess_com",
    username: "StoryPlayer",
    lastSyncedAt: STORY_NOW_ISO
  });
  service.upsertImportedGames(SAMPLE_GAMES, STORY_NOW_ISO);
  service.saveGamePlyEvaluations("https://www.chess.com/game/live/9001", [], {
    analysisStatus: "complete",
    analysisCheckpointPly: 6,
    whiteAccuracy: 86,
    blackAccuracy: 74
  });
  service.replaceGameUserPuzzles(
    "https://www.chess.com/game/live/9001",
    [
      {
        idSeed: "story-ply-1",
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
        winChanceSwing: 26,
        themes: ["fork"],
        lengthTag: "short",
        phaseTag: "opening",
        caliberScore: 82
      },
      {
        idSeed: "story-ply-2",
        ply: 10,
        moveNumber: 5,
        puzzleKind: "line",
        momentKind: "own_blunder_punished",
        userColor: "w",
        puzzleColor: "w",
        initialFen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
        solutionMoves: ["c6d4", "f3d4", "e5d4"],
        prevCp: 30,
        cp: -280,
        winChanceSwing: 31,
        themes: ["pin"],
        lengthTag: "short",
        phaseTag: "opening",
        caliberScore: 76
      }
    ],
    { opponentName: "TacticalFox", timeClass: "blitz", playedAt: STORY_NOW_ISO }
  );
  service.saveGamePlyEvaluations("https://lichess.org/AbCdEf12", [], {
    analysisStatus: "partial",
    analysisCheckpointPly: 4
  });
  return service;
}

interface GamesStoryHostProps {
  mode: "empty" | "populated";
  importModalVisible?: boolean;
  initialImportTab?: GamesImportTab;
  initialError?: string | null;
  initialBatchState?: GamesBatchAnalysisState;
}

function GamesStoryHost({
  mode,
  importModalVisible,
  initialImportTab,
  initialError,
  initialBatchState
}: GamesStoryHostProps): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const service = useMemo(
    () => (mode === "populated" ? createPopulatedGamesService() : new PracticeService(new MemoryStore())),
    [mode]
  );

  const hubProps: GamesHubScreenProps = {
    service,
    nowMs: STORY_NOW_MS,
    onOpenGameReview: () => {},
    onPracticeMyGamePuzzles: () => {},
    ...(importModalVisible !== undefined ? { importModalVisible } : {}),
    ...(initialImportTab !== undefined ? { initialImportTab } : {}),
    ...(initialError !== undefined ? { initialError } : {}),
    ...(initialBatchState !== undefined ? { initialBatchState } : {})
  };

  return (
    <View style={{ backgroundColor: theme.colors.surfaceRaised, flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 16,
          paddingTop: insets.top + 12
        }}
      >
        <GamesHubScreen {...hubProps} />
      </ScrollView>
    </View>
  );
}

const meta = {
  title: "Games",
  component: GamesStoryHost
} satisfies Meta<typeof GamesStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  name: "Empty onboarding",
  args: {
    mode: "empty"
  }
};

export const Populated: Story = {
  name: "Populated feed",
  args: {
    mode: "populated"
  }
};

export const ImportModal: Story = {
  name: "Import modal",
  args: {
    mode: "populated",
    importModalVisible: true,
    initialImportTab: "chess_com"
  }
};

export const BatchAnalyzing: Story = {
  name: "Batch analysis running",
  args: {
    mode: "populated",
    initialBatchState: {
      status: "running",
      currentIndex: 2,
      totalGames: 5,
      currentGameId: "https://lichess.org/AbCdEf12",
      currentPly: 34,
      totalPlies: 72,
      completedGames: 1,
      generatedPuzzles: 2,
      errorMessage: null,
      pausedByBackground: false
    }
  }
};

export const BatchPausedInBackground: Story = {
  name: "Batch analysis paused",
  args: {
    mode: "populated",
    initialBatchState: {
      status: "paused",
      currentIndex: 2,
      totalGames: 5,
      currentGameId: "https://lichess.org/AbCdEf12",
      currentPly: 34,
      totalPlies: 72,
      completedGames: 1,
      generatedPuzzles: 2,
      errorMessage: null,
      pausedByBackground: true
    }
  }
};

export const OfflineAndErrorRecovery: Story = {
  name: "Offline error recovery",
  args: {
    mode: "populated",
    initialError: "Unable to reach server. Local games remain available offline."
  }
};
