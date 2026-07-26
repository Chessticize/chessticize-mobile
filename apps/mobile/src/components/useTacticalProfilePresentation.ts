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

  const preflightFocusedRun = useCallback((
    taskFamily: TacticalProfileTaskFamily,
    currentSnapshot: TacticalProfileSnapshot | undefined
  ): void => {
    const hasRecommendation = currentSnapshot?.evaluation.signals.some(
      (signal) =>
        signal.taskFamily === taskFamily &&
        signal.status === "recommended"
    ) ?? false;
    if (!hasRecommendation) {
      setPrepared(undefined);
      setFocusedRunUnavailable(undefined);
      return;
    }
    const result = service.preflightFocusedRun(taskFamily, currentSnapshot);
    if (result.status === "available") {
      setPrepared(undefined);
      setFocusedRunUnavailable(undefined);
      return;
    }
    setPrepared(undefined);
    setFocusedRunUnavailable(unavailableCopy(result.reason));
  }, [service]);

  const onIntent = useCallback((intent: TacticalProfileIntent): void => {
    if (intent.type === "open-profile" || intent.type === "restore-recommendation") {
      const next = refresh();
      const taskFamily =
        intent.type === "open-profile" && screen === "home"
          ? homeLeadTaskFamily(next) ??
            resolvedRecommendedTaskFamily(next, activeTaskFamily)
          : resolvedRecommendedTaskFamily(next, activeTaskFamily);
      setActiveTaskFamily(taskFamily);
      preflightFocusedRun(
        taskFamily,
        next
      );
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
      preflightFocusedRun(intent.taskFamily, snapshot);
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
      if (prepared?.plan.taskFamily === intentTaskFamily) {
        setScreen("focused_run");
        return;
      }
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
  }, [
    activeTaskFamily,
    onStartRequested,
    preflightFocusedRun,
    prepared,
    refresh,
    screen,
    service,
    snapshot
  ]);

  return useMemo(() => {
    if (injectedPresentation) {
      return injectedPresentation;
    }
    if (!snapshot) {
      return undefined;
    }
    const signals = snapshot.evaluation.signals.map(signalPresentation);
    const resolvedTaskFamily = resolvedRecommendedTaskFamily(
      snapshot,
      activeTaskFamily
    );
    return {
      phase: snapshot.phase,
      assurance: snapshot.assurance,
      screen,
      activeTaskFamily: resolvedTaskFamily,
      signals,
      unavailableFamilies: snapshot.unavailableFamilies,
      ...(snapshot.homeLeadSignalId === undefined
        ? {}
        : { homeLeadSignalId: snapshot.homeLeadSignalId }),
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
  const visibleFamilies = new Set(
    snapshot?.evaluation.signals.map((signal) => signal.taskFamily)
  );
  if (visibleFamilies.has(activeTaskFamily)) {
    return activeTaskFamily;
  }
  if (recommendedFamilies.size > 0) {
    return preferredTaskFamily(recommendedFamilies, activeTaskFamily);
  }
  if (visibleFamilies.size > 0) {
    return preferredTaskFamily(visibleFamilies, activeTaskFamily);
  }
  const availableFamilies = new Set(
    (["line", "arrow_duel"] as const).filter(
      (taskFamily) => snapshot?.unavailableFamilies[taskFamily] === undefined
    )
  );
  return availableFamilies.size > 0
    ? preferredTaskFamily(availableFamilies, activeTaskFamily)
    : activeTaskFamily;
}

function preferredTaskFamily(
  taskFamilies: ReadonlySet<TacticalProfileTaskFamily>,
  activeTaskFamily: TacticalProfileTaskFamily
): TacticalProfileTaskFamily {
  return taskFamilies.has(activeTaskFamily)
    ? activeTaskFamily
    : taskFamilies.has("line")
      ? "line"
      : "arrow_duel";
}

function homeLeadTaskFamily(
  snapshot: TacticalProfileSnapshot | undefined
): TacticalProfileTaskFamily | undefined {
  if (!snapshot?.homeLeadSignalId) {
    return undefined;
  }
  return snapshot.evaluation.signals.find(
    (signal) => signal.id === snapshot.homeLeadSignalId
  )?.taskFamily;
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
