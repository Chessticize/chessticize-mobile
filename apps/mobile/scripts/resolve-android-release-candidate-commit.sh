#!/usr/bin/env bash

set -euo pipefail

if [[ "$#" -ne 2 ]]; then
  echo "Usage: resolve-android-release-candidate-commit.sh <public-version> <version-code>" >&2
  exit 2
fi

public_version="$1"
version_code="$2"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! [[ "$version_code" =~ ^[1-9][0-9]*$ ]]; then
  echo "Android version code must be a positive integer." >&2
  exit 1
fi

canonical_tag="$(node -e '
  const { canonicalAndroidSourceTag } = require(process.argv[1]);
  const versionCode = Number(process.argv[3]);
  if (!Number.isSafeInteger(versionCode)) {
    throw new Error("Android version code must be a safe integer.");
  }
  process.stdout.write(canonicalAndroidSourceTag(process.argv[2], versionCode));
' "$script_dir/android-play-release.js" "$public_version" "$version_code")"
tag_ref="refs/tags/$canonical_tag"

git fetch --quiet --no-tags origin "$tag_ref:$tag_ref"
tag_type="$(git cat-file -t "$tag_ref" 2>/dev/null || true)"
if [[ "$tag_type" != "tag" ]]; then
  echo "Canonical Android tag $canonical_tag must be an annotated tag." >&2
  exit 1
fi

candidate_commit="$(git rev-parse --verify "${tag_ref}^{commit}")"
if ! [[ "$candidate_commit" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "Canonical Android tag did not resolve to an exact commit SHA." >&2
  exit 1
fi

printf '%s\n' "$candidate_commit" | tr '[:upper:]' '[:lower:]'
