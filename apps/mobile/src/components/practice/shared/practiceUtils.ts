import type { SprintMode } from "../../../../../../packages/core/src/index.ts";

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

export function modeLabel(mode: SprintMode): string {
  if (mode === "arrow_duel") {
    return "Arrow Duel";
  }
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

const CUSTOM_INITIAL_RATING_MIN = 600;

const CUSTOM_INITIAL_RATING_MAX = 2200;

function formatSprintTimingLabel(config: SprintConfig): string {
  return `${formatSprintDurationLabel(config.durationSeconds)} · ${config.perPuzzleSeconds}s pace`;
}

function formatSprintDurationLabel(seconds: number): string {
  if (seconds % 60 === 0) {
    return `${seconds / 60} min`;
  }
  return `${seconds}s`;
}

function formatCompactDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function formatDurationLabel(seconds: number): string {
  if (seconds % 60 === 0) {
    return `${seconds / 60}m`;
  }
  return `${seconds}s`;
}
