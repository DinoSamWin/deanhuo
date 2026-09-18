import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const script = readFileSync(new URL('../js/music-player-pulse.js', import.meta.url), 'utf8');

function createHarness({ width = 1440, height = 900, dpr = 2, available = true } = {}) {
    const emptyStats = () => ({ strokes: 0, fills: 0, clears: 0, paths: [], colours: [], transforms: [] });
    let stats = emptyStats();
    let path = [];
    const numeric = (...values) => values.forEach(value => assert.ok(Number.isFinite(value), 'canvas coordinates must be finite'));
    const gradient = (...values) => {
        numeric(...values);
        return { addColorStop(offset, colour) { numeric(offset); stats.colours.push(colour); } };
    };
    const context = {
        setTransform(...values) { numeric(...values); stats.transforms.push(values); },
        clearRect(...values) { numeric(...values); stats.clears++; },
        beginPath() { path = []; },
        moveTo(...values) { numeric(...values); path.push(values); },
        lineTo(...values) { numeric(...values); path.push(values); },
        closePath() { stats.paths.push(path); },
        stroke() {
            stats.strokes++;
            numeric(context.lineWidth);
            if (typeof context.strokeStyle === 'string') stats.colours.push(context.strokeStyle);
        },
        fillRect(...values) { numeric(...values); stats.fills++; },
        save() {}, restore() {},
        translate: numeric, scale: numeric,
        createLinearGradient: gradient,
        createRadialGradient: gradient
    };
    const canvas = { width: 0, height: 0, getContext: () => context };
    const window = { innerWidth: width, innerHeight: height, devicePixelRatio: dpr };
    const document = { getElementById: id => available && id === 'pulse-canvas' ? canvas : null };
    vm.runInContext(script, vm.createContext({ window, document, Math }));
    const renderer = window.DeanPulseVisuals;
    const draw = overrides => {
        stats = emptyStats();
        renderer.draw({ now: 500, delta: 1000 / 30, bass: .6, mid: .35, treble: .2,
            energy: .5, beat: 0, impact: 0, spectrum: new Uint8Array(512).fill(140),
            binWidth: 44100 / 1024, ...overrides });
        return stats;
    };
    return { renderer, canvas, window, draw, stats: () => stats };
}

{
    const h = createHarness();
    const first = h.draw({ beat: .8, impact: .8 });
    assert.ok(first.strokes > 0 && first.fills > 0, 'a real audio frame draws rings and bottom light');
    assert.ok(first.paths.every(path => path.length > 20), 'rings contain continuous curves, not isolated particles');
    const next = h.draw({ now: 600, impact: .38 });
    assert.notDeepEqual(next.paths, first.paths, 'a later frame advances the deformation and travelling ripple');
    const noBeat = createHarness().draw({ now: 600, impact: .38 });
    assert.ok(next.paths.length > noBeat.paths.length, 'an actual onset adds visible travelling geometry');
    assert.ok(next.colours.some(colour => /^hsla\(/.test(colour)));

    const quiet = createHarness();
    const silence = { bass: 0, mid: 0, treble: 0, energy: 0, beat: 0, impact: 0,
        spectrum: new Uint8Array(512) };
    const silentFrame = quiet.draw(silence);
    assert.equal(silentFrame.strokes, 0, 'silence cannot generate moving rings');
    assert.equal(silentFrame.fills, 0, 'silence cannot generate a floor pulse');
    assert.equal(silentFrame.clears, 1, 'silent frames remove the preceding canvas image');
    h.renderer.reset();
    assert.ok(h.stats().clears > 1, 'reset clears the rendered canvas immediately');
    assert.equal(h.draw({ now: 650, ...silence }).strokes, 0, 'reset discards live travelling ripples');
    const restarted = h.draw({ now: 800 });
    const fresh = createHarness().draw({ now: 800 });
    assert.deepEqual(restarted.paths, fresh.paths, 'reset also clears the accumulated animation phase');
}
console.log('PASS: actual multi-frame geometry, onset ripples, bottom light, silence and complete reset.');

{
    const h = createHarness({ width: 1600, height: 1000, dpr: 4 });
    h.renderer.setPalette(322, 61);
    const first = h.draw({ beat: .6, impact: .6 });
    assert.ok(first.colours.length > 10);
    assert.ok(first.colours.every(colour => colour.startsWith('hsla(322, 61%,')),
        'all canvas layers use the selected cover palette');
    assert.ok(h.canvas.width <= 1600 * 1.5 && h.canvas.height <= 1000 * 1.5,
        'high-DPR phones do not allocate an unbounded backing buffer');
    assert.deepEqual(first.transforms[0], [1.5, 0, 0, 1.5, 0, 0]);
    assert.equal(h.draw({ now: 540 }).transforms.length, 0, 'unchanged size does not reset the canvas each frame');

    h.window.innerWidth = 390;
    h.window.innerHeight = 844;
    const portrait = h.draw({ now: 580 });
    assert.equal(h.canvas.width, 585);
    assert.equal(h.canvas.height, 1266);
    assert.equal(portrait.transforms.length, 1);
    assert.ok(portrait.strokes > 0, 'resizing to portrait retains the visualization');
    h.window.devicePixelRatio = 1;
    h.renderer.setPalette(128, 45);
    const lowerDpr = h.draw({ now: 620 });
    assert.equal(h.canvas.width, 390);
    assert.equal(h.canvas.height, 844);
    assert.ok(lowerDpr.colours.every(colour => colour.startsWith('hsla(128, 45%,')),
        'a new song replaces the palette, including existing ripples');
    const missing = createHarness({ available: false });
    assert.doesNotThrow(() => missing.draw());
    assert.doesNotThrow(() => missing.renderer.reset());
}
console.log('PASS: cover palette propagation, resize/orientation, bounded DPR, buffer reuse and absent canvas fallback.');

{
    const h = createHarness();
    let firstPaths = 0;
    let maximumPaths = 0;
    for (let index = 0; index < 90; index++) {
        // Deliberately harsher than the analyser's 320 ms cooldown: every frame
        // is an onset, to prove that renderer work cannot accumulate indefinitely.
        const frame = h.draw({ now: index * 33, beat: 1, impact: 1 });
        firstPaths ||= frame.paths.length;
        maximumPaths = Math.max(maximumPaths, frame.paths.length);
        assert.ok(frame.paths.length <= 40 && frame.strokes <= 80,
            'continuous onsets retain a bounded amount of travelling geometry');
        assert.ok(frame.paths.every(path => path.length <= 128), 'per-ring geometry remains bounded');
    }
    assert.ok(maximumPaths > firstPaths, 'multiple actual beats can overlap');
    const expired = h.draw({ now: 8000 });
    assert.equal(expired.paths.length, createHarness().draw().paths.length,
        'old onsets expire instead of leaving permanent rings');
}
console.log('PASS: continuous beats have bounded render cost and expired ripples are discarded.');
