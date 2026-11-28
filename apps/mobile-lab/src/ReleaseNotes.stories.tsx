import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { waitFor, within } from "storybook/test";
import { LabScenario, type LabStoryPresentation } from "./LabScenario.tsx";
import type { LabScenarioId } from "./scenarioRegistry.ts";
import { clickTestId, waitForAbsentTestId, waitForTestId, waitForText } from "./storyPlay.ts";

// What’s New & Welcome Onboarding for 2.0.0.
// Shown on a phone in portrait and landscape and on an iPad or tablet in
// portrait and landscape, in light and dark, plus large text. The real app
// wires the same sheets to the stored last-seen version and onboarding state.

const meta = {
  title: "Release Notes",
  component: LabScenario
} satisfies Meta<typeof LabScenario>;

export default meta;
type Story = StoryObj<typeof meta>;

type Platform = "ios" | "android";
type Viewport = "phonePortrait" | "phoneLandscape" | "tabletPortrait" | "regularWidth";
type Theme = "light" | "dark";

const LARGE_TEXT_SCALE = 1.5;

const PLATFORM_SCENARIO: Record<Platform, LabScenarioId> = {
  ios: "release-notes-ios",
  android: "release-notes-android"
};

function sheetStory({
  platform,
  storyId,
  textScale,
  theme,
  title,
  viewport
}: {
  platform: Platform;
  storyId: string;
  textScale?: number;
  theme: Theme;
  title: string;
  viewport: Viewport;
}): Story {
  const storyPresentation: LabStoryPresentation = { storyId, title };
  return {
    args: { scenarioId: PLATFORM_SCENARIO[platform], storyPresentation },
    globals: { theme, viewport: { value: viewport, isRotated: false } },
    ...(textScale === undefined ? {} : { parameters: { labTextScale: textScale } }),
    play: async ({ canvasElement }) => {
      await waitForTestId(canvasElement, "whats-new-sheet");
      await waitForText(canvasElement, "What’s New in Chessticize 2.0");
      await waitForText(canvasElement, "Import your online games");
      await waitForText(canvasElement, "Free offline Game Review");
      await waitForText(canvasElement, "Puzzles from your own games");
      await waitForText(canvasElement, "Play offline against Maia");
      await expectSheetFitsWindow(canvasElement, ["whats-new-sheet", "whats-new-link-account", "whats-new-continue"]);
    }
  };
}

// The sheet and its footer actions stay inside the window, including under large text
// and in landscape, where the highlights scroll instead of pushing actions away.
async function expectSheetFitsWindow(
  canvasElement: HTMLElement,
  testIds: readonly string[] = ["whats-new-sheet", "whats-new-continue"]
): Promise<void> {
  const body = within(canvasElement.ownerDocument.body);
  const view = canvasElement.ownerDocument.defaultView!;
  await waitFor(() => {
    for (const testID of testIds) {
      const rect = body.getByTestId(testID).getBoundingClientRect();
      if (rect.top < -0.5 || rect.bottom > view.innerHeight + 0.5) {
        throw new Error(`${testID} must stay inside the window (${rect.top} to ${rect.bottom} of ${view.innerHeight})`);
      }
      if (rect.left < -0.5 || rect.right > view.innerWidth + 0.5) {
        throw new Error(`${testID} must stay inside the window width`);
      }
    }
  }, { timeout: 4_000 });
}

export const IosPhoneLight: Story = {
  ...sheetStory({
    platform: "ios",
    storyId: "release-notes--ios-phone-light",
    theme: "light",
    title: "iOS · phone · light",
    viewport: "phonePortrait"
  }),
  name: "iOS · phone · light"
};

export const IosPhoneDark: Story = {
  ...sheetStory({
    platform: "ios",
    storyId: "release-notes--ios-phone-dark",
    theme: "dark",
    title: "iOS · phone · dark",
    viewport: "phonePortrait"
  }),
  name: "iOS · phone · dark"
};

export const IosPhoneLandscapeLight: Story = {
  ...sheetStory({
    platform: "ios",
    storyId: "release-notes--ios-phone-landscape-light",
    theme: "light",
    title: "iOS · phone landscape · light",
    viewport: "phoneLandscape"
  }),
  name: "iOS · phone landscape · light"
};

export const IosPhoneLandscapeDark: Story = {
  ...sheetStory({
    platform: "ios",
    storyId: "release-notes--ios-phone-landscape-dark",
    theme: "dark",
    title: "iOS · phone landscape · dark",
    viewport: "phoneLandscape"
  }),
  name: "iOS · phone landscape · dark"
};

export const IosIpadPortraitLight: Story = {
  ...sheetStory({
    platform: "ios",
    storyId: "release-notes--ios-ipad-portrait-light",
    theme: "light",
    title: "iOS · iPad portrait · light",
    viewport: "tabletPortrait"
  }),
  name: "iOS · iPad portrait · light"
};

export const IosIpadPortraitDark: Story = {
  ...sheetStory({
    platform: "ios",
    storyId: "release-notes--ios-ipad-portrait-dark",
    theme: "dark",
    title: "iOS · iPad portrait · dark",
    viewport: "tabletPortrait"
  }),
  name: "iOS · iPad portrait · dark"
};

export const IosIpadLandscapeLight: Story = {
  ...sheetStory({
    platform: "ios",
    storyId: "release-notes--ios-ipad-landscape-light",
    theme: "light",
    title: "iOS · iPad landscape · light",
    viewport: "regularWidth"
  }),
  name: "iOS · iPad landscape · light"
};

export const IosIpadLandscapeDark: Story = {
  ...sheetStory({
    platform: "ios",
    storyId: "release-notes--ios-ipad-landscape-dark",
    theme: "dark",
    title: "iOS · iPad landscape · dark",
    viewport: "regularWidth"
  }),
  name: "iOS · iPad landscape · dark"
};

export const IosLargeTextLight: Story = {
  ...sheetStory({
    platform: "ios",
    storyId: "release-notes--ios-large-text-light",
    theme: "light",
    title: "iOS · phone · light · large text",
    viewport: "phonePortrait", textScale: LARGE_TEXT_SCALE
  }),
  name: "iOS · phone · light · large text"
};

export const IosLargeTextDark: Story = {
  ...sheetStory({
    platform: "ios",
    storyId: "release-notes--ios-large-text-dark",
    theme: "dark",
    title: "iOS · phone · dark · large text",
    viewport: "phonePortrait", textScale: LARGE_TEXT_SCALE
  }),
  name: "iOS · phone · dark · large text"
};

export const AndroidPhoneLight: Story = {
  ...sheetStory({
    platform: "android",
    storyId: "release-notes--android-phone-light",
    theme: "light",
    title: "Android · phone · light",
    viewport: "phonePortrait"
  }),
  name: "Android · phone · light"
};

export const AndroidPhoneDark: Story = {
  ...sheetStory({
    platform: "android",
    storyId: "release-notes--android-phone-dark",
    theme: "dark",
    title: "Android · phone · dark",
    viewport: "phonePortrait"
  }),
  name: "Android · phone · dark"
};

export const AndroidPhoneLandscapeLight: Story = {
  ...sheetStory({
    platform: "android",
    storyId: "release-notes--android-phone-landscape-light",
    theme: "light",
    title: "Android · phone landscape · light",
    viewport: "phoneLandscape"
  }),
  name: "Android · phone landscape · light"
};

export const AndroidPhoneLandscapeDark: Story = {
  ...sheetStory({
    platform: "android",
    storyId: "release-notes--android-phone-landscape-dark",
    theme: "dark",
    title: "Android · phone landscape · dark",
    viewport: "phoneLandscape"
  }),
  name: "Android · phone landscape · dark"
};

export const AndroidTabletPortraitLight: Story = {
  ...sheetStory({
    platform: "android",
    storyId: "release-notes--android-tablet-portrait-light",
    theme: "light",
    title: "Android · tablet portrait · light",
    viewport: "tabletPortrait"
  }),
  name: "Android · tablet portrait · light"
};

export const AndroidTabletPortraitDark: Story = {
  ...sheetStory({
    platform: "android",
    storyId: "release-notes--android-tablet-portrait-dark",
    theme: "dark",
    title: "Android · tablet portrait · dark",
    viewport: "tabletPortrait"
  }),
  name: "Android · tablet portrait · dark"
};

export const AndroidTabletLandscapeLight: Story = {
  ...sheetStory({
    platform: "android",
    storyId: "release-notes--android-tablet-landscape-light",
    theme: "light",
    title: "Android · tablet landscape · light",
    viewport: "regularWidth"
  }),
  name: "Android · tablet landscape · light"
};

export const AndroidTabletLandscapeDark: Story = {
  ...sheetStory({
    platform: "android",
    storyId: "release-notes--android-tablet-landscape-dark",
    theme: "dark",
    title: "Android · tablet landscape · dark",
    viewport: "regularWidth"
  }),
  name: "Android · tablet landscape · dark"
};

export const AndroidLargeTextLight: Story = {
  ...sheetStory({
    platform: "android",
    storyId: "release-notes--android-large-text-light",
    theme: "light",
    title: "Android · phone · light · large text",
    viewport: "phonePortrait", textScale: LARGE_TEXT_SCALE
  }),
  name: "Android · phone · light · large text"
};

export const AndroidLargeTextDark: Story = {
  ...sheetStory({
    platform: "android",
    storyId: "release-notes--android-large-text-dark",
    theme: "dark",
    title: "Android · phone · dark · large text",
    viewport: "phonePortrait", textScale: LARGE_TEXT_SCALE
  }),
  name: "Android · phone · dark · large text"
};

// Continue finishes the notes and leaves the idle Practice home behind the sheet.
export const IosContinue: Story = {
  name: "iOS · Continue",
  args: {
    scenarioId: "release-notes-ios",
    storyPresentation: { storyId: "release-notes--ios-continue", title: "iOS · Continue" }
  },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "whats-new-sheet");
    await clickTestId(canvasElement, "whats-new-continue");
    await waitForAbsentTestId(canvasElement, "whats-new-sheet");
    await waitForTestId(canvasElement, "practice-home");
  }
};

export const IosLinkAccount: Story = {
  name: "iOS · Link Chess Account",
  args: {
    scenarioId: "release-notes-ios",
    storyPresentation: { storyId: "release-notes--ios-link-account", title: "iOS · Link Chess Account" }
  },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "whats-new-sheet");
    await clickTestId(canvasElement, "whats-new-link-account");
    await waitForAbsentTestId(canvasElement, "whats-new-sheet");
    await waitForTestId(canvasElement, "games-import-modal");
  }
};

export const WelcomeOnboardingOverview: Story = {
  name: "Welcome Onboarding · Overview",
  args: {
    scenarioId: "welcome-onboarding-overview",
    storyPresentation: {
      storyId: "release-notes--welcome-onboarding-overview",
      title: "Welcome Onboarding · Overview"
    }
  },
  globals: { theme: "light", viewport: { value: "phonePortrait", isRotated: false } },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "welcome-onboarding-sheet");
    await waitForText(canvasElement, "Welcome to Chessticize");
    await waitForText(canvasElement, "Learn from your online games");
    await expectSheetFitsWindow(canvasElement, [
      "welcome-onboarding-sheet",
      "welcome-onboarding-next",
      "welcome-onboarding-start-practicing"
    ]);
  }
};

export const WelcomeOnboardingLinkAccount: Story = {
  name: "Welcome Onboarding · Link Account",
  args: {
    scenarioId: "welcome-onboarding-link-account",
    storyPresentation: {
      storyId: "release-notes--welcome-onboarding-link-account",
      title: "Welcome Onboarding · Link Account"
    }
  },
  globals: { theme: "dark", viewport: { value: "phonePortrait", isRotated: false } },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "welcome-onboarding-sheet");
    await waitForText(canvasElement, "Import your online games");
    await waitForTestId(canvasElement, "welcome-onboarding-username");
    await expectSheetFitsWindow(canvasElement, [
      "welcome-onboarding-sheet",
      "welcome-onboarding-import-submit",
      "welcome-onboarding-skip-account"
    ]);
  }
};
