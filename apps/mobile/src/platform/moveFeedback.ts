import { NativeModules } from "react-native";
import { Chess } from "chess.js";

export type MoveFeedbackCue = "move" | "capture";
export type MoveFeedbackActor = "user" | "opponent";

export type MoveFeedbackPreferences = {
  hapticsEnabled: boolean;
  soundEnabled: boolean;
};

export type CommittedMoveFeedback = {
  actor: MoveFeedbackActor;
  cue: MoveFeedbackCue;
};

export type NativeMoveFeedbackRequest = {
  cue: MoveFeedbackCue;
  playHaptic: boolean;
  playSound: boolean;
};

export interface MoveFeedbackClient {
  play(request: NativeMoveFeedbackRequest): Promise<void>;
}

type NativeMoveFeedbackModule = {
  play?: (
    cue: MoveFeedbackCue,
    playSound: boolean,
    playHaptic: boolean
  ) => Promise<unknown>;
};

export class FakeMoveFeedbackClient implements MoveFeedbackClient {
  readonly requests: NativeMoveFeedbackRequest[] = [];

  async play(request: NativeMoveFeedbackRequest): Promise<void> {
    this.requests.push({ ...request });
  }
}

export function createNativeMoveFeedbackClient(
  nativeModule: NativeMoveFeedbackModule | undefined =
    NativeModules?.MoveFeedback as NativeMoveFeedbackModule | undefined
): MoveFeedbackClient | null {
  if (!nativeModule || typeof nativeModule.play !== "function") {
    return null;
  }
  return {
    async play(request): Promise<void> {
      await nativeModule.play?.(
        request.cue,
        request.playSound,
        request.playHaptic
      );
    }
  };
}

export async function emitCommittedMoveFeedback(
  client: MoveFeedbackClient,
  feedback: CommittedMoveFeedback,
  preferences: MoveFeedbackPreferences
): Promise<void> {
  const request = {
    cue: feedback.cue,
    playSound: preferences.soundEnabled,
    playHaptic: preferences.hapticsEnabled
  };
  if (!request.playSound && !request.playHaptic) {
    return;
  }
  await client.play(request);
}

export function moveFeedbackCueForMove(
  fen: string,
  uciMove: string
): MoveFeedbackCue | null {
  try {
    const chess = new Chess(fen);
    const played = chess.move({
      from: uciMove.slice(0, 2),
      to: uciMove.slice(2, 4),
      ...(uciMove.length > 4 ? { promotion: uciMove.slice(4, 5) } : {})
    });
    return played ? (played.captured ? "capture" : "move") : null;
  } catch {
    return null;
  }
}
