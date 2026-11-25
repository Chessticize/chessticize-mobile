import type { IconName, IconTone } from "../components/ui/iconNames.ts";
import { getActiveLocale, translate, type SupportedLocale } from "../i18n/index.ts";

// The What's New notes for one release. All user-facing copy lives in the i18n
// catalog; components render whatever this module returns for the active locale.

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

export function whatsNewContentFor(
  platform: WhatsNewPlatform,
  locale: SupportedLocale = getActiveLocale()
): WhatsNewContent {
  return {
    releaseVersion: WHATS_NEW_RELEASE_VERSION,
    title: translate(locale, "whatsNew.title"),
    continueLabel: translate(locale, "whatsNew.continue"),
    highlights: [
      {
        id: "look",
        icon: "design",
        tone: "accent",
        headline: translate(locale, "whatsNew.look.headline"),
        detail: translate(locale, "whatsNew.look.detail")
      },
      {
        id: "navigation",
        icon: "navigation",
        tone: "positive",
        headline: translate(locale, "whatsNew.navigation.headline"),
        detail: platform === "ios"
          ? translate(locale, "whatsNew.navigation.iosDetail")
          : translate(locale, "whatsNew.navigation.androidDetail")
      },
      {
        id: "dark-mode",
        icon: "darkMode",
        tone: "warning",
        headline: translate(locale, "whatsNew.darkMode.headline"),
        detail: translate(locale, "whatsNew.darkMode.detail")
      }
    ]
  };
}

/** Localized Settings row label that reopens the latest notes. */
export function whatsNewSettingsLabel(locale: SupportedLocale = getActiveLocale()): string {
  return translate(locale, "whatsNew.settingsLabel");
}

/** The Settings row that reopens the latest notes (default English constant retained for compatibility). */
export const WHATS_NEW_SETTINGS_LABEL = "What’s New";
