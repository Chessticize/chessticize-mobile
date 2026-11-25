import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  createPracticeRunManagementController,
  OPPONENT_REPLY_MAX_SECONDS,
  PRACTICE_RUN_RATING_MAX,
  PRACTICE_RUN_RATING_MIN,
  type PracticeRunManagementIntent,
  type PracticeRunManagementMessages
} from "../../../../packages/core/src/index.ts";
import type { PracticeService } from "../../../../packages/storage/src/practice-service.ts";
import type {
  PracticeRunManagementPresentation
} from "./practiceRunPresentation.ts";
import { createPracticeRunManagementAdapter } from "./practiceRunManagementAdapter.ts";
import { getActiveLocale, translate } from "../i18n/index.ts";

const LOCALIZED_PRACTICE_RUN_MESSAGES: PracticeRunManagementMessages = {
  eloError: () =>
    translate(getActiveLocale(), "practiceHome.runErrorElo", {
      min: PRACTICE_RUN_RATING_MIN,
      max: PRACTICE_RUN_RATING_MAX
    }),
  opponentReplySecondsError: () =>
    translate(getActiveLocale(), "practiceHome.runErrorOpponentReplySeconds", {
      max: OPPONENT_REPLY_MAX_SECONDS
    }),
  nameError: (code, maxLength) => {
    const locale = getActiveLocale();
    if (code === "required") {
      return translate(locale, "practiceHome.runErrorNameRequired");
    }
    if (code === "too_long") {
      return translate(locale, "practiceHome.runErrorNameTooLong", { max: maxLength });
    }
    return translate(locale, "practiceHome.runErrorNameDuplicate");
  },
  runAdded: (name) => translate(getActiveLocale(), "practiceHome.runNoticeAdded", { name }),
  runUpdated: (name) => translate(getActiveLocale(), "practiceHome.runNoticeUpdated", { name }),
  runRemoved: (name) => translate(getActiveLocale(), "practiceHome.runNoticeRemoved", { name }),
  runRestored: (name, elo) =>
    translate(getActiveLocale(), "practiceHome.runNoticeRestored", { name, elo })
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
  const controller = useMemo(
    () =>
      createPracticeRunManagementController(
        createPracticeRunManagementAdapter(service),
        LOCALIZED_PRACTICE_RUN_MESSAGES
      ),
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
