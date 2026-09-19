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
        const capture = (surface, phase) => {
            // These are real GPU uniform writes to isolate the shader response:
            // keep time, outward phase, palette and base contrast identical.
            // Unit tests separately exercise FFT-input -> envelope -> uniform.
            gl.uniform1f(location('u_time'), 1.35);
            gl.uniform1f(location('u_travel'), phase);
            gl.uniform2f(location('u_waveStrength'), .55, .65);
            gl.uniform4f(location('u_surface'), ...surface);
            gl.uniform4fv(location('u_impulses[0]'), new Float32Array(16));
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            const pixels = new Uint8Array(canvas.width * canvas.height * 4);
            gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            checkErrors('capture');
            return pixels;
        };
        const palettes = [[218, 72], [28, 58], [354, 65], [210, 0]];
        const comparisons = [];
        for (const [hue, saturation] of palettes) {
            renderer.setPalette(hue, saturation);
            for (const phase of [.27, .59, 1.13]) {
                const idle = capture([0, 0, 0, 0], phase);
                const quiet = capture([.05, .015, .06, .03], phase);
                const strong = capture([.9, .75, .8, .65], phase);
                const channels = [];
                for (let channel = 0; channel < 4; channel++) {
                    const surface = [0, 0, 0, 0];
                    surface[channel] = .8;
                    const isolated = capture(surface, phase);
                    channels.push(difference(idle, isolated, 'left').mean + difference(idle, isolated, 'right').mean);
                }
                comparisons.push({ hue, saturation, phase, channels,
                    quiet: Object.fromEntries(Object.keys(regions).map(region => [region, difference(idle, quiet, region)])),
                    strong: Object.fromEntries(Object.keys(regions).map(region => [region, difference(idle, strong, region)])) });
            }
        }
        return { active, linked: gl.getProgramParameter(program, gl.LINK_STATUS), failures, comparisons };
    });
    assert.equal(report.linked, true, 'the real shader must compile/link');
    assert.ok(report.active.includes('u_surface'), 'the audio surface uniform must remain active after GPU optimization');
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
    }
    for (let channel = 0; channel < 4; channel++) {
        assert.ok(report.comparisons.some(sample => sample.channels[channel] > .05),
            `surface channel ${channel} must influence actual pixels, not merely appear in diagnostics`);
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
            gl.uniform4f(location('u_surface'), .55, .45, .65, .4);
            gl.uniform4fv(location('u_impulses[0]'), new Float32Array(16));
            for (const time of [.4, 2.1, 5.3]) {
                gl.uniform1f(location('u_time'), time);
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
                    samples.push({ side: probe.side, detached: probe.detached, fallback: probe.fallback, time, phase,
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
    assert.equal(coupling.filter(sample => sample.fallback).length, 9,
        'the no-derivatives wet-edge branch must compile and render all nine real GPU probe frames');
    for (const side of [0, 1]) {
        for (const time of [.4, 2.1, 5.3]) {
            const frames = coupling.filter(sample => !sample.detached && !sample.fallback
                && sample.side === side && sample.time === time);
            for (let index = 1; index < frames.length; index++) {
                const reflectionDelta = frames[index].reflectionRadius - frames[index - 1].reflectionRadius;
                const crestDelta = frames[index].crestRadius - frames[index - 1].crestRadius;
                assert.ok(crestDelta > .02,
                    `the test must actually move the underlying water crest: ${JSON.stringify({ side, time, frames })}`);
                assert.ok(reflectionDelta > .02 && Math.abs(reflectionDelta - crestDelta) < .025,
                    `highlight and water must move outward together, not at separate radii: ${JSON.stringify({ side, time, reflectionDelta, crestDelta })}`);
            }
        }
        assert.ok(coupling.some(sample => sample.detached && sample.side === side && sample.outsideFraction > .10),
            'negative control must reject a fixed-radius reflection even though the real wave still moves');
    }
    console.log(JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ coupling }, null, 2));
    console.log('PASS: real WebGL active audio uniform, four live surface channels, quiet/strong contrast, stable lyric centre, wave-locked reflections across phase/time, detached-rim negative control, no-derivatives fallback and no GPU errors.');
} finally {
    await browser.close();
}
