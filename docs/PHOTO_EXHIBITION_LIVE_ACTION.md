# Curved-screen exhibition: live-action handoff

Local preview: http://127.0.0.1:4173/photos.html?v=screen-4

## Current implementation

- The original photography masonry is unchanged.
- The screen uses a fixed concave radius of 6.3 and camera-to-center-screen distance of 12. This is calibrated to the background rather than to the number of catalogue items. Each image is a subdivided curved mesh with its original aspect ratio. Offscreen works recycle to support a continuous complete-catalogue tour.
- The previous Rocketbox characters and the separately modelled sofa are no longer imported or loaded. There are currently no active visitors.
- The rejected 3D prototype's untracked models, loader add-ons and implementation were moved outside the project to `/tmp/dean-gallery-assets.Emi0Ep/rejected-3d-preview/`; they remain recoverable there for this local session.
- The existing sofa at the very bottom of the approved photograph is reused as a foreground layer. It uses the same pixels, dimensions and centered cover transform as the background, clipped along the sofa silhouette. It is not a second sofa placed in the room.
- A silent, full-frame green-screen/alpha-video compositor is implemented in `js/photo-exhibition-video.js`. It is disabled in `assets/data/photo-exhibition-visitors.json` because no camera-matched live-action footage is available. The integration includes chroma-key softness, green-spill suppression, shared cover cropping, pause/close cleanup, and long randomized quiet periods.
- A suitable live-action clip has NOT been generated or visually registered. Walking, sitting and handholding must not be described as completed in this revision. There is no available video-generation tool in the current session; plugin directory search/suggestion tools are also unavailable.
- JavaScript syntax and whitespace checks pass. Final in-app-browser screenshot validation of revision 4 was interrupted by repeated browser connection timeouts; the final frame is not visually certified.

## Footage requirements

Use the approved architectural background as a camera/lighting reference. Record/generate a locked-camera full-frame 16:9 green-screen plate, preferably 1920 × 1080 at 30 fps. No camera pan, zoom, focal-length change or stabilization drift. Use diffuse green illumination, no green clothing, no props crossing actor edges. Keep natural footsteps and weight transfer, and match the background's warm upper-right sunlight. Audio is not needed.

Route planning must occur in the footage, not by sliding a static cutout:

1. Solo visit: enter from left, follow a shallow floor path, stop and turn toward the curved screen for 10–20 seconds, then leave right. Make a distinct opposite-direction version; do not mirror a clip if that reverses its lighting.
2. Seated visit: approach the EXISTING bottom-foreground sofa. Register the body to that sofa's actual seating position and height using a proxy seat during filming/generation. Turn, sit with a continuous weight shift, remain seated 25–45 seconds, rise and leave. The sofa back obscures the lower body, but the upper-body trajectory must still match the seat.
3. Couple: at most two people; natural linked hands throughout walking and stopping, no intersections. Enter, look at the works, leave. Leave 50–110 seconds between visits and avoid immediately repeating the same clip.

The sofa seat itself is hidden behind its foreground back; its exact 3D depth cannot be recovered from this single photograph. A final clip therefore requires visual registration against the background. Do not claim pixel-perfect sitting alignment before that test.

## Manifest example (do not enable without real assets)

```json
{
  "enabled": true,
  "sceneAspect": 1.7768331562,
  "firstArrivalSeconds": [20, 35],
  "quietSeconds": [50, 110],
  "clips": [
    {
      "src": "assets/video/gallery/solo-left-to-right.mp4",
      "people": 1,
      "keyColor": [0, 1, 0],
      "threshold": 0.25,
      "softness": 0.12
    }
  ]
}
```

Add `"alpha": true` only for actual alpha-channel video. All footage is silently played on a full-scene registered plate and shares the background's responsive crop. Review walking-foot contact, seat contact, hair edges, green spill, lighting direction, and continuity before enabling.

## Generated background

Built-in imagegen edit mode; delivered asset: `assets/images/photo-exhibition-screen.jpg`.

Original output: `/Users/dean/.codex/generated_images/01a094dd-480f-78b2-91bd-0610808e5488/exec-663d1cfd-0cf7-4418-a53f-e9c0fadfcce5.png`.

Exact prompt:

Use case: precise-object-edit. Edit target: attached image 1, a photoreal open-air curved photography gallery. Produce an empty architectural plate for a live 3D website. Preserve the EXACT eye-level composition, continuous smoothly curved ivory wall, warm concealed LED strips at the upper and lower wall edges, leafy tree canopy, blue sky, natural dappled sunlight, reflective pale stone floor, and soft taupe sofa back crossing only the very bottom foreground. Remove ALL displayed photographs, all captions and text, heading, arrows, close icon, counters, input/chat bar, icons and UI. Replace the photo and caption areas seamlessly with clean unbroken warm white curved screen/wall. The large white screen must be smooth, broad and continuous with no vertical panel joints. Keep the wall's central top edge around 35% and bottom around 73% of image height, so live photos can be composited in that band. Keep a clear floor in front, no people and no extra furniture. The bottom sofa back should be realistically woven pale warm grey fabric, softly out of focus and partially cropped, as if the viewer is seated just behind it. Premium realistic architectural photography, physically credible natural light, subtle surface detail. No text, no people, no baked-in pictures, no watermark. Output landscape 16:9, extend sides naturally without changing eye level.

An attempted generated transparent sofa extraction returned a baked checkerboard without an alpha channel (`sips hasAlpha: no`). That output is rejected and not used by the site. The foreground instead reuses the original background pixels through a code-native clipping mask.
