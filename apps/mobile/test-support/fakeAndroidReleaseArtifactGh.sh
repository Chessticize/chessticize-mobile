#!/usr/bin/env bash

set -euo pipefail

case "${2:-}" in
  repos/*/actions/artifacts/123)
    printf '{"expired":false,"name":"android-source-draft-456","workflow_run":{"id":456},"digest":"sha256:%s"}' \
      "$FAKE_SINGLE_ARCHIVE_SHA256"
    ;;
  repos/*/actions/artifacts/201)
    printf '{"expired":false,"name":"android-signed-release-candidate-%s","workflow_run":{"id":301},"digest":"sha256:%s"}' \
      "$FAKE_COMMIT_SHA" "$FAKE_CANDIDATE_ARCHIVE_SHA256"
    ;;
  repos/*/actions/artifacts/202)
    printf '{"expired":false,"name":"android-source-publication-302","workflow_run":{"id":302},"digest":"sha256:%s"}' \
      "$FAKE_SOURCE_ARCHIVE_SHA256"
    ;;
  repos/*/actions/artifacts/203)
    printf '{"expired":false,"name":"android-binary-preparation-303","workflow_run":{"id":303},"digest":"sha256:%s"}' \
      "$FAKE_BINARY_ARCHIVE_SHA256"
    ;;
  repos/*/actions/runs/301)
    printf '{"path":".github/workflows/mobile-android-release-candidate.yml","event":"workflow_dispatch","conclusion":"success","head_sha":"%s"}' \
      "$FAKE_COMMIT_SHA"
    ;;
  repos/*/actions/runs/456)
    printf '{"path":".github/workflows/mobile-android-github-release.yml","event":"workflow_dispatch","conclusion":"success","head_sha":"%s"}' \
      "$GITHUB_SHA"
    ;;
  repos/*/actions/runs/302 | repos/*/actions/runs/303)
    printf '{"path":".github/workflows/mobile-android-github-release.yml","event":"workflow_dispatch","conclusion":"success","head_sha":"%s"}' \
      "$GITHUB_SHA"
    ;;
  repos/*/actions/artifacts/201/zip)
    command cat "$FAKE_CANDIDATE_ARCHIVE"
    ;;
  repos/*/actions/artifacts/202/zip)
    command cat "$FAKE_SOURCE_ARCHIVE"
    ;;
  repos/*/actions/artifacts/203/zip)
    command cat "$FAKE_BINARY_ARCHIVE"
    ;;
  repos/*/actions/artifacts/123/zip)
    command cat "$FAKE_SINGLE_ARCHIVE"
    ;;
  *)
    printf 'Unexpected fake gh request: %s\n' "${2:-missing}" >&2
    exit 1
    ;;
esac
