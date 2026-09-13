# Record shelf refinements

The reference uses full-bleed artwork, thin clear bags with small irregular folds at the corners and opening, soft contact shadows on wooden shelves, and small company/store stickers on the front of the bag. The preview follows those physical cues while retaining the dark wall and protruding vinyl design.

The root and body have explicit dark fallback backgrounds, dark color-scheme and overscroll suppression. Wall lighting and grain live together in one fixed background within the body's isolated stacking context. This avoids the white canvas visible during edge overscroll and a grain layer appearing to slide separately from the lighting.

The user supplied a red EMI / 百代 logo to replace the earlier Rock Records choice. This is a decorative visual treatment, not a change to the tracks' artist or publisher metadata or a claim of label affiliation.

Active sticker asset: `assets/images/emi-records-sticker.png`, copied unchanged from the user's attached reference. CSS gently reduces saturation and brightness to match the warm shelf lighting, adds paper wear and shallow contact shadows, and varies placement and rotation deterministically per song. The supplied logo lettering is preserved, with no generated replacement.

The earlier, now unused Rock Records image remains at `assets/images/rock-records-sticker.jpg`. It was visually verified from a Baidu image-search result, not an official brand kit: https://img2.baidu.com/it/u=3638411241,989464791&fm=253&fmt=auto&app=138&f=JPEG?w=400&h=400
