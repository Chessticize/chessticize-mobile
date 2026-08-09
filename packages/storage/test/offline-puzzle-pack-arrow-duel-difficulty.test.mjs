import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  addArrowDuelDifficultyToCorePack,
  DIFFICULTY_INDEX_PREDICATE,
  DIFFICULTY_INDEX_NAME,
  OUTPUT_PACK_SCHEMA_VERSION
} from "../../../scripts/add-arrow-duel-difficulty-to-core-pack.mjs";

test("adds compact Arrow Duel difficulty buckets without a per-puzzle text field", async (t) => {
  const fixture = await createFixture([1, 2, 4, 6, 8, 11, 0]);
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  const report = await addArrowDuelDifficultyToCorePack({
    ...fixture.input,
    buildDate: "2026-08-09",
    createIndex: false
  });

  assert.deepEqual(report.difficultyCounts, {
    unavailable: 1,
    "0": 2,
    "1": 1,
    "2": 1,
    "3": 1,
    "4+": 1
  });
  assert.equal(report.createIndex, false);
  assert.equal(report.indexName, null);
  assert.equal(report.integrityCheck, "ok");

  const db = new DatabaseSync(fixture.outputPackPath, { readOnly: true });
  try {
    assert.equal(
      db.prepare("SELECT pack_schema_version FROM pack_format WHERE id = 1").get().pack_schema_version,
      OUTPUT_PACK_SCHEMA_VERSION
    );
    assert.deepEqual(
      db.prepare("SELECT arrow_duel_difficulty AS difficulty FROM puzzles ORDER BY rowid")
        .all().map((row) => row.difficulty),
      [0, 0, 1, 2, 3, 4, null]
    );
    assert.equal(
      db.prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'index' AND name = ?"
      ).get(DIFFICULTY_INDEX_NAME).count,
      0
    );
  } finally {
    db.close();
  }

  const manifest = JSON.parse(await readFile(fixture.outputManifestPath, "utf8"));
  assert.equal(manifest.buildDate, "2026-08-09");
  assert.equal(manifest.packSchemaVersion, OUTPUT_PACK_SCHEMA_VERSION);
  assert.equal(manifest.packFileBytes, (await stat(fixture.outputPackPath)).size);
  assert.equal(manifest.arrowDuelDifficulty.index, null);
  assert.deepEqual(manifest.arrowDuelDifficulty.counts, {
    "0": 2,
    "1": 1,
    "2": 1,
    "3": 1,
    "4+": 1
  });
  assert.equal(manifest.arrowDuelDifficulty.unavailableCount, 1);
  assert.equal(manifest.arrowDuelDifficulty.engine.depth, 16);
});

test("creates the measured positive-difficulty partial index by default", async (t) => {
  const fixture = await createFixture([2, 4]);
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  const report = await addArrowDuelDifficultyToCorePack({
    ...fixture.input,
    buildDate: "2026-08-09"
  });

  assert.equal(report.indexName, DIFFICULTY_INDEX_NAME);
  const db = new DatabaseSync(fixture.outputPackPath, { readOnly: true });
  try {
    const columns = db.prepare(`PRAGMA index_info(${DIFFICULTY_INDEX_NAME})`).all();
    assert.deepEqual(columns.map((column) => column.name), [
      "arrow_duel_difficulty",
      "rating",
      "id"
    ]);
    const indexSql = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?"
    ).get(DIFFICULTY_INDEX_NAME).sql;
    assert.match(indexSql, new RegExp(`WHERE ${DIFFICULTY_INDEX_PREDICATE}$`, "u"));
    const plan = db.prepare(
      "EXPLAIN QUERY PLAN SELECT id FROM puzzles " +
      "WHERE arrow_duel_difficulty = 1 " +
      `AND ${DIFFICULTY_INDEX_PREDICATE} ` +
      "AND rating BETWEEN 900 AND 1100 ORDER BY rating, id LIMIT 20"
    ).all().map((row) => row.detail).join("\n");
    assert.match(plan, new RegExp(DIFFICULTY_INDEX_NAME, "u"));
  } finally {
    db.close();
  }
});

test("rejects metrics from a different Core Pack before writing output", async (t) => {
  const fixture = await createFixture([2]);
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const releasePath = join(fixture.metricsDirectory, "manifest.json");
  const release = JSON.parse(await readFile(releasePath, "utf8"));
  release.analysis.input.sha256 = "0".repeat(64);
  await writeFile(releasePath, `${JSON.stringify(release, null, 2)}\n`);

  await assert.rejects(
    addArrowDuelDifficultyToCorePack({
      ...fixture.input,
      buildDate: "2026-08-09",
      createIndex: false
    }),
    /metrics were produced from/u
  );
  await assert.rejects(stat(fixture.outputPackPath), /ENOENT/u);
});

async function createFixture(rawMetrics) {
  const root = await mkdtemp(join(tmpdir(), "arrow-duel-difficulty-"));
  const sourcePackPath = join(root, "source.sqlite");
  const sourceManifestPath = join(root, "source.manifest.json");
  const metricsDirectory = join(root, "metrics");
  const outputPackPath = join(root, "output.sqlite");
  const outputManifestPath = join(root, "output.manifest.json");
  await mkdir(metricsDirectory);
  createSourcePack(sourcePackPath, rawMetrics.length);
  const sourceBytes = (await stat(sourcePackPath)).size;
  const sourceHash = await sha256File(sourcePackPath);
  await writeFile(sourceManifestPath, `${JSON.stringify({
    id: "core",
    title: "Core Pack",
    buildDate: "2026-08-03",
    source: "fixture",
    sourceLicense: "CC0",
    presolve: "fixture",
    licenseNote: "fixture",
    manifestHash: "sha256:fixture",
    packFileHash: `sha256:${sourceHash}`,
    packFileBytes: sourceBytes,
    format: "sqlite",
    packSchemaVersion: 2,
    puzzleCount: rawMetrics.length,
    rating: { min: 1000, max: 1000 },
    themes: [],
    arrowDuelCount: rawMetrics.filter((value) => value !== 0).length
  }, null, 2)}\n`);
  const compactPath = join(metricsDirectory, "arrow-duel-routes-d16-mpv2.compact.sqlite");
  createCompactMetrics(compactPath, rawMetrics, sourceHash);
  const compactBytes = (await stat(compactPath)).size;
  const compactHash = await sha256File(compactPath);
  await writeFile(join(metricsDirectory, "manifest.json"), `${JSON.stringify({
    release: {
      repository: "Chessticize/lichess-presolver",
      tag: "arrow-duel-routes-d16-mpv2-test"
    },
    analysis: {
      input: { sha256: sourceHash },
      engine: {
        name: "Stockfish 18",
        depth: 16,
        multiPv: 2,
        evaluationToleranceCp: 100
      },
      metric: { maximumSearchedPlies: 10 }
    },
    artifacts: [{
      name: "arrow-duel-routes-d16-mpv2.compact.sqlite",
      bytes: compactBytes,
      sha256: compactHash
    }]
  }, null, 2)}\n`);
  return {
    root,
    metricsDirectory,
    outputPackPath,
    outputManifestPath,
    input: {
      sourcePackPath,
      sourceManifestPath,
      metricsDirectory,
      outputPackPath,
      outputManifestPath
    }
  };
}

function createSourcePack(path, count) {
  const db = new DatabaseSync(path);
  try {
    db.exec(`
      CREATE TABLE puzzles (
        id TEXT PRIMARY KEY,
        initial_fen BLOB NOT NULL,
        solution_moves BLOB NOT NULL,
        rating INTEGER NOT NULL,
        rating_deviation INTEGER NOT NULL,
        stockfish_eval REAL NOT NULL,
        stockfish_bestmove BLOB NOT NULL,
        stockfish_eval_after_first_move REAL NOT NULL
      );
      CREATE INDEX puzzles_rating_idx ON puzzles(rating, id);
      CREATE TABLE pack_format (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        format_id TEXT NOT NULL,
        pack_schema_version INTEGER NOT NULL,
        position_codec TEXT NOT NULL,
        position_codec_version INTEGER NOT NULL,
        move_codec TEXT NOT NULL,
        move_codec_version INTEGER NOT NULL
      );
      INSERT INTO pack_format VALUES (
        1, 'chessticize-core-pack', 2,
        'chessticize-position', 1, 'chessticize-uci16', 1
      );
    `);
    const insert = db.prepare(
      "INSERT INTO puzzles VALUES (?, x'00', x'00', 1000, 80, 0, x'00', 0)"
    );
    for (let index = 0; index < count; index += 1) {
      insert.run(`p-${index}`);
    }
  } finally {
    db.close();
  }
}

function createCompactMetrics(path, rawMetrics, sourceHash) {
  const packed = Buffer.alloc(Math.ceil(rawMetrics.length / 2));
  rawMetrics.forEach((value, index) => {
    packed[Math.floor(index / 2)] |= index % 2 === 0 ? value : value << 4;
  });
  const db = new DatabaseSync(path);
  try {
    db.exec(`
      CREATE TABLE arrow_duel_metric_definitions (
        id INTEGER PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        bit_width INTEGER NOT NULL,
        description TEXT NOT NULL
      );
      INSERT INTO arrow_duel_metric_definitions VALUES (1, 'top_move_unique_plies', 4, 'fixture');
      CREATE TABLE arrow_duel_route_metric_chunks (
        chunk_id INTEGER PRIMARY KEY,
        first_puzzle_rowid INTEGER NOT NULL UNIQUE,
        puzzle_count INTEGER NOT NULL,
        packed_metrics BLOB NOT NULL
      ) WITHOUT ROWID;
      CREATE TABLE compact_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) WITHOUT ROWID;
    `);
    db.prepare("INSERT INTO compact_metadata VALUES ('input_puzzle_count', ?)")
      .run(String(rawMetrics.length));
    db.prepare("INSERT INTO compact_metadata VALUES ('input_sha256', ?)")
      .run(`sha256:${sourceHash}`);
    db.prepare("INSERT INTO arrow_duel_route_metric_chunks VALUES (0, 1, ?, ?)")
      .run(rawMetrics.length, packed);
  } finally {
    db.close();
  }
}

async function sha256File(path) {
  const hash = createHash("sha256");
  hash.update(await readFile(path));
  return hash.digest("hex");
}
