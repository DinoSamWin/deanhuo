# Curved gallery wall — version 14

Asset: `assets/images/record-gallery-curved-wall.png`.

Generated with the built-in imagegen tool (not the fallback CLI), copied unchanged into the project. CSS applies a small static brightness/saturation reduction and 0.8px blur. This is a flat wallpaper, not a 3D room: only the foreground record ring moves.

## Final generation prompt

> Use case: photorealistic-natural. Asset type: static photographic wallpaper behind a website's independently rotating vinyl record carousel. Create one 16:9 landscape architectural photograph of a real, refined music exhibition gallery wall that curves gently in a broad semicircle across the frame. Camera is precisely eye level, horizontal horizon, straight-on panoramic view, NOT looking down or looking up, restrained perspective. A warm dark walnut lower wall and muted warm grey plaster upper wall, with a sparse row of small framed record artwork and music photography mounted naturally along the curved wall in the upper third and far sides. Soft warm recessed wall-washing spotlights, subtle uneven real wood grain, matte plaster, believable glass reflections and natural light falloff. Broad uncluttered subdued central area for foreground records that will be rendered separately, no foreground objects, no pedestals, no display tables, no freestanding racks, no people, no floating records, no UI, no logos, no readable lettering or watermark. Show just a narrow strip of floor at the bottom. The curved wall is the visual subject, not a deep room or corridor. Slight optical softness in the distant frames, realistic architectural photography rather than a shiny CGI game scene, refined warm neutral palette, gently illuminated, no orange over-saturation.

## Motion and controls

The carousel uses a single Web Animations API transform running linearly for 60 seconds per revolution, rather than JS assigning transforms every frame. The compositor can render at the display's supported refresh rate; actual performance is device-dependent. Caption updates are sampled at 5 Hz independently. Hidden pages and reduced-motion preferences pause the animation. Closing cancels animation/timers and stops music. Playback, previous/next and music-toggle buttons were removed per the user's request; only the exit button remains. Default-on classical music and visible attribution are retained.
