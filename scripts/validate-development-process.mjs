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
const processWorkflow = read(".github/workflows/process.yml");
const agents = read("AGENTS.md");
const testingArchitecture = read("docs/TESTING_ARCHITECTURE.md");
const agentDocPaths = [
  "docs/agents/domain.md",
  "docs/agents/issue-tracker.md",
  "docs/agents/triage-labels.md"
];
const domainDocs = read(agentDocPaths[0]);
const issueTracker = read(agentDocPaths[1]);
const triageLabels = read(agentDocPaths[2]);
const devLoopSkill = read(".codex/skills/chessticize-mobile-dev-loop/SKILL.md");
const localE2eSkill = read(".codex/skills/chessticize-mobile-local-e2e/SKILL.md");
const androidReleaseSkill = read(".codex/skills/chessticize-android-release/SKILL.md");
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

for (const agentDocPath of agentDocPaths) {
  assert.match(agents, new RegExp(agentDocPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

assert.match(domainDocs, /lazy artifacts/);
assert.match(domainDocs, /CONTEXT-MAP\.md/);
assert.match(issueTracker, /--json number,title,body,state,labels,comments/);
assert.match(issueTracker, /docs\/agents\/triage-labels\.md/);

for (const requiredLabel of [
  "needs-triage",
  "needs-info",
  "ready-for-agent",
  "ready-for-human",
  "wontfix",
  "wayfinder:map",
  "wayfinder:research",
  "wayfinder:prototype",
  "wayfinder:grilling",
  "wayfinder:task"
]) {
  assert.match(triageLabels, new RegExp("`" + requiredLabel + "`"));
}

assert.equal(count(processWorkflow, '- ".codex/skills/**"'), 2);
assert.equal(count(processWorkflow, '- "docs/agents/**"'), 2);

for (const releaseContract of [
  "docs/RELEASE_SOURCE_POLICY.md",
  "docs/ANDROID_PLAY_RELEASE.md",
  "docs/ANDROID_GITHUB_RELEASE.md",
  "docs/ANDROID_VALIDATION.md",
  "docs/ANDROID_PLAY_LISTING.md",
  "docs/ANDROID_PRIVACY_DISCLOSURE.md"
]) {
  assert.match(androidReleaseSkill, new RegExp(releaseContract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

for (const protectedPhase of [
  "prepare-source-draft",
  "publish-source",
  "prepare-binary",
  "publish-binary"
]) {
  assert.match(androidReleaseSkill, new RegExp("`" + protectedPhase + "`"));
}

assert.match(androidReleaseSkill, /status: \"play-ready\"/);
assert.match(androidReleaseSkill, /physical ARM64/);
assert.match(androidReleaseSkill, /directly to 100 percent/);
assert.match(androidReleaseSkill, /never move\s+its tag, rebuild it, or reuse its version code/);
assert.match(androidReleaseSkill, /strict read-only audit mode/);
assert.match(androidReleaseSkill, /canonicalAndroidSourceTag/);
assert.match(androidReleaseSkill, /retained candidate/);
assert.match(androidReleaseSkill, /proposed replacement/);
assert.match(androidReleaseSkill, /mark every unobserved\s+Console gate UNKNOWN/);
assert.match(androidReleaseSkill, /created \*\*and published\*\*/);
assert.match(androidReleaseSkill, /Internal \*\*or\*\* Closed testing/);
assert.match(androidReleaseSkill, /ordering conflict is owner-ratified or corrected/);
assert.match(androidReleaseSkill, /Complete #200 independently/);
assert.match(androidReleaseSkill, /#188 acceptance after #186, #187, and #200/);
assert.match(agents, /\.codex\/skills\/chessticize-android-release\/SKILL\.md/);

assert.match(localE2eSkill, /CHESSTICIZE_E2E_SCOPE/);
assert.match(localE2eSkill, /Replace `practice` with `flows` or `full`/);
assert.doesNotMatch(localE2eSkill, /Routine PRs require passing local `flows` and `practice`/);

const localE2eRunnerSource = read(
  ".codex/skills/chessticize-mobile-local-e2e/scripts/run-local-e2e.sh"
);
assert.match(localE2eRunnerSource, /normalize_worktree_cocoapods_checksum/);
assert.match(localE2eRunnerSource, /hermes-engine: \[0-9a-f\]\{40\}/);
assert.match(localE2eRunnerSource, /git apply --reverse/);

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
