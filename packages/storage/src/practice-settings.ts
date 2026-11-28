import {
  defaultSprintGuideProgress,
  normalizeLanguagePreference,
  parseReleaseVersion,
  type ArrowDuelReplyCueStage,
  type LanguagePreference,
  type ReviewReminderSettings
} from "../../core/src/index.ts";
import {
  BOARD_THEME_IDS,
  CHESS_PIECE_SET_IDS,
  DEFAULT_DARK_BOARD_THEME,
  DEFAULT_LIGHT_BOARD_THEME,
  DEFAULT_PIECE_SET,
  type AppearancePreference,
  type BoardThemeId,
  type ChessPieceSetId,
  type PracticeSettings,
  type ReviewReminderPreference
} from "./practice-store.ts";

const BOARD_THEME_ID_SET: ReadonlySet<string> = new Set(BOARD_THEME_IDS);
const CHESS_PIECE_SET_ID_SET: ReadonlySet<string> = new Set(CHESS_PIECE_SET_IDS);

export function defaultPracticeSettings(): PracticeSettings {
  return {
    appearance: "system",
    lightBoardTheme: DEFAULT_LIGHT_BOARD_THEME,
    darkBoardTheme: DEFAULT_DARK_BOARD_THEME,
    pieceSet: DEFAULT_PIECE_SET,
    language: "system",
    sync: {
      iCloudEnabled: true
    },
    arrowDuel: {
      opponentReplyEnabled: true
    },
    gameReview: {
      autoAddRecommendedToReview: false
    },
    notifications: {
      reviewReminder: {
        mode: "smart"
      }
    },
    moveFeedback: {
      soundEnabled: false,
      hapticsEnabled: true
    },
    sprintGuides: defaultSprintGuideProgress()
  };
}

export function clonePracticeSettings(settings: PracticeSettings): PracticeSettings {
  return normalizePracticeSettings({
    appearance: normalizeAppearancePreference(settings.appearance),
    lightBoardTheme: normalizeBoardTheme(settings.lightBoardTheme, DEFAULT_LIGHT_BOARD_THEME),
    darkBoardTheme: normalizeBoardTheme(settings.darkBoardTheme, DEFAULT_DARK_BOARD_THEME),
    pieceSet: normalizePieceSet(settings.pieceSet),
    language: normalizeLanguagePreference(settings.language),
    ...whatsNewSeenVersionField(settings.whatsNewSeenVersion),
    sync: {
      iCloudEnabled: settings.sync.iCloudEnabled
    },
    arrowDuel: {
      opponentReplyEnabled: settings.arrowDuel?.opponentReplyEnabled ?? true
    },
    gameReview: {
      autoAddRecommendedToReview: Boolean(settings.gameReview?.autoAddRecommendedToReview ?? false)
    },
    notifications: {
      reviewReminder: settings.notifications.reviewReminder
    },
    moveFeedback: {
      soundEnabled: settings.moveFeedback?.soundEnabled ?? false,
      hapticsEnabled: settings.moveFeedback?.hapticsEnabled ?? true
    },
    sprintGuides: {
      rulesSeen: settings.sprintGuides?.rulesSeen ?? false,
      activeSessionSeen: settings.sprintGuides?.activeSessionSeen ?? false,
      arrowDuelSeen: settings.sprintGuides?.arrowDuelSeen ?? false,
      focusedRunSeen: settings.sprintGuides?.focusedRunSeen ?? false,
      arrowDuelReplyCueStage: normalizeArrowDuelReplyCueStage(
        settings.sprintGuides?.arrowDuelReplyCueStage
      )
    }
  });
}

export function normalizePracticeSettings(settings: PracticeSettings): PracticeSettings {
  return {
    appearance: normalizeAppearancePreference(settings.appearance),
    lightBoardTheme: normalizeBoardTheme(settings.lightBoardTheme, DEFAULT_LIGHT_BOARD_THEME),
    darkBoardTheme: normalizeBoardTheme(settings.darkBoardTheme, DEFAULT_DARK_BOARD_THEME),
    pieceSet: normalizePieceSet(settings.pieceSet),
    language: normalizeLanguagePreference(settings.language),
    ...whatsNewSeenVersionField(settings.whatsNewSeenVersion),
    sync: {
      iCloudEnabled: Boolean(settings.sync.iCloudEnabled)
    },
    arrowDuel: {
      opponentReplyEnabled: settings.arrowDuel?.opponentReplyEnabled ?? true
    },
    gameReview: {
      autoAddRecommendedToReview: Boolean(settings.gameReview?.autoAddRecommendedToReview ?? false)
    },
    notifications: {
      reviewReminder: normalizeReviewReminderPreference(settings.notifications.reviewReminder)
    },
    moveFeedback: {
      soundEnabled: settings.moveFeedback?.soundEnabled ?? false,
      hapticsEnabled: settings.moveFeedback?.hapticsEnabled ?? true
    },
    sprintGuides: {
      rulesSeen: settings.sprintGuides?.rulesSeen ?? false,
      activeSessionSeen: settings.sprintGuides?.activeSessionSeen ?? false,
      arrowDuelSeen: settings.sprintGuides?.arrowDuelSeen ?? false,
      focusedRunSeen: settings.sprintGuides?.focusedRunSeen ?? false,
      arrowDuelReplyCueStage: normalizeArrowDuelReplyCueStage(
        settings.sprintGuides?.arrowDuelReplyCueStage
      )
    }
  };
}

export function normalizeAppearancePreference(value: unknown): AppearancePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function isBoardThemeId(value: unknown): value is BoardThemeId {
  return typeof value === "string" && BOARD_THEME_ID_SET.has(value);
}

export function normalizeBoardTheme(value: unknown, fallback: BoardThemeId): BoardThemeId {
  return isBoardThemeId(value) ? value : fallback;
}

export function isChessPieceSetId(value: unknown): value is ChessPieceSetId {
  return typeof value === "string" && CHESS_PIECE_SET_ID_SET.has(value);
}

export function normalizePieceSet(value: unknown): ChessPieceSetId {
  return isChessPieceSetId(value) ? value : DEFAULT_PIECE_SET;
}

export { normalizeLanguagePreference, type LanguagePreference };

/** A recorded What's New version must read as a release version; anything else counts as unrecorded. */
export function normalizeWhatsNewSeenVersion(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return parseReleaseVersion(trimmed) === undefined ? undefined : trimmed;
}

function whatsNewSeenVersionField(value: unknown): { whatsNewSeenVersion?: string } {
  const version = normalizeWhatsNewSeenVersion(value);
  return version === undefined ? {} : { whatsNewSeenVersion: version };
}

function normalizeArrowDuelReplyCueStage(
  value: ArrowDuelReplyCueStage | undefined
): ArrowDuelReplyCueStage {
  return value === 1 || value === 2 || value === 3 ? value : 0;
}

export function normalizeReviewReminderPreference(preference: ReviewReminderPreference): ReviewReminderPreference {
  if (preference.mode === "smart" || preference.mode === "off") {
    return { mode: preference.mode };
  }
  if (preference.mode === "fixed") {
    parseFixedLocalTime(preference.fixedLocalTime);
    return {
      mode: "fixed",
      fixedLocalTime: preference.fixedLocalTime
    };
  }
  throw new Error("review reminder mode must be smart, fixed, or off");
}

export function reviewReminderPreferenceToSettings(preference: ReviewReminderPreference): ReviewReminderSettings {
  const normalized = normalizeReviewReminderPreference(preference);
  if (normalized.mode === "smart" || normalized.mode === "off") {
    return {
      kind: normalized.mode
    };
  }
  const parsed = parseFixedLocalTime(normalized.fixedLocalTime);
  return {
    kind: "fixed",
    hour: parsed.hour,
    minute: parsed.minute
  };
}

function parseFixedLocalTime(value: string): { hour: number; minute: number } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) {
    throw new Error("fixed review reminder time must use HH:mm in 24-hour local time");
  }
  return {
    hour: Number(match[1]),
    minute: Number(match[2])
  };
}
