# Release Notes

This document defines the customer-facing release-note contract for every
Chessticize Mobile binary submitted for external distribution. Release notes
are product copy, not a commit log, test report, or substitute for the exact
source and binary provenance required by the release runbooks.

## Source of truth and location

Create one file per submitted platform binary under `docs/releases/`. Name the
file after the immutable source tag:

- `docs/releases/ios-v<version>-build-<build>.md`
- `docs/releases/android-v<version>-build-<version-code>.md`

For example, iOS version `1.2` build `3` uses
`docs/releases/ios-v1.2.0-build-3.md`. Android version `1.2` version code `4`
uses `docs/releases/android-v1.2.0-build-4.md`. Normalize a two-component public
version to three components in the filename and tag.

Copy [`docs/releases/RELEASE_NOTES_TEMPLATE.md`](releases/RELEASE_NOTES_TEMPLATE.md)
to start a release note. The file must be committed, reviewed, and marked
`Approved` on the exact candidate commit before its source tag is created. A
replacement build gets a new file because its build identity and source tag are
different, even when its customer-facing summary is unchanged.

## Required outputs

The checked-in file contains the approved English (`en-US`) source copy for:

1. **Apple App Store:** copy the `Store copy` section into **What’s New in this
   Version** when that field is available. Apple does not expose that field for
   the first App Store version, but the checked-in file and GitHub release still
   remain required. Apple currently allows up to 4,000 characters for version
   update notes.
2. **Google Play:** copy the `Store copy` section into **What’s new in this
   release?**, wrapped in the Play locale tags such as `<en-US>` and `</en-US>`.
   Google Play currently allows up to 500 Unicode characters per language and
   says release notes should describe the update rather than promote it or ask
   users to take action.
3. **GitHub:** use the `GitHub customer summary` first in a manually prepared
   iOS release, followed by technical source and artifact details. Android’s
   protected workflow owns its GitHub release body: it puts a prominent link to
   the exact checked-in customer note first, then preserves the generated
   source, signing, checksum, and installation details. Do not hand-edit that
   protected body.

Chessticize store copy has a stricter product limit than either store: use two
or three short bullets and keep the entire `Store copy` block at or below 300
Unicode characters. Include only changes that apply to the released platform.
End with a direct link to the exact GitHub Release so a user can choose to read
the detailed customer note, source disclosure, and artifact information. The
URL names both the public repository and exact platform source tag, and counts
toward the 300-character limit:

```text
Details and source: https://github.com/Chessticize/chessticize-mobile/releases/tag/<platform>-v<version>-build-<build>
```

If a new locale is added, create and review a separate localized section in the
same file. English remains the only required release-note locale until a
localization task explicitly adds another one.

## Preparation workflow

1. **Open the release-note file with the release/version change.** Do not wait
   until the store submission screen. Record the exact platform, public
   version, build or version code, source tag, and previous public source tag.
2. **Collect candidate changes.** Review merged feature and fix PRs between the
   previous public tag and the candidate, their acceptance evidence, and the
   current product/listing docs. The Interaction Lab’s temporary New Scenario
   Marker can help during design review, but it is not a release-note record and
   is cleared before merge.
3. **Select user-visible changes.** Lead with new capabilities, then meaningful
   improvements and fixes. Include security, privacy, data-loss, migration, or
   compatibility changes whenever they affect a user’s decision to update.
   Exclude refactors, CI changes, issue numbers, internal code names, and claims
   users cannot observe.
4. **Write store-ready copy.** Use plain English, concrete outcomes, and short
   sentences. Use two or three bullets, stay within 300 Unicode characters, and
   name only changes available on that platform. Do not use generic “bug fixes
   and improvements” as the entire note. Do not promise exact reminder delivery,
   cross-platform sync, telemetry, or another capability that the exact
   artifact does not provide. For a replacement build with no user-visible
   difference, say so explicitly rather than inventing a change.
5. **Review against the exact candidate.** Verify every statement against
   product behavior and validation evidence. Recheck privacy, offline, sync or
   backup, Stockfish, device-support, and source-disclosure claims. Confirm the
   details link resolves to the exact platform GitHub Release. Count the final
   store text, including that URL, against the 300-character product limit and
   the destination’s current limit.
6. **Approve and freeze before tagging.** Change the file status to `Approved`,
   complete its review checklist, and include it in the clean candidate commit.
   Create the platform source tag only after this point.
7. **Publish exactly.** Copy the approved store section without paraphrasing,
   publish the GitHub customer summary where the platform workflow permits it,
   and retain a screenshot or exported metadata record showing the submitted
   text with the release evidence.
8. **Verify after publication.** Compare the live store notes and GitHub release
   with the checked-in file. A mismatch blocks release completion until it is
   corrected and reverified.

## Corrections and rejected candidates

Do not move or reuse a published source tag to change release notes. If a
candidate is rejected before distribution, preserve its note and tag as
historical evidence and create a new build-specific file for the replacement.
If store metadata alone is corrected after tagging, record the correction with
the protected release evidence; do not claim the tag contains copy that it does
not contain. Any correction that changes a product claim must be reviewed
against the exact binary again.

## Adoption for existing immutable tags

Never move a source tag that existed before this contract was adopted. For a
still-pending release whose tag already exists without a build-specific note,
commit and approve the correctly named file on `main`, attach or link it from
the platform’s release record where permitted, and retain the note commit and
SHA-256 with the release evidence. This is a transition for pre-existing tags,
not permission to omit the file from any new tagged candidate.

The official field limits and availability rules can change. Recheck the live
[App Store Connect platform-version reference](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)
and [Google Play release preparation guidance](https://support.google.com/googleplay/android-developer/answer/9859348)
before each submission.
