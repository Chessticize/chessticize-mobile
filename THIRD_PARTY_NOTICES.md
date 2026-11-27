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

## Lichess chess piece sets

The optional chess piece sprite sheets under `apps/mobile/src/assets/pieces/`
are rasterized from license-verified SVG artwork in `lichess-org/lila` at
upstream commit `47948db658a1678d14e97d41c1bcf82958e70ded` using
`apps/mobile/scripts/build-chess-piece-sprites.mjs`. The default piece sprite
(`apps/mobile/src/assets/chess-pieces-sprite.png`) comes from
`react-native-chessboard` (MIT).

- **Classic (`cburnett`)**
  - File shipped: `apps/mobile/src/assets/pieces/cburnett.png`
  - Author: Colin M.L. Burnett
  - License: GNU General Public License v2.0 or later (GPLv2+; https://www.gnu.org/licenses/gpl-2.0.txt)
  - Source: https://github.com/lichess-org/lila/tree/47948db658a1678d14e97d41c1bcf82958e70ded/public/piece/cburnett

- **Merida (`merida`)**
  - File shipped: `apps/mobile/src/assets/pieces/merida.png`
  - Author: Armando Hernandez Marroquin
  - License: GNU General Public License v2.0 or later (GPLv2+; https://www.gnu.org/licenses/gpl-2.0.txt)
  - Source: https://github.com/lichess-org/lila/tree/47948db658a1678d14e97d41c1bcf82958e70ded/public/piece/merida

- **Chessnut (`chessnut`)**
  - File shipped: `apps/mobile/src/assets/pieces/chessnut.png`
  - Author: Alexis Luengas
  - License: Apache License 2.0 (https://github.com/LexLuengas/chessnut-pieces/blob/master/LICENSE.txt)
  - Source: https://github.com/lichess-org/lila/tree/47948db658a1678d14e97d41c1bcf82958e70ded/public/piece/chessnut

- **Spatial (`spatial`)**
  - File shipped: `apps/mobile/src/assets/pieces/spatial.png`
  - Author: Maurizio Monge
  - License: MIT (https://github.com/maurimo/chess-art/blob/main/LICENSE)
  - Source: https://github.com/lichess-org/lila/tree/47948db658a1678d14e97d41c1bcf82958e70ded/public/piece/spatial

- **Fantasy (`fantasy`)**
  - File shipped: `apps/mobile/src/assets/pieces/fantasy.png`
  - Author: Maurizio Monge
  - License: MIT (https://github.com/maurimo/chess-art/blob/main/LICENSE)
  - Source: https://github.com/lichess-org/lila/tree/47948db658a1678d14e97d41c1bcf82958e70ded/public/piece/fantasy

## Lichess puzzle database

- Name: Lichess puzzle database
- License: CC0
- Source: https://database.lichess.org/#puzzles
- Notes: Chessticize Mobile's bundled puzzle pack is derived from Lichess
  puzzle data and Chessticize presolve metadata for offline play.

## Freesound move feedback audio

- Files:
  - `apps/mobile-lab/public/audio/issue-247/freesound-546119-piece-placement.mp3`
  - `apps/mobile-lab/public/audio/issue-247/freesound-546120-piece-capture.mp3`
- Original names: `Piece Placement.mp3` and `Piece Capture.mp3`
- Creator: `el_boss`
- License: CC0 1.0
- Sources:
  - https://freesound.org/people/el_boss/sounds/546119/
  - https://freesound.org/people/el_boss/sounds/546120/
- Notes: These assets are bundled for the native Move and Capture feedback and
  are also used by the Issue #247 Interaction Lab story. Capture playback uses
  `0.3` linear volume. The exact download URLs and file hashes are recorded
  beside the assets.

## Material Symbols icon subset

- Name: Material Symbols Rounded (Google)
- Files shipped:
  - `apps/mobile/android/app/src/main/assets/fonts/ChessticizeSymbols.ttf`
  - `apps/mobile/android/app/src/main/assets/fonts/ChessticizeSymbols-LICENSE.txt`
  - `apps/mobile/android/app/src/main/res/drawable/ic_tab_*.xml` (the tab
    glyphs as vector drawables for the native Android bottom navigation)
- License: Apache License 2.0; the full text ships beside the font.
- Source: https://github.com/google/material-design-icons/tree/master/variablefont
- Notes: The Android app and the Interaction Lab draw interface icons from this
  subset. It contains only the glyphs named in
  `apps/mobile/src/components/ui/iconNames.ts`, pinned to the outlined, regular
  weight, 24 dp optical size, and renamed `ChessticizeSymbols`.
  `apps/mobile/scripts/build-material-symbols-subset.py` rebuilds it. On iOS the
  same icons are Apple SF Symbols drawn through the system API; no SF Symbols
  artwork is redistributed.

## Google Play In-App Review

- Package: `com.google.android.play:review`
- Version shipped: `2.0.2`
- Source: https://developer.android.com/guide/playcore/in-app-review/kotlin-java
- Terms: https://developer.android.com/guide/playcore/license
- Notes: Android invokes Google Play's system-owned review flow after a local
  puzzle milestone. The flow may finish without showing a sheet or receiving a
  review; Chessticize does not use its outcome for product behavior.

## react-native-chessboard

- Package: `react-native-chessboard`
- Version shipped: `0.2.0`
- License: MIT, as published by the package
- Source package: https://www.npmjs.com/package/react-native-chessboard
- Notes: Chessticize Mobile uses this package for board rendering and applies a
  local patch from `patches/react-native-chessboard@0.2.0.patch`.

## Puzzle extraction, win-chances, and tactical motif tagger

The on-device game-puzzle extractor, Arrow Duel caliber verifier, and tactical
motif tagger under `packages/core/src/game-puzzles/` are ported and adapted from
MIT-licensed chess puzzle analysis and tagging projects, plus Lichess's
published win-chances curve:

- **lichess-org/puzzler**
  - Copyright: Original work Copyright 2020 lichess.org
  - License: MIT License
  - Source: https://github.com/lichess-org/puzzler
  - Notes: Original puzzle generator (`cook_mate`, `cook_advantage`, `is_valid_attack`) and tactical motif tagger (`cook`, `util`, `zugzwang`).

- **lychee-org/retagger**
  - Copyright: Forked work Copyright 2023 lychee-org
  - License: MIT License
  - Source: https://github.com/lychee-org/retagger
  - Notes: Forked puzzle tagging pipeline upon which `chessticize-worker`'s tagger was built.

- **lichess-org/lila**
  - Source: https://github.com/lichess-org/lila/pull/11148
  - Notes: Win-chances sigmoid formula (`2 / (1 + exp(-0.00368208 * cp)) - 1`) used for outcome-changing swing and Arrow Duel caliber thresholds.

- **Chessticize/chessticize-worker**
  - Copyright: Modified work Copyright 2024-2026 chessticize.com
  - License: MIT License
  - Source: https://github.com/Chessticize/chessticize-worker
  - Notes: Adapted puzzle extraction, 8-case game-moment classification, Arrow Duel verification, clock-metric parsing, and PR #26/#27 tagger fixes ported to pure TypeScript in `packages/core/src/game-puzzles/`.

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
| `react-native-screens` | `4.30.1` | MIT | https://github.com/software-mansion/react-native-screens |
| `react-native-worklets` | `0.9.2` | MIT | https://github.com/software-mansion/react-native-reanimated |
| `chess.js` | `1.4.0` | BSD-2-Clause | https://github.com/jhlywa/chess.js |

The React Native `0.86.0` package has a local build-path portability fix in
`patches/react-native@0.86.0.patch`. It replaces an absolute Hermes compiler
path in the evaluated CocoaPods specification with a stable `PODS_ROOT`-based
path; it does not change app behavior.

The `react-native-screens` `4.30.1` package has a local patch in
`patches/react-native-screens@4.30.1.patch`. It carries each tab's test ID onto
the iOS `UITab` so the iPad floating tab bar exposes it.

Before each App Store submission, refresh this inventory against the exact
lockfile used for the submitted build.
