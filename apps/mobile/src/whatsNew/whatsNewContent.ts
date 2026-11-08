import type { IconName, IconTone } from "../components/ui/iconNames.ts";

// The What's New notes for one release. All user-facing copy lives here so a
// release edits one file; components render whatever this module returns.

/** The release these notes describe. The sheet shows once the app runs this version or later. */
export const WHATS_NEW_RELEASE_VERSION = "1.6.0";

export type WhatsNewPlatform = "ios" | "android";

export interface WhatsNewHighlight {
  id: "look" | "navigation" | "dark-mode";
  icon: IconName;
  tone: IconTone;
  headline: string;
  detail: string;
}

export interface WhatsNewContent {
  releaseVersion: string;
  title: string;
  continueLabel: string;
  highlights: readonly WhatsNewHighlight[];
}

const NEW_LOOK: WhatsNewHighlight = {
  id: "look",
  icon: "design",
  tone: "accent",
  headline: "A fresh new look",
  detail: "A cleaner design with clearer type and more room for the board."
};

const DARK_MODE: WhatsNewHighlight = {
  id: "dark-mode",
  icon: "darkMode",
  tone: "warning",
  headline: "Dark mode",
  // Non-breaking spaces keep the arrow with its neighbors instead of starting a line.
  detail: "Follows your system, or choose in Settings\u00A0→\u00A0Appearance."
};

const NAVIGATION_COPY: Record<WhatsNewPlatform, string> = {
  ios: "A glass tab bar that fits iPhone, iPad, and iPhone Duo.",
  android: "A bottom bar on phones and a side rail on tablets and foldables."
};

export function whatsNewContentFor(platform: WhatsNewPlatform): WhatsNewContent {
  return {
    releaseVersion: WHATS_NEW_RELEASE_VERSION,
    title: "What’s New in Chessticize",
    continueLabel: "Continue",
    highlights: [
      NEW_LOOK,
      {
        id: "navigation",
        icon: "navigation",
        tone: "positive",
        headline: "New navigation",
        detail: NAVIGATION_COPY[platform]
      },
      DARK_MODE
    ]
  };
}

/** The Settings row that reopens the latest notes. */
export const WHATS_NEW_SETTINGS_LABEL = "What’s New";
