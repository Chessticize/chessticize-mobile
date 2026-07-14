import {
  createAndroidMobilePlatformCapabilities,
  createAndroidMobilePlatformCapabilitiesSync,
} from './androidMobilePlatformCapabilities.ts';
import {
  createIOSMobilePlatformCapabilities,
  createIOSMobilePlatformCapabilitiesSync,
} from './iosMobilePlatformCapabilities.ts';
import type { MobilePlatformCapabilities } from './mobilePlatformCapabilities.ts';

export type NativeMobilePlatform = 'android' | 'ios';

export interface MobilePlatformCapabilityFactory {
  platform: NativeMobilePlatform;
  create: () => Promise<MobilePlatformCapabilities>;
  createSync: () => MobilePlatformCapabilities | undefined;
}

const FACTORIES: Record<NativeMobilePlatform, MobilePlatformCapabilityFactory> = {
  android: {
    platform: 'android',
    create: createAndroidMobilePlatformCapabilities,
    createSync: createAndroidMobilePlatformCapabilitiesSync,
  },
  ios: {
    platform: 'ios',
    create: createIOSMobilePlatformCapabilities,
    createSync: createIOSMobilePlatformCapabilitiesSync,
  },
};

export function mobilePlatformCapabilityFactoryFor(
  platform: NativeMobilePlatform,
): MobilePlatformCapabilityFactory {
  const factory = FACTORIES[platform];
  if (!factory) {
    throw new Error(`Unsupported mobile platform: ${String(platform)}`);
  }
  return factory;
}
