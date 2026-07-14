import type { PracticeService } from '../../../../packages/storage/src/practice-service.ts';
import { createNativeICloudProgressSyncClient } from './iCloudProgressSync.ts';
import {
  configureMobilePracticePuzzleSource,
  createPersistentMobilePracticeService,
  createPersistentMobilePracticeServiceSync,
} from './mobilePractice.ts';
import type {
  MobileApplicationMetadata,
  MobilePlatformCapabilities,
} from './mobilePlatformCapabilities.ts';
import {
  createNativeStockfishTransport,
  prewarmNativeStockfishTransport,
} from './nativeStockfishTransport.ts';
import {
  createNativeReviewReminderNotificationClient,
  createNativeReviewReminderScheduler,
} from './reviewReminderScheduler.ts';

const SOURCE_REPOSITORY_URL =
  'https://github.com/Chessticize/chessticize-mobile';
const SUPPORT_EMAIL = 'support@chessticize.com';

export const IOS_APPLICATION_METADATA: MobileApplicationMetadata = {
  versionName: '1.0.0',
  sourceLicenseUrl: `${SOURCE_REPOSITORY_URL}/blob/main/LICENSE`,
  sourceRepositoryUrl: SOURCE_REPOSITORY_URL,
  stockfishSourceUrl: `${SOURCE_REPOSITORY_URL}/tree/main/apps/mobile/ios/StockfishEngine`,
  supportEmail: SUPPORT_EMAIL,
  supportEmailUrl: `mailto:${SUPPORT_EMAIL}`,
};

export function createIOSMobilePlatformCapabilitiesSync():
  | MobilePlatformCapabilities
  | undefined {
  const service = createPersistentMobilePracticeServiceSync();
  return service ? composeIOSMobilePlatformCapabilities(service) : undefined;
}

export async function createIOSMobilePlatformCapabilities(): Promise<MobilePlatformCapabilities> {
  return composeIOSMobilePlatformCapabilities(
    await createPersistentMobilePracticeService(),
  );
}

export function composeIOSMobilePlatformCapabilities(
  service: PracticeService,
): MobilePlatformCapabilities {
  return {
    storage: {
      practiceService: service,
      configurePuzzleSource: source =>
        configureMobilePracticePuzzleSource(service, source),
    },
    progressSync: {
      client: createNativeICloudProgressSyncClient(),
    },
    stockfish: {
      createTransport: createNativeStockfishTransport,
      prewarm: prewarmNativeStockfishTransport,
    },
    reminders: {
      scheduler: createNativeReviewReminderScheduler(),
      notificationClient: createNativeReviewReminderNotificationClient(),
    },
    applicationMetadata: IOS_APPLICATION_METADATA,
  };
}
