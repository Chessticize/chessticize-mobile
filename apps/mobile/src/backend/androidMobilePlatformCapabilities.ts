import type { PracticeService } from '../../../../packages/storage/src/practice-service.ts';
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

export function createAndroidMobilePlatformCapabilitiesSync():
  | MobilePlatformCapabilities
  | undefined {
  const service = createPersistentMobilePracticeServiceSync();
  return service ? composeAndroidMobilePlatformCapabilities(service) : undefined;
}

export async function createAndroidMobilePlatformCapabilities(): Promise<MobilePlatformCapabilities> {
  return composeAndroidMobilePlatformCapabilities(
    await createPersistentMobilePracticeService(),
  );
}

export function composeAndroidMobilePlatformCapabilities(
  service: PracticeService,
): MobilePlatformCapabilities {
  return {
    storage: {
      practiceService: service,
      configurePuzzleSource: source =>
        configureMobilePracticePuzzleSource(service, source),
    },
    progressProtection: {
      kind: 'android_managed_backup',
    },
    progressSync: {
      client: null,
    },
    stockfish: {
      createTransport: createNativeStockfishTransport,
      prewarm: prewarmNativeStockfishTransport,
    },
    reminders: {
      platform: 'android',
      scheduler: createNativeReviewReminderScheduler(),
      notificationClient: createNativeReviewReminderNotificationClient(),
    },
    applicationMetadata: MOBILE_APPLICATION_METADATA,
  };
}
