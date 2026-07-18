const {readFileSync} = require('node:fs');
const {dirname, resolve} = require('node:path');

const detoxRoot = dirname(require.resolve('detox/package.json'));
const ADB = require(resolve(
  detoxRoot,
  'src/devices/common/drivers/android/exec/ADB.js',
));

describe('Detox Android reverse cleanup patch', () => {
  it('treats an already absent reverse listener as an idempotent cleanup', async () => {
    const adb = Object.create(ADB.prototype);
    const error = Object.assign(new Error('reverse cleanup failed'), {
      stderr: "adb: error: listener 'tcp:36565' not found\n",
    });
    adb.adbCmd = jest.fn().mockRejectedValue(error);

    await expect(
      adb.reverseRemove('emulator-5554', 36565),
    ).resolves.toBeUndefined();
    expect(adb.adbCmd).toHaveBeenCalledWith(
      'emulator-5554',
      'reverse --remove tcp:36565',
    );
  });

  it('accepts the exact absent-listener response with a CRLF line ending', async () => {
    const adb = Object.create(ADB.prototype);
    const error = Object.assign(new Error('reverse cleanup failed'), {
      stderr: "adb: error: listener 'tcp:36565' not found\r\n",
    });
    adb.adbCmd = jest.fn().mockRejectedValue(error);

    await expect(
      adb.reverseRemove('emulator-5554', 36565),
    ).resolves.toBeUndefined();
  });

  it('preserves successful reverse cleanup results', async () => {
    const adb = Object.create(ADB.prototype);
    const result = {stdout: '', stderr: ''};
    adb.adbCmd = jest.fn().mockResolvedValue(result);

    await expect(adb.reverseRemove('emulator-5554', 36565)).resolves.toBe(
      result,
    );
  });

  it('rejects an absent-listener error for a different port', async () => {
    const adb = Object.create(ADB.prototype);
    const error = Object.assign(new Error('reverse cleanup failed'), {
      stderr: "adb: error: listener 'tcp:36566' not found\n",
    });
    adb.adbCmd = jest.fn().mockRejectedValue(error);

    await expect(adb.reverseRemove('emulator-5554', 36565)).rejects.toBe(
      error,
    );
  });

  it('rejects a same-port absent-listener error with leading whitespace', async () => {
    const adb = Object.create(ADB.prototype);
    const error = Object.assign(new Error('reverse cleanup failed'), {
      stderr: "  adb: error: listener 'tcp:36565' not found\n",
    });
    adb.adbCmd = jest.fn().mockRejectedValue(error);

    await expect(adb.reverseRemove('emulator-5554', 36565)).rejects.toBe(
      error,
    );
  });

  it('rejects arbitrary trailing content before the line ending', async () => {
    const adb = Object.create(ADB.prototype);
    const error = Object.assign(new Error('reverse cleanup failed'), {
      stderr: "adb: error: listener 'tcp:36565' not found \r\n",
    });
    adb.adbCmd = jest.fn().mockRejectedValue(error);

    await expect(adb.reverseRemove('emulator-5554', 36565)).rejects.toBe(
      error,
    );
  });

  it.each([null, 42, {message: 'not stderr text'}])(
    'preserves the original error when stderr is the non-string value %p',
    async stderr => {
      const adb = Object.create(ADB.prototype);
      const error = Object.assign(new Error('reverse cleanup failed'), {
        stderr,
      });
      adb.adbCmd = jest.fn().mockRejectedValue(error);

      await expect(adb.reverseRemove('emulator-5554', 36565)).rejects.toBe(
        error,
      );
    },
  );

  it('rejects every other reverse cleanup error', async () => {
    const adb = Object.create(ADB.prototype);
    const error = Object.assign(new Error('reverse cleanup failed'), {
      stderr: 'adb: error: device offline\n',
    });
    adb.adbCmd = jest.fn().mockRejectedValue(error);

    await expect(adb.reverseRemove('emulator-5554', 36565)).rejects.toBe(
      error,
    );
  });

  it('does not suppress the same stderr from other ADB commands', async () => {
    const adb = Object.create(ADB.prototype);
    const error = Object.assign(new Error('reverse setup failed'), {
      stderr: "adb: error: listener 'tcp:36565' not found\n",
    });
    adb.adbCmd = jest.fn().mockRejectedValue(error);

    await expect(adb.reverse('emulator-5554', 36565)).rejects.toBe(error);
    expect(adb.adbCmd).toHaveBeenCalledWith(
      'emulator-5554',
      'reverse tcp:36565 tcp:36565',
    );
  });

  it('keeps the exact absent-listener guard in the durable package patch', () => {
    const patch = readFileSync(
      resolve(__dirname, '../../../patches/detox@20.51.4.patch'),
      'utf8',
    );

    expect(patch).toContain(
      "const missingListenerError = `adb: error: listener 'tcp:${port}' not found`;",
    );
    expect(patch).toContain(
      "const isMissingListenerError = typeof stderr === 'string'",
    );
    expect(patch).toContain(
      "&& stderr.replace(/\\r?\\n$/, '') === missingListenerError;",
    );
    expect(patch).toContain('if (isMissingListenerError)');
    expect(patch).toContain('throw error;');
  });
});
