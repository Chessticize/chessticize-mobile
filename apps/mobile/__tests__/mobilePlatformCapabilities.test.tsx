import { createMobilePracticeService } from '../src/backend/mobilePractice';
import { composeIOSMobilePlatformCapabilities } from '../src/backend/iosMobilePlatformCapabilities';
import { composeAndroidMobilePlatformCapabilities } from '../src/backend/androidMobilePlatformCapabilities';
import { mobilePlatformCapabilityFactoryFor } from '../src/backend/nativeMobilePlatformCapabilities';
import { MOBILE_APPLICATION_METADATA } from '../src/backend/mobilePlatformCapabilities';
import { createTestMobilePlatformCapabilities } from '../src/testing/testMobilePlatformCapabilities';
import { FakeICloudProgressSyncClient } from '../src/backend/iCloudProgressSync';
import {
  FakeReviewReminderNotificationClient,
  FakeReviewReminderScheduler,
} from '../src/backend/reviewReminderScheduler';

describe('mobile platform capabilities', () => {
  it('composes the existing iOS contracts behind one typed mobile seam', async () => {
    const service = createMobilePracticeService('random1000');
    const capabilities = composeIOSMobilePlatformCapabilities(service);

    expect(capabilities.storage.practiceService).toBe(service);
    expect(capabilities.storage.configurePuzzleSource).toBeDefined();
    expect(capabilities.progressSync.client).toBeNull();
    expect(capabilities.stockfish.createTransport()).toBeNull();
    await expect(capabilities.stockfish.prewarm()).resolves.toBe(false);
    expect(capabilities.reminders.scheduler).toBeNull();
    expect(capabilities.reminders.notificationClient).toBeNull();
    expect(capabilities.applicationMetadata).toBe(MOBILE_APPLICATION_METADATA);
  });

  it('composes Android with the shared storage contracts and no iCloud transport', async () => {
    const service = createMobilePracticeService('random1000');
    const capabilities = composeAndroidMobilePlatformCapabilities(service);

    expect(capabilities.storage.practiceService).toBe(service);
    expect(capabilities.storage.configurePuzzleSource).toBeDefined();
    expect(capabilities.progressSync.client).toBeNull();
    expect(capabilities.stockfish.createTransport()).toBeNull();
    await expect(capabilities.stockfish.prewarm()).resolves.toBe(false);
    expect(capabilities.reminders.scheduler).toBeNull();
    expect(capabilities.reminders.notificationClient).toBeNull();
    expect(capabilities.applicationMetadata).toBe(MOBILE_APPLICATION_METADATA);
  });

  it('selects one platform capability factory at the application composition root', () => {
    const iosFactory = mobilePlatformCapabilityFactoryFor('ios');
    const androidFactory = mobilePlatformCapabilityFactoryFor('android');

    expect(iosFactory.platform).toBe('ios');
    expect(androidFactory.platform).toBe('android');
    expect(iosFactory.create).not.toBe(androidFactory.create);
    expect(() => mobilePlatformCapabilityFactoryFor('web' as never)).toThrow(
      'Unsupported mobile platform: web',
    );
  });

  it('constructs maintained test bundles from the same lower contracts', () => {
    const service = createMobilePracticeService('random1000');
    const progressSyncClient = new FakeICloudProgressSyncClient();
    const scheduler = new FakeReviewReminderScheduler();
    const notificationClient = new FakeReviewReminderNotificationClient();
    const capabilities = createTestMobilePlatformCapabilities({
      practiceServiceFactory: () => service,
      iCloudProgressSyncClient: progressSyncClient,
      reviewReminderScheduler: scheduler,
      reviewReminderNotificationClient: notificationClient,
      applicationMetadata: {
        versionName: 'test-version',
        buildNumber: 'test-build',
      },
    });

    capabilities.storage.configurePuzzleSource?.('familiar15');
    const expectedService = createMobilePracticeService('familiar15');
    const sprintCommand = {
      mode: 'arrow_duel' as const,
      durationSeconds: 300,
      perPuzzleSeconds: 30,
      targetCorrect: 10,
      maxMistakes: 3,
    };
    const configuredPuzzleIds = capabilities.storage.practiceService
      .startSprint(sprintCommand)
      .puzzles.map(puzzle => puzzle.id);
    const expectedPuzzleIds = expectedService
      .startSprint(sprintCommand)
      .puzzles.map(puzzle => puzzle.id);

    expect(configuredPuzzleIds).toEqual(expectedPuzzleIds);
    expect(capabilities.storage.practiceService).toBe(service);
    expect(capabilities.progressSync.client).toBe(progressSyncClient);
    expect(capabilities.reminders.scheduler).toBe(scheduler);
    expect(capabilities.reminders.notificationClient).toBe(notificationClient);
    expect(capabilities.applicationMetadata).toMatchObject({
      versionName: 'test-version',
      buildNumber: 'test-build',
    });
  });
});
