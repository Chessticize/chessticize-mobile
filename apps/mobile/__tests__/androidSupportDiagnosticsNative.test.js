const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const mobileRoot = join(__dirname, '..');

function read(relativePath) {
  return readFileSync(join(mobileRoot, relativePath), 'utf8');
}

describe('Android support diagnostics native boundary', () => {
  it('registers a private FileProvider scoped to temporary support archives', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    const paths = read('android/app/src/main/res/xml/support_bundle_paths.xml');
    const application = read(
      'android/app/src/main/java/com/chessticize/mobile/MainApplication.kt'
    );

    expect(application).toContain('add(AndroidSupportDiagnosticsPackage())');
    expect(manifest).toContain(
      'android:name=".ExpiringSupportFileProvider"'
    );
    expect(manifest).toContain('android:authorities="${applicationId}.support-files"');
    expect(manifest).toContain('android:exported="false"');
    expect(paths).toContain('path="support-diagnostics/archives/"');
    expect(paths).not.toContain('external-path');
    expect(paths).not.toContain('path="."');
  });

  it('packages only the consistent local snapshot and privacy-bounded metadata', () => {
    const adapter = read('src/platform/androidSupportDiagnostics.ts');
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    const nativeModule = read(
      'android/app/src/main/java/com/chessticize/mobile/AndroidSupportDiagnosticsModule.kt'
    );

    expect(adapter).toContain('await database.execute("VACUUM INTO ?", [destinationPath])');
    expect(adapter).toContain('readOnly: true');
    expect(nativeModule).toContain('PRAGMA integrity_check');
    expect(nativeModule).toContain('PRAGMA user_version');
    expect(nativeModule).toContain('MessageDigest.getInstance("SHA-256")');
    expect(nativeModule).toContain('ZipOutputStream');
    expect(nativeModule).toContain('.put("accountIdentifiersIncluded", false)');
    expect(nativeModule).toContain('.put("credentialsIncluded", false)');
    expect(nativeModule).toContain('.put("hardwareIdentifiersIncluded", false)');
    expect(nativeModule).toContain('worker.shutdownNow()');
    expect(nativeModule).toContain('SupportDiagnosticsCleanupReceiver');
    expect(nativeModule).toContain('class ExpiringSupportFileProvider');
    expect(nativeModule).toContain('override fun openFile');
    expect(nativeModule).toContain('SupportDiagnosticsArchiveContract.isReadable');
    expect(nativeModule).toContain('setAndAllowWhileIdle');
    expect(nativeModule).toContain('scheduleNextCleanup');
    expect(nativeModule).not.toContain('worker.schedule(');
    expect(manifest).toContain(
      'android:name=".SupportDiagnosticsCleanupReceiver"'
    );
    expect(manifest).not.toContain(
      'android:name="androidx.core.content.FileProvider"'
    );
    expect(manifest).not.toContain('android.permission.SCHEDULE_EXACT_ALARM');
    expect(nativeModule).not.toContain('ANDROID_ID');
    expect(nativeModule).not.toContain('Build.SERIAL');
  });
});
