import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const {
  canonicalAndroidSourceTag,
  inspectAndroidReleaseDocumentation
} = require("../apps/mobile/scripts/android-play-release.js");

const read = (relativePath) => readFileSync(path.join(repoRoot, relativePath), "utf8");
const count = (text, needle) => text.split(needle).length - 1;

const coreWorkflow = read(".github/workflows/core.yml");
const mobileWorkflow = read(".github/workflows/mobile-ios.yml");
const processWorkflow = read(".github/workflows/process.yml");
const agents = read("AGENTS.md");
const rootReadme = read("README.md");
const labReadme = read("apps/mobile-lab/README.md");
const testingArchitecture = read("docs/TESTING_ARCHITECTURE.md");
const agentDocPaths = [
  "docs/agents/domain.md",
  "docs/agents/issue-tracker.md",
  "docs/agents/triage-labels.md",
  "docs/agents/ui-flow-design.md"
];
const domainDocs = read(agentDocPaths[0]);
const issueTracker = read(agentDocPaths[1]);
const triageLabels = read(agentDocPaths[2]);
const uiFlowDesign = read(agentDocPaths[3]);
const devLoopSkill = read(".codex/skills/chessticize-mobile-dev-loop/SKILL.md");
const localE2eSkill = read(".codex/skills/chessticize-mobile-local-e2e/SKILL.md");
const uiCalibrationSkill = read(".codex/skills/chessticize-mobile-ui-calibration/SKILL.md");
const androidReleaseSkill = read(".codex/skills/chessticize-android-release/SKILL.md");
const localE2eRunner = path.join(
  repoRoot,
  ".codex/skills/chessticize-mobile-local-e2e/scripts/run-local-e2e.sh"
);
const uiCalibrationRunner = path.join(
  repoRoot,
  ".codex/skills/chessticize-mobile-ui-calibration/scripts/capture-release-baseline.sh"
);
const prTemplate = read(".github/pull_request_template.md");
const releaseDocs = [
  read("docs/TESTFLIGHT_QA.md"),
  read("docs/APP_STORE_UPLOAD.md"),
  read("docs/RELEASE_SOURCE_POLICY.md")
];

const releaseVersion = JSON.parse(read("apps/mobile/release-version.json"));
const androidPlayRunbook = read("docs/ANDROID_PLAY_RELEASE.md");
const androidReleasePlan = read("apps/mobile/docs/ANDROID_RELEASE_PLAN.md");
const androidOwnerEvidence = JSON.parse(
  read("docs/android-play-owner-evidence.example.json")
);
const canonicalAndroidTag = canonicalAndroidSourceTag(
  releaseVersion.publicVersion,
  releaseVersion.androidVersionCode
);

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
assert.equal(count(processWorkflow, '- "README.md"'), 2);
assert.equal(count(processWorkflow, '- "apps/mobile-lab/README.md"'), 2);

for (const policy of [agents, devLoopSkill, labReadme]) {
  assert.match(policy, /Storybook-first UI flow gate/i);
  assert.match(policy, /explicit design approval/);
}

for (const policy of [agents, rootReadme, labReadme, testingArchitecture, devLoopSkill, prTemplate]) {
  assert.match(policy, /docs\/agents\/ui-flow-design\.md/);
}

assert.match(uiFlowDesign, /must not begin\s+production wiring/i);
assert.match(uiFlowDesign, /stable Storybook URL/);
assert.match(uiFlowDesign, /explicit design approval/);
assert.match(prTemplate, /Storybook-first design approved before product wiring/);
assert.match(prTemplate, /Design approval record:/);

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

assert.match(androidReleaseSkill, /Google Play distributes Android binaries/);
assert.match(androidReleaseSkill, /GitHub publishes corresponding\s+source/);
assert.match(androidReleaseSkill, /\*\*Delta:\*\*/);
assert.match(androidReleaseSkill, /\*\*Targeted:\*\*/);
assert.match(androidReleaseSkill, /\*\*Full:\*\*/);
assert.match(androidReleaseSkill, /built-in `github\.token`/);
assert.match(androidReleaseSkill, /Mirror APK/);
assert.match(androidReleaseSkill, /Play-signed universal APK/);
assert.match(androidReleaseSkill, /never publish an upload-key or locally rebuilt APK/);
assert.match(androidReleaseSkill, /mobile-android-source-recovery\.yml/);
assert.match(androidReleaseSkill, /physical device/);
assert.match(androidReleaseSkill, /never move its\s+tag, rebuild it, or reuse its code/);
assert.match(androidReleaseSkill, /strict read-only audit/);
assert.match(androidReleaseSkill, /canonicalAndroidSourceTag/);
assert.match(androidReleaseSkill, /retained signed candidate/);
assert.match(androidReleaseSkill, /proposed replacement/);
assert.match(androidReleaseSkill, /Mark unobserved Console gates\s+UNKNOWN/);
assert.match(androidReleaseSkill, /published annotated canonical tag/);
assert.match(androidReleaseSkill, /Internal and Closed tracks/);
assert.match(androidReleaseSkill, /first\s+launch, the boundary changed, or Play reports a problem/);
assert.match(agents, /\.codex\/skills\/chessticize-android-release\/SKILL\.md/);

assert.match(localE2eSkill, /CHESSTICIZE_E2E_SCOPE/);
assert.match(localE2eSkill, /Replace `practice` with `flows` or `full`/);
assert.doesNotMatch(localE2eSkill, /Routine PRs require passing local `flows` and `practice`/);
assert.match(agents, /chessticize-mobile-ui-calibration\/SKILL\.md/);
assert.match(devLoopSkill, /\$chessticize-mobile-ui-calibration/);
assert.match(uiCalibrationSkill, /app-store-07-custom-setup/);
assert.match(uiCalibrationSkill, /app-store-08-review-session/);

const uiCalibrationRunnerSource = read(
  ".codex/skills/chessticize-mobile-ui-calibration/scripts/capture-release-baseline.sh"
);
assert.match(uiCalibrationRunnerSource, /pnpm mobile:e2e:build:ios:release/);
assert.match(uiCalibrationRunnerSource, /pnpm mobile:e2e:store-assets:ios:release/);
assert.match(uiCalibrationRunnerSource, /git status --porcelain --untracked-files=normal/);
assert.match(uiCalibrationRunnerSource, /brew --prefix ruby@3\.3/);

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
  assert.match(releaseDoc, /exact/);
  assert.match(releaseDoc, /delta/i);
  assert.match(releaseDoc, /physical/i);
}

assert.equal(releaseVersion.publicVersion, "1.1");
assert.equal(releaseVersion.androidVersionCode, 4);
assert.ok(
  androidPlayRunbook.includes(
    `Android version code: \`apps/mobile/release-version.json\` ` +
      `(\`${releaseVersion.androidVersionCode}\`)`
  )
);
assert.deepEqual(
  inspectAndroidReleaseDocumentation({
    releaseVersion,
    playRunbook: androidPlayRunbook,
    releasePlan: androidReleasePlan
  }),
  []
);
assert.equal(
  androidOwnerEvidence.candidate.versionName,
  releaseVersion.publicVersion
);
assert.equal(
  androidOwnerEvidence.candidate.versionCode,
  releaseVersion.androidVersionCode
);
assert.equal(androidOwnerEvidence.sourceRelease.tagName, canonicalAndroidTag);
assert.equal(
  androidOwnerEvidence.sourceRelease.reference,
  `https://github.com/Chessticize/chessticize-mobile/releases/tag/${canonicalAndroidTag}`
);
assert.equal(
  androidOwnerEvidence.sourceRelease.sourceManifest.tagName,
  canonicalAndroidTag
);
assert.equal(
  androidOwnerEvidence.sourceRelease.sourceManifest.reference,
  `https://github.com/Chessticize/chessticize-mobile/releases/download/` +
    `${canonicalAndroidTag}/android-source-manifest.json`
);

const assertAndroidCandidateBindings = (value) => {
  if (!value || typeof value !== "object") {
    return;
  }
  if (value.candidate) {
    assert.equal(value.candidate.versionName, releaseVersion.publicVersion);
    assert.equal(
      value.candidate.versionCode,
      releaseVersion.androidVersionCode
    );
  }
  for (const nested of Object.values(value)) {
    assertAndroidCandidateBindings(nested);
  }
};
assertAndroidCandidateBindings(androidOwnerEvidence);

const syntaxCheck = spawnSync("bash", ["-n", localE2eRunner], { encoding: "utf8" });
assert.equal(syntaxCheck.status, 0, syntaxCheck.stderr);
const uiCalibrationSyntaxCheck = spawnSync("bash", ["-n", uiCalibrationRunner], { encoding: "utf8" });
assert.equal(uiCalibrationSyntaxCheck.status, 0, uiCalibrationSyntaxCheck.stderr);

const invalidScope = spawnSync(localE2eRunner, [], {
  encoding: "utf8",
  env: { ...process.env, CHESSTICIZE_E2E_SCOPE: "invalid" }
});
assert.notEqual(invalidScope.status, 0);
assert.match(invalidScope.stderr, /Set CHESSTICIZE_E2E_SCOPE to flows, practice, or full/);

console.log("Development process validation passed.");
