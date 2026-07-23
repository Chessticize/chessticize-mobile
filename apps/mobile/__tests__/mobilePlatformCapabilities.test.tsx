import { createMobilePracticeService } from '../src/backend/mobilePractice';
import { NativeModules } from 'react-native';
import { composeIOSMobilePlatformCapabilities } from '../src/backend/iosMobilePlatformCapabilities';
import { composeAndroidMobilePlatformCapabilities } from '../src/backend/androidMobilePlatformCapabilities';
import { mobilePlatformCapabilityFactoryFor } from '../src/backend/nativeMobilePlatformCapabilities';
import { MOBILE_APPLICATION_METADATA_LINKS } from '../src/backend/mobilePlatformCapabilities';
import { readNativeApplicationMetadata } from '../src/backend/nativeApplicationMetadata';
import { createTestMobilePlatformCapabilities } from '../src/testing/testMobilePlatformCapabilities';
import { FakeICloudProgressSyncClient } from '../src/backend/iCloudProgressSync';
import {
  FakeReviewReminderNotificationClient,
  FakeReviewReminderScheduler,
} from '../src/backend/reviewReminderScheduler';
import {
  createNativeStockfishTransport,
  prewarmNativeStockfishTransport,
} from '../src/backend/nativeStockfishTransport';

describe('mobile platform capabilities', () => {
  const installedApplicationMetadata = {
    ...MOBILE_APPLICATION_METADATA_LINKS,
    versionName: '1.1',
    buildNumber: 'test-build',
  };

  it('composes the existing iOS contracts behind one typed mobile seam', async () => {
    const service = createMobilePracticeService('random1000');
    const capabilities = composeIOSMobilePlatformCapabilities(
      service,
      installedApplicationMetadata,
    );

    expect(capabilities.storage.practiceService).toBe(service);
    expect(capabilities.storage.configurePuzzleSource).toBeDefined();
    expect(capabilities.progressProtection).toEqual({ kind: 'icloud_sync' });
    expect(capabilities.progressSync.client).toBeNull();
    expect(capabilities.stockfish.createTransport()).toBeNull();
    await expect(capabilities.stockfish.prewarm()).resolves.toBe(false);
    expect(capabilities.reminders.scheduler).toBeNull();
    expect(capabilities.reminders.notificationClient).toBeNull();
    expect(capabilities.applicationMetadata).toBe(installedApplicationMetadata);
  });

  it('composes Android with shared storage and the native Stockfish transport', () => {
    (NativeModules as Record<string, unknown>).ReviewReminderNotifications = {
      addListener: jest.fn(),
      removeListeners: jest.fn(),
      replaceNextReminder: jest.fn(),
      getAuthorizationStatus: jest.fn(),
      requestAuthorization: jest.fn(),
      openSystemSettings: jest.fn(),
      consumeInitialRoute: jest.fn(),
    };
    const service = createMobilePracticeService('random1000');
    const capabilities = composeAndroidMobilePlatformCapabilities(
      service,
      installedApplicationMetadata,
    );

    expect(capabilities.storage.practiceService).toBe(service);
    expect(capabilities.storage.configurePuzzleSource).toBeDefined();
    expect(capabilities.progressProtection).toEqual({ kind: 'android_managed_backup' });
    expect(capabilities.progressSync.client).toBeNull();
    expect(capabilities.stockfish.createTransport).toBe(createNativeStockfishTransport);
    expect(capabilities.stockfish.prewarm).toBe(prewarmNativeStockfishTransport);
    expect(capabilities.reminders.platform).toBe('android');
    expect(capabilities.reminders.scheduler).not.toBeNull();
    expect(capabilities.reminders.notificationClient).not.toBeNull();
    expect(capabilities.applicationMetadata).toEqual({
      ...installedApplicationMetadata,
      releasePageUrl: 'https://github.com/Chessticize/chessticize-mobile/releases',
    });
    delete (NativeModules as Record<string, unknown>).ReviewReminderNotifications;
  });

  it('exposes the manual GitHub Releases link only through Android capabilities', () => {
    const service = createMobilePracticeService('random1000');
    expect(composeAndroidMobilePlatformCapabilities(
      service,
      installedApplicationMetadata,
    ).applicationMetadata.releasePageUrl).toBe(
      'https://github.com/Chessticize/chessticize-mobile/releases',
    );
    expect(composeIOSMobilePlatformCapabilities(
      service,
      installedApplicationMetadata,
    ).applicationMetadata.releasePageUrl).toBeUndefined();
  });

  it('uses the repository new-issue route for feedback handoff', () => {
    expect(MOBILE_APPLICATION_METADATA_LINKS.feedbackIssuesUrl).toBe(
      'https://github.com/Chessticize/chessticize-mobile/issues/new',
    );
  });

  it('fails closed when installed artifact metadata is unavailable or incomplete', () => {
    expect(() => readNativeApplicationMetadata(undefined)).toThrow(
      'Native ApplicationMetadata module is unavailable.',
    );
    expect(() => readNativeApplicationMetadata({ versionName: '1.1' })).toThrow(
      'Installed application metadata is missing buildNumber.',
    );
    expect(readNativeApplicationMetadata({
      versionName: '1.1',
      buildNumber: '17',
    })).toEqual({
      ...MOBILE_APPLICATION_METADATA_LINKS,
      versionName: '1.1',
      buildNumber: '17',
    });
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
    expect(capabilities.progressProtection).toEqual({ kind: 'icloud_sync' });
    expect(capabilities.progressSync.client).toBe(progressSyncClient);
    expect(capabilities.reminders.scheduler).toBe(scheduler);
    expect(capabilities.reminders.notificationClient).toBe(notificationClient);
    expect(capabilities.applicationMetadata).toMatchObject({
      versionName: 'test-version',
      buildNumber: 'test-build',
    });
  });
});
