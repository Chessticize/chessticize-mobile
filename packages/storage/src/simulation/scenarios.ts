// Named simulated-player histories shared by behavioral tests, the report
// script and the Dev-only seeded history. Every scenario is synthetic and is
// never calibration evidence.
import { defaultSprintConfig } from "../../../core/src/index.ts";
import type { PracticeService } from "../practice-service.ts";
import {
  SimulatedPlayer,
  simulateTrainingHistory,
  type SimulatedHistoryPlan,
  type SimulatedPlayerProfile,
  type SimulatedRunRecord,
  type SimulationClock
} from "./simulated-player.ts";

/** A player whose Run Rating settles near 1,100 at about an 85% solve rate. */
export const BALANCED_SIMULATED_PLAYER: SimulatedPlayerProfile = {
  skillRating: 1_100,
  baseSolveRate: 0.85,
  baseDecisionSeconds: 7,
  timeNoiseSigma: 0.35
};

/** Starting Ratings near the balanced player's equilibrium. */
export const SIMULATED_STARTING_RATING = 1_050;

export const SIMULATED_HISTORY_SCENARIOS = {
  /** Uniform performance across themes. */
  balanced: {
    player: BALANCED_SIMULATED_PLAYER,
    runs: 24,
    arrowDuelShare: 0.25
  },
  /** Fork solved about 70% of the time against about 88% elsewhere (the #607 case). */
  "weak-fork-solve": {
    player: {
      ...BALANCED_SIMULATED_PLAYER,
      themeSolveLogitOffsets: { fork: -1.4 }
    },
    runs: 30,
    arrowDuelShare: 0.25
  },
  /** Fork solved correctly but about 1.6x slower than the player's own pace. */
  "slow-fork-speed": {
    player: {
      ...BALANCED_SIMULATED_PLAYER,
      themeSpeedMultipliers: { fork: 1.6 }
    },
    runs: 12,
    arrowDuelShare: 0
  },
  /** A slow-fork player who improved after an earlier recommendation. */
  "recently-recommended": {
    player: {
      ...BALANCED_SIMULATED_PLAYER,
      themeSpeedMultipliers: { fork: 1.8 },
      improvement: { startRun: 4, endRun: 5 }
    },
    runs: 30,
    arrowDuelShare: 0
  }
} as const satisfies Record<string, {
  player: SimulatedPlayerProfile;
  runs: number;
  arrowDuelShare: number;
}>;

export type SimulatedHistoryScenarioId = keyof typeof SIMULATED_HISTORY_SCENARIOS;

export function isSimulatedHistoryScenarioId(
  value: string
): value is SimulatedHistoryScenarioId {
  return Object.prototype.hasOwnProperty.call(SIMULATED_HISTORY_SCENARIOS, value);
}

/**
 * Sets both mixed Run Ratings through the public manual-Rating command so a
 * short history starts near the player's equilibrium.
 */
export function setSimulatedStartingRatings(
  practice: PracticeService,
  rating = SIMULATED_STARTING_RATING
): void {
  for (const mode of ["standard", "arrow_duel"] as const) {
    practice.setRating(defaultSprintConfig(mode).ratingKey, rating);
  }
}

/** Plays one named scenario through PracticeService. */
export function playSimulatedHistoryScenario(input: {
  practice: PracticeService;
  clock: SimulationClock;
  scenario: SimulatedHistoryScenarioId;
  seed: string | number;
  plan?: Partial<SimulatedHistoryPlan>;
}): SimulatedRunRecord[] {
  const scenario = SIMULATED_HISTORY_SCENARIOS[input.scenario];
  setSimulatedStartingRatings(input.practice);
  return simulateTrainingHistory({
    practice: input.practice,
    player: new SimulatedPlayer(scenario.player, input.seed),
    clock: input.clock,
    seed: input.seed,
    plan: {
      runs: scenario.runs,
      arrowDuelShare: scenario.arrowDuelShare,
      ...input.plan
    }
  });
}
