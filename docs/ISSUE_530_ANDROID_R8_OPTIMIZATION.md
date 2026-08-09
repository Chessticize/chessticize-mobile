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

Both APKs contain `arm64-v8a` and `x86_64` and were built in the same worktree.
The baseline is the unoptimized Android 1.4 build 15 source at
`0567aeaef34ab3d1d5b27a291a6b95bb5d4d044b`. The optimized measurement uses
Android 1.4.1 build 16. Local release APKs were signed with the repository debug
keystore only so they could be installed on the dedicated API 36 emulator;
they are not distribution candidates.

Archive component values are uncompressed entry totals from `unzip -l`.
Runtime measurements use the same `emulator-5554`, a fresh install, a reset of
ART compilation state, five process-cold launches of
`com.chessticize.mobile/.MainActivity`, and `dumpsys meminfo` immediately after
the fifth launch.

## Before and after

| Metric | Unoptimized build 15 | Optimized build 16 | Change |
| --- | ---: | ---: | ---: |
| APK bytes | 166,392,084 | 162,958,240 | -3,433,844 (-2.1%) |
| AAB bytes | 246,848,190 | 245,109,502 | -1,738,688 (-0.7%) |
| APK DEX, uncompressed | 12,066,076 | 2,472,840 | -9,593,236 (-79.5%) |
| APK resource table, uncompressed | 355,580 | 251,600 | -103,980 (-29.2%) |
| APK `res/`, uncompressed | 631,503 | 525,397 | -106,106 (-16.8%) |
| APK native libraries, uncompressed | 59,191,176 | 59,191,176 | unchanged |
| APK assets, uncompressed | 168,725,207 | 168,724,313 | -894 |
| Median TotalTime, 5 cold starts | 268 ms | 268 ms | unchanged |
| Median WaitTime, 5 cold starts | 270 ms | 272 ms | +2 ms (+0.7%) |
| Total PSS after fifth launch | 56,441 KB | 47,496 KB | -8,945 KB (-15.8%) |
| Total RSS after fifth launch | 173,384 KB | 161,072 KB | -12,312 KB (-7.1%) |

Observed wall-clock build times were 204.99 seconds for the first baseline
release build and 71.56 seconds for the later optimized production rebuild.
Those builds did not begin from equivalent Gradle/native cache states, so this
report records the values but makes no build-speed claim.

The result is intentionally conservative: startup is neutral within this small
emulator sample, while DEX/resource size and post-launch memory show clear
improvement. The large bundled puzzle database, native libraries, and native
debug symbols dominate total archive size and are not R8 inputs.

## Required final gates

- build and inspect production `release` from the clean exact implementation
  commit;
- run the non-debuggable API 36 `r8Validation` native suite for reflection,
  Stockfish JNI lifecycle, reminders, migration installation, cold launch,
  public UI rendering, installed version, and manifest entry points;
- run the full exact-head API 36 `e2e` matrix for system Back, predictive Back,
  Stockfish lifecycle, reminders, `flows`, and `practice`;
- run the conditional Progress Backup policy entry-point check;
- pass current-head fast checks and code review;
- let the protected candidate workflow rebuild with upload signing, retain the
  R8 diagnostics, and verify Android 1.4.1 version code 16.

Until those gates pass, this report is implementation evidence, not release
approval.
