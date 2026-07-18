#!/usr/bin/env bash

set -euo pipefail

case "$(basename "$0")" in
  aapt2)
    printf "package: name='com.chessticize.mobile' versionCode='%s' versionName='%s'\n" \
      "$FAKE_VERSION_CODE" "$FAKE_PUBLIC_VERSION"
    ;;
  apksigner)
    printf 'Signer #1 certificate SHA-256 digest: %s\nNumber of signers: 1\n' \
      "$FAKE_SIGNING_CERTIFICATE_SHA256"
    ;;
  zipalign)
    ;;
  llvm-readelf)
    printf '  LOAD 0x000000 0x000000 0x000000 0x000001 0x000001 R E 0x4000\n'
    ;;
  *)
    printf 'Unexpected fake Android release tool: %s\n' "$(basename "$0")" >&2
    exit 1
    ;;
esac
