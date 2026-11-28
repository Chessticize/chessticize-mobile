#!/usr/bin/env node
/**
 * Real-model verification harness: runs real CoreML Maia-2 (at 1500 Elo) through
 * `selectMaiaMove` against weak Stockfish (Skill Level 0, depth 1) on macOS to
 * verify opening quality (zero knight-retreat loops) and practical playing strength.
 *
 * Usage:
 *   node scripts/verify-maia-play-strength.mjs [--games=10] [--rating=1500]
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { Chess } from "chess.js";
import {
  createMaia2HumanPolicyModel,
  openingPositionKey,
  selectMaiaMove
} from "../packages/core/src/index.ts";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [k, v] = arg.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  })
);
const numGames = Number(args.games ?? 10);
const maiaRating = Number(args.rating ?? 1500);
const modelPath = resolve("fixtures/models/maia2-rapid-int8.mlmodelc");
const stockfishPath = process.env.STOCKFISH_BIN ?? "/opt/homebrew/bin/stockfish";

if (process.platform !== "darwin") {
  console.error("CoreML verification requires macOS.");
  process.exit(1);
}
if (!existsSync(modelPath)) {
  console.error(`Missing ${modelPath}. Run: node scripts/fetch-maia2-model.mjs --coreml`);
  process.exit(1);
}
if (!existsSync(stockfishPath)) {
  console.error(`Missing Stockfish at ${stockfishPath}. Set STOCKFISH_BIN or install stockfish.`);
  process.exit(1);
}

const scratchDir = mkdtempSync(join(tmpdir(), "chessticize-maia-verify-"));
const swiftSrc = join(scratchDir, "worker.swift");
const swiftBin = join(scratchDir, "worker");

writeFileSync(
  swiftSrc,
  `import CoreML
import Foundation

let url = URL(fileURLWithPath: CommandLine.arguments[1])
let cfg = MLModelConfiguration()
cfg.computeUnits = .all
let model = try MLModel(contentsOf: url, configuration: cfg)
let boards = try MLMultiArray(shape: [2, 18, 8, 8], dataType: .float32)
let selfArr = try MLMultiArray(shape: [2], dataType: .int32)
let oppoArr = try MLMultiArray(shape: [2], dataType: .int32)

while let line = readLine() {
  let parts = line.split(separator: " ", maxSplits: 1)
  guard parts.count == 2, let eloCat = Int32(parts[0]), let data = Data(base64Encoded: String(parts[1])) else {
    print("ERR")
    fflush(stdout)
    continue
  }
  data.withUnsafeBytes { raw in
    let src = raw.bindMemory(to: Float.self).baseAddress!
    let dst = boards.dataPointer.assumingMemoryBound(to: Float.self)
    dst.update(from: src, count: 1152)
    (dst + 1152).update(from: src, count: 1152)
  }
  selfArr.dataPointer.assumingMemoryBound(to: Int32.self)[0] = eloCat
  selfArr.dataPointer.assumingMemoryBound(to: Int32.self)[1] = eloCat
  oppoArr.dataPointer.assumingMemoryBound(to: Int32.self)[0] = eloCat
  oppoArr.dataPointer.assumingMemoryBound(to: Int32.self)[1] = eloCat

  let provider = try MLDictionaryFeatureProvider(dictionary: [
    "boards": MLFeatureValue(multiArray: boards),
    "elos_self": MLFeatureValue(multiArray: selfArr),
    "elos_oppo": MLFeatureValue(multiArray: oppoArr)
  ])
  let out = try model.prediction(from: provider)
  let logits = out.featureValue(for: "logits_maia")!.multiArrayValue!
  let rowStride = logits.strides.count >= 2 ? logits.strides[0].intValue : 1880
  let ptr = logits.dataPointer.assumingMemoryBound(to: Float.self)
  // Emit slot 0 respecting strides
  let outData = Data(bytes: ptr, count: 1880 * 4)
  _ = rowStride
  print(outData.base64EncodedString())
  fflush(stdout)
}
`
);

execFileSync("swiftc", ["-O", swiftSrc, "-o", swiftBin], { stdio: "inherit" });

const worker = spawn(swiftBin, [modelPath]);
const workerRl = createInterface({ input: worker.stdout });
const pending = [];
workerRl.on("line", (line) => pending.shift()?.(line));

const policyModel = createMaia2HumanPolicyModel({
  id: "coreml-verify",
  async runBatch(input) {
    const out = new Float32Array(input.batchSize * 1880);
    for (let i = 0; i < input.batchSize; i += 1) {
      const slice = input.boards.subarray(i * 1152, (i + 1) * 1152);
      const b64 = Buffer.from(slice.buffer, slice.byteOffset, slice.byteLength).toString("base64");
      const resp = await new Promise((resolvePromise) => {
        pending.push(resolvePromise);
        worker.stdin.write(`${input.eloSelfCategories[i]} ${b64}\n`);
      });
      const buf = Buffer.from(resp, "base64");
      out.set(new Float32Array(buf.buffer, buf.byteOffset, 1880), i * 1880);
    }
    return out;
  },
  async unload() {}
});

const sf = spawn(stockfishPath);
const sfRl = createInterface({ input: sf.stdout });
let sfWaiter = null;
sfRl.on("line", (line) => {
  if (sfWaiter && sfWaiter.match(line)) {
    const w = sfWaiter;
    sfWaiter = null;
    w.resolve(line);
  }
});
function sfCmd(cmd, waitPrefix) {
  return new Promise((resolvePromise) => {
    if (waitPrefix) {
      sfWaiter = { match: (l) => l.startsWith(waitPrefix), resolve: resolvePromise };
    }
    sf.stdin.write(`${cmd}\n`);
    if (!waitPrefix) resolvePromise("");
  });
}

try {
  await sfCmd("uci", "uciok");
  await sfCmd("setoption name Skill Level value 0");
  await sfCmd("isready", "readyok");

  let wins = 0;
  let losses = 0;
  let draws = 0;
  let openingKnightRetreats = 0;

  for (let g = 0; g < numGames; g += 1) {
    const chess = new Chess();
    const maiaColor = g % 2 === 0 ? "w" : "b";
    await sfCmd("ucinewgame");
    await sfCmd("isready", "readyok");
    const recentKeys = [openingPositionKey(chess.fen())];
    let plies = 0;

    while (!chess.isGameOver() && plies < 140) {
      if (chess.turn() === maiaColor) {
        const choice = await selectMaiaMove({
          fen: chess.fen(),
          maiaRating,
          ply: plies,
          recentPositionKeys: recentKeys.slice(-16),
          policyModel
        });
        const played = chess.move({
          from: choice.uci.slice(0, 2),
          to: choice.uci.slice(2, 4),
          ...(choice.uci[4] ? { promotion: choice.uci[4] } : {})
        });
        if (
          plies < 12 &&
          (played.san === "Nb1" || played.san === "Ng1" || played.san === "Nb8" || played.san === "Ng8")
        ) {
          openingKnightRetreats += 1;
        }
      } else {
        await sfCmd(`position fen ${chess.fen()}`);
        const best = await sfCmd("go depth 1", "bestmove ");
        const uci = best.split(" ")[1];
        chess.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          ...(uci[4] ? { promotion: uci[4] } : {})
        });
      }
      recentKeys.push(openingPositionKey(chess.fen()));
      plies += 1;
    }

    const outcome = chess.isCheckmate()
      ? chess.turn() === maiaColor
        ? "LOSS"
        : "WIN"
      : "DRAW";
    if (outcome === "WIN") wins += 1;
    else if (outcome === "LOSS") losses += 1;
    else draws += 1;
    console.log(
      `Game ${g + 1}/${numGames} (Maia ${maiaRating} = ${maiaColor}): ${outcome} in ${plies} plies | ${chess.history().slice(0, 12).join(" ")}`
    );
  }

  const scorePct = ((wins + 0.5 * draws) / numGames) * 100;
  console.log(
    `\nSummary: W=${wins} L=${losses} D=${draws} (${scorePct.toFixed(1)}% score) | openingKnightRetreats=${openingKnightRetreats}`
  );

  assert.equal(openingKnightRetreats, 0, "Maia must not shuffle knights back to rank 1/8 in the opening");
  assert.ok(scorePct >= 60, `Expected Maia ${maiaRating} to score >= 60% vs weak Stockfish, got ${scorePct.toFixed(1)}%`);
} finally {
  sf.kill();
  worker.kill();
  rmSync(scratchDir, { recursive: true, force: true });
}
