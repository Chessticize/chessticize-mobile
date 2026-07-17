import type { PracticeService } from '../../../../packages/storage/src/practice-service.ts';
import { createNativeICloudProgressSyncClient } from './iCloudProgressSync.ts';
import {
  configureMobilePracticePuzzleSource,
  createPersistentMobilePracticeService,
  createPersistentMobilePracticeServiceSync,
} from './mobilePractice.ts';
import {
  type MobileApplicationMetadata,
  type MobilePlatformCapabilities,
} from './mobilePlatformCapabilities.ts';
import { readNativeApplicationMetadata } from './nativeApplicationMetadata.ts';
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
  applicationMetadata: MobileApplicationMetadata = readNativeApplicationMetadata(),
): MobilePlatformCapabilities {
  return {
    storage: {
      practiceService: service,
      configurePuzzleSource: source =>
        configureMobilePracticePuzzleSource(service, source),
    },
    progressProtection: {
      kind: 'icloud_sync',
    },
    progressSync: {
      client: createNativeICloudProgressSyncClient(),
    },
    stockfish: {
      createTransport: createNativeStockfishTransport,
      prewarm: prewarmNativeStockfishTransport,
    },
    reminders: {
      platform: 'ios',
      scheduler: createNativeReviewReminderScheduler(),
      notificationClient: createNativeReviewReminderNotificationClient(),
    },
    applicationMetadata,
  };
}
