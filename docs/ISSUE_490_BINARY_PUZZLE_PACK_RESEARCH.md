# Issue #490 Binary Puzzle-Pack Encoding Research

Status date: 2026-08-03

## Scope and status

[Issue #490](https://github.com/Chessticize/chessticize-mobile/issues/490)
asks whether lossless binary encodings for puzzle positions and UCI moves would
materially reduce download, installed, and post-launch size.

This report includes the format landscape, a full 1,400,000-row purpose-built
binary prototype, matched Android and iOS package/install/runtime measurements,
and the resulting decision. The prototype generator, dual-format reader, and
test-only iOS launch adapter were kept in the ignored `scratch/` workspace or
temporarily patched for measurement and then removed. The repository's
production schema, generator, reader, manifest, packaged fixture, and native
launch behavior were unchanged at the pinned research commit.

Research source commit: `eeb9e359e72b035d34e22039d025de95f6aab9db`.

This is a historical research record. Production adoption was subsequently
delivered separately in PR #494; neither that implementation nor its release
artifact is part of this documentation-only PR.

## Pinned research baseline

The release baseline is not JSON. The app ships a generated, read-only SQLite
database. Its `puzzles` table stores `initial_fen`, `solution_moves`, and
`stockfish_bestmove` as `TEXT`
([generator schema](https://github.com/Chessticize/chessticize-mobile/blob/eeb9e359e72b035d34e22039d025de95f6aab9db/scripts/generate-offline-puzzle-fixture.mjs)). The JSON
pack is retained only as a small development/test compatibility fixture and is
not the release-default puzzle source
([fixture documentation](https://github.com/Chessticize/chessticize-mobile/blob/eeb9e359e72b035d34e22039d025de95f6aab9db/fixtures/puzzles/README.md)).

The current `core-pack-v4` manifest records 1,400,000 puzzles, a raw SQLite
size of 227,487,744 bytes, and SHA-256
`74a81e54729dd1f4f9adee375c728e22ac758d3211e2da81d3b5bd702380083b`
([manifest](https://github.com/Chessticize/chessticize-mobile/blob/eeb9e359e72b035d34e22039d025de95f6aab9db/fixtures/puzzles/bundled-core-pack.manifest.json)). The existing
pack report records a ZIP level-9 proxy of 111,379,967 bytes, 51% below the raw
database, while explicitly warning that this is not a signed APK/IPA
measurement
([sampling report](https://github.com/Chessticize/chessticize-mobile/blob/eeb9e359e72b035d34e22039d025de95f6aab9db/docs/PUZZLE_PACK_SAMPLING.md#theme-index-optimization-release-2026-07-30)).

The issue's current page-level reconstruction estimates that replacing both
position and move text with the proposed binary forms could reduce the raw
database from 216.95 MiB to 156.55 MiB, a 60.39 MiB or 27.84% raw saving. That
is evidence that a full prototype is warranted, not evidence of the final
download saving: the current text-bearing database already compresses
substantially.

The matched simulator/emulator runs established the effective delivery
behavior on both platforms: the pack exists in the installed application and
is copied into the app data container on first launch. This follows the
platform adapter's bundled-database opening path in
[`DeviceSQLiteStore`](https://github.com/Chessticize/chessticize-mobile/blob/eeb9e359e72b035d34e22039d025de95f6aab9db/apps/mobile/src/platform/deviceSQLiteStore.ts). A raw
pack reduction therefore applies twice after first launch on both measured
platforms: once in the installed app and once in app data. Packaging
compression changes the installed-app contribution on Android, while the iOS
simulator `.app` stores the raw SQLite resource.

## Container decision: retain SQLite

The research question is a row-codec decision inside SQLite, not a reason to
replace SQLite itself. SQLite currently supplies the indexed rating/theme
selection and independent row hydration that Practice uses. SQLite documents
that `TEXT` is stored in the database text encoding, while a `BLOB` is stored
exactly as supplied
([SQLite datatypes](https://www.sqlite.org/datatype3.html)). Its record format
uses the same length-derived serial-type mechanism for strings and blobs, so
the useful raw saving comes from shortening the value payload, not merely from
changing a column declaration from `TEXT` to `BLOB`
([SQLite record format](https://www.sqlite.org/fileformat.html#record_format)).

The current React Native adapter can support that boundary without a new
native storage module. OP-SQLite's official API accepts `ArrayBuffer` and typed
arrays for BLOB values and returns data that can be viewed as `Uint8Array`
([OP-SQLite BLOB support](https://op-engineering.github.io/op-sqlite/docs/api/#blob-support)).
The app currently pins React Native 0.86.0 and OP-SQLite 17.1.1
([mobile dependencies](https://github.com/Chessticize/chessticize-mobile/blob/eeb9e359e72b035d34e22039d025de95f6aab9db/apps/mobile/package.json)).

Replacing the database with a single MessagePack, CBOR, Protobuf, or
FlatBuffers file would require rebuilding the rating/theme indexes, random
selection queries, and independent hydration contract. No primary-source
format feature offsets that application complexity for this issue. The
comparison below therefore treats the general formats as possible encodings
for one or more SQLite `BLOB` columns.

## Candidate comparison

| Candidate                            | Compact representation available                                                                                        | Versioning and validation                                                                                                                               | TypeScript / React Native cost                                                                                                                    | Fit for this pack                                                                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose-built position and UCI BLOBs | Exactly the domain bits; no generic field tags, keys, offsets, or per-value type markers                                | Application must define byte order, reserved bits, codec version, length rules, and semantic validation                                                 | A small `Uint8Array`/`DataView` codec; no serialization dependency                                                                                | **Best primary prototype** because the fields and value ranges are closed and already specified                                           |
| Protocol Buffers                     | Field names are replaced by numbered keys; `bytes` fields and packed repeated scalar fields are available               | Requires a shared `.proto`; unknown fields can be skipped, but application invariants still need validation                                             | Schema/code generation plus a JS runtime and generated reader                                                                                     | **Best standardized runner-up**, but a Protobuf envelope around already-packed position/move bytes adds tags and lengths                  |
| MessagePack                          | Compact scalar, array, map, string, and binary families; positional arrays avoid repeated map keys                      | Schema-free; application still owns the profile and version; official JS library notes that the living specification has no overall version             | Official TypeScript library reads/writes `Uint8Array`; its support matrix covers browsers and ES2015+ engines, not React Native/Hermes explicitly | Plausible for a microbenchmark; generic integer arrays or maps are unlikely to beat fixed 16-bit moves and a dedicated position bitstream |
| CBOR                                 | Compact integers, arrays, maps, and native byte strings; integer keys and deterministic encoding profiles are available | RFC defines well-formedness and deterministic restrictions; application semantics and codec version remain separate                                     | Multiple JS libraries exist, but an exact library and Hermes compatibility would need validation                                                  | Plausible for a microbenchmark; wrapping the custom bytes adds a byte-string header without adding needed pack behavior                   |
| FlatBuffers                          | Typed fixed-width scalars and direct access without unpacking                                                           | Schema evolution is built in, but the format intentionally does not identify itself and different valid construction orders can produce different bytes | Requires `flatc`, generated TypeScript, and the runtime                                                                                           | Poor per-row size fit: every row buffer needs root/table/vtable/offset structure; a whole-pack buffer would conflict with SQLite indexing |

### Purpose-built BLOB profile

The representation already evaluated by the issue is the strongest size
candidate because its bit allocation matches the domain exactly:

- **Position:** 64 occupancy bits, four bits per occupied piece, and 16 state
  bits for side to move, castling rights, and en-passant square. Occupancy
  supplies the number of piece nibbles, so a position is independently
  decodable without a per-position length field. The resulting payload is
  10 bytes plus `ceil(occupiedPieceCount / 2)`, up to 26 bytes for 32 pieces.
- **Move:** six bits for the source square, six bits for the destination
  square, and enough promotion bits for no promotion, queen, rook, bishop,
  and knight fit in 16 bits. Castling and en passant need no special wire
  cases because UCI represents them by the king or pawn's source and
  destination squares. Underpromotion uses the promotion code.
- **Solution line:** when the solution is its own SQLite BLOB, the BLOB byte
  length supplies the move count. A valid payload has even length, so long
  lines do not need a sentinel or a fixed maximum. `stockfish_bestmove` is an
  independently decodable two-byte move.

The format description must choose one byte order and reserve every unused bit
as zero. The decoder must reject an invalid byte length, nonzero reserved bits,
an impossible piece count or piece code, invalid side/castling/en-passant
state, invalid square or promotion code, and any position that fails the
existing domain validation. SQLite's `integrity_check` verifies low-level page,
record, table, index, and constraint consistency; it does not establish the
chess semantics of an otherwise well-formed BLOB
([SQLite `integrity_check`](https://www.sqlite.org/pragma.html#pragma_integrity_check)).

The current pack stores compact FEN's first four fields. The reader restores
the omitted halfmove and fullmove fields as `0 1`
([current reader](https://github.com/Chessticize/chessticize-mobile/blob/eeb9e359e72b035d34e22039d025de95f6aab9db/packages/storage/src/sqlite-puzzle-pack-source.ts)). The
round-trip oracle should therefore be equality to the current canonical domain
position, not byte equality to a six-field source FEN that the release pack
does not preserve today.

### MessagePack

MessagePack is a schema-free, JSON-like binary format. Its official
specification assigns distinct encodings to integers, strings, binary values,
arrays, maps, and extensions
([MessagePack specification](https://github.com/msgpack/msgpack/blob/master/spec.md)).
For this domain, the compact use would be a positional array containing binary
position and packed-move byte strings. A map would repeat keys in every row. A
generic array of move integers also loses the fixed two-byte guarantee:
MessagePack integers may require a type marker plus their value bytes, while a
binary value preserves the bespoke representation but adds its own length
header.

The official `@msgpack/msgpack` implementation is written in TypeScript,
returns `Uint8Array`, and targets browsers, Node, and other ES2015+ engines
([official JavaScript implementation](https://github.com/msgpack/msgpack-javascript)).
Its documentation does not list React Native or Hermes in the test matrix, so
a dependency spike would still need a release-Hermes smoke test. MessagePack
does not remove the need for an application codec version or semantic
validation.

### CBOR

CBOR is an IETF standard whose objectives include small code size, reasonably
small messages, schema-free operation, and native binary byte strings
([RFC 8949](https://www.rfc-editor.org/rfc/rfc8949.html)). Values below 24 can
fit with their major type in one byte, and the RFC recommends integer keys for
compact repeated maps. The RFC also defines preferred serialization and core
deterministic encoding restrictions: shortest encodings, definite lengths,
and a defined map-key order.

Those properties make CBOR a sound interchange format but do not create a
size advantage over the purpose-built profile. A CBOR byte string around the
position or UCI bytes adds a length prefix. Encoding moves as CBOR integers can
use more than two bytes for values above 255. An array or map adds further
structure. CBOR's well-formedness rules allow a decoder to reject malformed
CBOR, but the application must still reject semantically invalid chess data
and unsupported codec versions.

### Protocol Buffers

Protocol Buffers is the strongest standardized alternative because a schema
replaces field names with field numbers and gives the generated reader a typed
contract. The official wire-format guide describes each record as a field
number plus a wire type and payload. Strings, raw bytes, embedded messages,
and packed repeated fields use the length-delimited wire type; integer fields
use varints
([Protobuf encoding guide](https://protobuf.dev/programming-guides/encoding/)).

A reasonable message would still put the dedicated position and UCI encodings
in `bytes` fields. Each present short field then adds a tag and length in
addition to the packed bytes. Representing the 16-bit moves as generic
`uint32` varints makes size value-dependent; `fixed32` spends four bytes per
move. Protocol Buffers therefore provides a better schema-evolution story than
the bespoke BLOB, not a likely raw-size win over it.

The format also adds a `.proto` source, a pinned compiler/generator, generated
TypeScript, and a runtime to the application and generator toolchains. The
official overview treats the schema language, generated code, runtime
libraries, and serialization format as a combined system
([Protocol Buffers overview](https://protobuf.dev/overview/)). That complete
reader and bundle delta belongs in installed-size accounting. Protobuf should
remain the standardized fallback if future requirements demand several
independent language implementations or frequent compatible schema evolution.

### FlatBuffers

FlatBuffers is optimized for direct access to serialized data without first
unpacking it
([official project](https://github.com/google/flatbuffers)). It supports
TypeScript through `flatc`-generated classes and a runtime that reads a
`Uint8Array`
([TypeScript guide](https://flatbuffers.dev/languages/typescript/)).

That performance model is not the same as minimum bytes for tiny SQLite rows.
FlatBuffers uses fixed-width, aligned scalars rather than varints. A buffer
starts with a 32-bit root offset; tables add a vtable reference, vtable field
offsets, and 32-bit offsets to strings and vectors
([format internals](https://flatbuffers.dev/internals/)). The format also
intentionally leaves some object placement and field ordering flexible, so two
valid builders may produce different bytes, and it does not contain its own
format identifier. A per-row FlatBuffer would repeat that structure 1.4
million times. A single whole-pack FlatBuffer could amortize it, but would
replace the current SQLite query and index contract. FlatBuffers should not
advance to a platform prototype for this size-only issue unless a separate
requirement makes direct zero-copy access valuable.

## Outer compression changes the decision

Raw SQLite size, archive size, store download size, installed size, and
post-launch app data are different metrics. The raw saving cannot be applied as
a percentage to the download.

DEFLATE represents repeated byte strings with backward length/distance pairs
and Huffman-codes literals, lengths, and distances
([RFC 1951](https://www.rfc-editor.org/rfc/rfc1951.html)). Brotli also combines
LZ77-style copying with prefix coding and adds context modeling, including a
mode optimized for UTF-8 text
([RFC 7932](https://www.rfc-editor.org/rfc/rfc7932.html)). The current FEN and
UCI text repeats piece symbols, digits, spaces, square characters, and common
position fragments across the database. The custom binary form removes raw
bytes but also changes those repetition and symbol distributions. Which effect
wins after packaging is empirical.

Consequences for the prototype methodology:

1. Compare the complete current SQLite control and complete binary SQLite
   candidate. Do not use the small JSON compatibility fixture as the baseline.
2. Record raw bytes plus same-tool, same-level DEFLATE/gzip and Brotli proxies
   for both files. These proxies diagnose compressibility; they are not store
   download figures.
3. Inspect the actual SQLite entry in the IPA, AAB, universal APK, and
   device-targeted APK set. Android's AAPT2 exposes explicit no-compress
   controls, so compression must be observed rather than assumed
   ([AAPT2 options](https://developer.android.com/tools/aapt2)).
4. For Android, use `bundletool get-size total` on the same generated APK set;
   Android documents that command as the estimate of APK bytes served
   compressed over the wire
   ([bundletool size measurement](https://developer.android.com/tools/bundletool#measure_size)).
5. Keep App Store Connect and Google Play reports separately labelled as
   store-reported evidence. A local ZIP/IPA is not an authoritative
   over-the-air size.

Compressing the entire SQLite file with gzip or Brotli inside the application
is not the primary candidate. SQLite cannot query that compressed stream in
place, and Brotli explicitly does not provide random access. The app would need
to expand a second raw database before use, increasing first-launch work and
potentially retaining both compressed and expanded copies. Per-row compression
is also a poor default: it repeats stream metadata and prevents the outer
compressor from exploiting redundancy across rows. Both alternatives would
need separate installed/post-launch and performance justification.

## Prototype and matched measurements

### Exact prototype profile

The measured candidate retained every existing table, index, scalar value, and
row identifier. It replaced only the three text payloads with SQLite BLOBs and
added a one-row `pack_format` table containing format, position-codec, and
move-codec version `1`.

Position codec v1 is defined precisely as follows:

- Chess squares use `a1 = 0` through `h8 = 63`. Bytes 0-7 contain the 64-bit
  occupancy mask in little-endian order.
- Occupied squares are visited in increasing square order. Their pieces are
  encoded two per byte, low nibble first, with codes
  `P,N,B,R,Q,K,p,n,b,r,q,k = 1..12`. Code zero and codes 13-15 are invalid.
- Bytes 8-9 contain little-endian metadata: bit 0 is black-to-move; bits 1-4
  are `K,Q,k,q`; bits 5-11 are zero for no en-passant square or square index
  plus one; bits 12-15 are reserved zero.
- Payload length must be exactly `10 + ceil(popcount(occupancy) / 2)`. Unused
  high-nibble padding is zero.

Move codec v1 stores each UCI move as one little-endian 16-bit word: source
square in bits 0-5, destination in bits 6-11, and promotion
`none,q,r,b,n = 0..4` in bits 12-14. Bit 15 is reserved zero. A line's BLOB
length is its move count times two. Identical source/destination squares,
unknown promotion values, reserved bits, and odd lengths are invalid.

The research generator source was
`scratch/issue-490/generate-binary-pack.mjs`, SHA-256
`d95ce09f8ad4268151a02b8a7088ddc82b4dfd597dcab49bbfb1b44f1477855f`.
Its metrics output SHA-256 was
`a828e27a87c2af9a089806f3ac974a109fe6ff6010442d0b58719f1ecb428344`.
Both were intentionally ignored research artifacts; the normative profile
above, source commit, and input/output hashes are the durable audit identity.
The exact prototype source is not proposed as production code and is therefore
not a committed reproduction asset; an implementation must independently
encode the normative profile and reproduce the semantic and artifact results.

### Correctness and edge coverage

The generator decoded every value immediately after encoding, inserted the
BLOB, read it back from the completed/vacuumed database, and decoded it again.
A length-prefixed SHA-256 over all semantic columns, ordered by puzzle ID, was
identical at all three stages:
`148ffdd17a6e6d714799116ef39ec9d8373d8534e61df457f1dced7bf66df9d0`.

| Check | Result |
| --- | ---: |
| Source rows | 1,400,000 |
| Immediate round trips | 1,400,000 |
| Stored round trips | 1,400,000 |
| Black-to-move positions | 713,897 |
| Positions with castling rights | 157,374 |
| Positions with en-passant state | 1,253 |
| Promotion moves in solution lines | 52,090 |
| Promotion best moves | 1,574 |
| Longest solution | 24 moves / 122 text bytes / 48 BLOB bytes |
| Largest position BLOB | 26 bytes |
| `PRAGMA integrity_check` | `ok` |
| SQLite page size / freelist | 4,096 / 0 |

Mutation checks rejected a truncated position, nonzero reserved position bits,
an invalid piece code, an odd move length, a nonzero reserved move bit, and an
invalid promotion code. Version rejection and artifact-hash rejection remain
implementation requirements because the research reader was deliberately not
promoted to production.

The raw database result was:

| SQLite layer | TEXT | Binary | Saving |
| --- | ---: | ---: | ---: |
| Complete database | 227,487,744 | 164,163,584 | **63,324,160 bytes (60.39 MiB, 27.84%)** |
| `puzzles` b-tree bytes | 144,596,992 | 81,268,736 | 63,328,256 |
| `puzzles` payload bytes | 133,774,957 | 71,956,279 | 61,818,678 |

The remaining tables and indexes were unchanged apart from the candidate's
4,096-byte `pack_format` table.

### Build and artifact identity

All matched builds used source commit
`eeb9e359e72b035d34e22039d025de95f6aab9db`, Node `v22.22.3`, pnpm `11.1.2`,
Java `21.0.10`, Xcode `26.5 (17F42)`, and iOS SDK 26.5. The temporary reader
accepted either the production TEXT columns or codec-v1 BLOBs; it was removed
after measurement. The TEXT and binary builds on each platform contained
byte-identical JavaScript bundles.

| Artifact | TEXT SHA-256 | Binary SHA-256 |
| --- | --- | --- |
| SQLite pack | `74a81e54729dd1f4f9adee375c728e22ac758d3211e2da81d3b5bd702380083b` | `72b36fe4bc3722b0e3cc8c0e41651d767765cebf28b6517a708832263facc99b` |
| Android Hermes bundle | `34e39eaf80c4511c017f7e214a5bded2fee03576665a1312147a4abaf4282a7a` | same |
| Android E2E AAB | `82c45b82e8a2e0f7c29162563bc2dbee72dddd4335fe226d1807d8c6e408bbfd` | `393bb39707924375318ec33a69df6f97e1c9f7f05e84c8c013fa6d6888176518` |
| Android E2E APK | `cf18ac9a4765bbc82eb57d29d48713decfd063bd4a333bc8f94e4966aec62f80` | `0825e510271187293e272e54adf7e1013c027bf8303f6dfc732cdf1c3f43f2ae` |
| Android device-targetable APK-set archive | `3172f718173af60f6638326d8375c7029908ec3a4d0af785cf1bbd0a21c8d6c7` | `27c9fc48ca054df285e36ada18c062f55f04c6f888cfc75f27a3734e37bf24a6` |
| Android universal APK-set archive | `d25d32bac5c9059dbd576f522e4925a5a8bf1881b0d07b4c081283efd720913a` | `a33a0c80f8c3bb348aed93fc8552964cb0072169956c4d54425ee3c1a058d2f3` |
| iOS Hermes bundle | `a58644fbe68711c5dbbc03eaf72863a15f0a192acfad475871dca9c84f183844` | same |
| iOS simulator ZIP proxy | `eac46a15d6aaa1d02308e83f18486741661aadae8c31be72a038ee3e95bfe8b3` | `731f4248a01b8e04e1215c4fbaa4bee6d7be102bf3751183175e0a8ec7ac90cc` |

Android used the `e2e` variant: it has a bundled Release-mode Hermes payload
and the same resource packaging path, but is debug-signed and includes both
arm64-v8a and x86_64. It is appropriate for a matched delta, not a production
signature or Play Console report. iOS used locally signed Release-simulator
`.app` bundles containing both simulator architectures. It is not a device
archive or App Store IPA.

The retained simulator ZIP is the immutable content identity for each measured
`.app` directory; logical and allocated directory sizes were measured before
archiving. The arm64 and x86_64 API 36 bundletool device-spec SHA-256 values
were `d98aa7cdc9d5690c463f8930d72a5b7a02d9620a304d2a21c024cdabbb8bef4f`
and `7b0222ced44c482f22f73503a8ad9acbd3ce7826e65741d447218fc4690404a5`.

The binary reader was first covered by the existing 19-test storage suite and
mobile typecheck. Full-corpus generation, Android builds, and iOS builds then
used the same temporary reader. A validation-only iOS native test adapter
accepted an explicit `chessticizeTestControlsEnabled` argument and the missing
`puzzleSelectionId` argument so the same bundled puzzle could be selected in a
Release-simulator build. That adapter did nothing without the explicit flag
and was removed with the reader.

### Measurement command ledger

The committed control pack and its reader remain reproducible from the source
commit with:

```sh
pnpm fetch:core-pack
node --experimental-strip-types --test packages/storage/test/puzzle-pack-source.test.ts
pnpm typecheck
```

The ignored research generator was invoked against that exact control artifact
and recorded its own source and result hashes above:

```sh
node scratch/issue-490/generate-binary-pack.mjs \
  fixtures/puzzles/bundled-core-pack.sqlite \
  scratch/issue-490/bundled-core-pack-binary.sqlite \
  scratch/issue-490/binary-pack-generation.json
gzip -9 -c fixtures/puzzles/bundled-core-pack.sqlite \
  > scratch/issue-490/text.sqlite.gz
gzip -9 -c scratch/issue-490/bundled-core-pack-binary.sqlite \
  > scratch/issue-490/binary.sqlite.gz
brotli -q 11 fixtures/puzzles/bundled-core-pack.sqlite \
  -o scratch/issue-490/text.sqlite.br
brotli -q 11 scratch/issue-490/bundled-core-pack-binary.sqlite \
  -o scratch/issue-490/binary.sqlite.br
zip -9 -j -q scratch/issue-490/text.sqlite.zip \
  fixtures/puzzles/bundled-core-pack.sqlite
zip -9 -j -q scratch/issue-490/binary.sqlite.zip \
  scratch/issue-490/bundled-core-pack-binary.sqlite
node --expose-gc --experimental-strip-types --no-warnings \
  scratch/issue-490/benchmark-pack-reader.mjs \
  fixtures/puzzles/bundled-core-pack.sqlite
node --expose-gc --experimental-strip-types --no-warnings \
  scratch/issue-490/benchmark-pack-reader.mjs \
  scratch/issue-490/bundled-core-pack-binary.sqlite
```

Matched Android artifacts used the repository's `e2e` Gradle variant with a
forced Release-mode Hermes bundle, followed by bundletool 1.18.3 device specs
for arm64 and x86_64 API 36. Matched iOS artifacts used the repository Release
Detox build and a forced-bundling Release-simulator rebuild after swapping only
the fixture and temporary dual reader. SHA-256 bundle equality in the artifact
table proves the JavaScript payload was held constant within each platform.
The relevant build and public-UI validation entry points were:

```sh
./apps/mobile/android/gradlew -p apps/mobile/android \
  createBundleE2eJsAndAssets --rerun-tasks bundleE2e assembleE2e \
  assembleAndroidTest -DtestBuildType=e2e
pnpm mobile:e2e:build:ios:release
pnpm mobile:e2e:test:android -- e2e/android-standard-practice.e2e.js
```

The exact Android delivery estimates used debug-signed APK-set archives built
for both candidates, then applied the recorded device specs:

```sh
for variant in text binary; do
  java -jar scratch/issue-490/bundletool-all-1.18.3.jar build-apks \
    --bundle=scratch/issue-490/android/$variant/app-e2e.aab \
    --output=scratch/issue-490/android/$variant/app-e2e.apks \
    --ks=apps/mobile/android/app/debug.keystore \
    --ks-key-alias=androiddebugkey --ks-pass=pass:android \
    --key-pass=pass:android --overwrite
  java -jar scratch/issue-490/bundletool-all-1.18.3.jar build-apks \
    --bundle=scratch/issue-490/android/$variant/app-e2e.aab \
    --output=scratch/issue-490/android/$variant/app-e2e-universal.apks \
    --mode=universal --ks=apps/mobile/android/app/debug.keystore \
    --ks-key-alias=androiddebugkey --ks-pass=pass:android \
    --key-pass=pass:android --overwrite
  for spec in device-arm64-api36.json device-x86_64-api36.json; do
    java -jar scratch/issue-490/bundletool-all-1.18.3.jar get-size total \
      --apks=scratch/issue-490/android/$variant/app-e2e.apks \
      --device-spec=scratch/issue-490/android/$spec
  done
done
```

Installed-data, file, memory, and simulator ZIP accounting used:

```sh
adb -s emulator-5554 shell run-as com.chessticize.mobile du -ak .
adb -s emulator-5554 shell "run-as com.chessticize.mobile \
  stat -c '%n:%s:%b:%B' databases/*.sqlite files/profileInstalled \
  shared_prefs/review-reminder-native.xml"
adb -s emulator-5554 shell dumpsys meminfo com.chessticize.mobile
adb -s emulator-5554 shell am start -W -S \
  com.chessticize.mobile/.MainActivity

IOS_DATA=$(xcrun simctl get_app_container "$IOS_DEVICE" \
  com.chessticize.mobile data)
du -ak "$IOS_DATA"
find "$IOS_DATA" -type f -exec stat -f '%N:%z:%b:%k' {} +
/usr/bin/time -p xcrun simctl launch --terminate-running-process \
  "$IOS_DEVICE" com.chessticize.mobile
(cd scratch/issue-490/ios/text && \
  /usr/bin/zip -qry -9 text-simulator.zip Chessticize.app)
(cd scratch/issue-490/ios/binary && \
  /usr/bin/zip -qry -9 binary-simulator.zip Chessticize.app)
```

The iOS public-UI check used `detox test --configuration ios.sim.release`
against a temporary issue-scoped spec; that spec and its test-only native
launch adapter were removed rather than presented as a maintained regression
suite.

The binary runs temporarily replaced the packaged fixture only after the
control artifacts had been copied to `scratch/`. The tracked fixture, reader,
manifest, Gradle/Xcode sources, and Detox configuration were restored before
this report was prepared. The artifact hashes above, rather than filenames or
mutable build directories, identify every measured output.

### Compression and download layers

| Layer | TEXT bytes | Binary bytes | Saving |
| --- | ---: | ---: | ---: |
| SQLite gzip level 9 proxy | 111,521,178 | 96,948,280 | 14,572,898 (13.07%) |
| SQLite ZIP level 9 proxy | 111,379,967 | 96,759,313 | 14,620,654 (13.13%) |
| SQLite Brotli quality 11 proxy | 81,736,794 | 76,442,981 | 5,293,813 (6.48%) |
| Android complete AAB | 231,898,572 | 217,232,129 | **14,666,443 (13.99 MiB, 6.32%)** |
| Android universal E2E APK | 348,993,528 | 326,538,660 | 22,454,868 (21.41 MiB, 6.43%) |
| bundletool arm64 API 36 download estimate | 213,232,376 | 198,173,153 | **15,059,223 (14.36 MiB, 7.06%)** |
| bundletool x86_64 API 36 download estimate | 213,789,261 | 198,730,038 | 15,059,223 (7.04%) |
| bundletool universal APK | 333,555,335 | 318,891,655 | 14,663,680 (13.98 MiB, 4.40%) |
| iOS simulator `.app` logical files | 425,933,228 | 362,609,068 | **63,324,160 (60.39 MiB, 14.87%)** |
| iOS simulator ZIP level 9 proxy | 214,454,544 | 199,833,881 | **14,620,663 (13.94 MiB, 6.82%)** |

Bundletool `1.18.3` (JAR SHA-256
`a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29`)
produced the Android estimates from the same AABs and explicit API 36 device
specifications. The AAB pack entry itself deflated from 111,642,934 to
96,976,493 bytes, accounting for essentially the complete AAB delta.

No candidate was uploaded to App Store Connect or Google Play. The table
therefore separates local package proxies and bundletool estimates from
store-reported download size. Obtaining store reports would require owner
authorization and a disposable non-production build identity; it is not
necessary to distinguish the measured candidates.

### Installed, first-launch, and post-practice layers

Android measurements used a clean arm64 API 36 `Chessticize-Play-API36` AVD.
iOS used a clean temporary iPhone 17 simulator on iOS 26.5. Both temporary
devices were removed or stopped after measurement.

| Platform/layer | TEXT | Binary | Binary saving |
| --- | ---: | ---: | ---: |
| Android installed APK, logical | 348,993,528 B | 326,538,660 B | 22,454,868 B |
| Android installed APK, allocated | 340,756 KiB | 318,828 KiB | 21,928 KiB |
| Android clean pre-launch app data | 24 KiB | 24 KiB | 0 |
| Android app data after first launch | 222,468 KiB | 160,624 KiB | 61,844 KiB allocated |
| Android app data after one completed/relaunched session | 222,468 KiB | 160,624 KiB | 61,844 KiB allocated |
| Android installed APK + post-launch data, allocated | 576,741,376 B | 490,958,848 B | **85,782,528 B (81.81 MiB, 14.87%)** |
| iOS installed `.app`, allocated | 416,136 KiB | 354,296 KiB | 61,840 KiB |
| iOS clean pre-launch app data | 116 KiB | 116 KiB | 0 |
| iOS app data after first launch | 222,504 KiB | 160,664 KiB | 61,840 KiB |
| iOS app data after one completed/relaunched session | 225,704 KiB | 163,864 KiB | 61,840 KiB |
| iOS installed `.app` + post-launch data | 638,640 KiB | 514,960 KiB | **123,680 KiB (120.78 MiB, 19.37%)** |

The logical copied database was exactly 227,487,744 versus 164,163,584 bytes
on both platforms. Minor allocated-byte differences come from filesystem block
accounting. Practice-state databases were the same size in each matched pair,
so the saving persisted after use.

The raw top-level Android allocation breakdown was identical after first launch
and after the completed/relaunched session except that `code_cache` was replaced
by `app_dxmaker_cache`:

| Android app-data allocation | TEXT | Binary |
| --- | ---: | ---: |
| Databases directory | 222,404 KiB | 160,560 KiB |
| Cache directories | 16 KiB | 16 KiB |
| Shared preferences | 16 KiB | 16 KiB |
| Files | 16 KiB | 16 KiB |
| Bridgeless split-bundle directory | 8 KiB | 8 KiB |
| Root metadata/allocation | 8 KiB | 8 KiB |
| **Total** | **222,468 KiB** | **160,624 KiB** |

Within the databases directory, the copied pack occupied 222,164 versus
160,320 KiB; `chessticize-mobile.sqlite` occupied 200 KiB and the Tactical
Profile cache 32 KiB in both candidates.

The iOS simulator's post-practice breakdown separated caches and databases.
At first launch, preferences occupied 4 KiB and all other simulator-managed
state/allocation occupied 120 KiB, producing the 222,504/160,664 KiB totals:

| iOS post-practice app-data allocation | TEXT | Binary |
| --- | ---: | ---: |
| Copied pack database | 222,156 KiB | 160,316 KiB |
| Practice database | 196 KiB | 196 KiB |
| Tactical Profile cache database | 28 KiB | 28 KiB |
| Preferences | 8 KiB | 8 KiB |
| Other simulator-managed state/allocation | 3,316 KiB | 3,316 KiB |
| **Total** | **225,704 KiB** | **163,864 KiB** |

The existing Android Standard Practice Detox journey passed on both formats:
it opened the 1,400,000-puzzle public source, completed the fixed bundled
session, relaunched, and restored rating, weekly progress, and History. The
equivalent issue-scoped iOS journey completed the same fixed bundled session,
relaunched, and restored weekly progress on both formats. These were public UI
and real SQLite/native-app paths; no repository or handler was called directly
from the E2E test.

### Reader and launch performance

The Node benchmark used the real SQLite pack source with 30 open/first-row
runs, 50 selections of 20 puzzles, and 30 hydrations of 1,000 deterministic
rows. The benchmark script and result SHA-256 values were:

- source: `ad8be45159849935dd7b8ef9cbfd10e8f6ffc5b967aaeddd0feedafa3cd31e7e`
- TEXT JSON: `6eb46cdd67090439a46e387254488b8cfdc3f56ea5d232d9a928d0e4ba007e9c`
- binary JSON: `2bbc400f72d777a3199df2406140c2c40b426408900d0aba279d27e56570304f`

| Operation / format | Min | Median | P95 | Max | Mean |
| --- | ---: | ---: | ---: | ---: | ---: |
| Open and count / TEXT | 2.294 ms | 2.643 ms | 4.063 ms | 4.084 ms | 2.730 ms |
| Open and count / binary | 2.628 ms | 2.734 ms | 4.893 ms | 30.676 ms | 3.733 ms |
| First hydration / TEXT | 0.107 ms | 0.110 ms | 0.228 ms | 1.118 ms | 0.155 ms |
| First hydration / binary | 0.120 ms | 0.126 ms | 0.182 ms | 1.607 ms | 0.180 ms |
| Select/hydrate 20 / TEXT | 14.246 ms | 19.117 ms | 39.636 ms | 46.658 ms | 21.829 ms |
| Select/hydrate 20 / binary | 14.393 ms | 19.558 ms | 169.465 ms | 446.250 ms | 41.412 ms |
| Hydrate 1,000 / TEXT | 4.709 ms | 5.067 ms | 6.113 ms | 6.327 ms | 5.167 ms |
| Hydrate 1,000 / binary | 7.055 ms | 9.538 ms | 16.073 ms | 17.058 ms | 9.984 ms |

Separate-process cold-cache outliers made the binary selection p95 unstable,
so medians and the deterministic 1,000-row cost are the useful comparison.
Both formats produced checksum `43,964,281`. The full distributions make the
binary selection outliers visible rather than treating one p95 or one cold
launch as a typical user-visible result.

Single-sample cold-launch observations did not show a regression: Android
reported 1,538 ms for TEXT and 1,175 ms for binary; the iOS `simctl launch`
request took 0.53 s and 0.51 s respectively. They are sanity checks, not claims
that binary is faster. Android first-screen memory was effectively identical
(TEXT/binary total PSS 100,986/100,980 KiB), as was the post-practice snapshot
(153,258/153,321 KiB). No repeatable memory cost was observed.

The original prototype run did not record process CPU time. A bounded
post-implementation guardrail therefore reran the same benchmark script and ID
corpus three times through the production dual reader at
`461f64c03416d2c5881cf90d4037a6d89de2db35`, comparing the retained TEXT pack
with released Core Pack v5 (`4f8726cd64c8e490708f9c6b7b411dad3736d5936c0493d71fd42bbe4404a811`).
TEXT user/system CPU seconds were 1.31/0.46, 1.30/0.46, and 1.32/0.47; binary
values were 2.14/0.49, 2.20/0.46, and 2.01/0.44. This follow-up is explicitly
production-reader evidence, not a relabelling of the original prototype run;
it found less than one extra CPU second across the complete synthetic campaign.
The follow-up command was `/usr/bin/time -lp node --expose-gc
--experimental-strip-types --no-warnings
scratch/issue-490/benchmark-pack-reader.mjs <pack.sqlite>`.

## Versioning, determinism, and corruption contract

Any accepted binary candidate needs two identities:

- the existing SQLite/pack schema identity; and
- a position/move codec identity that changes whenever bit allocation,
  byte order, canonicalization, or validation rules change.

SQLite provides a 32-bit `application_id` for identifying an application file
format and a 32-bit `user_version` field whose meaning belongs to the
application
([SQLite pragmas](https://www.sqlite.org/pragma.html#pragma_application_id)).
The pack manifest should additionally expose the codec name and version so the
artifact can be rejected before hydration and audited without opening opaque
rows. The exact field names are an implementation-plan decision, but
`format: "sqlite"` alone is not enough to distinguish text rows from a future
binary schema.

Deterministic generation requires a normative codec description with:

- byte order and bit numbering;
- square, piece, side, castling, en-passant, and promotion mappings;
- required zero values for every reserved bit;
- canonical ordering of piece nibbles relative to occupancy bits;
- solution-line concatenation and length rules;
- accepted and rejected value ranges; and
- version compatibility and failure behavior.

The prototype verifier must validate all 1,400,000 decoded rows against the
current domain representation, then re-encode them and compare exact candidate
bytes. It must also include mutation tests for truncated and odd-length BLOBs,
unknown versions, reserved bits, impossible piece/promotion codes, invalid
castling/en-passant state, and artifact hash mismatch. `PRAGMA integrity_check`
and existing pack validation remain required but are not substitutes for these
codec checks.

## Decision and implementation plan

**Recommendation: adopt the purpose-built position/UCI BLOB profile in a
separate implementation issue, while retaining SQLite.** Do not adopt
MessagePack, CBOR, Protobuf, FlatBuffers, or whole-database compression for the
current pack.

The measured benefit is material at every user-visible size boundary:

- about 14.6-15.1 MB less compressed Android delivery and 14.6 MB less in the
  matched iOS ZIP proxy;
- 60.39 MiB less for each uncompressed database copy;
- about 81.81 MiB less Android installed-plus-data allocation after launch;
- about 120.78 MiB less iOS simulator installed-plus-data allocation after
  launch; and
- no meaningful launch or memory regression, with approximately 4.47
  microseconds of added decode work per hydrated puzzle in the 1,000-row
  benchmark.

Those gains justify a small versioned codec, but not an immediate format switch
from this research branch. The implementation should be a reviewable,
production-tested change with these gates:

1. Move the codec into a non-React domain/storage module with a normative v1
   specification, shared encode/decode tests, and exhaustive invalid-input
   cases. Decode must fail closed on unknown versions, lengths, reserved bits,
   invalid pieces/squares/promotions, and invalid chess state.
2. Give the SQLite file and codec explicit identities. Set and validate
   `application_id`/`user_version` or an equivalent pack metadata row, and add
   codec name/version plus exact bytes and SHA-256 to the manifest. Reject an
   incompatible file before puzzle hydration.
3. Update the offline generator to emit BLOB columns deterministically and run
   the complete 1,400,000-row semantic and byte re-encode verification. Keep a
   checked regression set covering black-to-move, every castling combination,
   en passant, all promotions including underpromotion, maximum-length lines,
   and deliberate corruption.
4. Add public storage behavior tests for both TEXT and binary during rollout.
   A dual reader provides rollback compatibility for one release if desired;
   the distributed pack remains a bundled immutable asset, so no user-history
   migration is needed. User SQLite history, Review, ratings, and Tactical
   Profile data must remain untouched.
5. Repeat exact-head Android and iOS package builds after the production reader
   lands. Verify the published manifest identity, pack integrity, existing
   Practice selection behavior, one completed bundled session per platform,
   and clean-install/first-launch copying. Use actual App Store Connect and Play
   reports during the next authorized release rather than treating this
   report's proxies as store facts.
6. Retain the current TEXT pack and reader as the rollback artifact until the
   binary release has completed store rollout and field smoke checks. Rollback
   is an app/pack release rollback, not an in-place conversion of user data.

Protocol Buffers remains the fallback only if future requirements introduce
independent language implementations or frequent compatible schema evolution.
The current single-generator/single-reader pack does not benefit enough from
its envelope and toolchain to trade away the measured minimum-byte result.
