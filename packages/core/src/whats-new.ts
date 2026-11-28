// Decides when the in-app What's New notes appear. Pure and platform free: the
// caller supplies the running app version, the stored last-seen version and
// whether the device already holds practice progress.

export type ReleaseVersion = readonly [major: number, minor: number, patch: number];

/**
 * Reads the leading `major.minor.patch` of a release version such as `1.6.0` or
 * `1.6.0-dev`. A missing patch counts as zero. Anything else is unparsable.
 */
export function parseReleaseVersion(value: string | undefined): ReleaseVersion | undefined {
  if (value === undefined) {
    return undefined;
  }
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?(?![\d.])/.exec(value.trim());
  if (!match) {
    return undefined;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

/** Negative when `left` is older than `right`, zero when equal, positive when newer. */
export function compareReleaseVersions(left: ReleaseVersion, right: ReleaseVersion): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = left[index]! - right[index]!;
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

export interface WhatsNewLaunchInput {
  /** The release the notes describe, such as `1.6.0`. */
  releaseVersion: string;
  /** The running app version. */
  appVersion: string;
  /** The version whose notes were last seen, or absent when none was ever recorded. */
  lastSeenVersion?: string | undefined;
  /** Whether the device already holds attempts or rated practice. */
  hasExistingProgress: boolean;
}

export interface WhatsNewLaunchDecision {
  /** Show the notes once the user is idle on the Practice home. */
  show: boolean;
  /**
   * Store this as the last-seen version right away. Set for a fresh install,
   * which never sees the notes and must not mistake itself for an upgrade later.
   */
  recordSeenVersion?: string;
}

const NO_DECISION: WhatsNewLaunchDecision = { show: false };

/**
 * Decides once per launch whether the notes are due.
 *
 * - Running a version older than the release, or an unreadable one: nothing.
 * - Last seen at or after the release: nothing, the notes were already shown.
 * - Last seen before the release: show, this is the first launch after an update.
 * - Nothing recorded and no progress: a fresh install, which gets first-use
 *   guidance instead. Record the running version so a later update is detected.
 * - Nothing recorded but progress exists: an update from a release that did not
 *   record the version. Show.
 */
export function decideWhatsNewOnLaunch(input: WhatsNewLaunchInput): WhatsNewLaunchDecision {
  const release = parseReleaseVersion(input.releaseVersion);
  const app = parseReleaseVersion(input.appVersion);
  if (!release || !app || compareReleaseVersions(app, release) < 0) {
    return NO_DECISION;
  }
  const lastSeenText = input.lastSeenVersion;
  const lastSeen = parseReleaseVersion(lastSeenText);
  if (lastSeen) {
    return { show: compareReleaseVersions(lastSeen, release) < 0 };
  }
  if (lastSeenText === undefined && !input.hasExistingProgress) {
    return { show: false, recordSeenVersion: input.appVersion.trim() };
  }
  return { show: true };
}

/** What to store when the user finishes the notes: the newer of the running app and the release. */
export function whatsNewVersionToRecord(releaseVersion: string, appVersion: string): string {
  const release = parseReleaseVersion(releaseVersion);
  const app = parseReleaseVersion(appVersion);
  if (!release || (app && compareReleaseVersions(app, release) >= 0)) {
    return appVersion.trim();
  }
  return releaseVersion;
}

export interface WhatsNewPresentationContext {
  /** The Practice tab is selected. */
  practiceTabSelected: boolean;
  /** A Run is on screen, active or paused. */
  openRun: boolean;
  /** A paused Run is offered for resuming on the Practice home. */
  resumableRun: boolean;
  /** Another first-run surface owns the screen: a guide, a loading Run or a flow. */
  otherSurfaceActive: boolean;
}

/** The notes wait for an idle Practice home and never interrupt a Run. */
export function canPresentWhatsNew(context: WhatsNewPresentationContext): boolean {
  return context.practiceTabSelected
    && !context.openRun
    && !context.resumableRun
    && !context.otherSurfaceActive;
}

export interface OnboardingGuideProgress {
  /** Whether the user has completed or skipped the first-launch Welcome Onboarding. */
  welcomeSeen: boolean;
  /** Whether the user has dismissed the Games Hub first-use tip. */
  gamesGuideSeen: boolean;
  /** Whether the user has dismissed the Game Review first-use tip. */
  gameReviewGuideSeen: boolean;
}

export function defaultOnboardingGuideProgress(): OnboardingGuideProgress {
  return {
    welcomeSeen: false,
    gamesGuideSeen: false,
    gameReviewGuideSeen: false
  };
}

/**
 * Re-arms contextual in-app 2.0 guides (Games Hub & Game Review) when the user
 * chooses "Reset guides" in Settings, without forcing an existing user back
 * through the fresh-install Welcome Onboarding sheet.
 */
export function resetContextualOnboardingGuides(
  progress: OnboardingGuideProgress
): OnboardingGuideProgress {
  return {
    ...progress,
    gamesGuideSeen: false,
    gameReviewGuideSeen: false
  };
}

export type LaunchGuideSurface = "none" | "whats_new" | "welcome_onboarding";

export interface LaunchGuideInput {
  /** The release the What's New notes describe (for example `2.0.0`). */
  releaseVersion: string;
  /** The first release version that offers the Welcome Onboarding flow (for example `2.0.0`). */
  onboardingMinVersion: string;
  /** The running app version. */
  appVersion: string;
  /** The version whose What's New notes were last seen, or absent when never recorded. */
  lastSeenVersion?: string | undefined;
  /** Whether the device already holds attempts, rated practice, or dismissed Sprint guides. */
  hasExistingProgress: boolean;
  /** Whether the device already has linked chess accounts or imported games. */
  hasLinkedOrImportedGames?: boolean;
  /** Whether the user already completed or skipped Welcome Onboarding on this device. */
  welcomeSeen: boolean;
}

export interface LaunchGuideDecision {
  surface: LaunchGuideSurface;
  /**
   * Store this as the last-seen What's New version right away when no modal is
   * shown, so future updates can still distinguish an update from a fresh install.
   */
  recordSeenVersion?: string;
}

const NO_LAUNCH_GUIDE: LaunchGuideDecision = { surface: "none" };

/**
 * Decides once per launch whether to present What's New (upgrading users),
 * Welcome Onboarding (fresh 2.0+ installs), or nothing.
 */
export function decideLaunchGuideOnLaunch(input: LaunchGuideInput): LaunchGuideDecision {
  const app = parseReleaseVersion(input.appVersion);
  if (!app) {
    return NO_LAUNCH_GUIDE;
  }
  const hasHistory = input.hasExistingProgress || input.hasLinkedOrImportedGames === true;
  const whatsNew = decideWhatsNewOnLaunch({
    releaseVersion: input.releaseVersion,
    appVersion: input.appVersion,
    lastSeenVersion: input.lastSeenVersion,
    hasExistingProgress: hasHistory
  });
  if (whatsNew.show) {
    return { surface: "whats_new" };
  }
  const onboardingMin = parseReleaseVersion(input.onboardingMinVersion);
  if (
    input.lastSeenVersion === undefined &&
    !hasHistory &&
    !input.welcomeSeen &&
    onboardingMin !== undefined &&
    compareReleaseVersions(app, onboardingMin) >= 0
  ) {
    return { surface: "welcome_onboarding" };
  }
  if (whatsNew.recordSeenVersion !== undefined) {
    return { surface: "none", recordSeenVersion: whatsNew.recordSeenVersion };
  }
  return NO_LAUNCH_GUIDE;
}
