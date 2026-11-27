import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { applyArrowDuelRatingsToPack } from "../../../scripts/apply-arrow-duel-ratings.mjs";
import { CORE_PACK_THEME_CATALOG } from "../../../scripts/offline-puzzle-pack-schema.mjs";

test("applyArrowDuelRatingsToPack injects arrow_duel_rating into puzzles and puzzle_themes cleanly", async () => {
  const dir = await mkdtemp(join(tmpdir(), "chessticize-apply-ad-ratings-"));
  const packPath = join(dir, "pack.sqlite");
  const manifestPath = join(dir, "pack.manifest.json");
  const sidecarPath = join(dir, "sidecar.sqlite");
  try {
    const db = new DatabaseSync(packPath);
    db.exec(`
      CREATE TABLE themes (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
      CREATE TABLE puzzles (
        id TEXT PRIMARY KEY,
        initial_fen TEXT NOT NULL,
        solution_moves TEXT NOT NULL,
        rating INTEGER NOT NULL,
        rating_deviation INTEGER NOT NULL,
        stockfish_eval REAL NOT NULL,
        stockfish_bestmove TEXT NOT NULL,
        stockfish_eval_after_first_move REAL NOT NULL
      );
      CREATE TABLE puzzle_themes (
        puzzle_id TEXT NOT NULL,
        theme_id INTEGER NOT NULL,
        rating INTEGER NOT NULL,
        PRIMARY KEY (puzzle_id, theme_id)
      ) WITHOUT ROWID;
    `);
    const insTheme = db.prepare("INSERT INTO themes (id, name) VALUES (?, ?)");
    for (const theme of CORE_PACK_THEME_CATALOG) {
      insTheme.run(theme.id, theme.name);
    }
    db.prepare("INSERT INTO puzzles VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      "p1", "4k3/8/8/8/8/8/4R3/4K3 w - -", "e2e1 e8d7", 2000, 75, 0, "e2e7", -500
    );
    db.prepare("INSERT INTO puzzles VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      "p2_promo", "4k3/4P3/8/8/8/8/8/4K3 w - -", "e7e8q e8d7", 1400, 75, 0, "e7e8n", -500
    );
    db.prepare("INSERT INTO puzzle_themes VALUES (?, ?, ?)").run("p1", 24, 2000);
    db.close();

    const sidecar = new DatabaseSync(sidecarPath);
    sidecar.exec(`
      CREATE TABLE analysis_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
      CREATE TABLE arrow_duel_ratings (
        puzzle_id TEXT PRIMARY KEY,
        original_rating INTEGER NOT NULL,
        arrow_duel_rating INTEGER NOT NULL,
        arrow_duel_rating_sprint INTEGER NOT NULL,
        q_700_bp INTEGER NOT NULL,
        q_1100_bp INTEGER NOT NULL,
        q_1500_bp INTEGER NOT NULL,
        q_1900_bp INTEGER NOT NULL,
        q_2300_bp INTEGER NOT NULL
      ) WITHOUT ROWID;
    `);
    sidecar.prepare("INSERT INTO analysis_metadata VALUES ('identity', ?)").run(
      JSON.stringify({ model: { name: "maia3-5m" }, formula: { name: "prompted-comparison-3pl-irt-v1" } })
    );
    sidecar.prepare("INSERT INTO arrow_duel_ratings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      "p1", 2000, 720, 720, 9000, 9000, 9000, 9000, 9000
    );
    sidecar.close();

    await writeFile(
      manifestPath,
      JSON.stringify({
        id: "test-pack",
        title: "Test Pack",
        source: "lichess",
        sourceLicense: "CC0",
        sourceSnapshotDate: "2025-07-24",
        presolve: "stockfish",
        presolveDepth: 20,
        licenseNote: "CC0",
        seed: "test",
        packVersion: 5,
        targetPuzzleCount: 2,
        arrowDuelCount: 1,
        matePatternCounts: {},
        ratingBuckets: []
      })
    );

    const report = await applyArrowDuelRatingsToPack({
      packPath,
      manifestPath,
      ratingsDbPath: sidecarPath,
      skipInputHashCheck: true,
      log: () => {}
    });

    assert.equal(report.ratedCount, 1);
    assert.equal(report.integrityCheck, "ok");

    const checkDb = new DatabaseSync(packPath, { readOnly: true });
    const p1 = checkDb.prepare("SELECT rating, arrow_duel_rating FROM puzzles WHERE id = 'p1'").get();
    const p2 = checkDb.prepare("SELECT rating, arrow_duel_rating FROM puzzles WHERE id = 'p2_promo'").get();
    const pt1 = checkDb.prepare("SELECT rating, arrow_duel_rating FROM puzzle_themes WHERE puzzle_id = 'p1'").get();
    checkDb.close();

    assert.equal(p1.rating, 2000);
    assert.equal(p1.arrow_duel_rating, 720);
    assert.equal(p2.arrow_duel_rating, null);
    assert.equal(pt1.arrow_duel_rating, 720);

    const updatedManifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(updatedManifest.packVersion, 6);
    assert.equal(updatedManifest.arrowDuelRatingSource.ratedCount, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
