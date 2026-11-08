#!/usr/bin/env bash
set -euo pipefail

# Thin entry point. The device flow is Debug + Dev identity only and does not
# depend on any Simulator (see issue 646).
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

exec node scripts/ios-run-dev-device.js "$@"
