# Next Move: App Store creative assets

A static Header/Search Results pair for Chessticize. Warm-white porcelain,
frosted icy-blue pieces, and one saturated blue tactical accent continue the
Photo Studio A screenshot campaign. These are illustrative brand artworks,
not app screenshots or a claim that this is an actual captured game position.

| Placement | File | Export |
| --- | --- | --- |
| Product page header | `header-3840x1646-v1.png` | 3840 × 1646 RGB PNG |
| Search results | `search-results-3840x2560-v1.png` | 3840 × 2560 RGB PNG |

The Search Results illustration shows a knight choosing between two legal
2-rank/1-file destinations on a 5 × 5 board excerpt. It does not assert a
complete legal game position or which candidate is best. The two arrows are
move-path illustrations rather than in-app UI.

## Source and export

Created with built-in `image_gen`; the generation and refinement prompts are
retained in `prompts.json`; the selected original PNGs are preserved in
`source/`. Selected generated resolutions were 1914 × 822 for
the Header and 1536 × 1024 for Search Results. Sharp resized each image to the
required upload dimensions, removed alpha, and exported sRGB RGB PNGs. No
app UI was generated or retouched. `manifest.json` records the original-image
hashes and dimensions, final hashes, exact Apple spec IDs, template hashes,
ASC asset IDs, and safe-area geometry.

Apple's official Photoshop templates were downloaded on 2026-11-10:

- [Header template](https://devimages-cdn.apple.com/design/resources/download/app-store/creative_assets-product_page_header_template-static.psd)
- [Search Results template](https://devimages-cdn.apple.com/design/resources/download/app-store/creative_assets-search_results_template-static.psd)
- [Creative specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications)
- [Asset best practices](https://developer.apple.com/app-store/asset-best-practices/)

The Header template's Art Safe Area is `(1097, 493)–(2743, 1154)`, and Search
Results is `(836, 765)–(3004, 1795)`, in each final image's pixels. The two
`*-safe-area.jpg` files show those exact conservative crops. The complete
knight, secondary pieces, and Search Results arrowheads remain visible.
These proofs check the template crop, not the final live App Store rendering.

## App Store Connect delivery

The pair was uploaded to the app's Asset Library as `CREATIVE_ASSETS` and
submitted together on 2026-11-10. Both API states were verified as
`WAITING_FOR_REVIEW`; ASC displayed **2 Items Submitted**. The standalone
submission is [fb78cb6e-f568-4119-838c-fe01077fac8e](https://appstoreconnect.apple.com/apps/6788610123/distribution/reviewsubmissions/details/fb78cb6e-f568-4119-838c-fe01077fac8e).
The public placements have not been enabled. Apple
recognized the dedicated Header (21:9) and Search Results (3:2) specifications.
The current API key permits reads but rejected creative-image reservation with
403, so the logged-in App Store Connect UI was used for upload.

For an already released version, App Store Connect permits choosing approved
assets only. Standalone asset review must finish before the pair can be
selected for the live 1.6.0 Header/Search Results placements and checked using
ASC's device preview. Approval, placement, publication, and physical-device
acceptance must be recorded separately; upload alone does not establish them.

See [Apple's standalone asset-review workflow](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-assets-from-asset-library)
and [updating a live version's creative assets](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-your-app-store-assets).
