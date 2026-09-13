# Photography 3D exhibition

Local preview: http://127.0.0.1:4173/photos.html?v=exhibition-1

The original masonry and its renderer remain unchanged. A separate native dialog is opened by the new `3D展览` button. It uses the same visible, recommendation-ordered photo catalogue, preserves entire images with `object-fit: contain`, and supports pointer dragging, arrow buttons, keyboard arrows and Escape. It restores focus and body scroll on close. Motion is frame-time based and stops when settled; reduced-motion settings skip the settling animation. Only nearby frames are mounted. There is no audio or automatic rotation.

## Background asset

- Workspace asset: `assets/images/photo-exhibition-courtyard.jpg`
- Mode: built-in imagegen, precise-object-edit; JPEG delivery conversion via sips.
- Original output: `/Users/dean/.codex/generated_images/01a094dd-480f-78b2-91bd-0610808e5488/exec-62b8e135-3bb4-417a-9afc-5443e346ef4f.png`
- Edit target: user reference `codex-clipboard-3d393f33-df2f-4ac7-baaa-6c38eabb5979.png`.
- Generated architectural backdrop only; all displayed photographs are loaded separately from the user's site catalogue.

### Exact prompt

Use case: precise-object-edit. Asset type: photorealistic full-screen photography exhibition background for a website, landscape 16:9. Input image 1 is the edit target and architectural reference. Preserve the open-air semicircular warm-white gallery wall, tree canopy, blue sky, natural dappled sun and tree shadows, polished pale stone floor, camera at human eye level, and the original wide symmetrical perspective. Remove ALL photographs, frames, captions, typography, logos, buttons, arrows and UI overlays, replacing them seamlessly with empty warm white plaster wall and unobstructed natural scene. The middle band of the curved wall must remain empty and usable for live photo frames that will be composited in code. Real architectural photography, restrained natural material imperfections, soft realistic contact shadows. No people, no text, no watermarks. Keep architecture and lighting close to the reference, not a new room. Output 16:9 landscape.
