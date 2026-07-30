# Google Play Marketing Capture

Issue #444 reuses the approved six-frame story from
`config/app-store-marketing-story-v1.json` for Google Play. Android capture has
two intentionally different evidence modes:

- `deterministic-e2e` is a preview workflow. It uses the Android E2E build and
  the debug-gated marketing fixture to make the six product states repeatable.
  Its manifests are always marked `preview-only`.
- `public-ui-exact-artifact` is the final listing workflow. It uses screenshots
  reached through public UI in the accepted Play-delivered APK and binds them
  to that APK plus the protected `android-source-manifest.json`. Its manifests
  are marked `exact-artifact-capture`.

The deterministic fixture is unavailable in production. The Android native
launch module returns an empty map whenever `BuildConfig.DEBUG` is false, so a
Play AAB or Play-delivered APK cannot activate the marketing frame argument.

## Raw capture matrix

Keep raw native pixels. The Google Play compositor owns any later upload-size
normalization.

| Family | Manifest key | Orientation | Raw pixels |
| --- | --- | --- | --- |
| Phone | `android-phone` | Portrait | `1080 x 1920` |
| 7-inch tablet | `android-tablet-7` | Portrait | `1200 x 1920` |
| 10-inch tablet | `android-tablet-10` | Landscape | `2560 x 1600` |

Every raw PNG must be opaque and must remain within Google Play's general
320–3840 pixel and 2:1 screenshot bounds.

## Deterministic preview capture

Attach three compatible API 24 or newer emulators, then run the host-side
capture wrapper:

```sh
CHESSTICIZE_MARKETING_ANDROID_PHONE_SERIAL=emulator-5554 \
CHESSTICIZE_MARKETING_ANDROID_PHONE_PROFILE="Pixel 2 API 36" \
CHESSTICIZE_MARKETING_ANDROID_TABLET_7_SERIAL=emulator-5556 \
CHESSTICIZE_MARKETING_ANDROID_TABLET_7_PROFILE="7-inch tablet API 36" \
CHESSTICIZE_MARKETING_ANDROID_TABLET_10_SERIAL=emulator-5558 \
CHESSTICIZE_MARKETING_ANDROID_TABLET_10_PROFILE="10-inch tablet API 36" \
  pnpm mobile:capture:marketing-assets:android
```

The wrapper:

1. requires one clean tracked source commit;
2. builds the self-contained Android E2E APK once unless
   `CHESSTICIZE_ANDROID_MARKETING_SKIP_BUILD=1`;
3. rejects a device whose effective raw dimensions do not match its family;
4. captures and validates the approved six-frame story on each target; and
5. writes `google-play-capture-manifest.json`.

Because this preview path adds a global native launch fixture, a fresh build and
Full Android native validation are required before its implementation PR can
merge. It is not part of the frozen mobile 1.3.1 release candidate and does not
move that candidate's source identity.

## Final exact-artifact capture

Do this only after the Android release candidate is accepted and the
Play-delivered APK plus protected source manifest are available.

1. Install the accepted Play-delivered APK.
2. Reach each approved frame through public UI. Do not use the E2E launch
   argument or a debug build.
3. Capture the six opaque PNGs into one input directory using the canonical
   `captureId` filenames from the story contract.
4. Record one device-family manifest with the public-UI recorder.
5. Repeat for all three families, then finalize the combined manifest.

Example for one family:

```sh
CHESSTICIZE_SOURCE_COMMIT=<exact-40-character-source-sha> \
CHESSTICIZE_MARKETING_INPUT_ROOT=<six-frame-input-directory> \
CHESSTICIZE_MARKETING_OUTPUT_ROOT=<shared-output-directory> \
CHESSTICIZE_MARKETING_DEVICE_FAMILY=android-phone \
CHESSTICIZE_ANDROID_MARKETING_DEVICE_PROFILE="Play phone profile" \
CHESSTICIZE_ANDROID_MARKETING_API_LEVEL=36 \
CHESSTICIZE_ANDROID_MARKETING_DENSITY_DPI=420 \
DETOX_ANDROID_DEVICE=emulator-5554 \
CHESSTICIZE_ANDROID_MARKETING_CAPTURE_MODE=public-ui-exact-artifact \
CHESSTICIZE_ANDROID_CAPTURE_ARTIFACT_ROLE=play-delivered-apk \
CHESSTICIZE_ANDROID_CAPTURE_ARTIFACT_PATH=<play-delivered-apk> \
CHESSTICIZE_ANDROID_SOURCE_MANIFEST_PATH=<android-source-manifest.json> \
CHESSTICIZE_ANDROID_APK_MIRROR_EVIDENCE_PATH=<android-apk-mirror-evidence.json> \
  pnpm mobile:record:marketing-assets:android
```

After recording all three families:

```sh
CHESSTICIZE_MARKETING_OUTPUT_ROOT=<shared-output-directory> \
  pnpm mobile:finalize:marketing-assets:android
```

The finalizer fails closed unless all device manifests share the same source
commit, capture mode, APK hash, six-frame order, locale, copy keys, and
candidate identity. It reopens every PNG and rechecks its raw dimensions,
opacity, relative path, and SHA-256 before writing the handoff manifest.
The public-UI recorder also requires the retained post-Play mirror receipt and
checks that its APK hash, package/version, Play signer, AAB hash, source
manifest hash, and exact source commit all match.

The capture manifest proves local artifact and screenshot identity. Google Play
Console upload, listing assignment, and final Console evidence remain separate
owner-controlled gates.

## Validate metadata and compose the Play set

Validate the canonical listing copy, URLs, shared story, alt text, and
version-controlled claim evidence:

```sh
pnpm google-play:metadata:check
```

Then preview all three device families from the finalized capture handoff:

```sh
pnpm google-play:compose-marketing -- \
  --capture-root <shared-output-directory> \
  --manifest <shared-output-directory>/google-play-capture-manifest.json \
  --output-dir <separate-composed-output-directory> \
  --device-family all \
  --orientation all \
  --preview-only
```

Review all three contact sheets. Omit `--preview-only` to write the eighteen
opaque upload assets and `composition-manifest.json`. The receipt binds the
canonical alt-text contract, raw screenshot hashes, final hashes, capture
status, and Android candidate identity. A `preview-only` capture remains design
evidence only; only an `exact-artifact-capture` handoff may be used for the
final Play Console listing.
