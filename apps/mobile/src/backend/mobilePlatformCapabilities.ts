import type { UciEngineTransport } from '../../../../packages/core/src/index.ts';
import type { PracticeService } from '../../../../packages/storage/src/practice-service.ts';
import type { ICloudProgressSyncClient } from './iCloudProgressSync.ts';
import type { MobilePuzzleSource } from './mobilePractice.ts';
import type {
  ReviewReminderNotificationClient,
  ReviewReminderScheduler,
} from './reviewReminderScheduler.ts';

export interface MobileStorageCapabilities {
  practiceService: PracticeService;
  configurePuzzleSource?: (source: MobilePuzzleSource) => void;
}

export interface MobileProgressSyncCapabilities {
  client: ICloudProgressSyncClient | null;
}

export interface MobileStockfishCapabilities {
  createTransport: () => UciEngineTransport | null;
  prewarm: () => Promise<boolean>;
}

export interface MobileReminderCapabilities {
  scheduler: ReviewReminderScheduler | null;
  notificationClient: ReviewReminderNotificationClient | null;
}

export interface MobileApplicationMetadata {
  versionName: string;
  buildNumber?: string;
  sourceLicenseUrl: string;
  sourceRepositoryUrl: string;
  stockfishSourceUrl: string;
  supportEmail: string;
  supportEmailUrl: string;
}

const SOURCE_REPOSITORY_URL =
  'https://github.com/Chessticize/chessticize-mobile';
const SUPPORT_EMAIL = 'support@chessticize.com';

export const MOBILE_APPLICATION_METADATA: MobileApplicationMetadata = {
  versionName: '1.0.0',
  sourceLicenseUrl: `${SOURCE_REPOSITORY_URL}/blob/main/LICENSE`,
  sourceRepositoryUrl: SOURCE_REPOSITORY_URL,
  stockfishSourceUrl: `${SOURCE_REPOSITORY_URL}/tree/main/apps/mobile/native/stockfish`,
  supportEmail: SUPPORT_EMAIL,
  supportEmailUrl: `mailto:${SUPPORT_EMAIL}`,
};

export interface MobilePlatformCapabilities {
  storage: MobileStorageCapabilities;
  progressSync: MobileProgressSyncCapabilities;
  stockfish: MobileStockfishCapabilities;
  reminders: MobileReminderCapabilities;
  applicationMetadata: MobileApplicationMetadata;
}
