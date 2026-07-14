import type { PracticeService } from '../../../../packages/storage/src/practice-service.ts';
import { createNativeICloudProgressSyncClient } from './iCloudProgressSync.ts';
import {
  configureMobilePracticePuzzleSource,
  createPersistentMobilePracticeService,
  createPersistentMobilePracticeServiceSync,
} from './mobilePractice.ts';
import {
  MOBILE_APPLICATION_METADATA,
  type MobilePlatformCapabilities,
} from './mobilePlatformCapabilities.ts';
import {
  createNativeStockfishTransport,
  prewarmNativeStockfishTransport,
} from './nativeStockfishTransport.ts';
import {
  createNativeReviewReminderNotificationClient,
  createNativeReviewReminderScheduler,
} from './reviewReminderScheduler.ts';

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
    applicationMetadata: MOBILE_APPLICATION_METADATA,
  };
}
