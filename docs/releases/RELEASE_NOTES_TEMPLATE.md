# Chessticize <iOS|Android> <version> (build <build>)

- Status: Draft
- Locale: `en-US`
- Platform: `<iOS|Android>`
- Public version: `<version>`
- Build or version code: `<build>`
- Source tag: `<ios|android>-v<normalized-version>-build-<build>`
- Previous public source tag: `<tag|First public release>`

## Customer-facing changes

- `<Most important new capability or outcome>`
- `<Meaningful improvement>`
- `<Specific user-visible fix, when applicable>`

If this is a replacement build with no user-visible change, replace the list
with one direct sentence saying that the release experience is unchanged.

## Store copy (`en-US`)

```text
• <Most important user-visible benefit>
• <Second user-visible benefit>
• <Specific user-visible improvement or fix, when applicable>
```

Keep the complete block to two or three bullets and at most 300 Unicode
characters. Lead with user benefits, include no raw URLs, and do not call a
stable user-facing feature `experimental` unless that qualification is an
intentional product promise.

## Release details

- [GitHub Release](https://github.com/Chessticize/chessticize-mobile/releases/tag/<ios|android>-v<normalized-version>-build-<build>)

Keep this exact source-and-artifact link in the checked-in record. Do not copy
it into App Store or Google Play release-note text.

## GitHub customer summary

<A concise Markdown summary of the same user-visible changes. Do not repeat or
replace the generated Android provenance, checksum, signing, or installation
notes.>

## Release-note review

- [ ] Every claim was verified against the exact candidate behavior and
  release evidence.
- [ ] Privacy, offline, sync or backup, reminder, analysis, and device-support
  wording is truthful for this platform.
- [ ] Every store bullet applies to this platform and the block contains no more
  than three bullets.
- [ ] The separate release-details link opens the exact platform GitHub Release
  and identifies the source tag and public repository.
- [ ] The complete store copy is at most 300 Unicode characters and also fits
  the destination’s current limit, contains no raw URL, and leads with user
  benefits.
- [ ] No issue numbers, internal code names, implementation details, or private
  evidence are included.
- [ ] The release owner approved the copy before the source tag was created.
