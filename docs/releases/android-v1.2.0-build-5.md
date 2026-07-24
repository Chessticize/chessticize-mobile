# Chessticize Android 1.2 (build 5)

- Status: Failed candidate; no AAB or Play release was produced
- Locale: `en-US`
- Platform: `Android`
- Public version: `1.2`
- Build or version code: `5`
- Source tag: `android-v1.2.0-build-5`
- Previous public source tag: `android-v1.1.0-build-4`

## Customer-facing changes

- Create, name, reorder, and archive saved Practice Runs with independent ELO ratings.
- Choose multiple curated puzzle themes, while keeping compatible legacy Custom configurations.
- Preview the move that led to each puzzle and see clearer Sprint results and Stockfish scores.

## Store copy (`en-US`)

```text
• Customize the Practice Runs shown on your Home screen.
• See at a glance which side moves next in each puzzle.
• Choose curated themes and combine multiple themes in one Run.

Details and source: https://github.com/Chessticize/chessticize-mobile/releases/tag/android-v1.2.0-build-5
```

## GitHub customer summary

Chessticize 1.2 adds customizable Home screen Practice Runs with independent ELO
ratings, curated multi-theme selection, and a clearer indication of which side
moves next. It also previews the move that led to each puzzle and improves
Sprint result and on-device analysis score presentation.

## Release-note review

- [x] Every claim was verified against the exact candidate behavior and
  release evidence.
- [x] Privacy, offline, sync or backup, reminder, analysis, and device-support
  wording is truthful for this platform.
- [x] Every store bullet applies to this platform and the block contains no more
  than three bullets.
- [x] The details link opens the exact platform GitHub Release and identifies
  the source tag and public repository.
- [x] The complete store copy is at most 300 Unicode characters and also fits
  the destination’s current limit.
- [x] No issue numbers, internal code names, implementation details, or private
  evidence are included.
- [x] The release owner approved the copy before the source tag was created.

## Candidate outcome

The protected candidate run stopped in the generic Android doctor before the
AAB build because the hosted image lacked an emulator-only runtime library.
No AAB, GitHub source Release, or Play upload was produced. The public annotated
tag remains immutable; Android 1.2 advances to build 6 with an artifact-only
doctor that excludes emulator readiness.
