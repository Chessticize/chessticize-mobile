// Dev-only seeded Tactical Profile history. mobilePractice.ts requires this
// module only behind a literal `__DEV__` check, so Release (Production
// identity) bundles never contain it. The history is played through the
// public PracticeService commands by the shared simulated player.
import type { PracticeService } from "../../../../packages/storage/src/practice-service.ts";
import {
  SIMULATED_HISTORY_SCENARIOS,
  playSimulatedHistoryScenarioAsync,
  type SimulatedHistoryScenarioId
} from "../../../../packages/storage/src/simulation/scenarios.ts";
import { createSimulationClock } from "../../../../packages/storage/src/simulation/simulated-player.ts";

const DAY_MS = 24 * 60 * 60 * 1_000;
const RUNS_PER_DAY = 2;

export const DEV_TACTICAL_HISTORY_SCENARIOS = Object.keys(
  SIMULATED_HISTORY_SCENARIOS
) as SimulatedHistoryScenarioId[];

export type DevTacticalHistorySeedResult = {
  scenario: SimulatedHistoryScenarioId;
  runs: number;
  attempts: number;
  phase: string;
  /** Wall-clock time spent seeding on this device. */
  durationMs: number;
};

/**
 * Plays a named simulated history that ends before `now`. It refuses to mix
 * synthetic Runs into existing progress, and turns iCloud sync off first so
 * the synthetic history stays on this device. Seeding takes several seconds
 * on a simulator, so it yields to the UI after each Run and reports progress.
 */
export async function seedDevTacticalHistory(
  service: PracticeService,
  scenario: SimulatedHistoryScenarioId,
  now: string,
  onProgress?: (completedRuns: number, totalRuns: number) => void
): Promise<DevTacticalHistorySeedResult> {
  const seedingStartedAtMs = Date.now();
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) {
    throw new Error(`Seeded history received an invalid time: ${now}`);
  }
  const active = service.getActiveSprint();
  if (active && (active.status === "active" || active.status === "paused")) {
    throw new Error("Finish the current Run before seeding a history");
  }
  if (service.countHistory() > 0 || service.listSprintSessions().length > 0) {
    throw new Error("Seeded history needs empty progress; delete the Dev app data first");
  }
  service.saveSettings({
    ...service.getSettings(),
    sync: { ...service.getSettings().sync, iCloudEnabled: false }
  });
  const totalRuns = SIMULATED_HISTORY_SCENARIOS[scenario].runs;
  const days = Math.ceil(totalRuns / RUNS_PER_DAY) + 1;
  const clock = createSimulationClock(nowMs - days * DAY_MS);
  onProgress?.(0, totalRuns);
  const records = await playSimulatedHistoryScenarioAsync(
    {
      practice: service,
      clock,
      scenario,
      seed: `dev-seed:${scenario}`,
      plan: { runsPerDay: RUNS_PER_DAY, observeEveryRun: false }
    },
    async (completedRuns) => {
      onProgress?.(completedRuns, totalRuns);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  );
  if (clock.nowMs() >= nowMs) {
    throw new Error("Seeded history overlapped the current time");
  }
  const snapshot = service.getTacticalProfileSnapshot(now);
  return {
    scenario,
    runs: records.length,
    attempts: records.reduce((sum, record) => sum + record.attemptCount, 0),
    phase: snapshot?.phase ?? "unavailable",
    durationMs: Date.now() - seedingStartedAtMs
  };
}
