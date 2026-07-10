import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const fixtureDirectory = dirname(fileURLToPath(import.meta.url));
const outputPath = join(fixtureDirectory, "schema-v0-ios-1.0.0.sqlite");

rmSync(outputPath, { force: true });
const db = new DatabaseSync(outputPath);

try {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE app_settings (
      id TEXT PRIMARY KEY,
      sync_icloud_enabled INTEGER NOT NULL,
      sync_upload_allowed INTEGER NOT NULL,
      review_reminder_mode TEXT NOT NULL,
      review_reminder_fixed_local_time TEXT
    );

    CREATE TABLE puzzles (
      id TEXT PRIMARY KEY,
      initial_fen TEXT NOT NULL,
      moves_json TEXT NOT NULL,
      rating INTEGER NOT NULL,
      rating_deviation INTEGER,
      popularity INTEGER,
      nb_plays INTEGER,
      themes_json TEXT NOT NULL,
      game_url TEXT,
      opening_tags_json TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL,
      stockfish_eval REAL,
      stockfish_bestmove TEXT,
      stockfish_eval_after_first_move REAL
    );

    CREATE TABLE ratings (
      key TEXT NOT NULL,
      generation INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      games INTEGER NOT NULL,
      PRIMARY KEY (key, generation)
    );

    CREATE TABLE sprint_sessions (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      rating_key TEXT NOT NULL,
      config_json TEXT NOT NULL,
      started_at TEXT NOT NULL,
      deadline_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL,
      end_reason TEXT,
      correct_count INTEGER NOT NULL,
      mistake_count INTEGER NOT NULL,
      rating_before INTEGER NOT NULL,
      rating_after INTEGER
    );

    CREATE TABLE attempts (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'sprint',
      session_id TEXT NOT NULL,
      puzzle_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      rating_key TEXT,
      result TEXT NOT NULL,
      submitted_move TEXT NOT NULL,
      expected_move TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      rating_before INTEGER NOT NULL,
      rating_after INTEGER,
      arrow_duel_candidate_order_json TEXT,
      FOREIGN KEY (session_id) REFERENCES sprint_sessions(id),
      FOREIGN KEY (puzzle_id) REFERENCES puzzles(id)
    );

    CREATE INDEX attempts_completed_at_idx ON attempts(completed_at);
    CREATE INDEX attempts_result_idx ON attempts(result);
    CREATE INDEX attempts_mode_idx ON attempts(mode);
    CREATE INDEX attempts_session_id_idx ON attempts(session_id);
    CREATE INDEX sprint_sessions_rating_key_completed_at_idx ON sprint_sessions(rating_key, completed_at);

    CREATE TABLE custom_sprint_configs (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      rating_key TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL,
      per_puzzle_seconds INTEGER NOT NULL,
      target_correct INTEGER NOT NULL,
      max_mistakes INTEGER NOT NULL,
      theme TEXT,
      last_started_at TEXT NOT NULL,
      play_count INTEGER NOT NULL
    );

    CREATE INDEX custom_sprint_configs_last_started_at_idx ON custom_sprint_configs(last_started_at);

    CREATE TABLE review_queue (
      puzzle_id TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'standard',
      rating_key TEXT NOT NULL DEFAULT 'standard 5/20',
      due_at TEXT NOT NULL,
      interval_hours INTEGER NOT NULL,
      review_count INTEGER NOT NULL,
      success_streak INTEGER NOT NULL,
      lapse_count INTEGER NOT NULL,
      last_result TEXT NOT NULL,
      last_reviewed_at TEXT NOT NULL,
      PRIMARY KEY (puzzle_id, mode, rating_key),
      FOREIGN KEY (puzzle_id) REFERENCES puzzles(id)
    );

    CREATE INDEX review_queue_due_at_idx ON review_queue(due_at);

    CREATE TABLE review_events (
      id TEXT PRIMARY KEY,
      puzzle_id TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'standard',
      rating_key TEXT NOT NULL DEFAULT 'standard 5/20',
      result TEXT NOT NULL,
      reviewed_at TEXT NOT NULL,
      next_due_at TEXT NOT NULL,
      interval_hours INTEGER NOT NULL,
      FOREIGN KEY (puzzle_id) REFERENCES puzzles(id)
    );

    CREATE INDEX review_events_puzzle_id_idx ON review_events(puzzle_id);
    CREATE INDEX review_events_reviewed_at_idx ON review_events(reviewed_at);
  `);

  db.prepare(`
    INSERT INTO app_settings (
      id,
      sync_icloud_enabled,
      sync_upload_allowed,
      review_reminder_mode,
      review_reminder_fixed_local_time
    ) VALUES ('default', 1, 0, 'fixed', '20:30')
  `).run();

  const insertPuzzle = db.prepare(`
    INSERT INTO puzzles (
      id,
      initial_fen,
      moves_json,
      rating,
      rating_deviation,
      popularity,
      nb_plays,
      themes_json,
      game_url,
      opening_tags_json,
      source,
      stockfish_eval,
      stockfish_bestmove,
      stockfish_eval_after_first_move
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const puzzles = [
    [
      "legacy-standard",
      "r1bqk2r/pp1nbNp1/2p1p2p/8/2BP4/1PN3P1/P3QP1P/3R1RK1 b kq - 0 19",
      JSON.stringify(["e8f7", "e2e6", "f7f8", "e6f7"]),
      1485,
      76,
      91,
      603,
      JSON.stringify(["mate", "mateIn2", "middlegame", "short"]),
      null,
      JSON.stringify(["Horwitz_Defense"]),
      "migration-fixture",
      655,
      "d8a5",
      10000
    ],
    [
      "legacy-arrow",
      "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24",
      JSON.stringify(["f2g3", "e6e7", "b2b1", "b3c1", "b1c1", "h6c1"]),
      1798,
      77,
      95,
      8020,
      JSON.stringify(["crushing", "hangingPiece", "long", "middlegame"]),
      null,
      "[]",
      "migration-fixture",
      -453,
      "b2b1",
      693
    ],
    [
      "legacy-endgame",
      "2kr3r/pp3p2/4p2p/1N1p2p1/3Q4/1P1P4/2q2PPP/5RK1 b - - 1 20",
      JSON.stringify(["b7b6", "d4a1", "a7a5", "f1c1"]),
      1650,
      90,
      80,
      1200,
      JSON.stringify(["endgame", "pin", "short"]),
      null,
      "[]",
      "migration-fixture",
      -231,
      "c8d7",
      333
    ],
    [
      "legacy-custom",
      "2r3k1/2r4p/4p1p1/1p1q1pP1/p1bP1P1Q/P6R/5B2/2R3K1 b - - 5 34",
      JSON.stringify(["c4e2", "h4h7", "c7h7", "c1c8", "g8g7", "c8c7"]),
      1801,
      76,
      88,
      616,
      JSON.stringify(["deflection", "kingsideAttack", "middlegame"]),
      null,
      "[]",
      "migration-fixture",
      -332,
      "d5b7",
      456
    ]
  ];
  for (const puzzle of puzzles) {
    insertPuzzle.run(...puzzle);
  }

  const insertRating = db.prepare(
    "INSERT INTO ratings (key, generation, rating, games) VALUES (?, ?, ?, ?)"
  );
  for (const rating of [
    ["standard 5/20", 0, 680, 1],
    ["standard 5/20", 1, 710, 2],
    ["arrow duel 5/30", 0, 740, 1],
    ["hangingPiece custom 5/20", 0, 805, 2],
    ["endgame custom 10/30", 0, 900, 0]
  ]) {
    insertRating.run(...rating);
  }

  const configs = {
    standard: JSON.stringify({
      mode: "standard",
      ratingKey: "standard 5/20",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 5,
      maxMistakes: 3
    }),
    arrow: JSON.stringify({
      mode: "arrow_duel",
      ratingKey: "arrow duel 5/30",
      durationSeconds: 300,
      perPuzzleSeconds: 30,
      targetCorrect: 5,
      maxMistakes: 3
    }),
    hangingPiece: JSON.stringify({
      mode: "custom",
      ratingKey: "hangingPiece custom 5/20",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 5,
      maxMistakes: 3,
      theme: "hangingPiece"
    }),
    endgame: JSON.stringify({
      mode: "custom",
      ratingKey: "endgame custom 10/30",
      durationSeconds: 600,
      perPuzzleSeconds: 30,
      targetCorrect: 10,
      maxMistakes: 2,
      theme: "endgame"
    }),
    review: JSON.stringify({
      source: "scheduled_review",
      mode: "standard",
      ratingKey: "standard 5/20"
    })
  };
  const insertSession = db.prepare(`
    INSERT INTO sprint_sessions (
      id,
      mode,
      rating_key,
      config_json,
      started_at,
      deadline_at,
      completed_at,
      status,
      end_reason,
      correct_count,
      mistake_count,
      rating_before,
      rating_after
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const session of [
    ["legacy-standard-old", "standard", "standard 5/20", configs.standard, "2026-05-01T12:00:00.000Z", "2026-05-01T12:05:00.000Z", "2026-05-01T12:03:00.000Z", "won", "target_reached", 5, 1, 650, 680],
    ["legacy-standard-latest", "standard", "standard 5/20", configs.standard, "2026-06-01T12:00:00.000Z", "2026-06-01T12:05:00.000Z", "2026-06-01T12:04:00.000Z", "won", "target_reached", 5, 1, 680, 710],
    ["legacy-arrow-failed", "arrow_duel", "arrow duel 5/30", configs.arrow, "2026-06-02T12:00:00.000Z", "2026-06-02T12:05:00.000Z", "2026-06-02T12:02:00.000Z", "failed", "max_mistakes", 1, 3, 760, 740],
    ["legacy-custom-won-a", "custom", "hangingPiece custom 5/20", configs.hangingPiece, "2026-06-03T12:00:00.000Z", "2026-06-03T12:05:00.000Z", "2026-06-03T12:04:00.000Z", "won", "target_reached", 5, 1, 780, 795],
    ["legacy-custom-won-b", "custom", "hangingPiece custom 5/20", configs.hangingPiece, "2026-06-04T12:00:00.000Z", "2026-06-04T12:05:00.000Z", "2026-06-04T12:04:00.000Z", "won", "target_reached", 5, 1, 795, 805],
    ["legacy-custom-abandoned", "custom", "endgame custom 10/30", configs.endgame, "2026-06-05T12:00:00.000Z", "2026-06-05T12:10:00.000Z", "2026-06-05T12:00:10.000Z", "abandoned", "abandoned", 0, 0, 900, null],
    ["legacy-custom-paused", "custom", "endgame custom 10/30", configs.endgame, "2026-06-06T12:00:00.000Z", "2026-06-06T12:10:00.000Z", null, "paused", null, 2, 0, 900, null],
    ["legacy-standard-active", "standard", "standard 5/20", configs.standard, "2026-06-07T12:00:00.000Z", "2026-06-07T12:05:00.000Z", null, "active", null, 1, 0, 710, null],
    ["legacy-review", "standard", "standard 5/20", configs.review, "2026-06-08T12:00:00.000Z", "2026-06-08T12:00:05.000Z", "2026-06-08T12:00:05.000Z", "won", "target_reached", 1, 0, 710, null]
  ]) {
    insertSession.run(...session);
  }

  const insertAttempt = db.prepare(`
    INSERT INTO attempts (
      id,
      source,
      session_id,
      puzzle_id,
      mode,
      rating_key,
      result,
      submitted_move,
      expected_move,
      started_at,
      completed_at,
      rating_before,
      rating_after,
      arrow_duel_candidate_order_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const attempt of [
    ["legacy-attempt-standard-correct", "sprint", "legacy-standard-latest", "legacy-standard", "standard", "standard 5/20", "correct", "e2e6", "e2e6", "2026-06-01T12:00:00.000Z", "2026-06-01T12:00:05.000Z", 680, null, null],
    ["legacy-attempt-standard-wrong", "sprint", "legacy-standard-latest", "legacy-arrow", "standard", "standard 5/20", "wrong", "f2f3", "b2b1", "2026-06-01T12:01:00.000Z", "2026-06-01T12:01:05.000Z", 680, null, null],
    ["legacy-attempt-arrow-wrong", "sprint", "legacy-arrow-failed", "legacy-arrow", "arrow_duel", "arrow duel 5/30", "wrong", "f2g3", "b2b1", "2026-06-02T12:00:00.000Z", "2026-06-02T12:00:05.000Z", 760, null, JSON.stringify(["b2b1", "f2g3", "h6c1"])],
    ["legacy-attempt-custom-correct", "sprint", "legacy-custom-won-a", "legacy-custom", "custom", "hangingPiece custom 5/20", "correct", "d5b7", "d5b7", "2026-06-03T12:00:00.000Z", "2026-06-03T12:00:05.000Z", 780, null, null],
    ["legacy-attempt-custom-wrong", "sprint", "legacy-custom-won-b", "legacy-endgame", "custom", "hangingPiece custom 5/20", "wrong", "c8c7", "c8d7", "2026-06-04T12:00:00.000Z", "2026-06-04T12:00:05.000Z", 795, null, null],
    ["legacy-attempt-review-correct", "scheduled_review", "legacy-review", "legacy-standard", "standard", "standard 5/20", "correct", "e2e6", "e2e6", "2026-06-08T12:00:00.000Z", "2026-06-08T12:00:05.000Z", 710, null, null]
  ]) {
    insertAttempt.run(...attempt);
  }

  const insertCustomConfig = db.prepare(`
    INSERT INTO custom_sprint_configs (
      id,
      mode,
      rating_key,
      duration_seconds,
      per_puzzle_seconds,
      target_correct,
      max_mistakes,
      theme,
      last_started_at,
      play_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertCustomConfig.run("legacy-custom-hanging", "custom", "hangingPiece custom 5/20", 300, 20, 5, 3, "hangingPiece", "2026-06-04T12:00:00.000Z", 3);
  insertCustomConfig.run("legacy-custom-endgame", "custom", "endgame custom 10/30", 600, 30, 10, 2, "endgame", "2026-06-06T12:00:00.000Z", 1);

  const insertReviewQueue = db.prepare(`
    INSERT INTO review_queue (
      puzzle_id,
      mode,
      rating_key,
      due_at,
      interval_hours,
      review_count,
      success_streak,
      lapse_count,
      last_result,
      last_reviewed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertReviewQueue.run("legacy-arrow", "standard", "standard 5/20", "2026-06-10T12:00:00.000Z", 24, 1, 0, 1, "wrong", "2026-06-09T12:00:00.000Z");
  insertReviewQueue.run("legacy-arrow", "arrow_duel", "arrow duel 5/30", "2026-06-11T12:00:00.000Z", 72, 2, 2, 0, "correct", "2026-06-08T12:00:00.000Z");

  const insertReviewEvent = db.prepare(`
    INSERT INTO review_events (
      id,
      puzzle_id,
      mode,
      rating_key,
      result,
      reviewed_at,
      next_due_at,
      interval_hours
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertReviewEvent.run("legacy-review-event-standard", "legacy-arrow", "standard", "standard 5/20", "wrong", "2026-06-09T12:00:00.000Z", "2026-06-10T12:00:00.000Z", 24);
  insertReviewEvent.run("legacy-review-event-arrow", "legacy-arrow", "arrow_duel", "arrow duel 5/30", "correct", "2026-06-08T12:00:00.000Z", "2026-06-11T12:00:00.000Z", 72);

  const integrity = db.prepare("PRAGMA integrity_check").get();
  const foreignKeyViolations = db.prepare("PRAGMA foreign_key_check").all();
  const version = db.prepare("PRAGMA user_version").get();
  if (integrity.integrity_check !== "ok" || foreignKeyViolations.length !== 0 || version.user_version !== 0) {
    throw new Error("Generated migration fixture failed validation");
  }
} finally {
  db.close();
}

console.log(outputPath);
