import React from "react";
import { View } from "react-native";
import TestRenderer, { act, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import {
  type HumanPolicyModel
} from "../../../packages/core/src/index.ts";
import { MemoryStore } from "../../../packages/storage/src/memory-store.ts";
import { PracticeService } from "../../../packages/storage/src/practice-service.ts";
import { GamesHubScreen } from "../src/components/games/GamesHubScreen.tsx";
import {
  MaiaPlayScreen,
  type MaiaPlayBoardComponent
} from "../src/components/maiaPlay/index.tsx";

function findByTestId(root: ReactTestInstance, testID: string): ReactTestInstance {
  return root.find((node) => node.props?.testID === testID);
}

function queryByTestId(root: ReactTestInstance, testID: string): ReactTestInstance | null {
  const matches = root.findAll((node) => node.props?.testID === testID);
  return matches[0] ?? null;
}

describe("Play with Maia UI", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test("setup enforces Rated/Unrated Maia rating rules, remembers 5+3 time control, plays a game with Instant toggle, resigns, saves to Games, and opens Game Review", async () => {
    jest.useFakeTimers();
    const store = new MemoryStore();
    const service = new PracticeService(store);
    const reviewCalls: string[] = [];

    let capturedOnMove:
      | ((result: { move: { from: string; to: string; promotion?: string } }) => void)
      | null = null;
    const MockBoard: MaiaPlayBoardComponent = (props) => {
      capturedOnMove = props.onMove as unknown as typeof capturedOnMove;
      return React.createElement(View, { testID: "mock-maia-board", accessibilityLabel: props.fen });
    };

    const fakePolicy: HumanPolicyModel = {
      async scoreMoves(requests) {
        return requests.map((req) => {
          const probs: Record<string, number> = {};
          for (const move of req.moves) {
            probs[move] = move === "e7e5" ? 0.92 : 0.08 / Math.max(1, req.moves.length - 1);
          }
          return {
            byElo: Object.fromEntries(
              req.elos.map((elo) => [elo, { probs, top1Prob: 0.92, entropy: 0.35 }])
            )
          };
        });
      }
    };

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <MaiaPlayScreen
          BoardComponent={MockBoard}
          policyModel={fakePolicy}
          service={service}
          onBack={() => undefined}
          onOpenGameReview={(id) => reviewCalls.push(id)}
        />
      );
    });

    // Open Time Control modal -> verify Blitz 5+3 & Classical Unlimited exist, no Bullet
    await act(async () => {
      findByTestId(renderer.root, "maia-setup-time-control").props.onPress();
    });
    expect(queryByTestId(renderer.root, "maia-tc-5+3")).not.toBeNull();
    expect(queryByTestId(renderer.root, "maia-tc-unlimited")).not.toBeNull();
    expect(queryByTestId(renderer.root, "maia-tc-1+0")).toBeNull();

    // Pick 5+3 Blitz
    await act(async () => {
      findByTestId(renderer.root, "maia-tc-5+3").props.onPress();
    });
    expect(service.getMaiaSetupPreferences().timeControl).toEqual({
      initialMinutes: 5,
      incrementSeconds: 3,
      unlimited: false
    });

    // In Rated mode, opponent rating stepper is hidden; in Unrated mode, stepper unlocks
    expect(queryByTestId(renderer.root, "maia-opponent-rating-stepper")).toBeNull();
    await act(async () => {
      findByTestId(renderer.root, "maia-mode-unrated").props.onPress();
    });
    expect(queryByTestId(renderer.root, "maia-opponent-rating-stepper")).not.toBeNull();
    await act(async () => {
      findByTestId(renderer.root, "maia-opponent-rating-inc").props.onPress();
    });
    expect(service.getMaiaSetupPreferences().opponentRating).toBe(1300);

    // Switch back to Rated, pick White, pick Human-like pace, and start game
    await act(async () => {
      findByTestId(renderer.root, "maia-mode-rated").props.onPress();
      findByTestId(renderer.root, "maia-color-w").props.onPress();
      findByTestId(renderer.root, "maia-pace-human").props.onPress();
    });
    await act(async () => {
      findByTestId(renderer.root, "maia-start-game").props.onPress();
    });

    // Live game view renders board, Abort (before 2 plies), and no Undo button
    expect(queryByTestId(renderer.root, "maia-play-game")).not.toBeNull();
    expect(queryByTestId(renderer.root, "maia-action-abort")).not.toBeNull();
    expect(queryByTestId(renderer.root, "maia-action-undo")).toBeNull();

    // User plays e2e4 -> Maia starts thinking in Human pace
    await act(async () => {
      capturedOnMove?.({ move: { from: "e2", to: "e4" } });
      await Promise.resolve();
      await Promise.resolve();
    });

    // Mid-game toggle to Instant immediately cancels Maia's thinking delay and plays e7e5!
    await act(async () => {
      findByTestId(renderer.root, "maia-live-pace-instant").props.onPress();
      jest.advanceTimersByTime(200);
      await Promise.resolve();
    });

    expect(service.getMaiaSetupPreferences().thinkingPace).toBe("instant");
    expect(queryByTestId(renderer.root, "maia-action-abort")).toBeNull();
    expect(queryByTestId(renderer.root, "maia-action-draw")).not.toBeNull();
    expect(queryByTestId(renderer.root, "maia-action-resign")).not.toBeNull();

    // Resign -> confirmation modal -> saves to Games and updates Blitz rating
    const blitzBefore = service.getMaiaRating("blitz").rating;
    await act(async () => {
      findByTestId(renderer.root, "maia-action-resign").props.onPress();
    });
    await act(async () => {
      findByTestId(renderer.root, "maia-resign-confirm").props.onPress();
    });

    expect(queryByTestId(renderer.root, "maia-game-result")).not.toBeNull();
    expect(service.getMaiaRating("blitz").games).toBe(1);
    expect(service.getMaiaRating("blitz").rating).toBeLessThan(blitzBefore);
    const savedGames = service.listImportedGames({ platform: "maia" });
    expect(savedGames.length).toBe(1);
    expect(savedGames[0]?.timeClass).toBe("blitz");

    // Tap Review Game -> invokes onOpenGameReview with exact savedGameId
    await act(async () => {
      findByTestId(renderer.root, "maia-result-review").props.onPress();
    });
    expect(reviewCalls).toEqual([savedGames[0]!.id]);

    await act(async () => {
      renderer.unmount();
    });
  });

  test("GamesHubScreen empty state exposes Play with Maia CTA when callback is provided", async () => {
    const store = new MemoryStore();
    const service = new PracticeService(store);
    let playTapped = 0;

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <GamesHubScreen
          service={service}
          onOpenGameReview={() => undefined}
          onPlayWithMaia={() => {
            playTapped += 1;
          }}
        />
      );
    });

    const playBtn = findByTestId(renderer.root, "games-empty-play-maia");
    await act(async () => {
      playBtn.props.onPress();
    });
    expect(playTapped).toBe(1);

    await act(async () => {
      renderer.unmount();
    });
  });

  test("MaiaPlayGameView slides Maia moves via ChessboardRef.move and suppresses programmatic onMove echoes", async () => {
    jest.useFakeTimers();
    const store = new MemoryStore();
    const service = new PracticeService(store);
    const animatedMoves: Array<{ from: string; to: string; promotion?: string }> = [];
    const resetFens: string[] = [];
    let latestOnMove:
      | ((result: { move: { from: string; to: string; promotion?: string } }) => void)
      | null = null;
    let latestHighlights: unknown;

    const RefMockBoard = React.forwardRef<
      { move: (args: { from: string; to: string; promotion?: string }) => Promise<unknown>; resetBoard: (fen: string) => void },
      React.ComponentProps<MaiaPlayBoardComponent>
    >((props, ref) => {
      latestOnMove = props.onMove as unknown as typeof latestOnMove;
      latestHighlights = props.squareHighlights;
      React.useImperativeHandle(ref, () => ({
        async move(args) {
          animatedMoves.push(args);
          // Simulate react-native-chessboard firing onMove during programmatic slide.
          latestOnMove?.({ move: args });
          return { from: args.from, to: args.to };
        },
        resetBoard(fen: string) {
          resetFens.push(fen);
        }
      }));
      return React.createElement(View, { testID: "mock-maia-ref-board", accessibilityLabel: props.fen });
    });

    const fakePolicy: HumanPolicyModel = {
      async scoreMoves(requests) {
        return requests.map((req) => {
          const probs: Record<string, number> = {};
          for (const move of req.moves) {
            probs[move] = move === "e7e5" ? 0.92 : 0.08 / Math.max(1, req.moves.length - 1);
          }
          return {
            byElo: Object.fromEntries(
              req.elos.map((elo) => [elo, { probs, top1Prob: 0.92, entropy: 0.35 }])
            )
          };
        });
      }
    };

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <MaiaPlayScreen
          BoardComponent={RefMockBoard as unknown as MaiaPlayBoardComponent}
          policyModel={fakePolicy}
          service={service}
          onBack={() => undefined}
          onOpenGameReview={() => undefined}
        />
      );
    });

    await act(async () => {
      findByTestId(renderer.root, "maia-color-w").props.onPress();
      findByTestId(renderer.root, "maia-pace-instant").props.onPress();
    });
    await act(async () => {
      findByTestId(renderer.root, "maia-start-game").props.onPress();
    });

    // User plays 1. e4 -> Maia selects a book/policy reply and animates it via boardRef.move
    await act(async () => {
      latestOnMove?.({ move: { from: "e2", to: "e4" } });
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(150);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(animatedMoves.length).toBe(1);
    expect(resetFens.length).toBe(1);
    expect(Array.isArray(latestHighlights) && (latestHighlights as unknown[]).length).toBe(2);
    const activeGame = service.getActiveMaiaGame();
    expect(activeGame?.moves.length).toBe(2);

    await act(async () => {
      renderer.unmount();
    });
  });
});
