import { createHash } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SOURCE_COMMIT = "9028826447330d67ab4c34f64a3fb7d1b5b05229";
const SOURCE_TREE = "f2ab3c211d9c2a028e7aaf0d59bcf1678b087601";
const SOURCE_STORE_BLOB = "354671f1b7b72056e703a408be56ffda7af1a6c7";
const fixtureDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(fixtureDirectory, "../../../../..");
const outputPath = join(fixtureDirectory, "schema-v8-ios-1.2.1.sqlite");

assertGitIdentity(`${SOURCE_COMMIT}^{tree}`, SOURCE_TREE);
assertGitIdentity(
  `${SOURCE_COMMIT}:packages/storage/src/sync-sqlite-store.ts`,
  SOURCE_STORE_BLOB
);

const extractionDirectory = await mkdtemp(join(tmpdir(), "chessticize-ios-121-source-"));
try {
  const archive = run("git", [
    "archive",
    "--format=tar",
    SOURCE_COMMIT,
    "package.json",
    "packages/core/src",
    "packages/storage/src"
  ]);
  run("tar", ["-xf", "-", "-C", extractionDirectory], archive.stdout);
  await symlink(resolveNodeModules(), join(extractionDirectory, "node_modules"), "dir");

  const helperPath = join(extractionDirectory, "generate-fixture.mjs");
  await writeFile(helperPath, releaseFixtureHelper(), "utf8");
  rmSync(outputPath, { force: true });
  run(
    process.execPath,
    ["--experimental-strip-types", helperPath, outputPath],
    undefined,
    extractionDirectory
  );
} finally {
  await rm(extractionDirectory, { recursive: true, force: true });
}

const fixture = await readFile(outputPath);
console.log(`${outputPath}\nSHA-256 ${createHash("sha256").update(fixture).digest("hex")}`);

function assertGitIdentity(revision, expected) {
  const actual = run("git", ["rev-parse", revision]).stdout.toString("utf8").trim();
  if (actual !== expected) {
    throw new Error(
      `Published iOS 1.2.1 source identity mismatch for ${revision}: expected ${expected}, received ${actual}`
    );
  }
}

function resolveNodeModules() {
  const commonGitDirectory = run("git", ["rev-parse", "--git-common-dir"])
    .stdout.toString("utf8").trim();
  const candidates = [
    join(repositoryRoot, "node_modules"),
    join(dirname(resolve(repositoryRoot, commonGitDirectory)), "node_modules")
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error("Install repository dependencies before regenerating the released fixture");
  }
  return found;
}

function run(command, args, input, cwd = repositoryRoot) {
  const result = spawnSync(command, args, {
    cwd,
    input,
    encoding: input === undefined ? undefined : "buffer",
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed:\n${result.stderr?.toString("utf8") ?? ""}`
    );
  }
  return result;
}

function releaseFixtureHelper() {
  return String.raw`
process.env.TZ = "UTC";

const { DatabaseSync } = await import("node:sqlite");
const { NodeSqliteDatabase } = await import("./packages/storage/src/sqlite-store.ts");
const { SyncSQLiteStore } = await import("./packages/storage/src/sync-sqlite-store.ts");

const outputPath = process.argv[2];
if (!outputPath) {
  throw new Error("Expected an output database path");
}

const nativeDatabase = new DatabaseSync(outputPath);
let generatedId = 0;
const store = new SyncSQLiteStore(new NodeSqliteDatabase(nativeDatabase), {
  randomId: () => "ios-121-generated-" + String(++generatedId).padStart(2, "0")
});

const standardConfig = {
  mode: "standard",
  ratingKey: "standard 5/20",
  durationSeconds: 300,
  perPuzzleSeconds: 20,
  targetCorrect: 15,
  maxMistakes: 3
};
const arrowConfig = {
  mode: "arrow_duel",
  ratingKey: "arrow_duel 5/30",
  durationSeconds: 300,
  perPuzzleSeconds: 30,
  targetCorrect: 10,
  maxMistakes: 3
};
const customConfig = {
  mode: "custom",
  ratingKey: "fork custom 7/25",
  durationSeconds: 420,
  perPuzzleSeconds: 25,
  targetCorrect: 7,
  maxMistakes: 2,
  themes: ["fork"]
};

try {
  store.migrate();
  store.saveSettings({
    sync: { iCloudEnabled: false },
    notifications: {
      reviewReminder: { mode: "fixed", fixedLocalTime: "07:35" }
    }
  });
  store.seedPuzzles([
    {
      id: "ios-121-standard-puzzle",
      initialFen: "r1bqk2r/pp1nbNp1/2p1p2p/8/2BP4/1PN3P1/P3QP1P/3R1RK1 b kq - 0 19",
      solutionMoves: ["e8f7", "e2e6", "f7f8", "e6f7"],
      rating: 1485,
      ratingDeviation: 76,
      popularity: 91,
      nbPlays: 603,
      themes: ["mate", "mateIn2", "middlegame", "short"],
      openingTags: ["Horwitz_Defense"],
      source: "synthetic",
      stockfishEval: 655,
      stockfishBestMove: "d8a5",
      stockfishEvalAfterFirstMove: 10000
    },
    {
      id: "ios-121-arrow-puzzle",
      initialFen: "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24",
      solutionMoves: ["f2g3", "e6e7", "b2b1", "b3c1", "b1c1", "h6c1"],
      rating: 1798,
      ratingDeviation: 77,
      popularity: 95,
      nbPlays: 8020,
      themes: ["crushing", "hangingPiece", "long", "middlegame"],
      openingTags: [],
      source: "synthetic",
      stockfishEval: -453,
      stockfishBestMove: "b2b1",
      stockfishEvalAfterFirstMove: 693
    },
    {
      id: "ios-121-custom-puzzle",
      initialFen: "2r3k1/2r4p/4p1p1/1p1q1pP1/p1bP1P1Q/P6R/5B2/2R3K1 b - - 5 34",
      solutionMoves: ["c4e2", "h4h7", "c7h7", "c1c8", "g8g7", "c8c7"],
      rating: 1801,
      ratingDeviation: 76,
      popularity: 88,
      nbPlays: 616,
      themes: ["fork", "deflection", "kingsideAttack", "middlegame"],
      openingTags: [],
      source: "synthetic",
      stockfishEval: -332,
      stockfishBestMove: "d5b7",
      stockfishEvalAfterFirstMove: 456
    }
  ]);

  for (const rating of [
    {
      key: "standard 5/20",
      generation: 0,
      rating: 690,
      ratingDeviation: 110,
      volatility: 0.06,
      games: 1
    },
    {
      key: "standard 5/20",
      generation: 1,
      rating: 708,
      ratingDeviation: 84,
      volatility: 0.055,
      games: 2
    },
    {
      key: "arrow_duel 5/30",
      generation: 0,
      rating: 742,
      ratingDeviation: 96,
      volatility: 0.058,
      games: 1
    },
    {
      key: "fork custom 7/25",
      generation: 0,
      rating: 815,
      ratingDeviation: 91,
      volatility: 0.057,
      games: 1
    }
  ]) {
    store.saveRating(rating);
  }

  store.saveCustomSprintConfig({
    id: "ios-121-custom-config",
    mode: "custom",
    ratingKey: "fork custom 7/25",
    durationSeconds: 420,
    perPuzzleSeconds: 25,
    targetCorrect: 7,
    maxMistakes: 2,
    themes: ["fork"],
    lastStartedAt: "2026-07-19T10:00:00.000Z",
    playCount: 3
  });
  store.savePracticeRun({
    id: "ios-121-custom-run",
    kind: "custom",
    name: "Fork Trainer",
    mode: "custom",
    ratingKey: "fork custom 7/25",
    durationSeconds: 420,
    perPuzzleSeconds: 25,
    targetCorrect: 7,
    maxMistakes: 2,
    themes: ["fork"],
    homeOrder: 2,
    archived: false,
    updatedAt: "2026-07-19T10:00:00.000Z"
  });

  saveSession({
    id: "ios-121-standard-won",
    config: standardConfig,
    run: { id: "standard", kind: "standard", name: "Standard" },
    ratingGeneration: 1,
    ratingBefore: 700,
    startedAt: "2026-07-20T08:00:00.000Z",
    deadlineAt: "2026-07-20T08:05:00.000Z",
    completedAt: "2026-07-20T08:04:00.000Z",
    status: "won",
    endReason: "target_reached",
    correctCount: 1,
    mistakeCount: 0,
    ratingAfter: 720
  });
  saveSession({
    id: "ios-121-standard-failed",
    config: standardConfig,
    run: { id: "standard", kind: "standard", name: "Standard" },
    ratingGeneration: 1,
    ratingBefore: 720,
    startedAt: "2026-07-21T08:00:00.000Z",
    deadlineAt: "2026-07-21T08:05:00.000Z",
    completedAt: "2026-07-21T08:01:00.000Z",
    status: "failed",
    endReason: "max_mistakes",
    correctCount: 0,
    mistakeCount: 1,
    ratingAfter: 708
  });
  saveSession({
    id: "ios-121-arrow-failed",
    config: arrowConfig,
    run: { id: "arrow-duel", kind: "arrow_duel", name: "Arrow Duel" },
    ratingGeneration: 0,
    ratingBefore: 750,
    startedAt: "2026-07-21T10:00:00.000Z",
    deadlineAt: "2026-07-21T10:05:00.000Z",
    completedAt: "2026-07-21T10:02:00.000Z",
    status: "failed",
    endReason: "max_mistakes",
    correctCount: 0,
    mistakeCount: 1,
    ratingAfter: 742
  });
  saveSession({
    id: "ios-121-custom-won",
    config: customConfig,
    run: { id: "ios-121-custom-run", kind: "custom", name: "Fork Trainer" },
    ratingGeneration: 0,
    ratingBefore: 800,
    startedAt: "2026-07-22T08:00:00.000Z",
    deadlineAt: "2026-07-22T08:07:00.000Z",
    completedAt: "2026-07-22T08:06:00.000Z",
    status: "won",
    endReason: "target_reached",
    correctCount: 1,
    mistakeCount: 0,
    ratingAfter: 815
  });
  saveSession({
    id: "ios-121-standard-active",
    config: standardConfig,
    run: { id: "standard", kind: "standard", name: "Standard" },
    ratingGeneration: 1,
    ratingBefore: 708,
    startedAt: "2026-07-23T11:00:00.000Z",
    deadlineAt: "2026-07-23T11:05:00.000Z",
    status: "active",
    correctCount: 2,
    mistakeCount: 0
  });
  saveSession({
    id: "ios-121-custom-paused",
    config: customConfig,
    run: { id: "ios-121-custom-run", kind: "custom", name: "Fork Trainer" },
    ratingGeneration: 0,
    ratingBefore: 815,
    startedAt: "2026-07-23T12:00:00.000Z",
    deadlineAt: "2026-07-23T12:07:00.000Z",
    status: "paused",
    correctCount: 1,
    mistakeCount: 0
  });

  for (const attempt of [
    {
      id: "ios-121-standard-correct",
      source: "sprint",
      sessionId: "ios-121-standard-won",
      puzzleId: "ios-121-standard-puzzle",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "correct",
      submittedMove: "e2e6",
      expectedMove: "e2e6",
      startedAt: "2026-07-20T08:00:00.000Z",
      completedAt: "2026-07-20T08:00:06.000Z",
      ratingBefore: 700,
      ratingAfter: 720,
      unclear: true,
      unclearUpdatedAt: "2026-07-20T08:00:07.000Z"
    },
    {
      id: "ios-121-standard-wrong",
      source: "sprint",
      sessionId: "ios-121-standard-failed",
      puzzleId: "ios-121-standard-puzzle",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "wrong",
      submittedMove: "e2e5",
      expectedMove: "e2e6",
      startedAt: "2026-07-21T08:00:00.000Z",
      completedAt: "2026-07-21T08:00:08.000Z",
      ratingBefore: 720,
      ratingAfter: 708
    },
    {
      id: "ios-121-arrow-wrong",
      source: "sprint",
      sessionId: "ios-121-arrow-failed",
      puzzleId: "ios-121-arrow-puzzle",
      mode: "arrow_duel",
      ratingKey: "arrow_duel 5/30",
      result: "wrong",
      submittedMove: "f2g3",
      expectedMove: "b2b1",
      startedAt: "2026-07-21T10:00:00.000Z",
      completedAt: "2026-07-21T10:00:07.000Z",
      ratingBefore: 750,
      ratingAfter: 742,
      arrowDuelCandidateOrder: ["b2b1", "f2g3", "h6c1"]
    },
    {
      id: "ios-121-custom-correct",
      source: "sprint",
      sessionId: "ios-121-custom-won",
      puzzleId: "ios-121-custom-puzzle",
      mode: "custom",
      ratingKey: "fork custom 7/25",
      result: "correct",
      submittedMove: "c2c3",
      expectedMove: "c2c3",
      startedAt: "2026-07-22T08:00:00.000Z",
      completedAt: "2026-07-22T08:00:12.000Z",
      ratingBefore: 800,
      ratingAfter: 815
    },
    {
      id: "ios-121-review-correct",
      source: "scheduled_review",
      sessionId: "ios-121-review-session",
      puzzleId: "ios-121-standard-puzzle",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "correct",
      submittedMove: "e2e6",
      expectedMove: "e2e6",
      startedAt: "2026-07-23T09:00:00.000Z",
      completedAt: "2026-07-23T09:00:05.000Z",
      ratingBefore: 708
    }
  ]) {
    store.recordAttempt(attempt);
  }

  store.recordReviewResult(
    {
      puzzleId: "ios-121-standard-puzzle",
      mode: "standard",
      ratingKey: "standard 5/20"
    },
    "wrong",
    "2026-07-20T09:00:00.000Z"
  );
  store.enrollReview(
    {
      puzzleId: "ios-121-arrow-puzzle",
      mode: "arrow_duel",
      ratingKey: "arrow_duel 5/30"
    },
    "2026-07-21T09:00:00.000Z"
  );

  const version = store.db.prepare("PRAGMA user_version").get();
  const integrity = store.db.prepare("PRAGMA integrity_check").get();
  const foreignKeys = store.db.prepare("PRAGMA foreign_key_check").all();
  const counts = Object.fromEntries(
    ["ratings", "attempts", "sprint_sessions", "practice_runs", "review_queue"].map(
      (table) => [
        table,
        store.db.prepare("SELECT COUNT(*) AS count FROM " + table).get().count
      ]
    )
  );
  if (
    version.user_version !== 8 ||
    integrity.integrity_check !== "ok" ||
    foreignKeys.length !== 0 ||
    counts.ratings !== 4 ||
    counts.attempts !== 5 ||
    counts.sprint_sessions !== 7 ||
    counts.practice_runs !== 3 ||
    counts.review_queue !== 2
  ) {
    throw new Error("Published-source fixture failed its schema or semantic preflight");
  }
} finally {
  nativeDatabase.exec("VACUUM");
  nativeDatabase.close();
}

function saveSession(input) {
  const initial = {
    id: input.id,
    config: input.config,
    run: input.run,
    ratingGeneration: input.ratingGeneration,
    ratingBefore: input.ratingBefore,
    startedAt: input.startedAt,
    deadlineAt: input.deadlineAt,
    status: input.status === "active" || input.status === "paused" ? input.status : "active",
    correctCount: input.correctCount,
    mistakeCount: input.mistakeCount
  };
  store.createSprintSession(initial);
  if (input.completedAt) {
    store.updateSprintSession({
      ...initial,
      status: input.status,
      completedAt: input.completedAt,
      endReason: input.endReason,
      ratingAfter: input.ratingAfter
    });
  }
}
`;
}
