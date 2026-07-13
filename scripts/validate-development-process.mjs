import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const read = (relativePath) => readFileSync(path.join(repoRoot, relativePath), "utf8");
const count = (text, needle) => text.split(needle).length - 1;

const coreWorkflow = read(".github/workflows/core.yml");
const mobileWorkflow = read(".github/workflows/mobile-ios.yml");
const agents = read("AGENTS.md");
const testingArchitecture = read("docs/TESTING_ARCHITECTURE.md");
const devLoopSkill = read(".codex/skills/chessticize-mobile-dev-loop/SKILL.md");
const localE2eSkill = read(".codex/skills/chessticize-mobile-local-e2e/SKILL.md");
const localE2eRunner = path.join(
  repoRoot,
  ".codex/skills/chessticize-mobile-local-e2e/scripts/run-local-e2e.sh"
);
const prTemplate = read(".github/pull_request_template.md");
const releaseDocs = [
  read("docs/TESTFLIGHT_QA.md"),
  read("docs/APP_STORE_UPLOAD.md"),
  read("docs/RELEASE_SOURCE_POLICY.md")
];

assert.equal(count(coreWorkflow, "run: pnpm test:unit"), 1);
assert.equal(count(coreWorkflow, "run: pnpm test:integration"), 1);
assert.equal(count(coreWorkflow, "run: pnpm test:e2e"), 1);
assert.equal(count(coreWorkflow, "run: pnpm test\n"), 0);
assert.equal(count(coreWorkflow, "pnpm mobile:test"), 0);
assert.equal(count(coreWorkflow, "pnpm mobile:typecheck"), 0);

assert.match(mobileWorkflow, /schedule:\s*\n\s*#.*\n\s*- cron: "0 10 \* \* \*"/);
assert.equal(count(mobileWorkflow, "run: pnpm mobile:e2e:build:ios"), 1);
assert.equal(count(mobileWorkflow, "DETOX_ACTIVE_SUITE: flows"), 1);
assert.equal(count(mobileWorkflow, "DETOX_ACTIVE_SUITE: practice"), 1);
assert.equal(count(mobileWorkflow, "matrix:"), 0);
assert.match(mobileWorkflow, /github\.event_name == 'schedule'/);

for (const policy of [agents, testingArchitecture, devLoopSkill]) {
  assert.match(policy, /No mobile Detox/);
  assert.match(policy, /Targeted native validation/);
  assert.match(policy, /Full native validation/);
  assert.match(policy, /[Nn]ightly/);
}

assert.match(localE2eSkill, /CHESSTICIZE_E2E_SCOPE/);
assert.match(localE2eSkill, /Replace `practice` with `flows` or `full`/);
assert.doesNotMatch(localE2eSkill, /Routine PRs require passing local `flows` and `practice`/);

for (const option of [
  "- [ ] No mobile Detox",
  "- [ ] Targeted `flows` spec or suite",
  "- [ ] Targeted `practice` spec or suite",
  "- [ ] Full `flows` and `practice`",
  "- [ ] Focused simulator screenshot only"
]) {
  assert.match(prTemplate, new RegExp(option.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

for (const releaseDoc of releaseDocs) {
  assert.match(releaseDoc, /GitHub Mobile iOS\/Detox/);
  assert.match(releaseDoc, /exact/);
}

const syntaxCheck = spawnSync("bash", ["-n", localE2eRunner], { encoding: "utf8" });
assert.equal(syntaxCheck.status, 0, syntaxCheck.stderr);

const invalidScope = spawnSync(localE2eRunner, [], {
  encoding: "utf8",
  env: { ...process.env, CHESSTICIZE_E2E_SCOPE: "invalid" }
});
assert.notEqual(invalidScope.status, 0);
assert.match(invalidScope.stderr, /Set CHESSTICIZE_E2E_SCOPE to flows, practice, or full/);

console.log("Development process validation passed.");
