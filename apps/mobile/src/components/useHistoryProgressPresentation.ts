import { useEffect, useMemo, useRef, useState } from "react";
import type {
  PracticeService
} from "../../../../packages/storage/src/practice-service.ts";
import type {
  TacticalProfileProgress
} from "../../../../packages/storage/src/tactical-profile-service.ts";
import {
  historyProgressPresentationFromModel
} from "./historyProgressModelPresentation.ts";
import type {
  HistoryProgressPresentation
} from "./historyProgressPresentation.ts";

export function useHistoryProgressPresentation(input: {
  enabled: boolean;
  service: PracticeService;
  injectedPresentation?: HistoryProgressPresentation;
  refreshKey?: unknown;
}): HistoryProgressPresentation | undefined {
  const { injectedPresentation, service } = input;
  const [progress, setProgress] = useState<TacticalProfileProgress | undefined>();
  const failedRetryCount = useRef(0);

  useEffect(() => {
    if (injectedPresentation || !input.enabled) {
      return;
    }
    setProgress(service.getTacticalProfileProgress());
  }, [injectedPresentation, input.enabled, input.refreshKey, service]);

  useEffect(() => {
    if (
      injectedPresentation ||
      !input.enabled ||
      progress?.phase !== "building"
    ) {
      failedRetryCount.current = 0;
      return;
    }
    const failed = progress.buildStatus === "failed";
    const retryDelayMs = failed
      ? Math.min(30_000, 1_000 * 2 ** failedRetryCount.current)
      : 25;
    failedRetryCount.current = failed
      ? failedRetryCount.current + 1
      : 0;
    const refreshTimer = setTimeout(() => {
      setProgress(service.getTacticalProfileProgress());
    }, retryDelayMs);
    return () => clearTimeout(refreshTimer);
  }, [injectedPresentation, input.enabled, progress, service]);

  return useMemo(() => {
    if (injectedPresentation) {
      return injectedPresentation;
    }
    if (!input.enabled) {
      return undefined;
    }
    return progress
      ? historyProgressPresentationFromModel(progress)
      : undefined;
  }, [injectedPresentation, input.enabled, progress]);
}
