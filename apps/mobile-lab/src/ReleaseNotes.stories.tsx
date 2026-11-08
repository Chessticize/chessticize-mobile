import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { waitFor, within } from "storybook/test";
import { LabScenario, type LabStoryPresentation } from "./LabScenario.tsx";
import type { LabScenarioId } from "./scenarioRegistry.ts";
import { clickTestId, waitForAbsentTestId, waitForTestId, waitForText } from "./storyPlay.ts";

// Issue #651: the one-time What’s New sheet shown on the first launch after an update to 1.6.0.
// Each platform's copy is shown on a phone in portrait and landscape and on an iPad or tablet in
// portrait and landscape, in light and dark, plus large text. The real app wires the same sheet
// to the stored last-seen version, so these stories only seed "updated from 1.5.3" state.

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

const NAVIGATION_COPY: Record<Platform, string> = {
  ios: "A glass tab bar that fits iPhone, iPad, and iPhone Duo.",
  android: "A bottom bar on phones and a side rail on tablets and foldables."
};

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
      await waitForText(canvasElement, "What’s New in Chessticize");
      await waitForText(canvasElement, "A fresh new look");
      await waitForText(canvasElement, "A cleaner design with clearer type and more room for the board.");
      await waitForText(canvasElement, "New navigation");
      await waitForText(canvasElement, NAVIGATION_COPY[platform]);
      await waitForText(canvasElement, "Dark mode");
      await waitForText(canvasElement, "Follows your system, or choose in Settings → Appearance.");
      await expectSheetFitsWindow(canvasElement);
    }
  };
}

// The sheet and its Continue button stay inside the window, including under large text
// and in landscape, where the highlights scroll instead of pushing Continue away.
async function expectSheetFitsWindow(canvasElement: HTMLElement): Promise<void> {
  const body = within(canvasElement.ownerDocument.body);
  const view = canvasElement.ownerDocument.defaultView!;
  await waitFor(() => {
    for (const testID of ["whats-new-sheet", "whats-new-continue"]) {
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
  name: "iOS · phone · light",
  tags: ["new"]
};

export const IosPhoneDark: Story = {
  ...sheetStory({
    platform: "ios",
    storyId: "release-notes--ios-phone-dark",
    theme: "dark",
    title: "iOS · phone · dark",
    viewport: "phonePortrait"
  }),
  name: "iOS · phone · dark",
  tags: ["new"]
};

export const IosPhoneLandscapeLight: Story = {
  ...sheetStory({
    platform: "ios",
    storyId: "release-notes--ios-phone-landscape-light",
    theme: "light",
    title: "iOS · phone landscape · light",
    viewport: "phoneLandscape"
  }),
  name: "iOS · phone landscape · light",
  tags: ["new"]
};

export const IosPhoneLandscapeDark: Story = {
  ...sheetStory({
    platform: "ios",
    storyId: "release-notes--ios-phone-landscape-dark",
    theme: "dark",
    title: "iOS · phone landscape · dark",
    viewport: "phoneLandscape"
  }),
  name: "iOS · phone landscape · dark",
  tags: ["new"]
};

export const IosIpadPortraitLight: Story = {
  ...sheetStory({
    platform: "ios",
    storyId: "release-notes--ios-ipad-portrait-light",
    theme: "light",
    title: "iOS · iPad portrait · light",
    viewport: "tabletPortrait"
  }),
  name: "iOS · iPad portrait · light",
  tags: ["new"]
};

export const IosIpadPortraitDark: Story = {
  ...sheetStory({
    platform: "ios",
    storyId: "release-notes--ios-ipad-portrait-dark",
    theme: "dark",
    title: "iOS · iPad portrait · dark",
    viewport: "tabletPortrait"
  }),
  name: "iOS · iPad portrait · dark",
  tags: ["new"]
};

export const IosIpadLandscapeLight: Story = {
  ...sheetStory({
    platform: "ios",
    storyId: "release-notes--ios-ipad-landscape-light",
    theme: "light",
    title: "iOS · iPad landscape · light",
    viewport: "regularWidth"
  }),
  name: "iOS · iPad landscape · light",
  tags: ["new"]
};

export const IosIpadLandscapeDark: Story = {
  ...sheetStory({
    platform: "ios",
    storyId: "release-notes--ios-ipad-landscape-dark",
    theme: "dark",
    title: "iOS · iPad landscape · dark",
    viewport: "regularWidth"
  }),
  name: "iOS · iPad landscape · dark",
  tags: ["new"]
};

export const IosLargeTextLight: Story = {
  ...sheetStory({
    platform: "ios",
    storyId: "release-notes--ios-large-text-light",
    theme: "light",
    title: "iOS · phone · light · large text",
    viewport: "phonePortrait", textScale: LARGE_TEXT_SCALE
  }),
  name: "iOS · phone · light · large text",
  tags: ["new"]
};

export const IosLargeTextDark: Story = {
  ...sheetStory({
    platform: "ios",
    storyId: "release-notes--ios-large-text-dark",
    theme: "dark",
    title: "iOS · phone · dark · large text",
    viewport: "phonePortrait", textScale: LARGE_TEXT_SCALE
  }),
  name: "iOS · phone · dark · large text",
  tags: ["new"]
};

export const AndroidPhoneLight: Story = {
  ...sheetStory({
    platform: "android",
    storyId: "release-notes--android-phone-light",
    theme: "light",
    title: "Android · phone · light",
    viewport: "phonePortrait"
  }),
  name: "Android · phone · light",
  tags: ["new"]
};

export const AndroidPhoneDark: Story = {
  ...sheetStory({
    platform: "android",
    storyId: "release-notes--android-phone-dark",
    theme: "dark",
    title: "Android · phone · dark",
    viewport: "phonePortrait"
  }),
  name: "Android · phone · dark",
  tags: ["new"]
};

export const AndroidPhoneLandscapeLight: Story = {
  ...sheetStory({
    platform: "android",
    storyId: "release-notes--android-phone-landscape-light",
    theme: "light",
    title: "Android · phone landscape · light",
    viewport: "phoneLandscape"
  }),
  name: "Android · phone landscape · light",
  tags: ["new"]
};

export const AndroidPhoneLandscapeDark: Story = {
  ...sheetStory({
    platform: "android",
    storyId: "release-notes--android-phone-landscape-dark",
    theme: "dark",
    title: "Android · phone landscape · dark",
    viewport: "phoneLandscape"
  }),
  name: "Android · phone landscape · dark",
  tags: ["new"]
};

export const AndroidTabletPortraitLight: Story = {
  ...sheetStory({
    platform: "android",
    storyId: "release-notes--android-tablet-portrait-light",
    theme: "light",
    title: "Android · tablet portrait · light",
    viewport: "tabletPortrait"
  }),
  name: "Android · tablet portrait · light",
  tags: ["new"]
};

export const AndroidTabletPortraitDark: Story = {
  ...sheetStory({
    platform: "android",
    storyId: "release-notes--android-tablet-portrait-dark",
    theme: "dark",
    title: "Android · tablet portrait · dark",
    viewport: "tabletPortrait"
  }),
  name: "Android · tablet portrait · dark",
  tags: ["new"]
};

export const AndroidTabletLandscapeLight: Story = {
  ...sheetStory({
    platform: "android",
    storyId: "release-notes--android-tablet-landscape-light",
    theme: "light",
    title: "Android · tablet landscape · light",
    viewport: "regularWidth"
  }),
  name: "Android · tablet landscape · light",
  tags: ["new"]
};

export const AndroidTabletLandscapeDark: Story = {
  ...sheetStory({
    platform: "android",
    storyId: "release-notes--android-tablet-landscape-dark",
    theme: "dark",
    title: "Android · tablet landscape · dark",
    viewport: "regularWidth"
  }),
  name: "Android · tablet landscape · dark",
  tags: ["new"]
};

export const AndroidLargeTextLight: Story = {
  ...sheetStory({
    platform: "android",
    storyId: "release-notes--android-large-text-light",
    theme: "light",
    title: "Android · phone · light · large text",
    viewport: "phonePortrait", textScale: LARGE_TEXT_SCALE
  }),
  name: "Android · phone · light · large text",
  tags: ["new"]
};

export const AndroidLargeTextDark: Story = {
  ...sheetStory({
    platform: "android",
    storyId: "release-notes--android-large-text-dark",
    theme: "dark",
    title: "Android · phone · dark · large text",
    viewport: "phonePortrait", textScale: LARGE_TEXT_SCALE
  }),
  name: "Android · phone · dark · large text",
  tags: ["new"]
};

// Continue finishes the notes and leaves the idle Practice home behind the sheet.
export const IosContinue: Story = {
  name: "iOS · Continue",
  tags: ["new"],
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
