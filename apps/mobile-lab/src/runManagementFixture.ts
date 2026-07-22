// Keep the deterministic Lab fixture on the root TypeScript boundary, which
// intentionally excludes React Native TSX. LabScenario's prop assignment still
// checks this structural contract against PracticePocScreen during Lab typecheck.
import {
  ALL_THEME_SELECTION,
  applyThemeChoiceIntent
} from "../../../packages/core/src/index.ts";

type PracticeRunPresentation = {
  id: string;
  ratingKey?: string;
  name: string;
  kind: "standard" | "arrow_duel" | "custom";
  mode: "standard" | "custom" | "arrow_duel";
  elo: number;
  durationSeconds: number;
  perPuzzleSeconds: number;
  themes: readonly string[];
};

type PracticeRunDraft = Omit<PracticeRunPresentation, "id"> & {
  id?: string;
};

type PracticeRunManagementIntent =
  | { type: "add-run" }
  | { type: "cancel-edit" }
  | { type: "change-duration"; durationSeconds: number }
  | { type: "change-elo"; elo: number }
  | { type: "change-mode"; mode: "custom" | "arrow_duel" }
  | { type: "change-name"; name: string }
  | { type: "change-per-puzzle"; perPuzzleSeconds: number }
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

type PracticeRunManagementPresentation = {
  canSave?: boolean;
  draft: PracticeRunDraft | null;
  hiddenRuns: readonly PracticeRunPresentation[];
  homeEditing: boolean;
  nameError: string | null;
  notice: string | null;
  removeCandidateId: string | null;
  runs: readonly PracticeRunPresentation[];
  screen: "home" | "create" | "edit";
  selectedRunId: string | null;
  onIntent: (intent: PracticeRunManagementIntent) => void;
};

export type RunManagementFixtureState = Omit<PracticeRunManagementPresentation, "onIntent">;

const BASE_RUNS: readonly PracticeRunPresentation[] = [
  {
    id: "standard",
    ratingKey: "standard 5/20",
    name: "Standard",
    kind: "standard",
    mode: "standard",
    elo: 925,
    durationSeconds: 300,
    perPuzzleSeconds: 20,
    themes: [ALL_THEME_SELECTION]
  },
  {
    id: "arrow-duel",
    ratingKey: "arrow_duel 5/30",
    name: "Arrow Duel",
    kind: "arrow_duel",
    mode: "arrow_duel",
    elo: 875,
    durationSeconds: 300,
    perPuzzleSeconds: 20,
    themes: [ALL_THEME_SELECTION]
  },
  {
    id: "tactics-focus",
    ratingKey: "run:tactics-focus",
    name: "Tactics Focus",
    kind: "custom",
    mode: "custom",
    elo: 1040,
    durationSeconds: 600,
    perPuzzleSeconds: 30,
    themes: ["fork", "pin"]
  },
  {
    id: "endgame-sprint",
    ratingKey: "run:endgame-sprint",
    name: "Endgame Sprint",
    kind: "custom",
    mode: "custom",
    elo: 810,
    durationSeconds: 180,
    perPuzzleSeconds: 10,
    themes: ["endgame"]
  }
];

export function createRunManagementFixtureState(
  variant: "populated" | "empty" = "populated"
): RunManagementFixtureState {
  const runs = BASE_RUNS.map(cloneRun);
  return {
    draft: null,
    hiddenRuns: variant === "empty" ? runs : [],
    homeEditing: false,
    nameError: null,
    notice: null,
    removeCandidateId: null,
    runs: variant === "empty" ? [] : runs,
    screen: "home",
    selectedRunId: variant === "empty" ? null : "standard"
  };
}

export function runManagementFixtureReducer(
  state: RunManagementFixtureState,
  intent: PracticeRunManagementIntent
): RunManagementFixtureState {
  switch (intent.type) {
    case "add-run":
      return {
        ...state,
        draft: newRunDraft(),
        homeEditing: false,
        nameError: null,
        notice: null,
        removeCandidateId: null,
        screen: "create"
      };
    case "cancel-edit":
      return returnHome(state, state.screen === "edit");
    case "change-duration":
      return state.screen === "create"
        ? updateDraft(state, { durationSeconds: intent.durationSeconds })
        : state;
    case "change-elo":
      return updateDraft(state, { elo: Math.max(600, intent.elo) });
    case "change-mode":
      return state.screen === "create" ? updateDraft(state, { mode: intent.mode }) : state;
    case "change-name":
      return state.screen === "create"
        ? {
            ...updateDraft(state, { name: intent.name }),
            nameError: null
          }
        : state;
    case "change-per-puzzle":
      return state.screen === "create"
        ? updateDraft(state, { perPuzzleSeconds: intent.perPuzzleSeconds })
        : state;
    case "toggle-theme":
      return state.screen === "create"
        ? updateDraft(state, {
            themes: applyThemeChoiceIntent(
              state.draft?.themes ?? [ALL_THEME_SELECTION],
              { type: "toggle-theme", theme: intent.theme }
            )
          })
        : state;
    case "confirm-remove":
      return confirmRemoval(state);
    case "dismiss-remove":
      return { ...state, removeCandidateId: null };
    case "edit-run": {
      const run = state.runs.find((candidate) => candidate.id === intent.runId);
      if (!run) {
        return state;
      }
      return {
        ...state,
        draft: cloneRun(run),
        homeEditing: true,
        nameError: null,
        notice: null,
        removeCandidateId: null,
        screen: "edit"
      };
    }
    case "move-run":
      return moveRun(state, intent.runId, intent.targetRunId);
    case "prefill-previous-config":
      return state;
    case "remove-run":
      return state.runs.some((run) => run.id === intent.runId)
        ? { ...state, removeCandidateId: intent.runId, notice: null }
        : state;
    case "restore-run":
      return restoreRun(state, intent.runId);
    case "save-run":
      return saveRun(state);
    case "select-run":
      return state.runs.some((run) => run.id === intent.runId)
        ? { ...state, selectedRunId: intent.runId, notice: null }
        : state;
    case "start-selected-run": {
      const selected = state.runs.find((run) => run.id === state.selectedRunId);
      return selected
        ? { ...state, notice: `${selected.name} is ready. Starting a sprint is outside this design slice.` }
        : state;
    }
    case "toggle-home-edit":
      return {
        ...state,
        homeEditing: !state.homeEditing,
        notice: null,
        removeCandidateId: null
      };
  }
}

function newRunDraft(): PracticeRunDraft {
  return {
    name: "",
    kind: "custom",
    mode: "custom",
    elo: 900,
    durationSeconds: 300,
    perPuzzleSeconds: 20,
    themes: [ALL_THEME_SELECTION]
  };
}

function updateDraft(
  state: RunManagementFixtureState,
  patch: Partial<PracticeRunDraft>
): RunManagementFixtureState {
  return state.draft ? { ...state, draft: { ...state.draft, ...patch } } : state;
}

function returnHome(
  state: RunManagementFixtureState,
  homeEditing = false
): RunManagementFixtureState {
  return {
    ...state,
    draft: null,
    homeEditing,
    nameError: null,
    notice: null,
    removeCandidateId: null,
    screen: "home"
  };
}

function saveRun(state: RunManagementFixtureState): RunManagementFixtureState {
  const draft = state.draft;
  if (!draft) {
    return state;
  }
  const name = draft.name.trim();
  if (!name) {
    return { ...state, nameError: "Enter a name for this run." };
  }
  const normalizedName = name.toLocaleLowerCase("en-US");
  const nameTaken = [...state.runs, ...state.hiddenRuns].some(
    (run) => run.id !== draft.id && run.name.trim().toLocaleLowerCase("en-US") === normalizedName
  );
  if (nameTaken) {
    return { ...state, nameError: "That name is already in use. Choose a unique name." };
  }

  const saved: PracticeRunPresentation = {
    ...draft,
    id: draft.id ?? uniqueRunId(name, state),
    name
  };
  const existing = state.runs.some((run) => run.id === saved.id);
  const runs = existing
    ? state.runs.map((run) => run.id === saved.id ? saved : run)
    : [...state.runs, saved];
  return {
    ...state,
    draft: null,
    homeEditing: existing,
    nameError: null,
    notice: `${saved.name} ${existing ? "updated" : "added to Home"}.`,
    removeCandidateId: null,
    runs,
    screen: "home",
    selectedRunId: saved.id
  };
}

function uniqueRunId(name: string, state: RunManagementFixtureState): string {
  const base = name
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "custom-run";
  const ids = new Set([...state.runs, ...state.hiddenRuns].map((run) => run.id));
  let candidate = base;
  let suffix = 2;
  while (ids.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function confirmRemoval(state: RunManagementFixtureState): RunManagementFixtureState {
  const removed = state.runs.find((run) => run.id === state.removeCandidateId);
  if (!removed) {
    return { ...state, removeCandidateId: null };
  }
  const runs = state.runs.filter((run) => run.id !== removed.id);
  return {
    ...state,
    hiddenRuns: [...state.hiddenRuns, removed],
    notice: `${removed.name} removed from Home. Its ELO and history were kept.`,
    removeCandidateId: null,
    runs,
    selectedRunId: state.selectedRunId === removed.id ? runs[0]?.id ?? null : state.selectedRunId
  };
}

function restoreRun(state: RunManagementFixtureState, runId: string): RunManagementFixtureState {
  const restored = state.hiddenRuns.find((run) => run.id === runId);
  if (!restored) {
    return state;
  }
  return {
    ...state,
    hiddenRuns: state.hiddenRuns.filter((run) => run.id !== runId),
    notice: `${restored.name} restored with ELO ${restored.elo}.`,
    runs: [...state.runs, restored],
    selectedRunId: state.selectedRunId ?? restored.id
  };
}

function moveRun(
  state: RunManagementFixtureState,
  runId: string,
  targetRunId: string
): RunManagementFixtureState {
  const from = state.runs.findIndex((run) => run.id === runId);
  const to = state.runs.findIndex((run) => run.id === targetRunId);
  if (from < 0 || to < 0 || to >= state.runs.length) {
    return state;
  }
  const runs = [...state.runs];
  const [moved] = runs.splice(from, 1);
  if (!moved) {
    return state;
  }
  runs.splice(to, 0, moved);
  return {
    ...state,
    notice: null,
    runs
  };
}

function cloneRun(run: PracticeRunPresentation): PracticeRunPresentation {
  return { ...run, themes: [...run.themes] };
}
