# Android Feature Graphic Source

The approved Google Play feature graphic combines a fixed studio background
with an immutable 1080 x 1920 Android product capture. The deterministic Swift
renderer owns the generic handset, centered circular punch hole, screen mask,
and final opaque 1024 x 500 RGB export.

## Approved inputs

- `feature-graphic-source.png` is the fixed 1794 x 877 warm-white and icy-blue
  chess studio background. It contains the approved English copy, feature
  line, and `NO ADS · NO PAYWALLS` badge. SHA-256:
  `4d35fd8173edc8893a7e0507114bf1d5896faa5e80b17f0a05e2cd201def0b5d`.
- `feature-graphic-arrow-duel-capture.png` is an immutable current-app Android
  capture at 1080 x 1920. It was captured from source commit
  `eadcffd264c926c6812d49012f2b1c87311639e3` with the repository's API 36
  Detox build and the deterministic `03wH4` Arrow Duel fixture. The position
  shows White's queen, rook, and bishop attacking the black king with the two
  real candidate arrows `c3e4` and `h4f6`. SHA-256:
  `f8ff565953c1ea8fc84547124dd3f2d87a4d88bb6adcbae1b75962abe22d1218`.

The screenshot is product evidence, not generated UI. It contains no username,
personal rating, real history, or account data. The studio background is a
reviewed Imagegen plate and is never regenerated during export.

## Approved copy

- `Chessticize`
- `Build Tactical Intuition`
- `Practice. Review. Improve.`
- `Puzzle Sprints · Custom Practice · Track Progress`
- `NO ADS · NO PAYWALLS`

## Regeneration

Run:

```sh
/usr/bin/swift apps/mobile/store-assets/android/render-feature-graphic.swift \
  apps/mobile/store-assets/android/feature-graphic-1024x500.png
```

The approved output SHA-256 is
`716834cbac386f122f156a386ee0e380d8f94ac1338a063d7d02cf743ed3bd34`.
The export must remain a 1024 x 500, 8-bit RGB PNG without an alpha channel.
