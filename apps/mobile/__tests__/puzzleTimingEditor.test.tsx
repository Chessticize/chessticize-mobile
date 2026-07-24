import {
  puzzleTimingEditorState,
  updatePuzzleTimingFromEditor
} from "../src/components/puzzleTimingEditor.ts";

describe("puzzle timing editor", () => {
  it("uses the core default policy for an inherited Run", () => {
    expect(puzzleTimingEditorState(undefined, 20)).toMatchObject({
      policy: {
        slowAfterSeconds: 40,
        timeoutAfterSeconds: 60
      },
      slowDisplaySeconds: 40,
      timeoutDisplaySeconds: 60
    });
  });

  it("enables Slow at the lower boundary without creating an invalid gap", () => {
    expect(updatePuzzleTimingFromEditor(
      { slowAfterSeconds: null, timeoutAfterSeconds: 10 },
      20,
      { type: "toggle-slow" }
    )).toEqual({
      slowAfterSeconds: 10,
      timeoutAfterSeconds: 15
    });
  });

  it("enables timeout at the upper boundary without creating an invalid gap", () => {
    expect(updatePuzzleTimingFromEditor(
      { slowAfterSeconds: 180, timeoutAfterSeconds: null },
      20,
      { type: "toggle-timeout" }
    )).toEqual({
      slowAfterSeconds: 175,
      timeoutAfterSeconds: 180
    });
  });

  it("keeps stepper edits within the active counterpart", () => {
    expect(updatePuzzleTimingFromEditor(
      { slowAfterSeconds: 40, timeoutAfterSeconds: 45 },
      20,
      { type: "set-slow", seconds: 45 }
    )).toEqual({
      slowAfterSeconds: 40,
      timeoutAfterSeconds: 45
    });
    expect(updatePuzzleTimingFromEditor(
      { slowAfterSeconds: 40, timeoutAfterSeconds: 45 },
      20,
      { type: "set-timeout", seconds: 40 }
    )).toEqual({
      slowAfterSeconds: 40,
      timeoutAfterSeconds: 45
    });
  });
});
