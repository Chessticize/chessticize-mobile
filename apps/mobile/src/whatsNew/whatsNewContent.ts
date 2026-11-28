import type { IconName, IconTone } from "../components/ui/iconNames.ts";
import { getActiveLocale, translate, type SupportedLocale } from "../i18n/index.ts";

// The What's New notes and Welcome Onboarding content for 2.0. All user-facing
// copy lives in the i18n catalog; components render whatever this module returns
// for the active locale.

/** The release these notes describe. The sheet shows once the app runs this version or later. */
export const WHATS_NEW_RELEASE_VERSION = "2.0.0";

/** The first release version that presents the fresh-install Welcome Onboarding sheet. */
export const ONBOARDING_MIN_VERSION = "2.0.0";

export type WhatsNewPlatform = "ios" | "android";

export interface WhatsNewHighlight {
  id: "games-import" | "game-review" | "personal-puzzles" | "play-maia";
  icon: IconName;
  tone: IconTone;
  headline: string;
  detail: string;
}

export interface WhatsNewContent {
  releaseVersion: string;
  title: string;
  feedbackNote: string;
  linkAccountLabel: string;
  continueLabel: string;
  highlights: readonly WhatsNewHighlight[];
}

export interface WelcomeOnboardingHighlight {
  id: "import-review" | "offline-tactics" | "maia-play";
  icon: IconName;
  tone: IconTone;
  headline: string;
  detail: string;
}

export interface WelcomeOnboardingContent {
  title: string;
  feedbackNote: string;
  linkAccountActionLabel: string;
  startPracticingLabel: string;
  highlights: readonly WelcomeOnboardingHighlight[];
}

export function whatsNewContentFor(
  _platform: WhatsNewPlatform,
  locale: SupportedLocale = getActiveLocale()
): WhatsNewContent {
  return {
    releaseVersion: WHATS_NEW_RELEASE_VERSION,
    title: translate(locale, "whatsNew.title"),
    feedbackNote: translate(locale, "whatsNew.feedbackNote"),
    linkAccountLabel: translate(locale, "whatsNew.linkAccount"),
    continueLabel: translate(locale, "whatsNew.continue"),
    highlights: [
      {
        id: "games-import",
        icon: "tabGames",
        tone: "accent",
        headline: translate(locale, "whatsNew.gamesImport.headline"),
        detail: translate(locale, "whatsNew.gamesImport.detail")
      },
      {
        id: "game-review",
        icon: "trend",
        tone: "positive",
        headline: translate(locale, "whatsNew.gameReview.headline"),
        detail: translate(locale, "whatsNew.gameReview.detail")
      },
      {
        id: "personal-puzzles",
        icon: "arrowDuel",
        tone: "warning",
        headline: translate(locale, "whatsNew.personalPuzzles.headline"),
        detail: translate(locale, "whatsNew.personalPuzzles.detail")
      },
      {
        id: "play-maia",
        icon: "play",
        tone: "neutral",
        headline: translate(locale, "whatsNew.playMaia.headline"),
        detail: translate(locale, "whatsNew.playMaia.detail")
      }
    ]
  };
}

export function welcomeOnboardingContentFor(
  locale: SupportedLocale = getActiveLocale()
): WelcomeOnboardingContent {
  return {
    title: translate(locale, "onboarding.welcome.title"),
    feedbackNote: translate(locale, "onboarding.welcome.feedbackNote"),
    linkAccountActionLabel: translate(locale, "onboarding.welcome.linkAccountAction"),
    startPracticingLabel: translate(locale, "onboarding.welcome.startPracticing"),
    highlights: [
      {
        id: "import-review",
        icon: "tabGames",
        tone: "accent",
        headline: translate(locale, "onboarding.welcome.importReviewHeadline"),
        detail: translate(locale, "onboarding.welcome.importReviewDetail")
      },
      {
        id: "offline-tactics",
        icon: "standard",
        tone: "positive",
        headline: translate(locale, "onboarding.welcome.offlineTacticsHeadline"),
        detail: translate(locale, "onboarding.welcome.offlineTacticsDetail")
      },
      {
        id: "maia-play",
        icon: "play",
        tone: "neutral",
        headline: translate(locale, "onboarding.welcome.maiaPlayHeadline"),
        detail: translate(locale, "onboarding.welcome.maiaPlayDetail")
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
