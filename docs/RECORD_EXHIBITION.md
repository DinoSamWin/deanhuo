# 3D record exhibition

## Current version: 17

The aligned scene now fills the viewport using cover sizing, with no letterboxing. See the version 17 section of `VITRINE_EXHIBITION.md`. Lighting, rotation and record spacing are unchanged.

## Version 16

The vitrine now spaces cards from the circular slot chord, uses prominent per-sleeve brass clamps, and rotates a segmented lower metal ring with embedded warm light points. The sleeves and band have angle-phased animated reflections. See the version 16 section of `VITRINE_EXHIBITION.md`.

## Version 15

The active gallery now follows the user's supplied glass-case design: a fixed photographic vitrine with a gold circular turntable and stone plinth, live records plus a rotating surface highlight, a front glass reflection layer and a dynamic brass title plaque. See `VITRINE_EXHIBITION.md` for the asset and generation prompt. The following sections document previous iterations.

## Version 14

The static background is now a photographic curved exhibition wall. All transport/music-toggle controls have been removed, leaving just the close button. The record ring runs on a compositor-driven Web Animations API transform, with infrequent caption updates instead of per-frame JavaScript transforms. See `CURVED_GALLERY_BACKGROUND.md` for the active asset, exact generation prompt and behavior. The version 13 description below records the immediately preceding layout.

## Version 13

Per the user's preference, the active gallery is again the original lightweight CSS 3D carousel. Only the record ring rotates around the vertical axis; its camera is level. The backdrop is a static dark wall with subtle flat side panels. There is no pedestal, 3D room, photography frame or WebGL download/rendering in the active flow. Image-based back sleeves, EMI stickers, pause/step controls and default-on music are retained. Only one ring transform is updated per animation frame. Earlier WebGL source/assets remain on disk as an unused experiment; the history below describes that superseded version.

## Previous experiment (inactive)

The Music Works entry opens a native modal dialog. The normal music links and shelf are unchanged. The primary exhibition uses locally vendored Three.js 0.169.0 (MIT license at `assets/vendor/three-LICENSE.txt`) and one level perspective camera. Box-geometry jackets have thickness, image-based reverse sleeves and EMI stickers; cylinders have two vinyl faces. A walnut pedestal, supporting plinth, recessed light ring and side glass cabinets take cues from the user's physical exhibition references. Physical materials, an environment reflection map and shadow-casting spotlights calculate shading in the same space. The photographic background is deliberately defocused. Horizontal pointer drag rotates the display and pauses autoplay.

CSS 3D remains a fallback when WebGL is unavailable. Close/Escape restores focus and scroll, disposes renderer resources and cancels animation. Reduced-motion users start paused; manual navigation remains available. Hidden tabs suspend animation and stop music.

Revision 12: removed the two freestanding rear display cabinets. Six non-deleted entries from `assets/data/photos.json` now appear in side-wall frames with preserved aspect ratios. The table underside, broad pedestal body, foot and floor meet at explicit heights (0.72, -0.72 and -0.77), with a soft contact shadow. The camera stays level and the controls no longer obscure the pedestal with an opaque overlay. WebGL mode removes the fallback DOM, uses one shadow-casting light, updates shadows every other frame, precompiles shaders, and caps device pixel ratio at 1.25 (adapting to 1 on slower devices).

## Background asset

`assets/images/record-gallery-room.png` was generated using the built-in imagegen tool (not CLI), then copied into this project unchanged. CSS adds blur, vignetting and light attenuation; the original remains intact.

Final prompt:

> Use case: photorealistic-natural. Asset type: widescreen background photograph for an immersive 3D vinyl record collection gallery website. Primary request: an extremely photorealistic intimate vintage vinyl archive and listening room, richly textured walnut shelving densely filled with vinyl LP jackets on both side walls, warm amber tungsten spotlights and small lamps, worn dark oak parquet flooring receding toward a far back wall of albums. Composition: 16:9 landscape, symmetrical room with strong one-point perspective and eye-level camera, broad empty center foreground reserved for separately rendered rotating records, shelves and objects at sides and back only. A real room, not a storefront, no people, no foreground floating records, no UI, no text or logos. Lighting: realistic warm practical lamps with gentle bloom, moody brown and amber, softly lit enough to see wood and shelves, not crushed blacks. Optics: subtle shallow depth of field, softly defocused far shelves and natural bokeh lamps, floor perspective and near wall textures readable. Materials: old wood grain, paper LP sleeves, glass reflections, authentic imperfect physical detail. Output a single photographic environment background, not a screenshot or collage.

## Classical music

Local file: `assets/audio/gallery-gymnopedie-no1.mp3`, downloaded unchanged, 2026-09-12.

- Composition: Erik Satie, Gymnopédie No. 1.
- Arrangement/performance: Kevin MacLeod (incompetech.com), ISRC USUAN1100787.
- License: Creative Commons Attribution 3.0, https://creativecommons.org/licenses/by/3.0/.
- Source/license metadata: https://commons.wikimedia.org/wiki/File:Gymnopedie_No._1_(ISRC_USUAN1100787).mp3
- Download: https://upload.wikimedia.org/wikipedia/commons/2/2a/Gymnopedie_No._1_%28ISRC_USUAN1100787%29.mp3
- Artist page: https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100787

Attribution and license links are visible in the exhibition footer. Per the user's subsequent request, music starts by default on the entry click, at 25% volume. It loops only in the open exhibition and is paused/reset on close. The mute button is always available. If the browser rejects playback, a visible message invites a manual click. This does not play or alter the site's own songs.
