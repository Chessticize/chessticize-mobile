import { useCallback, useEffect, useState } from "react";
import {
  decideLaunchGuideOnLaunch,
  defaultOnboardingGuideProgress,
  whatsNewVersionToRecord,
  type LaunchGuideSurface
} from "../../../../packages/core/src/index.ts";
import type { PracticeService } from "../../../../packages/storage/src/practice-service.ts";
import {
  ONBOARDING_MIN_VERSION,
  WHATS_NEW_RELEASE_VERSION,
  welcomeOnboardingContentFor,
  whatsNewContentFor,
  type WelcomeOnboardingContent,
  type WhatsNewContent,
  type WhatsNewPlatform
} from "./whatsNewContent.ts";
import { useTranslation } from "../i18n/index.ts";

// Wires the What's New & Welcome Onboarding launch decisions (packages/core) to
// the screen. The launch decision is made once, from stored state, on mount:
//
// - Upgrading users (1.x -> 2.0) see What's New once idle on Practice Home.
// - Brand-new 2.0 installs see Welcome Onboarding once idle on Practice Home.
// - Finishing or skipping records the seen state so neither repeats on relaunch.
// - `open` reopens What's New from Settings/Dev without changing recorded state.

/** Dev-only simulation of an update from the prior 1.x release. */
const SIMULATED_PREVIOUS_VERSION = "1.7.0";
const SIMULATED_APP_VERSION = WHATS_NEW_RELEASE_VERSION;

export interface WhatsNewControls {
  content: WhatsNewContent;
  visible: boolean;
  /** Show the What's New sheet now (Settings row and Dev control). */
  open: () => void;
  /** Finish What's New: hide it and, after an update, record the release as seen. */
  dismiss: () => void;
  /** Dev only: act as if this launch followed an update from the previous release. */
  simulateUpdate: () => void;
  onboardingContent: WelcomeOnboardingContent;
  onboardingVisible: boolean;
  /** Show the Welcome Onboarding sheet on demand (Dev control / replay). */
  openOnboarding: () => void;
  /** Finish or skip Welcome Onboarding and record it as seen. */
  dismissOnboarding: () => void;
  /** Dev only: simulate a brand-new 2.0 install launch. */
  simulateFreshInstall: () => void;
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
  const { locale } = useTranslation();
  const [effectiveAppVersion, setEffectiveAppVersion] = useState(appVersion);
  const [launchDecision] = useState(() => decideForLaunch(service, appVersion));
  const [pendingSurface, setPendingSurface] = useState<LaunchGuideSurface>(
    launchDecision.surface
  );
  const [requestedWhatsNew, setRequestedWhatsNew] = useState(false);
  const [requestedOnboarding, setRequestedOnboarding] = useState(false);

  useEffect(() => {
    if (launchDecision.recordSeenVersion !== undefined) {
      recordSeenVersion(service, launchDecision.recordSeenVersion);
    }
  }, [launchDecision.recordSeenVersion, service]);

  const open = useCallback(() => {
    setRequestedOnboarding(false);
    setRequestedWhatsNew(true);
  }, []);

  const dismiss = useCallback(() => {
    setRequestedWhatsNew(false);
    if (pendingSurface === "whats_new") {
      setPendingSurface("none");
      recordSeenVersion(
        service,
        whatsNewVersionToRecord(WHATS_NEW_RELEASE_VERSION, effectiveAppVersion)
      );
    }
  }, [effectiveAppVersion, pendingSurface, service]);

  const openOnboarding = useCallback(() => {
    setRequestedWhatsNew(false);
    setRequestedOnboarding(true);
  }, []);

  const dismissOnboarding = useCallback(() => {
    setRequestedOnboarding(false);
    const settings = service.getSettings();
    const currentOnboarding = settings.onboarding ?? defaultOnboardingGuideProgress();
    const shouldRecordSeenVersion =
      pendingSurface === "welcome_onboarding" || settings.whatsNewSeenVersion === undefined;
    if (pendingSurface === "welcome_onboarding") {
      setPendingSurface("none");
    }
    service.saveSettings({
      ...settings,
      ...(shouldRecordSeenVersion
        ? {
            whatsNewSeenVersion: whatsNewVersionToRecord(
              WHATS_NEW_RELEASE_VERSION,
              effectiveAppVersion
            )
          }
        : {}),
      onboarding: {
        ...currentOnboarding,
        welcomeSeen: true
      }
    });
  }, [effectiveAppVersion, pendingSurface, service]);

  const simulateUpdate = useCallback(() => {
    setRequestedOnboarding(false);
    setRequestedWhatsNew(false);
    recordSeenVersion(service, SIMULATED_PREVIOUS_VERSION);
    setEffectiveAppVersion(SIMULATED_APP_VERSION);
    setPendingSurface(decideForLaunch(service, SIMULATED_APP_VERSION).surface);
  }, [service]);

  const simulateFreshInstall = useCallback(() => {
    setRequestedWhatsNew(false);
    const nextSettings = {
      ...service.getSettings(),
      onboarding: defaultOnboardingGuideProgress()
    };
    delete nextSettings.whatsNewSeenVersion;
    service.saveSettings(nextSettings);
    setEffectiveAppVersion(SIMULATED_APP_VERSION);
    setPendingSurface("welcome_onboarding");
    setRequestedOnboarding(true);
  }, [service]);

  const whatsNewVisible =
    requestedWhatsNew || (pendingSurface === "whats_new" && presentable);
  const onboardingVisible =
    !whatsNewVisible &&
    (requestedOnboarding || (pendingSurface === "welcome_onboarding" && presentable));

  return {
    content: whatsNewContentFor(platform, locale),
    visible: whatsNewVisible,
    open,
    dismiss,
    simulateUpdate,
    onboardingContent: welcomeOnboardingContentFor(locale),
    onboardingVisible,
    openOnboarding,
    dismissOnboarding,
    simulateFreshInstall
  };
}

function decideForLaunch(service: PracticeService, appVersion: string) {
  const settings = service.getSettings();
  const hasLinkedOrImportedGames =
    service.listLinkedAccounts().length > 0 ||
    service.listImportedGames({ limit: 1 }).length > 0;
  return decideLaunchGuideOnLaunch({
    releaseVersion: WHATS_NEW_RELEASE_VERSION,
    onboardingMinVersion: ONBOARDING_MIN_VERSION,
    appVersion,
    lastSeenVersion: settings.whatsNewSeenVersion,
    hasExistingProgress: service.hasPracticeActivity(),
    hasLinkedOrImportedGames,
    welcomeSeen: settings.onboarding?.welcomeSeen ?? false
  });
}

function recordSeenVersion(service: PracticeService, version: string): void {
  service.saveSettings({ ...service.getSettings(), whatsNewSeenVersion: version });
}
