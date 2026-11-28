// Mobile platform adapter for out-of-app background batch game analysis;
// kept outside the backend/domain seam.
import { NativeEventEmitter, NativeModules, Platform } from "react-native";

export const BACKGROUND_BATCH_ANALYSIS_EVENT = "BackgroundBatchAnalysisEvent";

export type BackgroundBatchAnalysisMode =
  | "foreground_service"
  | "ios_continued_processing"
  | "ios_background_task"
  | "none";

export interface BackgroundBatchAnalysisStartInput {
  title: string;
  subtitle: string;
  pausedSubtitle?: string;
  totalUnits: number;
  pauseLabel: string;
  cancelLabel: string;
}

export interface BackgroundBatchAnalysisStartResult {
  active: boolean;
  /** True when the OS granted extended out-of-app execution (Android FGS or iOS 26+ BGContinuedProcessingTask). */
  supportsContinuedBackground: boolean;
  mode: BackgroundBatchAnalysisMode;
}

export interface BackgroundBatchAnalysisProgressInput {
  title: string;
  subtitle: string;
  completedUnits: number;
  totalUnits: number;
}

export interface BackgroundBatchAnalysisFinishInput {
  title: string;
  body: string;
  notifyIfBackgrounded: boolean;
}

export type BackgroundBatchAnalysisEvent =
  | { type: "pause_requested" }
  | { type: "cancel_requested" }
  | { type: "expiration_warning" }
  | { type: "lock_paused" }
  | { type: "unlock_resumed" };

export interface BackgroundBatchAnalysisBridge {
  start(input: BackgroundBatchAnalysisStartInput): Promise<BackgroundBatchAnalysisStartResult>;
  updateProgress(input: BackgroundBatchAnalysisProgressInput): Promise<void>;
  finish(input: BackgroundBatchAnalysisFinishInput): Promise<void>;
  stop(): Promise<void>;
  subscribe(listener: (event: BackgroundBatchAnalysisEvent) => void): () => void;
}

type NativeBackgroundBatchAnalysisModule = {
  start?: (input: BackgroundBatchAnalysisStartInput) => Promise<unknown>;
  updateProgress?: (input: BackgroundBatchAnalysisProgressInput) => Promise<unknown>;
  finish?: (input: BackgroundBatchAnalysisFinishInput) => Promise<unknown>;
  stop?: () => Promise<unknown>;
  addListener?: (eventName: string) => void;
  removeListeners?: (count: number) => void;
};

export const INACTIVE_BACKGROUND_BATCH_RESULT: BackgroundBatchAnalysisStartResult = {
  active: false,
  supportsContinuedBackground: false,
  mode: "none"
};

function normalizeStartResult(raw: unknown): BackgroundBatchAnalysisStartResult {
  if (!raw || typeof raw !== "object") {
    return INACTIVE_BACKGROUND_BATCH_RESULT;
  }
  const candidate = raw as Partial<BackgroundBatchAnalysisStartResult>;
  const mode: BackgroundBatchAnalysisMode =
    candidate.mode === "foreground_service" ||
    candidate.mode === "ios_continued_processing" ||
    candidate.mode === "ios_background_task" ||
    candidate.mode === "none"
      ? candidate.mode
      : "none";
  return {
    active: Boolean(candidate.active) && mode !== "none",
    supportsContinuedBackground: Boolean(candidate.supportsContinuedBackground) && mode !== "none",
    mode
  };
}

function normalizeEvent(raw: unknown): BackgroundBatchAnalysisEvent | null {
  const type =
    typeof raw === "string"
      ? raw
      : raw && typeof raw === "object"
        ? (raw as { type?: unknown }).type
        : null;
  if (
    type === "pause_requested" ||
    type === "cancel_requested" ||
    type === "expiration_warning" ||
    type === "lock_paused" ||
    type === "unlock_resumed"
  ) {
    return { type };
  }
  return null;
}

export function createNativeBackgroundBatchAnalysisBridge(): BackgroundBatchAnalysisBridge | null {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return null;
  }
  const nativeModule = NativeModules?.BackgroundBatchAnalysis as
    | NativeBackgroundBatchAnalysisModule
    | undefined;
  if (
    !nativeModule ||
    typeof nativeModule.start !== "function" ||
    typeof nativeModule.updateProgress !== "function" ||
    typeof nativeModule.finish !== "function" ||
    typeof nativeModule.stop !== "function"
  ) {
    return null;
  }

  let emitter: NativeEventEmitter | null = null;
  const getEmitter = (): NativeEventEmitter => {
    if (!emitter) {
      emitter = new NativeEventEmitter(
        nativeModule as unknown as ConstructorParameters<typeof NativeEventEmitter>[0]
      );
    }
    return emitter;
  };

  return {
    async start(input) {
      try {
        const result = await nativeModule.start?.(input);
        return normalizeStartResult(result);
      } catch {
        return INACTIVE_BACKGROUND_BATCH_RESULT;
      }
    },
    async updateProgress(input) {
      try {
        await nativeModule.updateProgress?.(input);
      } catch {
        // Non-fatal: progress UI updates must never interrupt Stockfish batch analysis.
      }
    },
    async finish(input) {
      try {
        await nativeModule.finish?.(input);
      } catch {
        // Non-fatal cleanup.
      }
    },
    async stop() {
      try {
        await nativeModule.stop?.();
      } catch {
        // Non-fatal cleanup.
      }
    },
    subscribe(listener) {
      const subscription = getEmitter().addListener(
        BACKGROUND_BATCH_ANALYSIS_EVENT,
        (payload: unknown) => {
          const event = normalizeEvent(payload);
          if (event) {
            listener(event);
          }
        }
      );
      return () => {
        subscription.remove();
      };
    }
  };
}

/**
 * Maintained deterministic fake for testing background batch analysis lifecycles across
 * Android Foreground Service, iOS 26+ BGContinuedProcessingTask, and iOS Tier-1 background tasks.
 */
export class FakeBackgroundBatchAnalysisBridge implements BackgroundBatchAnalysisBridge {
  private startResult: BackgroundBatchAnalysisStartResult;
  private readonly listeners = new Set<(event: BackgroundBatchAnalysisEvent) => void>();

  readonly startCalls: BackgroundBatchAnalysisStartInput[] = [];
  readonly progressCalls: BackgroundBatchAnalysisProgressInput[] = [];
  readonly finishCalls: BackgroundBatchAnalysisFinishInput[] = [];
  stopCallCount = 0;

  constructor(
    startResult: BackgroundBatchAnalysisStartResult = {
      active: true,
      supportsContinuedBackground: true,
      mode: "foreground_service"
    }
  ) {
    this.startResult = { ...startResult };
  }

  setStartResult(result: BackgroundBatchAnalysisStartResult): void {
    this.startResult = { ...result };
  }

  async start(
    input: BackgroundBatchAnalysisStartInput
  ): Promise<BackgroundBatchAnalysisStartResult> {
    this.startCalls.push({ ...input });
    return { ...this.startResult };
  }

  async updateProgress(input: BackgroundBatchAnalysisProgressInput): Promise<void> {
    this.progressCalls.push({ ...input });
  }

  async finish(input: BackgroundBatchAnalysisFinishInput): Promise<void> {
    this.finishCalls.push({ ...input });
  }

  async stop(): Promise<void> {
    this.stopCallCount += 1;
  }

  subscribe(listener: (event: BackgroundBatchAnalysisEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: BackgroundBatchAnalysisEvent): void {
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }
}
