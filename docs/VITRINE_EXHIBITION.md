# Glass vitrine — version 15

## Version 17 fullscreen fit

The entire aligned cabinet composition now uses cover sizing: width is the larger of viewport width and viewport height × 1.89. The earlier fit-inside sizing and mobile fixed minimum were removed. Background, glass, records and turntable scale together without distortion; excess edges crop symmetrically instead of leaving black bars. All motion, lighting and spacing remain unchanged.

## Version 16 refinement

The live record radius is 28.5% of stage width. Each complete cover-plus-disc assembly is at most 82% of the chord between neighbouring positions, reserving an 18% physical gap instead of using a fixed oversized card. Perspective can still naturally occlude distant records; meshes no longer occupy neighbouring slots. Each front sleeve has two raised brass clamps, circular screw feet and a support rail.

A 36-segment metallic bearing band with twelve embedded warm light points now shares the same rotating parent as the records and platter. Static ceiling lamps remain part of the glass cabinet photograph. Per-sleeve moving specular streaks and phased band highlights run on synchronized 90-second Web Animations API timelines. They use transform/opacity, pause alongside the main ring for hidden/reduced-motion states, and cancel on close. No new raster generation was needed for these refinements.

The user's supplied design is the visual reference. The fixed photographic cabinet contains a live CSS 3D record ring and horizontal platter highlight layer. Both live layers share one 90-second, compositor-driven revolution. Clear glass reflections are composited above the moving records. Gold sleeve supports and a live song/title plaque align to the cabinet image coordinates. Actual catalogue covers and back sleeves remain data-driven. No transport controls were restored. Default classical music, close/Escape, hidden-page pause and reduced-motion support remain.

The perspective origin is 50% / 37%; the ring floor is at 56% of the cabinet composition. The radius, record size and perspective distance scale with the cabinet image width rather than the window independently, keeping the glass, turntable and records aligned. On narrow screens the cabinet is shown as a centered close-up.

## Generated project asset

`assets/images/record-gallery-vitrine.png` was created with the built-in imagegen tool in edit mode, using the user's attached cabinet design. The output was copied unchanged into the repository. It contains an empty case, not baked-in fake songs. The user's attachment was not overwritten.

Final prompt:

> Use case: precise-object-edit. Input image is the user's exhibition design and is the edit target. Produce a photorealistic EMPTY display-case background plate for a web animation. Preserve this reference's composition, camera angle, warm museum lighting, rectangular clear thick glass vitrine, glass's cyan-green polished edges and delicate reflections, miniature warm spotlights inside its ceiling, brushed champagne-gold circular turntable, mechanical lower bearing/base, heavy dark marble plinth grounded on a wooden museum floor, wall framed music photographs and warm gallery atmosphere. Remove ALL foreground vinyl records, sleeves, upright record supports and album art from INSIDE the glass enclosure, leaving the circular turntable completely empty and smoothly clean so live animated records can be composited there later. Remove all lettering on the foreground brass plaque, leaving a blank brushed brass plaque with four tiny screws in the same location. Remove readable lettering on the rear wall but keep its dark architectural panel. Keep the museum wall frames. Do not add people, floating objects or any new exhibit. Maintain the case and turntable exact geometry and position from the source: case spanning approximately x8%-92%, y23%-73%; elliptical turntable top spanning x16%-84% and roughly y50%-61%, dark stone plinth at y73%-94%. Glass is highly transparent with subtle real reflections, not opaque or frosted. Output a single wide image of the empty vitrine, at the same roughly 1.89:1 composition. The final image should look like real luxury museum architectural/product photography, not a game render. Important: NO records anywhere inside the case, NO tiny stands or wires on the platter, NO words on the brass plaque.
