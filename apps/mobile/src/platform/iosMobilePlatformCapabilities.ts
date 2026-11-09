// Mobile platform composition belongs outside the backend/domain seam.
import type { PracticeService } from '../../../../packages/storage/src/practice-service.ts';
import { createNativeICloudProgressSyncClient } from './iCloudProgressSync.ts';
import { createNativeICloudSyncDiagnosticsClient } from './iCloudSyncDiagnostics.ts';
import {
  configureMobilePracticePuzzleSource,
  createMobilePracticeTestControls,
  createPersistentMobilePracticeService,
  createPersistentMobilePracticeServiceSync,
  getPersistentMobileProgressDatabasePath,
  isSimulationProfileService,
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
import { createNativeMoveFeedbackClient } from './moveFeedback.ts';
import { createNativeUiHapticsClient } from './uiHaptics.ts';
import { createNativeAppStoreReviewRequestClient } from './appStoreReviewRequest.ts';

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
  const testControls = createMobilePracticeTestControls(service);
  // Dev simulation data stays on this device: no iCloud sync client and no
  // Review reminders, so nothing simulated reaches CloudKit or schedules
  // notifications over the real profile's.
  const simulatedProfile = isSimulationProfileService(service);
  return {
    storage: {
      practiceService: service,
      configurePuzzleSource: (source, mode) =>
        configureMobilePracticePuzzleSource(service, source, mode),
    },
    ...(testControls ? { testControls } : {}),
    progressProtection: {
      kind: 'icloud_sync',
    },
    progressSync: simulatedProfile
      ? { client: null, diagnostics: null }
      : {
          client: createNativeICloudProgressSyncClient(),
          diagnostics: createNativeICloudSyncDiagnosticsClient(
            getPersistentMobileProgressDatabasePath(),
          ),
        },
    stockfish: {
      createTransport: createNativeStockfishTransport,
      prewarm: prewarmNativeStockfishTransport,
    },
    reminders: {
      platform: 'ios',
      scheduler: simulatedProfile ? null : createNativeReviewReminderScheduler(),
      notificationClient: simulatedProfile
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
    applicationMetadata,
  };
}
