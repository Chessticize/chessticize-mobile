# Google Play Marketing Capture

Issue #444 reuses the approved six-frame story from
`config/app-store-marketing-story-v1.json` for Google Play.

This is a metadata-and-images listing update. It does not create a new mobile
release, rebuild the signed AAB, change `versionCode`, or replace the released
1.3.1 candidate. Release identity and screenshot-source identity are recorded
separately.

## Required screenshot set

The current Google Play delivery contains one device type:

| Family | Manifest key | Orientation | Raw and output pixels |
| --- | --- | --- | --- |
| Phone | `android-phone` | Portrait | `1080 x 1920` |

The six phone screenshots satisfy the current listing contract. Google Play
allows tablet screenshot sets, but they are optional for this update and are
not generated, reviewed, uploaded, or represented as missing work.

Every raw PNG must be opaque and remain within Google Play's general
320–3840-pixel and 2:1 screenshot bounds.

## Approved self-built capture

The normal capture mode is `deterministic-e2e`. It uses a self-built Android
E2E APK and the debug-gated marketing fixture to reproduce the six approved
product states. The raw manifest remains `preview-only` so it never claims to
be a Play-delivered binary.

That status does not prevent listing use after the owner visually approves the
frames. The canonical metadata records the separate
`owner-approved-self-built-android-capture` policy, and the final listing
handoff binds:

- the self-built capture source commit and APK hash;
- the six raw screenshot hashes;
- the six composed screenshot hashes;
- the immutable released AAB/APK/source identity from retained release
  evidence; and
- the final Play Console review receipt.

An exact Play-installed public-UI capture remains available as an optional
diagnostic, but installer provenance is not a listing-publication gate.

The deterministic fixture is unavailable in production. The Android native
launch module returns an empty map whenever `BuildConfig.DEBUG` is false, so a
Play AAB or Play-delivered APK cannot activate the fixture.

## Capture the phone set

The legacy-default command captures the approved v1 story. Reuse a compatible
API 24 or newer emulator when possible:

```sh
CHESSTICIZE_MARKETING_ANDROID_PHONE_SERIAL=emulator-5554 \
CHESSTICIZE_MARKETING_ANDROID_PHONE_PROFILE="Pixel 2 API 36" \
  pnpm mobile:capture:marketing-assets:android
```

For the explicit 1.6 campaign, use the same phone profile with:

```sh
CHESSTICIZE_MARKETING_ANDROID_PHONE_SERIAL=emulator-5554 \
CHESSTICIZE_MARKETING_ANDROID_PHONE_PROFILE="Pixel 2 API 36" \
  pnpm mobile:capture:marketing-assets:android:1.6
```

The 1.6 command captures `practice-home`, `dark-arrow-duel`,
`tactical-profile`, `focused-run`, `survival`, and `review` from the same
deterministic fictional player through public native screens. It keeps the
early-estimate disclosure visible and does not reuse a v1 raw screenshot.

The wrapper:

1. requires one clean tracked source commit;
2. builds the self-contained Android E2E APK once unless
   `CHESSTICIZE_ANDROID_MARKETING_SKIP_BUILD=1`;
3. rejects a target whose effective raw dimensions are not `1080 x 1920`;
4. captures and validates the approved six-frame story; and
5. writes the phone-only `google-play-capture-manifest.json`.

The legacy command writes below
`scratch/store-assets/google-play/<full-source-commit>/`. The explicit 1.6
command writes below
`scratch/store-assets/google-play/mobile-1.6-en-us/<full-source-commit>/`.
Its raw manifests use `schemaVersion: 2`, top-level campaign
`{"id":"mobile-1.6-en-us","publicVersion":"1.6.0","status":"capture-plan"}`,
and release-frame receipts with immutable PNG hashes. They intentionally omit
the v1 top-level `storyId` and legacy copy fields. `sourceBuild.kind` is
`integrated-main-preparation`: it records a real integrated source SHA without
claiming a Play or store release candidate. `capture-plan` is preparation
status, not listing-upload evidence.

The 1.6 tooling is available, but no old v1 raw set can satisfy this campaign;
a native capture manifest exists only after the explicit command completes and
is visually reviewed. This is a screenshot-production build, not a new signed
release build.

## Android Photo Studio composition

The Google Play layout is
`.codex/skills/chessticize-app-store-marketing/assets/google-play-marketing-layout-v2.json`.
It combines:

- six OpenAI Imagegen warm-white and icy-blue chess-studio background plates;
- the immutable native Android captures;
- a deterministic, unbranded Android handset frame;
- one small centered circular punch-hole camera; and
- the canonical six headlines and alt text.

The device must never contain a Dynamic Island, pill-shaped notch, Apple logo,
or other Apple-specific cue. The renderer records
`generic-android-center-punch-hole-no-dynamic-island` in the output contract.

Preview:

```sh
pnpm app-store:compose-marketing -- \
  --capture-root <campaign-raw-capture-directory> \
  --output-dir <separate-preview-directory> \
  --campaign mobile-1.6-en-us \
  --platform google-play \
  --preview-only
```

Review the single contact sheet. Omit `--preview-only` to write the six opaque
1080 x 1920 upload assets and `composition-manifest.json`. A self-built v2
capture with its truthful preparation status can export these assets after
review. Exact-artifact capture provenance remains separately fail-closed until
the campaign-aware verifier accepts its schema-v2 receipt.

## Listing handoff

Validate metadata before upload:

```sh
pnpm google-play:metadata:check
```

Run the separately network-gated public-link check when publication evidence
is being prepared:

```sh
pnpm google-play:links:check -- \
  --live \
  --metadata config/google-play-metadata-en-us-v1.json \
  --output-dir <protected-evidence-directory>/public-links
```

The listing handoff takes the approved self-built capture and composition plus
the retained 1.3.1 release source manifest and Play APK mirror evidence. See
`docs/ANDROID_PLAY_LISTING.md` for the exact commands.

The capture manifest proves screenshot provenance. The release evidence proves
the immutable published candidate. Play Console upload, review, and publication
are recorded separately; none of these steps require a new AAB.
