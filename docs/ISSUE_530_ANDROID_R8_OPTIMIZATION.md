# Issue 530 Android R8 Optimization Evidence

This report records the controlled implementation and local evidence for
enabling Android release optimization. It does not replace the protected
upload-signed build or the final clean-head Android validation record.

## Configuration

- Android Gradle Plugin: `8.12.0`
- Gradle: `9.3.1`
- Java: `21.0.10`
- release: `minifyEnabled true`, `shrinkResources true`, optimized default
  rules, and `android.r8.optimizedResourceShrinking=true`
- production app rules retain only the ReactActivity Back callback field, the
  API 34 predictive-Back reflection delegate constructor, and Stockfish JNI
  method names
- no package-wide `com.chessticize.mobile.**` keep rule is present
- the non-debuggable `r8Validation` variant inherits the release graph and has
  no INTERNET, cleartext, or Detox exception; narrowly scoped Stockfish and
  reminder test ABIs are isolated there because Android instrumentation
  compiles separately from the target app
- Detox remains on the ordinary exact-head `e2e` pair for complete public
  journeys; no package-wide keep workaround is present in either R8 rule set

The production verifier requires non-empty `configuration.txt`, `mapping.txt`,
`resources.txt`, `seeds.txt`, and `usage.txt`, confirms that application code
was actually obfuscated, and records checksums for each output. The protected
candidate workflow retains those files and the generated report for 30 days.

## Measurement method

Both APKs contain `arm64-v8a` and `x86_64` and were built with the same local
toolchain in isolated worktrees. The baseline is the unoptimized Android 1.4
build 15 source at `0567aeaef34ab3d1d5b27a291a6b95bb5d4d044b`. The optimized
measurement is Android 1.4.1 build 16 source at
`d4d639112b8e1fde13775cc307bfc90eb5b48cec`. The commits have identical puzzle
pack, puzzle-pack manifest, Stockfish manifest, and NNUE inputs. Both builds
materialized the 164,163,584-byte Core Pack and the 3,519,630-byte and
108,919,594-byte NNUE files before packaging. Local release APKs were signed
with the same repository debug certificate only so they could be installed on
the dedicated API 36 emulator; they are not distribution candidates.

Archive component values are uncompressed entry totals from `unzip -l`.
Runtime measurements use the same `emulator-5554`, a device reboot before each
variant, a fresh install, a reset of ART compilation state, five process-cold
launches of `com.chessticize.mobile/.MainActivity`, and `dumpsys meminfo`
immediately after the fifth launch.

## Before and after

| Metric | Unoptimized build 15 | Optimized build 16 | Change |
| --- | ---: | ---: | ---: |
| APK bytes | 242,406,324 | 238,972,740 | -3,433,584 (-1.4%) |
| AAB bytes | 322,839,845 | 321,126,439 | -1,713,406 (-0.5%) |
| APK DEX, uncompressed | 12,066,076 | 2,475,904 | -9,590,172 (-79.5%) |
| APK resource table, uncompressed | 355,580 | 251,600 | -103,980 (-29.2%) |
| APK `res/`, uncompressed | 631,503 | 525,397 | -106,106 (-16.8%) |
| APK native libraries, uncompressed | 59,191,064 | 59,191,176 | +112 (less than 0.1%) |
| APK assets, uncompressed | 281,164,165 | 281,163,535 | -630 (less than 0.1%) |
| Median TotalTime, 5 cold starts | 262 ms | 266 ms | +4 ms (+1.5%) |
| Median WaitTime, 5 cold starts | 282 ms | 281 ms | -1 ms (-0.4%) |
| Total PSS after fifth launch | 53,603 KB | 45,918 KB | -7,685 KB (-14.3%) |
| Total RSS after fifth launch | 187,620 KB | 178,476 KB | -9,144 KB (-4.9%) |

The full-input artifact SHA-256 values are
`04340ebc20789d4379d81607625263163bc9036454ed85de4f1b2d075d0e0e40`
(baseline APK),
`9a0bad6f1ec89aac79ab46b56deedd95aedbd61617c9fe7eba6fcb63d8599eb7`
(baseline AAB),
`f6626ccb4212cf43968f85db8191719452118ab61785dd19cf1ac5f469281ad8`
(optimized APK), and
`83688a337454e99744dd62044b5748b462e170cd36d08ac759a37743f6dd2f86`
(optimized AAB).

Observed wall-clock build times were 51.93 seconds for the successful cached
full-input baseline rebuild and 72.32 seconds for the optimized production
rebuild. Those builds did not begin from equivalent Gradle/native cache states,
so this report records the values but makes no build-speed claim.

The result is intentionally conservative: startup is neutral within this small
emulator sample, while DEX/resource size and post-launch memory show clear
improvement. The large bundled puzzle database, NNUE networks, native
libraries, and native debug symbols dominate total archive size and are not R8
inputs.

## Validation status

- The clean `d4d639112b8e1fde13775cc307bfc90eb5b48cec` implementation head built
  production `release` APK/AAB outputs and passed production mapping,
  configuration, resources, seeds, usage, and application-obfuscation checks.
- The non-debuggable API 36 `r8Validation` native suite passed reflection,
  Stockfish JNI lifecycle, reminders, migration fixture installation, cold
  launch, public UI rendering, Android 1.4.1 version code 16, and manifest entry
  points.
- The full exact-head API 36 `e2e` matrix passed its preparation and reminder
  native steps plus all nine suites, including system and predictive Back,
  Stockfish lifecycle, reminders, `flows`, and `practice`.
- The API 36 Progress Backup policy profile passed fail-closed mask 0 behavior
  and exact three-file encryption-only, device-to-device-only, and combined
  archives on a root-capable emulator.
- Final fast checks passed: 71 Mobile Jest suites / 1,329 tests, Mobile
  typecheck, development-process validation, and lint with zero errors and four
  pre-existing warnings. Review of the release-branch diff found no blocking
  issue.
- The protected candidate workflow must still rebuild the integrated release-
  branch head with upload signing, retain the R8 diagnostics, and verify Android
  1.4.1 version code 16. A locally debug-signed artifact does not satisfy that
  gate.

Until the remaining gates pass, this report is implementation evidence, not
release approval.
