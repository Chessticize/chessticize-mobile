const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const {
  ACTIVE_E2E_TEST_MATCH_BY_SUITE,
  ACTIVE_E2E_TEST_MATCH,
  STORE_ASSETS_TEST_MATCH,
  ADAPTIVE_LAYOUT_TEST_MATCH,
  ANDROID_ADAPTIVE_LAYOUT_TEST_MATCH,
  ANDROID_LAUNCH_TEST_MATCH,
  ANDROID_CUSTOM_PRACTICE_TEST_MATCH,
  ANDROID_HISTORY_TEST_MATCH,
  ANDROID_STANDARD_PRACTICE_TEST_MATCH,
  ANDROID_BOARD_ORIENTATION_TEST_MATCH,
  ANDROID_ARROW_DUEL_TEST_MATCH,
  ANDROID_MIGRATION_TEST_MATCH,
  ANDROID_OFFLINE_PRACTICE_TEST_MATCH,
  ANDROID_API24_SMOKE_TEST_MATCH,
  ANDROID_STOCKFISH_SMOKE_TEST_MATCH,
  ANDROID_PROGRESS_BACKUP_RESTORE_TEST_MATCH,
  ANDROID_SYSTEM_BACK_TEST_MATCH,
  ANDROID_REVIEW_REMINDERS_TEST_MATCH,
  SPRINT_PERFORMANCE_TEST_MATCH,
  resolveDetoxTestMatch,
  resolveDetoxMaxWorkers
} = require('../e2e/suiteConfig');
const {
  bringAndroidAppToForeground,
  androidAppIsResumed,
  beginAndroidPredictiveBackGesture,
  collectAndroidUiDiagnostics,
  findExactAndroidNotificationRow,
  findPendingAndroidAlarms,
  findAndroidSystemNode,
  grantAndroidRuntimePermission,
  launchWithDisabledSynchronization,
  launchWithFreshAndroidRuntimePermission,
  performAndroidPredictiveBackGesture,
  setAndroidDisplayOrientation,
  waitForAndTapExactAndroidNotificationFromPublicUi,
  waitForAndTapExactAndroidNotificationRow,
  waitForRunningStockfishDepth,
  withAndroidUiDiagnostics,
} = require('../e2e/helpers');
const {
  findUniqueAndroidUiNode,
  readAndroidUiHierarchy,
  tapAndroidUiNode,
  waitForAndroidUiState,
} = require('../e2e/androidPublicUiEvidence');

const EXACT_ANDROID_NOTIFICATION_ROW = [
  '<node clickable="true" bounds="[42,568][1038,786]">',
  '<node text="Chessticize" clickable="false" />',
  '<node text="3 reviews are ready" clickable="false" />',
  '</node>',
].join('');
const MALFORMED_ANDROID_UI_HIERARCHIES = [
  [
    'truncated hierarchy',
    `<?xml version='1.0' encoding='UTF-8' ?><hierarchy>${EXACT_ANDROID_NOTIFICATION_ROW}`,
  ],
  [
    'mismatched closing tag',
    `<hierarchy>${EXACT_ANDROID_NOTIFICATION_ROW}</node>`,
  ],
  [
    'missing hierarchy root',
    EXACT_ANDROID_NOTIFICATION_ROW,
  ],
  [
    'duplicate hierarchy roots',
    `<hierarchy /> <hierarchy>${EXACT_ANDROID_NOTIFICATION_ROW}</hierarchy>`,
  ],
  [
    'trailing malformed content',
    `<hierarchy>${EXACT_ANDROID_NOTIFICATION_ROW}</hierarchy><broken`,
  ],
];
const ILLEGAL_XML_CHARACTER_HIERARCHIES = [
  ['decimal NUL reference', '&#0;'],
  ['hex NUL reference', '&#x0;'],
  ['surrogate reference', '&#xD800;'],
  ['out-of-range reference', '&#x110000;'],
  ['raw forbidden control', String.fromCharCode(0x01)],
  ['raw lone surrogate', String.fromCharCode(0xD800)],
].map(([kind, value]) => [
  kind,
  `<hierarchy invalid="${value}">${EXACT_ANDROID_NOTIFICATION_ROW}</hierarchy>`,
]);
const LOOKALIKE_ANDROID_NOTIFICATION_HIERARCHIES = [
  'node-fake',
  'node:fake',
].map((tagName) => [
  tagName,
  [
    '<hierarchy>',
    `<${tagName} resource-id="lookalike-notification-row" `
      + 'clickable="true" bounds="[42,568][1038,786]">',
    `<${tagName} text="Chessticize" clickable="false" />`,
    `<${tagName} text="3 reviews are ready" clickable="false" />`,
    `</${tagName}>`,
    '</hierarchy>',
  ].join(''),
]);
const FORBIDDEN_XML_GRAMMAR_WHITESPACE = [
  ['NBSP', '\u00A0'],
  ['EM SPACE', '\u2003'],
  ['IDEOGRAPHIC SPACE', '\u3000'],
  ['FEFF', '\uFEFF'],
];
const FORBIDDEN_XML_WHITESPACE_POSITIONS = [
  ['before root', (whitespace) => (
    `${whitespace}<hierarchy>${EXACT_ANDROID_NOTIFICATION_ROW}</hierarchy>`
  )],
  ['between declaration and root', (whitespace) => (
    `<?xml version='1.0'?>${whitespace}`
      + `<hierarchy>${EXACT_ANDROID_NOTIFICATION_ROW}</hierarchy>`
  )],
  ['as root attribute separator', (whitespace) => (
    `<hierarchy${whitespace}rotation="0">${EXACT_ANDROID_NOTIFICATION_ROW}</hierarchy>`
  )],
  ['around attribute equals', (whitespace) => (
    `<hierarchy rotation${whitespace}=${whitespace}"0">`
      + `${EXACT_ANDROID_NOTIFICATION_ROW}</hierarchy>`
  )],
  ['as node tag separator', (whitespace) => (
    `<hierarchy><node${whitespace}/>${EXACT_ANDROID_NOTIFICATION_ROW}</hierarchy>`
  )],
  ['before closing-tag angle', (whitespace) => (
    `<hierarchy>${EXACT_ANDROID_NOTIFICATION_ROW}</hierarchy${whitespace}>`
  )],
  ['after root', (whitespace) => (
    `<hierarchy>${EXACT_ANDROID_NOTIFICATION_ROW}</hierarchy>${whitespace}`
  )],
];
const FORBIDDEN_XML_WHITESPACE_HIERARCHIES = FORBIDDEN_XML_GRAMMAR_WHITESPACE
  .flatMap(([whitespaceName, whitespace]) => (
    FORBIDDEN_XML_WHITESPACE_POSITIONS.map(([position, buildHierarchy]) => [
      `${whitespaceName} ${position}`,
      buildHierarchy(whitespace),
    ])
  ));

describe('Detox suite configuration', () => {
  it('owns Android public hierarchy evidence behind one focused interface', () => {
    const androidPublicUiEvidence = require('../e2e/androidPublicUiEvidence');
    const helpersSource = fs.readFileSync(
      path.resolve(__dirname, '../e2e/helpers.js'),
      'utf8'
    );
    const adaptiveSource = fs.readFileSync(
      path.resolve(__dirname, '../e2e/adaptive-layout.e2e.js'),
      'utf8'
    );
    const notificationSource = fs.readFileSync(
      path.resolve(__dirname, '../e2e/androidSystemNotification.js'),
      'utf8'
    );
    const reminderSource = fs.readFileSync(
      path.resolve(__dirname, '../e2e/android-review-reminders.e2e.js'),
      'utf8'
    );

    expect(Object.keys(androidPublicUiEvidence).sort()).toEqual([
      'findUniqueAndroidUiNode',
      'readAndroidUiHierarchy',
      'tapAndroidUiNode',
      'waitForAndroidUiState',
    ]);
    expect(helpersSource).not.toContain('function readAndroidUiHierarchy');
    expect(helpersSource).not.toContain('function waitForAndroidUiState');
    expect(adaptiveSource).not.toContain("require('./androidPublicUiEvidence')");
    expect(notificationSource).toContain("require('./androidPublicUiEvidence')");
    expect(reminderSource).toContain("require('./androidPublicUiEvidence')");
    expect(reminderSource).not.toContain('function readSystemHierarchy');
    expect(reminderSource).not.toContain('chessticize-reminder-window.xml');
  });

  it('discovers Android notification settings through partial system labels', () => {
    const hierarchy = [
      '<node content-desc="ChessticizeMobile" text="" />',
      '<node content-desc="" text="All ChessticizeMobile notifications" />',
      '<node content-desc="" text="You haven\'t allowed notifications from this app" />',
    ].join('');

    expect(findAndroidSystemNode(hierarchy, ['Chessticize', 'Notifications']))
      .toContain('content-desc="ChessticizeMobile"');
  });

  it('selects the Android permission action instead of the question containing Allow', () => {
    const hierarchy = [
      '<node text="Allow ChessticizeMobile to send you notifications?" resource-id="com.android.permissioncontroller:id/permission_message" bounds="[133,765][947,898]" />',
      '<node text="Allow" resource-id="com.android.permissioncontroller:id/permission_allow_button" bounds="[133,966][947,1113]" />',
    ].join('');

    expect(findAndroidSystemNode(
      hierarchy,
      ['permission_allow_button', 'Allow'],
      { exact: true }
    ))
      .toContain('resource-id="com.android.permissioncontroller:id/permission_allow_button"');
  });

  it('targets the enclosing clickable notification row from nested notification text', () => {
    const hierarchy = [
      '<node resource-id="com.android.systemui:id/notification_stack_scroller" clickable="false" bounds="[0,0][1080,1836]">',
      '<node resource-id="com.android.systemui:id/expandableNotificationRow" clickable="true" bounds="[42,568][1038,786]">',
      '<node resource-id="android:id/notification_headerless_view_column" clickable="false" bounds="[179,620][891,734]">',
      '<node text="Chessticize" resource-id="android:id/title" clickable="false" bounds="[179,620][480,671]" />',
      '<node text="3 reviews are ready" resource-id="android:id/text" clickable="false" bounds="[179,676][891,729]" />',
      '</node>',
      '</node>',
      '</node>',
    ].join('');

    const target = findAndroidSystemNode(
      hierarchy,
      ['3 reviews are ready', 'Chessticize'],
      { clickableAncestor: true }
    );
    const titleTarget = findAndroidSystemNode(
      hierarchy,
      ['Chessticize'],
      { clickableAncestor: true }
    );
    const bodyTarget = findAndroidSystemNode(
      hierarchy,
      ['3 reviews are ready'],
      { clickableAncestor: true }
    );

    expect(target).toContain('resource-id="com.android.systemui:id/expandableNotificationRow"');
    expect(target).toContain('clickable="true"');
    expect(target).toContain('bounds="[42,568][1038,786]"');
    expect(titleTarget).toBe(target);
    expect(bodyTarget).toBe(target);
  });

  it('rejects title and body supersets when finding an exact notification row', () => {
    const titleSuperset = [
      '<node clickable="true" bounds="[42,568][1038,786]">',
      '<node text="ChessticizeMobile" clickable="false" />',
      '<node text="3 reviews are ready" clickable="false" />',
      '</node>',
    ].join('');
    const bodyPrefix = [
      '<node clickable="true" bounds="[42,568][1038,786]">',
      '<node text="Chessticize" clickable="false" />',
      '<node text="Soon: 3 reviews are ready" clickable="false" />',
      '</node>',
    ].join('');
    const bodySuffix = [
      '<node clickable="true" bounds="[42,568][1038,786]">',
      '<node text="Chessticize" clickable="false" />',
      '<node text="3 reviews are ready now" clickable="false" />',
      '</node>',
    ].join('');
    const expected = {
      body: '3 reviews are ready',
      title: 'Chessticize',
    };

    expect(findExactAndroidNotificationRow(titleSuperset, expected)).toBeNull();
    expect(findExactAndroidNotificationRow(bodyPrefix, expected)).toBeNull();
    expect(findExactAndroidNotificationRow(bodySuffix, expected)).toBeNull();
  });

  it('rejects title and body split across separate clickable notification rows', () => {
    const hierarchy = [
      '<node clickable="true" bounds="[42,100][1038,300]">',
      '<node text="Chessticize" clickable="false" />',
      '</node>',
      '<node clickable="true" bounds="[42,568][1038,786]">',
      '<node text="3 reviews are ready" clickable="false" />',
      '</node>',
    ].join('');

    expect(findExactAndroidNotificationRow(hierarchy, {
      body: '3 reviews are ready',
      title: 'Chessticize',
    })).toBeNull();
  });

  it('does not combine alternating SystemUI snapshots before tapping a notification row', async () => {
    const titleOnly = [
      '<node clickable="true" bounds="[42,568][1038,786]">',
      '<node text="Chessticize" clickable="false" />',
      '</node>',
    ].join('');
    const bodyOnly = [
      '<node clickable="true" bounds="[42,568][1038,786]">',
      '<node text="3 reviews are ready" clickable="false" />',
      '</node>',
    ].join('');
    let clock = 0;
    let snapshot = 0;
    const readHierarchy = jest.fn(() => (
      snapshot++ % 2 === 0 ? titleOnly : bodyOnly
    ));
    const tapBounds = jest.fn();

    await expect(waitForAndTapExactAndroidNotificationRow({
      body: '3 reviews are ready',
      delay: async (milliseconds) => { clock += milliseconds; },
      now: () => clock,
      pollIntervalMs: 5,
      readHierarchy,
      tapBounds,
      timeoutMs: 15,
      title: 'Chessticize',
    })).rejects.toThrow('Timed out waiting for exact Android SystemUI notification row');
    expect(readHierarchy).toHaveBeenCalledTimes(3);
    expect(tapBounds).not.toHaveBeenCalled();
  });

  it('taps bounds from the single snapshot that proves exact body and title', async () => {
    const hierarchy = [
      '<node clickable="true" bounds="[42,568][1038,786]">',
      '<node text="Chessticize" clickable="false" />',
      '<node text="3 reviews are ready" clickable="false" />',
      '</node>',
    ].join('');
    const readHierarchy = jest.fn(() => hierarchy);
    const tapBounds = jest.fn();

    await expect(waitForAndTapExactAndroidNotificationRow({
      body: '3 reviews are ready',
      readHierarchy,
      tapBounds,
      timeoutMs: 15,
      title: 'Chessticize',
    })).resolves.toMatchObject({ hierarchy });
    expect(readHierarchy).toHaveBeenCalledTimes(1);
    expect(tapBounds).toHaveBeenCalledWith({
      bottom: 786,
      left: 42,
      right: 1038,
      top: 568,
    });
  });

  it('rejects stale notification XML when the fresh SystemUI dump reports an error', async () => {
    const staleHierarchy = [
      '<hierarchy>',
      '<node clickable="true" bounds="[42,568][1038,786]">',
      '<node text="Chessticize" clickable="false" />',
      '<node text="3 reviews are ready" clickable="false" />',
      '</node>',
      '</hierarchy>',
    ].join('');
    let remoteHierarchy = staleHierarchy;
    const run = jest.fn((_command, args) => {
      if (args.includes('rm')) {
        remoteHierarchy = '';
        return '';
      }
      if (args.includes('uiautomator')) {
        return 'ERROR: could not get idle state.';
      }
      return remoteHierarchy;
    });
    const tapBounds = jest.fn();

    await expect(waitForAndTapExactAndroidNotificationFromPublicUi({
      body: '3 reviews are ready',
      environment: {
        ADB_PATH: '/sdk/adb',
        DETOX_ANDROID_DEVICE: 'emulator-6000',
      },
      run,
      tapBounds,
      timeoutMs: 15,
      title: 'Chessticize',
    })).rejects.toThrow('Android UI hierarchy dump failed');
    expect(tapBounds).not.toHaveBeenCalled();
  });

  it.each(MALFORMED_ANDROID_UI_HIERARCHIES)(
    'does not tap an exact notification row from %s XML',
    async (_kind, hierarchy) => {
      const run = jest.fn((_command, args) => (
        args.includes('exec-out') ? hierarchy : 'UI hierarchy dumped'
      ));
      const tapBounds = jest.fn();

      await expect(waitForAndTapExactAndroidNotificationFromPublicUi({
        body: '3 reviews are ready',
        environment: { ADB_PATH: '/sdk/adb' },
        run,
        tapBounds,
        timeoutMs: 15,
        title: 'Chessticize',
      })).rejects.toThrow('Android UI hierarchy read returned invalid XML');
      expect(tapBounds).not.toHaveBeenCalled();
    }
  );

  it.each(ILLEGAL_XML_CHARACTER_HIERARCHIES)(
    'does not tap an exact notification row containing %s',
    async (_kind, hierarchy) => {
      const run = jest.fn((_command, args) => (
        args.includes('exec-out') ? hierarchy : 'UI hierarchy dumped'
      ));
      const tapBounds = jest.fn();

      await expect(waitForAndTapExactAndroidNotificationFromPublicUi({
        body: '3 reviews are ready',
        environment: { ADB_PATH: '/sdk/adb' },
        run,
        tapBounds,
        timeoutMs: 15,
        title: 'Chessticize',
      })).rejects.toThrow('Android UI hierarchy read returned invalid XML');
      expect(tapBounds).not.toHaveBeenCalled();
    }
  );

  it.each(ILLEGAL_XML_CHARACTER_HIERARCHIES)(
    'rejects %s at the maintained Android public hierarchy reader',
    (_kind, hierarchy) => {
      const run = jest.fn((_command, args) => (
        args.includes('exec-out') ? hierarchy : 'UI hierarchy dumped'
      ));

      expect(() => readAndroidUiHierarchy({ ADB_PATH: '/sdk/adb' }, run))
        .toThrow('Android UI hierarchy read returned invalid XML');
    }
  );

  it.each(LOOKALIKE_ANDROID_NOTIFICATION_HIERARCHIES)(
    'does not tap notification evidence exposed only through <%s> lookalikes',
    async (_tagName, hierarchy) => {
      let clock = 0;
      const run = jest.fn((_command, args) => (
        args.includes('exec-out') ? hierarchy : 'UI hierarchy dumped'
      ));
      const tapBounds = jest.fn();

      await expect(waitForAndTapExactAndroidNotificationFromPublicUi({
        body: '3 reviews are ready',
        delay: async (milliseconds) => { clock += milliseconds; },
        environment: { ADB_PATH: '/sdk/adb' },
        now: () => clock,
        pollIntervalMs: 5,
        run,
        tapBounds,
        timeoutMs: 15,
        title: 'Chessticize',
      })).rejects.toThrow('Timed out waiting for exact Android SystemUI notification row');
      expect(tapBounds).not.toHaveBeenCalled();
    }
  );

  it.each(LOOKALIKE_ANDROID_NOTIFICATION_HIERARCHIES)(
    'ignores <%s> lookalikes at exact notification and public-node parser seams',
    (_tagName, hierarchy) => {
      expect(findExactAndroidNotificationRow(hierarchy, {
        body: '3 reviews are ready',
        title: 'Chessticize',
      })).toBeNull();
      expect(() => findUniqueAndroidUiNode(hierarchy, 'lookalike-notification-row'))
        .toThrow('Missing visible Android UI node lookalike-notification-row');
    }
  );

  it('accepts exact node tags at the public notification read and tap seam', async () => {
    const hierarchy = `<hierarchy>${EXACT_ANDROID_NOTIFICATION_ROW}</hierarchy>`;
    const run = jest.fn((_command, args) => (
      args.includes('exec-out') ? hierarchy : 'UI hierarchy dumped'
    ));
    const tapBounds = jest.fn();

    await expect(waitForAndTapExactAndroidNotificationFromPublicUi({
      body: '3 reviews are ready',
      environment: { ADB_PATH: '/sdk/adb' },
      run,
      tapBounds,
      timeoutMs: 15,
      title: 'Chessticize',
    })).resolves.toMatchObject({ hierarchy });
    expect(tapBounds).toHaveBeenCalledWith({
      bottom: 786,
      left: 42,
      right: 1038,
      top: 568,
    });
  });

  it.each(FORBIDDEN_XML_WHITESPACE_HIERARCHIES)(
    'does not tap an exact notification row with %s',
    async (_kind, hierarchy) => {
      const run = jest.fn((_command, args) => (
        args.includes('exec-out') ? hierarchy : 'UI hierarchy dumped'
      ));
      const tapBounds = jest.fn();

      await expect(waitForAndTapExactAndroidNotificationFromPublicUi({
        body: '3 reviews are ready',
        environment: { ADB_PATH: '/sdk/adb' },
        run,
        tapBounds,
        timeoutMs: 15,
        title: 'Chessticize',
      })).rejects.toThrow('Android UI hierarchy read returned invalid XML');
      expect(tapBounds).not.toHaveBeenCalled();
    }
  );

  it.each(FORBIDDEN_XML_WHITESPACE_HIERARCHIES)(
    'rejects %s at the maintained Android public hierarchy reader',
    (_kind, hierarchy) => {
      const run = jest.fn((_command, args) => (
        args.includes('exec-out') ? hierarchy : 'UI hierarchy dumped'
      ));

      expect(() => readAndroidUiHierarchy({ ADB_PATH: '/sdk/adb' }, run))
        .toThrow('Android UI hierarchy read returned invalid XML');
    }
  );

  it('accepts every XML 1.0 S character at the exact notification tap seam', async () => {
    const hierarchy = [
      '<hierarchy rotation \t=\r\n"0">',
      '<node\tclickable \r=\n"true" bounds = "[42,568][1038,786]">',
      '<node\rtext = "Chessticize" clickable="false" />',
      '<node\ntext\t=\t"3 reviews are ready" clickable="false" />',
      '</node\t>',
      '</hierarchy\r>',
    ].join('');
    const run = jest.fn((_command, args) => (
      args.includes('exec-out') ? hierarchy : 'UI hierarchy dumped'
    ));
    const tapBounds = jest.fn();

    await expect(waitForAndTapExactAndroidNotificationFromPublicUi({
      body: '3 reviews are ready',
      environment: { ADB_PATH: '/sdk/adb' },
      run,
      tapBounds,
      timeoutMs: 15,
      title: 'Chessticize',
    })).resolves.toMatchObject({ hierarchy });
    expect(tapBounds).toHaveBeenCalledWith({
      bottom: 786,
      left: 42,
      right: 1038,
      top: 568,
    });
  });

  it.each(MALFORMED_ANDROID_UI_HIERARCHIES)(
    'rejects %s XML at the maintained Android public hierarchy reader',
    (_kind, hierarchy) => {
      const run = jest.fn((_command, args) => (
        args.includes('exec-out') ? hierarchy : 'UI hierarchy dumped'
      ));

      expect(() => readAndroidUiHierarchy({ ADB_PATH: '/sdk/adb' }, run))
        .toThrow('Android UI hierarchy read returned invalid XML');
    }
  );

  it('accepts the UIAutomator XML declaration, whitespace, self-closing nodes, and escapes', () => {
    const hierarchy = [
      "<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>",
      '<hierarchy rotation="0">',
      '  <node text="A &amp; B &lt; C &quot;quoted&quot; &apos;ok&apos; '
        + '&#9; &#xA; &#32; &#x1F642;" />',
      '</hierarchy>',
      '',
    ].join('\n');
    const run = jest.fn((_command, args) => (
      args.includes('exec-out') ? hierarchy : 'UI hierarchy dumped'
    ));

    expect(readAndroidUiHierarchy({ ADB_PATH: '/sdk/adb' }, run)).toBe(hierarchy.trim());
  });

  it.each([
    ['empty', ''],
    ['invalid', '<node text="not a hierarchy root" />'],
  ])('rejects %s fresh Android public hierarchy XML', (_kind, hierarchy) => {
    const run = jest.fn((_command, args) => (
      args.includes('exec-out') ? hierarchy : 'UI hierarchy dumped'
    ));

    expect(() => readAndroidUiHierarchy({ ADB_PATH: '/sdk/adb' }, run))
      .toThrow(`Android UI hierarchy read returned ${hierarchy ? 'invalid' : 'empty'} XML`);
  });

  it('refuses to tap matching system text without a clickable target', () => {
    const hierarchy = [
      '<node resource-id="com.android.systemui:id/container" clickable="false">',
      '<node text="3 reviews are ready" resource-id="android:id/text" clickable="false" bounds="[179,676][891,729]" />',
      '</node>',
    ].join('');

    expect(findAndroidSystemNode(
      hierarchy,
      ['3 reviews are ready'],
      { clickableAncestor: true }
    )).toBeNull();
  });

  it('reads and taps public Android UI nodes through their exposed hierarchy bounds', () => {
    const hierarchy = '<hierarchy><node resource-id="com.chessticize.mobile:id/session-accessible-move-c2b3" clickable="true" bounds="[100,200][400,600]" /></hierarchy>';
    const run = jest.fn((_command, args) => (
      args.includes('exec-out') ? hierarchy : 'UI hierarchy dumped'
    ));
    const environment = {
      ADB_PATH: '/sdk/adb',
      DETOX_ANDROID_DEVICE: 'emulator-6000',
    };

    const visibleHierarchy = readAndroidUiHierarchy(environment, run);
    expect(visibleHierarchy).toBe(hierarchy);
    const moveNode = findUniqueAndroidUiNode(
      visibleHierarchy,
      'session-accessible-move-c2b3'
    );
    tapAndroidUiNode(moveNode, environment, run);

    expect(run.mock.calls).toEqual([
      ['/sdk/adb', [
        '-s', 'emulator-6000', 'shell', 'rm', '-f',
        '/sdcard/chessticize-public-window.xml'
      ], expect.objectContaining({ encoding: 'utf8' })],
      ['/sdk/adb', [
        '-s', 'emulator-6000', 'shell', 'uiautomator', 'dump',
        '/sdcard/chessticize-public-window.xml'
      ], expect.objectContaining({ encoding: 'utf8' })],
      ['/sdk/adb', [
        '-s', 'emulator-6000', 'exec-out', 'cat',
        '/sdcard/chessticize-public-window.xml'
      ], expect.objectContaining({ encoding: 'utf8' })],
      ['/sdk/adb', [
        '-s', 'emulator-6000', 'shell', 'input', 'tap', '250', '400'
      ], expect.objectContaining({ encoding: 'utf8' })],
    ]);
  });

  it('rejects a stale hierarchy when a fresh Android UI dump fails', () => {
    const staleHierarchy = '<hierarchy><node resource-id="session-accessible-move-c2b3" /></hierarchy>';
    let remoteHierarchy = staleHierarchy;
    const run = jest.fn((_command, args) => {
      if (args.includes('rm')) {
        remoteHierarchy = '';
        return '';
      }
      if (args.includes('uiautomator')) {
        return 'ERROR: could not get idle state.';
      }
      return remoteHierarchy;
    });

    expect(() => readAndroidUiHierarchy({ ADB_PATH: '/sdk/adb' }, run))
      .toThrow('Android UI hierarchy dump failed: ERROR: could not get idle state.');
    expect(run.mock.calls.some(([, args]) => args.includes('exec-out'))).toBe(false);
  });

  it('fails closed for missing, ambiguous, or invalid public Android UI bounds', () => {
    const validNode = '<node resource-id="com.chessticize.mobile:id/session-accessible-move-c2b3" clickable="true" bounds="[100,200][400,600]" />';

    expect(() => findUniqueAndroidUiNode('<hierarchy />', 'session-accessible-move-c2b3'))
      .toThrow('Missing visible Android UI node session-accessible-move-c2b3');
    expect(() => findUniqueAndroidUiNode(
      `<hierarchy>${validNode}${validNode}</hierarchy>`,
      'session-accessible-move-c2b3'
    )).toThrow('Ambiguous visible Android UI node session-accessible-move-c2b3: 2 matches');
    expect(() => findUniqueAndroidUiNode(
      '<node resource-id="com.chessticize.mobile:id/session-accessible-move-c2b3" clickable="true" bounds="[100,200][100,600]" />',
      'session-accessible-move-c2b3'
    )).toThrow('Invalid visible bounds for Android UI node session-accessible-move-c2b3');
  });

  it('polls for native Modal closure and the next public Android UI state', async () => {
    const hierarchies = [
      [
        '<node resource-id="com.chessticize.mobile:id/session-accessible-move-c2b1" clickable="true" bounds="[100,200][400,600]" />',
        '<node resource-id="com.chessticize.mobile:id/session-accessible-move-c2b3" clickable="true" bounds="[100,600][400,1000]" />',
      ].join(''),
      '<node resource-id="com.chessticize.mobile:id/session-mistakes" content-desc="Mistakes 1 of 3" bounds="[0,1600][1080,2200]" />',
    ];
    let clock = 0;
    const delay = jest.fn(async (milliseconds) => {
      clock += milliseconds;
    });
    const readHierarchy = jest.fn(() => hierarchies.shift() ?? '<hierarchy />');

    const state = await waitForAndroidUiState({
      presentResourceIds: ['session-mistakes'],
      absentResourceIds: [
        'session-accessible-move-c2b1',
        'session-accessible-move-c2b3',
      ],
      expectedAttributesByResourceId: {
        'session-mistakes': { 'content-desc': 'Mistakes 1 of 3' },
      },
    }, {
      delay,
      now: () => clock,
      pollIntervalMs: 5,
      readHierarchy,
      timeoutMs: 20,
    });

    expect(state.nodes['session-mistakes'].bounds).toEqual({
      bottom: 2200,
      left: 0,
      right: 1080,
      top: 1600,
    });
    expect(readHierarchy).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledWith(5);
  });

  it('retries fresh Android UI dump and read failures before accepting public state', async () => {
    const hierarchy = '<node resource-id="com.chessticize.mobile:id/session-mistakes" content-desc="Mistakes 1 of 3" bounds="[0,1600][1080,2200]" />';
    const attempts = [
      new Error('Android UI hierarchy dump failed: ERROR: could not get idle state.'),
      new Error('Android UI hierarchy read returned empty XML'),
      hierarchy,
    ];
    let clock = 0;
    const delay = jest.fn(async (milliseconds) => {
      clock += milliseconds;
    });
    const readHierarchy = jest.fn(() => {
      const attempt = attempts.shift();
      if (attempt instanceof Error) {
        throw attempt;
      }
      return attempt;
    });

    await expect(waitForAndroidUiState({
      presentResourceIds: ['session-mistakes'],
      expectedAttributesByResourceId: {
        'session-mistakes': { 'content-desc': 'Mistakes 1 of 3' },
      },
    }, {
      delay,
      now: () => clock,
      pollIntervalMs: 5,
      readHierarchy,
      timeoutMs: 20,
    })).resolves.toMatchObject({ hierarchy });

    expect(readHierarchy).toHaveBeenCalledTimes(3);
    expect(delay).toHaveBeenCalledTimes(2);
  });

  it('reports the latest fresh hierarchy read failure when polling times out', async () => {
    let clock = 0;
    const delay = async (milliseconds) => {
      clock += milliseconds;
    };

    await expect(waitForAndroidUiState({
      presentResourceIds: ['session-mistakes'],
    }, {
      delay,
      now: () => clock,
      pollIntervalMs: 5,
      readHierarchy: () => {
        throw new Error('Android UI hierarchy read returned empty XML');
      },
      timeoutMs: 10,
    })).rejects.toThrow(
      'latest=Android UI hierarchy read returned empty XML; hierarchy=<unavailable>'
    );
  });

  it('times out with the missing public Android UI state in its diagnostic', async () => {
    let clock = 0;
    const delay = async (milliseconds) => {
      clock += milliseconds;
    };

    await expect(waitForAndroidUiState({
      presentResourceIds: ['session-mistakes'],
      absentResourceIds: ['session-accessible-move-c2b3'],
      expectedAttributesByResourceId: {
        'session-mistakes': { 'content-desc': 'Mistakes 1 of 3' },
      },
    }, {
      delay,
      now: () => clock,
      pollIntervalMs: 5,
      readHierarchy: () => '<hierarchy />',
      timeoutMs: 10,
    })).rejects.toThrow(
      'Timed out waiting for Android UI state: present=session-mistakes; absent=session-accessible-move-c2b3'
    );
  });

  it('counts only current pending alarms and excludes canceled alarm history', () => {
    const action = 'com.chessticize.mobile.action.DELIVER_REVIEW_REMINDER';
    const state = [
      '2 pending alarms:',
      '  RTC_WAKEUP #1: Alarm{current type 0 origWhen 1784180920629 com.chessticize.mobile}',
      `    tag=*walarm*:${action}`,
      '  RTC #45: Alarm{other type 1 origWhen 9223372036854775807 com.google.android.googlequicksearchbox}',
      '    tag=*alarm*:unrelated',
      'LazyAlarmStore stats:',
      '  GET_NEXT_DELIVERY_TIME: count=772',
      'Recent alarm history:',
      '  #1: Reason=alarm_cancelled',
      '    Snapshot:',
      `      type=RTC_WAKEUP tag=*walarm*:${action}`,
      '  #2: Reason=alarm_cancelled',
      '    Snapshot:',
      `      type=RTC_WAKEUP tag=*walarm*:${action}`,
    ].join('\n');

    expect(findPendingAndroidAlarms(state, action)).toEqual([expect.objectContaining({
      identity: `tag=*walarm*:${action}`,
      triggerMs: 1784180920629,
    })]);
  });

  it('retains genuinely duplicated current alarms for the one-alarm assertion to reject', () => {
    const action = 'com.chessticize.mobile.action.DELIVER_REVIEW_REMINDER';
    const state = [
      '2 pending alarms:',
      '  RTC_WAKEUP #1: Alarm{first type 0 origWhen 1784180920629 com.chessticize.mobile}',
      `    tag=*walarm*:${action}`,
      '  RTC_WAKEUP #2: Alarm{second type 0 origWhen 1784180921629 com.chessticize.mobile}',
      `    tag=*walarm*:${action}`,
      'LazyAlarmStore stats:',
    ].join('\n');

    expect(findPendingAndroidAlarms(state, action)).toHaveLength(2);
  });

  it('resets Android runtime permission after Detox recreates and grants the app', async () => {
    let permissionGranted = true;
    const resetPermission = jest.fn(() => {
      permissionGranted = false;
    });
    const launch = jest.fn(async ({ delete: deleteApp }) => {
      if (deleteApp) {
        permissionGranted = true;
      }
    });

    await launchWithFreshAndroidRuntimePermission(resetPermission, launch);

    expect(permissionGranted).toBe(false);
  });

  it('grants Android runtime permission from an explicit clean OS fixture', () => {
    const run = jest.fn();

    grantAndroidRuntimePermission(
      'com.chessticize.mobile',
      'android.permission.POST_NOTIFICATIONS',
      { ADB_PATH: '/sdk/adb', DETOX_ANDROID_DEVICE: 'emulator-6000' },
      run
    );

    expect(run.mock.calls).toEqual([
      ['/sdk/adb', [
        '-s', 'emulator-6000', 'shell', 'pm', 'clear-permission-flags',
        'com.chessticize.mobile', 'android.permission.POST_NOTIFICATIONS', 'user-set'
      ], { encoding: 'utf8' }],
      ['/sdk/adb', [
        '-s', 'emulator-6000', 'shell', 'pm', 'clear-permission-flags',
        'com.chessticize.mobile', 'android.permission.POST_NOTIFICATIONS', 'user-fixed'
      ], { encoding: 'utf8' }],
      ['/sdk/adb', [
        '-s', 'emulator-6000', 'shell', 'pm', 'grant',
        'com.chessticize.mobile', 'android.permission.POST_NOTIFICATIONS'
      ], { encoding: 'utf8' }],
    ]);
  });

  it('passes Android synchronization disablement in the numeric form Detox recognizes', () => {
    const helpers = fs.readFileSync(path.resolve(__dirname, '../e2e/helpers.js'), 'utf8');
    const launchSpec = fs.readFileSync(path.resolve(__dirname, '../e2e/android-launch.e2e.js'), 'utf8');

    expect(helpers).toContain('detoxEnableSynchronization: 0');
    expect(launchSpec).toContain('launchWithDisabledSynchronization');
    expect(helpers).not.toContain('detoxEnableSynchronization: false');
    expect(launchSpec).not.toContain('detoxEnableSynchronization: false');
  });

  it('normalizes the practice scroll before a directional public-visibility search', () => {
    const helpers = fs.readFileSync(path.resolve(__dirname, '../e2e/helpers.js'), 'utf8');
    const helperStart = helpers.indexOf('async function waitForVisibleInPracticeScroll');
    const helperEnd = helpers.indexOf('async function tapUntilExists', helperStart);
    const helper = helpers.slice(helperStart, helperEnd);
    const waitForExist = helper.indexOf('.toExist().withTimeout(180000)');
    const restoreTop = helper.indexOf("element(by.id('practice-main-scroll')).scrollTo('top')");
    const requireVisible = helper.indexOf('.toBeVisible()');
    const scrollDown = helper.indexOf(".scroll(100, 'down')");

    expect(waitForExist).toBeGreaterThan(0);
    expect(restoreTop).toBeGreaterThan(waitForExist);
    expect(requireVisible).toBeGreaterThan(restoreTop);
    expect(scrollDown).toBeGreaterThan(requireVisible);
  });

  it('pins the Arrow Duel screenshot to the exact runtime-selected long-arrow fixture', () => {
    const practiceSpec = fs.readFileSync(path.resolve(__dirname, '../e2e/practice.e2e.js'), 'utf8');
    const renderCaseStart = practiceSpec.indexOf("it('renders Arrow Duel candidate arrows on the board'");
    const renderCaseEnd = practiceSpec.indexOf("it('shows Arrow Duel feedback after a wrong candidate move'");
    const renderCase = practiceSpec.slice(renderCaseStart, renderCaseEnd);

    expect(practiceSpec).toContain(
      "const PRACTICE_RENDER_PUZZLE_SELECTION_SEED = 'practice-arrow-render-v1:4';"
    );
    expect(practiceSpec).toContain(
      'chessticizePuzzleSelectionSeed: PRACTICE_RENDER_PUZZLE_SELECTION_SEED'
    );
    expect(renderCase).toContain(
      "waitForElementTextContaining('arrow-duel-candidate-overlay', 'c3e4', 10000)"
    );
    expect(renderCase).toContain(
      "waitForElementTextContaining('arrow-duel-candidate-overlay', 'h4f6', 10000)"
    );
    expect(renderCase.indexOf("'c3e4'")).toBeLessThan(
      renderCase.indexOf("takeScreenshot('arrow-duel-neutral-arrows')")
    );
    expect(renderCase).not.toContain('eQNYb');
    expect(renderCase).not.toContain("'d7d1'");
    expect(renderCase).not.toContain("'d7f7'");
    expect(practiceSpec).toContain('if (arrowLikePixels <= 5000)');
  });

  it('reacquires Android window focus before public UI assertions', async () => {
    const foregroundAndroidApp = jest.fn();
    const targetDevice = {
      disableSynchronization: jest.fn().mockResolvedValue(undefined),
      getPlatform: jest.fn(() => 'android'),
      launchApp: jest.fn().mockResolvedValue(undefined),
    };

    await launchWithDisabledSynchronization({
      delete: true,
      newInstance: true,
      launchArgs: { chessticizeTestNowMs: '1784030400000' },
    }, targetDevice, foregroundAndroidApp);

    expect(targetDevice.launchApp).toHaveBeenCalledTimes(1);
    expect(targetDevice.launchApp).toHaveBeenCalledWith({
      delete: true,
      newInstance: true,
      launchArgs: {
        DTXDisableMainRunLoopSync: 'YES',
        detoxEnableSynchronization: 0,
        chessticizeTestNowMs: '1784030400000',
      },
    });
    expect(foregroundAndroidApp).toHaveBeenCalledWith({
      DTXDisableMainRunLoopSync: 'YES',
      detoxEnableSynchronization: 0,
      chessticizeTestNowMs: '1784030400000',
    });
    expect(targetDevice.disableSynchronization).toHaveBeenCalledTimes(1);
  });

  it('foregrounds the attached Android activity with identical launch arguments', () => {
    const run = jest.fn(() => 'Status: ok\nActivity: com.chessticize.mobile/.MainActivity\n');

    bringAndroidAppToForeground({
      detoxEnableSynchronization: 0,
      chessticizePuzzleSelectionSeed: 'fixture-seed',
    }, {
      ANDROID_HOME: '/sdk',
      DETOX_ANDROID_DEVICE: 'emulator-5556',
    }, run);

    expect(run).toHaveBeenCalledWith('/sdk/platform-tools/adb', [
      '-s',
      'emulator-5556',
      'shell',
      'am',
      'start',
      '-W',
      '-n',
      'com.chessticize.mobile/.MainActivity',
      '--es',
      'detoxEnableSynchronization',
      '0',
      '--es',
      'chessticizePuzzleSelectionSeed',
      'fixture-seed',
    ], { encoding: 'utf8' });
  });

  it('captures actionable Android focus, hierarchy, and screenshot diagnostics', () => {
    const run = jest.fn((_command, args) => {
      const request = args.join(' ');
      if (request.includes('dumpsys window windows')) {
        return [
          'WINDOW MANAGER WINDOWS',
          '  mCurrentFocus=Window{123 u0 com.chessticize.mobile/com.chessticize.mobile.MainActivity}',
          '  mFocusedApp=ActivityRecord{456 com.chessticize.mobile/.MainActivity}',
        ].join('\n');
      }
      if (request.includes('dumpsys activity activities')) {
        return '  topResumedActivity=ActivityRecord{456 com.chessticize.mobile/.MainActivity}\n';
      }
      if (request.includes('pidof com.chessticize.mobile')) {
        return '4242\n';
      }
      if (request.includes('dumpsys activity processes com.chessticize.mobile')) {
        return '*APP* UID 10123 ProcessRecord{789 4242:com.chessticize.mobile/u0a123}\n';
      }
      if (request.includes('logcat -d -v threadtime -t 2000')) {
        return [
          '07-14 23:54:00.000 4242 4242 E ReactNative: Exception in native call',
          "07-14 23:54:00.001 4242 4242 E ReactNativeJS: PlatformConstants could not be found",
          '07-14 23:54:00.002 1000 1000 I unrelated: ignored',
        ].join('\n');
      }
      if (request.includes('uiautomator dump')) {
        return 'UI hierchary dumped to: /sdcard/chessticize-window.xml\n';
      }
      if (request.includes('cat /sdcard/chessticize-window.xml')) {
        return '<hierarchy><node text="Practice" /></hierarchy>';
      }
      if (request.includes('screencap -p')) {
        return Buffer.from('png');
      }
      throw new Error(`Unexpected ADB request: ${request}`);
    });
    const fileSystem = {
      mkdirSync: jest.fn(),
      writeFileSync: jest.fn(),
    };
    const log = jest.fn();

    collectAndroidUiDiagnostics({
      ANDROID_HOME: '/sdk',
      DETOX_ANDROID_DEVICE: 'emulator-5556',
    }, run, fileSystem, log, '/artifacts/android-ui');

    expect(run).toHaveBeenNthCalledWith(1, '/sdk/platform-tools/adb', [
      '-s',
      'emulator-5556',
      'shell',
      'dumpsys',
      'window',
      'windows',
    ], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, timeout: 30000 });
    expect(run).toHaveBeenNthCalledWith(2, '/sdk/platform-tools/adb', [
      '-s',
      'emulator-5556',
      'shell',
      'dumpsys',
      'activity',
      'activities',
    ], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, timeout: 30000 });
    expect(run).toHaveBeenNthCalledWith(3, '/sdk/platform-tools/adb', [
      '-s',
      'emulator-5556',
      'shell',
      'pidof',
      'com.chessticize.mobile',
    ], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, timeout: 30000 });
    expect(run).toHaveBeenNthCalledWith(4, '/sdk/platform-tools/adb', [
      '-s',
      'emulator-5556',
      'shell',
      'dumpsys',
      'activity',
      'processes',
      'com.chessticize.mobile',
    ], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, timeout: 30000 });
    expect(run).toHaveBeenNthCalledWith(5, '/sdk/platform-tools/adb', [
      '-s',
      'emulator-5556',
      'logcat',
      '-d',
      '-v',
      'threadtime',
      '-t',
      '2000',
    ], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 30000 });
    expect(run).toHaveBeenNthCalledWith(6, '/sdk/platform-tools/adb', [
      '-s',
      'emulator-5556',
      'shell',
      'uiautomator',
      'dump',
      '/sdcard/chessticize-window.xml',
    ], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, timeout: 30000 });
    expect(run).toHaveBeenNthCalledWith(7, '/sdk/platform-tools/adb', [
      '-s',
      'emulator-5556',
      'exec-out',
      'cat',
      '/sdcard/chessticize-window.xml',
    ], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, timeout: 30000 });
    expect(run).toHaveBeenNthCalledWith(8, '/sdk/platform-tools/adb', [
      '-s',
      'emulator-5556',
      'exec-out',
      'screencap',
      '-p',
    ], { maxBuffer: 25 * 1024 * 1024, timeout: 30000 });
    expect(fileSystem.mkdirSync).toHaveBeenCalledWith('/artifacts/android-ui', { recursive: true });
    expect(fileSystem.writeFileSync).toHaveBeenCalledWith(
      '/artifacts/android-ui/current-focus.txt',
      expect.stringContaining('mCurrentFocus=Window')
    );
    expect(fileSystem.writeFileSync).toHaveBeenCalledWith(
      '/artifacts/android-ui/window.xml',
      '<hierarchy><node text="Practice" /></hierarchy>'
    );
    expect(fileSystem.writeFileSync).toHaveBeenCalledWith(
      '/artifacts/android-ui/screenshot.png',
      Buffer.from('png')
    );
    expect(fileSystem.writeFileSync).toHaveBeenCalledWith(
      '/artifacts/android-ui/process-state.txt',
      expect.stringContaining('pid=4242')
    );
    expect(fileSystem.writeFileSync).toHaveBeenCalledWith(
      '/artifacts/android-ui/logcat.txt',
      expect.stringContaining('PlatformConstants could not be found')
    );
    expect(fileSystem.writeFileSync).not.toHaveBeenCalledWith(
      '/artifacts/android-ui/logcat.txt',
      expect.stringContaining('unrelated: ignored')
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining('[android-ui-diagnostics] current focus'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('<node text="Practice" />'));
  });

  it('shares Android UI diagnostics around launch, Stockfish, and key-flow failures', async () => {
    const launchSpec = fs.readFileSync(path.resolve(__dirname, '../e2e/android-launch.e2e.js'), 'utf8');
    const stockfishSpec = fs.readFileSync(path.resolve(__dirname, '../e2e/android-stockfish.e2e.js'), 'utf8');
    const flowsSpec = fs.readFileSync(path.resolve(__dirname, '../e2e/flows.e2e.js'), 'utf8');
    const actionError = new Error('journey failed');
    const action = jest.fn().mockRejectedValue(actionError);
    const collectDiagnostics = jest.fn(() => {
      throw new Error('diagnostics failed');
    });
    const log = jest.fn();

    await expect(withAndroidUiDiagnostics(action, collectDiagnostics, log)).rejects.toBe(actionError);

    expect(collectDiagnostics).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      '[android-ui-diagnostics] collection failed: diagnostics failed'
    );
    expect(launchSpec).toContain('withAndroidUiDiagnostics');
    expect(stockfishSpec).toContain('withAndroidUiDiagnostics');
    expect(flowsSpec).toContain('withAndroidUiDiagnostics');
    expect(launchSpec).not.toContain('async function withAndroidUiDiagnostics');
    expect(stockfishSpec).not.toContain('async function withAndroidUiDiagnostics');
    expect(flowsSpec).not.toContain('async function withAndroidUiDiagnostics');
  });

  it('shares inclusive and exclusive running-Stockfish depth polling', async () => {
    const stockfishSpec = fs.readFileSync(path.resolve(__dirname, '../e2e/android-stockfish.e2e.js'), 'utf8');
    const practiceSpec = fs.readFileSync(path.resolve(__dirname, '../e2e/practice.e2e.js'), 'utf8');
    const wait = jest.fn().mockResolvedValue(undefined);
    const readInclusiveText = jest.fn().mockResolvedValue('SF 18 NNUE · Depth 4/20');
    const readExclusiveText = jest.fn()
      .mockResolvedValueOnce('SF 18 NNUE · Depth 8/20')
      .mockResolvedValueOnce('SF 18 NNUE · Depth 9/20');

    await expect(waitForRunningStockfishDepth(
      'review-analysis-engine-status',
      4,
      90000,
      { readText: readInclusiveText, wait }
    )).resolves.toBe(4);
    await expect(waitForRunningStockfishDepth(
      'review-analysis-engine-status',
      8,
      90000,
      { comparison: 'above', readText: readExclusiveText, wait }
    )).resolves.toBe(9);

    expect(readInclusiveText).toHaveBeenCalledWith('review-analysis-engine-status');
    expect(readExclusiveText).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(25);
    expect(stockfishSpec).toContain(
      "waitForRunningStockfishDepth('review-analysis-engine-status', 4, 90000)"
    );
    expect(practiceSpec).toContain("{ comparison: 'above' }");
    expect(stockfishSpec).not.toContain('async function waitForRunningStockfishDepth');
    expect(practiceSpec).not.toContain('async function waitForRunningStockfishDepth');
  });

  it.each([
    ['at-least', '', 'Timed out waiting for an active Stockfish search. Last text: "engine unavailable"'],
    ['above', ' above depth 8', 'Timed out waiting for an active Stockfish search above depth 8. Last text: "engine unavailable"'],
  ])('preserves the %s Stockfish depth timeout diagnostic', async (comparison, _description, message) => {
    let nowMs = 0;
    const wait = jest.fn(async (pollIntervalMs) => {
      nowMs += pollIntervalMs;
    });

    await expect(waitForRunningStockfishDepth(
      'review-analysis-engine-status',
      8,
      25,
      {
        comparison,
        now: () => nowMs,
        readText: jest.fn().mockRejectedValue(new Error('engine unavailable')),
        wait,
      }
    )).rejects.toThrow(message);

    expect(wait).toHaveBeenCalledWith(25);
  });

  it('restarts the native Stockfish analysis journey through persisted public UI', () => {
    const practiceSpec = fs.readFileSync(path.resolve(__dirname, '../e2e/practice.e2e.js'), 'utf8');

    expect(practiceSpec).toContain('await device.terminateApp()');
    expect(practiceSpec).toContain('await openStandardHistoryTrend()');
    expect(practiceSpec).toContain("newInstance: true");
    expect(practiceSpec).toContain("delete: false");
    expect(practiceSpec).toContain("waitForElementTextContaining('review-analysis-engine-status', 'SF 18 NNUE'");
  });

  it('runs every active E2E spec by default without loading opt-in capture specs', () => {
    expect(resolveDetoxTestMatch({})).toEqual(ACTIVE_E2E_TEST_MATCH);
    expect(ACTIVE_E2E_TEST_MATCH).toEqual([
      '<rootDir>/e2e/practice.e2e.js',
      '<rootDir>/e2e/flows.e2e.js'
    ]);
  });

  it('keeps the shared flows suite portable across iOS and Android', () => {
    const flowsSpec = fs.readFileSync(path.resolve(__dirname, '../e2e/flows.e2e.js'), 'utf8');
    const reminderCaseStart = flowsSpec.indexOf(
      "it('handles review reminders through the platform capability'"
    );
    const reminderCaseEnd = flowsSpec.indexOf(
      "it('shows failed attempts in history with the wrong-only toggle'"
    );
    const reminderCase = flowsSpec.slice(reminderCaseStart, reminderCaseEnd);

    expect(flowsSpec).toContain("device.getPlatform() === 'android'");
    expect(reminderCase).toContain('grantAndroidNotificationPermission();');
    expect(reminderCase.indexOf('grantAndroidNotificationPermission();')).toBeLessThan(
      reminderCase.indexOf('launchAppAt(sprintNowMs')
    );
    expect(reminderCase).toContain('Android may deliver later');
    expect(reminderCase).not.toContain('Notifications unavailable on this device');
    expect(reminderCase).not.toContain('return;');
    expect(reminderCase).toContain("settings-review-reminder-fixed-1900");
    expect(reminderCase).toContain("'|3|3 reviews are ready|review'");
    expect(reminderCase).toContain("settings-review-reminder-off");
    expect(flowsSpec).toContain('expectedInstalledBuildNumber()');
    expect(flowsSpec).toContain('expectedInstalledPublicVersion()');
    expect(flowsSpec).toContain('releaseVersion.publicVersion');
    expect(flowsSpec).toContain('releaseVersion.iosPublicVersion');
    expect(flowsSpec).toContain('releaseVersion.androidVersionCode');
    expect(flowsSpec).toContain('releaseVersion.iosBuildNumber');
    expect(flowsSpec).toContain("historyToggleValue('Wrong puzzles only', false)");
    expect(flowsSpec).toContain("historyToggleValue('Sprint attempts only', true)");
    expect(flowsSpec).toContain("return `${label}, ${active ? 'On' : 'Off'}`");
    expect(flowsSpec).toContain("return active ? '1' : '0'");
    expect(flowsSpec).not.toContain('toHaveToggleValue');
  });

  it('partitions every active spec exactly once across the two CI suites', () => {
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'all' }))
      .toEqual(ACTIVE_E2E_TEST_MATCH);
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'practice' }))
      .toEqual(ACTIVE_E2E_TEST_MATCH_BY_SUITE.practice);
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'flows' }))
      .toEqual(ACTIVE_E2E_TEST_MATCH_BY_SUITE.flows);

    const partitionedSpecs = Object.values(ACTIVE_E2E_TEST_MATCH_BY_SUITE).flat();
    expect(partitionedSpecs).toEqual(ACTIVE_E2E_TEST_MATCH);
    expect(new Set(partitionedSpecs).size).toBe(ACTIVE_E2E_TEST_MATCH.length);
  });

  it('rejects unknown or mixed active suite selections', () => {
    expect(() => resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'unknown' }))
      .toThrow('Unknown DETOX_ACTIVE_SUITE "unknown".');
    expect(() => resolveDetoxTestMatch({
      DETOX_ACTIVE_SUITE: 'practice',
      CHESSTICIZE_CAPTURE_STORE_ASSETS: '1'
    })).toThrow('Active E2E and screenshot capture suites must run separately.');
  });

  it('keeps the App Store screenshot spec available through its opt-in command', () => {
    expect(resolveDetoxTestMatch({ CHESSTICIZE_CAPTURE_STORE_ASSETS: '1' }))
      .toEqual(STORE_ASSETS_TEST_MATCH);
  });

  it('keeps the adaptive layout screenshot spec available through its opt-in command', () => {
    expect(resolveDetoxTestMatch({ CHESSTICIZE_CAPTURE_ADAPTIVE_LAYOUT: '1' }))
      .toEqual(ADAPTIVE_LAYOUT_TEST_MATCH);
  });

  it('keeps Android adaptive evidence isolated as a targeted public-UI suite', () => {
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'android-adaptive-layout' }))
      .toEqual(ANDROID_ADAPTIVE_LAYOUT_TEST_MATCH);
    expect(ANDROID_ADAPTIVE_LAYOUT_TEST_MATCH).toEqual(ADAPTIVE_LAYOUT_TEST_MATCH);
    expect(ACTIVE_E2E_TEST_MATCH).not.toContain(ANDROID_ADAPTIVE_LAYOUT_TEST_MATCH[0]);

    const spec = fs.readFileSync(path.resolve(__dirname, '../e2e/adaptive-layout.e2e.js'), 'utf8');
    const screen = fs.readFileSync(
      path.resolve(__dirname, '../src/components/PracticePocScreen.tsx'),
      'utf8'
    );
    const evidence = fs.readFileSync(
      path.resolve(__dirname, '../scripts/android-adaptive-layout-evidence.sh'),
      'utf8'
    );
    const workflow = fs.readFileSync(
      path.resolve(__dirname, '../../../.github/workflows/mobile-android.yml'),
      'utf8'
    );

    const requestLandscape = spec.indexOf("setAdaptiveOrientation('landscape')");
    const waitForSettledLandscape = spec.indexOf(
      "waitForSettledSprintLayout('landscape')",
      requestLandscape
    );
    const captureLandscape = spec.indexOf(
      "captureSprint('landscape', { waitForPieces: true })",
      requestLandscape
    );
    const settledLayoutHelperStart = spec.indexOf('async function waitForSettledSprintLayout');
    const settledLayoutHelperEnd = spec.indexOf('async function waitForHomeTopFrame', settledLayoutHelperStart);
    const settledLayoutHelper = spec.slice(settledLayoutHelperStart, settledLayoutHelperEnd);
    const adaptiveOrientationHelperStart = spec.indexOf('async function setAdaptiveOrientation');
    const adaptiveOrientationHelperEnd = spec.indexOf(
      'async function waitForOrientation',
      adaptiveOrientationHelperStart
    );
    const adaptiveOrientationHelper = spec.slice(
      adaptiveOrientationHelperStart,
      adaptiveOrientationHelperEnd
    );
    expect(requestLandscape).toBeGreaterThan(0);
    expect(waitForSettledLandscape).toBeGreaterThan(requestLandscape);
    expect(captureLandscape).toBeGreaterThan(waitForSettledLandscape);
    expect(spec).not.toContain('sleep(1200)');
    expect(spec).not.toContain("device.setOrientation('landscape')");
    expect(spec).toContain('Timed out waiting for ${orientation} layout');
    expect(spec).toContain('Timed out waiting for ${orientation} session layout geometry');
    expect(spec).toContain('last observed frames=${JSON.stringify(lastFrames)}');
    expect(spec).toContain('await captureSprint(initialOrientation);');
    expect(spec).toContain("await captureSprint('landscape', { waitForPieces: true });");
    expect(spec).toContain('async function captureSprint(orientation, { waitForPieces = false } = {})');
    expect(spec).toContain('if (waitForPieces) {');
    expect(spec).toContain('await waitForBoardScreenshotContainsPieces({');
    expect(spec).toContain('archiveScreenshot: archiveAdaptiveScreenshot');
    expect(spec).toContain('captureScreenshot: (label) => device.takeScreenshot(label)');
    expect(spec).toContain("require('./adaptiveScreenshotEvidence')");
    expect(spec).toContain('const archiveAdaptiveScreenshot = createAdaptiveScreenshotArchiver();');
    expect(spec).toContain('expectBoardScreenshotContainsPieces(screenshotPath, boardFrame, screenFrame);');
    expect(spec).not.toContain('await sleep(5000)');
    expect(settledLayoutHelper).toContain("frameForIfPresent('active-session-adaptive-layout')");
    expect(settledLayoutHelper).toContain("frameFor(element(by.id('session-board')))");
    expect(settledLayoutHelper).toContain('expectFrameContained(');
    expect(spec).toContain("elementText('session-current-puzzle-id')");
    expect(spec).not.toContain('session-current-expected-move');
    expect(screen).not.toContain('session-current-expected-move');
    expect(spec).not.toContain("session-accessible-moves-open");
    expect(spec).not.toContain('waitForAndroidPublicMoves');
    expect(spec).not.toContain('tapAndroidUiNode');
    expect(spec).not.toContain('waitForAndroidUiState');
    expect(spec).not.toContain("playBoardMove('session-board', 'e2e6')");
    const submitFirstWrongBoardMove = spec.indexOf("playBoardMove('session-board', 'c2b3')");
    const verifyFirstWrongMoveResult = spec.indexOf(
      "waitFor(element(by.label('Mistakes 1 of 3')).atIndex(0)).toExist()",
      submitFirstWrongBoardMove
    );
    const waitForFeedbackToSettle = spec.indexOf(
      "waitFor(element(by.id('move-feedback-overlay'))).not.toExist()",
      verifyFirstWrongMoveResult
    );
    const submitSecondWrongBoardMove = spec.indexOf("playBoardMove('session-board', 'c4b5')");
    const restorePortrait = spec.indexOf(
      "await setAdaptiveOrientation('portrait')",
      captureLandscape
    );
    const settleRestoredPortrait = spec.indexOf(
      "await waitForSettledSprintLayout('portrait')",
      restorePortrait
    );
    const settlePublicRootFocus = spec.indexOf(
      "waitFor(element(by.id('adaptive-layout'))).toBeVisible().withTimeout(10000)",
      settleRestoredPortrait
    );
    const verifyRestoredPuzzle = spec.indexOf('restoredPuzzleID', settlePublicRootFocus);
    expect(submitFirstWrongBoardMove).toBeGreaterThan(verifyRestoredPuzzle);
    expect(verifyFirstWrongMoveResult).toBeGreaterThan(submitFirstWrongBoardMove);
    expect(waitForFeedbackToSettle).toBeGreaterThan(verifyFirstWrongMoveResult);
    expect(submitSecondWrongBoardMove).toBeGreaterThan(waitForFeedbackToSettle);
    expect(spec).not.toContain("waitFor(element(by.id('session-accessible-moves-dialog')))");
    expect(spec).toContain('withAndroidUiDiagnostics(async () =>');
    expect(restorePortrait).toBeGreaterThan(captureLandscape);
    expect(settleRestoredPortrait).toBeGreaterThan(restorePortrait);
    expect(settlePublicRootFocus).toBeGreaterThan(settleRestoredPortrait);
    expect(verifyRestoredPuzzle).toBeGreaterThan(settlePublicRootFocus);
    expect(spec).toContain('setAndroidDisplayOrientation(orientation)');
    expect(spec).toContain('actual-root-bounds=${frame.width}x${frame.height}');
    expect(adaptiveOrientationHelper.indexOf('setAndroidDisplayOrientation(orientation)')).toBeGreaterThan(0);
    expect(adaptiveOrientationHelper.indexOf('await waitForOrientation(orientation)'))
      .toBeGreaterThan(adaptiveOrientationHelper.indexOf('setAndroidDisplayOrientation(orientation)'));
    expect(adaptiveOrientationHelper.indexOf('fs.appendFileSync'))
      .toBeGreaterThan(adaptiveOrientationHelper.indexOf('await waitForOrientation(orientation)'));
    expect(evidence).toContain('phone:1080x2400:420:both:1');
    expect(evidence).toContain('tablet:1600x2560:320:both:1');
    expect(evidence).toContain('foldable:1768x2208:420:landscape:1');
    expect(evidence).toContain('chromeos:1200x1920:240:landscape:1');
    expect(evidence).toContain('large-text-phone:1080x2400:420:portrait:1.5');
    expect(evidence).toContain('wm size reset');
    expect(evidence).toContain('wm density reset');
    expect(evidence).toContain('settings put system font_scale');
    expect(evidence).toContain('CHESSTICIZE_ADAPTIVE_ORIENTATION_EVIDENCE="$profile_root/display.txt"');
    const profileLoop = evidence.indexOf('for profile_spec in "${profiles[@]}"');
    const stopPreviousProfile = evidence.indexOf(
      'shell am force-stop com.chessticize.mobile',
      profileLoop
    );
    const resetUserRotation = evidence.indexOf(
      'shell wm user-rotation lock 0',
      profileLoop
    );
    const applyProfileSize = evidence.indexOf('shell wm size "$size"', profileLoop);
    expect(stopPreviousProfile).toBeGreaterThan(profileLoop);
    expect(resetUserRotation).toBeGreaterThan(stopPreviousProfile);
    expect(applyProfileSize).toBeGreaterThan(resetUserRotation);
    expect(evidence).toContain('original_user_rotation_state');
    expect(evidence).toContain('restore_display_rotation');
    expect(evidence).toContain('git diff --quiet');
    expect(workflow).toContain('Android adaptive public UI');
    expect(workflow).toContain("if: github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain('apps/mobile/scripts/android-adaptive-layout-evidence.sh');
    expect(workflow).toContain('android-adaptive-layout-evidence');
  });

  it('polls physical Android rotation to convergence and fails closed with bounded diagnostics', async () => {
    const environment = {
      ADB_PATH: '/sdk/platform-tools/adb',
      DETOX_ANDROID_DEVICE: 'emulator-6000',
    };
    const calls = [];
    let rotationReads = 0;
    const run = (command, args) => {
      calls.push([command, args]);
      if (args.join(' ') === '-s emulator-6000 shell wm user-rotation') {
        rotationReads += 1;
        return rotationReads < 3 ? 'lock 0\n' : 'lock 1\n';
      }
      return '';
    };
    const wait = jest.fn().mockResolvedValue(undefined);

    await expect(Promise.resolve().then(() => setAndroidDisplayOrientation(
      'landscape',
      environment,
      run,
      { maxAttempts: 3, pollIntervalMs: 25, wait }
    ))).resolves.toEqual({
      actualRotation: 1,
      requestedRotation: 1,
    });
    expect(calls).toEqual([
      ['/sdk/platform-tools/adb', ['-s', 'emulator-6000', 'shell', 'wm', 'user-rotation']],
      ['/sdk/platform-tools/adb', ['-s', 'emulator-6000', 'shell', 'wm', 'user-rotation', 'lock', '1']],
      ['/sdk/platform-tools/adb', ['-s', 'emulator-6000', 'shell', 'wm', 'user-rotation']],
      ['/sdk/platform-tools/adb', ['-s', 'emulator-6000', 'shell', 'wm', 'user-rotation']],
    ]);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledWith(25);

    await expect(Promise.resolve().then(() => setAndroidDisplayOrientation(
      'landscape',
      environment,
      () => 'unknown command: user-rotation'
    ))).rejects.toThrow('does not support wm user-rotation');

    const permanentlyStaleWait = jest.fn().mockResolvedValue(undefined);
    await expect(Promise.resolve().then(() => setAndroidDisplayOrientation(
      'portrait',
      environment,
      (_command, args) => (
        args.join(' ') === '-s emulator-6000 shell wm user-rotation' ? 'lock 1\n' : ''
      ),
      { maxAttempts: 3, pollIntervalMs: 25, wait: permanentlyStaleWait }
    ))).rejects.toThrow(
      'Android display rotation did not apply after 3 attempts: requested=0, last state="lock 1"'
    );
    expect(permanentlyStaleWait).toHaveBeenCalledTimes(2);
  });

  it('keeps the Android launch smoke isolated from the iOS regression suites', () => {
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'android-launch' }))
      .toEqual(ANDROID_LAUNCH_TEST_MATCH);
    expect(ACTIVE_E2E_TEST_MATCH).not.toContain(ANDROID_LAUNCH_TEST_MATCH[0]);
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'android-standard-practice' }))
      .toEqual(ANDROID_STANDARD_PRACTICE_TEST_MATCH);
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'android-board-orientation' }))
      .toEqual(ANDROID_BOARD_ORIENTATION_TEST_MATCH);
    expect(ACTIVE_E2E_TEST_MATCH).not.toContain(ANDROID_BOARD_ORIENTATION_TEST_MATCH[0]);
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'android-arrow-duel' }))
      .toEqual(ANDROID_ARROW_DUEL_TEST_MATCH);
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'android-custom-practice' }))
      .toEqual(ANDROID_CUSTOM_PRACTICE_TEST_MATCH);
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'android-history' }))
      .toEqual(ANDROID_HISTORY_TEST_MATCH);
    expect(ACTIVE_E2E_TEST_MATCH).not.toContain(ANDROID_CUSTOM_PRACTICE_TEST_MATCH[0]);
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'android-migration' }))
      .toEqual(ANDROID_MIGRATION_TEST_MATCH);
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'android-offline-practice' }))
      .toEqual(ANDROID_OFFLINE_PRACTICE_TEST_MATCH);
    expect(ANDROID_OFFLINE_PRACTICE_TEST_MATCH).toEqual([
      ANDROID_LAUNCH_TEST_MATCH[0],
      ANDROID_STANDARD_PRACTICE_TEST_MATCH[0],
      ANDROID_MIGRATION_TEST_MATCH[0],
    ]);
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'android-api24-smoke' }))
      .toEqual(ANDROID_API24_SMOKE_TEST_MATCH);
    expect(ANDROID_API24_SMOKE_TEST_MATCH).toEqual([
      ANDROID_LAUNCH_TEST_MATCH[0],
      ANDROID_STANDARD_PRACTICE_TEST_MATCH[0],
      ANDROID_MIGRATION_TEST_MATCH[0],
      ANDROID_STOCKFISH_SMOKE_TEST_MATCH[0],
    ]);
    expect(ANDROID_STOCKFISH_SMOKE_TEST_MATCH).toEqual([
      '<rootDir>/e2e/android-stockfish-smoke.e2e.js',
    ]);
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'android-progress-backup-restore' }))
      .toEqual(ANDROID_PROGRESS_BACKUP_RESTORE_TEST_MATCH);
    expect(ACTIVE_E2E_TEST_MATCH).not.toContain(ANDROID_PROGRESS_BACKUP_RESTORE_TEST_MATCH[0]);
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'android-system-back' }))
      .toEqual(ANDROID_SYSTEM_BACK_TEST_MATCH);
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'android-review-reminders' }))
      .toEqual(ANDROID_REVIEW_REMINDERS_TEST_MATCH);
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'android-adaptive-layout' }))
      .toEqual(ANDROID_ADAPTIVE_LAYOUT_TEST_MATCH);
  });

  it('scales Android board-orientation screenshots through the public screen frame', () => {
    const spec = fs.readFileSync(
      path.resolve(__dirname, '../e2e/android-board-orientation.e2e.js'),
      'utf8'
    );

    expect(spec).toContain(
      "const screenFrame = await frameFor(element(by.id('adaptive-layout')));"
    );
    expect(spec).toContain([
      '        occupiedSquares(startingPosition),',
      '        flipped,',
      '        screenFrame',
    ].join('\n'));
  });

  it('advances Android board-orientation evidence through stable public state', () => {
    const spec = fs.readFileSync(
      path.resolve(__dirname, '../e2e/android-board-orientation.e2e.js'),
      'utf8'
    );

    expect(spec).toContain(
      'const autoReply = puzzle.solutionMoves[(userMoveIndex * 2) + 2];'
    );
    expect(spec).toContain(
      '`Last move ${autoReply.slice(0, 2)} to ${autoReply.slice(2, 4)}`'
    );
    expect(spec).toContain(
      'if (puzzleIndex === FAMILIAR_15_PUZZLES.length - 1) {'
    );
    expect(spec).not.toContain(
      "waitFor(element(by.id('move-feedback-overlay'))).toExist()"
    );
    expect(spec).not.toContain('expect(unflippedToFlipped)');
    expect(spec).toContain(
      'if (unflippedToFlipped === 0 || flippedToUnflipped === 0) {'
    );
  });

  it('resets Stockfish state without uninstalling the attached Android test app', () => {
    const stockfishSpecs = [
      '../e2e/android-stockfish-smoke.e2e.js',
      '../e2e/android-stockfish.e2e.js',
    ].map(relativePath => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8'));

    for (const spec of stockfishSpecs) {
      expect(spec).toContain('resetAppState: true');
      expect(spec).not.toContain('delete: true');
    }
  });

  it('drives Predictive Back through the Android edge gesture and can verify root delegation', () => {
    const run = jest.fn((_, args) => {
      if (args.includes('size')) {
        return 'Physical size: 1080x1920\n';
      }
      if (args.includes('activities')) {
        return 'mResumedActivity: ActivityRecord{1 u0 com.android.launcher/.Launcher t1}';
      }
      return '';
    });

    performAndroidPredictiveBackGesture({
      ADB_PATH: '/sdk/adb',
      DETOX_ANDROID_DEVICE: 'emulator-6000'
    }, run);

    expect(run).toHaveBeenCalledWith('/sdk/adb', [
      '-s', 'emulator-6000', 'shell', 'cmd', 'overlay', 'enable-exclusive', '--category',
      'com.android.internal.systemui.navbar.gestural'
    ], { encoding: 'utf8' });
    expect(run).toHaveBeenCalledWith('/sdk/adb', [
      '-s', 'emulator-6000', 'shell', 'input', 'swipe', '1', '960', '432', '960', '500'
    ], { encoding: 'utf8' });
    expect(androidAppIsResumed({
      ADB_PATH: '/sdk/adb',
      DETOX_ANDROID_DEVICE: 'emulator-6000'
    }, run)).toBe(false);
  });

  it('streams cancelled Predictive Back through black-box Android system input', async () => {
    const run = jest.fn((_, args) => args.includes('size') ? 'Physical size: 1080x1920\n' : '');
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    const spawnProcess = jest.fn(() => child);

    const gesture = beginAndroidPredictiveBackGesture(
      { cancel: true, durationMs: 1200 },
      { ADB_PATH: '/sdk/adb', DETOX_ANDROID_DEVICE: 'emulator-6000' },
      run,
      spawnProcess
    );

    expect(spawnProcess).toHaveBeenCalledTimes(1);
    const [command, args, options] = spawnProcess.mock.calls[0];
    expect(command).toBe('/sdk/adb');
    expect(args.slice(0, 5)).toEqual([
      '-s', 'emulator-6000', 'shell', 'sh', '-c'
    ]);
    expect(options).toEqual({ stdio: ['ignore', 'pipe', 'pipe'] });
    const gestureScript = args[5];
    expect(gestureScript).toContain('input touchscreen motionevent DOWN 1 960');
    expect(gestureScript).toContain('input touchscreen motionevent MOVE 486 960');
    expect(gestureScript).toContain("printf '%s\\n' CHESSTICIZE_PREDICTIVE_BACK_STARTED");
    expect(gestureScript).toContain('input touchscreen motionevent MOVE 32 960');
    expect(gestureScript).toContain('input touchscreen motionevent UP 32 960');
    expect(gestureScript.indexOf('motionevent DOWN')).toBeLessThan(
      gestureScript.indexOf('motionevent MOVE 486')
    );
    expect(gestureScript.indexOf('motionevent MOVE 486')).toBeLessThan(
      gestureScript.indexOf('motionevent MOVE 32')
    );
    expect(gestureScript.indexOf('motionevent MOVE 32')).toBeLessThan(
      gestureScript.indexOf('motionevent UP 32')
    );
    expect(gestureScript).not.toMatch(/PredictiveBackGestureDriver|com\.chessticize\.mobile/);

    child.stdout.emit('data', 'CHESSTICIZE_PREDICTIVE_BACK_STARTED\n');
    await expect(gesture.started).resolves.toBeUndefined();
    child.emit('close', 0);
    await expect(gesture.completion()).resolves.toBeUndefined();

    const helpers = fs.readFileSync(path.resolve(__dirname, '../e2e/helpers.js'), 'utf8');
    expect(helpers).not.toContain('PredictiveBackGestureDriver');
    expect(helpers).not.toContain('getUiDevice');
    expect(fs.existsSync(path.resolve(
      __dirname,
      '../android/app/src/androidTest/java/com/chessticize/mobile/PredictiveBackGestureDriver.java'
    ))).toBe(false);
  });

  it('preserves committed Predictive Back edge geometry through Android system input', async () => {
    const run = jest.fn((_, args) => args.includes('size') ? 'Physical size: 1080x1920\n' : '');
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    const spawnProcess = jest.fn(() => child);
    const gesture = beginAndroidPredictiveBackGesture(
      {},
      { ADB_PATH: '/sdk/adb', DETOX_ANDROID_DEVICE: 'emulator-6000' },
      run,
      spawnProcess
    );

    expect(spawnProcess).toHaveBeenCalledWith('/sdk/adb', [
      '-s', 'emulator-6000', 'shell', 'input', 'swipe', '1', '960', '756', '960', '1800'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.emit('close', 0);
    await expect(gesture.started).resolves.toBeUndefined();
    await expect(gesture.completion()).resolves.toBeUndefined();
  });

  it('keeps a dedicated public-UI Android Back journey for ordering and cancellation', () => {
    const spec = fs.readFileSync(path.resolve(__dirname, '../e2e/android-system-back.e2e.js'), 'utf8');

    expect(spec).toContain("device.pressBack()");
    expect(spec).toContain('session-abandon-confirmation');
    expect(spec).toContain('beginAndroidPredictiveBackGesture');
    expect(spec).toContain('mobile-back-destination-preview');
    expect(spec).toContain('cancel: true');
    expect(spec).toContain('await cancelledPredictiveBack.started');
    expect(spec).toContain('await cancelledPredictiveBack.completion()');
    expect(spec).toContain('Pending Arrow Duel timer cancellation is covered deterministically');
    expect(spec).not.toContain("by.id('sprint-loading-overlay')");
    expect(spec).toContain('androidAppIsResumed');
    expect(spec).toContain('const rootPredictiveBack = beginAndroidPredictiveBackGesture()');
    expect(spec).toContain('Idle Practice root trapped Predictive Back');
  });

  it('keeps Android reminder evidence on public product and system surfaces', () => {
    const spec = fs.readFileSync(path.resolve(__dirname, '../e2e/android-review-reminders.e2e.js'), 'utf8');
    const helpers = fs.readFileSync(path.resolve(__dirname, '../e2e/helpers.js'), 'utf8');
    const nativeEvidence = fs.readFileSync(
      path.resolve(__dirname, '../scripts/android-review-reminder-native-evidence.sh'),
      'utf8'
    );

    expect(spec).toContain("failStandardSprint");
    expect(spec).toContain("settings-review-reminder-enable");
    expect(spec).toContain("permission_allow_button");
    expect(spec).toContain("permission_deny_button");
    expect(spec).toContain("statusbar', 'expand-notifications");
    expect(spec).toContain('waitForAndTapExactAndroidNotificationFromPublicUi({');
    expect(spec).toContain("body: '3 reviews are ready'");
    expect(spec).toContain('tapBounds: tapSystemBounds');
    expect(spec).toContain('title: REVIEW_NOTIFICATION.title');
    expect(spec).not.toContain('function tapNotificationSystemNode');
    expect(spec).not.toContain('titleRow');
    expect(spec).not.toContain('bodyRow');
    expect(spec).not.toContain('readSystemHierarchy');
    expect(spec).not.toContain("['dumpsys', 'notification', '--noredact']");
    expect(spec).toContain('androidAppIsResumed()');
    expect(spec).toContain("3 reviews are ready");
    expect(spec).toContain("review-panel");
    expect(spec).toContain("settings-review-reminder-off");
    expect(spec).toContain("cmd', 'alarm', 'set-timezone");
    expect(spec).toContain('const alarmBeforeTimezone = pendingReviewAlarmSnapshot();');
    expect(spec).toContain('waitForReviewAlarmRebased(alarmBeforeTimezone');
    expect(spec).toContain('assertActiveReviewNotificationCount(1)');
    expect(spec).toContain('assertActiveReviewNotificationCount(0)');
    expect(spec).not.toContain("ReviewReminderLifecycleReceiver");
    expect(spec).not.toContain("'-n'");
    expect(spec).not.toContain("NativeModules");
    expect(spec).not.toContain("PracticeService");
    expect(spec).not.toContain("run-as");

    expect(spec).toContain(
      'launchWithFreshAndroidRuntimePermission(resetNotificationPermission)'
    );
    const permissionLaunchIndex = helpers.indexOf(
      'async function launchWithFreshAndroidRuntimePermission('
    );
    const deleteLaunchIndex = helpers.indexOf('delete: true', permissionLaunchIndex);
    const resetIndex = helpers.indexOf('resetPermission();', permissionLaunchIndex);
    const noDeleteLaunchIndex = helpers.indexOf('delete: false', resetIndex);
    expect(deleteLaunchIndex).toBeGreaterThan(permissionLaunchIndex);
    expect(resetIndex).toBeGreaterThan(deleteLaunchIndex);
    expect(noDeleteLaunchIndex).toBeGreaterThan(resetIndex);
    expect(spec).toContain("['pm', 'revoke', APP_ID, PERMISSION]");
    expect(spec).toContain("'clear-permission-flags', APP_ID, PERMISSION, 'user-set'");
    expect(spec).toContain("'clear-permission-flags', APP_ID, PERMISSION, 'user-fixed'");

    const instrumentationIndex = nativeEvidence.indexOf('shell am instrument -w');
    const finalResetIndex = nativeEvidence.lastIndexOf('reset_notification_permission');
    expect(nativeEvidence).toContain('reset_notification_permission()');
    expect(finalResetIndex).toBeGreaterThan(instrumentationIndex);
    expect(nativeEvidence).toContain('clear-permission-flags "$APP_ID" "$PERMISSION" user-set');
    expect(nativeEvidence).toContain('clear-permission-flags "$APP_ID" "$PERMISSION" user-fixed');
  });

  it('keeps the Sprint performance regression available through its opt-in command', () => {
    expect(resolveDetoxTestMatch({ CHESSTICIZE_CAPTURE_SPRINT_PERFORMANCE: '1' }))
      .toEqual(SPRINT_PERFORMANCE_TEST_MATCH);
  });

  it('rejects mixing the two screenshot capture suites in one invocation', () => {
    expect(() => resolveDetoxTestMatch({
      CHESSTICIZE_CAPTURE_STORE_ASSETS: '1',
      CHESSTICIZE_CAPTURE_ADAPTIVE_LAYOUT: '1'
    })).toThrow('Active E2E and screenshot capture suites must run separately.');
  });

  it('rejects mixing the Sprint performance run with another opt-in suite', () => {
    expect(() => resolveDetoxTestMatch({
      CHESSTICIZE_CAPTURE_ADAPTIVE_LAYOUT: '1',
      CHESSTICIZE_CAPTURE_SPRINT_PERFORMANCE: '1'
    })).toThrow('Active E2E and screenshot capture suites must run separately.');
  });

  it('uses one reliable worker by default and accepts an explicit experiment count', () => {
    expect(resolveDetoxMaxWorkers({})).toBe(1);
    expect(resolveDetoxMaxWorkers({ DETOX_MAX_WORKERS: '2' })).toBe(2);
    expect(() => resolveDetoxMaxWorkers({ DETOX_MAX_WORKERS: '0' }))
      .toThrow('DETOX_MAX_WORKERS must be a positive integer');
  });
});
