import { useCallback, useEffect, useState } from "react";
import {
  decideWhatsNewOnLaunch,
  whatsNewVersionToRecord
} from "../../../../packages/core/src/index.ts";
import type { PracticeService } from "../../../../packages/storage/src/practice-service.ts";
import {
  WHATS_NEW_RELEASE_VERSION,
  whatsNewContentFor,
  type WhatsNewContent,
  type WhatsNewPlatform
} from "./whatsNewContent.ts";

// Wires the What's New decision (packages/core) to the screen. The launch
// decision is made once, from stored state, when the screen mounts:
//
// - After an update the notes are pending and appear only while `presentable`
//   (an idle Practice home), so they never interrupt a Run.
// - A fresh install records the running version at once and never sees them.
// - Finishing the notes records the version, so they show once per release.
// - `open` shows them on request (Settings) without changing what is recorded.

/** Dev-only simulation of an update: what the last-seen version and the running app become. */
const SIMULATED_PREVIOUS_VERSION = "1.5.3";
const SIMULATED_APP_VERSION = WHATS_NEW_RELEASE_VERSION;

export interface WhatsNewControls {
  content: WhatsNewContent;
  visible: boolean;
  /** Show the notes now, for the Settings row and the Dev control. */
  open: () => void;
  /** Finish the notes: hide them and, after an update, record the release as seen. */
  dismiss: () => void;
  /** Dev only: act as if this launch followed an update from the previous release. */
  simulateUpdate: () => void;
}

export function useWhatsNew({
  appVersion,
  platform,
  presentable,
  service
}: {
  appVersion: string;
  platform: WhatsNewPlatform;
  /** True only on an idle Practice home. */
  presentable: boolean;
  service: PracticeService;
}): WhatsNewControls {
  const [effectiveAppVersion, setEffectiveAppVersion] = useState(appVersion);
  const [launchDecision] = useState(() => decideForLaunch(service, appVersion));
  const [pending, setPending] = useState(launchDecision.show);
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    if (launchDecision.recordSeenVersion !== undefined) {
      recordSeenVersion(service, launchDecision.recordSeenVersion);
    }
  }, [launchDecision.recordSeenVersion, service]);

  const open = useCallback(() => setRequested(true), []);

  const dismiss = useCallback(() => {
    setRequested(false);
    if (pending) {
      setPending(false);
      recordSeenVersion(
        service,
        whatsNewVersionToRecord(WHATS_NEW_RELEASE_VERSION, effectiveAppVersion)
      );
    }
  }, [effectiveAppVersion, pending, service]);

  const simulateUpdate = useCallback(() => {
    recordSeenVersion(service, SIMULATED_PREVIOUS_VERSION);
    setEffectiveAppVersion(SIMULATED_APP_VERSION);
    setPending(decideForLaunch(service, SIMULATED_APP_VERSION).show);
  }, [service]);

  return {
    content: whatsNewContentFor(platform),
    visible: requested || (pending && presentable),
    open,
    dismiss,
    simulateUpdate
  };
}

function decideForLaunch(service: PracticeService, appVersion: string) {
  return decideWhatsNewOnLaunch({
    releaseVersion: WHATS_NEW_RELEASE_VERSION,
    appVersion,
    lastSeenVersion: service.getSettings().whatsNewSeenVersion,
    hasExistingProgress: hasExistingProgress(service)
  });
}

// Attempts or a rated Run mean the user has practiced here before. Only the
// presence of progress is read, so this stays cheap on a long history.
function hasExistingProgress(service: PracticeService): boolean {
  return service.countHistory() > 0 || service.listPlayedRatings().length > 0;
}

function recordSeenVersion(service: PracticeService, version: string): void {
  service.saveSettings({ ...service.getSettings(), whatsNewSeenVersion: version });
}
