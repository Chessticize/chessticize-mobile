import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: siteRoot,
  encoding: "utf8",
}).trim();
const manifest = JSON.parse(
  await readFile(path.join(siteRoot, "preview-manifest.json"), "utf8"),
);
const shouldBuild = process.argv.includes("--build");
const explicitSources = parseSources(process.argv.slice(2));
const worktrees = readWorktrees(repositoryRoot);
const previewsRoot = path.join(siteRoot, "public", "previews");

assert.ok(previewsRoot.startsWith(`${siteRoot}${path.sep}`));
await rm(previewsRoot, { force: true, recursive: true });
await mkdir(previewsRoot, { recursive: true });

for (const preview of manifest.previews) {
  const sourceRoot = resolveSource(preview, explicitSources, worktrees);
  const actualCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: sourceRoot,
    encoding: "utf8",
  }).trim();

  assert.equal(
    actualCommit,
    preview.commit,
    `${preview.id} must build from ${preview.commit}; found ${actualCommit}`,
  );

  if (shouldBuild) {
    execFileSync("pnpm", ["mobile:storybook:build"], {
      cwd: sourceRoot,
      stdio: "inherit",
    });
  }

  const storybookStatic = path.join(
    sourceRoot,
    "apps",
    "mobile-lab",
    "storybook-static",
  );
  const destination = path.join(previewsRoot, preview.id);
  await cp(storybookStatic, destination, { recursive: true });
  process.stdout.write(`Synced ${preview.id} from ${preview.commit.slice(0, 12)}\n`);
}

await writeFile(
  path.join(previewsRoot, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

function parseSources(args) {
  const sources = new Map();
  for (const argument of args) {
    if (!argument.startsWith("--source=")) continue;
    const assignment = argument.slice("--source=".length);
    const separator = assignment.indexOf("=");
    assert.ok(separator > 0, `Invalid source argument: ${argument}`);
    sources.set(
      assignment.slice(0, separator),
      path.resolve(assignment.slice(separator + 1)),
    );
  }
  return sources;
}

function readWorktrees(root) {
  const output = execFileSync("git", ["worktree", "list", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  });

  return output
    .trim()
    .split(/\n\n+/)
    .map((block) => {
      const fields = Object.fromEntries(
        block.split("\n").map((line) => {
          const separator = line.indexOf(" ");
          return separator === -1
            ? [line, true]
            : [line.slice(0, separator), line.slice(separator + 1)];
        }),
      );
      return fields;
    });
}

function resolveSource(preview, sources, worktreeList) {
  const explicit = sources.get(preview.id);
  if (explicit) return explicit;

  const matching = worktreeList.find(
    (worktree) =>
      worktree.HEAD === preview.commit ||
      worktree.branch === `refs/heads/${preview.branch}`,
  );
  assert.ok(
    matching?.worktree,
    `No worktree found for ${preview.id}. Add ${preview.branch} as a worktree or pass --source=${preview.id}=/absolute/path.`,
  );
  return matching.worktree;
}
