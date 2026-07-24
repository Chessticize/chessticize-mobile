import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { previewBrowserMoveFeedback } from "./browserMoveFeedbackPreview.ts";

const originalAudio = Object.getOwnPropertyDescriptor(globalThis, "Audio");

afterEach(() => {
  if (originalAudio) {
    Object.defineProperty(globalThis, "Audio", originalAudio);
  } else {
    Reflect.deleteProperty(globalThis, "Audio");
  }
});

test("plays the selected Freesound move and capture assets", async () => {
  const sources: string[] = [];
  const volumes: number[] = [];
  let playCount = 0;

  class FakeAudio {
    currentTime = -1;
    preload = "";
    volume = 1;

    constructor(source?: string) {
      sources.push(source ?? "");
    }

    play(): Promise<void> {
      playCount += 1;
      volumes.push(this.volume);
      return Promise.resolve();
    }
  }

  Object.defineProperty(globalThis, "Audio", {
    configurable: true,
    value: FakeAudio
  });

  assert.deepEqual(
    await previewBrowserMoveFeedback("move", {
      hapticsEnabled: true,
      soundEnabled: true
    }),
    { haptics: "visual-only", sound: "played" }
  );
  assert.deepEqual(
    await previewBrowserMoveFeedback("capture", {
      hapticsEnabled: false,
      soundEnabled: true
    }),
    { haptics: "off", sound: "played" }
  );
  assert.deepEqual(sources, [
    "./audio/issue-247/freesound-546119-piece-placement.mp3",
    "./audio/issue-247/freesound-546120-piece-capture.mp3"
  ]);
  assert.deepEqual(volumes, [1, 0.5]);
  assert.equal(playCount, 2);
});

test("does not create an audio player when sound is disabled", async () => {
  let constructionCount = 0;

  class FakeAudio {
    currentTime = 0;
    preload = "";

    constructor() {
      constructionCount += 1;
    }

    play(): Promise<void> {
      return Promise.resolve();
    }
  }

  Object.defineProperty(globalThis, "Audio", {
    configurable: true,
    value: FakeAudio
  });

  assert.deepEqual(
    await previewBrowserMoveFeedback("move", {
      hapticsEnabled: false,
      soundEnabled: false
    }),
    { haptics: "off", sound: "off" }
  );
  assert.equal(constructionCount, 0);
});

test("reports unavailable audio when browser playback is rejected", async () => {
  class FakeAudio {
    currentTime = 0;
    preload = "";

    play(): Promise<void> {
      return Promise.reject(new Error("playback blocked"));
    }
  }

  Object.defineProperty(globalThis, "Audio", {
    configurable: true,
    value: FakeAudio
  });

  assert.deepEqual(
    await previewBrowserMoveFeedback("capture", {
      hapticsEnabled: true,
      soundEnabled: true
    }),
    { haptics: "visual-only", sound: "unavailable" }
  );
});
