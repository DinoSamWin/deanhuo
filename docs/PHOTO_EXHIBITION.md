# Photography 3D exhibition

Local preview: http://127.0.0.1:4173/photos.html?v=screen-15

## Revision 15: Versailles now installed from the supplied OGG

- The user supplied a readable Ogg Vorbis recording of Haneda Ryoko's “Versailles”. It is converted directly to a locally hosted MP3 with the existing exhibition-room reflections, restrained reverb and loudness target, preserving pitch and tempo. Source file and previous soundtrack assets remain untouched.
- Both the welcome bed and gallery now use `assets/audio/photo-gallery-versailles-hall.mp3`, continuing without rewinding. The 10% welcome level, 24% gallery level and 2.6-second fade remain unchanged.
- Visible credit now names the actual recording and no longer applies the previous song's CC BY license. Source/provenance and public-use licensing caveat are recorded in `assets/audio/photo-gallery-versailles-NOTES.md`. Local preview only; no deployment.

## Revision 14: clearer music beneath the welcome

- Raised narration-bed playback from 6.5% to 10% (approximately +3.7 dB), retaining the 2.6-second fade to 24% and continuous playback into the exhibition.
- Both phases already share the same source. The requested Versailles replacement remains pending: no matching local file was found, and the previously verified Bugs page could not be reached on this attempt. Do not label the current Bossa Antigua recording as Versailles or publish the requested replacement without obtaining the actual source.

## Revision 13: music under the entrance narration

- The same music element starts at 6.5% volume on the entrance click, underneath the welcome voice. Finishing or skipping the welcome continues from the current musical position and smoothly raises volume to 24% over 2.6 seconds.
- Cancel/close stops both tracks. Muting persists across entry, hidden pages pause the music, and returning resumes a smooth fade without jumping louder. Blocked playback exposes retry; stale playback promises cannot leak sound after cancellation.
- Requested replacement: Haneda Ryoko, “Versailles”, from *Farewell In Paris* (2011), 4:35. Artist, album and duration verified at https://music.bugs.co.kr/track/2286346 on 2026-09-13. Full usable audio is still pending from the user; do not claim the track has been replaced. Preview retains the licensed Bossa Antigua hall mix and its correct attribution. Apply the gallery-room processing to the replacement source once supplied, and update attribution/provenance and confirm website-use rights before publication.
- `node scripts/test-photo-audio.mjs` covers quiet entry, no rewind, smooth gain, skip, visibility, mute, blocked playback and cancellation. Intro tests also cover music lifecycle callbacks.

## Revision 12: restrained exhibition typography

- Heading uses locally hosted Cormorant Garamond Light (300), with its SIL OFL license retained beside the font. Lighter strokes and more open line spacing replace the heavy Georgia heading.
- Curved-wall Chinese labels are approximately 21% smaller, in a light Song-style serif. English is approximately 30% smaller, using upright Inter capitals and expanded tracking, inspired by museum wall labels. Both lines stay centered beneath each photograph; long labels truncate instead of squeezing their letterforms. The non-WebGL fallback uses the same typography direction.
- Existing titles and optional `titleEn` metadata are preserved. Photo layout, camera interactions, opening audio and room soundtrack are unchanged.

## Revision 11: background music in the exhibition space

- The Bossa Nova soundtrack now uses a locally rendered gallery-room mix: softened speaker/distance EQ, restrained stereo width, early wall reflections and a diffuse 1.35-second room decay. Pitch, tempo and the 24% playback setting are unchanged. The original MP3 is retained.
- Processed loudness targets -22 LUFS, close to the original measured -21.70 LUFS, so adding reverberation does not make the background unexpectedly louder. The full ending and room tail are retained with gentle fades.
- Visible attribution now identifies the modified room mix. The slower entrance audio and all viewer/carousel interactions are unchanged.

## Revision 10: slightly slower opening audio

- Entrance tempo reduced to 95% with pitch preservation, regenerated from the source video before the existing room reverb. Approximately 11.5 seconds including the unchanged tail. Background music, camera transitions and entrance logic are unchanged; entry still follows the audio's actual `ended` event.

## Revision 9: camera approach and entrance sound

- Added a distinct entrance modal before each gallery visit. It plays the approximately 11-second processed audio extracted from the user's video, then opens the gallery and starts the existing Bossa Nova background track. Audio provenance and processing measurements are beside the MP3. Original video is untouched.
- Skip enters immediately; cancel/Escape stops the opening audio without entering. Hidden tabs pause the entrance, playback restrictions expose retry, and a queued close event cannot accidentally restore page scrolling over the new gallery.
- Detail viewing now coordinates a 1150 ms full-scene pan/zoom toward the selected photograph. The high-resolution, uncropped image fades in as the camera arrives; dimming/blur and interface controls are delayed to preserve the approach feeling. Returning pulls the scene back, then restores its original transform and touring position. Reduced motion skips camera movement.
- `node scripts/test-photo-intro.mjs` covers end/replay/skip/cancel/visibility/blocked-playback/scroll-lock transitions. Existing viewer and curved-wall regression tests remain passing.

## Revision 8: centered art labels and immersive photo inspection

- Photo labels use light Kai/Song-style Chinese serif fallbacks with smaller, locally hosted Playfair Display italic English underneath. Both lines are centered on the photo texture. Optional `titleEn` is supported; without it, the neutral subtitle “A moment in light” is used. Metadata is not rewritten. Full descriptions appear in the detail viewer.
- A click/tap (less than 7 px movement) hit-tests the actual calibrated photo surface, not the unwarped cylinder or empty rectangular corners. The selected photo flies from its wall position into a separate native modal in 720 ms, with reduced-motion support. Dragging continues to control the wall and does not accidentally open a photo.
- The original image replaces the loaded preview; no exhibition texture resolution cap applies to the detail viewer. The image opens uncropped, with 1–4× wheel/button/double-click/pinch zoom, bounded panning, reset and keyboard support. The original gallery and catalogue are unchanged.
- Opening freezes touring without changing the user's autoplay preference. Closing returns to the same wall position and resumes after a short hold only if touring was previously enabled. Music continues. Native modal focus containment, Escape, a labelled return button, and a keyboard-accessible “查看这张照片” entry are provided.
- Verified desktop side-photo click, 6720 px original loading, zoom and pan, preserved music/tour state, and 390×844 viewing layout. `node scripts/test-photo-viewer.mjs` covers original-image races, pinch math, wheel, pan bounds, zoom limits, reset, cancellation and reduced motion; `node scripts/test-photo-exhibition.mjs` retains the wall projection/loop regression checks.

## Revision 7: light Bossa Nova soundtrack

- Added “Bossa Antigua” by Kevin MacLeod, licensed CC BY 4.0, using an unchanged local MP3 with visible attribution. License/source details are saved beside the audio file.
- Entry click starts playback at 24% volume. A separate top-right music toggle does not pause the carousel. Closing stops and rewinds; hiding the document pauses and returning resumes only if the user has left music enabled.
- Muting persists across exhibition close/reopen during the page session. Blocked playback exposes a click-to-play retry instead of claiming sound is playing. Pending playback requests cannot reactivate sound after close.

## Revision 6: cornice alignment and rounded photographs

- Calibrated the photo top edge to the actual background cornice rather than the uncorrected cylinder projection. Each horizontal mesh segment uses the same curve and perpendicular inset, including during rotation. The backdrop's exact 1672:941 cover crop is shared at every viewport size.
- The cylinder still controls horizontal perspective and continuous movement. The photo band's vertical projection follows the photographed wall, including the lower edge and caption area; panoramic photos are top-aligned rather than vertically centered.
- Rounded, alpha-masked photo corners are generated on the GPU texture canvas at load time, not every frame. The original source files and masonry presentation are unchanged.
- Projection tests sample the entire wall, check constant upper inset and caption clearance, and verify four viewport crops.

## Current revision: calibrated curved screen (2026-09-13)

- A transparent Three.js canvas maps each photograph onto a subdivided cylindrical surface of radius 6.3. The camera and `cover` crop follow the fixed photographic wall: image tops curve upward and their scale increases toward both sides. The background and foreground sofa stay stationary.
- The screen repeats the entire catalogue continuously. Its curvature is independent of catalogue length; virtual copies on either side of the last/first boundary cannot overwrite one another. Nearby work selection uses angular coverage, avoiding gaps when several narrow portraits are adjacent.
- Touring advances at a constant .042 radians per second rather than a constant number of photographs per second. Mixed aspect ratios no longer cause velocity jumps. It uses requestAnimationFrame, stops when hidden/closed, supports dragging and retains the reduced-motion setting.
- Actual image proportions are preserved. Canvas-backed decoded textures avoid the prior blank/black texture issue; textures and decoded resources are retained only around the visible arc. Captions use consistent physical text sizes for portrait and landscape formats.
- No people or additional sofa are rendered; the dormant video module is not imported. Existing masonry, catalogue data and the music pages are not changed by this revision.
- Verified in-browser at 1440 × 900 and 390 × 844: visible photographs and curved perspective, automatic advancement, pause, reverse 01 → 54, and touch-style drag. `node scripts/test-photo-exhibition.mjs` checks all 54 local source files, spacing, continuous speed, projection direction, four catalogue cycles and small catalogues.

The following revision-2 notes describe the older CSS fallback, retained only for browsers without WebGL.

The original masonry and its renderer remain unchanged. A separate native dialog is opened by the new `3D展览` button. It uses the same visible, recommendation-ordered photo catalogue and supports pointer dragging, arrow buttons, keyboard arrows and Escape. It restores focus and body scroll on close. There is no audio. No deployment or GitHub push was performed.

## Revision 2: wall-mounted photographs

- Photographs and their labels are children of physical tangent wall panels. The entire curved wall moves with the works instead of independent cards crossing a static wallpaper. The courtyard background provides sky and floor; the same generated photographic material supplies plaster and tree-shadow detail on the wall surfaces.
- Frame width and height are calculated from each loaded image's intrinsic dimensions. Only a 2 px mounting edge remains; there are no fixed portrait mats or cropped photographs. `object-fit: contain` is retained as a safeguard.
- Automatic touring is enabled by default, taking 14 seconds per work. Dragging or arrow navigation holds for 5 seconds before touring resumes. A small pause toggle allows time to read. Reduced-motion preference disables default autoplay and skips snapping animation.
- Animation is frame-time based, mounts at most 9 nearby panels (5 on narrow screens), and stops when the dialog closes or the page becomes hidden.
- Labels read the existing photo `title` and `description`. The admin photography editor already provides both fields. Descriptions are inserted with `textContent`, limited to three visual lines with the full text available as the text element's title/accessible content. Empty descriptions produce no placeholder. No original metadata was changed.

## Verification

- Browser visual checks at 1440 × 900 and 390 × 844; original masonry retains 54 photographs.
- DOM checks: image display ratios match intrinsic ratios within pixel rounding; mat padding is zero.
- Isolated JavaScript event tests: default autoplay, progression, pause, bounded mounted panels, arrows, keyboard, natural-aspect sizing, dragging, reduced motion, close/focus/scroll restoration.
- `node --check js/photo-exhibition.js`, `node --check js/photos.js`, `git diff --check` pass.

## Background asset

- Workspace asset: `assets/images/photo-exhibition-courtyard.jpg`
- Mode: built-in imagegen, precise-object-edit; JPEG delivery conversion via sips.
- Original output: `/Users/dean/.codex/generated_images/01a094dd-480f-78b2-91bd-0610808e5488/exec-62b8e135-3bb4-417a-9afc-5443e346ef4f.png`
- Edit target: user reference `codex-clipboard-3d393f33-df2f-4ac7-baaa-6c38eabb5979.png`.
- Generated architectural backdrop only; all displayed photographs are loaded separately from the user's site catalogue.

### Exact prompt

Use case: precise-object-edit. Asset type: photorealistic full-screen photography exhibition background for a website, landscape 16:9. Input image 1 is the edit target and architectural reference. Preserve the open-air semicircular warm-white gallery wall, tree canopy, blue sky, natural dappled sun and tree shadows, polished pale stone floor, camera at human eye level, and the original wide symmetrical perspective. Remove ALL photographs, frames, captions, typography, logos, buttons, arrows and UI overlays, replacing them seamlessly with empty warm white plaster wall and unobstructed natural scene. The middle band of the curved wall must remain empty and usable for live photo frames that will be composited in code. Real architectural photography, restrained natural material imperfections, soft realistic contact shadows. No people, no text, no watermarks. Keep architecture and lighting close to the reference, not a new room. Output 16:9 landscape.
