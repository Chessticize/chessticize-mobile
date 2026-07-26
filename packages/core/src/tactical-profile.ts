export const TACTICAL_PROFILE_HOME_FOCUS_LIMIT = 1;
export const TACTICAL_PROFILE_VISIBLE_FOCUS_LIMIT = 3;
export const FOCUSED_RUN_THEME_LIMIT = 2;

export type TacticalFocusReason = "solve_rate" | "completed_speed" | "both";

export type RankedTacticalFocus = {
  theme: string;
  reason: TacticalFocusReason;
};

export type TacticalFocus = {
  theme: string;
  reason: TacticalFocusReason;
};

export type TacticalFocusCutoffs = {
  home: readonly TacticalFocus[];
  profile: readonly TacticalFocus[];
  run: readonly TacticalFocus[];
  monitored: readonly TacticalFocus[];
};

export type FocusedRunRatingAnchor = {
  ratingKey: string;
  rating: number;
};

export type FocusedRunInventoryBand = {
  minRating: number;
  maxRating: number;
  availableByTheme: Readonly<Record<string, number>>;
  mixedAvailableCount: number;
};

export type FocusedRunPlan = {
  taskFamily: "line" | "arrow_duel";
  ratingAnchor: FocusedRunRatingAnchor;
  reasons: ReadonlyArray<TacticalFocus & { count: number }>;
  mixedControlCount: number;
  minRating: number;
  maxRating: number;
  excludePuzzleIds: readonly string[];
};

export type FocusedRunPlanUnavailableReason =
  | "no_focus"
  | "invalid_input"
  | "insufficient_inventory";

export type FocusedRunPlanResult =
  | { status: "ready"; plan: FocusedRunPlan }
  | {
      status: "unavailable";
      reason: FocusedRunPlanUnavailableReason;
      shortages: readonly FocusedRunInventoryShortage[];
    };

export type FocusedRunInventoryShortage = {
  bucket: "theme" | "mixed";
  theme?: string;
  required: number;
  available: number;
};

export type TacticalProfileRefreshEvent =
  | "eligible_mixed_run_completed"
  | "focused_run_completed"
  | "scheduled_review_completed"
  | "canonical_import_changed"
  | "unclear_changed";

export type FocusedRunPlanRefreshDecision =
  | "keep_active_run"
  | "rebuild_before_start";

export function applyTacticalFocusCutoffs(
  ranked: readonly RankedTacticalFocus[]
): TacticalFocusCutoffs {
  const distinct = distinctTacticalFocuses(ranked);
  return {
    home: distinct.slice(0, TACTICAL_PROFILE_HOME_FOCUS_LIMIT),
    profile: distinct.slice(0, TACTICAL_PROFILE_VISIBLE_FOCUS_LIMIT),
    run: distinct.slice(0, FOCUSED_RUN_THEME_LIMIT),
    monitored: distinct.slice(TACTICAL_PROFILE_VISIBLE_FOCUS_LIMIT)
  };
}

export function buildFocusedRunPlan(input: {
  taskFamily: FocusedRunPlan["taskFamily"];
  ratingAnchor: FocusedRunRatingAnchor;
  rankedFocuses: readonly RankedTacticalFocus[];
  runSize: number;
  inventoryBands: readonly FocusedRunInventoryBand[];
  excludePuzzleIds?: readonly string[];
}): FocusedRunPlanResult {
  if (!validRatingAnchor(input.ratingAnchor) || !Number.isInteger(input.runSize) || input.runSize < 1) {
    return unavailable("invalid_input");
  }

  const focuses = applyTacticalFocusCutoffs(input.rankedFocuses).run;
  if (focuses.length === 0) {
    return unavailable("no_focus");
  }

  const allocation = focusedRunAllocation(input.runSize, focuses.length);
  if (allocation === undefined) {
    return unavailable("invalid_input");
  }

  let lastShortages: readonly FocusedRunInventoryShortage[] = [];
  for (const inventory of input.inventoryBands) {
    if (!validInventoryBand(inventory, input.ratingAnchor.rating)) {
      continue;
    }
    const shortages = inventoryShortages(focuses, allocation.themeCounts, allocation.mixedCount, inventory);
    if (shortages.length > 0) {
      lastShortages = shortages;
      continue;
    }
    return {
      status: "ready",
      plan: {
        taskFamily: input.taskFamily,
        ratingAnchor: { ...input.ratingAnchor },
        reasons: focuses.map((focus, index) => ({
          ...focus,
          count: allocation.themeCounts[index] as number
        })),
        mixedControlCount: allocation.mixedCount,
        minRating: inventory.minRating,
        maxRating: inventory.maxRating,
        excludePuzzleIds: uniquePuzzleIds(input.excludePuzzleIds)
      }
    };
  }

  return {
    status: "unavailable",
    reason: "insufficient_inventory",
    shortages: lastShortages
  };
}

export function shouldReevaluateTacticalProfile(event: TacticalProfileRefreshEvent): boolean {
  return event === "eligible_mixed_run_completed" || event === "canonical_import_changed";
}

export function focusedRunPlanRefreshDecision(activeRun: boolean): FocusedRunPlanRefreshDecision {
  return activeRun ? "keep_active_run" : "rebuild_before_start";
}

export function canReofferFocusedRun(input: {
  completedFocusedRun: boolean;
  hasNewEligibleMixedSession: boolean;
}): boolean {
  return !input.completedFocusedRun || input.hasNewEligibleMixedSession;
}

function distinctTacticalFocuses(ranked: readonly RankedTacticalFocus[]): TacticalFocus[] {
  const distinct: TacticalFocus[] = [];
  const indexByTheme = new Map<string, number>();
  for (const candidate of ranked) {
    const theme = candidate.theme.trim();
    if (theme.length === 0) {
      continue;
    }
    const existingIndex = indexByTheme.get(theme);
    if (existingIndex === undefined) {
      indexByTheme.set(theme, distinct.length);
      distinct.push({ theme, reason: candidate.reason });
      continue;
    }
    const existing = distinct[existingIndex] as TacticalFocus;
    if (existing.reason !== candidate.reason) {
      distinct[existingIndex] = { ...existing, reason: "both" };
    }
  }
  return distinct;
}

function focusedRunAllocation(
  runSize: number,
  focusCount: number
): { themeCounts: readonly number[]; mixedCount: number } | undefined {
  const shares = focusCount === 1
    ? [
        { id: "primary", share: 0.7, tiePriority: 1 },
        { id: "mixed", share: 0.3, tiePriority: 2 }
      ]
    : [
        { id: "primary", share: 0.6, tiePriority: 1 },
        { id: "secondary", share: 0.2, tiePriority: 2 },
        { id: "mixed", share: 0.2, tiePriority: 3 }
      ];
  const counts = largestRemainder(runSize, shares);
  const mixedCount = counts.get("mixed") ?? 0;
  const themeCounts = focusCount === 1
    ? [counts.get("primary") ?? 0]
    : [counts.get("primary") ?? 0, counts.get("secondary") ?? 0];
  if (mixedCount < 1 || themeCounts.some((count) => count < 1)) {
    return undefined;
  }
  return { themeCounts, mixedCount };
}

function largestRemainder(
  total: number,
  shares: ReadonlyArray<{ id: string; share: number; tiePriority: number }>
): Map<string, number> {
  const allocations = shares.map((entry) => {
    const exact = total * entry.share;
    return {
      ...entry,
      count: Math.floor(exact),
      remainder: exact - Math.floor(exact)
    };
  });
  let remaining = total - allocations.reduce((sum, allocation) => sum + allocation.count, 0);
  const order = [...allocations].sort((left, right) =>
    right.remainder - left.remainder || right.tiePriority - left.tiePriority
  );
  for (let index = 0; remaining > 0; index = (index + 1) % order.length) {
    (order[index] as typeof order[number]).count += 1;
    remaining -= 1;
  }
  return new Map(allocations.map((allocation) => [allocation.id, allocation.count]));
}

function inventoryShortages(
  focuses: readonly TacticalFocus[],
  themeCounts: readonly number[],
  mixedCount: number,
  inventory: FocusedRunInventoryBand
): FocusedRunInventoryShortage[] {
  const shortages: FocusedRunInventoryShortage[] = [];
  for (const [index, focus] of focuses.entries()) {
    const required = themeCounts[index] as number;
    const available = normalizedAvailability(inventory.availableByTheme[focus.theme]);
    if (available < required) {
      shortages.push({ bucket: "theme", theme: focus.theme, required, available });
    }
  }
  const mixedAvailable = normalizedAvailability(inventory.mixedAvailableCount);
  if (mixedAvailable < mixedCount) {
    shortages.push({
      bucket: "mixed",
      required: mixedCount,
      available: mixedAvailable
    });
  }
  return shortages;
}

function validRatingAnchor(anchor: FocusedRunRatingAnchor): boolean {
  return anchor.ratingKey.trim().length > 0 && Number.isFinite(anchor.rating);
}

function validInventoryBand(inventory: FocusedRunInventoryBand, rating: number): boolean {
  return Number.isFinite(inventory.minRating)
    && Number.isFinite(inventory.maxRating)
    && inventory.minRating <= rating
    && rating <= inventory.maxRating;
}

function normalizedAvailability(value: number | undefined): number {
  return Number.isFinite(value) && (value as number) > 0 ? Math.floor(value as number) : 0;
}

function uniquePuzzleIds(ids: readonly string[] | undefined): string[] {
  return [...new Set((ids ?? []).map((id) => id.trim()).filter((id) => id.length > 0))];
}

function unavailable(reason: FocusedRunPlanUnavailableReason): FocusedRunPlanResult {
  return { status: "unavailable", reason, shortages: [] };
}
