import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  createPracticeRunManagementController,
  type PracticeRunManagementIntent
} from "../../../../packages/core/src/index.ts";
import type { PracticeService } from "../../../../packages/storage/src/practice-service.ts";
import type {
  PracticeRunManagementPresentation
} from "./practiceRunPresentation.ts";
import { createPracticeRunManagementAdapter } from "./practiceRunManagementAdapter.ts";

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
  const controller = useMemo(
    () => createPracticeRunManagementController(createPracticeRunManagementAdapter(service)),
    [service]
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );
  const onIntent = useCallback((intent: PracticeRunManagementIntent): void => {
    const effect = controller.dispatch(intent);
    if (effect?.type === "start-run") {
      onStartRun(effect.runId);
    }
  }, [controller, onStartRun]);
  const presentation = useMemo<PracticeRunManagementPresentation | undefined>(
    () => enabled ? { ...snapshot, onIntent } : undefined,
    [enabled, onIntent, snapshot]
  );

  return {
    presentation,
    refresh: controller.refresh
  };
}
