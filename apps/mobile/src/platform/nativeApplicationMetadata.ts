// Mobile platform adapter; kept outside the backend/domain seam.
import { NativeModules } from 'react-native';
import {
  MOBILE_APPLICATION_METADATA_LINKS,
  type MobileApplicationMetadata,
} from './mobilePlatformCapabilities.ts';

interface NativeApplicationMetadataModule {
  versionName?: unknown;
  buildNumber?: unknown;
}

function requiredInstalledValue(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Installed application metadata is missing ${name}.`);
  }
  return value.trim();
}

export function readNativeApplicationMetadata(
  nativeModule: NativeApplicationMetadataModule | undefined =
    NativeModules.ApplicationMetadata,
): MobileApplicationMetadata {
  if (!nativeModule) {
    throw new Error('Native ApplicationMetadata module is unavailable.');
  }
  return {
    ...MOBILE_APPLICATION_METADATA_LINKS,
    versionName: requiredInstalledValue(nativeModule.versionName, 'versionName'),
    buildNumber: requiredInstalledValue(nativeModule.buildNumber, 'buildNumber'),
  };
}
