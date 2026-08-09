#!/usr/bin/env bash
set -euo pipefail

manifest_path="${SRCROOT}/../../../fixtures/puzzles/bundled-core-pack.manifest.json"
resources_directory="${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}"
legacy_resource="${resources_directory}/bundled-core-pack.sqlite"

pack_version="$(
  /usr/bin/sed -nE \
    's/^[[:space:]]*"packVersion"[[:space:]]*:[[:space:]]*([1-9][0-9]*)[[:space:]]*,?[[:space:]]*$/\1/p' \
    "${manifest_path}"
)"

if [[ ! "${pack_version}" =~ ^[1-9][0-9]*$ ]]; then
  echo "error: Core Pack manifest must declare one positive integer packVersion" >&2
  exit 1
fi

versioned_resource="${resources_directory}/bundled-core-pack-v${pack_version}.sqlite"

if [[ -f "${legacy_resource}" ]]; then
  /bin/mv -f "${legacy_resource}" "${versioned_resource}"
elif [[ ! -f "${versioned_resource}" ]]; then
  echo "error: Xcode did not copy the bundled Core Pack resource" >&2
  exit 1
fi

for obsolete_resource in "${resources_directory}"/bundled-core-pack-v*.sqlite; do
  if [[ -f "${obsolete_resource}" && "${obsolete_resource}" != "${versioned_resource}" ]]; then
    /bin/rm -f "${obsolete_resource}"
  fi
done
