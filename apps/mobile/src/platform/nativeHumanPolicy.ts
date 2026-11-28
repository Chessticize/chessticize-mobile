// Mobile platform adapter for on-device Maia-2 INT8 inference (CoreML on iOS, ONNX Runtime on Android).
// Kept outside the backend/domain seam; gracefully returns null when the native module or model asset is absent.
import { NativeModules, Platform } from "react-native";
import {
  MAIA2_VOCAB_SIZE,
  createMaia2HumanPolicyModel,
  type Maia2TensorBatchInput,
  type ManagedHumanPolicyModel
} from "../../../../packages/core/src/index.ts";
import maia2Manifest from "../../../../fixtures/models/maia2-rapid-int8.manifest.json";

export interface NativeHumanPolicyBridge {
  isAvailable: () => Promise<boolean>;
  loadModel: (expectedSha256: string | null) => Promise<boolean>;
  scoreBatch: (
    boardsBase64: string,
    eloSelf: number[],
    eloOppo: number[]
  ) => Promise<string>;
  unload: () => Promise<boolean>;
}

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_LOOKUP = new Uint8Array(128).fill(255);
for (let i = 0; i < BASE64_CHARS.length; i += 1) {
  BASE64_LOOKUP[BASE64_CHARS.charCodeAt(i)] = i;
}

/** Encode a Float32Array's little-endian IEEE-754 bytes as Base64 without requiring Node Buffer. */
export function float32ArrayToBase64(values: Float32Array): string {
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const hasB1 = i + 1 < bytes.length;
    const hasB2 = i + 2 < bytes.length;
    const b1 = hasB1 ? bytes[i + 1]! : 0;
    const b2 = hasB2 ? bytes[i + 2]! : 0;
    const triplet = (b0 << 16) | (b1 << 8) | b2;
    out += BASE64_CHARS[(triplet >> 18) & 0x3f]!;
    out += BASE64_CHARS[(triplet >> 12) & 0x3f]!;
    out += hasB1 ? BASE64_CHARS[(triplet >> 6) & 0x3f]! : "=";
    out += hasB2 ? BASE64_CHARS[triplet & 0x3f]! : "=";
  }
  return out;
}

/** Decode Base64 little-endian IEEE-754 bytes back into a Float32Array. */
export function base64ToFloat32Array(base64: string): Float32Array {
  const cleaned = base64.replace(/[\r\n\s]/g, "");
  const len = cleaned.length;
  if (len === 0) {
    return new Float32Array(0);
  }
  const padding = cleaned.endsWith("==") ? 2 : cleaned.endsWith("=") ? 1 : 0;
  const byteLen = (len * 3) / 4 - padding;
  const bytes = new Uint8Array(byteLen);
  let outIdx = 0;

  for (let i = 0; i < len; i += 4) {
    const c0 = BASE64_LOOKUP[cleaned.charCodeAt(i)] ?? 0;
    const c1 = BASE64_LOOKUP[cleaned.charCodeAt(i + 1)] ?? 0;
    const c2Char = cleaned.charCodeAt(i + 2);
    const c3Char = cleaned.charCodeAt(i + 3);
    const c2 = c2Char === 61 ? 0 : (BASE64_LOOKUP[c2Char] ?? 0);
    const c3 = c3Char === 61 ? 0 : (BASE64_LOOKUP[c3Char] ?? 0);
    const triplet = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (outIdx < byteLen) bytes[outIdx++] = (triplet >> 16) & 0xff;
    if (outIdx < byteLen) bytes[outIdx++] = (triplet >> 8) & 0xff;
    if (outIdx < byteLen) bytes[outIdx++] = triplet & 0xff;
  }
  return new Float32Array(bytes.buffer, 0, Math.floor(byteLen / 4));
}

export function expectedMaia2Sha256ForPlatform(os: string = Platform.OS): string {
  if (os === "ios") {
    return maia2Manifest.artifacts.coremlInt8Zip.weightBinSha256;
  }
  return maia2Manifest.artifacts.onnxInt8.sha256;
}

function getNativeHumanPolicyBridge(): NativeHumanPolicyBridge | null {
  const mod = NativeModules?.NativeHumanPolicy as NativeHumanPolicyBridge | undefined;
  if (
    !mod ||
    typeof mod.isAvailable !== "function" ||
    typeof mod.loadModel !== "function" ||
    typeof mod.scoreBatch !== "function" ||
    typeof mod.unload !== "function"
  ) {
    return null;
  }
  return mod;
}

/**
 * Create a lazy-loading on-device Maia-2 INT8 HumanPolicyModel backed by CoreML (iOS)
 * or ONNX Runtime (Android). Returns `null` when the native module is absent (Jest/Lab/Web)
 * or fails availability checks so callers seamlessly fall back to `sf_heuristic_v1`.
 */
export function createNativeHumanPolicyModel(
  bridgeOverride?: NativeHumanPolicyBridge | null
): ManagedHumanPolicyModel | null {
  const bridge = bridgeOverride !== undefined ? bridgeOverride : getNativeHumanPolicyBridge();
  if (!bridge) {
    return null;
  }

  let availablePromise: Promise<boolean> | null = null;
  let loaded = false;
  let loadPromise: Promise<boolean> | null = null;
  const expectedSha = expectedMaia2Sha256ForPlatform();

  async function ensureLoaded(): Promise<boolean> {
    if (loaded) {
      return true;
    }
    availablePromise ??= bridge!.isAvailable().catch(() => false);
    const available = await availablePromise;
    if (!available) {
      return false;
    }
    if (!loadPromise) {
      loadPromise = bridge!
        .loadModel(expectedSha)
        .then((ok) => {
          loaded = Boolean(ok);
          return loaded;
        })
        .catch(() => {
          loaded = false;
          return false;
        })
        .finally(() => {
          loadPromise = null;
        });
    }
    return loadPromise;
  }

  return createMaia2HumanPolicyModel({
    id: `maia2-rapid-int8-${Platform.OS}`,
    async runBatch(input: Maia2TensorBatchInput): Promise<Float32Array> {
      const ok = await ensureLoaded();
      if (!ok) {
        throw new Error("Native Maia-2 model is unavailable on this build.");
      }
      const boardsBase64 = float32ArrayToBase64(input.boards);
      const eloSelf = Array.from(input.eloSelfCategories);
      const eloOppo = Array.from(input.eloOppoCategories);
      const logitsBase64 = await bridge.scoreBatch(boardsBase64, eloSelf, eloOppo);
      const logits = base64ToFloat32Array(logitsBase64);
      const expectedFloats = input.batchSize * MAIA2_VOCAB_SIZE;
      if (logits.length < expectedFloats) {
        throw new Error(
          `Native Maia-2 returned ${logits.length} logits; expected ${expectedFloats}.`
        );
      }
      return logits;
    },
    async unload(): Promise<void> {
      loaded = false;
      loadPromise = null;
      await bridge.unload().catch(() => undefined);
    }
  });
}
