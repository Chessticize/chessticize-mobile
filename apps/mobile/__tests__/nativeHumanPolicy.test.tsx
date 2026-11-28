import {
  MAIA2_MOVE_VOCAB,
  MAIA2_TENSOR_FLOATS,
  MAIA2_VOCAB_SIZE
} from "../../../packages/core/src/index.ts";
import {
  base64ToFloat32Array,
  createNativeHumanPolicyModel,
  expectedMaia2Sha256ForPlatform,
  float32ArrayToBase64,
  type NativeHumanPolicyBridge
} from "../src/platform/nativeHumanPolicy.ts";

describe("nativeHumanPolicy mobile adapter", () => {
  it("round-trips Float32Array through Base64 without Node Buffer", () => {
    const input = new Float32Array([-3.5, 0, 1.0, 0.125, 42.75, -0.0001]);
    const encoded = float32ArrayToBase64(input);
    const decoded = base64ToFloat32Array(encoded);
    expect(decoded.length).toBe(input.length);
    for (let i = 0; i < input.length; i += 1) {
      expect(decoded[i]).toBeCloseTo(input[i]!, 6);
    }
  });

  it("returns platform-specific expected SHA-256 digests from the committed manifest", () => {
    expect(expectedMaia2Sha256ForPlatform("ios")).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(expectedMaia2Sha256ForPlatform("android")).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(expectedMaia2Sha256ForPlatform("ios")).not.toBe(
      expectedMaia2Sha256ForPlatform("android")
    );
  });

  it("returns null when native bridge is unavailable", () => {
    expect(createNativeHumanPolicyModel(null)).toBeNull();
  });

  it("verifies availability, loads with manifest SHA-256, scores a batch, and unloads cleanly", async () => {
    const e2e4Idx = MAIA2_MOVE_VOCAB.indexOf("e2e4");
    const calls: string[] = [];

    const fakeBridge: NativeHumanPolicyBridge = {
      isAvailable: jest.fn(async () => {
        calls.push("isAvailable");
        return true;
      }),
      loadModel: jest.fn(async (sha) => {
        calls.push(`loadModel:${sha ?? "none"}`);
        return true;
      }),
      scoreBatch: jest.fn(async (boardsBase64, eloSelf, eloOppo) => {
        calls.push(`scoreBatch:${eloSelf.join(",")}:${eloOppo.join(",")}`);
        const boards = base64ToFloat32Array(boardsBase64);
        expect(boards.length).toBe(eloSelf.length * MAIA2_TENSOR_FLOATS);
        const logits = new Float32Array(eloSelf.length * MAIA2_VOCAB_SIZE);
        for (let b = 0; b < eloSelf.length; b += 1) {
          logits[b * MAIA2_VOCAB_SIZE + e2e4Idx] = 4.0;
        }
        return float32ArrayToBase64(logits);
      }),
      unload: jest.fn(async () => {
        calls.push("unload");
        return true;
      })
    };

    const model = createNativeHumanPolicyModel(fakeBridge);
    expect(model).not.toBeNull();

    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const results = await model!.scoreMoves([
      { fen: startFen, moves: ["e2e4", "d2d4"], elos: [1100, 1700] }
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]!.byElo[1100]!.ranks?.["e2e4"]).toBe(1);
    expect(results[0]!.byElo[1700]!.probs["e2e4"]).toBeGreaterThan(0.5);

    await model!.unload();
    expect(calls[0]).toBe("isAvailable");
    expect(calls[1]).toMatch(/^loadModel:sha256:/);
    expect(calls[2]).toBe("scoreBatch:1,7:1,7");
    expect(calls[3]).toBe("unload");
  });

  it("rejects scoreMoves cleanly when isAvailable returns false so difficulty falls back to sf_heuristic_v1", async () => {
    const fakeBridge: NativeHumanPolicyBridge = {
      isAvailable: jest.fn(async () => false),
      loadModel: jest.fn(async () => false),
      scoreBatch: jest.fn(async () => ""),
      unload: jest.fn(async () => true)
    };

    const model = createNativeHumanPolicyModel(fakeBridge)!;
    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    await expect(
      model.scoreMoves([{ fen: startFen, moves: ["e2e4"], elos: [1100, 1700] }])
    ).rejects.toThrow("unavailable");
    expect(fakeBridge.loadModel).not.toHaveBeenCalled();
  });
});
