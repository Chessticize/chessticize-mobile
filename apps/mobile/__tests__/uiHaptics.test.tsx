import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { PracticeViewportProvider } from "../src/components/PracticeViewport";
import { Button, SegmentedControl } from "../src/components/ui";
import { EditorSwitch, StepperButton } from "../src/components/practice/shared/editorControls";
import { MoveFeedbackSettingsSection } from "../src/components/MoveFeedbackSettingsSection";
import {
  CustomModeChoiceRow,
  CustomThemeChoiceRow
} from "../src/components/practice/customSetup/CustomSprintSetup";
import { SprintResultScreen, type SprintResultScreenActions } from "../src/components/SprintResultScreen";
import { SurvivalResultScreen } from "../src/components/SurvivalResultScreen";
import type { SprintResultData } from "../src/components/sprintResultPresentation";
import type { SurvivalResultData } from "../src/components/survivalResultPresentation";
import type { MoveFeedbackPreferences } from "../src/platform/moveFeedback";
import { PracticePocScreen } from "../src/components/PracticePocScreen";
import { createMobilePracticeService } from "../src/platform/mobilePractice";
import { createTestMobilePlatformCapabilities } from "../src/testing/testMobilePlatformCapabilities";
import {
  FakeUiHapticsClient,
  createNativeUiHapticsClient,
  createUiHaptics,
  UiHapticsProvider,
  useUiHaptics,
  type UiHapticIntent,
  type UiHapticsClient
} from "../src/platform/uiHaptics";

// UI haptics for primary actions (#609 item 4): the gate, the native boundary
// and the interactions that fire each intent, observed through a fake client
// at the native boundary.

describe("UI haptics gate", () => {
  it("forwards every intent to the native boundary while the setting is on", () => {
    const client = new FakeUiHapticsClient();
    const haptics = createUiHaptics({ client, isEnabled: () => true });

    haptics("selection");
    haptics("impactLight");
    haptics("success");
    haptics("warning");

    expect(client.played).toEqual(["selection", "impactLight", "success", "warning"]);
  });

  it("stays silent while the Haptic feedback setting is off, reading it at each intent", () => {
    const client = new FakeUiHapticsClient();
    let enabled = false;
    const haptics = createUiHaptics({ client, isEnabled: () => enabled });

    haptics("impactLight");
    enabled = true;
    haptics("selection");
    enabled = false;
    haptics("success");

    expect(client.played).toEqual(["selection"]);
  });

  it("ignores intents outside the typed set", () => {
    const client = new FakeUiHapticsClient();
    const haptics = createUiHaptics({ client, isEnabled: () => true });

    haptics("heavy" as UiHapticIntent);

    expect(client.played).toEqual([]);
  });

  it("is a no-op without a native client", () => {
    const isEnabled = jest.fn(() => true);
    const haptics = createUiHaptics({ client: null, isEnabled });

    expect(() => haptics("success")).not.toThrow();
    expect(isEnabled).not.toHaveBeenCalled();
  });

  it("never lets a failing generator break the action", async () => {
    const rejecting: UiHapticsClient = { play: () => Promise.reject(new Error("no engine")) };
    const throwing: UiHapticsClient = {
      play: () => {
        throw new Error("no module");
      }
    };

    expect(() => createUiHaptics({ client: rejecting, isEnabled: () => true })("warning")).not.toThrow();
    expect(() => createUiHaptics({ client: throwing, isEnabled: () => true })("warning")).not.toThrow();
    await Promise.resolve();
  });
});

describe("native UI haptics client", () => {
  it("has no client on web", () => {
    const playUiHaptic = jest.fn(async () => undefined);

    expect(createNativeUiHapticsClient({ playUiHaptic }, "web")).toBeNull();
  });

  it("has no client when the native module or its method is missing", () => {
    expect(createNativeUiHapticsClient(undefined, "ios")).toBeNull();
    expect(createNativeUiHapticsClient({}, "android")).toBeNull();
  });

  it.each(["ios", "android"])("passes the intent name to the MoveFeedback module on %s", async (platformOS) => {
    const playUiHaptic = jest.fn(async () => undefined);
    const client = createNativeUiHapticsClient({ playUiHaptic }, platformOS);

    await client?.play("selection");
    await client?.play("impactLight");
    await client?.play("success");
    await client?.play("warning");

    expect(playUiHaptic.mock.calls).toEqual([["selection"], ["impactLight"], ["success"], ["warning"]]);
  });

  it("is absent in tests, where the MoveFeedback module does not exist", () => {
    expect(createNativeUiHapticsClient()).toBeNull();
  });
});

describe("UI haptics without a provider", () => {
  it("does nothing, as in Storybook and the Interaction Lab", () => {
    let haptics: ReturnType<typeof useUiHaptics> | undefined;
    function Probe(): null {
      haptics = useUiHaptics();
      return null;
    }
    act(() => {
      TestRenderer.create(<Probe />);
    });

    expect(() => haptics?.("success")).not.toThrow();
  });
});

describe("UI haptic interactions", () => {
  it("plays a light impact only for the primary button", () => {
    const client = new FakeUiHapticsClient();
    const onPress = jest.fn();
    const renderer = renderWithHaptics(client, (
      <>
        <Button label="Start" testID="primary" onPress={onPress} />
        <Button label="Edit" testID="secondary" variant="secondary" onPress={onPress} />
        <Button label="Add Run" testID="plain" variant="plain" onPress={onPress} />
        <Button label="Remove" testID="destructive" variant="destructive" onPress={onPress} />
      </>
    ));

    press(renderer, "secondary");
    press(renderer, "plain");
    press(renderer, "destructive");
    expect(client.played).toEqual([]);

    press(renderer, "primary");
    expect(client.played).toEqual(["impactLight"]);
    expect(onPress).toHaveBeenCalledTimes(4);
  });

  it("plays selection feedback when a segmented control changes, not when the selected segment is tapped", () => {
    const client = new FakeUiHapticsClient();
    const onChange = jest.fn();
    const renderer = renderWithHaptics(client, (
      <SegmentedControl
        accessibilityLabel="Appearance"
        options={[
          { value: "light", label: "Light", testID: "segment-light" },
          { value: "dark", label: "Dark", testID: "segment-dark" }
        ]}
        value="light"
        onChange={onChange}
      />
    ));

    press(renderer, "segment-light");
    expect(client.played).toEqual([]);

    press(renderer, "segment-dark");
    expect(client.played).toEqual(["selection"]);
    expect(onChange).toHaveBeenLastCalledWith("dark");
  });

  it("plays selection feedback for a switch and each stepper step", () => {
    const client = new FakeUiHapticsClient();
    const renderer = renderWithHaptics(client, (
      <>
        <EditorSwitch accessibilityLabel="Puzzle timer" enabled={false} testID="switch" onPress={jest.fn()} />
        <StepperButton accessibilityLabel="Decrease" direction="decrease" disabled={false} testID="minus" onPress={jest.fn()} />
        <StepperButton accessibilityLabel="Increase" direction="increase" disabled={false} testID="plus" onPress={jest.fn()} />
      </>
    ));

    press(renderer, "switch");
    press(renderer, "minus");
    press(renderer, "plus");

    expect(client.played).toEqual(["selection", "selection", "selection"]);
  });

  it("plays selection feedback for a mode choice that moves and for every theme toggle", () => {
    const client = new FakeUiHapticsClient();
    const renderer = renderWithHaptics(client, (
      <>
        <CustomModeChoiceRow testID="mode" value="custom" onChange={jest.fn()} />
        <CustomThemeChoiceRow selectedThemes={["mixed", "fork"]} testID="themes" onChange={jest.fn()} />
      </>
    ));

    press(renderer, "custom-mode-regular");
    press(renderer, "custom-theme-mixed");
    expect(client.played).toEqual([]);

    press(renderer, "custom-mode-arrow-duel");
    press(renderer, "custom-theme-fork");
    press(renderer, "custom-theme-pin");
    expect(client.played).toEqual(["selection", "selection", "selection"]);
  });

  it("confirms turning Haptic feedback on and stays silent turning it off", () => {
    const client = new FakeUiHapticsClient();
    let preferences: MoveFeedbackPreferences = { soundEnabled: false, hapticsEnabled: false };
    const haptics = createUiHaptics({ client, isEnabled: () => preferences.hapticsEnabled });
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    const render = (): React.JSX.Element => (
      <UiHapticsProvider value={haptics}>
        <MoveFeedbackSettingsSection
          preferences={preferences}
          onPreferencesChange={(next) => {
            preferences = next;
          }}
        />
      </UiHapticsProvider>
    );
    act(() => {
      renderer = TestRenderer.create(render());
    });

    press(renderer!, "settings-move-sound-toggle");
    expect(client.played).toEqual([]);

    act(() => renderer!.update(render()));
    press(renderer!, "settings-move-haptics-toggle");
    expect(preferences.hapticsEnabled).toBe(true);
    expect(client.played).toEqual(["selection"]);

    act(() => renderer!.update(render()));
    press(renderer!, "settings-move-haptics-toggle");
    expect(preferences.hapticsEnabled).toBe(false);
    expect(client.played).toEqual(["selection"]);
  });
});

describe("result outcome haptics", () => {
  it.each<[string, Partial<SprintResultData>, UiHapticIntent[]]>([
    ["a passed Sprint plays success", { outcome: "passed" }, ["success"]],
    ["a failed Sprint plays a warning", { outcome: "failed", endReason: "max_mistakes" }, ["warning"]],
    ["an abandoned Sprint stays silent", { outcome: "abandoned", endReason: "abandoned" }, []],
    ["a completed Focused Run stays silent", { kind: "focusedRun", outcome: "completed" }, []]
  ])("%s once when the Sprint Result appears", (_name, overrides, expected) => {
    const client = new FakeUiHapticsClient();
    const result = sprintData(overrides);
    const renderer = renderWithHaptics(client, resultFrame(<SprintResultScreen data={result} {...sprintActions()} />));

    act(() => renderer.update(withHaptics(client, resultFrame(
      <SprintResultScreen data={{ ...result }} {...sprintActions()} />
    ))));

    expect(client.played).toEqual(expected);
  });

  it.each<[string, Partial<SurvivalResultData>, UiHapticIntent[]]>([
    ["a new best plays success", { isNewBest: true, endReason: "max_mistakes" }, ["success"]],
    ["a Run ended by three mistakes plays a warning", { isNewBest: false, previousBestScore: 30 }, ["warning"]],
    ["a perfect clear that only ties the best stays silent", { isNewBest: false, endReason: "pool_cleared", previousBestScore: 19 }, []]
  ])("%s once when the Survival result appears", (_name, overrides, expected) => {
    const client = new FakeUiHapticsClient();
    const result = survivalData(overrides);
    const element = (data: SurvivalResultData): React.JSX.Element => resultFrame(
      <SurvivalResultScreen data={data} onBack={jest.fn()} onDone={jest.fn()} onPlayAgain={jest.fn()} />
    );
    const renderer = renderWithHaptics(client, element(result));

    act(() => renderer.update(withHaptics(client, element({ ...result }))));

    expect(client.played).toEqual(expected);
  });

  it("does not replay a session's outcome when its result appears again, as after a tab switch", () => {
    const client = new FakeUiHapticsClient();
    const sprint = (sessionId: string): React.JSX.Element => resultFrame(
      <SprintResultScreen data={sprintData({ outcome: "passed", sessionId })} {...sprintActions()} />
    );
    const survival = (sessionId: string): React.JSX.Element => resultFrame(
      <SurvivalResultScreen
        data={survivalData({ isNewBest: false, sessionId })}
        onBack={jest.fn()}
        onDone={jest.fn()}
        onPlayAgain={jest.fn()}
      />
    );
    const renderer = renderWithHaptics(client, sprint("session-1"));

    act(() => renderer.update(withHaptics(client, null)));
    act(() => renderer.update(withHaptics(client, sprint("session-1"))));
    expect(client.played).toEqual(["success"]);

    act(() => renderer.update(withHaptics(client, null)));
    act(() => renderer.update(withHaptics(client, sprint("session-2"))));
    act(() => renderer.update(withHaptics(client, null)));
    act(() => renderer.update(withHaptics(client, survival("session-3"))));
    act(() => renderer.update(withHaptics(client, null)));
    act(() => renderer.update(withHaptics(client, survival("session-3"))));
    expect(client.played).toEqual(["success", "success", "warning"]);
  });

  it("stays silent when the setting is off", () => {
    const client = new FakeUiHapticsClient();
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        <UiHapticsProvider value={createUiHaptics({ client, isEnabled: () => false })}>
          {resultFrame(<SprintResultScreen data={sprintData({ outcome: "passed" })} {...sprintActions()} />)}
        </UiHapticsProvider>
      );
    });

    press(renderer!, "play-again-button");

    expect(client.played).toEqual([]);
  });
});

describe("UI haptics in the app", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    for (const renderer of renderers.splice(0)) {
      act(() => renderer.unmount());
    }
    jest.useRealTimers();
  });

  it("gates every intent on the persisted Haptic feedback setting", () => {
    const client = new FakeUiHapticsClient();
    const service = createMobilePracticeService("random1000");
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        <PracticePocScreen
          platformCapabilities={createTestMobilePlatformCapabilities({
            practiceService: service,
            uiHapticsClient: client
          })}
        />
      );
    });
    renderers.push(renderer!);
    expect(service.getSettings().moveFeedback.hapticsEnabled).toBe(true);

    // Tab and list row taps are navigation and stay silent.
    pressOuter(renderer!, "settings-tab");
    expect(client.played).toEqual([]);

    press(renderer!, "settings-appearance-dark");
    expect(client.played).toEqual(["selection"]);

    press(renderer!, "settings-move-haptics-toggle");
    expect(service.getSettings().moveFeedback.hapticsEnabled).toBe(false);
    press(renderer!, "settings-appearance-light");
    expect(client.played).toEqual(["selection"]);

    press(renderer!, "settings-move-haptics-toggle");
    expect(service.getSettings().moveFeedback.hapticsEnabled).toBe(true);
    expect(client.played).toEqual(["selection", "selection"]);

    pressOuter(renderer!, "practice-tab");
    pressOuter(renderer!, "practice-mode-standard");
    expect(client.played).toEqual(["selection", "selection"]);
    press(renderer!, "practice-start-button");
    expect(client.played).toEqual(["selection", "selection", "impactLight"]);
  });
});

const renderers: TestRenderer.ReactTestRenderer[] = [];

afterEach(() => {
  for (const renderer of renderers.splice(0)) {
    act(() => renderer.unmount());
  }
});

function withHaptics(client: UiHapticsClient, children: React.ReactNode): React.JSX.Element {
  return (
    <UiHapticsProvider value={hapticsFor(client)}>
      {children}
    </UiHapticsProvider>
  );
}

const hapticsByClient = new WeakMap<UiHapticsClient, ReturnType<typeof createUiHaptics>>();

function hapticsFor(client: UiHapticsClient): ReturnType<typeof createUiHaptics> {
  let haptics = hapticsByClient.get(client);
  if (!haptics) {
    haptics = createUiHaptics({ client, isEnabled: () => true });
    hapticsByClient.set(client, haptics);
  }
  return haptics;
}

function renderWithHaptics(client: UiHapticsClient, children: React.ReactNode): TestRenderer.ReactTestRenderer {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  act(() => {
    renderer = TestRenderer.create(withHaptics(client, children));
  });
  renderers.push(renderer!);
  return renderer!;
}

// Presses the host Pressable, below any primitive that forwards its testID.
function press(renderer: TestRenderer.ReactTestRenderer, testID: string): void {
  const host = renderer.root.findAll((node) => typeof node.type === "string" && node.props.testID === testID)[0];
  if (!host) {
    throw new Error(`No host element with testID ${testID}`);
  }
  act(() => {
    host.props.onPress();
  });
}

// Presses the outermost element with the testID, as navigation tests do.
function pressOuter(renderer: TestRenderer.ReactTestRenderer, testID: string): void {
  act(() => {
    renderer.root.findByProps({ testID }).props.onPress();
  });
}

function resultFrame(children: React.ReactNode): React.JSX.Element {
  return (
    <SafeAreaInsetsContext.Provider value={{ top: 62, right: 0, bottom: 34, left: 0 }}>
      <PracticeViewportProvider value={{ width: 402, height: 874 }}>
        {children}
      </PracticeViewportProvider>
    </SafeAreaInsetsContext.Provider>
  );
}

function sprintActions(): SprintResultScreenActions {
  return {
    onBack: jest.fn(),
    onMarkUnclear: jest.fn(),
    onOpenHistory: jest.fn(),
    onPlayAgain: jest.fn(),
    onReplay: jest.fn(),
    onReplayMistakes: jest.fn()
  };
}

function sprintData(overrides: Partial<SprintResultData> = {}): SprintResultData {
  return {
    kind: "sprint",
    mode: "standard",
    outcome: "passed",
    endReason: "target_reached",
    solved: 15,
    target: 15,
    attempted: 17,
    accuracyPercent: 88,
    ratingBefore: 709,
    ratingAfter: 718,
    elapsedSeconds: 276,
    bestStreak: 8,
    mistakeCount: 2,
    review: {
      count: 2,
      unclear: { markedByYou: 0, afterSlow: 0, afterTimedOut: 0 },
      inReviewCount: 2,
      overlapCount: 0
    },
    mistakeReplayCount: 2,
    ...overrides
  };
}

function survivalData(overrides: Partial<SurvivalResultData> = {}): SurvivalResultData {
  return {
    challengeType: "puzzle",
    level: { minRating: 900, maxRating: 999 },
    endReason: "max_mistakes",
    score: 19,
    mistakeCount: 3,
    bestStreak: 9,
    activeElapsedMs: 12 * 60 * 1000,
    sittings: 1,
    isNewBest: false,
    previousBestScore: 18,
    ...overrides
  };
}
