import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const [mode, source] = process.argv.slice(2);
const output = "apps/mobile-lab/storybook-static";
const manifestName = "codex-build.json";
const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
function needsBuild(base) {
  if (!base) return true;
  try { git("merge-base", "--is-ancestor", base, "HEAD"); } catch { return true; }
  const files = execFileSync("git", ["diff", "--no-renames", "--name-only", "-z", base, "HEAD"], { encoding: "utf8" }).split("\0").filter(Boolean);
  // Only proven non-input paths can skip. New/unknown build inputs fail closed.
  return files.some(file => {
    if (file.startsWith("apps/mobile-lab/") || file.startsWith("packages/") ||
        file.startsWith("apps/mobile/src/") || file.startsWith("scripts/storybook-ci") ||
        file === ".github/workflows/mobile-lab.yml") return true;
    return !(/^(docs\/|site\/|\.codex\/|\.github\/)/.test(file) ||
      /^(AGENTS|README|CONTRIBUTING)\.md$/.test(file) ||
      /^(scripts\/(?:lib\/)?guidance-links(?:\.test)?\.mjs|scripts\/validate-development-process\.mjs)$/.test(file) ||
      /^(apps\/cli\/|apps\/mobile\/(?:__tests__|e2e|artifacts)\/)/.test(file));
  });
}
function inventory(dir = output, prefix = "") {
  return Object.fromEntries(readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const relative = prefix + entry.name;
    if (!prefix && entry.name === manifestName) return [];
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return Object.entries(inventory(file, relative + "/"));
    assert.ok(entry.isFile(), `Unsupported artifact entry: ${relative}`);
    return [[relative, createHash("sha256").update(readFileSync(file)).digest("hex")]];
  }));
}
function verify(sha) {
  assert.match(sha ?? "", /^[0-9a-f]{40}$/);
  const manifest = JSON.parse(readFileSync(path.join(output, manifestName), "utf8"));
  assert.equal(manifest.sourceSha, sha);
  assert.equal(manifest.version, 1);
  assert.deepEqual(inventory(), manifest.files);
  assert.ok(manifest.files["index.html"], "Missing Storybook manager");
  console.log(`Verified Storybook bytes for ${sha}`);
}
switch (mode) {
  case "scope": console.log(needsBuild(source)); break;
  case "seal": {
    assert.match(source ?? "", /^[0-9a-f]{40}$/);
    assert.equal(git("rev-parse", "HEAD"), source);
    const files = inventory();
    assert.ok(files["index.html"], "Missing Storybook manager");
    writeFileSync(path.join(output, manifestName), JSON.stringify({ version: 1, sourceSha: source, files }, null, 2) + "\n");
    break;
  }
  case "verify": verify(source); break;
  case "vercel-build":
    if (process.env.STORYBOOK_PREBUILT === "1") verify(process.env.GITHUB_SHA);
    else execFileSync("pnpm", ["mobile:lab:validate"], { stdio: "inherit" });
    break;
  default: throw new Error("Usage: storybook-ci.mjs scope [base] | seal <sha> | verify <sha> | vercel-build");
}
