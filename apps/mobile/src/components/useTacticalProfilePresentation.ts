import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  TacticalFocusReason,
  TacticalProfileTaskFamily
} from "../../../../packages/core/src/index.ts";
import {
  FocusedRunUnavailableError,
  type PracticeService
} from "../../../../packages/storage/src/practice-service.ts";
import type {
  PreparedFocusedRun,
  TacticalProfileSnapshot
} from "../../../../packages/storage/src/tactical-profile-service.ts";
import type {
  FocusedRunPreview,
  TacticalProfileIntent,
  TacticalProfilePresentation,
  TacticalProfileScreen,
  TacticalProfileSignal
} from "./tacticalProfilePresentation.ts";

export function useTacticalProfilePresentation(input: {
  service: PracticeService;
  injectedPresentation?: TacticalProfilePresentation;
  onStartRequested: (
    taskFamily: TacticalProfileTaskFamily,
    onUnavailable: (error: unknown) => void
  ) => void;
  refreshKey?: unknown;
}): TacticalProfilePresentation | undefined {
  const { injectedPresentation, onStartRequested, service } = input;
  const [snapshot, setSnapshot] = useState<TacticalProfileSnapshot | undefined>(
    undefined
  );
  const [screen, setScreen] = useState<TacticalProfileScreen>("home");
  const [activeTaskFamily, setActiveTaskFamily] =
    useState<TacticalProfileTaskFamily>("line");
  const [selectedSignalId, setSelectedSignalId] = useState<string | undefined>();
  const [prepared, setPrepared] = useState<PreparedFocusedRun | undefined>();
  const [focusedRunUnavailable, setFocusedRunUnavailable] =
    useState<TacticalProfilePresentation["focusedRunUnavailable"]>();
  const failedRetryCount = useRef(0);

  useEffect(() => {
    if (injectedPresentation) {
      return;
    }
    setSnapshot(service.getTacticalProfileSnapshot());
  }, [injectedPresentation, input.refreshKey, service]);

  useEffect(() => {
    if (injectedPresentation || snapshot?.phase !== "building") {
      failedRetryCount.current = 0;
      return;
    }
    const failed = snapshot.buildState.status === "failed";
    const retryDelayMs = failed
      ? Math.min(30_000, 1_000 * 2 ** failedRetryCount.current)
      : 25;
    failedRetryCount.current = failed
      ? failedRetryCount.current + 1
      : 0;
    const refreshTimer = setTimeout(() => {
      setSnapshot(service.getTacticalProfileSnapshot());
    }, retryDelayMs);
    return () => clearTimeout(refreshTimer);
  }, [injectedPresentation, service, snapshot]);

  const refresh = useCallback(() => {
    const next = service.getTacticalProfileSnapshot();
    setSnapshot(next);
    return next;
  }, [service]);

  const onIntent = useCallback((intent: TacticalProfileIntent): void => {
    if (intent.type === "open-profile" || intent.type === "restore-recommendation") {
      refresh();
      setScreen("profile");
      return;
    }
    if (intent.type === "close-profile") {
      setScreen("home");
      return;
    }
    if (intent.type === "select-task-family") {
      setActiveTaskFamily(intent.taskFamily);
      setSelectedSignalId(undefined);
      setPrepared(undefined);
      setFocusedRunUnavailable(undefined);
      return;
    }
    if (intent.type === "explain-signal") {
      setSelectedSignalId(intent.signalId);
      setScreen("explanation");
      return;
    }
    if (intent.type === "suppress-recommendation") {
      setScreen("suppressed");
      return;
    }
    const intentTaskFamily = resolvedRecommendedTaskFamily(
      snapshot,
      activeTaskFamily
    );
    if (intent.type === "preview-focused-run") {
      const result = service.prepareFocusedRun(intentTaskFamily);
      if (result.status !== "ready") {
        setPrepared(undefined);
        setFocusedRunUnavailable(unavailableCopy(result.reason));
        setScreen("profile");
        return;
      }
      setPrepared(result.prepared);
      setFocusedRunUnavailable(undefined);
      setScreen("focused_run");
      return;
    }
    const handleUnavailable = (error: unknown): void => {
      setFocusedRunUnavailable(error instanceof FocusedRunUnavailableError
        ? unavailableCopy(error.reason)
        : {
            title: "This focus changed",
            body: "Your profile or nearby puzzle supply changed. Review the refreshed focus before starting."
          });
      refresh();
      setScreen("profile");
    };
    setScreen("home");
    setPrepared(undefined);
    try {
      onStartRequested(intentTaskFamily, handleUnavailable);
    } catch (error) {
      handleUnavailable(error);
    }
  }, [activeTaskFamily, onStartRequested, refresh, service, snapshot]);

  return useMemo(() => {
    if (injectedPresentation) {
      return injectedPresentation;
    }
    if (!snapshot) {
      return undefined;
    }
    const signals = snapshot.evaluation.signals.map(signalPresentation);
    const recommendedFamilies = new Set(
      signals
        .filter((signal) => signal.status === "recommended")
        .map((signal) => signal.taskFamily)
    );
    const resolvedTaskFamily = resolvedRecommendedTaskFamily(
      snapshot,
      activeTaskFamily
    );
    // Cross-family ordering is deliberately not inferred from model array
    // order. Until an approved calibration artifact carries that policy, the
    // shared Home card stays mode-neutral when both families qualify.
    const homeLeadSignalId = recommendedFamilies.size === 1
      ? signals.find(
          (signal) =>
            signal.status === "recommended" &&
            recommendedFamilies.has(signal.taskFamily)
        )?.id
      : undefined;
    return {
      phase: snapshot.phase,
      screen,
      activeTaskFamily: resolvedTaskFamily,
      signals,
      ...(homeLeadSignalId === undefined ? {} : { homeLeadSignalId }),
      ...(selectedSignalId === undefined ? {} : { selectedSignalId }),
      ...(prepared === undefined
        ? {}
        : { focusedRun: focusedRunPreview(prepared) }),
      ...(focusedRunUnavailable === undefined ? {} : { focusedRunUnavailable }),
      onIntent
    };
  }, [
    activeTaskFamily,
    focusedRunUnavailable,
    injectedPresentation,
    onIntent,
    prepared,
    screen,
    selectedSignalId,
    snapshot
  ]);
}

function resolvedRecommendedTaskFamily(
  snapshot: TacticalProfileSnapshot | undefined,
  activeTaskFamily: TacticalProfileTaskFamily
): TacticalProfileTaskFamily {
  const recommendedFamilies = new Set(
    snapshot?.evaluation.signals
      .filter((signal) => signal.status === "recommended")
      .map((signal) => signal.taskFamily)
  );
  return recommendedFamilies.has(activeTaskFamily)
    ? activeTaskFamily
    : recommendedFamilies.has("line")
      ? "line"
      : recommendedFamilies.has("arrow_duel")
        ? "arrow_duel"
        : activeTaskFamily;
}

function signalPresentation(
  signal: TacticalProfileSnapshot["evaluation"]["signals"][number]
): TacticalProfileSignal {
  return {
    id: signal.id,
    taskFamily: signal.taskFamily,
    themeKey: signal.theme,
    themeLabel: humanizeTheme(signal.theme),
    kind: presentationKind(signal.reason),
    distinctPuzzleCount: signal.distinctPuzzleCount,
    distinctSessionCount: signal.distinctSessionCount,
    priorityLabel: signal.status === "recommended"
      ? signal.confidence === "very_high"
        ? "Recommended · strong evidence"
        : "Recommended"
      : "Collecting evidence",
    status: signal.status
  };
}

function presentationKind(
  reason: TacticalFocusReason
): TacticalProfileSignal["kind"] {
  if (reason === "completed_speed") {
    return "speed";
  }
  return reason;
}

function focusedRunPreview(prepared: PreparedFocusedRun): FocusedRunPreview {
  return {
    taskFamily: prepared.plan.taskFamily,
    title: prepared.plan.reasons.length > 1
      ? prepared.plan.taskFamily === "arrow_duel"
        ? "Arrow Duel focus"
        : "Tactical focus"
      : `${humanizeTheme(prepared.plan.reasons[0]?.theme ?? "Tactical")} focus`,
    ratingLabel: prepared.plan.taskFamily === "arrow_duel"
      ? `Arrow Duel Rating ${prepared.plan.ratingAnchor.rating}`
      : `Puzzle-solving Rating ${prepared.plan.ratingAnchor.rating}`,
    durationLabel: formatDuration(prepared.config.durationSeconds),
    totalPuzzleCount: prepared.puzzles.length,
    allocations: [
      ...prepared.plan.reasons.map((reason, index) => ({
        id: reason.theme,
        label: humanizeTheme(reason.theme),
        puzzleCount: reason.count,
        tone: index === 0 ? "primary" as const : "secondary" as const
      })),
      {
        id: "mixed",
        label: prepared.plan.taskFamily === "arrow_duel"
          ? "Mixed Arrow Duel"
          : "Mixed practice",
        puzzleCount: prepared.plan.mixedControlCount,
        tone: "mixed" as const
      }
    ]
  };
}

function unavailableCopy(
  reason: Exclude<
    ReturnType<PracticeService["prepareFocusedRun"]>,
    { status: "ready" }
  >["reason"]
): NonNullable<TacticalProfilePresentation["focusedRunUnavailable"]> {
  if (reason === "insufficient_inventory") {
    return {
      title: "Not enough new puzzles nearby",
      body: "This focus stays in your profile, but there are not enough unseen puzzles near your current Rating to keep the approved mix."
    };
  }
  if (reason === "no_fresh_evidence") {
    return {
      title: "Play another mixed Run first",
      body: "A fresh ordinary mixed Run helps us check whether this focus still applies before offering it again."
    };
  }
  return {
    title: "Focused training is not ready",
    body: "Keep playing ordinary mixed Runs while the app gathers the evidence and nearby puzzle supply needed for a safe focus."
  };
}

function humanizeTheme(theme: string): string {
  const words = theme
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return words.length === 0
    ? "Tactical pattern"
    : words[0]!.toUpperCase() + words.slice(1);
}

function formatDuration(seconds: number): string {
  return seconds % 60 === 0
    ? `${seconds / 60} min`
    : `${Math.ceil(seconds / 60)} min`;
}
