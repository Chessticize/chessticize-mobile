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
import { customThemeLabel } from "./practice/shared/themeCatalog.ts";
import { type SupportedLocale, translate, useTranslation } from "../i18n/index.ts";

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
  const { locale } = useTranslation();
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
    setFocusedRunUnavailable(unavailableCopy(result.reason, locale));
  }, [locale, service]);

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
        setFocusedRunUnavailable(unavailableCopy(result.reason, locale));
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
        ? unavailableCopy(error.reason, locale)
        : {
            title: translate(locale, "tacticalProfile.unavailable.focusChangedTitle"),
            body: translate(locale, "tacticalProfile.unavailable.focusChangedBody")
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
    locale,
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
    const signals = snapshot.evaluation.signals.map((signal) =>
      signalPresentation(signal, locale)
    );
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
        : { focusedRun: focusedRunPreview(prepared, locale) }),
      ...(focusedRunUnavailable === undefined ? {} : { focusedRunUnavailable }),
      onIntent
    };
  }, [
    activeTaskFamily,
    focusedRunUnavailable,
    injectedPresentation,
    locale,
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
  signal: TacticalProfileSnapshot["evaluation"]["signals"][number],
  locale: SupportedLocale
): TacticalProfileSignal {
  return {
    id: signal.id,
    taskFamily: signal.taskFamily,
    themeKey: signal.theme,
    themeLabel: localizedThemeName(signal.theme, locale),
    kind: presentationKind(signal.reason),
    distinctPuzzleCount: signal.distinctPuzzleCount,
    distinctSessionCount: signal.distinctSessionCount,
    priorityLabel: signal.status === "recommended"
      ? signal.confidence === "very_high"
        ? translate(locale, "tacticalProfile.home.recommendedStrong")
        : translate(locale, "tacticalProfile.home.recommendedStatus")
      : translate(locale, "tacticalProfile.collectingEvidence"),
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

function focusedRunPreview(
  prepared: PreparedFocusedRun,
  locale: SupportedLocale
): FocusedRunPreview {
  return {
    taskFamily: prepared.plan.taskFamily,
    title: prepared.plan.reasons.length > 1
      ? prepared.plan.taskFamily === "arrow_duel"
        ? translate(locale, "tacticalProfile.preview.arrowDuelFocusTitle")
        : translate(locale, "tacticalProfile.preview.tacticalFocusTitle")
      : prepared.plan.reasons[0]?.theme
        ? translate(locale, "tacticalProfile.preview.themeFocusTitle", {
            theme: localizedThemeName(prepared.plan.reasons[0].theme, locale)
          })
        : translate(locale, "tacticalProfile.preview.tacticalFocusTitle"),
    ratingLabel: prepared.plan.taskFamily === "arrow_duel"
      ? translate(locale, "tacticalProfile.preview.arrowDuelRating", {
          rating: prepared.plan.ratingAnchor.rating
        })
      : translate(locale, "tacticalProfile.preview.puzzleSolvingRating", {
          rating: prepared.plan.ratingAnchor.rating
        }),
    durationLabel: formatDuration(prepared.config.durationSeconds, locale),
    totalPuzzleCount: prepared.puzzles.length,
    allocations: [
      ...prepared.plan.reasons.map((reason, index) => ({
        id: reason.theme,
        label: localizedThemeName(reason.theme, locale),
        puzzleCount: reason.count,
        tone: index === 0 ? "primary" as const : "secondary" as const
      })),
      {
        id: "mixed",
        label: prepared.plan.taskFamily === "arrow_duel"
          ? translate(locale, "tacticalProfile.preview.mixedArrowDuel")
          : translate(locale, "tacticalProfile.preview.mixedPractice"),
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
  >["reason"],
  locale: SupportedLocale
): NonNullable<TacticalProfilePresentation["focusedRunUnavailable"]> {
  if (reason === "insufficient_inventory") {
    return {
      title: translate(locale, "tacticalProfile.unavailable.inventoryTitle"),
      body: translate(locale, "tacticalProfile.unavailable.inventoryBody")
    };
  }
  if (reason === "no_fresh_evidence") {
    return {
      title: translate(locale, "tacticalProfile.unavailable.freshTitle"),
      body: translate(locale, "tacticalProfile.unavailable.freshBody")
    };
  }
  return {
    title: translate(locale, "tacticalProfile.unavailable.genericTitle"),
    body: translate(locale, "tacticalProfile.unavailable.genericBody")
  };
}

function localizedThemeName(theme: string, locale: SupportedLocale): string {
  const trimmed = theme.trim();
  if (trimmed.length === 0) {
    return translate(locale, "history.progress.tacticalPatternFallback");
  }
  return customThemeLabel(trimmed, locale);
}

function formatDuration(seconds: number, locale: SupportedLocale): string {
  const minutes = seconds % 60 === 0 ? seconds / 60 : Math.ceil(seconds / 60);
  return translate(locale, "common.minutesShort", { count: minutes });
}
