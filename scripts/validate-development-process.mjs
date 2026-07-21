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
const mobileLabWorkflow = read(".github/workflows/mobile-lab.yml");
const processWorkflow = read(".github/workflows/process.yml");
const agents = read("AGENTS.md");
const rootReadme = read("README.md");
const labReadme = read("apps/mobile-lab/README.md");
const testingArchitecture = read("docs/TESTING_ARCHITECTURE.md");
const agentDocPaths = [
  "docs/agents/domain.md",
  "docs/agents/issue-tracker.md",
  "docs/agents/triage-labels.md",
  "docs/agents/ui-flow-design.md",
  "docs/agents/issue-triage.md"
];
const domainDocs = read(agentDocPaths[0]);
const issueTracker = read(agentDocPaths[1]);
const triageLabels = read(agentDocPaths[2]);
const uiFlowDesign = read(agentDocPaths[3]);
const issueTriage = read(agentDocPaths[4]);
const devLoopSkill = read(".codex/skills/chessticize-mobile-dev-loop/SKILL.md");
const issueTriageSkill = read(".codex/skills/chessticize-issue-triage/SKILL.md");
const scenarioRegistry = read("apps/mobile-lab/src/scenarioRegistry.ts");
const markerCheck = read("apps/mobile-lab/scripts/check-new-scenarios.ts");
const markerPolicy = read("apps/mobile-lab/src/scenarioMarkerPolicy.ts");
const markerManifest = JSON.parse(read("apps/mobile-lab/src/newScenarioMarkers.json"));
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
const releaseNotes = read("docs/RELEASE_NOTES.md");
const releaseNotesTemplate = read("docs/releases/RELEASE_NOTES_TEMPLATE.md");
const releaseSourcePolicy = read("docs/RELEASE_SOURCE_POLICY.md");
const appStoreUpload = read("docs/APP_STORE_UPLOAD.md");
const androidPlayRelease = read("docs/ANDROID_PLAY_RELEASE.md");
const androidGitHubRelease = read("docs/ANDROID_GITHUB_RELEASE.md");
const releaseDocs = [
  read("docs/TESTFLIGHT_QA.md"),
  appStoreUpload,
  releaseSourcePolicy
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
assert.match(issueTracker, /docs\/agents\/issue-triage\.md/);

for (const requiredLabel of [
  "needs-triage",
  "needs-info",
  "ready-for-agent",
  "ready-for-human",
  "wontfix",
  "bug",
  "enhancement",
  "documentation",
  "user-feedback",
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
assert.equal(count(processWorkflow, '- "docs/RELEASE_NOTES.md"'), 2);
assert.equal(count(processWorkflow, '- "docs/releases/**"'), 2);

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
assert.match(uiFlowDesign, /full Storybook/i);
assert.match(uiFlowDesign, /linked GitHub issue is closed/i);
assert.match(uiFlowDesign, /Do not commit generated\s+Storybook bundles/i);
assert.match(uiFlowDesign, /modify that existing\s+story incrementally/i);
assert.match(uiFlowDesign, /post-implementation product/i);
assert.match(devLoopSkill, /existing product-clone story/i);
assert.match(labReadme, /Do not add a parallel standalone page/i);
assert.match(prTemplate, /Storybook-first design approved before product wiring/);
assert.match(prTemplate, /Storybook-only design increment/);
assert.match(prTemplate, /Full Storybook manager URL:/);
assert.match(prTemplate, /Removed after the linked issue was closed/);
assert.match(prTemplate, /Design approval record:/);
assert.match(agents, /Storybook-only PR[\s\S]*may merge while the linked product issue remains open/);

for (const triagePolicy of [agents, issueTriageSkill]) {
  assert.match(triagePolicy, /docs\/agents\/issue-triage\.md/);
  assert.match(triagePolicy, /Storybook/);
  assert.match(triagePolicy, /product implementation/i);
}

for (const priority of ["P0", "P1", "P2", "P3"]) {
  assert.match(issueTriage, new RegExp(priority));
}

for (const triageContract of [issueTriage, issueTriageSkill]) {
  assert.match(triageContract, /high uncertainty/i);
  assert.match(triageContract, /full Storybook/i);
  assert.match(triageContract, /issueNumber/);
  assert.match(triageContract, /explicit\s+(design\s+)?approval/i);
  assert.match(triageContract, /merge to `main`/i);
  assert.match(triageContract, /issue\s+(?:is|as)\s+closed/i);
}

assert.match(issueTriage, /0\.5–2 engineering days/);
assert.match(issueTriage, /3–5 engineering days/);
assert.match(issueTriage, /1–2 engineering weeks/);
assert.match(issueTriage, /2–4\+ engineering weeks/);
assert.match(issueTriage, /do not invent or apply them/i);
assert.match(issueTriage, /Each feedback issue owns its own Storybook design track/i);
assert.match(issueTriage, /Decide implementation grouping separately/i);
assert.match(issueTriage, /every UI or functional-feature issue/);
assert.match(issueTriage, /native-only behavior/);
assert.match(issueTriageSkill, /one\s+Storybook design track.*per\s+issue/is);
assert.match(issueTriageSkill, /Decide later implementation grouping separately/i);
assert.match(issueTriageSkill, /every UI or functional-feature issue/);
assert.match(issueTriageSkill, /do not invent priority\s+labels/i);
assert.match(issueTriageSkill, /codex\/storybook-issue-<number>-<goal>/);
assert.match(issueTriageSkill, /owner-only deployment/i);
assert.match(issueTriage, /Every Sites deployment URL is production/);
for (const lifecycleContract of [issueTriage, issueTriageSkill, uiFlowDesign, processWorkflow]) {
  assert.doesNotMatch(lifecycleContract, /sites\/storybook-previews|preview-manifest/);
}

assert.match(scenarioRegistry, /newScenarioMarkerData/);
assert.match(markerPolicy, /Number\.isInteger\(issueNumber\)/);
assert.match(markerCheck, /verifyRemovedMarkerIssuesAreClosed/);
assert.match(markerPolicy, /issueStates\.get\(issueNumber\) !== "closed"/);
assert.match(markerPolicy, /createGitHubIssueStateReader/);
assert.doesNotMatch(markerCheck, /ALLOW_NEW_SCENARIOS/);
assert.match(mobileLabWorkflow, /Validate issue-owned New Scenario Markers/);
assert.match(mobileLabWorkflow, /issues: read/);
assert.match(mobileLabWorkflow, /BASE_REF:/);
assert.doesNotMatch(mobileLabWorkflow, /ALLOW_NEW_SCENARIOS|Reject stale New Scenario Markers/);
assert.equal(typeof markerManifest, "object");
assert.equal(Array.isArray(markerManifest), false);

for (const reviewPolicy of [agents, devLoopSkill]) {
  assert.match(reviewPolicy, /prefer incremental\s+review/i);
  assert.match(reviewPolicy, /Reviewed-Through/);
  assert.match(reviewPolicy, /40-character commit SHA/i);
  assert.match(reviewPolicy, /ancestor of the\s+current head/i);
  assert.match(reviewPolicy, /PR merge base/i);
  assert.match(reviewPolicy, /git range-diff/);
  assert.match(reviewPolicy, /semantic (impact|blast radius)/i);
  assert.match(reviewPolicy, /exact[- ]head/i);
}

assert.match(prTemplate, /Incremental review/);
assert.match(prTemplate, /Full review/);
assert.match(prTemplate, /Review-Baseline: <40-character commit SHA>/);
assert.match(prTemplate, /Reviewed-Through: <40-character commit SHA>/);
assert.match(prTemplate, /Review-Result: pending\|findings\|pass/);
assert.match(prTemplate, /PR merge base/);
assert.match(prTemplate, /full-review trigger/i);

for (const releaseContract of [
  "docs/RELEASE_SOURCE_POLICY.md",
  "docs/RELEASE_NOTES.md",
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

assert.match(rootReadme, /\[Release Notes\]\(docs\/RELEASE_NOTES\.md\)/);
for (const releaseProcessDoc of [
  releaseSourcePolicy,
  appStoreUpload,
  androidPlayRelease,
  androidGitHubRelease
]) {
  assert.match(releaseProcessDoc, /docs\/RELEASE_NOTES\.md/);
}
assert.match(releaseNotes, /docs\/releases\/ios-v<version>-build-<build>\.md/);
assert.match(releaseNotes, /docs\/releases\/android-v<version>-build-<version-code>\.md/);
assert.match(releaseNotes, /before its source tag is created/);
assert.match(releaseNotes, /up to 4,000 characters/);
assert.match(releaseNotes, /up to 500 Unicode characters per language/);
assert.match(releaseNotes, /at or below 300\s+Unicode characters/);
assert.match(releaseNotes, /two\s+or three short bullets/);
assert.match(releaseNotes, /Details and source:/);
assert.match(releaseNotes, /https:\/\/github\.com\/Chessticize\/chessticize-mobile/);
assert.match(releaseNotesTemplate, /- Status: Draft/);
assert.match(releaseNotesTemplate, /## Store copy \(`en-US`\)/);
assert.match(releaseNotesTemplate, /## GitHub customer summary/);
assert.match(releaseNotesTemplate, /## Release-note review/);
assert.match(releaseNotesTemplate, /at most 300 Unicode\s+characters/);
assert.match(releaseNotesTemplate, /releases\/tag\/<ios\|android>/);
assert.match(releaseNotesTemplate, /release owner approved the copy before the source tag was created/i);

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
