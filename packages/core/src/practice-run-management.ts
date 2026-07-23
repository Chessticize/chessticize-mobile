import {
  ALL_THEME_SELECTION,
  applyThemeChoiceIntent,
  normalizeThemeChoiceSelection
} from "./theme-catalog.ts";
import {
  DEFAULT_NEW_PRACTICE_RUN_RATING,
  PRACTICE_RUN_RATING_MAX,
  PRACTICE_RUN_RATING_MIN,
  PracticeRunNameError,
  validatePracticeRunName
} from "./practice-runs.ts";
import { clampManualRating } from "./ratings.ts";
import { defaultSprintConfig } from "./sprint-config.ts";
import type {
  CustomSprintConfigRecord,
  PracticeRunKind,
  PracticeRunRecord
} from "./types.ts";

export type PracticeRunManagementRun = {
  id: string;
  ratingKey?: string;
  name: string;
  kind: PracticeRunKind;
  mode: PracticeRunRecord["mode"];
  elo: number;
  durationSeconds: number;
  perPuzzleSeconds: number;
  themes: readonly string[];
};

export type PracticeRunManagementDraft = Omit<PracticeRunManagementRun, "id"> & {
  id?: string;
};

export type PracticeRunManagementIntent =
  | { type: "add-run" }
  | { type: "cancel-edit" }
  | { type: "change-duration"; durationSeconds: number }
  | { type: "change-elo"; elo: number }
  | { type: "change-elo-input"; value: string }
  | { type: "change-mode"; mode: "custom" | "arrow_duel" }
  | { type: "change-name"; name: string }
  | { type: "change-per-puzzle"; perPuzzleSeconds: number }
  | { type: "step-elo-input"; direction: -1 | 1 }
  | { type: "toggle-theme"; theme: string }
  | { type: "confirm-remove" }
  | { type: "dismiss-remove" }
  | { type: "edit-run"; runId: string }
  | { type: "move-run"; runId: string; targetRunId: string }
  | { type: "prefill-previous-config"; configId: string }
  | { type: "remove-run"; runId: string }
  | { type: "restore-run"; runId: string }
  | { type: "save-run" }
  | { type: "select-run"; runId: string }
  | { type: "start-selected-run" }
  | { type: "toggle-home-edit" };

export type PracticeRunManagementCatalog = {
  hiddenRuns: readonly PracticeRunManagementRun[];
  previousConfigs: readonly {
    config: CustomSprintConfigRecord;
    rating: number;
  }[];
  runs: readonly PracticeRunManagementRun[];
};

export type PracticeRunManagementCommand =
  | { type: "archive-run"; runId: string }
  | { type: "create-run"; draft: PracticeRunManagementDraft }
  | { type: "reorder-run"; runId: string; targetRunId: string }
  | { type: "restore-run"; runId: string }
  | { type: "update-run"; runId: string; name: string; elo: number };

export type PracticeRunManagementCommandResult = {
  catalog: PracticeRunManagementCatalog;
  changedRunId: string;
};

export type PracticeRunManagementAdapter = {
  canCreate(draft: PracticeRunManagementDraft): boolean;
  execute(command: PracticeRunManagementCommand): PracticeRunManagementCommandResult;
  read(): PracticeRunManagementCatalog;
};

export type PracticeRunManagementSnapshot = PracticeRunManagementCatalog & {
  canSave: boolean;
  directRunEditing: true;
  draft: PracticeRunManagementDraft | null;
  eloError: string | null;
  eloInput: string | null;
  homeEditing: boolean;
  nameError: string | null;
  notice: string | null;
  removeCandidateId: string | null;
  screen: "home" | "create" | "edit";
  selectedRunId: string | null;
};

export type PracticeRunManagementEffect = {
  type: "start-run";
  runId: string;
};

export type PracticeRunManagementController = {
  dispatch(intent: PracticeRunManagementIntent): PracticeRunManagementEffect | undefined;
  getSnapshot(): PracticeRunManagementSnapshot;
  refresh(): void;
  subscribe(listener: () => void): () => void;
};

type RunManagementViewState = Omit<
  PracticeRunManagementSnapshot,
  keyof PracticeRunManagementCatalog | "canSave" | "directRunEditing"
>;

const PRACTICE_RUN_ELO_STEP = 100;
export const PRACTICE_RUN_ELO_ERROR =
  `Enter a whole-number ELO from ${PRACTICE_RUN_RATING_MIN} to ${PRACTICE_RUN_RATING_MAX}.`;

export function createPracticeRunManagementController(
  adapter: PracticeRunManagementAdapter
): PracticeRunManagementController {
  let catalog = cloneCatalog(adapter.read());
  let view = initialView(catalog.runs);
  let snapshot = buildSnapshot(adapter, catalog, view);
  const listeners = new Set<() => void>();

  const commit = (
    nextView: RunManagementViewState,
    nextCatalog: PracticeRunManagementCatalog = catalog
  ): void => {
    view = nextView;
    catalog = cloneCatalog(nextCatalog);
    snapshot = buildSnapshot(adapter, catalog, view);
    for (const listener of listeners) {
      listener();
    }
  };

  const execute = (
    command: PracticeRunManagementCommand
  ): PracticeRunManagementCommandResult => adapter.execute(command);

  const dispatch = (
    intent: PracticeRunManagementIntent
  ): PracticeRunManagementEffect | undefined => {
    switch (intent.type) {
      case "add-run":
        commit({
          ...view,
          draft: newRunDraft(),
          eloError: null,
          eloInput: String(DEFAULT_NEW_PRACTICE_RUN_RATING),
          homeEditing: false,
          nameError: null,
          notice: null,
          removeCandidateId: null,
          screen: "create"
        });
        return;
      case "cancel-edit":
        commit(returnHome(view, view.screen === "edit"));
        return;
      case "change-duration":
        if (view.screen === "create") {
          commit(updateDraft(view, { durationSeconds: intent.durationSeconds }));
        }
        return;
      case "change-elo": {
        const elo = Math.min(PRACTICE_RUN_RATING_MAX, clampManualRating(intent.elo));
        commit({
          ...updateDraft(view, { elo }),
          eloError: null,
          eloInput: String(elo)
        });
        return;
      }
      case "change-elo-input":
        commit(changeEloInput(view, intent.value));
        return;
      case "step-elo-input":
        commit(stepEloInput(view, intent.direction));
        return;
      case "change-mode":
        if (view.screen === "create") {
          commit(updateDraft(view, { mode: intent.mode }));
        }
        return;
      case "change-name":
        if (view.screen === "create" || view.screen === "edit") {
          commit({ ...updateDraft(view, { name: intent.name }), nameError: null });
        }
        return;
      case "change-per-puzzle":
        if (view.screen === "create") {
          commit(updateDraft(view, { perPuzzleSeconds: intent.perPuzzleSeconds }));
        }
        return;
      case "toggle-theme":
        if (view.screen === "create") {
          commit(updateDraft(view, {
            themes: applyThemeChoiceIntent(
              view.draft?.themes ?? [ALL_THEME_SELECTION],
              { type: "toggle-theme", theme: intent.theme }
            )
          }));
        }
        return;
      case "dismiss-remove":
        commit({ ...view, removeCandidateId: null });
        return;
      case "edit-run": {
        const run = catalog.runs.find((candidate) => candidate.id === intent.runId);
        if (run) {
          commit({
            ...view,
            draft: cloneRun(run),
            eloError: null,
            eloInput: String(run.elo),
            homeEditing: true,
            nameError: null,
            notice: null,
            removeCandidateId: null,
            screen: "edit"
          });
        }
        return;
      }
      case "move-run": {
        const result = execute({
          type: "reorder-run",
          runId: intent.runId,
          targetRunId: intent.targetRunId
        });
        commit({ ...view, notice: null }, result.catalog);
        return;
      }
      case "prefill-previous-config": {
        const previous = catalog.previousConfigs.find(
          ({ config }) => config.id === intent.configId
        );
        if (previous && view.screen === "create" && view.draft?.kind === "custom") {
          commit({
            ...view,
            draft: {
              ...view.draft,
              mode: previous.config.mode === "arrow_duel" ? "arrow_duel" : "custom",
              elo: previous.rating,
              durationSeconds: previous.config.durationSeconds,
              perPuzzleSeconds: previous.config.perPuzzleSeconds,
              themes: normalizeThemeChoiceSelection(previous.config.themes)
            },
            eloError: null,
            eloInput: String(previous.rating),
            nameError: null
          });
        }
        return;
      }
      case "remove-run":
        if (catalog.runs.some((run) => run.id === intent.runId)) {
          commit({ ...view, removeCandidateId: intent.runId, notice: null });
        }
        return;
      case "confirm-remove": {
        const run = catalog.runs.find((candidate) => candidate.id === view.removeCandidateId);
        if (!run) {
          commit({ ...view, removeCandidateId: null });
          return;
        }
        const result = execute({ type: "archive-run", runId: run.id });
        commit({
          ...view,
          notice: `${run.name} removed from Home. Its ELO and history were kept.`,
          removeCandidateId: null,
          selectedRunId: selectedRunId(
            result.catalog.runs,
            view.selectedRunId === run.id ? null : view.selectedRunId
          )
        }, result.catalog);
        return;
      }
      case "restore-run": {
        const run = catalog.hiddenRuns.find((candidate) => candidate.id === intent.runId);
        if (!run) {
          return;
        }
        const result = execute({ type: "restore-run", runId: run.id });
        const restored = result.catalog.runs.find(
          (candidate) => candidate.id === result.changedRunId
        ) ?? run;
        commit({
          ...view,
          notice: `${restored.name} restored with ELO ${restored.elo}.`,
          selectedRunId: view.selectedRunId ?? restored.id
        }, result.catalog);
        return;
      }
      case "save-run":
        saveRun();
        return;
      case "select-run":
        if (catalog.runs.some((run) => run.id === intent.runId)) {
          commit({ ...view, selectedRunId: intent.runId, notice: null });
        }
        return;
      case "start-selected-run":
        return view.selectedRunId
          && catalog.runs.some((run) => run.id === view.selectedRunId)
          ? { type: "start-run", runId: view.selectedRunId }
          : undefined;
      case "toggle-home-edit":
        commit({
          ...view,
          homeEditing: !view.homeEditing,
          notice: null,
          removeCandidateId: null
        });
        return;
    }
  };

  const saveRun = (): void => {
    const draft = view.draft;
    if (!draft || view.eloError || validateEloInput(view.eloInput ?? String(draft.elo))) {
      return;
    }
    try {
      const existingRuns = [...catalog.runs, ...catalog.hiddenRuns];
      validatePracticeRunName(draft.name, existingRuns, draft.id);
      if (view.screen === "create") {
        if (!adapter.canCreate(draft)) {
          return;
        }
        const result = execute({ type: "create-run", draft: cloneDraft(draft) });
        const saved = result.catalog.runs.find((run) => run.id === result.changedRunId);
        if (!saved) {
          throw new Error("Created Practice Run was not returned by the adapter");
        }
        commit({
          ...returnHome(view),
          notice: `${saved.name} added to Home.`,
          selectedRunId: saved.id
        }, result.catalog);
        return;
      }
      if (view.screen === "edit" && draft.id) {
        const result = execute({
          type: "update-run",
          runId: draft.id,
          name: draft.name,
          elo: draft.elo
        });
        const saved = result.catalog.runs.find((run) => run.id === result.changedRunId);
        if (!saved) {
          throw new Error("Updated Practice Run was not returned by the adapter");
        }
        commit({
          ...returnHome(view, true),
          notice: `${saved.name} updated.`,
          selectedRunId: selectedRunId(result.catalog.runs, view.selectedRunId)
        }, result.catalog);
      }
    } catch (error) {
      if (error instanceof PracticeRunNameError) {
        commit({ ...view, nameError: error.message });
        return;
      }
      throw error;
    }
  };

  return {
    dispatch,
    getSnapshot: () => snapshot,
    refresh: () => {
      const nextCatalog = adapter.read();
      commit({
        ...view,
        selectedRunId: selectedRunId(nextCatalog.runs, view.selectedRunId)
      }, nextCatalog);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

function initialView(
  runs: readonly PracticeRunManagementRun[]
): RunManagementViewState {
  return {
    draft: null,
    eloError: null,
    eloInput: null,
    homeEditing: false,
    nameError: null,
    notice: null,
    removeCandidateId: null,
    screen: "home",
    selectedRunId: selectedRunId(runs, "standard")
  };
}

function newRunDraft(): PracticeRunManagementDraft {
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

function updateDraft(
  view: RunManagementViewState,
  patch: Partial<PracticeRunManagementDraft>
): RunManagementViewState {
  return view.draft ? { ...view, draft: { ...view.draft, ...patch } } : view;
}

function changeEloInput(
  view: RunManagementViewState,
  value: string
): RunManagementViewState {
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

function returnHome(
  view: RunManagementViewState,
  homeEditing = false
): RunManagementViewState {
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

function selectedRunId(
  runs: readonly PracticeRunManagementRun[],
  preferredId: string | null
): string | null {
  if (preferredId && runs.some((run) => run.id === preferredId)) {
    return preferredId;
  }
  return runs[0]?.id ?? null;
}

function buildSnapshot(
  adapter: PracticeRunManagementAdapter,
  catalog: PracticeRunManagementCatalog,
  view: RunManagementViewState
): PracticeRunManagementSnapshot {
  return {
    ...cloneCatalog(catalog),
    ...cloneView(view),
    canSave: view.eloError === null && (
      view.screen !== "create" || view.draft === null
        ? true
        : adapter.canCreate(view.draft)
    ),
    directRunEditing: true
  };
}

function cloneCatalog(
  catalog: PracticeRunManagementCatalog
): PracticeRunManagementCatalog {
  return {
    hiddenRuns: catalog.hiddenRuns.map(cloneRun),
    previousConfigs: catalog.previousConfigs.map(({ config, rating }) => ({
      config: {
        ...config,
        ...(config.themes === undefined ? {} : { themes: [...config.themes] })
      },
      rating
    })),
    runs: catalog.runs.map(cloneRun)
  };
}

function cloneView(view: RunManagementViewState): RunManagementViewState {
  return {
    ...view,
    draft: view.draft ? cloneDraft(view.draft) : null
  };
}

function cloneDraft(
  draft: PracticeRunManagementDraft
): PracticeRunManagementDraft {
  return { ...draft, themes: [...draft.themes] };
}

function cloneRun(run: PracticeRunManagementRun): PracticeRunManagementRun {
  return { ...run, themes: [...run.themes] };
}
