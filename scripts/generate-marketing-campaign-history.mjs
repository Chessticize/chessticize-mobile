import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MemoryStore } from '../packages/storage/src/memory-store.ts';
import { PracticeService } from '../packages/storage/src/practice-service.ts';
import { playSimulatedHistoryScenario } from '../packages/storage/src/simulation/scenarios.ts';
import { createSimulationClock } from '../packages/storage/src/simulation/simulated-player.ts';

// Run only on the host. Production bundles consume the frozen fictional
// history without importing the Dev-only simulated-player implementation.
const puzzleBytes = readFileSync(new URL('../fixtures/puzzles/bundled-core-pack.json', import.meta.url));
const story = JSON.parse(readFileSync(new URL('../config/app-store-marketing-story-v1.json', import.meta.url), 'utf8'));
process.env.TZ = story.captureClock.timeZone;
const scenario = 'slow-fork-speed';
const seed = 'marketing-1.6-release-campaign-1';
const startedAtMs = Date.parse(story.captureClock.instant) - 7 * 24 * 60 * 60 * 1000;
const practice = new PracticeService(new MemoryStore());
practice.loadFixturePuzzles(JSON.parse(puzzleBytes));
playSimulatedHistoryScenario({
  practice,
  clock: createSimulationClock(startedAtMs),
  scenario,
  seed,
  plan: { arrowDuelShare: 0, runs: 12 }
});
// UUIDs identify rows, not gameplay. Canonicalize them consistently across
// references so repeated host generation produces byte-identical fixtures.
const data = practice.exportLocalData();
const ids = new Map([
  ...data.sprintSessions.map((row, index) => [row.id, `marketing16-run-${index + 1}`]),
  ...data.attempts.map((row, index) => [row.id, `marketing16-attempt-${index + 1}`])
]);
const stableData = JSON.parse(JSON.stringify(data, (_key, value) => ids.get(value) ?? value));
const fixture = {
  generator: {
    script: 'scripts/generate-marketing-campaign-history.mjs',
    campaign: story.releaseCampaign.id,
    scenario,
    seed,
    startedAt: new Date(startedAtMs).toISOString(),
    puzzleSha256: createHash('sha256').update(puzzleBytes).digest('hex')
  },
  data: stableData
};
const output = new URL('../fixtures/marketing-mobile-1.6-history.json', import.meta.url);
const bytes = `${JSON.stringify(fixture, null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8') !== bytes) {
    throw new Error('Marketing history is stale; regenerate it with this script.');
  }
} else {
  writeFileSync(output, bytes);
}
console.log(`Verified fictional marketing history: ${fileURLToPath(output)}`);
