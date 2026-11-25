import type { PuzzleFeedback, SprintConfig, SprintMode, SupportedLocale } from "../../../../../../packages/core/src/index.ts";
import { getActiveLocale, translate } from "../../../i18n/translate.ts";

export const ANALYSIS_DEPTH = 20;

export function safeTestId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

export const FABRIC_SAFE_HIDDEN_TEXT_STYLE = {
  // Android Fabric rejects zero-sized fonts even when the Text is fully hidden.
  fontSize: 1,
  height: 0,
  opacity: 0,
  width: 0
} as const;

export function modeLabel(mode: SprintMode, locale: SupportedLocale = getActiveLocale()): string {
  if (mode === "arrow_duel") {
    return translate(locale, "common.arrowDuel");
  }
  if (mode === "custom") {
    return translate(locale, "common.custom");
  }
  return translate(locale, "common.standard");
}

export const CUSTOM_INITIAL_RATING_MIN = 600;

export const CUSTOM_INITIAL_RATING_MAX = 2200;

export function formatSprintTimingLabel(
  config: SprintConfig,
  locale: SupportedLocale = getActiveLocale()
): string {
  return translate(locale, "common.paceShort", {
    duration: formatSprintDurationLabel(config.durationSeconds, locale),
    seconds: config.perPuzzleSeconds
  });
}

export function formatSprintDurationLabel(
  seconds: number,
  locale: SupportedLocale = getActiveLocale()
): string {
  if (seconds % 60 === 0) {
    return translate(locale, "common.minutesShort", { count: seconds / 60 });
  }
  return translate(locale, "common.secondsCompact", { count: seconds });
}

export function formatCompactDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function formatDurationLabel(
  seconds: number,
  locale: SupportedLocale = getActiveLocale()
): string {
  if (seconds % 60 === 0) {
    return translate(locale, "common.minutesShortLabel", { count: seconds / 60 });
  }
  return translate(locale, "common.secondsCompact", { count: seconds });
}

export type SessionFeedback = PuzzleFeedback | null;

export function replyPreparationInstruction(
  seconds: number,
  locale: SupportedLocale = getActiveLocale()
): string {
  return translate(locale, "session.prompt.replyPreparationInstruction", { count: seconds });
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// From this text scale a row of two action buttons stacks into full-width
// buttons: a one-word headline label outgrows half a phone row, and the
// shared Button wraps labels rather than shrinking them.
export const STACKED_ACTIONS_FONT_SCALE = 1.5;
