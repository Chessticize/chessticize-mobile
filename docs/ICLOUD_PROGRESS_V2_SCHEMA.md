# iCloud Progress V2 schema contract

This document is the auditable CloudKit schema contract for incremental iCloud
progress synchronization. The application constants and native adapter must
remain aligned with this contract.

## Containers and environments

| App identity | Container | Environment used by the app |
| --- | --- | --- |
| `Chessticize Dev` | `iCloud.com.chessticize.mobile.dev` | Development |
| `Chessticize` | `iCloud.com.chessticize.mobile` | Production |

The additive record schema below was verified in the Development environment
of the Dev container and deployed to the Production environment of the
production container on 2026-08-09. This does not seal the V1 bridge; sealing
is a separate 1.4.2 release decision.

## Private custom zone

- Zone name: `ProgressV2`
- Database scope: private database only
- Provisioning: created or fetched idempotently by the client at runtime
- Console setup: none; a user's private custom zone is not created manually

## Record type

Record type: `ProgressV2Record`

| Field | CloudKit type | Required by the application | Queryable index |
| --- | --- | --- | --- |
| `kind` | String | Yes | None |
| `schemaVersion` | Int64 | Yes | None |
| `payload` | Bytes | Yes | None |

No custom field is indexed. Incremental reads use custom-zone change tokens
through `CKFetchRecordZoneChangesOperation`; they do not query these fields.
Writes address deterministic record IDs directly.

## Deterministic record identity

Every record name is:

```text
v2|<kind>|<percent-encoded entity key>
```

Supported `kind` values are:

- `attempt`
- `manifest`
- `practice_run`
- `preferences`
- `rating`
- `review_schedule`
- `sprint_session`

The fixed migration marker is `v2|manifest|default`. The fixed synced-settings
record is `v2|preferences|default`. Rating entity keys include the rating key
and reset generation so every historical reset anchor remains retained.

## Payload contract

`payload` contains UTF-8 JSON encoded as CloudKit Bytes. Each envelope carries
`formatVersion: 2`, repeats its `kind` and entity key, and represents either the
current domain value or an explicit tombstone. The manifest envelope records
the migration phase (`bridging` or `sealed`), minimum writer format, and the
last V1 import metadata. Opaque per-device zone change tokens remain in local
SQLite and are never stored in the manifest.

The preferences envelope contains only intentionally synced settings:
notification/reminder preferences and move-feedback preferences. It excludes
device-local state, including `iCloudEnabled` and Sprint guide progress.

The native adapter must reject records whose CloudKit record type, record name,
field types, declared schema version, or decoded payload identity does not match
this contract.

## 1.4.2 seal policy

Version 1.4.2 sets the app release phase to `sealed`. Every sync trigger first
reads V2 changes, advances `SyncManifest/default` to `sealed` when needed, and
then continues with V2 only. Startup, background, enable, and manual sync never
request V1 metadata or its payload. Support diagnostics also use the active
release phase, so a fresh 1.4.2 install or a device with Sync Off does not read
V1 before its local marker has been persisted.

The transition is monotonic: an observed or locally persisted `sealed` phase
cannot return to `bridging`, and a later V1 write cannot modify V2. The legacy
V1 record is retained unchanged as an archive. A new device restores retained
history entirely from the V2 custom zone.

## Deployment checklist

Before distributing any future writer that changes this contract:

1. Add fields or record types in the appropriate Development environment.
2. Exercise the signed Dev app against its Development container.
3. Review field types and add indexes only for actual CloudKit queries.
4. Deploy the additive production-container schema to Production.
5. Verify the exact app head against the deployed schema before release.

CloudKit schema deployment is additive and distinct from changing the manifest
phase. A late V1 writer remains importable during `bridging`; after the approved
1.4.2 gate advances the manifest to `sealed`, clients must not query V1.

## Private custom zone: `GamesV1` (2.0 Game Review, Play with Maia & 2.0 Settings)

Chessticize 2.0 adds a second private custom zone named `GamesV1` in the same
iCloud container. It reuses the existing deployed `ProgressV2Record` record type
(`kind: String`, `schemaVersion: Int64 = 2`, `payload: Bytes`) without adding
any new CloudKit record types, fields, or indexes — zero CloudKit Dashboard
schema changes are required.

Keeping 2.0 records in `GamesV1` guarantees 100% backward compatibility with
shipped 1.4.2 clients, which strictly validate every `ProgressV2` record kind
and write `v2|preferences|default` with only 1.4.2 settings fields.

Every record name in `GamesV1` is:

```text
g1|<kind>|<percent-encoded entity key>
```

Supported `kind` values in `GamesV1` are:

- `linked_account` (`<platform>:<lowercased-username>`) — monotonic merge keeping earliest `createdAt` and latest `lastSyncedAt`
- `imported_game` (`<deterministic gameId>`) — includes `plyEvals`; monotonic merge (`complete > pass1_done > partial > none`, deeper/more evals win) so two devices independently downloading or analyzing the same game never conflict or regress
- `user_puzzle` (`<ug_<id>>`) — deterministic merge preferring higher `ratingSource` provenance (`maia2_sf_v1 > sf_heuristic_v1 > game_anchor`)
- `ug_attempt`, `ug_review_schedule`, `ug_rating` — user-game puzzle attempts, review schedules/removals, and ratings (kept out of `ProgressV2` so 1.4.2 clients never encounter unknown `ug_*` puzzle IDs)
- `maia_rated_game` (`<gameId>`) & `maia_rating_anchor` (`<timeClass>`) — append-only rated game ledger and earliest initial-rating anchor; each device deterministically replays all rated games in `(playedAt, gameId)` order so Play with Maia ratings converge identically regardless of multi-device sync order
- `games_preferences` (`default`) — 2.0 synced settings (`arrowDuel.opponentReplyEnabled`, `appearance`, `lightBoardTheme`, `darkBoardTheme`, `pieceSet`, `gameReview.autoAddRecommendedToReview`, `gameReview.autoSyncCooldownMinutes`, and `maiaSetup`); device-local settings (`sync.iCloudEnabled`, `language`, `whatsNewSeenVersion`) remain local

Deletions of `linked_account`, `imported_game`, and `user_puzzle` are represented
as explicit tombstones (`state: "deleted"`, `deletedAt`) so deletes propagate
reliably across devices without resurrecting stale copies, while deleting an
imported Maia game from the Games library never deletes its `maia_rated_game`
ledger entry.
