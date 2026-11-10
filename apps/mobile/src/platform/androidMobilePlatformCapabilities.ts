// Mobile platform composition belongs outside the backend/domain seam.
import type { PracticeService } from '../../../../packages/storage/src/practice-service.ts';
import {
  configureMobilePracticePuzzleSource,
  createMobilePracticeTestControls,
  createPersistentMobilePracticeService,
  createPersistentMobilePracticeServiceSync,
  getPersistentMobileProgressDatabasePath,
  isSimulationProfileService,
} from './mobilePractice.ts';
import { createNativeAndroidSupportDiagnosticsClient } from './androidSupportDiagnostics.ts';
import {
  MOBILE_ANDROID_RELEASES_URL,
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
import { createNativeMoveFeedbackClient } from './moveFeedback.ts';
import { createNativeUiHapticsClient } from './uiHaptics.ts';
import { createNativeAppStoreReviewRequestClient } from './appStoreReviewRequest.ts';

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
  applicationMetadata: MobileApplicationMetadata = readNativeApplicationMetadata(),
  progressDatabasePath: string | undefined = getPersistentMobileProgressDatabasePath(),
): MobilePlatformCapabilities {
  const testControls = createMobilePracticeTestControls(service);
  return {
    storage: {
      practiceService: service,
      configurePuzzleSource: (source, mode) =>
        configureMobilePracticePuzzleSource(service, source, mode),
    },
    ...(testControls ? { testControls } : {}),
    progressProtection: {
      kind: 'android_managed_backup',
    },
    progressSync: {
      client: null,
      diagnostics: createNativeAndroidSupportDiagnosticsClient(progressDatabasePath),
    },
    stockfish: {
      createTransport: createNativeStockfishTransport,
      prewarm: prewarmNativeStockfishTransport,
    },
    reminders: {
      platform: 'android',
      // Dev simulation data must not schedule notifications over the real profile's.
      scheduler: isSimulationProfileService(service) ? null : createNativeReviewReminderScheduler(),
      notificationClient: isSimulationProfileService(service)
        ? null
        : createNativeReviewReminderNotificationClient(),
    },
    moveFeedback: {
      client: createNativeMoveFeedbackClient(),
    },
    uiHaptics: {
      client: createNativeUiHapticsClient(),
    },
    appReview: {
      client: createNativeAppStoreReviewRequestClient(),
    },
    applicationMetadata: {
      ...applicationMetadata,
      releasePageUrl: MOBILE_ANDROID_RELEASES_URL,
    },
  };
}
