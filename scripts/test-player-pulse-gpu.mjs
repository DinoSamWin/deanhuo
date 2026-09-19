// Optional real-WebGL regression test. No dev server or audio/network access is needed.
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright node scripts/test-player-pulse-gpu.mjs
// PLAYWRIGHT_CHANNEL=chrome selects an installed Chrome; omit for Playwright Chromium.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
    ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'));
} catch (error) {
    if (process.env.PLAYWRIGHT_MODULE) throw error;
    console.log('SKIP: optional GPU test requires playwright or PLAYWRIGHT_MODULE pointing to an installed package.');
    process.exit(0);
}

const source = readFileSync(new URL('../js/music-player-pulse.js', import.meta.url), 'utf8');
const vertexSource = source.match(/const VERTEX = `([\s\S]*?)`;/)?.[1];
const fragmentSource = source.match(/const FRAGMENT = `([\s\S]*?)`;/)?.[1];
assert.ok(vertexSource && fragmentSource, 'the GPU probe must use the actual production shaders');

// Isolate one production wave, then expose its reflection and its geometric
// crest in separate channels. This is deliberately not a hand-written second
// implementation: changing the real reflection path also changes this probe.
// Other reflection loops are left intact so detached fixed-radius glints leak
// outside the isolated crest and fail the pixel test below.
function couplingProbe(fragment, side, detached = false) {
    const replace = (pattern, replacement, label) => {
        assert.ok(pattern.test(fragment), `coupling probe could not locate ${label}`);
        fragment = fragment.replace(pattern, replacement);
    };
    replace(/vec4 speakerWaves\(vec2 q, float side\)\s*\{/,
        '$&\n            float couplingSupport = 0., couplingCrest = 0.;', 'the production surface');
    replace(/for \(int index = 0; index < 4; index\+\+\)\s*\{\s*float layer = float\(index\);/,
        '$&\n                if (index != 0) continue;', 'the principal travelling wave loop');
    replace(/float waveCoordinate\s*=\s*[^;]+;/,
        `$&
                float couplingPosition = waveCoordinate / width;
                couplingSupport += smoothstep(-1.5, -1.2, couplingPosition)
                    * (1. - smoothstep(-.25, -.05, couplingPosition)) * fade;
                couplingCrest += exp(-square(couplingPosition)) * fade;`,
        'the shared reflection / wave coordinate');
    if (detached) {
        // Mutation control reproduces the old bug: a pale inner rim at its own
        // radius, unaffected by the outward phase of the water underneath it.
        replace(/float envelope\s*=/,
            'reflection += .16 * band(radius, .31, .008);\n            float envelope =',
            'the post-wave envelope');
    }
    replace(/return vec4\(light, shade, thin, reflection\) \* envelope;/,
        'return vec4(reflection + thin, couplingSupport, couplingCrest, 0.) * envelope;', 'the production wave channels');
    replace(/vec4 waves = speakerWaves\(left, 0\.\) \+ speakerWaves\(right, 1\.\);/,
        `vec4 waves = speakerWaves(${side ? 'right, 1.' : 'left, 0.'});`, 'the selected side');
    replace(/gl_FragColor\s*=\s*[^;]+;/,
        'gl_FragColor = vec4(min(waves.x * 4., 1.), min(waves.y, 1.), min(waves.z, 1.), 1.);',
        'the diagnostic channel output');
    return fragment;
}

const couplingShaders = [0, 1].flatMap(side => [false, true].map(detached => ({
    side, detached, fallback: false, fragment: couplingProbe(fragmentSource, side, detached)
}))).concat({ side: 0, detached: false, fallback: true, fragment: couplingProbe(fragmentSource, 0) });
const browser = await chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
try {
    const page = await browser.newPage({ viewport: { width: 864, height: 400 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<body data-player-skin="pulse"><canvas id="pulse-canvas"></canvas></body>');
    await page.addScriptTag({ content: source });
    const report = await page.evaluate(() => {
        const renderer = window.DeanPulseVisuals;
        renderer.reset();
        if (renderer.getDiagnostics().renderer !== 'webgl-liquid') {
            throw new Error('A real WebGL renderer is required; the static fallback cannot verify shader response.');
        }
        const canvas = document.getElementById('pulse-canvas');
        const gl = canvas.getContext('webgl');
        const program = gl.getParameter(gl.CURRENT_PROGRAM);
        const active = Array.from({ length: gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) }, (_, index) =>
            gl.getActiveUniform(program, index).name);
        const location = name => gl.getUniformLocation(program, name);
        if (!location('u_surface')) throw new Error('u_surface was optimized out: audio response is not used by the actual shader.');
        const failures = [];
        const checkErrors = label => {
            const error = gl.getError();
            if (error !== gl.NO_ERROR) failures.push({ label, error });
        };
        const regions = {
            left: [.025, .23, .2, .8],
            right: [.77, .975, .2, .8],
            centre: [.4, .6, .25, .75]
        };
        const difference = (first, second, region) => {
            const [x1, x2, y1, y2] = regions[region];
            let sum = 0, maximum = 0, pixels = 0;
            for (let y = Math.floor(canvas.height * y1); y < canvas.height * y2; y++) {
                for (let x = Math.floor(canvas.width * x1); x < canvas.width * x2; x++) {
                    const offset = (y * canvas.width + x) * 4;
                    const delta = (.2126 * Math.abs(first[offset] - second[offset])
                        + .7152 * Math.abs(first[offset + 1] - second[offset + 1])
                        + .0722 * Math.abs(first[offset + 2] - second[offset + 2]));
                    sum += delta;
                    maximum = Math.max(maximum, delta);
                    pixels++;
                }
            }
            return { mean: sum / pixels, maximum };
        };
        const luminanceChange = (before, after, region) => {
            const [x1, x2, y1, y2] = regions[region];
            let sum = 0, pixels = 0;
            for (let y = Math.floor(canvas.height * y1); y < canvas.height * y2; y++) {
                for (let x = Math.floor(canvas.width * x1); x < canvas.width * x2; x++) {
                    const offset = (y * canvas.width + x) * 4;
                    sum += .2126 * (after[offset] - before[offset])
                        + .7152 * (after[offset + 1] - before[offset + 1])
                        + .0722 * (after[offset + 2] - before[offset + 2]);
                    pixels++;
                }
            }
            return sum / pixels;
        };
        // These masks only reconstruct the shader's screen-to-surface geometry;
        // every colour/value still comes from actual production GPU pixels.
        const surfaceSize = Math.min(1, canvas.width / canvas.height * .46);
        const radialMasks = Object.fromEntries(['left', 'right'].flatMap(side =>
            [['inner', .10, .23], ['outer', .43, .62], ['source', .10, .18], ['nearby', .27, .37], ['far', .43, .49]]
                .map(([name, minimum, maximum]) => {
                    const offsets = [];
                    for (let y = 0; y < canvas.height; y++) {
                        for (let x = 0; x < canvas.width; x++) {
                            const qx = (side === 'left' ? x + .5 : canvas.width - x - .5) / canvas.height / surfaceSize + .07;
                            const qy = ((y + .5) / canvas.height - .5) / surfaceSize * .97;
                            const radius = Math.hypot(qx, qy);
                            if (radius >= minimum && radius < maximum) offsets.push((y * canvas.width + x) * 4);
                        }
                    }
                    return [`${side}-${name}`, offsets];
                })));
        const radialDifference = (first, second, mask) => {
            let sum = 0, maximum = 0, bright = 0;
            for (const offset of radialMasks[mask]) {
                const delta = [.2126, .7152, .0722].reduce((value, weight, channel) =>
                    value + weight * Math.abs(second[offset + channel] - first[offset + channel]), 0);
                const lift = [.2126, .7152, .0722].reduce((value, weight, channel) =>
                    value + weight * (second[offset + channel] - first[offset + channel]), 0);
                sum += delta;
                maximum = Math.max(maximum, delta);
                bright += Math.max(0, lift);
            }
            return { mean: sum / radialMasks[mask].length, maximum, bright: bright / radialMasks[mask].length };
        };
        const capture = (surface, phase, audible = 0, impulse = null, sourceTime = 0) => {
            // These are real GPU uniform writes to isolate the shader response:
            // keep time, outward phase, palette and base contrast identical.
            // Unit tests separately exercise FFT-input -> envelope -> uniform.
            gl.uniform1f(location('u_time'), 1.35);
            gl.uniform1f(location('u_sourceTime'), sourceTime);
            gl.uniform1f(location('u_travel'), phase);
            gl.uniform1f(location('u_audible'), audible);
            gl.uniform2f(location('u_waveStrength'), .55, .65);
            gl.uniform4f(location('u_surface'), ...surface);
            const impulseValues = new Float32Array(16);
            if (impulse) impulseValues.set(impulse);
            gl.uniform4fv(location('u_impulses[0]'), impulseValues);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            const pixels = new Uint8Array(canvas.width * canvas.height * 4);
            gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            checkErrors('capture');
            return pixels;
        };
        const palettes = [[218, 72], [28, 58], [354, 65], [210, 0]];
        const comparisons = [];
        const localized = [];
        for (const [hue, saturation] of palettes) {
            renderer.setPalette(hue, saturation);
            for (const phase of [.27, .59, 1.13]) {
                const idle = capture([0, 0, 0, 0], phase);
                const quiet = capture([.05, .015, .06, .03], phase);
                const strong = capture([.9, .75, .8, .65], phase);
                const audibleQuiet = capture([.05, .015, .06, .03], phase, 1);
                const channels = [];
                for (let channel = 0; channel < 4; channel++) {
                    const surface = [0, 0, 0, 0];
                    surface[channel] = .8;
                    const isolated = capture(surface, phase);
                    channels.push(difference(idle, isolated, 'left').mean + difference(idle, isolated, 'right').mean);
                    if (channel === 1 || channel === 2) {
                        localized.push({ hue, saturation, phase, channel: channel === 1 ? 'attack' : 'bass',
                            centre: difference(idle, isolated, 'centre'),
                            ...Object.fromEntries(['left', 'right'].map(side => [side, {
                                inner: radialDifference(idle, isolated, `${side}-inner`),
                                outer: radialDifference(idle, isolated, `${side}-outer`)
                            }])) });
                    }
                }
                comparisons.push({ hue, saturation, phase, channels,
                    audibleLift: Object.fromEntries(Object.keys(regions).map(region => [region, luminanceChange(quiet, audibleQuiet, region)])),
                    quiet: Object.fromEntries(Object.keys(regions).map(region => [region, difference(idle, quiet, region)])),
                    strong: Object.fromEntries(Object.keys(regions).map(region => [region, difference(idle, strong, region)])) });
            }
        }
        // Hold shape, palette, travel and time still. Only the age of one real
        // source onset advances, so normal crest motion cannot fake propagation.
        renderer.setPalette(218, 72);
        const onsetAges = [0, .08, .16, .24, .36, .52, .68, .84, 1, 1.2, 1.45, 1.65];
        const onset = [];
        for (const side of ['left', 'right']) {
            for (const phase of [.06, .12, .18, .24, .30, .36]) {
                const surface = [.2, 0, 0, .1];
                const baseline = capture(surface, phase, 1);
                for (const age of onsetAges) {
                    const pixels = capture(surface, phase, 1, [side === 'left' ? 0 : 1, .5, age, 1]);
                    onset.push({ side, phase, age, centre: difference(baseline, pixels, 'centre'),
                        ...Object.fromEntries(['source', 'nearby', 'far'].map(region =>
                            [region, radialDifference(baseline, pixels, `${side}-${region}`)])) });
                }
            }
        }
        // A fixed wave with a brightness knob makes all frame-difference maps
        // proportional. Fit that best possible scalar and measure what it
        // cannot explain: changing silhouettes, asymmetric tips and moving
        // surface curvature. Subtracting frame zero removes the stable gradient.
        const shapeResidual = (first, anchor, current, mask, scalarControl = false) => {
            const luma = (pixels, offset) => .2126 * pixels[offset] + .7152 * pixels[offset + 1] + .0722 * pixels[offset + 2];
            let aa = 0, ab = 0, bb = 0;
            for (const offset of radialMasks[mask]) {
                const reference = luma(anchor, offset) - luma(first, offset);
                const actual = scalarControl ? reference * .43 : luma(current, offset) - luma(first, offset);
                aa += reference * reference;
                ab += reference * actual;
                bb += actual * actual;
            }
            const gain = aa > 1e-9 ? ab / aa : 0;
            const residual = Math.max(0, bb - 2 * gain * ab + gain * gain * aa);
            return { gain, rms: Math.sqrt(residual / radialMasks[mask].length), relative: Math.sqrt(residual / Math.max(bb, 1e-9)) };
        };
        const material = [];
        for (const phase of [.12, .24, .36]) {
            const frames = Array.from({ length: 49 }, (_, index) => {
                const sourceTime = index * .25;
                return { sourceTime, pixels: capture([.75, .4, .65, .5], phase, 1, null, sourceTime) };
            });
            const first = frames[0].pixels;
            const sides = Object.fromEntries(['left', 'right'].map(side => {
                const mask = `${side}-inner`;
                const anchor = frames.reduce((best, frame) =>
                    radialDifference(first, frame.pixels, mask).mean > radialDifference(first, best.pixels, mask).mean ? frame : best);
                return [side, {
                    anchorTime: anchor.sourceTime,
                    scalarControl: shapeResidual(first, anchor.pixels, anchor.pixels, mask, true),
                    samples: frames.slice(1).map((frame, index) => ({
                        sourceTime: frame.sourceTime,
                        inner: radialDifference(frames[index].pixels, frame.pixels, mask),
                        outer: radialDifference(first, frame.pixels, `${side}-outer`),
                        shape: shapeResidual(first, anchor.pixels, frame.pixels, mask)
                    }))
                }];
            }));
            material.push({ phase, sides,
                centre: frames.slice(1).map(frame => difference(first, frame.pixels, 'centre')) });
        }
        return { active, linked: gl.getProgramParameter(program, gl.LINK_STATUS), failures, comparisons, localized, onset, material };
    });
    assert.equal(report.linked, true, 'the real shader must compile/link');
    assert.ok(report.active.includes('u_surface'), 'the audio surface uniform must remain active after GPU optimization');
    assert.ok(report.active.includes('u_audible'), 'audible exposure must affect real GPU output');
    assert.ok(report.active.includes('u_sourceTime'), 'the independent source clock must influence real GPU output');
    for (const obsolete of ['u_audio', 'u_impact', 'u_response']) {
        assert.ok(!report.active.includes(obsolete), `${obsolete} is no longer a misleading unused audio contract`);
    }
    assert.deepEqual(report.failures, [], 'shader uploads, rendering and pixel readback must produce no WebGL errors');
    assert.deepEqual(errors, [], 'the real browser must report no page exceptions');
    for (const sample of report.comparisons) {
        const quiet = sample.quiet.left.mean + sample.quiet.right.mean;
        const strong = sample.strong.left.mean + sample.strong.right.mean;
        assert.ok(strong > 1, 'strong passages visibly change side pixels at an identical phase');
        assert.ok(strong > quiet * 2, 'strong audio produces a substantially larger effect than quiet playback');
        assert.ok(sample.strong.left.mean > .15 && sample.strong.right.mean > .15,
            'both side surfaces respond instead of leaving one side disconnected');
        assert.ok(sample.strong.centre.maximum <= 1 && sample.quiet.centre.maximum <= 1,
            'audio modulation must not flash the central lyric background');
        assert.ok(sample.audibleLift.left > .25 && sample.audibleLift.right > .25,
            'audible music must actually brighten both wave surfaces, not just change pixels');
        assert.ok(Math.abs(sample.audibleLift.centre) < .01,
            'the audible light lift must leave the central lyric field unchanged');
    }
    for (let channel = 0; channel < 4; channel++) {
        assert.ok(report.comparisons.some(sample => sample.channels[channel] > .05),
            `surface channel ${channel} must influence actual pixels, not merely appear in diagnostics`);
    }
    for (const sample of report.localized) {
        for (const side of ['left', 'right']) {
            const { inner, outer } = sample[side];
            assert.ok(inner.mean > .12,
                `${sample.channel} must visibly move/light the small source at the same phase: ${JSON.stringify(sample)}`);
            // A musical accent must not instantly bend or brighten every ring.
            // Allow one quantization level at isolated edges across GPU vendors,
            // but not enough changed pixels to hide a broad outer-field pulse.
            assert.ok(outer.mean <= .02 && outer.maximum <= 1 && outer.mean < inner.mean * .04,
                `fast ${sample.channel} response escaped radius .40: ${JSON.stringify(sample)}`);
        }
        assert.ok(sample.centre.maximum <= 1 && sample.centre.mean < .01,
            `the lyric background must stay still during an isolated ${sample.channel}`);
    }
    const onsetPropagation = ['left', 'right'].map(side => {
        const samples = report.onset.filter(sample => sample.side === side);
        const ages = [...new Set(samples.map(sample => sample.age))];
        const frames = ages.map(age => {
            const phases = samples.filter(sample => sample.age === age);
            return { age, ...Object.fromEntries(['source', 'nearby', 'far'].map(region =>
                [region, phases.reduce((sum, sample) => sum + sample[region].bright, 0) / phases.length])) };
        });
        const peak = region => frames.reduce((best, frame) => frame[region] > best[region] ? frame : best);
        const source = peak('source'), nearby = peak('nearby'), far = peak('far');
        assert.ok(frames.find(frame => frame.age === .16).source > .015 && source.source > .03,
            `the real source highlight must react promptly: ${JSON.stringify({ side, frames })}`);
        assert.ok(frames.filter(frame => frame.age <= .36).every(frame => frame.nearby < .001 && frame.far < .001),
            `the source onset must not flash the outer water simultaneously: ${JSON.stringify({ side, frames })}`);
        assert.ok(nearby.nearby > .015 && far.far > .0005,
            `delayed light must visibly reach real nearby/far slopes, not merely disappear: ${JSON.stringify({ side, frames })}`);
        assert.ok(nearby.age - source.age >= .25 && far.age - nearby.age >= .15,
            `the same onset must arrive at successive radii later: ${JSON.stringify({ side, source, nearby, far })}`);
        assert.ok(nearby.nearby < source.source * .9 && far.far < nearby.nearby * .35,
            `the outward accent must weaken, not amplify into a second light layer: ${JSON.stringify({ side, source, nearby, far })}`);
        assert.ok(frames.filter(frame => frame.age <= .68).every(frame => frame.far < .001),
            'far water cannot respond before the local-source propagation delay');
        const last = frames.at(-1);
        assert.ok(last.source < .001 && last.nearby < .001 && last.far < far.far * .015 + .00005,
            'the propagated onset must fade away without leaving a persistent light sticker');
        assert.ok(samples.every(sample => sample.centre.maximum <= 1 && sample.centre.mean < .01),
            'neither immediate nor delayed onset light may flash behind the lyrics');
        return { side, frames, peakAge: { source: source.age, nearby: nearby.age, far: far.age } };
    });
    for (const sequence of report.material) {
        for (const [side, group] of Object.entries(sequence.sides)) {
            assert.equal(group.samples.length, 48, 'the material clock needs a continuous 12-unit sequence, not selected stills');
            for (const sample of group.samples) {
                assert.ok(sample.inner.mean > .04,
                    `the inner material stopped changing with constant outward phase: ${JSON.stringify({ phase: sequence.phase, side, sample })}`);
                assert.ok(sample.outer.mean <= .02 && sample.outer.maximum <= 1,
                    `source-time animation leaked beyond radius .43: ${JSON.stringify({ phase: sequence.phase, side, sample })}`);
            }
            const changingShape = group.samples.filter(sample => sample.shape.relative > .2 && sample.shape.rms > .1);
            assert.ok(changingShape.length >= group.samples.length * .65,
                `most material states must change shape, not just scale a fixed light pattern: ${JSON.stringify({ phase: sequence.phase, side, group })}`);
            assert.ok(group.scalarControl.rms < .0001 && group.scalarControl.relative < .0001,
                'the pixel-fit negative control must identify a brightness-only animation as having no shape motion');
        }
        assert.ok(sequence.centre.every(sample => sample.maximum <= 1 && sample.mean < .01),
            'continuous source opening/splitting must not flash the lyric background');
    }
    const coupling = await page.evaluate(({ vertex, probes }) => {
        const canvas = document.createElement('canvas');
        canvas.width = 864;
        canvas.height = 400;
        const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
        if (!gl) throw new Error('Real WebGL is required for the moving-crest coupling probe.');
        const prefix = gl.getExtension('OES_standard_derivatives')
            ? '#extension GL_OES_standard_derivatives : enable\n#define HAS_DERIVATIVES\n' : '';
        const shader = (type, code) => {
            const result = gl.createShader(type);
            gl.shaderSource(result, code);
            gl.compileShader(result);
            if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result));
            return result;
        };
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.viewport(0, 0, canvas.width, canvas.height);
        const surfaceSize = Math.min(1, canvas.width / canvas.height * .46);
        const samples = [];
        for (const probe of probes) {
            const program = gl.createProgram();
            const vs = shader(gl.VERTEX_SHADER, vertex);
            // Compile and draw one full probe without the extension directive
            // or HAS_DERIVATIVES, even on GPUs that support derivatives. This
            // exercises the real wet-edge fallback instead of a mocked string.
            const fs = shader(gl.FRAGMENT_SHADER, (probe.fallback ? '' : prefix) + probe.fragment);
            gl.attachShader(program, vs);
            gl.attachShader(program, fs);
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
            gl.useProgram(program);
            const position = gl.getAttribLocation(program, 'a_position');
            gl.enableVertexAttribArray(position);
            gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
            const location = name => gl.getUniformLocation(program, name);
            gl.uniform2f(location('u_resolution'), canvas.width, canvas.height);
            gl.uniform2f(location('u_waveStrength'), .55, .65);
            gl.uniform1f(location('u_audible'), 1);
            gl.uniform4f(location('u_surface'), .55, .45, .65, .4);
            gl.uniform4fv(location('u_impulses[0]'), new Float32Array(16));
            const clockStates = [.4, 2.1, 5.3].flatMap(time => [0, 3.5, 8].map(sourceTime => ({ time, sourceTime })));
            for (const { time, sourceTime } of clockStates) {
                gl.uniform1f(location('u_time'), time);
                gl.uniform1f(location('u_sourceTime'), sourceTime);
                for (const phase of [.12, .18, .24]) {
                    gl.uniform1f(location('u_travel'), phase);
                    gl.drawArrays(gl.TRIANGLES, 0, 3);
                    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
                    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                    if (gl.getError() !== gl.NO_ERROR) throw new Error('GPU coupling probe generated a WebGL error.');
                    let reflection = 0, outside = 0, crest = 0, reflectionRadius = 0, crestRadius = 0;
                    for (let y = 0; y < canvas.height; y++) {
                        for (let x = 0; x < canvas.width; x++) {
                            const offset = (y * canvas.width + x) * 4;
                            const r = pixels[offset];
                            const g = pixels[offset + 1];
                            const b = pixels[offset + 2];
                            const qx = probe.side ? (canvas.width - x - .5) / canvas.height / surfaceSize + .07
                                : (x + .5) / canvas.height / surfaceSize + .07;
                            const qy = ((y + .5) / canvas.height - .5) / surfaceSize * .97;
                            const radius = Math.hypot(qx, qy);
                            reflection += r;
                            crest += b;
                            reflectionRadius += r * radius;
                            crestRadius += b * radius;
                            // Green is only the illuminated inner slope, not
                            // the entire Gaussian crest / scene. Blue marks the
                            // underlying crest independently for displacement.
                            // A rim cannot pass by merely being on the same side.
                            if (g < 4) outside += r;
                        }
                    }
                    samples.push({ side: probe.side, detached: probe.detached, fallback: probe.fallback, time, sourceTime, phase,
                        reflection, crest, outsideFraction: outside / Math.max(1, reflection),
                        reflectionRadius: reflectionRadius / Math.max(1, reflection),
                        crestRadius: crestRadius / Math.max(1, crest) });
                }
            }
            gl.deleteProgram(program);
            gl.deleteShader(vs);
            gl.deleteShader(fs);
        }
        gl.deleteBuffer(buffer);
        return samples;
    }, { vertex: vertexSource, probes: couplingShaders });
    for (const sample of coupling.filter(sample => !sample.detached)) {
        assert.ok(sample.reflection > 1000, 'the isolated travelling wave must have a measurable real highlight');
        assert.ok(sample.crest > 1000, 'the coupling probe must expose a real underlying wave crest');
        assert.ok(sample.outsideFraction < .025,
            `reflection escaped its own wave shoulder: ${JSON.stringify(sample)}`);
    }
    assert.equal(coupling.filter(sample => sample.fallback).length, 27,
        'the no-derivatives wet-edge branch must compile and render all 27 source/time/phase GPU probe frames');
    for (const side of [0, 1]) {
        const clockStates = [.4, 2.1, 5.3].flatMap(time => [0, 3.5, 8].map(sourceTime => ({ time, sourceTime })));
        for (const { time, sourceTime } of clockStates) {
            const frames = coupling.filter(sample => !sample.detached && !sample.fallback
                && sample.side === side && sample.time === time && sample.sourceTime === sourceTime);
            for (let index = 1; index < frames.length; index++) {
                const reflectionDelta = frames[index].reflectionRadius - frames[index - 1].reflectionRadius;
                const crestDelta = frames[index].crestRadius - frames[index - 1].crestRadius;
                assert.ok(crestDelta > .02,
                    `the test must actually move the underlying water crest: ${JSON.stringify({ side, time, sourceTime, frames })}`);
                assert.ok(reflectionDelta > .02 && Math.abs(reflectionDelta - crestDelta) < .025,
                    `highlight and water must move outward together, not at separate radii: ${JSON.stringify({ side, time, sourceTime, reflectionDelta, crestDelta })}`);
            }
        }
        assert.ok(coupling.some(sample => sample.detached && sample.side === side && sample.outsideFraction > .10),
            'negative control must reject a fixed-radius reflection even though the real wave still moves');
    }
    const { onset, ...pixelReport } = report;
    console.log(JSON.stringify({ ...pixelReport, onsetPropagation }, null, 2));
    console.log(JSON.stringify({ coupling }, null, 2));
    console.log('PASS: real WebGL active audio uniform, four live surface channels, local attack/bass with unchanged outer rings, delayed weakening onset propagation, continuous source-shape change beyond brightness scaling, stable lyric centre, wave-locked reflections across phase/time/source states, detached-rim negative control, no-derivatives fallback and no GPU errors.');
} finally {
    await browser.close();
}
