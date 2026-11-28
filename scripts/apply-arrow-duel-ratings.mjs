#!/usr/bin/env node
/**
 * Apply Maia-computed Arrow Duel ratings from a lichess-presolver sidecar SQLite
 * database onto an existing binary-v1 Core Pack to build core-pack-v6.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import {
  buildSqliteManifest,
  sha256File,
  sha256Text,
  stableJson
} from "./generate-offline-puzzle-fixture.mjs";
import { installArtifactPair } from "./offline-puzzle-pack-artifact.mjs";
import { assertCorePackThemeCatalog } from "./offline-puzzle-pack-schema.mjs";

const DEFAULT_PACK = "fixtures/puzzles/bundled-core-pack.sqlite";
const DEFAULT_MANIFEST = "fixtures/puzzles/bundled-core-pack.manifest.json";
const DEFAULT_BUILD_DATE = new Date().toISOString().slice(0, 10);
const DEFAULT_MAX_RATING = 2200;

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (!options.ratingsDb) {
    throw new Error("Required: --ratings-db <path-to-arrow-duel-ratings.sqlite>");
  }
  const report = await applyArrowDuelRatingsToPack({
    packPath: resolve(options.pack),
    manifestPath: resolve(options.manifest),
    ratingsDbPath: resolve(options.ratingsDb),
    outputPackPath: options.outputPack ? resolve(options.outputPack) : undefined,
    outputManifestPath: options.outputManifest ? resolve(options.outputManifest) : undefined,
    buildDate: options.buildDate,
    maxRating: options.maxRating,
    packVersion: options.packVersion,
    skipInputHashCheck: options.skipInputHashCheck
  });
  console.log(JSON.stringify(report, null, 2));
}

export async function applyArrowDuelRatingsToPack(input) {
  const packPath = resolve(input.packPath);
  const manifestPath = resolve(input.manifestPath);
  const ratingsDbPath = resolve(input.ratingsDbPath);
  const outputPackPath = input.outputPackPath ? resolve(input.outputPackPath) : packPath;
  const outputManifestPath = input.outputManifestPath ? resolve(input.outputManifestPath) : manifestPath;
  const log = input.log ?? console.log;

  const priorManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const inputPackSha = await sha256File(packPath);
  const expectedPackSha = priorManifest.packFileHash?.replace(/^sha256:/u, "");
  if (!input.skipInputHashCheck && expectedPackSha && inputPackSha !== expectedPackSha) {
    throw new Error(
      `Input pack SHA-256 (${inputPackSha}) does not match manifest (${expectedPackSha})`
    );
  }

  // Read and verify sidecar identity
  const sidecarRo = new DatabaseSync(ratingsDbPath, { readOnly: true });
  let sidecarIdentity;
  let sidecarCount;
  try {
    const idRow = sidecarRo.prepare("SELECT value FROM analysis_metadata WHERE key = 'identity'").get();
    if (!idRow?.value) {
      throw new Error("Ratings sidecar is missing analysis_metadata.identity");
    }
    sidecarIdentity = JSON.parse(idRow.value);
    const sidecarInputSha = String(sidecarIdentity.inputSha256 ?? "").replace(/^sha256:/u, "");
    if (!input.skipInputHashCheck && sidecarInputSha && sidecarInputSha !== inputPackSha) {
      throw new Error(
        `Sidecar inputSha256 (${sidecarInputSha}) does not match Core Pack (${inputPackSha})`
      );
    }
    sidecarCount = Number(
      sidecarRo.prepare("SELECT COUNT(*) AS c FROM arrow_duel_ratings").get().c
    );
  } finally {
    sidecarRo.close();
  }

  const token = `${process.pid}-${Date.now()}`;
  const temporaryPackPath = `${outputPackPath}.ad-rating-${token}.tmp`;
  const temporaryManifestPath = `${outputManifestPath}.ad-rating-${token}.tmp`;
  let installed = false;

  try {
    await copyFile(packPath, temporaryPackPath);
    const beforePackFileBytes = (await stat(temporaryPackPath)).size;

    const db = new DatabaseSync(temporaryPackPath);
    let stats;
    try {
      assertCorePackThemeCatalog(db);
      db.exec(`
        PRAGMA journal_mode = OFF;
        PRAGMA synchronous = OFF;
        PRAGMA temp_store = MEMORY;
        PRAGMA cache_size = -131072;
      `);

      const puzzleCols = db.prepare("PRAGMA table_info(puzzles)").all().map((r) => r.name);
      if (!puzzleCols.includes("arrow_duel_rating")) {
        db.exec("ALTER TABLE puzzles ADD COLUMN arrow_duel_rating INTEGER");
      }

      const escapedSidecar = ratingsDbPath.replaceAll("'", "''");
      db.exec(`ATTACH DATABASE '${escapedSidecar}' AS ad_src;`);
      db.exec("BEGIN IMMEDIATE;");
      db.exec(`
        UPDATE puzzles
        SET arrow_duel_rating = (
          SELECT ad_src.arrow_duel_ratings.arrow_duel_rating
          FROM ad_src.arrow_duel_ratings
          WHERE ad_src.arrow_duel_ratings.puzzle_id = puzzles.id
        );
      `);

      // Rebuild puzzle_themes with arrow_duel_rating column and covering index
      db.exec(`
        CREATE TABLE puzzle_themes_v6 (
          puzzle_id TEXT NOT NULL,
          theme_id INTEGER NOT NULL,
          rating INTEGER NOT NULL,
          arrow_duel_rating INTEGER,
          PRIMARY KEY (puzzle_id, theme_id)
        ) WITHOUT ROWID;

        INSERT INTO puzzle_themes_v6 (puzzle_id, theme_id, rating, arrow_duel_rating)
        SELECT pt.puzzle_id, pt.theme_id, pt.rating, p.arrow_duel_rating
        FROM puzzle_themes pt
        JOIN puzzles p ON p.id = pt.puzzle_id;

        DROP TABLE puzzle_themes;
        ALTER TABLE puzzle_themes_v6 RENAME TO puzzle_themes;

        CREATE INDEX puzzle_themes_theme_rating_idx
          ON puzzle_themes(theme_id, rating, puzzle_id);

        CREATE INDEX puzzle_themes_theme_ad_rating_idx
          ON puzzle_themes(theme_id, arrow_duel_rating, puzzle_id)
          WHERE arrow_duel_rating IS NOT NULL;

        DROP INDEX IF EXISTS puzzles_arrow_duel_rating_idx;
        CREATE INDEX puzzles_arrow_duel_rating_idx
          ON puzzles(arrow_duel_rating, id)
          WHERE arrow_duel_rating IS NOT NULL;
      `);
      db.exec("COMMIT;");
      db.exec("DETACH DATABASE ad_src;");

      // Verify exact counts, bounds, and denormalized parity
      const ratedCount = Number(
        db.prepare("SELECT COUNT(*) AS c FROM puzzles WHERE arrow_duel_rating IS NOT NULL").get().c
      );
      if (ratedCount !== sidecarCount) {
        throw new Error(
          `Expected ${sidecarCount} rated Arrow Duel rows in puzzles, got ${ratedCount}`
        );
      }
      if (priorManifest.arrowDuelCount !== undefined && ratedCount !== priorManifest.arrowDuelCount) {
        throw new Error(
          `Rated Arrow Duel count (${ratedCount}) does not match manifest arrowDuelCount (${priorManifest.arrowDuelCount})`
        );
      }
      const outOfBounds = Number(
        db.prepare(
          "SELECT COUNT(*) AS c FROM puzzles WHERE arrow_duel_rating IS NOT NULL AND (arrow_duel_rating < 600 OR arrow_duel_rating > 2200)"
        ).get().c
      );
      if (outOfBounds !== 0) {
        throw new Error(`Found ${outOfBounds} Arrow Duel ratings outside [600, 2200]`);
      }
      const themeMismatches = Number(
        db.prepare(`
          SELECT COUNT(*) AS c
          FROM puzzle_themes pt
          JOIN puzzles p ON p.id = pt.puzzle_id
          WHERE COALESCE(pt.arrow_duel_rating, -1) <> COALESCE(p.arrow_duel_rating, -1)
        `).get().c
      );
      if (themeMismatches !== 0) {
        throw new Error(`Found ${themeMismatches} mismatched puzzle_themes.arrow_duel_rating rows`);
      }

      // Compute Arrow Duel rating bucket counts + deterministic digest
      const adBucketRows = db.prepare(`
        SELECT
          CASE WHEN arrow_duel_rating >= 2100 THEN 2100 ELSE (arrow_duel_rating / 100) * 100 END AS bucket_min,
          COUNT(*) AS count
        FROM puzzles
        WHERE arrow_duel_rating IS NOT NULL
        GROUP BY bucket_min
        ORDER BY bucket_min ASC
      `).all();

      const adDigest = createHash("sha256");
      for (const row of db.prepare(
        "SELECT id, arrow_duel_rating FROM puzzles WHERE arrow_duel_rating IS NOT NULL ORDER BY id ASC"
      ).iterate()) {
        adDigest.update(`${row.id}:${row.arrow_duel_rating}\n`);
      }

      log("Running VACUUM and ANALYZE on updated Core Pack...");
      db.exec("ANALYZE;");
      db.exec("VACUUM;");
      const integrity = db.prepare("PRAGMA integrity_check").get()?.integrity_check;
      if (integrity !== "ok") {
        throw new Error(`SQLite integrity_check failed: ${String(integrity)}`);
      }

      stats = {
        ratedCount,
        arrowDuelRatingHash: `sha256:${adDigest.digest("hex")}`,
        arrowDuelRatingBuckets: adBucketRows.map((row) => ({
          minRating: Number(row.bucket_min),
          maxRating: Number(row.bucket_min) === 2100 ? 2200 : Number(row.bucket_min) + 99,
          puzzleCount: Number(row.count)
        })),
        integrityCheck: integrity
      };
    } finally {
      db.close();
    }

    const packFileBytes = (await stat(temporaryPackPath)).size;
    const packFileHash = `sha256:${await sha256File(temporaryPackPath)}`;
    const nextPackVersion =
      input.packVersion ??
      (Number.isSafeInteger(priorManifest.packVersion) && priorManifest.packVersion >= 1
        ? priorManifest.packVersion + 1
        : 6);

    const manifest = buildSqliteManifest(
      temporaryPackPath,
      {
        id: priorManifest.id,
        title: priorManifest.title,
        buildDate: input.buildDate ?? DEFAULT_BUILD_DATE,
        source: priorManifest.source,
        sourceLicense: priorManifest.sourceLicense,
        sourceSnapshotDate: priorManifest.sourceSnapshotDate,
        presolve: priorManifest.presolve,
        presolveDepth: priorManifest.presolveDepth,
        licenseNote: priorManifest.licenseNote,
        format: "sqlite",
        seed: priorManifest.seed,
        targetPuzzleCount: priorManifest.targetPuzzleCount,
        packVersion: nextPackVersion,
        packFileBytes,
        packFileHash,
        manifestHash: "pending"
      },
      {
        maxRating: input.maxRating ?? DEFAULT_MAX_RATING,
        knownArrowDuelCount: priorManifest.arrowDuelCount,
        knownMatePatternCounts: priorManifest.matePatternCounts,
        knownRatingBucketMatePatternCounts: new Map(
          (priorManifest.ratingBuckets ?? []).map((bucket) => [
            bucket.minRating,
            bucket.matePatternCounts ?? {}
          ])
        )
      }
    );

    manifest.arrowDuelRatingSource = {
      formula: sidecarIdentity.formula,
      model: sidecarIdentity.model,
      ratedCount: stats.ratedCount,
      ratingHash: stats.arrowDuelRatingHash
    };
    manifest.arrowDuelRatingBuckets = stats.arrowDuelRatingBuckets;
    manifest.manifestHash = `sha256:${sha256Text(stableJson({ ...manifest, manifestHash: "" }))}`;

    await writeFile(temporaryManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    if (existsSync(outputPackPath) && existsSync(outputManifestPath)) {
      await installArtifactPair({
        packPath: outputPackPath,
        manifestPath: outputManifestPath,
        temporaryPackPath,
        temporaryManifestPath,
        token,
        backupLabel: "ad-rating"
      });
    } else {
      await rename(temporaryPackPath, outputPackPath);
      await rename(temporaryManifestPath, outputManifestPath);
    }
    installed = true;

    return {
      beforePackFileBytes,
      packFileBytes,
      bytesAdded: packFileBytes - beforePackFileBytes,
      ratedCount: stats.ratedCount,
      packFileHash,
      manifestHash: manifest.manifestHash,
      arrowDuelRatingHash: stats.arrowDuelRatingHash,
      integrityCheck: stats.integrityCheck
    };
  } finally {
    if (!installed) {
      await rm(temporaryPackPath, { force: true });
      await rm(temporaryManifestPath, { force: true });
    }
  }
}

function parseArgs(argv) {
  const options = {
    pack: DEFAULT_PACK,
    manifest: DEFAULT_MANIFEST,
    ratingsDb: "",
    outputPack: "",
    outputManifest: "",
    buildDate: DEFAULT_BUILD_DATE,
    maxRating: DEFAULT_MAX_RATING,
    packVersion: undefined,
    skipInputHashCheck: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--pack") options.pack = argv[++i];
    else if (arg === "--manifest") options.manifest = argv[++i];
    else if (arg === "--ratings-db") options.ratingsDb = argv[++i];
    else if (arg === "--output-pack") options.outputPack = argv[++i];
    else if (arg === "--output-manifest") options.outputManifest = argv[++i];
    else if (arg === "--build-date") options.buildDate = argv[++i];
    else if (arg === "--max-rating") options.maxRating = Number(argv[++i]);
    else if (arg === "--pack-version") options.packVersion = Number(argv[++i]);
    else if (arg === "--skip-input-hash-check") options.skipInputHashCheck = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
