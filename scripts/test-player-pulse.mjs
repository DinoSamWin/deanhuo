import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const script = readFileSync(new URL('../js/music-player-pulse.js', import.meta.url), 'utf8');

function createHarness({ width = 1440, height = 900, dpr = 2, available = true,
    compileFailure = null, linkFailure = false, derivatives = true, contextThrows = false,
    programFailure = false, bufferFailure = false, skin = 'original',
    reducedMotion = false, hidden = false } = {}) {
    let nextId = 0;
    const classes = new Set();
    const events = new Map();
    const windowEvents = new Map();
    const state = { shaders: [], programs: [], buffers: [], deletedShaders: [], deletedPrograms: [],
        contextRequests: [], bufferUploads: [], viewportCalls: [], draws: [], warnings: [], currentProgram: null };
    const values = {};
    const finite = numbers => numbers.forEach(number => assert.ok(Number.isFinite(number), 'GPU uniforms must be finite'));
    const uniform = (location, numbers) => {
        assert.ok(location?.name, 'uniform location must belong to the initialized program');
        finite(numbers);
        values[location.name] = numbers;
    };
    const gl = {
        VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632, COMPILE_STATUS: 35713, LINK_STATUS: 35714,
        ARRAY_BUFFER: 34962, STATIC_DRAW: 35044, FLOAT: 5126, TRIANGLES: 4,
        getExtension(name) { assert.equal(name, 'OES_standard_derivatives'); return derivatives ? {} : null; },
        createShader(type) { const shader = { id: ++nextId, type }; state.shaders.push(shader); return shader; },
        shaderSource(shader, source) { assert.equal(typeof source, 'string'); shader.source = source; },
        compileShader(shader) { shader.compiled = true; },
        getShaderParameter(shader, name) {
            assert.equal(name, gl.COMPILE_STATUS);
            return !(compileFailure === 'both' || compileFailure === 'vertex' && shader.type === gl.VERTEX_SHADER
                || compileFailure === 'fragment' && shader.type === gl.FRAGMENT_SHADER);
        },
        getShaderInfoLog() { return 'test compilation failure'; },
        deleteShader(shader) {
            assert.ok(!state.deletedShaders.includes(shader), 'shaders must be deleted exactly once');
            state.deletedShaders.push(shader);
        },
        createProgram() {
            if (programFailure) return null;
            const program = { id: ++nextId, shaders: [] };
            state.programs.push(program);
            return program;
        },
        attachShader(program, shader) { assert.ok(program && shader); program.shaders.push(shader); },
        linkProgram(program) { assert.equal(program.shaders.length, 2); program.linked = true; },
        getProgramParameter(program, name) { assert.equal(name, gl.LINK_STATUS); return !linkFailure; },
        deleteProgram(program) { state.deletedPrograms.push(program); },
        useProgram(program) { assert.ok(program && !state.deletedPrograms.includes(program)); state.currentProgram = program; },
        createBuffer() {
            if (bufferFailure) return null;
            const buffer = { id: ++nextId };
            state.buffers.push(buffer);
            return buffer;
        },
        bindBuffer(target, buffer) { assert.equal(target, gl.ARRAY_BUFFER); assert.ok(buffer); },
        bufferData(target, data, usage) {
            assert.equal(target, gl.ARRAY_BUFFER);
            assert.equal(usage, gl.STATIC_DRAW);
            state.bufferUploads.push(Array.from(data));
        },
        getAttribLocation(program, name) { assert.equal(name, 'a_position'); return 0; },
        enableVertexAttribArray(index) { assert.equal(index, 0); },
        vertexAttribPointer(index, size, type) { assert.equal(index, 0); assert.equal(size, 2); assert.equal(type, gl.FLOAT); },
        getUniformLocation(program, name) { return { program, name }; },
        uniform1f(location, number) { uniform(location, [number]); },
        uniform2f(location, ...numbers) { uniform(location, numbers); },
        uniform4f(location, ...numbers) { uniform(location, numbers); },
        uniform3fv(location, numbers) { uniform(location, Array.from(numbers)); },
        uniform4fv(location, numbers) { uniform(location, Array.from(numbers)); },
        viewport(...numbers) { finite(numbers); state.viewportCalls.push(numbers); },
        drawArrays(mode, start, count) {
            assert.equal(mode, gl.TRIANGLES);
            assert.equal(start, 0);
            assert.equal(count, 3, 'a single full-screen triangle renders each input frame');
            assert.ok(state.currentProgram);
            assert.ok(values.u_resolution?.every(number => number > 0));
            state.draws.push(Object.fromEntries(Object.entries(values).map(([key, numbers]) => [key, [...numbers]])));
        }
    };
    const canvas = {
        width: 0, height: 0, dataset: {},
        getContext(type, options) {
            state.contextRequests.push({ type, options });
            assert.equal(type, 'webgl');
            if (contextThrows) throw new Error('test unavailable context');
            return available ? gl : null;
        },
        addEventListener(name, callback) {
            if (!events.has(name)) events.set(name, []);
            events.get(name).push(callback);
        }
    };
    const window = {
        innerWidth: width, innerHeight: height, devicePixelRatio: dpr,
        matchMedia: () => ({ matches: reducedMotion }),
        addEventListener(name, callback) {
            if (!windowEvents.has(name)) windowEvents.set(name, []);
            windowEvents.get(name).push(callback);
        },
        dispatchEvent(event) {
            for (const callback of windowEvents.get(event.type) || []) callback(event);
            return !event.defaultPrevented;
        }
    };
    const document = {
        hidden,
        getElementById: id => id === 'pulse-canvas' ? canvas : null,
        body: { dataset: { playerSkin: skin },
            classList: { add: name => classes.add(name), remove: name => classes.delete(name) } }
    };
    const forbiddenLoop = () => assert.fail('the renderer must not schedule independent animation or timers');
    vm.runInContext(script, vm.createContext({ window, document, Math, Float32Array,
        console: { warn: (...args) => state.warnings.push(args) },
        requestAnimationFrame: forbiddenLoop, setTimeout: forbiddenLoop, setInterval: forbiddenLoop }));
    const renderer = window.DeanPulseVisuals;
    const draw = overrides => {
        renderer.draw({ now: 500, delta: 1000 / 60, bass: .6, mid: .35, treble: .2,
            energy: .5, beat: 0, impact: 0, spectrum: new Uint8Array(512).fill(140),
            binWidth: 44100 / 1024, ...overrides });
        return state.draws.at(-1);
    };
    const emit = name => {
        const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
        for (const callback of events.get(name) || []) callback(event);
        return event;
    };
    return { renderer, canvas, window, state, classes, events, windowEvents, draw, emit };
}

const impulsesOf = frame => Array.from({ length: 4 }, (_, index) =>
    frame['u_impulses[0]'].slice(index * 4, index * 4 + 4)).filter(impulse => impulse[3] > 0);

{
    const h = createHarness();
    assert.equal(h.state.contextRequests.length, 0, 'loading the script must not allocate a GPU context');
    let previousTime = -1;
    for (let index = 0; index < 120; index++) {
        const frame = h.draw({ now: index * 1000 / 120, delta: 1000 / 120 });
        assert.ok(frame.u_time[0] > previousTime, 'liquid time advances on every high-refresh input frame');
        previousTime = frame.u_time[0];
        assert.deepEqual(frame.u_audio, [.6, .35, .2, .5]);
    }
    assert.equal(h.state.draws.length, 120, 'every supplied frame produces one GPU draw');
    assert.equal(h.state.contextRequests.length, 1, 'all frames reuse a single WebGL context');
    assert.equal(h.state.programs.length, 1);
    assert.equal(h.state.buffers.length, 1);
    assert.equal(h.state.bufferUploads.length, 1);
    assert.equal(h.state.shaders.length, 2);
    assert.equal(h.state.deletedShaders.length, 2, 'compiled shaders are released after linking');
    assert.equal(h.state.deletedPrograms.length, 0, 'the live program remains available');
    assert.ok(h.classes.has('has-liquid-field'));
    assert.equal(h.canvas.dataset.renderer, 'webgl-liquid');
    assert.equal(h.renderer.getDiagnostics().frameCount, 120);
    assert.equal(h.state.contextRequests[0].options.antialias, false);
    assert.match(h.state.shaders.find(shader => shader.type === 35632).source, /#define HAS_DERIVATIVES/);
}
console.log('PASS: one GPU context/program/buffer, shader disposal, 120 Hz per-input rendering and continuously advancing uniforms.');

{
    const idle = createHarness({ skin: 'pulse' });
    idle.renderer.reset();
    assert.equal(idle.state.contextRequests.length, 1, 'selecting an idle pulse skin prepares its own initial still');
    assert.equal(idle.state.draws.length, 1, 'initial preparation paints once without starting a loop');
    assert.ok(idle.classes.has('has-liquid-field'), 'the static shader replaces the old CSS rings before first playback');
    const first = idle.state.draws[0];
    assert.deepEqual(first.u_waveStrength, [.30, .32], 'ambient starts at a visible but gentler contrast than playing');
    assert.equal(first.u_time[0], 0);
    assert.equal(first.u_travel[0], 0);
    assert.equal(idle.renderer.getDiagnostics().frameCount, 0, 'still preparation is not counted as an audio frame');
    idle.renderer.setPalette(40, 62);
    idle.renderer.reset();
    assert.equal(idle.state.contextRequests.length, 1, 'static palette/reset calls reuse the same resources');
    assert.deepEqual(idle.state.draws.at(-1).u_waveStrength, first.u_waveStrength);
    assert.equal(idle.state.draws.at(-1).u_travel[0], 0);
    for (const options of [{ skin: 'original' }, { skin: 'pulse', reducedMotion: true }, { skin: 'pulse', hidden: true }]) {
        const h = createHarness(options);
        h.renderer.reset();
        assert.equal(h.state.contextRequests.length, 0, 'unselected/hidden/reduced-motion players retain their lazy static fallback');
    }
    const unavailable = createHarness({ skin: 'pulse', available: false });
    unavailable.renderer.reset();
    unavailable.renderer.reset();
    assert.equal(unavailable.classes.has('has-liquid-field'), false, 'failed initial setup never hides the CSS fallback');
    assert.equal(unavailable.state.contextRequests.length, 1, 'failed initial setup is not retried on every reset');
}
console.log('PASS: one gentle pre-play still, lazy inactive/reduced-motion fallback and no autonomous rendering.');

{
    const settle = (energy, fps = 60) => {
        const h = createHarness({ skin: 'pulse' });
        h.renderer.reset();
        let frame;
        for (let index = 0; index < fps * 3; index++) frame = h.draw({ energy, beat: 0, delta: 1000 / fps });
        return { h, frame };
    };
    const quiet = settle(.07);
    const drive = quiet.frame.u_response[0];
    assert.ok(quiet.frame.u_waveStrength[0] > (.36 + drive * .64) * 1.15,
        'quiet playback gets a modestly stronger broad-wave floor than before');
    assert.ok(quiet.frame.u_waveStrength[1] > (.48 + drive * .70) * 1.15,
        'quiet playback also strengthens local glints without fabricating a beat');
    const loud = settle(.525);
    assert.ok(Math.abs(loud.frame.u_waveStrength[0] - 1) < .000001,
        'maximal broad-wave strength stays at the existing ceiling');
    assert.ok(Math.abs(loud.frame.u_waveStrength[1] - 1.18) < .000001,
        'maximal local-highlight strength stays at the existing ceiling');
    const strong = settle(.46);
    assert.ok(Math.abs(strong.frame.u_waveStrength[0] - (.36 + strong.frame.u_response[0] * .64)) < .000001,
        'strong passages above the low-energy region retain their original intensity');
    const travel = quiet.frame.u_travel[0];
    quiet.h.renderer.reset();
    assert.deepEqual(quiet.h.state.draws.at(-1).u_waveStrength, quiet.frame.u_waveStrength,
        'reset preserves the current background contrast instead of flashing to the ambient floor');
    assert.equal(quiet.h.state.draws.at(-1).u_travel[0], travel, 'switching mode never resets wave geometry');
    const resumed = quiet.h.draw({ energy: 0, beat: 0 });
    assert.ok(Math.abs(resumed.u_waveStrength[0] - quiet.frame.u_waveStrength[0]) < .01,
        'resuming transitions from the existing contrast instead of restarting its entry animation');
    const silent = settle(0);
    assert.ok(Math.abs(silent.frame.u_waveStrength[0] - .44) < .000001);
    assert.ok(Math.abs(silent.frame.u_waveStrength[1] - .58) < .000001);
    const highRefresh = settle(.07, 120);
    for (let channel = 0; channel < 2; channel++) {
        assert.ok(Math.abs(highRefresh.frame.u_waveStrength[channel] - quiet.frame.u_waveStrength[channel]) < 1e-7,
            'the static-to-playing envelope is elapsed-time based at 60/120 Hz');
    }
}
console.log('PASS: stronger quiet-playback floor, unchanged loud peaks, gentle resume and frame-rate-independent intensity.');

{
    const run = fps => {
        const h = createHarness({ skin: 'pulse' });
        h.renderer.reset();
        let lastTravel = 0;
        for (let index = 0; index < fps * 3; index++) {
            // Deliberately pass stale analyser values: the ambient contract must
            // sanitize them instead of producing fake music-driven accents.
            const frame = h.draw({ ambient: true, delta: 1000 / fps, energy: 1, bass: 1,
                mid: 1, treble: 1, beat: 1, impact: 1 });
            assert.deepEqual(frame.u_audio, [0, 0, 0, 0]);
            assert.deepEqual(frame.u_response, [0, 0, 0]);
            assert.equal(frame.u_impact[0], 0);
            assert.ok(frame['u_impulses[0]'].every(value => value === 0), 'ambient frames never create accents');
            assert.ok(frame.u_travel[0] > lastTravel, 'ambient waves keep propagating while audio is paused');
            lastTravel = frame.u_travel[0];
        }
        assert.equal(h.renderer.getDiagnostics().ambient, true);
        assert.deepEqual(h.state.draws.at(-1).u_waveStrength, [.30, .32]);
        const ambientTravel = lastTravel;
        const audio = h.draw({ energy: .5, beat: .4 });
        assert.ok(audio.u_travel[0] > ambientTravel && audio.u_travel[0] - ambientTravel < .004,
            'the first audio frame continues the same transport phase');
        assert.equal(impulsesOf(audio).length, 1, 'real playback may add a real onset');
        assert.equal(h.renderer.getDiagnostics().ambient, false);
        const strength = audio.u_waveStrength;
        h.renderer.reset();
        assert.deepEqual(h.state.draws.at(-1).u_waveStrength, strength, 'pause reset has no background contrast snap');
        assert.ok(h.state.draws.at(-1)['u_impulses[0]'].every(value => value === 0));
        const nextAmbient = h.draw({ ambient: true, delta: 1000 / fps, beat: 1 });
        assert.ok(nextAmbient.u_travel[0] > audio.u_travel[0], 'pause switches to continuing ambient travel');
        assert.ok(nextAmbient.u_waveStrength[0] > .30 && nextAmbient.u_waveStrength[0] < strength[0],
            'ambient contrast eases toward its floor rather than dropping in one frame');
        for (let index = 0; index < fps * 4; index++) h.draw({ ambient: true, delta: 1000 / fps });
        assert.ok(Math.abs(h.state.draws.at(-1).u_waveStrength[0] - .30) < 1e-6);
        assert.equal(h.renderer.getDiagnostics().activeImpulses, 0);
        return ambientTravel;
    };
    assert.ok(Math.abs(run(60) - run(120)) < 1e-10, 'ambient transport is independent of display refresh rate');
}
console.log('PASS: continuous ambient waves, sanitized audio fields, no synthetic beats and seamless ambient/audio/pause transitions.');

{
    const h = createHarness();
    const positions = [];
    for (let index = 0; index < 20; index++) {
        const frame = h.draw({ delta: 25, beat: index % 2 ? .25 : 1, impact: .8 });
        const impulses = impulsesOf(frame);
        assert.ok(impulses.length > 0 && impulses.length <= 4, 'live impulses stay bounded to four');
        for (const [x, y, age, strength] of impulses) {
            assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1);
            assert.ok(age >= 0 && age < 1.6 && strength > 0 && strength <= 1);
        }
        positions.push(impulses.at(-1).slice(0, 2));
    }
    assert.ok(new Set(positions.map(([x]) => x)).size > 5, 'beat displacement changes horizontal position');
    assert.ok(new Set(positions.map(([, y]) => y)).size > 5, 'beat displacement changes vertical position');
    assert.equal(h.renderer.getDiagnostics().activeImpulses, 4);
    for (let index = 0; index < 40; index++) h.draw({ delta: 50 });
    assert.equal(h.renderer.getDiagnostics().activeImpulses, 0, 'impulses expire after their viscous release');
    assert.ok(h.state.draws.at(-1)['u_impulses[0]'].every(number => number === 0));
    const before = h.state.draws.length;
    h.draw({ delta: 16, energy: 0, bass: 0, mid: 0, treble: 0 });
    assert.equal(h.state.draws.length, before + 1, 'silence can retain a soft flowing material');
    assert.equal(h.renderer.getDiagnostics().activeImpulses, 0, 'silence creates no synthetic beat displacement');
}
console.log('PASS: variable local beat positions, normalized strength, four-impulse bound, expiration and no synthetic silent beats.');

{
    const h = createHarness();
    const first = h.draw({ beat: .35, impact: .8 });
    const [origin] = impulsesOf(first);
    let previousTime = first.u_time[0];
    let previousAge = origin[2];
    for (let index = 0; index < 90; index++) {
        const frame = h.draw({ delta: 1000 / 120, beat: 0, impact: 0 });
        const live = impulsesOf(frame);
        assert.equal(live.length, 1, 'frames without a new onset retain only the existing local impulse');
        const [x, y, age, strength] = live[0];
        assert.deepEqual([x, y, strength], [origin[0], origin[1], origin[3]],
            'local randomness is sampled at onset, never re-randomized as the field moves between frames');
        assert.ok(age > previousAge && Math.abs(age - previousAge - 1 / 120) < 1e-6,
            'an existing impulse evolves continuously with elapsed time at high refresh rates');
        assert.ok(frame.u_time[0] > previousTime && frame.u_time[0] - previousTime < .05,
            'the shared flow phase advances continuously, without per-frame reseeding or phase jumps');
        previousAge = age;
        previousTime = frame.u_time[0];
    }
    const next = h.draw({ delta: 1000 / 120, beat: .35, impact: .8 });
    const live = impulsesOf(next);
    assert.equal(live.length, 2, 'a new onset adds a local accent without replacing a still-live prior accent');
    assert.deepEqual([live[0][0], live[0][1], live[0][3]], [origin[0], origin[1], origin[3]],
        'a new random accent must not teleport the preceding accent');
    assert.notDeepEqual(live[1].slice(0, 2), origin.slice(0, 2), 'successive accents vary their local origin');
}
console.log('PASS: stable random origins across 120 Hz frames, continuous impulse age/flow phase and independent new onsets.');

{
    const delayed = createHarness();
    const bounded = createHarness();
    delayed.draw({ beat: .3 });
    bounded.draw({ beat: .3 });
    const resumed = delayed.draw({ delta: 10000, beat: 0 });
    const normal = bounded.draw({ delta: 50, beat: 0 });
    for (const name of ['u_time', 'u_travel', 'u_response', 'u_impulses[0]']) {
        assert.deepEqual(resumed[name], normal[name],
            'returning after a long suspended frame must advance at most 50 ms, not jump the flow or its accents');
    }
    const travelStep = resumed.u_travel[0] - delayed.state.draws[0].u_travel[0];
    assert.ok(travelStep > 0 && travelStep < .015,
        'suspended recovery continues outward by a bounded distance instead of leaping or reversing');
    assert.equal(delayed.state.draws.length, 2, 'long stalls recover with one bounded draw, not a burst of catch-up frames');
}
console.log('PASS: suspended-frame recovery preserves coherent phase/accents with bounded time and no catch-up burst.');

{
    const runTravel = fps => {
        const h = createHarness();
        const energies = [.06, .50, 0, .10, .55, 0, 0, 0];
        let previousTravel = 0;
        const distances = [];
        for (let second = 0; second < energies.length; second++) {
            const start = previousTravel;
            for (let index = 0; index < fps; index++) {
                const energy = energies[second];
                const frame = h.draw({ delta: 1000 / fps, now: (second + index / fps) * 1000,
                    energy, bass: energy, mid: energy, treble: energy,
                    beat: energy > .4 && index === 0 ? .4 : 0, impact: 0 });
                const travel = frame.u_travel[0];
                assert.ok(travel > previousTravel,
                    'propagation must move outward on every frame, including abrupt loud-to-silent transitions');
                assert.ok(travel - previousTravel < .3 / fps,
                    'audio changes cannot jump or accelerate the base radial phase');
                assert.equal(h.renderer.getDiagnostics().waveTravel, travel,
                    'wave diagnostics must report the exact propagation uniform submitted to the GPU');
                previousTravel = travel;
            }
            distances.push(previousTravel - start);
        }
        return { travel: previousTravel, distances };
    };
    const sixty = runTravel(60);
    const highRefresh = runTravel(120);
    for (const distance of sixty.distances) {
        assert.ok(Math.abs(distance - .19 / (.8 * 1.50)) < 1e-10,
            'quiet, loud and silent passages retain the same measured base-wave cadence');
    }
    assert.ok(Math.abs(sixty.travel - highRefresh.travel) < 1e-10,
        'the same eight-second timeline produces matching propagation at 60/120 Hz');
    const perSecond = sixty.distances[0];
    const sideFactors = script.match(/float travel = u_travel \* mix\(([\d.]+), ([\d.]+), side\)/);
    assert.ok(sideFactors, 'shader exposes the two fixed propagation factors');
    assert.ok(Math.abs(.19 / (perSecond * Number(sideFactors[1])) - .8) < 1e-10,
        'left-side mean crest cadence matches approximately one wave per .8 seconds');
    assert.ok(Math.abs(.19 / (perSecond * Number(sideFactors[2])) - 1.6) < 1e-10,
        'right-side mean crest cadence matches approximately one wave per 1.6 seconds');
    const silenceAt = fps => {
        const h = createHarness();
        for (let index = 0; index < fps * 3; index++) {
            h.draw({ delta: 1000 / fps, energy: 0, bass: 0, mid: 0, treble: 0, beat: 0, impact: 0 });
        }
        return h.renderer.getDiagnostics().waveTravel;
    };
    const silentTravel = silenceAt(60);
    assert.ok(Math.abs(silentTravel - 3 * .19 / (.8 * 1.50)) < 1e-10,
        'silence uses elapsed time for its steady outward drift, not the number of frames');
    assert.ok(Math.abs(silentTravel - silenceAt(120)) < 1e-10,
        'silent travel is identical over equal elapsed time at 60 Hz and 120 Hz');
}
console.log('PASS: constant outward base cadence, measured left/right intervals and 60/120 Hz consistency across loud/quiet/silent passages.');

{
    const quiet = createHarness();
    const strong = createHarness();
    let quietFrame, strongFrame;
    for (let index = 0; index < 120; index++) {
        quietFrame = quiet.draw({ energy: .07, bass: .09, mid: .06, treble: .025 });
        strongFrame = strong.draw({ energy: .46, bass: .7, mid: .4, treble: .25 });
    }
    const quietDrive = quietFrame.u_response[0];
    const strongDrive = strongFrame.u_response[0];
    assert.ok(quietDrive > 0 && quietDrive < .12, 'quiet passages retain a small, visible liquid response');
    assert.ok(strongDrive > .7 && strongDrive <= 1, 'loud passages use a substantially larger bounded response');
    assert.ok(strongDrive > quietDrive * 8,
        'the amplitude curve must preserve strong quiet/loud separation rather than compressing both with sqrt');
    assert.ok(strongFrame.u_time[0] > quietFrame.u_time[0] * 3,
        'louder passages animate the local water-glint deformation without changing base propagation');
    const quietAccent = quiet.draw({ energy: .07, beat: .055 });
    const strongAccent = strong.draw({ energy: .46, beat: .38 });
    assert.ok(strongAccent.u_response[1] > quietAccent.u_response[1] * 8,
        'strong accents must visibly exceed small accents rather than sharing a minimum-strength plateau');
    assert.ok(impulsesOf(strongAccent).at(-1)[3] > impulsesOf(quietAccent).at(-1)[3] * 8,
        'local material displacement must preserve the same strong/weak distinction as the global response');
}
console.log('PASS: convex quiet/loud drive, responsive local-glint deformation and distinct weak/strong local punches.');

{
    const h = createHarness();
    const first = h.draw({ energy: .525, beat: .435, impact: .9 });
    assert.ok(first.u_response[0] > .25, 'loudness starts responding in the first display frame');
    assert.ok(first.u_response[1] > .9, 'a strong onset reaches its punch immediately, without startup latency');
    assert.ok(first.u_response[2] > 0, 'the first real onset contributes to tempo density');
    const second = h.draw({ energy: 0, bass: 0, mid: 0, treble: 0, beat: 0, impact: 0 });
    for (let channel = 0; channel < 3; channel++) {
        assert.ok(second.u_response[channel] > 0 && second.u_response[channel] < first.u_response[channel],
            'after the onset, drive/punch/density release smoothly rather than rising late or snapping off');
    }
    let silent;
    for (let index = 0; index < 300; index++) {
        silent = h.draw({ energy: 0, bass: 0, mid: 0, treble: 0, beat: 0, impact: 0 });
    }
    assert.ok(silent.u_response.every(value => value < .001), 'all three responses settle back toward zero in silence');
    assert.equal(h.renderer.getDiagnostics().activeImpulses, 0, 'a decaying response must not generate new beat impulses');
}
console.log('PASS: first-frame attack, immediate strong punch, smooth time-based release and silent settling without synthetic beats.');

{
    const runRhythm = (intervalFrames, fps = 60) => {
        const h = createHarness();
        let totalDensity = 0, samples = 0;
        for (let index = 0; index < fps * 5; index++) {
            const frame = h.draw({ now: index * 1000 / fps, delta: 1000 / fps,
                energy: .25, bass: .3, mid: .2, treble: .12,
                beat: index % intervalFrames === 0 ? .35 : 0 });
            if (index >= fps * 2) { totalDensity += frame.u_response[2]; samples++; }
        }
        return { h, meanDensity: totalDensity / samples, frame: h.state.draws.at(-1) };
    };
    const sparse = runRhythm(60);
    const rapid = runRhythm(15);
    assert.ok(rapid.meanDensity > sparse.meanDensity * 2.5,
        'four real accents per second accumulate much more motion density than one equal-strength accent');
    assert.ok(rapid.frame.u_time[0] > sparse.frame.u_time[0] * 1.25,
        'denser real onsets influence local-glint deformation independently of base-wave propagation');
    assert.ok(Math.abs(rapid.frame.u_response[0] - sparse.frame.u_response[0]) < 1e-10,
        'tempo density must not rewrite the independent loudness envelope');
    const highRefresh = runRhythm(30, 120);
    assert.ok(Math.abs(highRefresh.meanDensity - rapid.meanDensity) < .015,
        'density is elapsed-time based and stays consistent at 60 Hz and 120 Hz');
    assert.ok(Math.abs(highRefresh.frame.u_response[0] - rapid.frame.u_response[0]) < 1e-10,
        'the drive envelope is refresh-rate independent');
    assert.equal(highRefresh.h.state.draws.length, 600, 'higher-refresh response still draws on every supplied frame');
}
console.log('PASS: rapid versus sparse beat-density separation, independent loudness and consistent 60/120 Hz response.');

{
    const h = createHarness();
    const deltas = [1000 / 120, 1000 / 60, 1000 / 30, 180];
    for (let index = 0; index < 480; index++) {
        const maximum = index % 7 < 4;
        const frame = h.draw({ delta: deltas[index % deltas.length], energy: maximum ? 1 : 0,
            bass: maximum ? 1 : 0, mid: maximum ? 1 : 0, treble: maximum ? 1 : 0,
            beat: maximum ? 1 : .001, impact: maximum ? 1 : 0 });
        assert.equal(frame.u_response.length, 3);
        assert.ok(frame.u_response.every(value => Number.isFinite(value) && value >= 0 && value <= 1),
            'drive, punch and density remain normalized under repeated maximal onsets and stalled frames');
        for (const numbers of Object.values(frame)) {
            assert.ok(numbers.every(Number.isFinite), 'all submitted GPU uniforms remain finite');
        }
        const { drive, punch, density } = h.renderer.getDiagnostics();
        assert.deepEqual(frame.u_response, [drive, punch, density], 'diagnostics describe the actual GPU response');
    }
    h.renderer.reset();
    assert.deepEqual(h.state.draws.at(-1).u_response, [0, 0, 0], 'reset immediately clears every response channel');
    const { drive, punch, density } = h.renderer.getDiagnostics();
    assert.deepEqual([drive, punch, density], [0, 0, 0], 'reset also clears diagnostic response state');
    const resumed = h.draw({ energy: 0, bass: 0, mid: 0, treble: 0, beat: 0, impact: 0 });
    assert.deepEqual(resumed.u_response, [0, 0, 0], 'resuming in silence cannot resurrect a pre-reset punch or tempo density');
}
console.log('PASS: finite bounded response uniforms under stress, exact response reset and no stale response on silent resume.');

{
    const h = createHarness();
    h.draw({ beat: .9, impact: .8 });
    const time = h.state.draws.at(-1).u_time[0];
    const travel = h.state.draws.at(-1).u_travel[0];
    const frameCount = h.renderer.getDiagnostics().frameCount;
    const draws = h.state.draws.length;
    h.renderer.reset();
    assert.equal(h.state.draws.length, draws + 1, 'reset repaints once before the owner supplies the next ambient frame');
    const paused = h.state.draws.at(-1);
    assert.equal(paused.u_time[0], time, 'reset alone neither advances nor rewinds the surface clock');
    assert.equal(paused.u_travel[0], travel, 'reset alone leaves outward travel in place until the next supplied frame');
    assert.equal(h.renderer.getDiagnostics().waveTravel, travel);
    assert.deepEqual(paused.u_audio, [0, 0, 0, 0]);
    assert.equal(paused.u_impact[0], 0);
    assert.deepEqual(paused.u_response, [0, 0, 0]);
    assert.ok(paused['u_impulses[0]'].every(number => number === 0));
    assert.equal(h.renderer.getDiagnostics().activeImpulses, 0);
    const beforeRotation = h.state.draws.length;
    const previousViewport = h.state.viewportCalls.at(-1);
    h.window.innerWidth = 390;
    h.window.innerHeight = 844;
    h.window.dispatchEvent({ type: 'resize' });
    assert.equal(h.state.draws.length, beforeRotation + 1,
        'orientation changes redraw a paused surface without waiting for another audio frame');
    assert.notDeepEqual(h.state.viewportCalls.at(-1), previousViewport);
    assert.deepEqual(h.state.viewportCalls.at(-1), [0, 0, h.canvas.width, h.canvas.height]);
    const rotated = h.state.draws.at(-1);
    assert.deepEqual(rotated.u_resolution, [h.canvas.width, h.canvas.height]);
    assert.ok(Math.abs(h.canvas.width / h.canvas.height - 390 / 844) < .003,
        'paused portrait rotation updates the surface aspect instead of stretching the old buffer');
    assert.equal(rotated.u_time[0], time, 'paused orientation redraw preserves the frozen liquid clock');
    assert.equal(rotated.u_travel[0], travel, 'paused rotation redraw preserves the frozen outward wave position');
    assert.equal(h.renderer.getDiagnostics().frameCount, frameCount);
    assert.deepEqual(rotated.u_audio, [0, 0, 0, 0]);
    assert.deepEqual(rotated.u_response, [0, 0, 0], 'paused rotation must not restart the liquid response');
    assert.ok(rotated['u_impulses[0]'].every(number => number === 0));
    h.renderer.reset();
    h.renderer.setPalette(325, 65);
    assert.equal(h.state.draws.at(-1).u_time[0], time, 'repainting/resetting a paused surface must not advance time');
    assert.equal(h.state.draws.at(-1).u_travel[0], travel, 'palette changes and repeated resets cannot move paused waves');
    assert.equal(h.renderer.getDiagnostics().frameCount, frameCount);
    const pink = h.state.draws.at(-1);
    h.renderer.setPalette(128, 48);
    const green = h.state.draws.at(-1);
    for (const name of ['u_dark', 'u_mid', 'u_light']) {
        assert.equal(pink[name].length, 3);
        assert.ok(pink[name].every(number => number >= 0 && number <= 1));
        assert.ok(green[name].every(number => number >= 0 && number <= 1));
        assert.notDeepEqual(pink[name], green[name], 'cover palettes produce distinct material colours');
    }
    h.renderer.setPalette(218, 0);
    for (const name of ['u_dark', 'u_mid', 'u_light']) {
        const [red, greenChannel, blue] = h.state.draws.at(-1)[name];
        assert.equal(red, greenChannel);
        assert.equal(greenChannel, blue, 'zero-saturation covers produce a neutral material');
    }
    const resumed = h.draw();
    assert.ok(resumed.u_time[0] > time, 'resuming advances from the frozen state');
    assert.ok(resumed.u_travel[0] > travel, 'resuming continues outward from the exact frozen travel, never inward');
}
console.log('PASS: reset/resize preserve phase between supplied frames, clear impulses, reuse palettes and never create autonomous loops.');

{
    const h = createHarness({ width: 3840, height: 2160, dpr: 4 });
    h.draw();
    const initial = h.renderer.getDiagnostics();
    assert.ok(initial.width * initial.height < 1105000, 'large screens have a bounded fill-cost buffer');
    assert.ok(initial.renderScale <= 1.25);
    const viewports = h.state.viewportCalls.length;
    h.draw();
    assert.equal(h.state.viewportCalls.length, viewports, 'stable sizes do not reallocate the buffer');
    for (let index = 0; index < 1000; index++) h.draw({ delta: 33 });
    const reduced = h.renderer.getDiagnostics();
    assert.ok(reduced.width < initial.width && reduced.height < initial.height,
        'sustained slow frames reduce fill cost rather than dropping animation frames');
    assert.ok(reduced.renderScale >= initial.renderScale * .55 - 0.00001, 'adaptive resolution has a quality floor');
    assert.equal(h.state.draws.length, 1002, 'adaptive quality never skips supplied frames');
    h.window.innerWidth = 390;
    h.window.innerHeight = 844;
    h.window.devicePixelRatio = 3;
    h.draw({ delta: 8.33 });
    const portrait = h.renderer.getDiagnostics();
    assert.ok(Math.abs(portrait.width / portrait.height - 390 / 844) < .003);
    assert.ok(portrait.width <= Math.ceil(390 * 1.25) && portrait.height <= Math.ceil(844 * 1.25));
    assert.ok(portrait.width > 0 && portrait.height > 0);
    assert.deepEqual(h.state.draws.at(-1).u_resolution, [portrait.width, portrait.height]);
    assert.equal(h.state.programs.length, 1, 'resizing never recompiles the material');
    const stalled = createHarness();
    stalled.draw();
    const fullWidth = stalled.canvas.width;
    for (let index = 0; index < 180; index++) stalled.draw({ delta: 140 });
    assert.ok(stalled.canvas.width < fullWidth, 'frames slower than 100 ms also trigger quality reduction');
}
console.log('PASS: bounded pixel budget/DPR, viewport reuse, bounded adaptive quality and orientation resizing without frame drops.');

{
    for (const options of [{ available: false }, { contextThrows: true }, { compileFailure: 'vertex' },
        { compileFailure: 'fragment' }, { compileFailure: 'both' }, { linkFailure: true },
        { programFailure: true }, { bufferFailure: true }]) {
        const h = createHarness(options);
        assert.doesNotThrow(() => h.draw());
        assert.doesNotThrow(() => h.renderer.reset());
        assert.doesNotThrow(() => h.renderer.setPalette(30, 60));
        assert.equal(h.state.draws.length, 0, 'GPU setup failure retains the CSS fallback');
        assert.equal(h.classes.has('has-liquid-field'), false, 'failed setup must not hide the fallback');
        assert.equal(h.renderer.getDiagnostics().renderer, 'static');
        assert.equal(h.state.deletedShaders.length, h.state.shaders.length, 'all allocated shaders are disposed on failure');
        if (options.linkFailure || options.bufferFailure) assert.equal(h.state.deletedPrograms.length, 1);
        const requests = h.state.contextRequests.length;
        h.draw();
        assert.equal(h.state.contextRequests.length, requests, 'permanent setup failure does not retry every frame');
    }
    const compatibility = createHarness({ derivatives: false });
    compatibility.draw();
    assert.equal(compatibility.state.draws.length, 1, 'the renderer also initializes without the derivative extension');
    assert.doesNotMatch(compatibility.state.shaders.find(shader => shader.type === 35632).source,
        /#define HAS_DERIVATIVES/);
    const accelerated = createHarness();
    accelerated.draw();
    assert.ok(compatibility.canvas.width <= accelerated.canvas.width * .71,
        'the costlier derivative-free shader starts at a reduced resolution');
}
console.log('PASS: missing/throwing WebGL, shader/link/allocation failures, cleanup, static fallback and derivative-free quality.');

{
    const h = createHarness();
    h.draw({ beat: .8 });
    const time = h.state.draws.at(-1).u_time[0];
    const beforeLoss = h.state.draws.length;
    const event = h.emit('webglcontextlost');
    assert.equal(event.defaultPrevented, true, 'context loss permits restoration');
    assert.equal(h.classes.has('has-liquid-field'), false, 'context loss reveals the CSS fallback');
    assert.equal(h.renderer.getDiagnostics().renderer, 'static');
    h.draw({ delta: 50 });
    h.renderer.reset();
    h.renderer.setPalette(45, 60);
    assert.equal(h.state.draws.length, beforeLoss, 'lost contexts are not drawn into');
    h.emit('webglcontextrestored');
    assert.equal(h.classes.has('has-liquid-field'), true);
    assert.equal(h.renderer.getDiagnostics().renderer, 'webgl-liquid');
    assert.equal(h.state.programs.length, 2, 'restoration rebuilds the invalid program');
    assert.equal(h.state.buffers.length, 2, 'restoration rebuilds the invalid vertex buffer');
    assert.equal(h.state.deletedShaders.length, 4);
    assert.equal(h.state.draws.at(-1).u_time[0], time, 'lost/paused time does not advance during restoration');
    assert.ok(h.state.draws.at(-1)['u_impulses[0]'].every(number => number === 0));
    assert.equal(h.events.get('webglcontextlost').length, 1);
    assert.equal(h.events.get('webglcontextrestored').length, 1, 'restoration must not duplicate lifecycle handlers');
    assert.equal(h.windowEvents.get('resize').length, 1, 'restoration must not duplicate paused resize handlers');
    assert.ok(h.draw().u_time[0] > time);
    assert.equal(h.state.contextRequests.length, 2);
}
console.log('PASS: context loss fallback, restoration resource rebuild, paused clock preservation and single lifecycle listeners.');
