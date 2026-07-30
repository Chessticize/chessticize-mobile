#!/usr/bin/env node
import {
  copyFile,
  readFile,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import {
  buildSqliteManifest,
  sha256File,
  sha256Text,
  stableJson
} from "./generate-offline-puzzle-fixture.mjs";
import {
  installArtifactPair
} from "./offline-puzzle-pack-artifact.mjs";
import {
  assertCorePackThemeCatalog,
  CORE_PACK_THEME_CATALOG,
  corePackThemeId,
  INDEXED_CORE_PACK_THEMES
} from "./offline-puzzle-pack-schema.mjs";

const DEFAULT_PACK = "fixtures/puzzles/bundled-core-pack.sqlite";
const DEFAULT_MANIFEST = "fixtures/puzzles/bundled-core-pack.manifest.json";
const DEFAULT_BUILD_DATE = new Date().toISOString().slice(0, 10);
const DEFAULT_MAX_RATING = 2200;

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const report = await optimizeOfflinePuzzlePack({
    packPath: resolve(options.pack),
    manifestPath: resolve(options.manifest),
    buildDate: options.buildDate,
    maxRating: options.maxRating
  });
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (options.report) {
    await writeFile(resolve(options.report), output);
    console.log(`Wrote optimization report to ${resolve(options.report)}`);
  }
  console.log(output.trimEnd());
}

async function optimizeOfflinePuzzlePack(input) {
  const packPath = resolve(input.packPath);
  const manifestPath = resolve(input.manifestPath);
  const log = input.log ?? console.log;
  const priorManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  await verifyArtifactMatchesManifest(packPath, priorManifest);
  if (
    !Number.isInteger(priorManifest.puzzleCount) ||
    priorManifest.puzzleCount < 1 ||
    !Number.isInteger(priorManifest.arrowDuelCount) ||
    priorManifest.arrowDuelCount < 0 ||
    priorManifest.arrowDuelCount > priorManifest.puzzleCount
  ) {
    throw new Error(
      "Core Pack optimization requires valid input puzzle and Arrow Duel counts"
    );
  }

  const token = `${process.pid}-${Date.now()}`;
  const temporaryPackPath = `${packPath}.optimize-${token}.tmp`;
  const temporaryManifestPath = `${manifestPath}.optimize-${token}.tmp`;
  let installed = false;
  try {
    await copyFile(packPath, temporaryPackPath);
    const optimized = optimizePackDatabase(temporaryPackPath, log);
    if (optimized.beforePuzzleCount !== priorManifest.puzzleCount) {
      throw new Error(
        `Core Pack contains ${optimized.beforePuzzleCount} puzzles but its ` +
        `manifest records ${priorManifest.puzzleCount}`
      );
    }
    const integrityCheck = readIntegrityCheck(temporaryPackPath);
    if (integrityCheck !== "ok") {
      throw new Error(
        `Optimized pack failed PRAGMA integrity_check: ${integrityCheck}`
      );
    }

    const packFileBytes = (await stat(temporaryPackPath)).size;
    const packFileHash = `sha256:${await sha256File(temporaryPackPath)}`;
    const manifest = buildSqliteManifest(temporaryPackPath, {
      id: priorManifest.id,
      title: priorManifest.title,
      buildDate: input.buildDate,
      source: priorManifest.source,
      sourceLicense: priorManifest.sourceLicense,
      sourceSnapshotDate: priorManifest.sourceSnapshotDate,
      presolve: priorManifest.presolve,
      presolveDepth: priorManifest.presolveDepth,
      licenseNote: priorManifest.licenseNote,
      format: "sqlite",
      seed: priorManifest.seed,
      targetPuzzleCount:
        priorManifest.targetPuzzleCount ?? optimized.beforePuzzleCount,
      packFileBytes,
      packFileHash,
      manifestHash: "pending"
    }, {
      maxRating: input.maxRating,
      knownArrowDuelCount: priorManifest.arrowDuelCount,
      knownMatePatternCounts: priorManifest.matePatternCounts,
      knownRatingBucketMatePatternCounts: new Map(
        (priorManifest.ratingBuckets ?? []).map((bucket) => [
          bucket.minRating,
          bucket.matePatternCounts ?? {}
        ])
      )
    });
    manifest.manifestHash =
      `sha256:${sha256Text(stableJson({ ...manifest, manifestHash: "" }))}`;
    await writeFile(
      temporaryManifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`
    );

    await installArtifactPair({
      packPath,
      manifestPath,
      temporaryPackPath,
      temporaryManifestPath,
      token,
      backupLabel: "optimize",
      fileSystem: input.fileSystem
    });
    installed = true;

    return {
      beforePuzzleCount: optimized.beforePuzzleCount,
      afterPuzzleCount: manifest.puzzleCount,
      beforePuzzleThemeRelationCount:
        optimized.beforePuzzleThemeRelationCount,
      afterPuzzleThemeRelationCount:
        optimized.afterPuzzleThemeRelationCount,
      themeCatalogCount: CORE_PACK_THEME_CATALOG.length,
      indexedThemeCount: INDEXED_CORE_PACK_THEMES.length,
      beforePackFileBytes: priorManifest.packFileBytes,
      packFileBytes,
      bytesSaved:
        typeof priorManifest.packFileBytes === "number"
          ? priorManifest.packFileBytes - packFileBytes
          : undefined,
      packFileHash,
      manifestHash: manifest.manifestHash,
      arrowDuelValidation: "reused-from-verified-input",
      integrityCheck
    };
  } finally {
    if (!installed) {
      await rm(temporaryPackPath, { force: true });
      await rm(temporaryManifestPath, { force: true });
    }
  }
}

function optimizePackDatabase(packPath, log) {
  const db = new DatabaseSync(packPath);
  let transactionOpen = false;
  try {
    assertPackSchema(db);
    assertCorePackThemeCatalog(db);
    const beforePuzzleCount = countRows(db, "puzzles");
    const beforePuzzleThemeRelationCount = countRows(db, "puzzle_themes");
    const indexedThemeIds = INDEXED_CORE_PACK_THEMES.map((theme) => {
      const id = corePackThemeId(theme);
      if (id === undefined) {
        throw new Error(`Indexed Core Pack theme ${theme} has no stable ID`);
      }
      return id;
    });
    if (hasOptimizedRelationLayout(db, indexedThemeIds)) {
      log("Core Pack relation layout is already optimized; leaving artifact bytes unchanged");
      return {
        beforePuzzleCount,
        afterPuzzleCount: beforePuzzleCount,
        beforePuzzleThemeRelationCount,
        afterPuzzleThemeRelationCount: beforePuzzleThemeRelationCount
      };
    }

    db.exec(`
      PRAGMA journal_mode = OFF;
      PRAGMA synchronous = OFF;
      PRAGMA temp_store = MEMORY;
      BEGIN IMMEDIATE;
    `);
    transactionOpen = true;
    db.exec(`
      CREATE TABLE puzzle_themes_optimized (
        puzzle_id TEXT NOT NULL,
        theme_id INTEGER NOT NULL,
        rating INTEGER NOT NULL,
        PRIMARY KEY (puzzle_id, theme_id)
      ) WITHOUT ROWID;
    `);
    db.prepare(`
      INSERT INTO puzzle_themes_optimized (puzzle_id, theme_id, rating)
      SELECT puzzle_id, theme_id, rating
      FROM puzzle_themes
      WHERE theme_id IN (${indexedThemeIds.map(() => "?").join(", ")})
      ORDER BY puzzle_id, theme_id
    `).run(...indexedThemeIds);
    db.exec(`
      DROP INDEX IF EXISTS puzzle_themes_theme_rating_idx;
      DROP TABLE puzzle_themes;
      ALTER TABLE puzzle_themes_optimized RENAME TO puzzle_themes;
      CREATE INDEX puzzle_themes_theme_rating_idx
        ON puzzle_themes(theme_id, rating, puzzle_id);
      COMMIT;
    `);
    transactionOpen = false;
    db.exec("VACUUM");
    db.exec("ANALYZE");

    const afterPuzzleCount = countRows(db, "puzzles");
    const afterPuzzleThemeRelationCount = countRows(db, "puzzle_themes");
    if (afterPuzzleCount !== beforePuzzleCount) {
      throw new Error(
        `Core Pack puzzle count changed from ${beforePuzzleCount} to ${afterPuzzleCount}`
      );
    }
    const ratingMismatchCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM puzzle_themes
      JOIN puzzles ON puzzles.id = puzzle_themes.puzzle_id
      WHERE puzzle_themes.rating <> puzzles.rating
    `).get().count;
    if (ratingMismatchCount !== 0) {
      throw new Error(
        `Optimized Core Pack has ${ratingMismatchCount} relation rating mismatches`
      );
    }
    const unsupportedRelationCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM puzzle_themes
      WHERE theme_id NOT IN (${indexedThemeIds.map(() => "?").join(", ")})
    `).get(...indexedThemeIds).count;
    if (unsupportedRelationCount !== 0) {
      throw new Error(
        `Optimized Core Pack retained ${unsupportedRelationCount} unsupported theme relations`
      );
    }
    const tableSql = db.prepare(`
      SELECT sql
      FROM sqlite_master
      WHERE type = 'table' AND name = 'puzzle_themes'
    `).get()?.sql;
    if (!tableSql || !/WITHOUT ROWID$/u.test(tableSql)) {
      throw new Error("Optimized puzzle_themes table is not WITHOUT ROWID");
    }
    log(
      `Optimized puzzle_themes from ${beforePuzzleThemeRelationCount} ` +
      `to ${afterPuzzleThemeRelationCount} relations`
    );
    return {
      beforePuzzleCount,
      afterPuzzleCount,
      beforePuzzleThemeRelationCount,
      afterPuzzleThemeRelationCount
    };
  } finally {
    if (transactionOpen) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // The caller discards the temporary database after any failure.
      }
    }
    db.close();
  }
}

function assertPackSchema(db) {
  const requiredTables = ["puzzles", "themes", "puzzle_themes"];
  for (const table of requiredTables) {
    const exists = db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
    ).get(table);
    if (!exists) {
      throw new Error(`Core Pack is missing required table ${table}`);
    }
  }
  const requiredPuzzleThemeColumns = new Set([
    "puzzle_id",
    "theme_id",
    "rating"
  ]);
  for (const row of db.prepare("PRAGMA table_info(puzzle_themes)").all()) {
    requiredPuzzleThemeColumns.delete(row.name);
  }
  if (requiredPuzzleThemeColumns.size > 0) {
    throw new Error(
      "Core Pack puzzle_themes is missing required columns: " +
      [...requiredPuzzleThemeColumns].join(", ")
    );
  }
}

function hasOptimizedRelationLayout(db, indexedThemeIds) {
  const tableSql = db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'puzzle_themes'
  `).get()?.sql;
  if (!tableSql || !/WITHOUT ROWID$/u.test(tableSql)) {
    return false;
  }
  const indexColumns = db.prepare(
    "PRAGMA index_info(puzzle_themes_theme_rating_idx)"
  ).all().map((row) => row.name);
  if (
    indexColumns.length !== 3 ||
    indexColumns[0] !== "theme_id" ||
    indexColumns[1] !== "rating" ||
    indexColumns[2] !== "puzzle_id"
  ) {
    return false;
  }
  const unsupportedRelationCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM puzzle_themes
    WHERE theme_id NOT IN (${indexedThemeIds.map(() => "?").join(", ")})
  `).get(...indexedThemeIds).count;
  if (unsupportedRelationCount !== 0) {
    return false;
  }
  const ratingMismatchCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM puzzle_themes
    JOIN puzzles ON puzzles.id = puzzle_themes.puzzle_id
    WHERE puzzle_themes.rating <> puzzles.rating
  `).get().count;
  return ratingMismatchCount === 0;
}

async function verifyArtifactMatchesManifest(packPath, manifest) {
  const expectedManifestHash =
    `sha256:${sha256Text(stableJson({ ...manifest, manifestHash: "" }))}`;
  if (manifest.manifestHash !== expectedManifestHash) {
    throw new Error(
      `Manifest hash ${manifest.manifestHash} does not match ` +
      expectedManifestHash
    );
  }
  const bytes = (await stat(packPath)).size;
  if (
    manifest.packFileBytes !== undefined &&
    bytes !== manifest.packFileBytes
  ) {
    throw new Error(
      `Pack size ${bytes} does not match manifest packFileBytes ` +
      `${manifest.packFileBytes}`
    );
  }
  const hash = `sha256:${await sha256File(packPath)}`;
  if (manifest.packFileHash && hash !== manifest.packFileHash) {
    throw new Error(
      `Pack hash ${hash} does not match manifest packFileHash ` +
      `${manifest.packFileHash}`
    );
  }
}

function readIntegrityCheck(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return db.prepare("PRAGMA integrity_check").get().integrity_check;
  } finally {
    db.close();
  }
}

function countRows(db, table) {
  return db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
}

function parseArgs(argv) {
  const options = {
    pack: DEFAULT_PACK,
    manifest: DEFAULT_MANIFEST,
    buildDate: DEFAULT_BUILD_DATE,
    maxRating: DEFAULT_MAX_RATING,
    report: undefined
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--pack") {
      options.pack = requiredValue(argv, index);
      index += 1;
    } else if (arg === "--manifest") {
      options.manifest = requiredValue(argv, index);
      index += 1;
    } else if (arg === "--build-date") {
      options.buildDate = requiredValue(argv, index);
      index += 1;
    } else if (arg === "--max-rating") {
      options.maxRating = parsePositiveInteger(
        requiredValue(argv, index),
        "max-rating"
      );
      index += 1;
    } else if (arg === "--report") {
      options.report = requiredValue(argv, index);
      index += 1;
    } else if (arg !== "--") {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function parsePositiveInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function requiredValue(argv, index) {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${argv[index]}`);
  }
  return value;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}

export {
  main,
  optimizeOfflinePuzzlePack
};
