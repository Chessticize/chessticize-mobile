import { existsSync } from 'fs';
import { resolve } from 'path';
import { DatabaseSync } from 'node:sqlite';
import { MemoryStore } from '../../../packages/storage/src/memory-store.ts';
import { SQLitePuzzlePackSource } from '../../../packages/storage/src/sqlite-puzzle-pack-source.ts';
import type { SyncSqliteDatabase } from '../../../packages/storage/src/sync-sqlite-store.ts';
import type { PracticeService } from '../../../packages/storage/src/practice-service.ts';
import { MemoryTacticalProfileRepository } from '../../../packages/storage/src/tactical-profile-repository.ts';
import {
  composePackBackedMobilePracticeService,
  injectMateIn2FocusedRun,
} from '../src/platform/mobilePractice';

const corePackPath = resolve(__dirname, '../../../fixtures/puzzles/bundled-core-pack.sqlite');
const NOW = '2026-08-19T12:00:00.000Z';

// CI fetches the Core Pack (`pnpm fetch:core-pack`) before the Mobile JS job. A
// local checkout without it skips; CI must never skip silently.
const packAvailable = existsSync(corePackPath);
const describeWithPack = packAvailable || process.env.CI ? describe : describe.skip;

// Node's SQLite driver behind the same synchronous contract the app's device
// driver implements for the read-only Core Pack.
function nodePackDatabase(db: DatabaseSync): SyncSqliteDatabase {
  return {
    exec: (sql) => db.exec(sql),
    prepare: (sql) => {
      const statement = db.prepare(sql);
      return {
        run: (...params) => {
          statement.run(...(params as never[]));
        },
        get: (...params) => statement.get(...(params as never[])),
        all: (...params) => statement.all(...(params as never[])),
      };
    },
  };
}

function withPackBackedService<T>(run: (service: PracticeService) => T): T {
  const packDb = new DatabaseSync(corePackPath, { readOnly: true });
  const userStore = new MemoryStore();
  try {
    return run(
      composePackBackedMobilePracticeService(
        userStore,
        new SQLitePuzzlePackSource(nodePackDatabase(packDb), {
          arrowDuelEligibility: 'all',
        }),
        new MemoryTacticalProfileRepository(),
      ),
    );
  } finally {
    packDb.close();
  }
}

describeWithPack('Mate in 2 Focused Run fixture over the real Core Pack', () => {
  it('injects the Run into a fresh pack-backed service', () => {
    withPackBackedService((service) => {
      const focused = injectMateIn2FocusedRun(service, NOW);

      expect(focused.status).toBe('active');
      expect(focused.puzzles).toHaveLength(15);
      expect(focused.config.tacticalFocus?.themes).toContain('mateIn2');
    });
  });

  it('injects the Run into a service that already holds real practice progress', () => {
    withPackBackedService((service) => {
      // Ordinary practice seeds the puzzles it serves into the local progress
      // store, which must not narrow the fixture's pack-wide candidate scope.
      service.startSprint(
        { mode: 'standard', minRating: 850, maxRating: 1_000, targetCorrect: 5, maxMistakes: 5 },
        '2026-08-01T10:00:00.000Z',
      );
      service.abandonSprint('2026-08-01T10:01:00.000Z');

      const focused = injectMateIn2FocusedRun(service, NOW);

      expect(focused.status).toBe('active');
      expect(focused.puzzles).toHaveLength(15);
    });
  });
});
