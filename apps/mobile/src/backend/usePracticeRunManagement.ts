import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ALL_THEME_SELECTION,
  applyThemeChoiceIntent,
  clampManualRating,
  DEFAULT_NEW_PRACTICE_RUN_RATING,
  defaultSprintConfig,
  namedThemesForSelection,
  normalizeThemeChoiceSelection,
  PRACTICE_RUN_RATING_MAX,
  PRACTICE_RUN_RATING_MIN,
  PracticeRunNameError,
  type PracticeRunRecord
} from "../../../../packages/core/src/index.ts";
import type {
  CreatePracticeRunCommand,
  PracticeService
} from "../../../../packages/storage/src/practice-service.ts";
import type {
  PracticeRunDraft,
  PracticeRunManagementIntent,
  PracticeRunManagementPresentation,
  PracticeRunPresentation
} from "../components/practiceRunPresentation.ts";

type RunManagementViewState = {
  draft: PracticeRunDraft | null;
  eloError: string | null;
  eloInput: string | null;
  homeEditing: boolean;
  nameError: string | null;
  notice: string | null;
  removeCandidateId: string | null;
  screen: "home" | "create" | "edit";
  selectedRunId: string | null;
};

export type PracticeRunManagementController = {
  presentation: PracticeRunManagementPresentation | undefined;
  refresh: () => void;
};

const PRACTICE_RUN_ELO_STEP = 100;
const PRACTICE_RUN_ELO_ERROR =
  `Enter a whole-number ELO from ${PRACTICE_RUN_RATING_MIN} to ${PRACTICE_RUN_RATING_MAX}.`;

export function usePracticeRunManagement({
  enabled,
  onStartRun,
  service
}: {
  enabled: boolean;
  onStartRun: (runId: string) => void;
  service: PracticeService;
}): PracticeRunManagementController {
  const [catalog, setCatalog] = useState<PracticeRunRecord[]>(() => service.listPracticeRuns());
  const [view, setView] = useState<RunManagementViewState>(() => initialView(service.listPracticeRuns()));

  const refresh = useCallback(() => {
    const nextCatalog = service.listPracticeRuns();
    setCatalog(nextCatalog);
    setView((current) => ({
      ...current,
      selectedRunId: selectedActiveRunId(nextCatalog, current.selectedRunId)
    }));
  }, [service]);

  useEffect(() => {
    const nextCatalog = service.listPracticeRuns();
    setCatalog(nextCatalog);
    setView(initialView(nextCatalog));
  }, [service]);

  const onIntent = useCallback((intent: PracticeRunManagementIntent): void => {
    switch (intent.type) {
      case "add-run":
        setView((current) => ({
          ...current,
          draft: newRunDraft(),
          eloError: null,
          eloInput: String(DEFAULT_NEW_PRACTICE_RUN_RATING),
          homeEditing: false,
          nameError: null,
          notice: null,
          removeCandidateId: null,
          screen: "create"
        }));
        return;
      case "cancel-edit":
        setView((current) => returnHome(current, current.screen === "edit"));
        return;
      case "change-duration":
        setView((current) => current.screen === "create"
          ? updateDraft(current, { durationSeconds: intent.durationSeconds })
          : current);
        return;
      case "change-elo":
        setView((current) => {
          const elo = Math.min(PRACTICE_RUN_RATING_MAX, clampManualRating(intent.elo));
          return {
            ...updateDraft(current, { elo }),
            eloError: null,
            eloInput: String(elo)
          };
        });
        return;
      case "change-elo-input":
        setView((current) => changeEloInput(current, intent.value));
        return;
      case "step-elo-input":
        setView((current) => stepEloInput(current, intent.direction));
        return;
      case "change-mode":
        setView((current) => current.screen === "create"
          ? updateDraft(current, { mode: intent.mode })
          : current);
        return;
      case "change-name":
        setView((current) => current.screen === "create" || current.screen === "edit"
          ? { ...updateDraft(current, { name: intent.name }), nameError: null }
          : current);
        return;
      case "change-per-puzzle":
        setView((current) => current.screen === "create"
          ? updateDraft(current, { perPuzzleSeconds: intent.perPuzzleSeconds })
          : current);
        return;
      case "toggle-theme":
        setView((current) => current.screen === "create"
          ? updateDraft(current, {
              themes: applyThemeChoiceIntent(
                current.draft?.themes ?? [ALL_THEME_SELECTION],
                { type: "toggle-theme", theme: intent.theme }
              )
            })
          : current);
        return;
      case "dismiss-remove":
        setView((current) => ({ ...current, removeCandidateId: null }));
        return;
      case "edit-run": {
        const run = catalog.find((candidate) => candidate.id === intent.runId && !candidate.archived);
        if (!run) {
          return;
        }
        setView((current) => ({
          ...current,
          draft: presentationForRun(service, run),
          eloError: null,
          eloInput: String(service.getRating(run.ratingKey).rating),
          homeEditing: true,
          nameError: null,
          notice: null,
          removeCandidateId: null,
          screen: "edit"
        }));
        return;
      }
      case "move-run": {
        const nextCatalog = service.reorderPracticeRun(intent.runId, intent.targetRunId);
        setCatalog(nextCatalog);
        setView((current) => ({ ...current, notice: null }));
        return;
      }
      case "prefill-previous-config": {
        const config = service.listCustomSprintConfigs().find((candidate) => candidate.id === intent.configId);
        if (!config) {
          return;
        }
        setView((current) => current.screen === "create" && current.draft?.kind === "custom"
          ? {
              ...current,
              draft: {
                ...current.draft,
                mode: config.mode === "arrow_duel" ? "arrow_duel" : "custom",
                elo: service.getRating(config.ratingKey).rating,
                durationSeconds: config.durationSeconds,
                perPuzzleSeconds: config.perPuzzleSeconds,
                themes: normalizeThemeChoiceSelection(config.themes)
              },
              eloError: null,
              eloInput: String(service.getRating(config.ratingKey).rating),
              nameError: null
            }
          : current);
        return;
      }
      case "remove-run":
        setView((current) => catalog.some((run) => run.id === intent.runId && !run.archived)
          ? { ...current, removeCandidateId: intent.runId, notice: null }
          : current);
        return;
      case "confirm-remove": {
        const run = catalog.find((candidate) => candidate.id === view.removeCandidateId && !candidate.archived);
        if (!run) {
          setView((current) => ({ ...current, removeCandidateId: null }));
          return;
        }
        const nextCatalog = service.archivePracticeRun(run.id);
        setCatalog(nextCatalog);
        setView((current) => ({
          ...current,
          notice: `${run.name} removed from Home. Its ELO and history were kept.`,
          removeCandidateId: null,
          selectedRunId: selectedActiveRunId(nextCatalog, current.selectedRunId === run.id ? null : current.selectedRunId)
        }));
        return;
      }
      case "restore-run": {
        const run = catalog.find((candidate) => candidate.id === intent.runId && candidate.archived);
        if (!run) {
          return;
        }
        const nextCatalog = service.restorePracticeRun(run.id);
        setCatalog(nextCatalog);
        setView((current) => ({
          ...current,
          notice: `${run.name} restored with ELO ${service.getRating(run.ratingKey).rating}.`,
          selectedRunId: current.selectedRunId ?? run.id
        }));
        return;
      }
      case "save-run": {
        const draft = view.draft;
        if (!draft || view.eloError || validateEloInput(view.eloInput ?? String(draft.elo))) {
          return;
        }
        try {
          if (view.screen === "create") {
            const command = createPracticeRunCommand(draft);
            if (!service.canCreatePracticeRun(command)) {
              return;
            }
            const run = service.createPracticeRun(command);
            const nextCatalog = service.listPracticeRuns();
            setCatalog(nextCatalog);
            setView((current) => ({
              ...returnHome(current),
              notice: `${run.name} added to Home.`,
              selectedRunId: run.id
            }));
            return;
          }
          if (view.screen === "edit" && draft.id) {
            const saved = service.updatePracticeRun(draft.id, {
              name: draft.name,
              rating: draft.elo
            });
            const nextCatalog = service.listPracticeRuns();
            setCatalog(nextCatalog);
            setView((current) => ({
              ...returnHome(current, true),
              notice: `${saved.run.name} updated.`,
              selectedRunId: selectedActiveRunId(nextCatalog, current.selectedRunId)
            }));
          }
        } catch (error) {
          if (error instanceof PracticeRunNameError) {
            setView((current) => ({ ...current, nameError: error.message }));
            return;
          }
          throw error;
        }
        return;
      }
      case "select-run":
        setView((current) => catalog.some((run) => run.id === intent.runId && !run.archived)
          ? { ...current, selectedRunId: intent.runId, notice: null }
          : current);
        return;
      case "start-selected-run":
        if (view.selectedRunId && catalog.some((run) => run.id === view.selectedRunId && !run.archived)) {
          onStartRun(view.selectedRunId);
        }
        return;
      case "toggle-home-edit":
        setView((current) => ({
          ...current,
          homeEditing: !current.homeEditing,
          notice: null,
          removeCandidateId: null
        }));
        return;
    }
  }, [
    catalog,
    onStartRun,
    service,
    view.draft,
    view.eloError,
    view.eloInput,
    view.removeCandidateId,
    view.screen,
    view.selectedRunId
  ]);

  const presentation = useMemo<PracticeRunManagementPresentation | undefined>(() => {
    if (!enabled) {
      return undefined;
    }
    return {
      ...view,
      canSave: view.eloError === null && (
        view.screen !== "create" || view.draft === null
          ? true
          : service.canCreatePracticeRun(createPracticeRunCommand(view.draft))
      ),
      directRunEditing: true,
      hiddenRuns: catalog.filter((run) => run.archived).map((run) => presentationForRun(service, run)),
      previousConfigs: service.listCustomSprintConfigs().map((config) => ({
        config,
        rating: service.getRating(config.ratingKey).rating
      })),
      runs: catalog.filter((run) => !run.archived).map((run) => presentationForRun(service, run)),
      onIntent
    };
  }, [catalog, enabled, onIntent, service, view]);

  return { presentation, refresh };
}

function initialView(catalog: readonly PracticeRunRecord[]): RunManagementViewState {
  return {
    draft: null,
    eloError: null,
    eloInput: null,
    homeEditing: false,
    nameError: null,
    notice: null,
    removeCandidateId: null,
    screen: "home",
    selectedRunId: selectedActiveRunId(catalog, "standard")
  };
}

function newRunDraft(): PracticeRunDraft {
  const config = defaultSprintConfig("custom");
  return {
    name: "",
    kind: "custom",
    mode: "custom",
    elo: DEFAULT_NEW_PRACTICE_RUN_RATING,
    durationSeconds: config.durationSeconds,
    perPuzzleSeconds: config.perPuzzleSeconds,
    themes: config.themes ?? [ALL_THEME_SELECTION]
  };
}

function presentationForRun(service: PracticeService, run: PracticeRunRecord): PracticeRunPresentation {
  return {
    id: run.id,
    ratingKey: run.ratingKey,
    name: run.name,
    kind: run.kind,
    mode: run.mode,
    elo: service.getRating(run.ratingKey).rating,
    durationSeconds: run.durationSeconds,
    perPuzzleSeconds: run.perPuzzleSeconds,
    themes: run.themes ?? [ALL_THEME_SELECTION]
  };
}

function createPracticeRunCommand(draft: PracticeRunDraft): CreatePracticeRunCommand {
  const themes = namedThemesForSelection(draft.themes);
  return {
    name: draft.name,
    mode: draft.mode === "arrow_duel" ? "arrow_duel" : "custom",
    durationSeconds: draft.durationSeconds,
    perPuzzleSeconds: draft.perPuzzleSeconds,
    initialRating: draft.elo,
    ...(themes.length === 0 ? {} : { themes })
  };
}

function selectedActiveRunId(catalog: readonly PracticeRunRecord[], preferredId: string | null): string | null {
  if (preferredId && catalog.some((run) => run.id === preferredId && !run.archived)) {
    return preferredId;
  }
  return catalog.find((run) => !run.archived)?.id ?? null;
}

function updateDraft(
  view: RunManagementViewState,
  patch: Partial<PracticeRunDraft>
): RunManagementViewState {
  return view.draft ? { ...view, draft: { ...view.draft, ...patch } } : view;
}

function changeEloInput(view: RunManagementViewState, value: string): RunManagementViewState {
  const eloError = validateEloInput(value);
  const elo = Number(value);
  return {
    ...(eloError ? view : updateDraft(view, { elo })),
    eloError,
    eloInput: value
  };
}

function stepEloInput(
  view: RunManagementViewState,
  direction: -1 | 1
): RunManagementViewState {
  if (!view.draft) {
    return view;
  }
  const parsed = Number(view.eloInput);
  const current = typeof view.eloInput === "string"
    && /^\d{1,4}$/.test(view.eloInput)
    && Number.isInteger(parsed)
    ? parsed
    : view.draft.elo;
  const elo = Math.min(
    PRACTICE_RUN_RATING_MAX,
    Math.max(PRACTICE_RUN_RATING_MIN, current + direction * PRACTICE_RUN_ELO_STEP)
  );
  return changeEloInput(view, String(elo));
}

function validateEloInput(value: string): string | null {
  if (!/^\d+$/.test(value)) {
    return PRACTICE_RUN_ELO_ERROR;
  }
  const elo = Number(value);
  return Number.isInteger(elo)
    && elo >= PRACTICE_RUN_RATING_MIN
    && elo <= PRACTICE_RUN_RATING_MAX
    ? null
    : PRACTICE_RUN_ELO_ERROR;
}

function returnHome(view: RunManagementViewState, homeEditing = false): RunManagementViewState {
  return {
    ...view,
    draft: null,
    eloError: null,
    eloInput: null,
    homeEditing,
    nameError: null,
    notice: null,
    removeCandidateId: null,
    screen: "home"
  };
}
