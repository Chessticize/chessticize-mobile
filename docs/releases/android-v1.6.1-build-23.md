# Chessticize Android 1.6.1 (build 23)

- Status: Approved
- Locale: `en-US`
- Platform: `Android`
- Public version: `1.6.1`
- Build or version code: `23`
- Source tag: `android-v1.6.1-build-23`
- Previous public source tag: `android-v1.6.0-build-22`

## Customer-facing changes

- Google Play can invite you to rate Chessticize after successful practice.
- Invitations stay on completed result screens, with at least 120 days between
  requests and no repeat within the same app version.

## Store copy (`en-US`)

```text
• Google Play can now invite you to rate Chessticize after successful practice.
• Invitations appear on finished results, at least 120 days apart.
```

## Release details

- [GitHub Release](https://github.com/Chessticize/chessticize-mobile/releases/tag/android-v1.6.1-build-23)

## GitHub customer summary

Chessticize 1.6.1 adds Google Play rating invitations after a successful practice
milestone. Invitations use the Play Store's own review flow on completed result
screens, respect a 120-day cooldown, and do not interrupt an active puzzle.
Google Play controls whether its review sheet is displayed.

## Release-note review

- [x] Claims match the reviewed Android implementation in PR #723 and its
  successful public-UI milestone journey, five native bridge checks, and
  eligibility/suppression tests.
- [x] No custom prompt, app account, gameplay upload, or analytics was added.
  Optional user-submitted store ratings are handled by Google Play; the privacy
  documentation describes that platform boundary.
- [x] Both store bullets apply to Android, contain no URL, and fit the
  300-character product limit.
- [x] The release-details URL identifies the exact Android source tag and public
  source repository. Source publication follows immutable tagging.
- [x] Existing practice, storage/backup, Stockfish, and device-support evidence
  is reused because those runtime boundaries are unchanged from 1.6.0.
- [x] Astra reviewed this copy before tagging. The owner requested Android
  1.6.1 publication; Play track and review state are reported separately.
- [x] A real Android rating sheet remains visually unverified because the owner
  deferred Play-account login on the emulator. The production Play-service
  request and launch-attempt persistence were confirmed; no sheet was shown in
  that unsigned-in environment. This remains a visible acceptance limit.
