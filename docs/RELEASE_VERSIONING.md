# Mobile Versioning

Chessticize keeps the next development target separate from the identity of a
release candidate. This prevents `main` from looking one release behind while
a release branch is being prepared, and prevents ordinary development from
modifying an identity that has already shipped.

## Sources of truth

- `apps/mobile/development-version.json` is the public version shown by Android
  Debug/E2E and iOS Debug-Dev builds from `main`. It describes the version the
  open development line is targeting. Changing it does not allocate an Android
  version code or an iOS store build number. The isolated iOS Debug-Dev identity
  uses build `1`, so preparing a release cannot change its generated config or
  create a conflict with the separate `main` development advance.
- `apps/mobile/release-version.json` is the exact cross-platform candidate
  identity. Android Release/R8 Validation and iOS Release-Production builds use
  it. Android `versionCode` and iOS `CFBundleVersion` are allocated only here.
- An immutable annotated platform tag is the final source of truth for a binary
  that was submitted or published. Never move a tag or reuse a consumed Android
  version code or iOS build number.

The expected state after the coordinated 1.5.0 release has shipped is therefore:

- development target on `main`: `1.5.1`;
- latest integrated release identity: `1.5.0`, Android version code `18`, iOS
  build `1`;
- shipped identity: the immutable `android-v1.5.0-build-18` and
  `ios-v1.5.0-build-1` platform tags.

Run this at any time to inspect both mutable records:

```sh
pnpm mobile:version:status
pnpm mobile:version:check
```

## Choose a minor or major target

The default development advance is one patch. When the product decision is to
target a minor or major version, set that target on `main` in an ordinary
reviewed PR before cutting the release branch:

```sh
pnpm mobile:version:set-development -- --public-version 1.5.0
# or
pnpm mobile:version:set-development -- --public-version 2.0.0
```

This updates only the development version and generated iOS Debug config. It
does not claim that the version has shipped and does not consume store build
identities.

## TestFlight Iteration

For routine Dev or Production TestFlight, start from current `main` and use a
short preparation PR only when identity/configuration changes are needed. Merge
that usable increment after necessary checks. No coordinated release branch or
RC freeze is required. Verify the selected app's distribution configuration and
allocate an unused build number; the Debug-Dev display build `1` is not a
reusable TestFlight upload identity. Do not change runtime versioning behavior
or signing configuration merely by interpreting these instructions.

## Open a coordinated release

1. On current `main`, confirm that `development-version.json` names the public
   version being released. Change it first if the release is intentionally a
   minor or major bump.
2. Create `codex/mobile-<version>-release` from that exact `main` head and open
   its draft PR to `main`.
3. On the release branch, allocate the candidate identity:

   ```sh
   pnpm mobile:version:prepare-release
   ```

   By default this copies the planned development version, increments the
   Android version code, resets the iOS build to `1` for a new public version,
   and regenerates the iOS Release config. Explicit values are available for a
   controlled recovery:

   ```sh
   pnpm mobile:version:prepare-release -- \
     --public-version 1.5.0 \
     --android-version-code 17 \
     --ios-build-number 1
   ```

4. As soon as the release branch is cut, advance `main` in a separate ordinary
   PR so new work identifies itself as the next target:

   ```sh
   pnpm mobile:version:advance-development
   ```

   The default advances one patch (`1.5.0` to `1.5.1`). If the next target has
   already been chosen, pass `--public-version`, for example `1.6.0` or `2.0.0`.
5. Keep `development-version.json` unchanged on the release branch. Candidate
   corrections change only `release-version.json`, release notes, or the
   product inputs required by that RC generation. Because the release branch
   never changed the development record, its final merge into the advancing
   `main` line cannot roll the development target backward.

## Replacement candidates

Run `mobile:version:prepare-release` again on the release branch after an
invalidated candidate. For the same public iOS version, the command increments
both the Android version code and iOS build number. For a new public version,
the default iOS build starts at `1`. Supply explicit higher values if a store
identity was consumed outside the repository record.

Every replacement still follows the RC invalidation, convergence, validation,
review, note, tag, and artifact rules in `docs/RELEASE_SOURCE_POLICY.md`.

## Integrate And Track Distribution

Merge a usable, reviewed preparation increment after necessary checks; store
submission, review and public availability are later independent states. For a
coordinated release use a merge commit to preserve its source; ordinary PRs use
squash. Never wait for every platform to be in review before integrating fixes
into `main`. Keep immutable tags and consumed build identities unchanged.
Store state changes alone do not bump either version file.

For a hotfix to an older version, branch from its exact platform tag and
explicitly allocate new store build identities. Do not roll back `main`'s
development target. Merge the reviewed hotfix record forward according to the
release-source policy.
