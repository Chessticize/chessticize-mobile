import type { PracticeService } from '../../../../packages/storage/src/practice-service.ts';
import type { ICloudProgressSyncClient } from '../backend/iCloudProgressSync.ts';
import {
  configureMobilePracticePuzzleSource,
  createMobilePracticeService,
  type MobilePuzzleSource,
} from '../backend/mobilePractice.ts';
import {
  MOBILE_APPLICATION_METADATA,
  type MobileApplicationMetadata,
  type MobilePlatformCapabilities,
  type MobileProgressProtectionCapabilities,
  type MobileStockfishCapabilities,
} from '../backend/mobilePlatformCapabilities.ts';
import type {
  ReviewReminderNotificationClient,
  ReviewReminderScheduler,
} from '../backend/reviewReminderScheduler.ts';

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
  iCloudProgressSyncClient?: ICloudProgressSyncClient | null;
  progressProtection?: MobileProgressProtectionCapabilities;
  applicationMetadata?: Partial<MobileApplicationMetadata>;
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
    },
    stockfish: {
      createTransport: overrides.stockfish?.createTransport ?? (() => null),
      prewarm: overrides.stockfish?.prewarm ?? (() => Promise.resolve(false)),
    },
    reminders: {
      scheduler: overrides.reviewReminderScheduler ?? null,
      notificationClient: overrides.reviewReminderNotificationClient ?? null,
    },
    applicationMetadata: {
      ...MOBILE_APPLICATION_METADATA,
      ...overrides.applicationMetadata,
    },
  };
}
