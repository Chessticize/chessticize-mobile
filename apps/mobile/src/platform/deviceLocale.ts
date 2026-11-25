// Mobile platform adapter for OS preferred locales; kept outside the backend/domain seam.
import { NativeModules } from "react-native";

interface NativeLocaleMetadataModule {
  preferredLanguages?: unknown;
}

type BrowserNavigatorLike = {
  language?: unknown;
  languages?: readonly unknown[];
};

function normalizeLanguageTagList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim());
}

function isJestEnvironment(): boolean {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return Boolean(proc?.env?.JEST_WORKER_ID);
}

/**
 * Reads the OS preferred BCP 47 language tags from native ApplicationMetadata,
 * falling back to browser navigator.languages (for web/Lab) or ["en"] in Jest/Node.
 */
export function readDevicePreferredLanguages(
  nativeModule: NativeLocaleMetadataModule | undefined =
    NativeModules?.ApplicationMetadata as NativeLocaleMetadataModule | undefined
): readonly string[] {
  const fromNative = normalizeLanguageTagList(nativeModule?.preferredLanguages);
  if (fromNative.length > 0) {
    return fromNative;
  }

  // Keep Jest tests deterministic in English unless a test passes preferredLanguages explicitly.
  if (isJestEnvironment()) {
    return ["en"];
  }

  const nav = (globalThis as { navigator?: BrowserNavigatorLike }).navigator;
  if (nav) {
    const fromNavigatorList = normalizeLanguageTagList(nav.languages);
    if (fromNavigatorList.length > 0) {
      return fromNavigatorList;
    }
    if (typeof nav.language === "string" && nav.language.trim().length > 0) {
      return [nav.language.trim()];
    }
  }

  return ["en"];
}
