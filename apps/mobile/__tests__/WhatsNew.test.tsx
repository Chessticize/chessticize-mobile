import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { PracticePocScreen } from "../src/components/PracticePocScreen";
import { WhatsNewSheet } from "../src/components/WhatsNewSheet";
import { GamesHubScreen } from "../src/components/games/GamesHubScreen";
import { GameReviewScreen } from "../src/components/gameReview/GameReviewScreen";
import { MemoryStore } from "../../../packages/storage/src/memory-store";
import { PracticeService } from "../../../packages/storage/src/practice-service";
import type { GameImportHttpClient, Puzzle } from "../../../packages/core/src/index";
import { createMobilePracticeService } from "../src/platform/mobilePractice";
import {
  WHATS_NEW_RELEASE_VERSION,
  whatsNewContentFor
} from "../src/whatsNew/whatsNewContent";
import { createTestMobilePlatformCapabilities } from "../src/testing/testMobilePlatformCapabilities";

const renderers: TestRenderer.ReactTestRenderer[] = [];

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  for (const renderer of renderers.splice(0)) {
    act(() => {
      renderer.unmount();
    });
  }
  jest.useRealTimers();
});

describe("WhatsNewSheet (2.0)", () => {
  it("shows the 2.0 title, four highlights (online games primary, Maia secondary), and continues", () => {
    const onContinue = jest.fn();
    const renderer = create(
      <WhatsNewSheet content={whatsNewContentFor("ios")} visible onContinue={onContinue} />
    );

    expect(text(renderer, "whats-new-title")).toBe("What’s New in Chessticize 2.0");
    expect(text(renderer, "whats-new-highlight-games-import")).toContain("Import your online games");
    expect(text(renderer, "whats-new-highlight-games-import")).toContain("Chess.com or Lichess");
    expect(text(renderer, "whats-new-highlight-game-review")).toContain("Free offline Game Review");
    expect(text(renderer, "whats-new-highlight-personal-puzzles")).toContain("Puzzles from your own games");
    expect(text(renderer, "whats-new-highlight-play-maia")).toContain("Play offline against Maia");

    expect(host(renderer, "whats-new-continue").props.accessibilityLabel).toBe("Continue");
    act(() => {
      find(renderer, "whats-new-continue").props.onPress();
    });
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("shows the Link Chess Account CTA when provided and triggers it", () => {
    const onContinue = jest.fn();
    const onLinkAccount = jest.fn();
    const renderer = create(
      <WhatsNewSheet
        content={whatsNewContentFor("android")}
        visible
        onContinue={onContinue}
        onLinkAccount={onLinkAccount}
      />
    );

    expect(find(renderer, "whats-new-link-account")).toBeTruthy();
    press(renderer, "whats-new-link-account");
    expect(onLinkAccount).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("renders nothing while hidden", () => {
    const renderer = create(
      <WhatsNewSheet content={whatsNewContentFor("ios")} visible={false} onContinue={() => undefined} />
    );

    expect(renderer.root.findAllByProps({ testID: "whats-new-sheet" })).toEqual([]);
  });
});

describe("What’s New on launch (upgrading users)", () => {
  it("shows once on the first launch after updating to 2.0 and stays away afterwards", () => {
    const service = serviceWith({ lastSeen: "1.7.0", withProgress: true });
    const renderer = renderScreen(service);

    expect(find(renderer, "practice-home")).toBeTruthy();
    expect(text(renderer, "whats-new-title")).toBe("What’s New in Chessticize 2.0");
    expect(isOnboardingShown(renderer)).toBe(false);
    // Still pending until the user finishes: nothing is recorded yet.
    expect(service.getSettings().whatsNewSeenVersion).toBe("1.7.0");

    press(renderer, "whats-new-continue");
    expect(isShown(renderer)).toBe(false);
    expect(service.getSettings().whatsNewSeenVersion).toBe(WHATS_NEW_RELEASE_VERSION);

    const relaunched = renderScreen(service);
    expect(isShown(relaunched)).toBe(false);
    expect(isOnboardingShown(relaunched)).toBe(false);
  });

  it("tapping Link Chess Account records 2.0 seen, opens Games tab, and shows the Import modal", () => {
    const service = serviceWith({ lastSeen: "1.7.0", withProgress: true });
    const renderer = renderScreen(service);

    expect(isShown(renderer)).toBe(true);
    press(renderer, "whats-new-link-account");

    expect(isShown(renderer)).toBe(false);
    expect(service.getSettings().whatsNewSeenVersion).toBe(WHATS_NEW_RELEASE_VERSION);
    expect(find(renderer, "games-hub-screen")).toBeTruthy();
    expect(find(renderer, "games-import-modal")).toBeTruthy();
  });

  it("shows again on the next launch if the user left without finishing", () => {
    const service = serviceWith({ lastSeen: "1.7.0", withProgress: true });
    const first = renderScreen(service);
    expect(isShown(first)).toBe(true);
    act(() => {
      first.unmount();
    });

    expect(isShown(renderScreen(service))).toBe(true);
  });

  it("shows to an upgrading user with progress but no recorded version", () => {
    const renderer = renderScreen(serviceWith({ withProgress: true }));

    expect(isShown(renderer)).toBe(true);
    expect(isOnboardingShown(renderer)).toBe(false);
  });

  it("does not show on a build older than 2.0.0", () => {
    const service = serviceWith({ withProgress: true, lastSeen: "1.6.0" });
    const renderer = renderScreen(service, { version: "1.7.1" });

    expect(isShown(renderer)).toBe(false);
    expect(isOnboardingShown(renderer)).toBe(false);
    expect(service.getSettings().whatsNewSeenVersion).toBe("1.6.0");
  });

  it("does not show again once 2.0.0 is already seen", () => {
    const renderer = renderScreen(serviceWith({ withProgress: true, lastSeen: "2.0.0" }));

    expect(isShown(renderer)).toBe(false);
    expect(isOnboardingShown(renderer)).toBe(false);
  });

  it("waits for an idle Practice home and never interrupts an active or resumable Run", () => {
    const service = createMobilePracticeService("familiar15");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 15, maxMistakes: 3 },
      new Date(Date.now()).toISOString()
    );
    service.saveSettings({ ...service.getSettings(), whatsNewSeenVersion: "1.7.0" });
    const renderer = renderScreen(service);

    // The Run is resumable from the Practice home.
    expect(find(renderer, "practice-resume-card")).toBeTruthy();
    expect(isShown(renderer)).toBe(false);

    // Resuming makes it the active Run.
    press(renderer, "practice-resume-card");
    expect(find(renderer, "session-board")).toBeTruthy();
    expect(isShown(renderer)).toBe(false);

    // Leaving the Run shows its summary, then an idle home, where the notes finally appear.
    press(renderer, "session-abandon");
    press(renderer, "session-abandon-confirm");
    expect(find(renderer, "sprint-summary-panel")).toBeTruthy();
    expect(isShown(renderer)).toBe(false);
    press(renderer, "back-practice-button");
    expect(find(renderer, "practice-home")).toBeTruthy();
    expect(isShown(renderer)).toBe(true);
    expect(service.getSettings().whatsNewSeenVersion).toBe("1.7.0");

    press(renderer, "whats-new-continue");
    expect(service.getSettings().whatsNewSeenVersion).toBe("2.0.0");
  });

  it("waits while another tab is selected", () => {
    const service = serviceWith({ lastSeen: "1.7.0", withProgress: true });
    const renderer = renderScreen(service, { initialTab: "settings" });

    expect(find(renderer, "settings-panel")).toBeTruthy();
    expect(isShown(renderer)).toBe(false);

    press(renderer, "practice-tab");
    expect(isShown(renderer)).toBe(true);
  });
});

describe("Welcome Onboarding on fresh 2.0 install", () => {
  it("shows Welcome Onboarding instead of What's New on a fresh 2.0 install and records seen on skip", () => {
    const service = serviceWith({});
    const renderer = renderScreen(service);

    expect(isShown(renderer)).toBe(false);
    expect(isOnboardingShown(renderer)).toBe(true);
    expect(text(renderer, "welcome-onboarding-title")).toBe("Welcome to Chessticize");
    expect(text(renderer, "welcome-onboarding-highlight-import-review")).toContain("Learn from your online games");
    expect(text(renderer, "welcome-onboarding-highlight-offline-tactics")).toContain("Sharpen tactics anywhere");
    expect(text(renderer, "welcome-onboarding-highlight-maia-play")).toContain("Practice against Maia offline");

    press(renderer, "welcome-onboarding-start-practicing");
    expect(isOnboardingShown(renderer)).toBe(false);
    expect(service.getSettings().onboarding?.welcomeSeen).toBe(true);
    expect(service.getSettings().whatsNewSeenVersion).toBe("2.0.0");

    // Relaunching shows neither Welcome Onboarding nor What's New.
    const relaunched = renderScreen(service);
    expect(isShown(relaunched)).toBe(false);
    expect(isOnboardingShown(relaunched)).toBe(false);
  });

  it("allows linking a Chess.com account inline in Step 2 and jumping straight into Games", async () => {
    const service = serviceWith({});
    const fakeHttpClient: GameImportHttpClient = {
      getText: async (url) => {
        if (url.endsWith("/games/archives")) {
          return {
            status: 200,
            text: JSON.stringify({
              archives: ["https://api.chess.com/pub/player/hikaru/games/2026/11"]
            })
          };
        }
        return {
          status: 200,
          text: JSON.stringify({
            games: [
              {
                url: "https://www.chess.com/game/live/1001",
                rules: "chess",
                pgn:
                  '[Event "Live Chess"]\n[White "hikaru"]\n[Black "opponent"]\n[Result "1-0"]\n[TimeControl "180"]\n\n1. e4 e5 2. Nf3 Nc6 1-0',
                time_class: "blitz",
                time_control: "180",
                end_time: 1_760_000_000,
                rated: true,
                white: { username: "hikaru", rating: 2900, result: "win" },
                black: { username: "opponent", rating: 2800, result: "resigned" }
              }
            ]
          })
        };
      }
    };

    const renderer = renderScreen(service, { welcomeOnboardingHttpClient: fakeHttpClient });
    expect(isOnboardingShown(renderer)).toBe(true);

    press(renderer, "welcome-onboarding-next");
    expect(text(renderer, "welcome-onboarding-link-title")).toBe("Import your online games");

    act(() => {
      find(renderer, "welcome-onboarding-username").props.onChangeText("hikaru");
    });

    await act(async () => {
      await find(renderer, "welcome-onboarding-import-submit").props.onPress();
    });

    expect(text(renderer, "welcome-onboarding-success")).toContain("Imported 1 game");
    expect(service.listLinkedAccounts()).toHaveLength(1);
    expect(service.listImportedGames()).toHaveLength(1);

    press(renderer, "welcome-onboarding-open-games");
    expect(isOnboardingShown(renderer)).toBe(false);
    expect(service.getSettings().onboarding?.welcomeSeen).toBe(true);
    expect(service.getSettings().whatsNewSeenVersion).toBe("2.0.0");
    expect(find(renderer, "games-hub-screen")).toBeTruthy();
  });
});

describe("Contextual 2.0 guides (Games & Game Review) and Settings reset", () => {
  it("shows and dismisses the Games Hub first-use tip once games exist", () => {
    const store = new MemoryStore();
    const service = new PracticeService(store);
    service.upsertImportedGames(
      [
        {
          id: "chess_com:game-1",
          platform: "chess_com",
          username: "player1",
          pgn: '[White "player1"]\n[Black "rival"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0',
          white: { username: "player1", rating: 1500, isAi: false },
          black: { username: "rival", rating: 1490, isAi: false },
          userColor: "w",
          winner: "w",
          termination: "resign",
          rated: true,
          timeControl: "180",
          timeClass: "blitz",
          playedAt: "2026-11-20T10:00:00.000Z"
        }
      ],
      "2026-11-20T10:05:00.000Z"
    );

    const renderer = create(
      <GamesHubScreen service={service} onOpenGameReview={() => undefined} />
    );
    expect(find(renderer, "games-first-use-guide")).toBeTruthy();

    press(renderer, "games-guide-dismiss");
    expect(renderer.root.findAllByProps({ testID: "games-first-use-guide" })).toEqual([]);
    expect(service.getSettings().onboarding?.gamesGuideSeen).toBe(true);
  });

  it("shows and dismisses the Game Review first-use tip", () => {
    const store = new MemoryStore();
    const service = new PracticeService(store);
    service.upsertImportedGames(
      [
        {
          id: "chess_com:game-2",
          platform: "chess_com",
          username: "player1",
          pgn: '[White "player1"]\n[Black "rival"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0',
          white: { username: "player1", rating: 1500, isAi: false },
          black: { username: "rival", rating: 1490, isAi: false },
          userColor: "w",
          winner: "w",
          termination: "resign",
          rated: true,
          timeControl: "180",
          timeClass: "blitz",
          playedAt: "2026-11-20T10:00:00.000Z"
        }
      ],
      "2026-11-20T10:05:00.000Z"
    );
    const game = service.getImportedGame("chess_com:game-2")!;

    const renderer = create(
      <GameReviewScreen game={game} practiceService={service} store={store} />
    );
    expect(find(renderer, "game-review-first-use-guide")).toBeTruthy();

    press(renderer, "game-review-guide-dismiss");
    expect(renderer.root.findAllByProps({ testID: "game-review-first-use-guide" })).toEqual([]);
    expect(service.getSettings().onboarding?.gameReviewGuideSeen).toBe(true);
  });

  it("Settings Reset guides re-arms Games & Game Review tips while keeping welcomeSeen, and Welcome Guide reopens on demand", () => {
    const service = serviceWith({ withProgress: true, lastSeen: "2.0.0" });
    service.saveSettings({
      ...service.getSettings(),
      onboarding: { welcomeSeen: true, gamesGuideSeen: true, gameReviewGuideSeen: true }
    });
    const renderer = renderScreen(service, { initialTab: "settings", sprintGuidanceEnabled: true });

    press(renderer, "settings-show-sprint-guide");
    expect(service.getSettings().onboarding).toEqual({
      welcomeSeen: true,
      gamesGuideSeen: false,
      gameReviewGuideSeen: false
    });

    press(renderer, "settings-welcome-guide");
    expect(isOnboardingShown(renderer)).toBe(true);
  });
});

describe("What’s New in Settings", () => {
  it("reopens the latest notes at any time without changing what is recorded", () => {
    const service = serviceWith({ withProgress: true, lastSeen: "2.0.0" });
    const renderer = renderScreen(service);
    expect(isShown(renderer)).toBe(false);

    press(renderer, "settings-tab");
    expect(host(renderer, "settings-whats-new").props.accessibilityLabel).toBe("What’s New");
    press(renderer, "settings-whats-new");
    expect(text(renderer, "whats-new-title")).toBe("What’s New in Chessticize 2.0");
    expect(find(renderer, "settings-panel")).toBeTruthy();

    press(renderer, "whats-new-continue");
    expect(isShown(renderer)).toBe(false);
    expect(service.getSettings().whatsNewSeenVersion).toBe("2.0.0");
  });

  it("reopens the notes even on a build older than 2.0.0", () => {
    const renderer = renderScreen(serviceWith({ withProgress: true }), { version: "1.7.0" });

    press(renderer, "settings-tab");
    press(renderer, "settings-whats-new");

    expect(isShown(renderer)).toBe(true);
  });
});

describe("What’s New & Onboarding Dev controls", () => {
  it("shows the notes on demand, whatever the version", () => {
    const service = serviceWith({ withProgress: true, lastSeen: "1.7.0" });
    const renderer = renderScreen(service, { version: "1.7.0", devControls: true });
    expect(isShown(renderer)).toBe(false);

    press(renderer, "test-whats-new-show");
    expect(isShown(renderer)).toBe(true);

    press(renderer, "whats-new-continue");
    expect(isShown(renderer)).toBe(false);
    expect(service.getSettings().whatsNewSeenVersion).toBe("1.7.0");
  });

  it("simulates the first launch after an update from 1.7.0 to 2.0.0", () => {
    const service = serviceWith({ withProgress: true, lastSeen: "2.0.0" });
    const renderer = renderScreen(service, { version: "1.7.0", devControls: true });
    expect(isShown(renderer)).toBe(false);

    press(renderer, "test-whats-new-simulate-update");
    expect(service.getSettings().whatsNewSeenVersion).toBe("1.7.0");
    expect(isShown(renderer)).toBe(true);

    press(renderer, "whats-new-continue");
    expect(isShown(renderer)).toBe(false);
    expect(service.getSettings().whatsNewSeenVersion).toBe("2.0.0");
  });

  it("simulates a fresh 2.0 install from Dev controls", () => {
    const service = serviceWith({ withProgress: true, lastSeen: "2.0.0" });
    const renderer = renderScreen(service, { version: "2.0.0", devControls: true });
    expect(isOnboardingShown(renderer)).toBe(false);

    press(renderer, "test-onboarding-simulate-fresh");
    expect(isOnboardingShown(renderer)).toBe(true);

    press(renderer, "welcome-onboarding-skip");
    expect(isOnboardingShown(renderer)).toBe(false);
    expect(service.getSettings().onboarding?.welcomeSeen).toBe(true);
  });
});

function create(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  renderers.push(renderer!);
  return renderer!;
}

function renderScreen(
  service: PracticeService,
  options: {
    initialTab?: "practice" | "settings";
    platform?: "android" | "ios";
    version?: string;
    devControls?: boolean;
    sprintGuidanceEnabled?: boolean;
    welcomeOnboardingHttpClient?: GameImportHttpClient;
  } = {}
): TestRenderer.ReactTestRenderer {
  return create(
    <PracticePocScreen
      initialTab={options.initialTab}
      sprintGuidanceEnabled={options.sprintGuidanceEnabled}
      welcomeOnboardingHttpClient={options.welcomeOnboardingHttpClient}
      platformCapabilities={createTestMobilePlatformCapabilities({
        practiceService: service,
        reminderPlatform: options.platform ?? "ios",
        applicationMetadata: { versionName: options.version ?? "2.0.0" },
        ...(options.devControls ? { configurePuzzleSource: () => undefined } : {})
      })}
    />
  );
}

// A service holding the state an install would have: an optional recorded
// last-seen version and optional earlier practice.
function serviceWith({
  lastSeen,
  withProgress = false
}: {
  lastSeen?: string;
  withProgress?: boolean;
}): PracticeService {
  const store = new MemoryStore();
  store.seedPuzzles([historyPuzzle()]);
  const service = new PracticeService(store);
  if (withProgress) {
    store.recordAttempt({
      id: "earlier-attempt",
      source: "sprint",
      sessionId: "earlier-session",
      puzzleId: "history-puzzle",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "correct",
      submittedMove: "e2e4",
      expectedMove: "e2e4",
      startedAt: "2026-07-07T00:00:00.000Z",
      completedAt: "2026-07-07T00:00:05.000Z",
      ratingBefore: 600
    });
  }
  if (lastSeen !== undefined) {
    service.saveSettings({ ...service.getSettings(), whatsNewSeenVersion: lastSeen });
  }
  return service;
}

function historyPuzzle(): Puzzle {
  return {
    id: "history-puzzle",
    initialFen: "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1",
    solutionMoves: ["e2e4"],
    rating: 900,
    themes: ["fork"],
    source: "lichess",
    stockfishBestMove: "e2e3"
  };
}

function find(renderer: TestRenderer.ReactTestRenderer, testID: string): TestRenderer.ReactTestInstance {
  return renderer.root.findByProps({ testID });
}

// The host element (Pressable, View) that carries a testID, below any shared
// primitive that forwards the same testID.
function host(renderer: TestRenderer.ReactTestRenderer, testID: string): TestRenderer.ReactTestInstance {
  const hosts = renderer.root.findAll((node) => typeof node.type === "string" && node.props.testID === testID);
  if (hosts.length === 0) {
    throw new Error(`No host element with testID ${testID}`);
  }
  return hosts[0]!;
}

function isShown(renderer: TestRenderer.ReactTestRenderer): boolean {
  return renderer.root.findAllByProps({ testID: "whats-new-sheet" }).length > 0;
}

function isOnboardingShown(renderer: TestRenderer.ReactTestRenderer): boolean {
  return renderer.root.findAllByProps({ testID: "welcome-onboarding-sheet" }).length > 0;
}

function press(renderer: TestRenderer.ReactTestRenderer, testID: string): void {
  act(() => {
    find(renderer, testID).props.onPress();
  });
}

function text(renderer: TestRenderer.ReactTestRenderer, testID: string): string {
  return collectText(find(renderer, testID));
}

function collectText(node: TestRenderer.ReactTestInstance): string {
  const own = node.children.filter((child): child is string => typeof child === "string").join("");
  const nested = node.children
    .filter((child): child is TestRenderer.ReactTestInstance => typeof child !== "string")
    .map((child) => collectText(child))
    .join(" ");
  return `${own}${nested}`.replace(/\s+/g, " ").trim();
}
