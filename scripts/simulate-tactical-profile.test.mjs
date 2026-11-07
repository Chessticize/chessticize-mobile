import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { summarizeHistory } from "./simulate-tactical-profile.mjs";

function record(phase, signals = []) {
  return {
    phase,
    signals: signals.map((signal) => ({ ...signal, taskFamily: signal.id.split(":")[0] }))
  };
}

test("summaries count detection by planted signal and false positives by other themes", () => {
  const target = { signalId: "line:fork", reasons: ["completed_speed", "both"] };
  const summary = summarizeHistory([
    record("collecting"),
    record("ready", [
      { id: "arrow_duel:fork", theme: "fork", status: "recommended", reason: "completed_speed" }
    ]),
    record("ready", [
      { id: "line:fork", theme: "fork", status: "recommended", reason: "solve_rate" },
      { id: "line:pin", theme: "pin", status: "watch", reason: "completed_speed" }
    ]),
    // An off-target theme outranks the planted one: it leads Home and takes
    // a Focused Run slot.
    record("ready", [
      { id: "line:pin", theme: "pin", status: "recommended", reason: "completed_speed" },
      { id: "line:fork", theme: "fork", status: "recommended", reason: "completed_speed" }
    ]),
    // arrow_duel:fork left recommendation after Run 2 and re-enters here.
    record("ready", [
      { id: "arrow_duel:fork", theme: "fork", status: "recommended", reason: "completed_speed" },
      { id: "line:fork", theme: "fork", status: "recommended", reason: "completed_speed" }
    ])
  ], target);

  assert.deepEqual(summary, {
    runs: 5,
    detectedAtRun: 4,
    offTargetRecommendationRuns: 1,
    runsWithRecommendation: 4,
    plantedLeadRuns: 3,
    offTargetRunSlotRuns: 1,
    recommendationReentries: 1,
    firstPhaseChangeRun: 2,
    firstPhase: "collecting",
    changedPhase: "ready"
  });
});

test("the report is labeled synthetic and carries no calibration hashes", () => {
  const output = execFileSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--no-warnings",
      "scripts/simulate-tactical-profile.mjs",
      "--seeds",
      "1",
      "--runs",
      "2",
      "--effect",
      "speed:fork",
      "--json"
    ],
    { encoding: "utf8" }
  );
  const report = JSON.parse(output);

  assert.equal(report.kind, "tactical-profile-simulation-diagnostics");
  assert.equal(report.calibrationEvidence, false);
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0].seeds, 1);
  assert.doesNotMatch(output, /sha256:|corpusHash|reportHash/);
});
