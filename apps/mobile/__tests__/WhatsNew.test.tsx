import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { PracticePocScreen } from "../src/components/PracticePocScreen";
import { WhatsNewSheet } from "../src/components/WhatsNewSheet";
import { MemoryStore } from "../../../packages/storage/src/memory-store";
import { PracticeService } from "../../../packages/storage/src/practice-service";
import type { Puzzle } from "../../../packages/core/src/index";
import { createMobilePracticeService } from "../src/platform/mobilePractice";
import {
  WHATS_NEW_RELEASE_VERSION,
  whatsNewContentFor
} from "../src/whatsNew/whatsNewContent";
import { createTestMobilePlatformCapabilities } from "../src/testing/testMobilePlatformCapabilities";

const IOS_NAVIGATION = "A glass tab bar that fits iPhone, iPad, and iPhone Duo.";
const ANDROID_NAVIGATION = "A bottom bar on phones and a side rail on tablets and foldables.";

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

describe("WhatsNewSheet", () => {
  it("shows the title, the three highlights and a Continue button, and continues", () => {
    const onContinue = jest.fn();
    const renderer = create(
      <WhatsNewSheet content={whatsNewContentFor("ios")} visible onContinue={onContinue} />
    );

    expect(text(renderer, "whats-new-title")).toBe("What’s New in Chessticize");
    expect(text(renderer, "whats-new-highlight-look")).toContain("A fresh new look");
    expect(text(renderer, "whats-new-highlight-look"))
      .toContain("A cleaner design with clearer type and more room for the board.");
    expect(text(renderer, "whats-new-highlight-navigation")).toContain("New navigation");
    expect(text(renderer, "whats-new-highlight-navigation")).toContain(IOS_NAVIGATION);
    expect(text(renderer, "whats-new-highlight-dark-mode")).toContain("Dark mode");
    expect(text(renderer, "whats-new-highlight-dark-mode"))
      .toContain("Follows your system, or choose in Settings → Appearance.");

    expect(host(renderer, "whats-new-continue").props.accessibilityLabel).toBe("Continue");
    act(() => {
      find(renderer, "whats-new-continue").props.onPress();
    });
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("uses the Android navigation wording on Android", () => {
    const renderer = create(
      <WhatsNewSheet content={whatsNewContentFor("android")} visible onContinue={() => undefined} />
    );

    expect(text(renderer, "whats-new-highlight-navigation")).toContain(ANDROID_NAVIGATION);
    expect(text(renderer, "whats-new-highlight-navigation")).not.toContain("glass tab bar");
  });

  it("renders nothing while hidden", () => {
    const renderer = create(
      <WhatsNewSheet content={whatsNewContentFor("ios")} visible={false} onContinue={() => undefined} />
    );

    expect(renderer.root.findAllByProps({ testID: "whats-new-sheet" })).toEqual([]);
  });
});

describe("What’s New on launch", () => {
  it("shows once on the first launch after an update and stays away afterwards", () => {
    const service = serviceWith({ lastSeen: "1.5.3" });
    const renderer = renderScreen(service);

    expect(find(renderer, "practice-home")).toBeTruthy();
    expect(text(renderer, "whats-new-title")).toBe("What’s New in Chessticize");
    expect(text(renderer, "whats-new-highlight-navigation")).toContain(IOS_NAVIGATION);
    // Still pending until the user finishes: nothing is recorded yet.
    expect(service.getSettings().whatsNewSeenVersion).toBe("1.5.3");

    press(renderer, "whats-new-continue");
    expect(isShown(renderer)).toBe(false);
    expect(service.getSettings().whatsNewSeenVersion).toBe(WHATS_NEW_RELEASE_VERSION);

    const relaunched = renderScreen(service);
    expect(isShown(relaunched)).toBe(false);
  });

  it("shows again on the next launch if the user left without finishing", () => {
    const service = serviceWith({ lastSeen: "1.5.3" });
    const first = renderScreen(service);
    expect(isShown(first)).toBe(true);
    act(() => {
      first.unmount();
    });

    expect(isShown(renderScreen(service))).toBe(true);
  });

  it("uses the Android copy on Android", () => {
    const renderer = renderScreen(serviceWith({ lastSeen: "1.5.3" }), { platform: "android" });

    expect(text(renderer, "whats-new-highlight-navigation")).toContain(ANDROID_NAVIGATION);
  });

  it("never shows to a fresh install, and records the version so a later update is detected", () => {
    const service = serviceWith({});
    const renderer = renderScreen(service);

    expect(isShown(renderer)).toBe(false);
    expect(service.getSettings().whatsNewSeenVersion).toBe("1.6.0");
  });

  it("shows to an upgrading user with progress but no recorded version", () => {
    const renderer = renderScreen(serviceWith({ withProgress: true }));

    expect(isShown(renderer)).toBe(true);
  });

  it("does not show on a build older than the release", () => {
    const service = serviceWith({ withProgress: true, lastSeen: "1.5.0" });
    const renderer = renderScreen(service, { version: "1.5.3" });

    expect(isShown(renderer)).toBe(false);
    expect(service.getSettings().whatsNewSeenVersion).toBe("1.5.0");
  });

  it("does not show again once the release is already seen", () => {
    const renderer = renderScreen(serviceWith({ withProgress: true, lastSeen: "1.6.0" }));

    expect(isShown(renderer)).toBe(false);
  });

  it("waits for an idle Practice home and never interrupts an active or resumable Run", () => {
    const service = createMobilePracticeService("familiar15");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 15, maxMistakes: 3 },
      new Date(Date.now()).toISOString()
    );
    service.saveSettings({ ...service.getSettings(), whatsNewSeenVersion: "1.5.3" });
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
    expect(service.getSettings().whatsNewSeenVersion).toBe("1.5.3");

    press(renderer, "whats-new-continue");
    expect(service.getSettings().whatsNewSeenVersion).toBe("1.6.0");
  });

  it("waits while another tab is selected", () => {
    const service = serviceWith({ lastSeen: "1.5.3" });
    const renderer = renderScreen(service, { initialTab: "settings" });

    expect(find(renderer, "settings-panel")).toBeTruthy();
    expect(isShown(renderer)).toBe(false);

    press(renderer, "practice-tab");
    expect(isShown(renderer)).toBe(true);
  });
});

describe("What’s New in Settings", () => {
  it("reopens the latest notes at any time without changing what is recorded", () => {
    const service = serviceWith({ withProgress: true, lastSeen: "1.6.0" });
    const renderer = renderScreen(service);
    expect(isShown(renderer)).toBe(false);

    press(renderer, "settings-tab");
    expect(host(renderer, "settings-whats-new").props.accessibilityLabel).toBe("What’s New");
    press(renderer, "settings-whats-new");
    expect(text(renderer, "whats-new-title")).toBe("What’s New in Chessticize");
    expect(find(renderer, "settings-panel")).toBeTruthy();

    press(renderer, "whats-new-continue");
    expect(isShown(renderer)).toBe(false);
    expect(service.getSettings().whatsNewSeenVersion).toBe("1.6.0");
  });

  it("reopens the notes even on a build older than the release", () => {
    const renderer = renderScreen(serviceWith({ withProgress: true }), { version: "1.5.3" });

    press(renderer, "settings-tab");
    press(renderer, "settings-whats-new");

    expect(isShown(renderer)).toBe(true);
  });
});

describe("What’s New Dev controls", () => {
  it("shows the notes on demand, whatever the version", () => {
    const service = serviceWith({ withProgress: true, lastSeen: "1.5.3" });
    const renderer = renderScreen(service, { version: "1.5.3", devControls: true });
    expect(isShown(renderer)).toBe(false);

    press(renderer, "test-whats-new-show");
    expect(isShown(renderer)).toBe(true);

    press(renderer, "whats-new-continue");
    expect(isShown(renderer)).toBe(false);
    expect(service.getSettings().whatsNewSeenVersion).toBe("1.5.3");
  });

  it("simulates the first launch after an update from the previous release", () => {
    const service = serviceWith({ withProgress: true, lastSeen: "1.6.0" });
    const renderer = renderScreen(service, { version: "1.5.3", devControls: true });
    expect(isShown(renderer)).toBe(false);

    press(renderer, "test-whats-new-simulate-update");
    expect(service.getSettings().whatsNewSeenVersion).toBe("1.5.3");
    expect(isShown(renderer)).toBe(true);

    press(renderer, "whats-new-continue");
    expect(isShown(renderer)).toBe(false);
    expect(service.getSettings().whatsNewSeenVersion).toBe("1.6.0");
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
  } = {}
): TestRenderer.ReactTestRenderer {
  return create(
    <PracticePocScreen
      initialTab={options.initialTab}
      platformCapabilities={createTestMobilePlatformCapabilities({
        practiceService: service,
        reminderPlatform: options.platform ?? "ios",
        applicationMetadata: { versionName: options.version ?? "1.6.0" },
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
