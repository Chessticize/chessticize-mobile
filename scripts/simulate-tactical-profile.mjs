// Behavioral diagnostics for Tactical Profile detection with simulated
// players. Synthetic histories are never calibration evidence: this report
// deliberately carries no corpus, report, or artifact hash and must not be
// used as input to pnpm calibrate:tactical-profile.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { BALANCED_SIMULATED_PLAYER, setSimulatedStartingRatings } from "../packages/storage/src/simulation/scenarios.ts";
import {
  SimulatedPlayer,
  createSimulationClock,
  simulateTrainingHistory
} from "../packages/storage/src/simulation/simulated-player.ts";
import { createSimulationWorld } from "../packages/storage/src/simulation/simulation-world.ts";
import { SQLitePuzzlePackSource } from "../packages/storage/src/sqlite-puzzle-pack-source.ts";
import { NodeSqliteDatabase } from "../packages/storage/src/sqlite-store.ts";

const SLICE_PATH = "fixtures/puzzles/bundled-core-pack.json";
const MANIFEST_PATH = "fixtures/puzzles/bundled-core-pack.manifest.json";
const CALIBRATION_PATH = "config/tactical-profile-calibration-artifact-v1.json";
const HISTORY_START = "2026-06-01T00:00:00.000Z";

/**
 * Planted effects measured by the report. Each targets one signal; an effect
 * may pin its own Arrow Duel share so an Arrow Duel target has evidence.
 */
export const REPORT_EFFECTS = [
  {
    id: "uniform",
    description: "uniform player (false-positive baseline)",
    player: BALANCED_SIMULATED_PLAYER
  },
  {
    id: "solve:fork",
    description: "fork solve-rate weakness (logit -1.4, observed about 70% vs 88%)",
    target: { signalId: "line:fork", reasons: ["solve_rate", "both"] },
    player: { ...BALANCED_SIMULATED_PLAYER, themeSolveLogitOffsets: { fork: -1.4 } }
  },
  {
    id: "solve:fork:arrow_duel",
    description: "fork solve-rate weakness in Arrow Duel (logit -1.4, Arrow Duel Runs only)",
    target: { signalId: "arrow_duel:fork", reasons: ["solve_rate", "both"] },
    arrowDuelShare: 1,
    player: { ...BALANCED_SIMULATED_PLAYER, themeSolveLogitOffsets: { fork: -1.4 } }
  },
  {
    id: "uniform:arrow_duel",
    description: "uniform player in Arrow Duel (false-positive baseline, Arrow Duel Runs only)",
    arrowDuelShare: 1,
    player: BALANCED_SIMULATED_PLAYER
  },
  {
    id: "speed:fork",
    description: "fork completed-speed weakness (1.5x slower)",
    target: { signalId: "line:fork", reasons: ["completed_speed", "both"] },
    player: { ...BALANCED_SIMULATED_PLAYER, themeSpeedMultipliers: { fork: 1.5 } }
  },
  {
    id: "speed:mateIn2",
    description: "mate-in-2 completed-speed weakness (1.5x slower)",
    target: { signalId: "line:mateIn2", reasons: ["completed_speed", "both"] },
    player: { ...BALANCED_SIMULATED_PLAYER, themeSpeedMultipliers: { mateIn2: 1.5 } }
  }
];

export function simulateEffect({ effect, seeds, runs, arrowDuelShare, createWorld }) {
  const histories = [];
  for (let seedIndex = 0; seedIndex < seeds; seedIndex += 1) {
    const seed = `${effect.id}:${seedIndex + 1}`;
    const world = createWorld();
    try {
      setSimulatedStartingRatings(world.practice);
      const clock = createSimulationClock(Date.parse(HISTORY_START));
      const records = simulateTrainingHistory({
        practice: world.practice,
        player: new SimulatedPlayer(effect.player, seed),
        clock,
        seed,
        plan: { runs, arrowDuelShare: effect.arrowDuelShare ?? arrowDuelShare }
      });
      histories.push(summarizeHistory(records, effect.target));
    } finally {
      world.close();
    }
  }
  return summarizeEffect(effect, histories);
}

export function summarizeHistory(records, target) {
  const initialPhase = records[0]?.phase;
  const firstPhaseChange = records.findIndex((record) => record.phase !== initialPhase);
  const detectedAt = target === undefined
    ? -1
    : records.findIndex((record) => record.signals.some((signal) =>
        signal.id === target.signalId &&
        signal.status === "recommended" &&
        target.reasons.includes(signal.reason)
      ));
  // The planted effect applies to its theme in both task families, so only a
  // recommendation for another theme counts as a false positive.
  const targetTheme = target?.signalId.split(":")[1];
  const offTargetRuns = records.filter((record) => record.signals.some((signal) =>
    signal.status === "recommended" && signal.theme !== targetTheme
  )).length;
  // A re-entry is a signal that becomes recommended again after leaving
  // recommendation: flapping around the hysteresis band.
  const recommendedBefore = new Set();
  const leftRecommendation = new Set();
  let recommendationReentries = 0;
  for (const record of records) {
    const recommendedNow = new Set(record.signals
      .filter((signal) => signal.status === "recommended")
      .map((signal) => signal.id));
    for (const id of recommendedBefore) {
      if (!recommendedNow.has(id)) {
        leftRecommendation.add(id);
      }
    }
    for (const id of recommendedNow) {
      if (leftRecommendation.delete(id)) {
        recommendationReentries += 1;
      }
      recommendedBefore.add(id);
    }
    for (const id of [...recommendedBefore]) {
      if (!recommendedNow.has(id)) {
        recommendedBefore.delete(id);
      }
    }
  }
  // Top-rank precision. Signals arrive in the Profile's ranked order: the
  // first recommendation is the Home lead, and a Focused Run takes the top
  // two recommended themes of its task family.
  const targetFamily = target?.signalId.split(":")[0];
  let runsWithRecommendation = 0;
  let plantedLeadRuns = 0;
  let offTargetRunSlotRuns = 0;
  for (const record of records) {
    const recommended = record.signals.filter((signal) => signal.status === "recommended");
    if (recommended.length === 0) {
      continue;
    }
    runsWithRecommendation += 1;
    if (recommended[0]?.theme === targetTheme) {
      plantedLeadRuns += 1;
    }
    const runSlots = recommended
      .filter((signal) => signal.taskFamily === targetFamily)
      .slice(0, 2);
    if (runSlots.some((signal) => signal.theme !== targetTheme)) {
      offTargetRunSlotRuns += 1;
    }
  }
  return {
    runs: records.length,
    detectedAtRun: detectedAt < 0 ? undefined : detectedAt + 1,
    offTargetRecommendationRuns: offTargetRuns,
    runsWithRecommendation,
    plantedLeadRuns,
    offTargetRunSlotRuns,
    recommendationReentries,
    firstPhaseChangeRun: firstPhaseChange < 0 ? undefined : firstPhaseChange + 1,
    firstPhase: initialPhase,
    changedPhase: firstPhaseChange < 0 ? undefined : records[firstPhaseChange]?.phase
  };
}

function topRankSummary(histories) {
  const sum = (key) => histories.reduce((total, history) => total + history[key], 0);
  const withRecommendation = sum("runsWithRecommendation");
  return {
    runsWithRecommendation: withRecommendation,
    plantedLeadRate: ratio(sum("plantedLeadRuns"), withRecommendation),
    offTargetRunSlotRate: ratio(sum("offTargetRunSlotRuns"), withRecommendation)
  };
}

function summarizeEffect(effect, histories) {
  const totalRuns = histories.reduce((sum, history) => sum + history.runs, 0);
  const offTargetRuns = histories.reduce(
    (sum, history) => sum + history.offTargetRecommendationRuns,
    0
  );
  const detections = histories
    .map((history) => history.detectedAtRun)
    .filter((run) => run !== undefined);
  const phaseChanges = histories
    .map((history) => history.firstPhaseChangeRun)
    .filter((run) => run !== undefined);
  return {
    effect: effect.id,
    description: effect.description,
    seeds: histories.length,
    ...(effect.target === undefined
      ? {}
      : {
          detectionRate: ratio(detections.length, histories.length),
          runsToDetection: distribution(detections),
          topRank: topRankSummary(histories)
        }),
    falsePositive: {
      seedsWithAnyOffTargetRecommendation: histories.filter(
        (history) => history.offTargetRecommendationRuns > 0
      ).length,
      seedRate: ratio(
        histories.filter((history) => history.offTargetRecommendationRuns > 0).length,
        histories.length
      ),
      runRate: ratio(offTargetRuns, totalRuns)
    },
    recommendationReentries: histories.reduce(
      (sum, history) => sum + history.recommendationReentries,
      0
    ),
    runsToFirstPhaseChange: distribution(phaseChanges),
    phaseChanges: countBy(histories.map((history) =>
      history.changedPhase === undefined
        ? `${history.firstPhase} (unchanged)`
        : `${history.firstPhase} -> ${history.changedPhase}`
    ))
  };
}

function distribution(values) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return {
    min: sorted[0],
    median: sorted[Math.floor((sorted.length - 1) / 2)],
    mean: Number((sorted.reduce((sum, value) => sum + value, 0) / sorted.length).toFixed(2)),
    max: sorted.at(-1)
  };
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(3));
}

function countBy(values) {
  const counts = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      seeds: { type: "string", default: "10" },
      runs: { type: "string", default: "40" },
      "arrow-duel-share": { type: "string", default: "0.25" },
      effect: { type: "string", multiple: true },
      pack: { type: "string" },
      calibration: { type: "string", default: CALIBRATION_PATH },
      json: { type: "boolean", default: false }
    }
  });
  const seeds = Number.parseInt(values.seeds, 10);
  const runs = Number.parseInt(values.runs, 10);
  const arrowDuelShare = Number(values["arrow-duel-share"]);
  if (!Number.isInteger(seeds) || seeds < 1) {
    throw new Error("--seeds must be a positive integer");
  }
  if (!Number.isInteger(runs) || runs < 1) {
    throw new Error("--runs must be a positive integer");
  }
  if (!(arrowDuelShare >= 0 && arrowDuelShare <= 1)) {
    throw new Error("--arrow-duel-share must be between 0 and 1");
  }
  const effects = values.effect === undefined
    ? REPORT_EFFECTS
    : values.effect.map((id) => {
        const effect = REPORT_EFFECTS.find((candidate) => candidate.id === id);
        if (!effect) {
          throw new Error(
            `Unknown --effect ${id}; expected one of ${REPORT_EFFECTS.map((candidate) => candidate.id).join(", ")}`
          );
        }
        return effect;
      });
  return {
    seeds,
    runs,
    arrowDuelShare,
    effects,
    pack: values.pack,
    calibration: values.calibration,
    json: values.json
  };
}

function worldFactory(packPath, calibration) {
  const manifest = JSON.parse(readFileSync(resolve(MANIFEST_PATH), "utf8"));
  if (packPath === undefined) {
    const packPuzzles = JSON.parse(readFileSync(resolve(SLICE_PATH), "utf8"));
    return {
      source: `${SLICE_PATH} (${packPuzzles.length} puzzles, representative Core Pack slice)`,
      create: () => createSimulationWorld({ manifest, calibration, packPuzzles }),
      close: () => {}
    };
  }
  const resolved = resolve(packPath);
  if (!existsSync(resolved)) {
    throw new Error(`Puzzle pack not found at ${resolved}. Run pnpm fetch:core-pack first.`);
  }
  const database = new DatabaseSync(resolved, { readOnly: true });
  const packSource = new SQLitePuzzlePackSource(new NodeSqliteDatabase(database), {
    arrowDuelEligibility: manifest.arrowDuelCount === manifest.puzzleCount
      ? "all"
      : "all_non_promotion"
  });
  return {
    source: `${packPath} (${packSource.countPuzzles()} puzzles, full Core Pack)`,
    create: () => createSimulationWorld({ manifest, calibration, packSource }),
    close: () => database.close()
  };
}

function formatText(report) {
  const lines = [
    "Tactical Profile simulated-player report",
    "Synthetic behavioral diagnostics only; never calibration evidence.",
    `Pack: ${report.pack}`,
    `Calibration: ${report.calibrationId}`,
    `Seeds: ${report.seeds}  Runs per seed: ${report.runs}  Arrow Duel share: ${report.arrowDuelShare}`,
    ""
  ];
  for (const result of report.results) {
    lines.push(`${result.effect}: ${result.description}`);
    if (result.detectionRate !== undefined) {
      const detection = result.runsToDetection;
      lines.push(
        `  detection rate: ${result.detectionRate}` +
        (detection === null
          ? "  (never detected)"
          : `  Runs to detection min/median/mean/max: ${detection.min}/${detection.median}/${detection.mean}/${detection.max}`)
      );
      lines.push(
        `  top rank (of ${result.topRank.runsWithRecommendation} Runs with a recommendation): planted theme leads ${result.topRank.plantedLeadRate}, off-target in Focused Run slots ${result.topRank.offTargetRunSlotRate}`
      );
    }
    lines.push(
      `  false positive (recommendations for other themes): seed rate ${result.falsePositive.seedRate}, run rate ${result.falsePositive.runRate}`
    );
    lines.push(`  recommendation re-entries (flapping): ${result.recommendationReentries}`);
    const phase = result.runsToFirstPhaseChange;
    lines.push(
      `  first Profile phase change: ${phase === null ? "none" : `Runs min/median/max ${phase.min}/${phase.median}/${phase.max}`}  ${JSON.stringify(result.phaseChanges)}`
    );
    lines.push("");
  }
  lines.push(`Elapsed: ${report.elapsedSeconds}s`);
  return lines.join("\n");
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const startedAt = Date.now();
  // A candidate artifact may be compared before it replaces the shipped one.
  const calibration = JSON.parse(readFileSync(resolve(options.calibration), "utf8"));
  const factory = worldFactory(options.pack, calibration);
  try {
    const results = options.effects.map((effect) => simulateEffect({
      effect,
      seeds: options.seeds,
      runs: options.runs,
      arrowDuelShare: options.arrowDuelShare,
      createWorld: factory.create
    }));
    const report = {
      kind: "tactical-profile-simulation-diagnostics",
      calibrationEvidence: false,
      pack: factory.source,
      calibrationId: calibration.calibrationId,
      seeds: options.seeds,
      runs: options.runs,
      arrowDuelShare: options.arrowDuelShare,
      results,
      elapsedSeconds: Number(((Date.now() - startedAt) / 1_000).toFixed(1))
    };
    process.stdout.write(
      options.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatText(report)}\n`
    );
  } finally {
    factory.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
