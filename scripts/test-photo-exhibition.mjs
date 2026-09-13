import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createScreenLayout, SCREEN_RADIUS, TOUR_SPEED, wrap } from '../js/photo-exhibition-layout.mjs';
import { WALL, screenBand, coverScale } from '../js/photo-exhibition-projection.mjs';

const photos = JSON.parse(readFileSync(new URL('../assets/data/photos.json', import.meta.url))).filter(p => !p.deletedAt);
const aspects = JSON.parse(readFileSync(new URL('../assets/data/photo-exhibition-aspects.json', import.meta.url)));
const model = createScreenLayout(photos, aspects);
for (const photo of photos) assert.ok(existsSync(new URL('../' + photo.src, import.meta.url)), photo.src);
for (let position = -photos.length * 2; position <= photos.length * 2; position += .125) {
    assert.ok(Math.abs(model.positionAt(model.angleAt(position)) - position) < 1e-9, 'invertible across both seams');
    const advanced = model.advance(position, 1 / 60);
    assert.ok(Math.abs(model.angleAt(advanced) - model.angleAt(position) - TOUR_SPEED / 60) < 1e-10, 'constant wall velocity');
    const visible = model.visibleIndices(position);
    assert.equal(new Set(visible).size, visible.length, 'unique virtual copies');
    const angle = model.angleAt(position);
    for (let i = Math.floor(position) - photos.length; i < position + photos.length; i++) {
        if (Math.abs(model.angleAt(i) - angle) < 1.8) assert.ok(visible.includes(i), 'no empty region in view');
    }
}
for (let i = 0; i < photos.length; i++) {
    const next = wrap(i + 1, photos.length);
    const gap = model.angleAt(i + 1) - model.angleAt(i) - (model.items[i].arc + model.items[next].arc) / 2;
    assert.ok(gap >= .48 / SCREEN_RADIUS - 1e-10, 'works never overlap along wall');
}
// Projected photo tops rise, bottoms fall and scale increases towards the side,
// matching the photographic concave wall rather than a flat transform strip.
const depth = a => 12 - SCREEN_RADIUS + SCREEN_RADIUS * Math.cos(a);
assert.ok(depth(1.2) < depth(.6) && depth(.6) < depth(0));
for (const count of [0, 1, 2, 3]) {
    const small = createScreenLayout(photos.slice(0, count), aspects);
    assert.ok(Number.isFinite(small.advance(-.3, 1)));
    assert.equal(new Set(small.visibleIndices(0)).size, small.visibleIndices(0).length);
}
for (let x = -1; x <= 1; x += .01) {
    const band = screenBand(x);
    const normalInset = (band.top - band.wallTop) / Math.sqrt(1 + band.slope * band.slope);
    assert.ok(Math.abs(normalInset - WALL.inset) < 1e-12, 'same cornice inset across the complete curved image');
    assert.ok(band.bottom > band.top, 'positive photo height everywhere');
    assert.ok(band.bottom + WALL.captionGap + WALL.captionHeight < band.bottom + WALL.captionReserve, 'captions fit above floor');
    assert.ok(Math.abs(band.top - screenBand(-x).top) < 1e-12, 'symmetric wall registration');
}
for (const [width, height] of [[1440, 900], [1920, 1080], [2560, 1080], [390, 844]]) {
    const [x, y] = coverScale(width, height);
    assert.ok(Math.abs(width * x / (height * y) - WALL.aspect) < 1e-12, 'same cover crop as backdrop');
}
console.log(`PASS: ${photos.length} photos; spacing, looping, constant velocity, uniform cornice inset, captions and responsive background registration.`);
