import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

const rootPackage = JSON.parse(read("package.json"));
const pnpmWorkspace = read("pnpm-workspace.yaml");
const coreWorkflow = read(".github/workflows/core.yml");
const mobileWorkflow = read(".github/workflows/mobile-js.yml");
const mobileLabWorkflow = read(".github/workflows/mobile-lab.yml");
const pagesWorkflow = read(".github/workflows/pages.yml");
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
const simulatorOrientationRunner = path.join(
  repoRoot,
  ".codex/skills/chessticize-mobile-ui-calibration/scripts/set-simulator-orientation.sh"
);
const simulatorTargetResolver = path.join(
  repoRoot,
  "apps/mobile/scripts/resolve-ios-simulator-target.js"
);
const pngOrientationValidator = path.join(
  repoRoot,
  "apps/mobile/scripts/assert-png-orientation.js"
);
const prTemplate = read(".github/pull_request_template.md");
const releaseNotes = read("docs/RELEASE_NOTES.md");
const releaseVersioning = read("docs/RELEASE_VERSIONING.md");
const releaseNotesTemplate = read("docs/releases/RELEASE_NOTES_TEMPLATE.md");
const releaseSourcePolicy = read("docs/RELEASE_SOURCE_POLICY.md");
const androidValidation = read("docs/ANDROID_VALIDATION.md");
const appStoreUpload = read("docs/APP_STORE_UPLOAD.md");
const landingPageDoc = read("docs/LANDING_PAGE.md");
const storybookDeployment = read("docs/STORYBOOK_DEPLOYMENT.md");
const vercelConfig = JSON.parse(read("vercel.json"));
const gitignore = read(".gitignore");
const landingPage = read("site/index.html");
const landingPageAndroid = read("site/android/index.template.html");
const landingPageSupport = read("site/support/index.html");
const landingPageStyles = read("site/styles.css");
const landingPageTest = read("apps/mobile/__tests__/landingPage.test.js");
const landingPageAssetGenerator = read("scripts/prepare-landing-page-assets.mjs");
const androidDownloadPageRenderer = read("scripts/render-android-download-page.mjs");
const androidDownloadPageModule = read("scripts/lib/android-download-page.mjs");
const landingPageAssetManifest = JSON.parse(
  read("site/assets/marketing-assets.json")
);
const androidPlayRelease = read("docs/ANDROID_PLAY_RELEASE.md");
const androidGitHubRelease = read("docs/ANDROID_GITHUB_RELEASE.md");
const releaseDocs = [
  read("docs/TESTFLIGHT_QA.md"),
  appStoreUpload,
  releaseSourcePolicy
];

const releaseVersion = JSON.parse(read("apps/mobile/release-version.json"));
const developmentVersion = JSON.parse(read("apps/mobile/development-version.json"));
const androidPlayRunbook = read("docs/ANDROID_PLAY_RELEASE.md");
const androidReleasePlan = read("apps/mobile/docs/ANDROID_RELEASE_PLAN.md");
const androidOwnerEvidence = JSON.parse(
  read("docs/android-play-owner-evidence.example.json")
);
const canonicalAndroidTag = canonicalAndroidSourceTag(
  releaseVersion.publicVersion,
  releaseVersion.androidVersionCode
);
const workflowDirectory = path.join(repoRoot, ".github/workflows");
const workflowFiles = readdirSync(workflowDirectory)
  .filter((fileName) => fileName.endsWith(".yml"))
  .sort();
const workflowSources = workflowFiles.map((fileName) =>
  read(`.github/workflows/${fileName}`)
);

assert.deepEqual(workflowFiles, [
  "core.yml",
  "mobile-android-github-release.yml",
  "mobile-android-release-candidate.yml",
  "mobile-android-source-recovery.yml",
  "mobile-js.yml",
  "mobile-lab.yml",
  "pages.yml",
  "process.yml"
]);
assert.equal(rootPackage.packageManager, "pnpm@11.20.0");
assert.equal(count(workflowSources.join("\n"), "version: 11.20.0"), 6);
assert.doesNotMatch(workflowSources.join("\n"), /version: 11\.1\.2/);
assert.match(pnpmWorkspace, /^minimumReleaseAge: 10080$/m);
assert.match(pnpmWorkspace, /^minimumReleaseAgeStrict: true$/m);
assert.match(pnpmWorkspace, /^minimumReleaseAgeIgnoreMissingTime: false$/m);
assert.match(
  pnpmWorkspace,
  /^# remain subject to the seven-day maturation period\.$/m
);
assert.doesNotMatch(pnpmWorkspace, /^\s+- ["']?@vercel\/\*["']?$/m);
assert.match(pnpmWorkspace, /^trustPolicy: no-downgrade$/m);
assert.match(pnpmWorkspace, /^trustPolicyIgnoreAfter: 525600$/m);
assert.match(pnpmWorkspace, /^trustPolicyExclude:\n  - "ua-parser-js@1\.0\.41"$/m);
assert.match(pnpmWorkspace, /^trustLockfile: false$/m);
assert.match(pnpmWorkspace, /^blockExoticSubdeps: true$/m);
assert.match(pnpmWorkspace, /^  detox@20\.51\.4: true$/m);
assert.match(pnpmWorkspace, /^  dtrace-provider@0\.8\.8: true$/m);
assert.match(pnpmWorkspace, /^  "esbuild@0\.27\.0 \|\| 0\.28\.1": true$/m);
assert.doesNotMatch(
  pnpmWorkspace,
  /^  (?:detox|dtrace-provider|esbuild|unrs-resolver): true$/m
);
assert.equal(
  existsSync(path.join(workflowDirectory, "mobile-android.yml")),
  false
);
assert.equal(
  existsSync(path.join(workflowDirectory, "mobile-android-test-only-rerun.yml")),
  false
);
assert.match(releaseSourcePolicy, /release workflow is local-first/i);
assert.match(releaseSourcePolicy, /does not run Android\s+emulators/i);
assert.match(
  testingArchitecture,
  /Android emulator and test-only rerun workflows are intentionally absent/
);

assert.equal(count(coreWorkflow, "run: pnpm test:unit"), 1);
assert.equal(count(coreWorkflow, "run: pnpm test:integration"), 1);
assert.equal(count(coreWorkflow, "run: pnpm test:e2e"), 1);
assert.equal(count(coreWorkflow, "run: pnpm test\n"), 0);
assert.equal(count(coreWorkflow, "pnpm mobile:test"), 0);
assert.equal(count(coreWorkflow, "pnpm mobile:typecheck"), 0);

assert.match(mobileWorkflow, /pull_request:/);
assert.match(mobileWorkflow, /name: Mobile JS checks/);
assert.match(mobileWorkflow, /runs-on: ubuntu-latest/);
assert.equal(count(mobileWorkflow, "workflow_dispatch:"), 0);
assert.equal(count(mobileWorkflow, "schedule:"), 0);
assert.equal(count(mobileWorkflow, "runs-on: macos-"), 0);
assert.equal(count(mobileWorkflow, "xcodebuild"), 0);
assert.equal(count(mobileWorkflow, "run: pnpm mobile:e2e:build:ios"), 0);
assert.equal(count(mobileWorkflow, "DETOX_ACTIVE_SUITE: flows"), 0);
assert.equal(count(mobileWorkflow, "DETOX_ACTIVE_SUITE: practice"), 0);
assert.equal(count(mobileWorkflow, "matrix:"), 0);

for (const policy of [agents, testingArchitecture, devLoopSkill, localE2eSkill]) {
  assert.match(policy, /No mobile Detox/);
  assert.match(policy, /Targeted native validation/);
  assert.match(policy, /Full native validation/);
  assert.match(
    policy,
    /local (?:iOS )?native\s+validation|native validation on both platforms is local/i
  );
  assert.match(
    policy,
    /only for (?:releases|release candidates) and native-impacting\s+changes|only for a release candidate or a change to native/i
  );
  assert.match(policy, /App source SHA/i);
  assert.match(policy, /test-runner SHA/i);
  assert.match(policy, /App-input digest/i);
}

assert.doesNotMatch(agents, /Any required Detox evidence must come from the exact PR head/);
assert.doesNotMatch(testingArchitecture, /source-tree change invalidates that evidence/);
assert.doesNotMatch(devLoopSkill, /Any later source-tree change invalidates native evidence/);
assert.doesNotMatch(localE2eSkill, /same Git tree/);

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
assert.equal(count(processWorkflow, '- "docs/RELEASE_VERSIONING.md"'), 2);
assert.equal(count(processWorkflow, '- "docs/releases/**"'), 2);
assert.equal(count(processWorkflow, '- "docs/LANDING_PAGE.md"'), 2);
assert.equal(count(processWorkflow, '- "docs/STORYBOOK_DEPLOYMENT.md"'), 2);
assert.equal(count(processWorkflow, '- "vercel.json"'), 2);
assert.equal(count(processWorkflow, '- "site/**"'), 2);
assert.equal(
  count(processWorkflow, '- "apps/mobile/__tests__/landingPage.test.js"'),
  2
);
assert.equal(
  count(processWorkflow, '- "scripts/prepare-landing-page-assets.mjs"'),
  2
);
for (const versioningPath of [
  "apps/mobile/development-version.json",
  "apps/mobile/release-version.json",
  "apps/mobile/ios/Config/DevelopmentVersion.xcconfig",
  "apps/mobile/ios/Config/ReleaseVersion.xcconfig",
  "scripts/lib/mobile-versioning.mjs",
  "scripts/mobile-version.mjs",
  "scripts/mobile-versioning.test.mjs",
]) {
  assert.equal(count(processWorkflow, `- "${versioningPath}"`), 2);
}

for (const action of [
  "actions/checkout@v6",
  "actions/configure-pages@v5",
  "actions/upload-pages-artifact@v4",
  "actions/deploy-pages@v4"
]) {
  assert.match(pagesWorkflow, new RegExp(action.replace("/", "\\/")));
}
assert.match(pagesWorkflow, /run: node scripts\/validate-development-process\.mjs/);
assert.match(pagesWorkflow, /workflow_run:/);
assert.match(pagesWorkflow, /Publish Play-generated Android APK/);
assert.match(pagesWorkflow, /render-android-download-page\.mjs/);
assert.match(pagesWorkflow, /ref: main/);
assert.match(pagesWorkflow, /workflow_run\.conclusion == 'success'/);
assert.match(pagesWorkflow, /cp -R site "\$RUNNER_TEMP\/pages-site"/);
assert.match(pagesWorkflow, /path: \$\{\{ runner\.temp \}\}\/pages-site/);
assert.match(pagesWorkflow, /pages: write/);
assert.match(pagesWorkflow, /id-token: write/);
assert.match(pagesWorkflow, /name: github-pages/);

const publicLandingCopy = [
  landingPage,
  landingPageAndroid,
  landingPageSupport,
  rootReadme
].join("\n");
assert.match(landingPage, /chess puzzle trainer/i);
assert.match(landingPage, /rating-matched puzzle Sprints/);
assert.match(landingPage, /Custom Runs/);
assert.match(landingPage, /scheduled Review/);
assert.doesNotMatch(publicLandingCopy, /Tactical Profile/i);
assert.doesNotMatch(publicLandingCopy, /\badaptive practice\b/i);
assert.doesNotMatch(publicLandingCopy, /\bweakness(?:es)?\b/i);
assert.doesNotMatch(publicLandingCopy, /<script\b/i);
assert.doesNotMatch(
  publicLandingCopy,
  /google-analytics|googletagmanager|segment\.com|mixpanel|plausible|fathom/i
);
assert.doesNotMatch(landingPageStyles, /@import|url\(\s*["']?https?:\/\//i);
assert.match(rootReadme, /https:\/\/apps\.apple\.com\/us\/app\/chessticize\/id6788610123/);
assert.match(
  landingPage,
  /https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.chessticize\.mobile/
);
assert.match(
  landingPageAndroid,
  /https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.chessticize\.mobile/
);
assert.match(landingPage, /assets\/download-on-the-app-store\.svg/);
assert.match(landingPage, /assets\/get-it-on-google-play\.png/);
assert.match(landingPageAndroid, /assets\/get-it-on-google-play\.png/);
assert.match(rootReadme, /https:\/\/chessticize\.github\.io\/chessticize-mobile\/android\//);
assert.match(rootReadme, /site\/assets\/screenshots\/contact-sheet\.webp/);
assert.match(rootReadme, /docs\/STORYBOOK_DEPLOYMENT\.md/);
assert.match(landingPageDoc, /pnpm landing-page:assets/);
assert.match(landingPageDoc, /workflow_run/);
assert.match(landingPageDoc, /highest-versionCode public/);
assert.match(androidDownloadPageRenderer, /parseAndroidSourceManifest/);
assert.match(androidDownloadPageRenderer, /parseAndroidApkChecksum/);
assert.match(androidDownloadPageRenderer, /AbortSignal\.timeout\(30_000\)/);
assert.match(androidDownloadPageModule, /assets\.length !== 3/);
assert.match(androidDownloadPageModule, /com\.chessticize\.mobile/);
assert.match(landingPageAssetGenerator, /--source-root/);
assert.equal(landingPageAssetManifest.schemaVersion, 1);
assert.equal(landingPageAssetManifest.assets.length, 11);
assert.match(landingPageTest, /ships optimized, reproducible marketing images/);

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
assert.match(uiFlowDesign, /Reset `newScenarioMarkers\.json`/i);
assert.match(uiFlowDesign, /without\s+launching a local Storybook server/i);
assert.match(uiFlowDesign, /Do not commit generated\s+Storybook bundles/i);
assert.match(uiFlowDesign, /modify that existing\s+story incrementally/i);
assert.match(uiFlowDesign, /post-implementation product/i);
assert.match(devLoopSkill, /existing product-clone story/i);
assert.match(labReadme, /Do not add a parallel standalone page/i);
assert.match(prTemplate, /Storybook-first design approved before product wiring/);
assert.match(prTemplate, /Storybook-only design increment/);
assert.match(prTemplate, /Stable branch Storybook manager URL:/);
assert.match(prTemplate, /Reset every previous design marker/);
assert.match(prTemplate, /not a local Storybook server/);
assert.match(prTemplate, /Design approval record:/);
assert.match(agents, /Storybook-only PR[\s\S]*may merge while the linked product issue remains open/);

for (const triagePolicy of [agents, issueTriageSkill]) {
  assert.match(triagePolicy, /docs\/agents\/issue-triage\.md/);
  assert.match(triagePolicy, /Storybook/);
  assert.match(triagePolicy, /product implementation/i);
}

for (const triagePolicy of [agents, issueTracker, issueTriage, issueTriageSkill]) {
  assert.match(triagePolicy, /docs\/agents\/ui-flow-design\.md/);
  assert.match(triagePolicy, /relationship suggestions are advisory/i);
  assert.match(triagePolicy, /do not consolidate/i);
  assert.match(triagePolicy, /explicit human\s+approval/i);
}

for (const uiTriagePolicy of [issueTriage, issueTriageSkill]) {
  assert.match(uiTriagePolicy, /existing product-clone/i);
}

assert.doesNotMatch(issueTriage, /possible implementation groupings/i);
assert.doesNotMatch(issueTriageSkill, /possible implementation groupings/i);
assert.doesNotMatch(issueTriage, /Decide implementation grouping separately/i);
assert.doesNotMatch(issueTriageSkill, /Decide later implementation grouping separately/i);

for (const priority of ["P0", "P1", "P2", "P3"]) {
  assert.match(issueTriage, new RegExp(priority));
}

for (const triageContract of [issueTriage, issueTriageSkill]) {
  assert.match(triageContract, /high uncertainty/i);
  assert.match(triageContract, /full Storybook/i);
  assert.match(triageContract, /issueNumber/);
  assert.match(triageContract, /explicit\s+(design\s+)?approval/i);
  assert.match(triageContract, /merge to `main`/i);
  assert.match(triageContract, /reset[\s\S]*marker/i);
}

assert.match(issueTriage, /0\.5–2 engineering days/);
assert.match(issueTriage, /3–5 engineering days/);
assert.match(issueTriage, /1–2 engineering weeks/);
assert.match(issueTriage, /2–4\+ engineering weeks/);
assert.match(issueTriage, /do not invent or apply them/i);
assert.match(issueTriage, /Each feedback issue owns its own Storybook design track/i);
assert.match(issueTriage, /every UI or functional-feature issue/);
assert.match(issueTriage, /native-only behavior/);
assert.match(issueTriageSkill, /one\s+Storybook design track.*per\s+issue/is);
assert.match(issueTriageSkill, /every UI or functional-feature issue/);
assert.match(issueTriageSkill, /do not invent priority\s+labels/i);
assert.match(issueTriageSkill, /codex\/storybook-issue-<number>-<goal>/);
for (const publicStorybookPolicy of [
  agents,
  labReadme,
  uiFlowDesign,
  issueTriage,
  issueTriageSkill,
  devLoopSkill,
  prTemplate,
  storybookDeployment
]) {
  assert.match(
    publicStorybookPolicy,
    /public\s+and\s+must\s+not\s+require\s+authentication/i
  );
}
assert.doesNotMatch(issueTriageSkill, /owner-only deployment/i);
assert.match(issueTriage, /Vercel Preview is a review artifact/);
for (const lifecycleContract of [issueTriage, issueTriageSkill, uiFlowDesign, processWorkflow]) {
  assert.doesNotMatch(lifecycleContract, /sites\/storybook-previews|preview-manifest/);
}

assert.match(mobileLabWorkflow, /branches: \["\*\*"\]/);
assert.match(mobileLabWorkflow, /Deploy branch Storybook to Vercel/);
assert.match(mobileLabWorkflow, /github\.event\.deleted == false/);
assert.match(mobileLabWorkflow, /needs: validate/);
const mobileLabDeployHeader = mobileLabWorkflow.match(
  /\n  deploy:\n[\s\S]*?\n    steps:\n/
)?.[0];
assert.ok(mobileLabDeployHeader);
assert.doesNotMatch(mobileLabDeployHeader, /secrets\./);
assert.equal(
  count(mobileLabWorkflow, "VERCEL_TOKEN: ${{ secrets.VERCEL_TEAM_TOKEN }}"),
  3
);
assert.equal(
  count(mobileLabWorkflow, "VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}"),
  3
);
assert.equal(
  count(mobileLabWorkflow, "VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}"),
  3
);
const mobileLabBuildStep = mobileLabWorkflow.match(
  /      - name: Build the validated Storybook deployment\n[\s\S]*?\n      - name: Deploy the exact branch commit/
)?.[0];
assert.ok(mobileLabBuildStep);
assert.doesNotMatch(mobileLabBuildStep, /secrets\.|VERCEL_TOKEN|--token/);
assert.equal(rootPackage.devDependencies?.vercel, "58.4.4");
assert.equal(count(mobileLabWorkflow, "run: pnpm install --frozen-lockfile"), 2);
assert.doesNotMatch(mobileLabWorkflow, /npm install --global/);
assert.doesNotMatch(mobileLabWorkflow, /pnpm dlx\s+vercel/);
assert.equal(count(mobileLabWorkflow, "pnpm exec vercel"), 6);
assert.match(mobileLabWorkflow, /pnpm exec vercel pull/);
assert.match(mobileLabWorkflow, /pnpm exec vercel build/);
assert.match(mobileLabWorkflow, /pnpm exec vercel deploy/);
assert.match(mobileLabWorkflow, /--git-branch="\$GITHUB_REF_NAME"/);
assert.match(mobileLabWorkflow, /--prebuilt/);
assert.match(mobileLabWorkflow, /--meta=githubDeployment=1/);
assert.match(mobileLabWorkflow, /--meta=githubCommitRef="\$GITHUB_REF_NAME"/);
assert.match(mobileLabWorkflow, /deploy_args\+=\(--prod\)/);
assert.match(mobileLabWorkflow, /createHash\("sha256"\)/);
assert.match(mobileLabWorkflow, /const slug = `\$\{readable\}-\$\{digest\}`/);
assert.match(mobileLabWorkflow, /chessticize-mobile-storybook-\$\{slug\}\.vercel\.app/);
assert.match(
  mobileLabWorkflow,
  /pnpm exec vercel alias set "\$deployment_url" "\$branch_alias" --token="\$VERCEL_TOKEN"/
);
assert.doesNotMatch(mobileLabWorkflow, /deployment\.aliases\?\.find/);
assert.ok(
  mobileLabWorkflow.includes('manager_url="https://storybook.chessticize.com/"')
);
assert.match(mobileLabWorkflow, /immutable_url/);
assert.match(mobileLabWorkflow, /Unauthenticated Storybook request returned HTTP/);
assert.match(mobileLabWorkflow, /verify_public_url "\$IMMUTABLE_URL"/);
assert.match(mobileLabWorkflow, /verify_public_url "\$STORYBOOK_URL"/);
assert.match(mobileLabWorkflow, /verify_public_url "\$\{IMMUTABLE_URL\}storybook\/"/);
assert.match(mobileLabWorkflow, /verify_public_url "\$\{STORYBOOK_URL\}storybook\/"/);
assert.doesNotMatch(storybookDeployment, /pnpm dlx\s+vercel/);
assert.match(storybookDeployment, /pnpm exec vercel login/);
assert.match(storybookDeployment, /pnpm exec vercel link/);
assert.equal(vercelConfig.buildCommand, "pnpm mobile:lab:validate");
assert.equal(vercelConfig.installCommand, "pnpm install --frozen-lockfile");
assert.equal(vercelConfig.outputDirectory, "apps/mobile-lab/storybook-static");
assert.equal(vercelConfig.git.deploymentEnabled, false);
assert.equal(vercelConfig.redirects, undefined);
assert.deepEqual(vercelConfig.rewrites, [
  {
    source: "/",
    destination: "/index.html"
  },
  {
    source: "/storybook",
    destination: "/index.html"
  },
  {
    source: "/storybook/",
    destination: "/index.html"
  },
  {
    source: "/storybook/:path*",
    destination: "/:path*"
  }
]);
assert.match(gitignore, /^\.vercel\/$/m);
assert.match(storybookDeployment, /`main` owns the long-lived Production deployment/);
assert.match(storybookDeployment, /stable branch URL/);
assert.match(storybookDeployment, /untrusted fork pull\s+requests never receive Vercel credentials/i);
assert.match(storybookDeployment, /VERCEL_TEAM_TOKEN/);
assert.match(storybookDeployment, /VERCEL_ORG_ID/);
assert.match(storybookDeployment, /VERCEL_PROJECT_ID/);
assert.match(storybookDeployment, /lockfile integrity and build-script policy/);
assert.match(storybookDeployment, /HTTP 200/);

assert.match(scenarioRegistry, /newScenarioMarkerData/);
assert.match(markerPolicy, /Number\.isInteger\(issueNumber\)/);
assert.match(markerPolicy, /issues must be a non-empty array/);
assert.match(markerPolicy, /markerOwnerships/);
assert.match(markerCheck, /validateNewDesignMarkerReset/);
assert.match(markerPolicy, /introducedIssueNumbers/);
assert.match(markerPolicy, /reset prior issue/);
assert.doesNotMatch(markerCheck, /ALLOW_NEW_SCENARIOS/);
assert.match(mobileLabWorkflow, /Validate issue-owned New Scenario Markers/);
assert.doesNotMatch(mobileLabWorkflow, /issues: read/);
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

assert.match(androidReleaseSkill, /Google Play processes Android binaries/);
assert.match(androidReleaseSkill, /GitHub publishes corresponding\s+source/);
assert.match(androidReleaseSkill, /\*\*Delta:\*\*/);
assert.match(androidReleaseSkill, /\*\*Targeted:\*\*/);
assert.match(androidReleaseSkill, /\*\*Full:\*\*/);
assert.match(androidReleaseSkill, /built-in `github\.token`/);
assert.match(androidReleaseSkill, /Mirror APK/);
assert.match(androidReleaseSkill, /Play-signed universal APK/);
assert.match(androidReleaseSkill, /Android release is not complete/);
assert.match(androidReleaseSkill, /APK mirror pending/);
assert.match(androidReleaseSkill, /never\s+publish an upload-key or locally rebuilt APK/);
assert.match(androidReleaseSkill, /mobile-android-source-recovery\.yml/);
assert.match(androidReleaseSkill, /Physical-device execution is optional/);
assert.match(androidReleaseSkill, /never a recurring release gate/);
assert.match(androidReleaseSkill, /never move its\s+tag, rebuild it, or reuse its code/);
assert.match(androidReleaseSkill, /strict read-only audit/);
assert.match(androidReleaseSkill, /canonicalAndroidSourceTag/);
assert.match(androidReleaseSkill, /retained signed candidate/);
assert.match(androidReleaseSkill, /proposed replacement/);
assert.match(androidReleaseSkill, /Mark unobserved Console gates\s+UNKNOWN/);
assert.match(androidReleaseSkill, /published annotated canonical tag/);
assert.match(androidReleaseSkill, /Internal and Closed tracks/);
assert.match(androidReleaseSkill, /first\s+launch, the boundary changed, or Play reports a problem/);
assert.match(androidReleaseSkill, /Respect RC freeze generations/);
assert.match(androidReleaseSkill, /host-side test-runner defect/);
assert.match(androidReleaseSkill, /invalidate the generation before merging/);
assert.match(agents, /\.codex\/skills\/chessticize-android-release\/SKILL\.md/);
assert.match(androidPlayRelease, /successful APK-mirror workflow run/);
assert.match(androidPlayRelease, /exactly the required source manifest/);
assert.match(androidPlayRelease, /Release completion states/);
assert.match(androidGitHubRelease, /exactly three public assets/);
assert.match(releaseSourcePolicy, /release\s+status must remain `APK mirror pending`/);

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
assert.match(releaseNotes, /Do\s+not include a raw release URL/);
assert.match(releaseNotesTemplate, /- Status: Draft/);
assert.match(releaseNotesTemplate, /## Store copy \(`en-US`\)/);
assert.match(releaseNotesTemplate, /## Release details/);
assert.match(releaseNotesTemplate, /## GitHub customer summary/);
assert.match(releaseNotesTemplate, /## Release-note review/);
assert.match(releaseNotesTemplate, /at most 300 Unicode\s+characters/);
assert.match(releaseNotesTemplate, /contains no raw URL/);
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
assert.match(uiCalibrationRunnerSource, /CHESSTICIZE_STORE_ASSET_ORIENTATION=portrait/);
assert.match(uiCalibrationRunnerSource, /CHESSTICIZE_STORE_ASSET_ORIENTATION=landscape/);
assert.match(
  uiCalibrationRunnerSource,
  /DEVICE_NAME="\$\{DETOX_IOS_DEVICE:-iPad Pro 11-inch \(M5\)\}"/
);
assert.match(uiCalibrationRunnerSource, /\[\[ "\$DEVICE_NAME" == \*iPad\* \]\]/);
assert.match(uiCalibrationRunnerSource, /set-simulator-orientation\.sh/);
assert.match(uiCalibrationRunnerSource, /resolve-ios-simulator-target\.js/);
assert.match(uiCalibrationRunnerSource, /assert-png-orientation\.js/);
assert.match(uiCalibrationRunnerSource, /export DETOX_IOS_DEVICE_UDID="\$SIMULATOR_UDID"/);
assert.match(uiCalibrationRunnerSource, /IOConsoleLocked/);
assert.match(uiCalibrationRunnerSource, /CHESSTICIZE_UI_CALIBRATION_CAFFEINATED/);
assert.match(uiCalibrationRunnerSource, /exec \/usr\/bin\/caffeinate -dimsu "\$0" "\$@"/);
assert.match(uiCalibrationRunnerSource, /restart_exact_simulator/);
assert.match(
  uiCalibrationRunnerSource,
  /release-\$DEVICE_SLUG-\$RUNTIME_SLUG-\$UDID_SLUG/
);
assert.ok(
  uiCalibrationRunnerSource.indexOf("\nRESTORE_PORTRAIT=1\n")
    < uiCalibrationRunnerSource.indexOf(
      '"$ORIENTATION_RUNNER" "$SIMULATOR_UDID" "$DEVICE_NAME" landscape'
    )
);

const simulatorOrientationRunnerSource = read(
  ".codex/skills/chessticize-mobile-ui-calibration/scripts/set-simulator-orientation.sh"
);
assert.match(simulatorOrientationRunnerSource, /tell application "Simulator" to activate/);
assert.match(
  simulatorOrientationRunnerSource,
  /Expected exactly one open Simulator window starting with /
);
assert.match(simulatorOrientationRunnerSource, /set deviceSize to size of item 1 of matchingWindows/);
assert.doesNotMatch(simulatorOrientationRunnerSource, /simctl io .* screenshot/);
assert.match(simulatorOrientationRunnerSource, /Could not rotate the exact Simulator window/);

const localE2eRunnerSource = read(
  ".codex/skills/chessticize-mobile-local-e2e/scripts/run-local-e2e.sh"
);
assert.match(localE2eRunnerSource, /normalize_worktree_cocoapods_checksum/);
assert.match(localE2eRunnerSource, /hermes-engine: \[0-9a-f\]\{40\}/);
assert.match(localE2eRunnerSource, /git apply --reverse/);
assert.match(
  localE2eRunnerSource,
  /CHESSTICIZE_E2E_EXPECTED_VERSION_SOURCE="\$variant"/
);

for (const option of [
  "- [ ] No mobile Detox",
  "- [ ] Targeted `flows` spec or suite",
  "- [ ] Targeted `practice` spec or suite",
  "- [ ] Full `flows` and `practice`",
  "- [ ] Optional focused simulator screenshot only"
]) {
  assert.match(prTemplate, new RegExp(option.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.match(prTemplate, /only for releases and native-impacting changes/i);
assert.match(prTemplate, /App-input comparison/i);
assert.match(prTemplate, /test-runner-only change/i);
assert.match(prTemplate, /RC freeze \(release PRs and release-blocker PRs only\)/);
assert.match(prTemplate, /Evidence-only test-runner correction/);
assert.match(prTemplate, /prior RC was invalidated/);
assert.match(androidValidation, /During an active RC freeze/);
assert.match(androidValidation, /invalidates that RC\s+generation/);
assert.match(androidValidation, /rebuild only the affected artifacts and validation scope/);

for (const rcFreezePolicy of [
  agents,
  releaseSourcePolicy,
  devLoopSkill,
  androidReleaseSkill
]) {
  assert.match(rcFreezePolicy, /RC freeze|RC frozen|frozen RC/i);
  assert.match(rcFreezePolicy, /planned development/);
  assert.match(rcFreezePolicy, /test-runner defect|host-side spec/);
  assert.match(rcFreezePolicy, /invalidat(?:e|es)[\s\S]{0,80}generation/);
  assert.match(
    rcFreezePolicy,
    /next\s+(?:RC\s+)?generation|new frozen\s+generation/
  );
  assert.match(rcFreezePolicy, /exact-head\s+fast checks/);
}

for (const releaseDoc of releaseDocs) {
  assert.match(releaseDoc, /exact/);
  assert.match(releaseDoc, /delta/i);
  assert.match(releaseDoc, /physical/i);
}

assert.equal(releaseVersion.publicVersion, "1.5.1");
assert.equal(releaseVersion.androidVersionCode, 19);
assert.deepEqual(developmentVersion, {
  schemaVersion: 1,
  plannedPublicVersion: "1.5.1"
});
assert.match(releaseVersioning, /development-version\.json` is the public version/);
assert.match(releaseVersioning, /release-version\.json` is the exact cross-platform candidate/);
assert.match(releaseVersioning, /mobile:version:prepare-release/);
assert.match(releaseVersioning, /mobile:version:advance-development/);
assert.match(releaseVersioning, /mobile:version:set-development/);
assert.match(releaseVersioning, /1\.5\.0/);
assert.match(releaseVersioning, /2\.0\.0/);
assert.match(releaseVersioning, /Do not bump either file merely because a store changes/);
assert.match(agents, /docs\/RELEASE_VERSIONING\.md/);
assert.match(releaseSourcePolicy, /mobile:version:prepare-release/);
assert.match(releaseSourcePolicy, /mobile:version:advance-development/);
for (const command of [
  "mobile:version:status",
  "mobile:version:check",
  "mobile:version:prepare-release",
  "mobile:version:advance-development",
  "mobile:version:set-development"
]) {
  assert.equal(typeof rootPackage.scripts[command], "string");
}
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
const versionCheck = spawnSync(process.execPath, ["scripts/mobile-version.mjs", "check"], {
  cwd: repoRoot,
  encoding: "utf8"
});
assert.equal(versionCheck.status, 0, versionCheck.stderr);
const uiCalibrationSyntaxCheck = spawnSync("bash", ["-n", uiCalibrationRunner], { encoding: "utf8" });
assert.equal(uiCalibrationSyntaxCheck.status, 0, uiCalibrationSyntaxCheck.stderr);
const simulatorOrientationSyntaxCheck = spawnSync("bash", ["-n", simulatorOrientationRunner], {
  encoding: "utf8"
});
assert.equal(simulatorOrientationSyntaxCheck.status, 0, simulatorOrientationSyntaxCheck.stderr);
for (const scriptPath of [simulatorTargetResolver, pngOrientationValidator]) {
  const nodeSyntaxCheck = spawnSync(process.execPath, ["--check", scriptPath], { encoding: "utf8" });
  assert.equal(nodeSyntaxCheck.status, 0, nodeSyntaxCheck.stderr);
}

const invalidScope = spawnSync(localE2eRunner, [], {
  encoding: "utf8",
  env: { ...process.env, CHESSTICIZE_E2E_SCOPE: "invalid" }
});
assert.notEqual(invalidScope.status, 0);
assert.match(invalidScope.stderr, /Set CHESSTICIZE_E2E_SCOPE to flows, practice, or full/);

console.log("Development process validation passed.");
