// Shared inputs for simulated-player tests: the representative Core Pack
// slice, the real manifest and the shipped calibration artifact.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Puzzle, PuzzlePackManifest } from "../../core/src/index.ts";
import { setSimulatedStartingRatings } from "../src/simulation/scenarios.ts";
import {
  SimulatedPlayer,
  createSimulationClock,
  simulateTrainingHistory,
  type SimulatedHistoryPlan,
  type SimulatedPlayerProfile,
  type SimulatedRunRecord,
  type SimulationClock
} from "../src/simulation/simulated-player.ts";
import {
  createSimulationWorld,
  type SimulationWorld
} from "../src/simulation/simulation-world.ts";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

const packSlice = readJson<Puzzle[]>("fixtures/puzzles/bundled-core-pack.json");
const manifest = readJson<PuzzlePackManifest>("fixtures/puzzles/bundled-core-pack.manifest.json");
const shippedCalibration = readJson<unknown>("config/tactical-profile-calibration-artifact-v1.json");

/** The shipped artifact's recommendation exit threshold. */
export const SHIPPED_RECOMMENDATION_EXIT_PROBABILITY = (
  shippedCalibration as { evidence: { recommendationExitProbability: number } }
).evidence.recommendationExitProbability;

export const SIMULATION_START = "2026-06-01T00:00:00.000Z";

export function createSliceWorld(): SimulationWorld {
  return createSimulationWorld({
    manifest,
    calibration: shippedCalibration,
    packPuzzles: packSlice
  });
}

export type SimulatedHistory = {
  world: SimulationWorld;
  clock: SimulationClock;
  player: SimulatedPlayer;
  records: SimulatedRunRecord[];
};

/** Plays a history in a fresh world; the caller closes `world`. */
export function playHistory(input: {
  player: SimulatedPlayerProfile;
  seed: string;
  plan: SimulatedHistoryPlan;
}): SimulatedHistory {
  const world = createSliceWorld();
  try {
    setSimulatedStartingRatings(world.practice);
    const clock = createSimulationClock(Date.parse(SIMULATION_START));
    const player = new SimulatedPlayer(input.player, input.seed);
    const records = simulateTrainingHistory({
      practice: world.practice,
      player,
      clock,
      seed: input.seed,
      plan: input.plan
    });
    return { world, clock, player, records };
  } catch (error) {
    world.close();
    throw error;
  }
}

/** Plays a history and closes its world. */
export function playClosedHistory(
  input: Parameters<typeof playHistory>[0]
): SimulatedRunRecord[] {
  const history = playHistory(input);
  history.world.close();
  return history.records;
}

export function signalStatus(
  record: SimulatedRunRecord,
  signalId: string
): "recommended" | "watch" | "absent" {
  return record.signals.find((signal) => signal.id === signalId)?.status ?? "absent";
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(repositoryRoot, path), "utf8")) as T;
}
