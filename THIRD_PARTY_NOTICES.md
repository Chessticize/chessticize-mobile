# Third-Party Notices

This file summarizes third-party software and data that are shipped with, used
by, or directly material to Chessticize Mobile 1.0. It is not a substitute for
the complete license texts shipped in this repository.

## Stockfish

- Name: Stockfish
- Version shipped: Stockfish 18
- Upstream release tag: `sf_18`
- Upstream tag commit: `cb3d4ee9b47d0c5aae855b12379378ea1439675c`
- Package version: `ChessticizeStockfish` pod `18.0.0`
- Authors: The Stockfish developers
- License: GNU General Public License v3.0 or later
- Source included in this repository:
  `apps/mobile/native/stockfish/Stockfish/src`
- License text included in this repository:
  `apps/mobile/native/stockfish/Copying.txt`
- Authors file included in this repository:
  `apps/mobile/native/stockfish/AUTHORS`
- Upstream source: https://github.com/official-stockfish/Stockfish
- Notes: Chessticize Mobile embeds Stockfish for offline analysis. The public
  source for each submitted App Store binary must be available from a matching
  repository release tag.

## Stockfish NNUE networks

- Files shipped:
  - `apps/mobile/native/stockfish/Resources/nn-c288c895ea92.nnue`
  - `apps/mobile/native/stockfish/Resources/nn-37f18f62d772.nnue`
- Related project: Stockfish NNUE evaluation networks
- Notes: Stockfish documentation states that Stockfish uses neural networks
  trained on data provided by the Leela Chess Zero project under the Open
  Database License. These network files are bundled with the embedded engine.

## Lichess puzzle database

- Name: Lichess puzzle database
- License: CC0
- Source: https://database.lichess.org/#puzzles
- Notes: Chessticize Mobile's bundled puzzle pack is derived from Lichess
  puzzle data and Chessticize presolve metadata for offline play.

## Freesound Issue #247 Storybook demo audio

- Files:
  - `apps/mobile-lab/public/audio/issue-247/freesound-546119-piece-placement.mp3`
  - `apps/mobile-lab/public/audio/issue-247/freesound-546120-piece-capture.mp3`
- Original names: `Piece Placement.mp3` and `Piece Capture.mp3`
- Creator: `el_boss`
- License: CC0 1.0
- Sources:
  - https://freesound.org/people/el_boss/sounds/546119/
  - https://freesound.org/people/el_boss/sounds/546120/
- Notes: These are development-only design-review assets for the Issue #247
  Interaction Lab story and are not yet wired into the native product. The
  exact download URLs and file hashes are recorded beside the assets.

## react-native-chessboard

- Package: `react-native-chessboard`
- Version shipped: `0.2.0`
- License: MIT, as published by the package
- Source package: https://www.npmjs.com/package/react-native-chessboard
- Notes: Chessticize Mobile uses this package for board rendering and applies a
  local patch from `patches/react-native-chessboard@0.2.0.patch`.

## React Native and mobile runtime package inventory

The app is built with React Native and related open-source packages. The
installed package manifests currently report:

| Package | Version | License | Source |
| --- | --- | --- | --- |
| `react` | `19.2.3` | MIT | https://github.com/facebook/react |
| `react-native` | `0.86.0` | MIT | https://github.com/facebook/react-native |
| `@op-engineering/op-sqlite` | `17.1.1` | MIT | https://github.com/OP-Engineering/op-sqlite |
| `@shopify/react-native-skia` | `2.6.5` | MIT | https://github.com/Shopify/react-native-skia |
| `react-native-chessboard` | `0.2.0` | MIT | https://github.com/enzomanuelmangano/react-native-chessboard |
| `react-native-gesture-handler` | `3.0.2` | MIT | https://github.com/software-mansion/react-native-gesture-handler |
| `react-native-reanimated` | `4.4.1` | MIT | https://github.com/software-mansion/react-native-reanimated |
| `react-native-safe-area-context` | `5.8.0` | MIT | https://github.com/AppAndFlow/react-native-safe-area-context |
| `react-native-worklets` | `0.9.2` | MIT | https://github.com/software-mansion/react-native-reanimated |
| `chess.js` | `1.4.0` | BSD-2-Clause | https://github.com/jhlywa/chess.js |

The React Native `0.86.0` package has a local build-path portability fix in
`patches/react-native@0.86.0.patch`. It replaces an absolute Hermes compiler
path in the evaluated CocoaPods specification with a stable `PODS_ROOT`-based
path; it does not change app behavior.

Before each App Store submission, refresh this inventory against the exact
lockfile used for the submitted build.
