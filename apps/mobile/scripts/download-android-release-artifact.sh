#!/usr/bin/env bash

set -euo pipefail

if [[ "$#" -lt 5 || "$#" -gt 7 ]]; then
  echo "Usage: download-android-release-artifact.sh <artifact-id> <workflow-path> <name-template> <destination> <archive> [expected-head-sha] [allow-failed-run]" >&2
  exit 2
fi

artifact_id="$1"
expected_workflow_path="$2"
expected_name_template="$3"
destination="$4"
archive="$5"

: "${GH_TOKEN:?GH_TOKEN is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

expected_head_sha="${6:-$GITHUB_SHA}"
run_policy="${7:-require-success}"
if ! [[ "$expected_head_sha" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "Expected artifact workflow head must be an exact commit SHA." >&2
  exit 1
fi
expected_head_sha="$(printf '%s' "$expected_head_sha" | tr '[:upper:]' '[:lower:]')"

if ! [[ "$artifact_id" =~ ^[1-9][0-9]*$ ]]; then
  echo "Artifact ID must be a positive integer." >&2
  exit 1
fi

metadata="$(gh api "repos/${GITHUB_REPOSITORY}/actions/artifacts/${artifact_id}")"
test "$(printf '%s' "$metadata" | jq -r .expired)" = false
name="$(printf '%s' "$metadata" | jq -r .name)"
run_id="$(printf '%s' "$metadata" | jq -r .workflow_run.id)"
if ! [[ "$run_id" =~ ^[1-9][0-9]*$ ]]; then
  echo "Artifact workflow run ID must be a positive integer." >&2
  exit 1
fi

run="$(gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${run_id}")"
test "$(printf '%s' "$run" | jq -r .path)" = "$expected_workflow_path"
test "$(printf '%s' "$run" | jq -r .event)" = "workflow_dispatch"
run_conclusion="$(printf '%s' "$run" | jq -r .conclusion)"
if [[ "$run_policy" = "allow-failed-run" ]]; then
  [[ "$run_conclusion" = "success" || "$run_conclusion" = "failure" ]]
else
  test "$run_policy" = "require-success"
  test "$run_conclusion" = "success"
fi
test "$(printf '%s' "$run" | jq -r .head_sha)" = "$expected_head_sha"

expected_name="${expected_name_template//\{run_id\}/$run_id}"
expected_name="${expected_name//\{sha\}/$expected_head_sha}"
test "$name" = "$expected_name"

digest="$(printf '%s' "$metadata" | jq -r .digest)"
if ! [[ "$digest" =~ ^sha256:[0-9a-fA-F]{64}$ ]]; then
  echo "Artifact digest must be an exact SHA-256 value." >&2
  exit 1
fi
archive_sha256="$(printf '%s' "${digest#sha256:}" | tr '[:upper:]' '[:lower:]')"

mkdir -p "$destination"
gh api "repos/${GITHUB_REPOSITORY}/actions/artifacts/${artifact_id}/zip" > "$archive"
if sha256sum --help 2>&1 | grep -q -- '--check'; then
  printf '%s  %s\n' "$archive_sha256" "$archive" | sha256sum --check
else
  printf '%s  %s\n' "$archive_sha256" "$archive" | shasum -a 256 --check
fi
unzip -q "$archive" -d "$destination"

{
  echo "run_id=$run_id"
  echo "artifact_id=$artifact_id"
  echo "artifact_name=$name"
  echo "archive_sha256=$archive_sha256"
} >> "$GITHUB_OUTPUT"
