import {
  SURVIVAL_LEVELS,
  SURVIVAL_RULE_VERSION,
  survivalLevelForRating,
  type SprintState,
  type SurvivalChallengeType,
  type SurvivalLevel
} from "../../../../packages/core/src/index.ts";
import type { PracticeService } from "../../../../packages/storage/src/practice-service.ts";
import type {
  PersonalBestChallengeDesignPreview,
  PersonalBestLevelRecordPresentation,
  PersonalBestPausedRunPresentation,
  PersonalBestReferenceRunPresentation
} from "./PersonalBestChallengeDesign.tsx";

export function buildSurvivalChallengePresentation(input: {
  currentState: SprintState | null;
  nowMs: number;
  service: PracticeService;
}): PersonalBestChallengeDesignPreview {
  const { currentState, nowMs, service } = input;
  const selectedReferenceRunIds = {
    arrow_duel: service.selectedSurvivalRatingSourceId("arrow_duel"),
    puzzle: service.selectedSurvivalRatingSourceId("puzzle")
  } as const;
  const sources = (["puzzle", "arrow_duel"] as const).flatMap((challengeType) =>
    service.listSurvivalRatingSources(challengeType).map((source) => ({
      challengeType,
      durationLabel: durationLabel(source.run.durationSeconds),
      games: source.rating.games,
      id: source.run.id,
      isOnHome: source.isOnHome,
      name: source.run.name,
      perPuzzleLabel: source.run.puzzleTiming?.timeoutAfterSeconds === null
        ? "No puzzle timeout"
        : `${source.run.perPuzzleSeconds} sec per puzzle`,
      rating: source.rating.rating
    } satisfies PersonalBestReferenceRunPresentation))
  );
  const defaultChallengeType = currentState?.config.survival?.challengeType ?? "puzzle";
  const selectedSourceId = selectedReferenceRunIds[defaultChallengeType];
  const selectedSource = sources.find((source) => (
    source.challengeType === defaultChallengeType && source.id === selectedSourceId
  ));
  const retainedRun = service.listPracticeRuns().find((run) => run.id === selectedSourceId);
  const retainedRating = retainedRun ? service.getRating(retainedRun.ratingKey).rating : undefined;
  const sourceRating = selectedSource?.rating ?? retainedRating ?? 600;
  const currentLevel = currentState?.config.survival
    ? {
        minRating: currentState.config.survival.minRating,
        maxRating: currentState.config.survival.maxRating
      }
    : survivalLevelForRating(sourceRating);
  const sessions = service.listSurvivalSessions();
  const bests = service.listSurvivalBests();
  const pausedRuns = service.listResumableSurvivalRuns().map((state) =>
    pausedRunPresentation(state, nowMs)
  );
  const levelRecords = levelRecordPresentations(bests);
  const currentBest = service.getSurvivalBest(defaultChallengeType, currentLevel)?.score ?? null;
  const completedSessions = sessions.filter((session) => session.completedAt !== undefined);
  const activeSurvival = currentState?.config.survival;
  const result = currentState && activeSurvival && currentState.status !== "active" && currentState.status !== "paused"
    ? {
        activeElapsedMs: activeElapsedMs(currentState, currentState.completedAt
          ? Date.parse(currentState.completedAt)
          : nowMs),
        ...(currentState.endReason === "max_mistakes" || currentState.endReason === "pool_cleared"
          ? { endReason: currentState.endReason }
          : {}),
        isNewBest: currentState.correctCount > (currentState.survival?.bestBefore ?? 0),
        previousBestScore: currentState.survival?.bestBefore ?? null,
        sittings: currentState.survival?.sittings ?? 1
      }
    : undefined;

  return {
    availableLevels: SURVIVAL_LEVELS,
    band: {
      currentRating: sourceRating,
      minRating: currentLevel.minRating,
      maxRating: currentLevel.maxRating
    },
    bestScore: currentBest,
    challengeType: defaultChallengeType,
    completedRunCount: completedSessions.length,
    levelRecords,
    opponentReplyEnabled: service.getSettings().arrowDuel.opponentReplyEnabled,
    pausedRuns,
    referenceRuns: sources,
    recordsState: bests.length === 0 ? "empty" : "populated",
    selectedReferenceRunIds,
    showActivePresentation: activeSurvival !== undefined,
    ...(result ? { result } : {}),
    recentScores: completedSessions
      .filter((session) => session.config?.survival?.challengeType === defaultChallengeType)
      .sort((left, right) => (right.completedAt ?? "").localeCompare(left.completedAt ?? ""))
      .slice(0, 3)
      .map((session) => ({
        completedAtLabel: relativeTimeLabel(session.completedAt ?? session.startedAt, nowMs),
        score: session.correctCount
      }))
  };
}

function levelRecordPresentations(
  bests: ReturnType<PracticeService["listSurvivalBests"]>
): PersonalBestLevelRecordPresentation[] {
  const records: PersonalBestLevelRecordPresentation[] = [];
  for (const challengeType of ["puzzle", "arrow_duel"] as const) {
    for (const level of SURVIVAL_LEVELS) {
      const best = bests.find((record) => (
        record.challengeType === challengeType
        && record.ruleVersion === SURVIVAL_RULE_VERSION
        && record.minRating === level.minRating
        && record.maxRating === level.maxRating
      ));
      if (!best) {
        continue;
      }
      records.push({
        challengeType,
        maxRating: level.maxRating,
        minRating: level.minRating,
        score: best.score
      });
    }
  }
  return records;
}

function pausedRunPresentation(
  state: SprintState,
  nowMs: number
): PersonalBestPausedRunPresentation {
  const survival = state.config.survival;
  if (!survival || !state.survival) {
    throw new Error(`Stored Survival Run ${state.id} has no Survival metadata`);
  }
  return {
    activeElapsedMs: activeElapsedMs(state, state.pausedAt ? Date.parse(state.pausedAt) : nowMs),
    challengeType: survival.challengeType,
    id: state.id,
    lastTouchedLabel: relativeTimeLabel(state.survival.lastTouchedAt, nowMs, "Paused"),
    maxRating: survival.maxRating,
    minRating: survival.minRating,
    mistakeCount: state.mistakeCount,
    opponentReplyEnabled: state.config.opponentReply?.enabled ?? false,
    phaseLabel: survivalPhaseLabel(state),
    score: state.correctCount,
    sittings: state.survival.sittings
  };
}

function survivalPhaseLabel(state: SprintState): string {
  if (state.currentPuzzle?.kind === "arrow_duel") {
    return state.currentPuzzle.phase === "reply" || state.currentPuzzle.phase === "reply_handoff"
      ? "Reply phase saved"
      : "Candidate saved";
  }
  return `Puzzle ${(state.survival?.consumedPuzzleCount ?? 0) + 1} saved`;
}

function activeElapsedMs(state: SprintState, endMs: number): number {
  return Math.max(
    0,
    endMs - Date.parse(state.startedAt) - (state.totalPausedMs ?? 0)
  );
}

function durationLabel(seconds: number): string {
  if (seconds % 60 === 0) {
    return `${seconds / 60} min`;
  }
  return `${seconds} sec`;
}

function relativeTimeLabel(iso: string, nowMs: number, prefix = "Completed"): string {
  const elapsedMs = Math.max(0, nowMs - Date.parse(iso));
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) {
    return `${prefix} just now`;
  }
  if (minutes < 60) {
    return `${prefix} ${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${prefix} ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  const days = Math.floor(hours / 24);
  return `${prefix} ${days === 1 ? "yesterday" : `${days} days ago`}`;
}

export function survivalSelectionLevel(selection: {
  band: { minRating: number; maxRating: number };
}): SurvivalLevel {
  return {
    minRating: selection.band.minRating,
    maxRating: selection.band.maxRating
  };
}

export function survivalChallengeTypeForState(state: SprintState): SurvivalChallengeType | undefined {
  return state.config.survival?.challengeType;
}
