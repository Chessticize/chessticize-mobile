import type { PracticeService } from '../../../../packages/storage/src/practice-service.ts';
import type { ICloudProgressSyncClient } from '../platform/iCloudProgressSync.ts';
import type { ICloudSyncDiagnosticsClient } from '../platform/iCloudSyncDiagnostics.ts';
import {
  configureMobilePracticePuzzleSource,
  createMobilePracticeService,
  type MobilePuzzleSource,
} from '../platform/mobilePractice.ts';
import {
  MOBILE_APPLICATION_METADATA_LINKS,
  type MobileApplicationMetadata,
  type MobilePlatformCapabilities,
  type MobileProgressProtectionCapabilities,
  type MobileStockfishCapabilities,
} from '../platform/mobilePlatformCapabilities.ts';
import type {
  ReviewReminderNotificationClient,
  ReviewReminderScheduler,
} from '../platform/reviewReminderScheduler.ts';
import type { MoveFeedbackClient } from '../platform/moveFeedback.ts';
import type { AppStoreReviewRequestClient } from '../platform/appStoreReviewRequest.ts';

export interface TestMobilePlatformCapabilityOverrides {
  practiceService?: PracticeService;
  practiceServiceFactory?: () => PracticeService;
  configurePuzzleSource?: (
    service: PracticeService,
    source: MobilePuzzleSource,
  ) => void;
  stockfish?: Partial<MobileStockfishCapabilities>;
  reviewReminderScheduler?: ReviewReminderScheduler | null;
  reviewReminderNotificationClient?: ReviewReminderNotificationClient | null;
  reminderPlatform?: MobilePlatformCapabilities['reminders']['platform'];
  iCloudProgressSyncClient?: ICloudProgressSyncClient | null;
  iCloudSyncDiagnosticsClient?: ICloudSyncDiagnosticsClient | null;
  progressProtection?: MobileProgressProtectionCapabilities;
  applicationMetadata?: Partial<MobileApplicationMetadata>;
  moveFeedbackClient?: MoveFeedbackClient | null;
  appStoreReviewRequestClient?: AppStoreReviewRequestClient | null;
}

export function createTestMobilePlatformCapabilities(
  overrides: TestMobilePlatformCapabilityOverrides = {},
): MobilePlatformCapabilities {
  const service =
    overrides.practiceService ??
    overrides.practiceServiceFactory?.() ??
    createMobilePracticeService();
  const configurePuzzleSource =
    overrides.configurePuzzleSource ?? configureMobilePracticePuzzleSource;
  const supportsPuzzleSourceConfiguration =
    overrides.practiceService === undefined ||
    overrides.configurePuzzleSource !== undefined;

  return {
    storage: {
      practiceService: service,
      ...(supportsPuzzleSourceConfiguration
        ? { configurePuzzleSource: source => configurePuzzleSource(service, source) }
        : {}),
    },
    progressProtection: overrides.progressProtection ?? { kind: 'icloud_sync' },
    progressSync: {
      client: overrides.iCloudProgressSyncClient ?? null,
      diagnostics: overrides.iCloudSyncDiagnosticsClient ?? null,
    },
    stockfish: {
      createTransport: overrides.stockfish?.createTransport ?? (() => null),
      prewarm: overrides.stockfish?.prewarm ?? (() => Promise.resolve(false)),
    },
    reminders: {
      platform: overrides.reminderPlatform ?? 'ios',
      scheduler: overrides.reviewReminderScheduler ?? null,
      notificationClient: overrides.reviewReminderNotificationClient ?? null,
    },
    moveFeedback: {
      client: overrides.moveFeedbackClient ?? null,
    },
    appReview: {
      client: overrides.appStoreReviewRequestClient ?? null,
    },
    applicationMetadata: {
      ...MOBILE_APPLICATION_METADATA_LINKS,
      versionName: 'test-version',
      buildNumber: 'test-build',
      ...overrides.applicationMetadata,
    },
  };
}
