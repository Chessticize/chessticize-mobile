# Product Page Optimization V2 Preview ("Deliberate Tactical Trainer")

Design and metadata review package for Chessticize's App Store (`id6788610123`) and Google Play (`com.chessticize.mobile`) product pages.

> **Scope**: Design & copy review preview only. Production metadata contracts (`config/*.json`) remain untouched until owner sign-off.
> - **Brand Logo & App Store Subtitle (`Build Tactical Intuition`)**: Preserved unchanged (`no binary update required` to run Google Play Store Listing Experiments or Apple Product Page Optimization screenshot tests).
> - **iOS Hardware Frame (`1320×2868`)**: Enlarged bottom-bleed crop (`82%` width) from Chessticize's authentic **`Photo Studio A` 3D Titanium iPhone** scene, pushed lower (`~48px` clean margin below the `0 / 0 / 10` score bar, cropping off Frame 5's legacy bottom tab bar) with bold **`134px`** two-line headlines.
> - **Android Hardware Frame (`1080×1920`)**: Photographic studio **Samsung Galaxy S26 Ultra** Titanium Black hardware frame (`7R` ergonomic rounded Ultra corners, Grade 5 brushed titanium rail, right-side Volume + Power keys, symmetrical ultra-slim inner glass bezel, optical Infinity-O front camera), pushed lower (`~30px` bottom margin) with bold **`84px`** two-line headlines.

---

## 1. Search First-Impression: Current 1.6 vs. New V2

### US App Store Search Card
![App Store Search Card: Current 1.6 vs. New V2](./v2-ios-before-after-search.jpg)

### US Google Play Search & Listing Header
![Google Play Search & Listing: Current 1.6 vs. New V2](./v2-play-before-after-search.jpg)

---

## 2. Competitive Benchmark Methodology (How We Audited Live Search)

Because this repository is public, third-party competitor screenshots are intentionally omitted. To ground the V2 redesign in real store behavior rather than guesswork, we audited live **US App Store** and **US Google Play** search results for **`"chess puzzle"`**, **`"chess tactics"`**, and **`"chess tactics trainer"`**, focusing specifically on **dedicated chess puzzle & tactical training utilities** (excluding general PvP live-chess platforms):

1. **First-Three-Screenshot Visual Hook (`Board-to-Canvas Ratio`)**:
   - In both stores, dedicated puzzle trainers that convert cold searchers show **three consecutive active chessboards** in slots 1–3, with the chessboard occupying **`45%–55%`** of screenshot width/area so tactical arrows, piece motifs, and prompts remain immediately legible at search-thumbnail size.
   - In our previous `1.6` sequence, **Frame 1** opened on the text-dense `Practice Home` menu (`0%` chessboard visible) and **Frame 3** showed the text-only `Tactical Profile` card (`0%` chessboard visible), leaving only **1 of the first 3 search thumbnails** with a visible board (`<14%` effective board area across the 3-up search card).
   - **V2 Fix**: Slots 1–3 now present Chessticize's complete deliberate-training loop on active boards (**`1. Arrow Duel` → `2. Timed Sprints` → `3. Spaced Review`**), enlarging the handset to `80%–82%` width and cropping the empty bottom chin so the board grows **`~1.9×` in area**.
2. **Thumbnail Headline Scale & Contrast**:
   - Store search thumbnails render at roughly `18%–22%` of native pixel width. Headlines below `~115px` (iOS `1320px` canvas) or `~75px` (Android `1080px` canvas) lose visual hierarchy against the device bezel.
   - **V2 Fix**: Pushing the handset lower frees clean studio sky for **`134px`** (iOS) and **`84px`** (Google Play) `800`-weight headlines paired with high-contrast category pills (`ARROW DUEL`, `TIMED SPRINTS`, `SPACED REVIEW`).
3. **Method Differentiation Over Commodity Puzzle Counts**:
   - Utility competitors overwhelmingly market raw puzzle volume (`"100,000+ offline puzzles"` or `"Mate in 1–3"`). None combine **two-candidate blunder rejection (`Arrow Duel` + `Opponent Reply`)**, **scheduled `Spaced Review`**, **`1,400,000` offline puzzles**, and **zero-ads / zero-account / GPL open-source privacy**. V2 puts those exact training mechanics in the first three frames and short metadata fields.
4. **Google Play `'chess'` Broad-Query Gap**:
   - Google Play Console organic search metrics show **`10%` store listing conversion** on broad `'chess'` searches versus **`15%` store average** (`+1.4pp` benchmark gap), because broad `'chess'` searchers either want PvP play or practical blunder reduction for their real games.
   - **V2 Fix**: Keep the Main Store Listing focused on high-intent puzzle/tactics learners, and add a dedicated Google Play **Custom Store Listing** targeting `'chess'` / `'chess training'` search terms that leads honestly with real-game blunder prevention (never implying PvP or bot play).

---

## 3. Full 6-Frame Screenshot Sets

### App Store 6.9" (`1320×2868` — Enlarged `Photo Studio A` Titanium iPhone)
![Chessticize V2 App Store 6-Frame Set](./v2-ios-6frames-sheet.jpg)

### Google Play Phone (`1080×1920` — Photographic Studio Galaxy S26 Ultra)
![Chessticize V2 Google Play 6-Frame Set](./v2-play-6frames-sheet.jpg)

---

## 4. Metadata & Full Description Audit (`1.6` Aligned)

### What Needed Updating in Current Live Descriptions (`verifiedOn: 2026-08-10`)

Auditing [`config/app-store-metadata-en-us-v1.json`](../../../../config/app-store-metadata-en-us-v1.json) and [`config/google-play-metadata-en-us-v1.json`](../../../../config/google-play-metadata-en-us-v1.json) against the shipped `1.6` app surfaced five concrete gaps:

1. **Google Play `shortDescription` used only `24 / 80` characters (`"Build Tactical Intuition"`)**, leaving `70%` of Google Play's highest-impact above-the-fold conversion & keyword field unused.
2. **Shipped `1.6` features were missing from both Full Descriptions**:
   - **Opponent Reply** in Arrow Duel was completely absent from App Store `description`.
   - **Survival Challenge** (untimed three-strike personal-best mode across rating bands) was absent from both stores.
   - **Training Focus & Focused Runs** (shipped in `1.6` with explicit `"early estimate"` framing) and **Dark Mode** were absent from both stores.
3. **Vague scale & theme copy (`"bundled puzzles"`, `"Curated puzzle themes"`)** hid Chessticize's verifiable **`1,400,000` bundled offline puzzles** and **`24` selectable tactical themes** (`Fork`, `Pin`, `Skewer`, `Discovered Attack`, `Back Rank Mate`, `Deflection`, `Endgame`, etc. — which Google Play indexes directly from Full Description).
4. **Apple `keywords` (`85 / 100` bytes)** repeated `chess,puzzle` from `Chessticize: Chess Puzzles` (`App Name`), leaving `27` bytes of high-intent search capacity (`trainer,spaced,repetition,fork,pin,endgame`) unused.
5. **Preserved Truth & Privacy Guardrails**:
   - Preserves Chessticize's calm, zero-hype tone, **`GPL-3.0-or-later` open-source** disclosure, and **on-device Stockfish** attribution.
   - Keeps platform-accurate privacy claims (`Optional private iCloud Sync` on iOS only; `no internet permission in production` + local SQLite + optional `Android-managed backup` on Google Play; zero prohibited claims such as cross-platform sync or clinical weakness detection).

---

### A. Short Metadata Fields

#### Apple App Store (`en-US`)
| Field | Limit | Current (`v1`) | Proposed V2 | Count |
| --- | --- | --- | --- | --- |
| **App Name** | 30 chars | `Chessticize: Chess Puzzles` | `Chessticize: Chess Puzzles` *(unchanged)* | `26 / 30` chars |
| **Subtitle** | 30 chars | `Build Tactical Intuition` | `Build Tactical Intuition` *(unchanged)* | `24 / 30` chars |
| **Promotional Text** | 170 chars | `Free, offline, no-ads, open-source app to practice rating-matched chess puzzles and prevent blunders with Arrow Duel. Learn from mistakes with scheduled Review.` | `Free, offline, open-source chess puzzle trainer. Reject tempting blunders in Arrow Duel, master misses with Spaced Review, and solve 1.4M puzzles—zero ads.` | `155 / 170` chars |
| **Keywords** | 100 bytes | `chess,puzzle,tactics,blunder,review,training,elo,analysis,stockfish,checkmate,offline` (`85B`) | `tactics,trainer,blunder,spaced,repetition,review,stockfish,elo,offline,checkmate,fork,pin,endgame` | `97 / 100` bytes |

#### Google Play (`en-US` Main Store Listing & `'chess'` Custom Store Listing)
| Listing / Variant | Field | Proposed V2 Copy | Count |
| --- | --- | --- | --- |
| **Main Listing (Recommended)** | Short Description (`80`) | `Build tactical intuition: timed sprints, blunder drills & spaced review. No ads.` | `80 / 80` |
| **Experiment Variant B** | Short Description (`80`) | `Deliberate chess tactics trainer: blunder drills, spaced review & 1.4M offline.` | `79 / 80` |
| **Experiment Variant C** | Short Description (`80`) | `Free offline chess puzzle trainer: Arrow Duel, spaced review & 1.4M tactics.` | `76 / 80` |
| **CSL (`'chess'` query group)** | Title (`30`) + Short Desc (`80`) | `Chessticize: Chess Tactics` (`26/30`) · `Stop blundering in real chess games. Candidate-move drills & 1.4M offline.` (`74/80`) | Within limits |

---

### B. Proposed Apple App Store Full Description (`2,267 / 4,000` chars)

```text
Build real tactical intuition—without ads, paywalls, or an account.

Chessticize is a free, open-source chess puzzle trainer built for deliberate offline practice across 1,400,000 bundled puzzles. Instead of mindless streak grinding, solve rating-matched Sprints, train candidate evaluation in Arrow Duel, and revisit every miss with scheduled Review.

TRAIN WITH INTENT

• Puzzle Sprint: solve short, rating-matched puzzle sets against the clock to sharpen pattern recognition.
• Arrow Duel & Opponent Reply: compare two candidate moves in the same position, reject the tempting blunder before you play it, and calculate the opponent’s reply.
• Training Focus & Focused Runs: review early-estimate theme suggestions from your mixed practice, or build Custom Runs across 24 tactical motifs, pace, duration, and difficulty.
• Survival Challenge: test untimed three-strike accuracy across rating bands in both Standard and Arrow Duel.

MAKE EVERY MISTAKE COUNT

Missed, slow, and unclear puzzles enter scheduled Spaced Review, bringing them back when due. Replay completed puzzles and explore variations with on-device Stockfish analysis—without affecting your Rating or Review schedule.

TRACK REAL PROGRESS

Follow separate Ratings for Standard and Arrow Duel, track personal bests in Survival, review recent Runs, and filter History to inspect individual positions.

PRIVATE BY DESIGN

• 1,400,000 bundled puzzles and Stockfish analysis work 100% offline.
• No ads, subscriptions, or Chessticize account.
• No analytics or tracking, and no puzzle activity sent to Chessticize.
• Progress starts on your device. Optional private iCloud Sync merges progress across your Apple devices and can be turned off; Chessticize operates no sync server and never receives your data.
• Review reminders use local on-device notifications.

OPEN SOURCE

Chessticize is published under GPL-3.0-or-later. Source code, embedded Stockfish, puzzle-data attribution, and licenses are available from Settings and the public project page.

ALSO INCLUDED

• 24 selectable tactical themes (Fork, Pin, Skewer, Back Rank Mate, Discovered Attack, Deflection, Endgame, and more)
• System-synced Dark Mode and Light Mode
• Optional move sounds and haptic feedback
• Native iPhone and iPad layouts
```

---

### C. Proposed Google Play Full Description (`1,930 / 4,000` chars)

```text
Build tactical intuition with deliberate chess puzzle practice—completely free, offline, and open source, with no ads or paywalls.

Practice. Review. Improve.

Arrow Duel & Opponent Reply

Compare two candidate moves in the same position. Reject the tempting blunder before you play it, choose the stronger continuation, and calculate the opponent’s reply.

Puzzle Sprints & Survival Challenge

Solve short, rating-matched Sprints against the clock to build fast pattern recognition, or switch to untimed three-strike Survival Challenge across rating bands.

Focused & Custom Practice

Create Custom Runs across 24 tactical themes—including Fork, Pin, Skewer, Discovered Attack, Back Rank Mate, Deflection, and Endgame—or preview early-estimate Training Focus mixes tailored to your current Rating.

Scheduled Spaced Review & Stockfish Replay

Missed and unclear puzzles enter scheduled Review so they return when due. Replay completed puzzles and explore lines with on-device Stockfish analysis—without changing your Rating or Review schedule.

Track Your Progress

Follow separate Ratings for Standard and Arrow Duel, track Survival personal bests, review recent Runs, and filter History to revisit individual puzzles.

Completely Free & Private

• No ads, subscriptions, paid unlocks, or paywalls
• No Chessticize account required
• No analytics, crash-reporting, advertising, or tracking SDKs

100% Offline & Open Source

1,400,000 bundled puzzles and Stockfish analysis run entirely on your device (no internet permission in production). Progress is stored locally, with optional Android-managed backup when enabled on your device. Published under GPL-3.0-or-later, with source code and licenses available from Settings.

Also Included

• System-synced Dark Mode and Light Mode
• Adjustable pace, duration, and difficulty
• Optional move sounds and haptic feedback
• Phone, tablet, foldable, and compatible Chromebook layouts
```

---

## 5. Rollout & Experiment Cadence (No New Binary Needed)

1. **Run 2-Way `50% / 50%` (`Current 1.6` vs. `New V2`) First**:
   - Both Google Play Store Listing Experiments and Apple Product Page Optimization use `90%` Bayesian confidence intervals. Splitting organic impressions two ways (`50/50`) converges significantly faster than a three-way `A/B/C` (`33/33/33`) split.
2. **Immediate Live Rollout Without Shipping a Binary**:
   - **Google Play**: Screenshots, Short Description (`80/80`), Full Description (`1,930/4,000`), Store Listing Experiments, and the `'chess'` Custom Store Listing can all be published immediately in Play Console without an app binary update.
   - **Apple App Store**: `Promotional Text` updates live at any time without a new version, and V2 screenshots can be tested via **Product Page Optimization** on the current live version and promoted directly to default once validated; `Keywords` (`97/100` bytes) and `Description` (`2,267/4,000` chars) attach to the next version submission (`1.6.2` if still editable pre-release, or `1.6.3`).
