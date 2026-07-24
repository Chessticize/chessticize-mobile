---
status: accepted
---

# Mirror the Play-signed Android APK after the Play release

Google Play is the primary Android release channel. The protected candidate
workflow builds the AAB once and publishes its corresponding source before the
binary is distributed. After the owner publishes that version code through
Play, one manually dispatched CI job uses the Generated APKs API to download
Google's universal APK and mirrors that exact Play-signed file plus its SHA-256
checksum in the same GitHub Release.

Within the Chessticize release process this mirror is a required finalizer, not
an additional product-validation gate. The source-only Release is the correct
pre-Play state, but the Android release remains `APK mirror pending` after
Play publication until the mirror receipt and all three public assets are
verified. Physical-device testing is optional diagnostic work and is not a
prerequisite for this finalizer.

The mirror job verifies only immutable artifact identity: package name, public
version, version code, Play app-signing certificate, non-empty bytes, and
SHA-256. It does not rebuild Android, rerun product tests, repeat Detox, require
Play-ready or size evidence, or split preparation and publication into separate
approvals. GitHub uses the built-in workflow token. Play authentication uses
Workload Identity Federation when configured, with one protected
least-privilege service-account credential as the fallback; neither path asks
the operator for a temporary token on each release.

GitHub APK installation remains manual and the app does not poll, download, or
install updates. A CI-built APK signed with the upload key, multiple binary
publication phases, temporary personal access tokens, duplicate release
validation, and a GitHub-first update channel are rejected.
