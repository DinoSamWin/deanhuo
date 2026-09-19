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
    console.log(JSON.stringify(report, null, 2));
    console.log('PASS: real WebGL active audio uniform, four live surface channels, same-phase quiet/strong contrast, stable lyric centre and no GPU errors.');
} finally {
    await browser.close();
}
