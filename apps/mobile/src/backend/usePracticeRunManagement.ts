import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clampManualRating,
  DEFAULT_NEW_PRACTICE_RUN_RATING,
  defaultSprintConfig,
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
        setView((current) => updateDraft(current, { elo: clampManualRating(intent.elo) }));
        return;
      case "change-elo-input":
        // Reserved for the Interaction Lab direct-entry proposal. Product
        // validation and persistence remain intentionally unwired in this phase.
        return;
      case "change-mode":
        setView((current) => current.screen === "create"
          ? updateDraft(current, { mode: intent.mode })
          : current);
        return;
      case "change-name":
        setView((current) => current.screen === "create"
          ? { ...updateDraft(current, { name: intent.name }), nameError: null }
          : current);
        return;
      case "change-per-puzzle":
        setView((current) => current.screen === "create"
          ? updateDraft(current, { perPuzzleSeconds: intent.perPuzzleSeconds })
          : current);
        return;
      case "change-themes":
        setView((current) => current.screen === "create"
          ? updateDraft(current, { themes: intent.themes.length > 0 ? intent.themes : ["mixed"] })
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
        if (!draft) {
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
            const saved = service.setPracticeRunRating(draft.id, draft.elo);
            const run = catalog.find((candidate) => candidate.id === draft.id);
            const nextCatalog = service.listPracticeRuns();
            setCatalog(nextCatalog);
            setView((current) => ({
              ...returnHome(current, true),
              notice: run ? `${run.name} ELO updated to ${saved.rating}.` : null,
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
  }, [catalog, onStartRun, service, view.draft, view.removeCandidateId, view.screen, view.selectedRunId]);

  const presentation = useMemo<PracticeRunManagementPresentation | undefined>(() => {
    if (!enabled) {
      return undefined;
    }
    return {
      ...view,
      canSave: view.screen !== "create" || view.draft === null
        ? true
        : service.canCreatePracticeRun(createPracticeRunCommand(view.draft)),
      hiddenRuns: catalog.filter((run) => run.archived).map((run) => presentationForRun(service, run)),
      runs: catalog.filter((run) => !run.archived).map((run) => presentationForRun(service, run)),
      onIntent
    };
  }, [catalog, enabled, onIntent, service, view]);

  return { presentation, refresh };
}

function initialView(catalog: readonly PracticeRunRecord[]): RunManagementViewState {
  return {
    draft: null,
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
    themes: config.themes ?? ["mixed"]
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
    themes: run.themes ?? ["mixed"]
  };
}

function createPracticeRunCommand(draft: PracticeRunDraft): CreatePracticeRunCommand {
  const themes = draft.themes.filter((theme) => theme !== "mixed");
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

function returnHome(view: RunManagementViewState, homeEditing = false): RunManagementViewState {
  return {
    ...view,
    draft: null,
    homeEditing,
    nameError: null,
    notice: null,
    removeCandidateId: null,
    screen: "home"
  };
}
