import {
  FakeMoveFeedbackClient,
  createNativeMoveFeedbackClient,
  emitCommittedMoveFeedback,
  moveFeedbackCueForMove,
  type MoveFeedbackClient
} from "../src/platform/moveFeedback";

describe("move feedback", () => {
  it("classifies committed moves and captures from the pre-move position", () => {
    expect(moveFeedbackCueForMove(
      "8/8/8/3p4/4P3/8/8/4K2k w - - 0 1",
      "e4e5"
    )).toBe("move");
    expect(moveFeedbackCueForMove(
      "8/8/8/3p4/4P3/8/8/4K2k w - - 0 1",
      "e4d5"
    )).toBe("capture");
    expect(moveFeedbackCueForMove(
      "8/8/8/3p4/4P3/8/8/4K2k w - - 0 1",
      "e4e8"
    )).toBeNull();
  });

  it("requests sound and haptics for a committed user move", async () => {
    const client = new FakeMoveFeedbackClient();

    await emitCommittedMoveFeedback(
      client,
      { actor: "user", cue: "capture" },
      { soundEnabled: true, hapticsEnabled: true }
    );

    expect(client.requests).toEqual([{
      cue: "capture",
      playSound: true,
      playHaptic: true
    }]);
  });

  it("requests haptics for an opponent reply when haptics are enabled", async () => {
    const client = new FakeMoveFeedbackClient();

    await emitCommittedMoveFeedback(
      client,
      { actor: "opponent", cue: "move" },
      { soundEnabled: true, hapticsEnabled: true }
    );

    expect(client.requests).toEqual([{
      cue: "move",
      playSound: true,
      playHaptic: true
    }]);
  });

  it("does not cross the native boundary when both settings disable feedback", async () => {
    const client: MoveFeedbackClient = {
      play: jest.fn(async () => undefined)
    };

    await emitCommittedMoveFeedback(
      client,
      { actor: "user", cue: "move" },
      { soundEnabled: false, hapticsEnabled: false }
    );

    expect(client.play).not.toHaveBeenCalled();
  });

  it("forwards semantic requests to the native module in its stable argument order", async () => {
    const play = jest.fn(async () => undefined);
    const client = createNativeMoveFeedbackClient({ play });

    await client?.play({
      cue: "capture",
      playSound: true,
      playHaptic: false
    });

    expect(play).toHaveBeenCalledWith("capture", true, false);
    expect(createNativeMoveFeedbackClient({})).toBeNull();
  });
});
