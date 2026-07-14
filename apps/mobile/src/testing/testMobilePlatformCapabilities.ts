import type { UciEngineTransport } from '../../../../packages/core/src/index.ts';
import type { PracticeService } from '../../../../packages/storage/src/practice-service.ts';
import type { ICloudProgressSyncClient } from '../backend/iCloudProgressSync.ts';
import {
  configureMobilePracticePuzzleSource,
  createMobilePracticeService,
  type MobilePuzzleSource,
} from '../backend/mobilePractice.ts';
import type {
  MobileApplicationMetadata,
  MobilePlatformCapabilities,
} from '../backend/mobilePlatformCapabilities.ts';
import type {
  ReviewReminderNotificationClient,
  ReviewReminderScheduler,
} from '../backend/reviewReminderScheduler.ts';

const TEST_SOURCE_REPOSITORY_URL =
  'https://github.com/Chessticize/chessticize-mobile';

export const TEST_APPLICATION_METADATA: MobileApplicationMetadata = {
  versionName: '1.0.0',
  sourceLicenseUrl: `${TEST_SOURCE_REPOSITORY_URL}/blob/main/LICENSE`,
  sourceRepositoryUrl: TEST_SOURCE_REPOSITORY_URL,
  stockfishSourceUrl: `${TEST_SOURCE_REPOSITORY_URL}/tree/main/apps/mobile/ios/StockfishEngine`,
  supportEmail: 'support@chessticize.com',
  supportEmailUrl: 'mailto:support@chessticize.com',
};

export interface TestMobilePlatformCapabilityOverrides {
  practiceService?: PracticeService;
  practiceServiceFactory?: () => PracticeService;
  configurePuzzleSource?: (
    service: PracticeService,
    source: MobilePuzzleSource,
  ) => void;
  stockfishTransportFactory?: () => UciEngineTransport | null;
  prewarmStockfish?: () => Promise<boolean>;
  reviewReminderScheduler?: ReviewReminderScheduler | null;
  reviewReminderNotificationClient?: ReviewReminderNotificationClient | null;
  iCloudProgressSyncClient?: ICloudProgressSyncClient | null;
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
      configurePuzzleSource: supportsPuzzleSourceConfiguration
        ? source => configurePuzzleSource(service, source)
        : undefined,
    },
    progressSync: {
      client: overrides.iCloudProgressSyncClient ?? null,
    },
    stockfish: {
      createTransport: overrides.stockfishTransportFactory ?? (() => null),
      prewarm: overrides.prewarmStockfish ?? (() => Promise.resolve(false)),
    },
    reminders: {
      scheduler: overrides.reviewReminderScheduler ?? null,
      notificationClient: overrides.reviewReminderNotificationClient ?? null,
    },
    applicationMetadata: {
      ...TEST_APPLICATION_METADATA,
      ...overrides.applicationMetadata,
    },
  };
}
