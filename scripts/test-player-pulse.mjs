import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const script = readFileSync(new URL('../js/music-player-pulse.js', import.meta.url), 'utf8');

function createHarness({ width = 1440, height = 900, dpr = 2, available = true,
    compileFailure = null, linkFailure = false, derivatives = true, contextThrows = false,
    programFailure = false, bufferFailure = false } = {}) {
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
        getElementById: id => id === 'pulse-canvas' ? canvas : null,
        body: { classList: { add: name => classes.add(name), remove: name => classes.delete(name) } }
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
    h.draw({ beat: .9, impact: .8 });
    const time = h.state.draws.at(-1).u_time[0];
    const frameCount = h.renderer.getDiagnostics().frameCount;
    const draws = h.state.draws.length;
    h.renderer.reset();
    assert.equal(h.state.draws.length, draws + 1, 'pause/reset redraws a still liquid surface');
    const paused = h.state.draws.at(-1);
    assert.equal(paused.u_time[0], time, 'reset freezes the liquid clock without rewinding the surface');
    assert.deepEqual(paused.u_audio, [0, 0, 0, 0]);
    assert.equal(paused.u_impact[0], 0);
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
    assert.equal(h.renderer.getDiagnostics().frameCount, frameCount);
    assert.deepEqual(rotated.u_audio, [0, 0, 0, 0]);
    assert.ok(rotated['u_impulses[0]'].every(number => number === 0));
    h.renderer.reset();
    h.renderer.setPalette(325, 65);
    assert.equal(h.state.draws.at(-1).u_time[0], time, 'repainting/resetting a paused surface must not advance time');
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
    assert.ok(h.draw().u_time[0] > time, 'resuming advances from the frozen state');
}
console.log('PASS: pause freezes clocks, clears impulses, redraws rotation correctly, has no autonomous loops and uses valid palettes.');

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
