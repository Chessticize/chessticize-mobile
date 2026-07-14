import { createMobilePracticeService } from '../src/backend/mobilePractice';
import {
  composeIOSMobilePlatformCapabilities,
  IOS_APPLICATION_METADATA,
} from '../src/backend/iosMobilePlatformCapabilities';
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
    expect(capabilities.applicationMetadata).toBe(IOS_APPLICATION_METADATA);
  });

  it('constructs maintained test bundles from the same lower contracts', () => {
    const service = createMobilePracticeService('random1000');
    const configurePuzzleSource = jest.fn();
    const progressSyncClient = new FakeICloudProgressSyncClient();
    const scheduler = new FakeReviewReminderScheduler();
    const notificationClient = new FakeReviewReminderNotificationClient();
    const capabilities = createTestMobilePlatformCapabilities({
      practiceService: service,
      configurePuzzleSource,
      iCloudProgressSyncClient: progressSyncClient,
      reviewReminderScheduler: scheduler,
      reviewReminderNotificationClient: notificationClient,
      applicationMetadata: {
        versionName: 'test-version',
        buildNumber: 'test-build',
      },
    });

    capabilities.storage.configurePuzzleSource?.('familiar15');

    expect(configurePuzzleSource).toHaveBeenCalledWith(service, 'familiar15');
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
