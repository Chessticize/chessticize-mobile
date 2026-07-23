import {
  ALL_THEME_SELECTION,
  namedThemesForSelection,
  type PracticeRunManagementAdapter,
  type PracticeRunManagementCatalog,
  type PracticeRunManagementDraft,
  type PracticeRunManagementRun,
  type PracticeRunRecord
} from "../../../../packages/core/src/index.ts";
import type {
  CreatePracticeRunCommand,
  PracticeService
} from "../../../../packages/storage/src/practice-service.ts";

export function createPracticeRunManagementAdapter(
  service: PracticeService
): PracticeRunManagementAdapter {
  const read = (): PracticeRunManagementCatalog => readCatalog(service);
  return {
    canCreate: (draft) => service.canCreatePracticeRun(createPracticeRunCommand(draft)),
    execute: (command) => {
      let changedRunId: string;
      switch (command.type) {
        case "archive-run":
          service.archivePracticeRun(command.runId);
          changedRunId = command.runId;
          break;
        case "create-run": {
          const run = service.createPracticeRun(createPracticeRunCommand(command.draft));
          changedRunId = run.id;
          break;
        }
        case "reorder-run":
          service.reorderPracticeRun(command.runId, command.targetRunId);
          changedRunId = command.runId;
          break;
        case "restore-run":
          service.restorePracticeRun(command.runId);
          changedRunId = command.runId;
          break;
        case "update-run": {
          const saved = service.updatePracticeRun(command.runId, {
            name: command.name,
            rating: command.elo
          });
          changedRunId = saved.run.id;
          break;
        }
      }
      return { catalog: read(), changedRunId };
    },
    read
  };
}

function readCatalog(service: PracticeService): PracticeRunManagementCatalog {
  const catalog = service.listPracticeRuns();
  return {
    hiddenRuns: catalog
      .filter((run) => run.archived)
      .map((run) => presentationForRun(service, run)),
    previousConfigs: service.listCustomSprintConfigs().map((config) => ({
      config,
      rating: service.getRating(config.ratingKey).rating
    })),
    runs: catalog
      .filter((run) => !run.archived)
      .map((run) => presentationForRun(service, run))
  };
}

function presentationForRun(
  service: PracticeService,
  run: PracticeRunRecord
): PracticeRunManagementRun {
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

function createPracticeRunCommand(
  draft: PracticeRunManagementDraft
): CreatePracticeRunCommand {
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
