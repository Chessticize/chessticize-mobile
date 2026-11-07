import {
  createMobilePracticeService,
  createMobilePracticeTestControls,
} from '../src/platform/mobilePractice';

type DevGlobals = typeof globalThis & {
  __CHESSTICIZE_ENABLE_TEST_CONTROLS__?: boolean;
  __DEV__?: boolean;
};

const NOW = '2026-08-19T12:00:00.000Z';

describe('Dev-only seeded Tactical Profile history', () => {
  const globals = globalThis as DevGlobals;
  const previousDev = globals.__DEV__;
  const previousTestControls = globals.__CHESSTICIZE_ENABLE_TEST_CONTROLS__;

  afterEach(() => {
    globals.__DEV__ = previousDev;
    globals.__CHESSTICIZE_ENABLE_TEST_CONTROLS__ = previousTestControls;
  });

  it('is absent from a Release configuration even when test controls are enabled', () => {
    globals.__DEV__ = false;
    globals.__CHESSTICIZE_ENABLE_TEST_CONTROLS__ = true;

    const controls = createMobilePracticeTestControls(createMobilePracticeService());

    expect(controls?.injectMateIn2FocusedRun).toBeDefined();
    expect(controls?.seedTacticalHistory).toBeUndefined();
  });

  it('seeds a ready Profile through public service paths and keeps it local', () => {
    globals.__DEV__ = true;
    const service = createMobilePracticeService();
    service.saveSettings({
      ...service.getSettings(),
      sync: { iCloudEnabled: true },
    });
    const controls = createMobilePracticeTestControls(service);

    const seeded = controls?.seedTacticalHistory?.('slow-fork-speed', NOW);

    expect(seeded).toMatchObject({ scenario: 'slow-fork-speed', phase: 'ready' });
    expect(seeded?.attempts).toBe(service.countHistory());
    expect(service.getSettings().sync.iCloudEnabled).toBe(false);
    const sessions = service.listSprintSessions();
    expect(sessions).toHaveLength(seeded?.runs ?? -1);
    for (const session of sessions) {
      expect(Date.parse(session.completedAt ?? '')).toBeLessThan(Date.parse(NOW));
    }
    const snapshot = service.getTacticalProfileSnapshot(NOW);
    expect(snapshot?.evaluation.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'line:fork', status: 'recommended' }),
      ]),
    );
    expect(service.prepareFocusedRun('line', NOW, 'seeded').status).toBe('ready');

    expect(() => controls?.seedTacticalHistory?.('balanced', NOW)).toThrow(/empty progress/);
  });
});
