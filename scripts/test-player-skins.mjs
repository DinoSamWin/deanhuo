import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const script = readFileSync(new URL('../js/music-player-skins.js', import.meta.url), 'utf8');

class Element {
    constructor() {
        this.events = new Map();
        this.attributes = new Map();
        this.dataset = {};
        this.hidden = false;
        this.inert = false;
        this.properties = new Map();
        this.style = { setProperty: (name, value) => this.properties.set(name, value) };
        this.classes = new Set();
        this.classList = {
            add: name => this.classes.add(name),
            remove: name => this.classes.delete(name),
            contains: name => this.classes.has(name),
            toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name)
        };
    }

    addEventListener(name, callback) {
        if (!this.events.has(name)) this.events.set(name, []);
        this.events.get(name).push(callback);
    }

    emit(name, values = {}) {
        const event = {
            target: this,
            defaultPrevented: false,
            immediateStopped: false,
            preventDefault() { this.defaultPrevented = true; },
            stopPropagation() {},
            stopImmediatePropagation() { this.immediateStopped = true; },
            ...values
        };
        for (const callback of this.events.get(name) || []) {
            callback(event);
            if (event.immediateStopped) break;
        }
        return event;
    }

    async emitNative(name) {
        const event = { target: this, preventDefault() {} };
        for (const callback of this.events.get(name) || []) {
            callback(event);
            // Browsers can perform a microtask checkpoint between listeners of
            // a native event, unlike dispatchEvent inside one JavaScript task.
            await Promise.resolve();
        }
    }

    setAttribute(name, value) { this.attributes.set(name, value); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    contains(element) { return element === this || Boolean(element?.parent && this.contains(element.parent)); }
    closest(selector) { return selector === '.player-chrome' && this.chrome ? this : this.parent?.closest(selector) || null; }
}

function createHarness({ storedSkin, audioUrl = 'assets/audio/test.mp3', reduced = false, refreshRate = 60,
    fullscreenApi = 'none', fullscreenFailure = false, rendererAvailable = true,
    audioContextAvailable = true, audioContextState = 'running', resumeMode = 'resolve' } = {}) {
    let now = 0;
    let sequence = 0;
    const scheduled = new Map();
    const schedule = (callback, delay) => {
        const id = ++sequence;
        scheduled.set(id, { callback, at: now + delay });
        return id;
    };
    const advance = milliseconds => {
        const end = now + milliseconds;
        let iterations = 0;
        while (scheduled.size) {
            const [id, task] = [...scheduled].sort((a, b) => a[1].at - b[1].at)[0];
            if (task.at > end) break;
            assert.ok(iterations++ < 10000, 'scheduled callbacks must make forward progress');
            now = task.at;
            scheduled.delete(id);
            task.callback(now);
        }
        now = end;
    };

    const document = new Element();
    const body = new Element();
    const toggle = new Element();
    const menu = new Element();
    const fullscreen = new Element();
    const toolbar = new Element();
    const close = new Element();
    const playback = new Element();
    const original = new Element();
    const pulse = new Element();
    const audio = new Element();
    const motion = new Element();
    const visualCanvas = new Element();
    toggle.parent = fullscreen.parent = menu.parent = toolbar;
    const chrome = [toolbar, close, playback];
    chrome.forEach(element => { element.chrome = true; });
    [...chrome, toggle, fullscreen].forEach(element => {
        element.focus = () => { document.activeElement = element; };
        let inert = false;
        Object.defineProperty(element, 'inert', {
            get: () => inert,
            set: value => {
                inert = value;
                if (!value || !element.contains(document.activeElement)) return;
                document.activeElement = body;
                element.emit('blur');
                document.emit('focusout', { target: element });
                document.emit('focusin', { target: body });
            }
        });
    });
    original.dataset.skinOption = 'original';
    pulse.dataset.skinOption = 'pulse';
    menu.hidden = true;
    document.body = body;
    document.hidden = false;
    document.baseURI = 'http://localhost/';
    document.activeElement = body;
    document.documentElement = new Element();
    document.fullscreenEnabled = false;
    const fullscreenCalls = { requests: 0, exits: 0, target: null };
    if (fullscreenApi !== 'none') {
        const webkit = fullscreenApi === 'webkit';
        const elementKey = webkit ? 'webkitFullscreenElement' : 'fullscreenElement';
        const changeEvent = webkit ? 'webkitfullscreenchange' : 'fullscreenchange';
        document[webkit ? 'webkitFullscreenEnabled' : 'fullscreenEnabled'] = true;
        body[webkit ? 'webkitRequestFullscreen' : 'requestFullscreen'] = function () {
            fullscreenCalls.requests++;
            fullscreenCalls.target = this;
            if (fullscreenFailure) return Promise.reject(new Error('Host disallows fullscreen'));
            document[elementKey] = this;
            document.emit(changeEvent);
            return Promise.resolve();
        };
        document[webkit ? 'webkitExitFullscreen' : 'exitFullscreen'] = function () {
            assert.equal(this, document, 'native exit method retains its document receiver');
            fullscreenCalls.exits++;
            document[elementKey] = null;
            document.emit(changeEvent);
            return Promise.resolve();
        };
    }
    document.getElementById = id => ({
        'skin-toggle': toggle,
        'skin-menu': menu,
        'btn-fullscreen': fullscreen,
        'btn-close': close,
        'pulse-canvas': visualCanvas
    })[id];
    document.querySelectorAll = selector => selector === '[data-skin-option]'
        ? [original, pulse] : selector === '.player-chrome' ? chrome : [];
    audio.paused = true;
    audio.ended = false;
    audio.playCount = 0;
    audio.currentTime = 38;
    audio.setAttribute('src', audioUrl);
    audio.play = () => {
        audio.playCount++;
        audio.paused = false;
        audio.emit('play');
        audio.emit('playing');
    };
    audio.pause = () => {
        audio.paused = true;
        audio.emit('pause');
    };
    motion.matches = reduced;

    const state = { contexts: [], sources: [], energy: 0, spectrum: null, images: [], pixels: [],
        canvasFails: false, frames: [], resetCount: 0, palettes: [], animationFrames: 0, analysisFrames: 0,
        renderer: rendererAvailable ? 'webgl-liquid' : 'static' };
    class AudioNode {
        constructor() { this.destinations = []; }
        connect(destination) { this.destinations.push(destination); }
        disconnect() { this.destinations = []; }
    }
    class AudioContext extends Element {
        constructor() {
            super();
            state.contexts.push(this);
            this.state = audioContextState;
            this.sampleRate = 44100;
            this.destination = new AudioNode();
        }
        resume() {
            if (resumeMode === 'pending') return new Promise(() => {});
            if (resumeMode === 'reject') return Promise.reject(new Error('Audio resume denied'));
            this.state = 'running';
            return Promise.resolve();
        }
        createAnalyser() {
            const node = new AudioNode();
            node.frequencyBinCount = 512;
            node.getByteFrequencyData = data => {
                state.analysisFrames++;
                return state.spectrum ? data.set(state.spectrum) : data.fill(state.energy);
            };
            return node;
        }
        createMediaElementSource(element) {
            assert.equal(element, audio);
            assert.equal(state.sources.length, 0, 'one media element must never receive a second source node');
            const source = new AudioNode();
            state.sources.push(source);
            return source;
        }
    }
    class Image {
        constructor() { state.images.push(this); }
        set src(value) { this.url = value; }
    }
    document.createElement = () => ({
        getContext: () => ({
            drawImage() {},
            getImageData() {
                if (state.canvasFails) throw new Error('Canvas access denied');
                return { data: state.pixels };
            }
        })
    });
    const storage = new Map(storedSkin ? [['dean-player-skin', storedSkin]] : []);
    const window = {
        location: { origin: 'http://localhost' },
        matchMedia: () => motion,
        localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
        AudioContext: audioContextAvailable ? AudioContext : undefined,
        DeanPulseVisuals: {
            draw: frame => state.frames.push({ ...frame, spectrum: Array.from(frame.spectrum || []) }),
            reset: () => { state.resetCount++; },
            setPalette: (hue, saturation) => state.palettes.push({ hue, saturation }),
            getDiagnostics: () => ({ renderer: state.renderer })
        }
    };
    const context = vm.createContext({
        window, document, URL, Image, Uint8Array,
        performance: { now: () => now },
        setTimeout: schedule,
        clearTimeout: id => scheduled.delete(id),
        requestAnimationFrame: callback => schedule(time => {
            state.animationFrames++;
            callback(time);
        }, 1000 / refreshRate),
        cancelAnimationFrame: id => scheduled.delete(id),
        queueMicrotask
    });
    vm.runInContext(script, context);
    const skin = window.DeanPlayerSkin;
    let changes = 0;
    skin.init({ audio, onChange: () => changes++ });
    // The real renderer binds these lazily on its first reset/draw, after the
    // skin controller has already attached its lifecycle listeners.
    visualCanvas.addEventListener('webglcontextlost', () => { state.renderer = 'static'; });
    visualCanvas.addEventListener('webglcontextrestored', () => {
        state.renderer = rendererAvailable ? 'webgl-liquid' : 'static';
    });
    const level = () => Number(body.properties.get('--pulse-level') || 0);
    const palette = () => ({
        hue: Number(body.properties.get('--pulse-hue')),
        saturation: Number.parseFloat(body.properties.get('--pulse-saturation'))
    });
    const solidPixels = (red, green, blue) => {
        state.pixels = new Uint8ClampedArray(32 * 32 * 4);
        for (let index = 0; index < state.pixels.length; index += 4) state.pixels.set([red, green, blue, 255], index);
    };
    const spectrum = ({ bass = 0, mid = 0, treble = 0 } = {}) => {
        state.spectrum = Uint8Array.from({ length: 512 }, (_, index) => {
            const frequency = index * 44100 / 1024;
            if (frequency >= 40 && frequency < 250) return bass;
            if (frequency >= 250 && frequency < 2400) return mid;
            if (frequency >= 2400 && frequency <= 10000) return treble;
            return 0;
        });
    };
    return { skin, document, body, toggle, menu, original, pulse, audio, motion, state, storage, fullscreen, fullscreenCalls,
        toolbar, close, playback,
        visualCanvas, advance, level, palette, solidPixels, spectrum, changes: () => changes };
}

{
    const h = createHarness({ storedSkin: 'pulse' });
    assert.equal(h.skin.isImmersive(), true);
    assert.equal(h.audio.playCount, 0, 'restoring a skin never autoplays');
    assert.equal(h.state.contexts.length, 0, 'paused restoration does not create an audio context');
    h.skin.prepareAudio();
    assert.equal(h.state.contexts.length, 0, 'a pre-play preparation call never creates an audio context');
    h.audio.play();
    h.skin.prepareAudio();
    assert.equal(h.state.sources.length, 1);
    const source = h.state.sources[0];
    const analyser = source.destinations[0];
    assert.ok(analyser.destinations.includes(h.state.contexts[0].destination), 'audio must reach the output');
    h.advance(1200);
    assert.equal(h.level(), 0, 'silent samples must not generate a synthetic beat');
    h.state.energy = 225;
    h.advance(500);
    assert.ok(h.level() > 0.3, 'actual low-frequency energy drives the light');
    const litLevel = h.level();
    h.state.energy = 0;
    h.advance(100);
    assert.ok(h.level() < litLevel && h.level() > 0, 'the light fades instead of flashing off');
    h.original.emit('click');
    assert.equal(h.audio.paused, false, 'switching back keeps the track playing');
    assert.equal(h.audio.currentTime, 38, 'switching skins never rewinds the track');
    assert.equal(h.state.contexts[0].state, 'running', 'the live output context is never suspended');
    assert.ok(source.destinations[0].destinations.includes(h.state.contexts[0].destination));
    assert.equal(h.level(), 0);
    assert.equal(h.storage.get('dean-player-skin'), 'original');
    h.pulse.emit('click');
    h.audio.setAttribute('src', 'assets/audio/second-version.mp3');
    h.audio.emit('loadstart');
    h.audio.play();
    assert.equal(h.state.sources.length, 1, 'track/version switching reuses the same source');
    h.document.hidden = true;
    h.document.emit('visibilitychange');
    h.advance(1000);
    assert.equal(h.level(), 0);
    assert.equal(h.audio.paused, false, 'visibility cleanup only affects visuals');
    h.document.hidden = false;
    h.document.emit('visibilitychange');
    h.motion.matches = true;
    h.motion.emit('change');
    h.state.energy = 255;
    h.advance(1000);
    assert.equal(h.level(), 0, 'reduced-motion disables audio-driven animation');
    const crossOrigin = createHarness({ storedSkin: 'pulse', audioUrl: 'https://external.example/track.mp3' });
    crossOrigin.skin.prepareAudio();
    crossOrigin.audio.play();
    assert.equal(crossOrigin.state.sources.length, 0, 'unverified external audio is never rerouted');
    assert.equal(crossOrigin.audio.paused, false);
}
console.log('PASS: one audible graph, preserved playback, real energy only, smooth release, visibility and reduced motion.');

{
    const h = createHarness({ storedSkin: 'pulse', refreshRate: 120 });
    h.advance(1000);
    assert.ok(h.state.frames.length >= 119, 'paused restoration animates the base field at display refresh rate');
    assert.equal(h.state.contexts.length, 0);
    assert.equal(h.state.analysisFrames, 0, 'ambient motion never reads FFT data');
    const isAmbient = frame => frame.ambient === true && ['bass', 'mid', 'treble', 'energy', 'beat', 'impact']
        .every(name => frame[name] === 0);
    assert.ok(h.state.frames.every(isAmbient), 'the idle field receives zero musical input, not synthetic beats');
    assert.equal(h.body.classes.has('is-audio-reactive'), false);
    assert.equal(h.body.classes.has('is-idle'), false, 'ambient animation never hides paused controls');
    h.audio.play();
    h.advance(500);
    h.spectrum({ bass: 240, mid: 180, treble: 120 });
    h.advance(70);
    assert.ok(h.state.frames.some(frame => frame.beat > 0));
    const analysesBeforePause = h.state.analysisFrames;
    const pauseStart = h.state.frames.length;
    const resetsBeforePause = h.state.resetCount;
    h.audio.pause();
    h.advance(500);
    assert.ok(h.state.resetCount > resetsBeforePause, 'pause clears renderer impulses');
    assert.ok(h.state.frames.length > pauseStart, 'pause keeps only the ambient field moving');
    assert.ok(h.state.frames.slice(pauseStart).every(isAmbient));
    assert.equal(h.state.analysisFrames, analysesBeforePause);
    assert.equal(h.level(), 0);
    assert.equal(h.state.sources.length, 1);

    const assertStopped = (stop, restart, label) => {
        stop();
        const frames = h.state.animationFrames;
        h.advance(1000);
        assert.equal(h.state.animationFrames, frames, `${label} cancels the RAF instead of running an empty loop`);
        restart();
        const draws = h.state.frames.length;
        h.advance(100);
        assert.ok(h.state.frames.length > draws, `${label} recovery restarts paused ambient motion`);
    };
    assertStopped(() => {
        h.document.hidden = true;
        h.document.emit('visibilitychange');
    }, () => {
        h.document.hidden = false;
        h.document.emit('visibilitychange');
    }, 'hidden document');
    assertStopped(() => h.original.emit('click'), () => h.pulse.emit('click'), 'original skin');
    assertStopped(() => {
        h.motion.matches = true;
        h.motion.emit('change');
    }, () => {
        h.motion.matches = false;
        h.motion.emit('change');
    }, 'reduced motion');
    h.visualCanvas.emit('webglcontextlost');
    const lostFrames = h.state.animationFrames;
    h.advance(1000);
    assert.equal(h.state.animationFrames, lostFrames, 'context loss immediately cancels RAF');
    await h.visualCanvas.emitNative('webglcontextrestored');
    h.advance(100);
    assert.ok(h.state.animationFrames > lostFrames, 'restored GPU resumes ambient motion');
    h.visualCanvas.emit('webglcontextlost');
    const framesBeforeCancelledRestore = h.state.animationFrames;
    await h.visualCanvas.emitNative('webglcontextrestored');
    h.original.emit('click');
    h.advance(100);
    assert.equal(h.state.animationFrames, framesBeforeCancelledRestore,
        'a pending GPU restore must not restart RAF after changing skins');
    h.pulse.emit('click');
    const lastCount = h.state.frames.length;
    h.skin.prepareAudio();
    h.document.emit('visibilitychange');
    h.motion.emit('change');
    h.advance(1000);
    assert.ok(h.state.frames.length - lastCount <= 121, 'repeated lifecycle events never multiply RAF loops');

    for (const options of [
        { rendererAvailable: false },
        { reduced: true }
    ]) {
        const unavailable = createHarness({ storedSkin: 'pulse', ...options });
        unavailable.advance(1000);
        assert.equal(unavailable.state.animationFrames, 0, 'unsupported GPU/reduced motion never starts a RAF');
        assert.equal(unavailable.state.contexts.length, 0);
    }
    for (const options of [
        { audioContextAvailable: false },
        { audioContextState: 'suspended', resumeMode: 'pending' },
        { audioContextState: 'suspended', resumeMode: 'reject' },
        { audioUrl: 'https://external.example/track.mp3' }
    ]) {
        const unavailable = createHarness({ storedSkin: 'pulse', ...options });
        unavailable.audio.play();
        await new Promise(resolve => setImmediate(resolve));
        unavailable.advance(500);
        assert.ok(unavailable.state.frames.length > 20, 'an unavailable/pending analyser preserves base motion');
        assert.ok(unavailable.state.frames.every(isAmbient));
        assert.equal(unavailable.state.analysisFrames, 0);
        assert.equal(unavailable.audio.paused, false, 'visual fallback never pauses the media element');
    }
}
console.log('PASS: idle/paused base motion, zero-energy frames, lazy audio graph, single RAF, GPU loss/recovery and no-animation states.');

{
    const onset = strength => {
        const h = createHarness({ storedSkin: 'pulse' });
        h.audio.play();
        h.advance(600);
        h.spectrum({ bass: strength, mid: strength * 0.6, treble: strength * 0.35 });
        h.advance(80);
        const beats = h.state.frames.filter(frame => frame.beat > 0);
        assert.equal(beats.length, 1, 'a single attack creates one onset');
        return { h, beat: beats[0] };
    };
    const weak = onset(95);
    const strong = onset(245);
    assert.ok(strong.beat.beat > weak.beat.beat * 1.5, 'strong attacks produce materially stronger ripples');
    assert.ok(weak.beat.beat > 0 && strong.beat.beat <= 1);
    assert.ok(strong.beat.bass > strong.beat.mid && strong.beat.mid > strong.beat.treble,
        'the renderer receives independent frequency bands');
    assert.ok(strong.beat.delta > 0 && strong.beat.binWidth > 0);
    assert.equal(strong.beat.spectrum.length, 512);
    const peak = strong.h.state.frames.at(-1).impact;
    strong.h.advance(6000);
    assert.equal(strong.h.state.frames.filter(frame => frame.beat > 0).length, 1,
        'a sustained loud spectrum does not manufacture repeated beats');
    assert.ok(strong.h.state.frames.at(-1).energy > 0.4, 'continuous light still follows sustained energy');
    assert.ok(strong.h.state.frames.at(-1).impact < peak * 0.01, 'impact releases while the note remains loud');
    strong.h.spectrum();
    strong.h.advance(1800);
    assert.equal(strong.h.state.frames.filter(frame => frame.beat > 0).length, 1, 'silence never creates onsets');
    assert.ok(strong.h.level() < 0.005);

    const h = createHarness({ storedSkin: 'pulse' });
    h.audio.play();
    h.advance(500);
    for (let index = 0; index < 10; index++) {
        h.spectrum({ bass: 230, mid: 160, treble: 85 });
        h.advance(70);
        h.spectrum();
        h.advance(70);
    }
    const beats = h.state.frames.filter(frame => frame.beat > 0);
    assert.ok(beats.length >= 2, 'separated attacks continue to trigger after the cooldown');
    for (let index = 1; index < beats.length; index++) {
        assert.ok(beats[index].now - beats[index - 1].now >= 170,
            'dense transients must still respect the onset cooldown');
    }
    for (const frame of h.state.frames) {
        for (const name of ['bass', 'mid', 'treble', 'energy', 'beat', 'impact']) {
            assert.ok(Number.isFinite(frame[name]) && frame[name] >= 0 && frame[name] <= 1,
                `${name} must be finite and normalized`);
        }
    }
}
console.log('PASS: frequency bands, stronger transients, sustained notes, silence, onset cooldown and normalized renderer frames.');

{
    const h = createHarness({ storedSkin: 'pulse' });
    h.audio.play();
    h.advance(500);
    for (let index = 0; index < 10; index++) {
        h.spectrum({ bass: 235, mid: 170, treble: 95 });
        h.advance(55);
        h.spectrum();
        h.advance(165);
    }
    assert.equal(h.state.frames.filter(frame => frame.beat > 0).length, 10,
        'fast 220 ms musical subdivisions are not reduced to every other hit');
    h.spectrum();
    h.advance(1800);
    assert.equal(h.state.frames.filter(frame => frame.beat > 0).length, 10,
        'a shorter cooldown still does not generate beats during silence');

    const gentle = createHarness({ storedSkin: 'pulse' });
    gentle.spectrum({ bass: 110, mid: 70, treble: 45 });
    gentle.audio.play();
    gentle.advance(1400);
    gentle.spectrum({ bass: 122, mid: 77, treble: 50 });
    gentle.advance(60);
    const quietBeat = gentle.state.frames.find(frame => frame.beat > 0)?.beat;
    assert.ok(quietBeat >= 0.025 && quietBeat < 0.12,
        'small real accents keep their natural strength instead of all hitting the old fixed floor');
}
console.log('PASS: fast musical subdivisions and subtle accents retain their timing and dynamic range.');

{
    const runAtRefreshRate = refreshRate => {
        const h = createHarness({ storedSkin: 'pulse', refreshRate });
        h.audio.play();
        h.advance(500);
        for (const strength of [95, 235, 145, 255]) {
            h.spectrum({ bass: strength, mid: strength * 0.6, treble: strength * 0.35 });
            h.advance(80);
            h.spectrum();
            h.advance(440);
        }
        assert.equal(h.state.frames.length, h.state.animationFrames,
            `${refreshRate} Hz displays must receive a draw on every animation frame`);
        assert.ok(Math.abs(h.state.frames.length - 2.58 * refreshRate) <= 2,
            'visual frame delivery must follow the display instead of the old 30 fps cap');
        assert.ok(Math.abs(h.state.analysisFrames - 2.58 * 60) <= 2,
            'FFT/onset sampling remains approximately 60 Hz regardless of display refresh rate');
        const beats = h.state.frames.filter(frame => frame.beat > 0);
        assert.equal(beats.length, 4, 'each real attack is delivered once, including on high-refresh displays');
        if (refreshRate > 60) {
            assert.ok(h.state.frames.length > h.state.analysisFrames * 1.4);
            const onsetIndex = h.state.frames.findIndex(frame => frame.beat > 0);
            const onset = h.state.frames[onsetIndex];
            const next = h.state.frames[onsetIndex + 1];
            assert.equal(next.beat, 0, 'an intermediate animation frame must not replay the last onset');
            assert.ok(next.impact < onset.impact && next.impact > 0,
                'impact keeps decaying smoothly between analysis samples');
            assert.ok(next.bass > onset.bass,
                'band envelopes continue moving on intermediate high-refresh frames');
            assert.ok(next.delta < 12, 'the renderer receives the real high-refresh frame delta');
        }
        return beats;
    };
    const standard = runAtRefreshRate(60);
    const highRefresh = runAtRefreshRate(120);
    runAtRefreshRate(90);
    for (let index = 0; index < standard.length; index++) {
        assert.ok(Math.abs(standard[index].beat - highRefresh[index].beat) < 0.05,
            'the same attack should have the same strength at 60 and 120 Hz');
        assert.ok(Math.abs(standard[index].now - highRefresh[index].now) < 35,
            'refresh rate changes must not shift onset timing by more than the sampling interval');
    }
}
console.log('PASS: every-rAF rendering at 60/90/120 Hz, independent FFT cadence, smooth intermediate frames and single-delivery onsets.');

{
    const h = createHarness({ storedSkin: 'pulse' });
    h.audio.play();
    h.advance(500);
    h.spectrum({ bass: 240, mid: 180, treble: 120 });
    h.advance(60);
    assert.ok(h.state.frames.some(frame => frame.beat > 0));
    const resetBeforeSeek = h.state.resetCount;
    h.audio.seeking = true;
    h.audio.emit('seeking');
    assert.ok(h.state.resetCount > resetBeforeSeek, 'seeking clears visible ripples');
    assert.equal(h.level(), 0);
    assert.equal(Number(h.body.properties.get('--pulse-impact')), 0);
    const framesBeforeSeek = h.state.frames.length;
    h.advance(500);
    assert.ok(h.state.frames.length > framesBeforeSeek, 'seeking retains the ambient field');
    assert.ok(h.state.frames.slice(framesBeforeSeek).every(frame => frame.ambient && frame.energy === 0 && frame.beat === 0),
        'seeking cannot read or replay the previous position\'s spectrum');
    h.spectrum({ bass: 255, mid: 255, treble: 255 });
    h.audio.seeking = false;
    h.audio.emit('seeked');
    h.advance(500);
    assert.ok(h.state.frames.length > framesBeforeSeek);
    assert.ok(h.state.frames.slice(framesBeforeSeek).every(frame => frame.beat === 0),
        'seek primes the new spectrum instead of comparing it with the old playback position');

    const checkFreshStart = restart => {
        h.spectrum();
        h.advance(400);
        const start = h.state.frames.length;
        const resets = h.state.resetCount;
        restart();
        h.spectrum({ bass: 255, mid: 255, treble: 255 });
        h.advance(450);
        assert.ok(h.state.resetCount > resets);
        assert.ok(h.state.frames.slice(start).every(frame => frame.beat === 0),
            'returning to playback primes a fresh spectrum without a phantom beat');
    };
    checkFreshStart(() => { h.audio.pause(); h.audio.play(); });
    checkFreshStart(() => {
        h.document.hidden = true;
        h.document.emit('visibilitychange');
        h.document.hidden = false;
        h.document.emit('visibilitychange');
    });
    checkFreshStart(() => {
        h.audio.setAttribute('src', 'assets/audio/changed.mp3');
        h.audio.emit('loadstart');
        h.audio.emit('playing');
    });
    checkFreshStart(() => { h.original.emit('click'); h.pulse.emit('click'); });

    for (const interrupt of [
        { stop: () => h.audio.emit('waiting'), resume: () => h.audio.emit('playing') },
        { stop: () => h.audio.emit('loadstart'), resume: () => h.audio.emit('playing') },
        {
            stop: () => { h.state.contexts[0].state = 'suspended'; h.state.contexts[0].emit('statechange'); },
            resume: () => { h.state.contexts[0].state = 'running'; h.state.contexts[0].emit('statechange'); }
        }
    ]) {
        h.spectrum();
        h.advance(400);
        interrupt.stop();
        const start = h.state.frames.length;
        const analyses = h.state.analysisFrames;
        h.spectrum({ bass: 255, mid: 255, treble: 255 });
        h.advance(500);
        assert.equal(h.state.analysisFrames, analyses, 'buffering/loading/suspended graphs cannot sample stale FFT data');
        assert.ok(h.state.frames.slice(start).every(frame => frame.ambient && frame.beat === 0 && frame.impact === 0));
        interrupt.resume();
        h.advance(500);
        assert.ok(h.state.frames.slice(start).every(frame => frame.beat === 0),
            'resumed data primes a new spectrum without an onset from the previous audio state');
    }
}
console.log('PASS: seek, pause, visibility, track and skin changes reset detection and renderer state.');

{
    const h = createHarness({ storedSkin: 'pulse' });
    h.audio.play();
    // A mouse click leaves its button focused. Native inert then causes blur.
    h.toggle.focus();
    h.document.emit('pointerdown', { pointerType: 'mouse', target: h.toggle });
    h.advance(4999);
    assert.equal(h.body.classes.has('is-idle'), false);
    h.advance(1);
    await Promise.resolve();
    assert.equal(h.body.classes.has('is-idle'), true);
    assert.equal(h.toolbar.inert, true);
    assert.equal(h.document.activeElement, h.body, 'inert removes the old mouse focus');
    h.advance(1000);
    assert.equal(h.body.classes.has('is-idle'), true, 'inert-generated blur must not wake controls');
    const touch = h.document.emit('pointerdown', { pointerType: 'touch' });
    assert.equal(touch.defaultPrevented, true);
    assert.equal(h.toolbar.inert, false);
    assert.equal(h.document.emit('click').immediateStopped, true, 'wake touch cannot activate a hidden control');
    h.toggle.emit('click');
    assert.equal(h.menu.hidden, false);
    h.advance(12000);
    assert.equal(h.body.classes.has('is-idle'), false, 'an open skin menu prevents hiding');
    h.toggle.emit('click');
    h.toggle.focus();
    h.document.emit('keydown', { key: 'Tab' });
    h.document.emit('focusin');
    h.advance(12000);
    assert.equal(h.body.classes.has('is-idle'), false, 'keyboard focus remains accessible');
    h.document.activeElement = h.body;
    h.document.emit('focusout');
    await Promise.resolve();
    h.advance(5000);
    assert.equal(h.body.classes.has('is-idle'), true);
    h.document.emit('pointermove');
    assert.equal(h.body.classes.has('is-idle'), false, 'mouse movement wakes controls');
    h.advance(5000);
    h.audio.pause();
    assert.equal(h.body.classes.has('is-idle'), false, 'pausing reveals controls immediately');
    assert.equal(h.toolbar.inert, false);
    h.advance(12000);
    assert.equal(h.body.classes.has('is-idle'), false, 'paused controls never time out');
}
console.log('PASS: exact five-second idle, inert controls, touch/mouse wake, menu, keyboard focus and paused controls.');

for (const fullscreenApi of ['standard', 'webkit']) {
    const h = createHarness({ storedSkin: 'pulse', fullscreenApi });
    assert.equal(h.fullscreen.hidden, false);
    h.fullscreen.emit('click');
    await Promise.resolve();
    assert.equal(h.fullscreenCalls.target, h.body, 'the fullscreen boundary contains the canvas and every control');
    assert.equal(h.fullscreen.getAttribute('aria-pressed'), 'true');
    assert.equal(h.fullscreen.getAttribute('title'), '退出全屏');
    h.toggle.emit('click');
    assert.equal(h.menu.hidden, false, 'skin menu opens while natively fullscreen');
    h.original.emit('click');
    assert.equal(h.body.dataset.playerSkin, 'original');
    assert.equal(h.fullscreen.getAttribute('aria-pressed'), 'true', 'skin selection does not lose fullscreen state');
    h.pulse.emit('click');
    h.audio.play();
    h.advance(5000);
    assert.equal(h.toolbar.inert, false, 'the fullscreen toolbar stays available during idle');
    assert.equal(h.close.inert, false, 'X remains an accessible escape during idle');
    assert.equal(h.playback.inert, true, 'normal playback controls still hide during idle');
    h.document.emit('pointermove');
    assert.equal(h.toolbar.inert, false, 'native fullscreen controls remain available after wake');
    h.advance(5000);
    h.document.emit('pointerdown', { pointerType: 'touch' });
    // Native transition can interrupt an old touch gesture. Do not let that
    // gesture's click guard swallow a fresh fullscreen toolbar click.
    h.document.emit(fullscreenApi === 'webkit' ? 'webkitfullscreenchange' : 'fullscreenchange');
    assert.equal(h.document.emit('click').immediateStopped, false);
    await h.skin.exitFullscreen();
    assert.equal(h.fullscreenCalls.exits, 1);
    assert.equal(h.fullscreen.getAttribute('aria-pressed'), 'false');
    assert.equal(h.fullscreen.getAttribute('title'), '进入全屏');
    assert.equal(h.toolbar.inert, false);
    await h.skin.exitFullscreen();
    assert.equal(h.fullscreenCalls.exits, 1, 'closing outside fullscreen is a harmless no-op');
}
{
    const h = createHarness({ storedSkin: 'pulse', fullscreenApi: 'standard', fullscreenFailure: true });
    h.fullscreen.emit('click');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.fullscreen.getAttribute('aria-pressed'), 'false');
    assert.equal(h.toolbar.inert, false);
    h.toggle.emit('click');
    assert.equal(h.menu.hidden, false, 'a rejected native request never disables the toolbar');
    h.fullscreen.emit('click');
    await Promise.resolve();
    assert.equal(h.fullscreenCalls.requests, 2, 'the user can retry after a denied request');
    assert.equal(createHarness().fullscreen.hidden, true, 'unsupported hosts do not expose an unusable action');
}
console.log('PASS: standard/WebKit fullscreen boundary, skin switching, idle recovery, exit, labels and rejected requests.');

for (const fullscreenApi of ['standard', 'webkit']) {
    for (const pointerType of ['mouse', 'touch', 'pen']) {
        for (const control of ['fullscreen', 'close', 'toggle']) {
            const h = createHarness({ storedSkin: 'pulse', fullscreenApi });
            h.fullscreen.emit('click');
            await new Promise(resolve => setImmediate(resolve));
            h.audio.play();
            h.advance(5600);
            assert.equal(h.body.classes.has('is-idle'), true);
            assert.equal(h.body.classes.has('is-player-fullscreen'), true);
            assert.equal(h.toolbar.inert, false);
            assert.equal(h.close.inert, false);
            assert.equal(h.playback.inert, true);
            assert.equal(h.close.getAttribute('aria-label'), '关闭播放器并返回音乐列表');
            // Use an SVG child rather than the button itself, as with a real tap.
            const icon = new Element();
            icon.parent = h[control];
            const press = h.document.emit('pointerdown', { pointerType, target: icon });
            assert.equal(press.defaultPrevented, false, `${pointerType} can activate ${control} without a wake-only tap`);
            const click = h.document.emit('click', { target: icon });
            assert.equal(click.immediateStopped, false);
            h[control].emit('click');
            if (control === 'fullscreen') {
                await new Promise(resolve => setImmediate(resolve));
                assert.equal(h.fullscreenCalls.exits, 1, 'one press exits native fullscreen');
                assert.equal(h.body.classes.has('is-player-fullscreen'), false);
            } else if (control === 'toggle') {
                assert.equal(h.menu.hidden, false, 'the persistent toolbar also opens its skin menu in one press');
            }
        }
    }
}
{
    const h = createHarness({ storedSkin: 'pulse', fullscreenApi: 'standard' });
    h.fullscreen.emit('click');
    await new Promise(resolve => setImmediate(resolve));
    h.audio.play();
    h.advance(5500);
    const wake = h.document.emit('pointerdown', { pointerType: 'touch', target: h.body });
    assert.equal(wake.defaultPrevented, true, 'hidden playback controls retain their accidental-tap protection');
    assert.equal(h.document.emit('click', { target: h.close }).immediateStopped, false,
        'a stale wake gesture cannot swallow a visible exit control');
}
console.log('PASS: fullscreen idle retains the toolbar and X; mouse, touch and pen activate exits in one press.');

{
    const h = createHarness({ storedSkin: 'pulse', fullscreenApi: 'standard' });
    let requests = 0;
    h.body.requestFullscreen = () => { requests++; return new Promise(() => {}); };
    h.fullscreen.emit('click');
    h.fullscreen.emit('click');
    assert.equal(requests, 1, 'rapid duplicate fullscreen requests are ignored during transition');
    h.toggle.emit('click');
    assert.equal(h.menu.hidden, false, 'a pending native request cannot disable skin selection');
    h.advance(1500);
    await new Promise(resolve => setImmediate(resolve));
    h.fullscreen.emit('click');
    assert.equal(requests, 2, 'an unresolved host promise cannot permanently lock fullscreen retry');
}
{
    const h = createHarness({ storedSkin: 'pulse', fullscreenApi: 'standard' });
    h.fullscreen.emit('click');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.fullscreen.getAttribute('aria-pressed'), 'true');
    h.document.exitFullscreen = () => new Promise(() => {});
    let finished = false;
    const exit = h.skin.exitFullscreen().then(() => { finished = true; });
    h.advance(1499);
    await Promise.resolve();
    assert.equal(finished, false, 'normal native transitions get time to finish');
    h.advance(1);
    await exit;
    assert.equal(finished, true, 'X can continue navigating within 1500 ms even if the host exit hangs');
    assert.equal(h.fullscreen.getAttribute('aria-pressed'), 'true', 'timeout never fabricates a native exit state');
    assert.equal(h.toolbar.inert, false);
}
console.log('PASS: unresolved native fullscreen promises cannot trap retry, skin controls or close navigation.');

{
    const h = createHarness();
    h.solidPixels(210, 30, 150);
    h.skin.setCover('assets/images/pink.jpg');
    h.state.images.at(-1).onload();
    assert.ok(h.palette().hue > 310 && h.palette().hue < 330, 'the palette reflects pink cover pixels');
    assert.ok(h.palette().saturation > 40);
    assert.ok(h.state.palettes.at(-1).hue > 310 && h.state.palettes.at(-1).hue < 330,
        'the ripple renderer receives the cover-derived palette');
    h.skin.setCover('assets/images/old-cover.jpg');
    const old = h.state.images.at(-1);
    h.skin.setCover('assets/images/new-cover.jpg');
    const latest = h.state.images.at(-1);
    const fallback = h.palette();
    assert.notEqual(fallback.hue, 320, 'switching songs clears the previous palette immediately');
    h.solidPixels(35, 175, 50);
    latest.onload();
    const current = h.palette();
    assert.ok(current.hue > 100 && current.hue < 140);
    h.solidPixels(210, 30, 150);
    old.onload();
    assert.deepEqual(h.palette(), current, 'a slow old image cannot replace the current palette');
    h.skin.setCover('assets/images/gray.jpg');
    h.solidPixels(120, 120, 120);
    h.state.images.at(-1).onload();
    assert.ok(h.palette().saturation <= 8, 'grayscale cover remains nearly grayscale');
    h.skin.setCover('assets/images/missing.jpg');
    h.state.images.at(-1).onerror();
    assert.deepEqual(h.palette(), fallback, 'failed images retain the safe default palette');
    h.skin.setCover('assets/images/unreadable.jpg');
    h.state.canvasFails = true;
    assert.doesNotThrow(() => h.state.images.at(-1).onload());
    assert.deepEqual(h.palette(), fallback, 'canvas failures never interrupt playback or leak the old palette');
}
console.log('PASS: cover-derived palette, grayscale handling, request ordering, image failure and canvas failure.');

{
    const h = createHarness();
    const textColour = () => h.body.properties.get('--pulse-text-color').match(/[\d.]+/g).map(Number);
    const apply = (rgb, name) => {
        h.solidPixels(...rgb);
        h.skin.setCover(`assets/images/${name}.jpg`);
        h.state.images.at(-1).onload();
        return textColour();
    };
    const pink = apply([230, 35, 35], 'red');
    assert.ok(pink[0] > 245 && pink[1] < 190 && pink[2] < 190,
        'a red theme uses visibly pink type instead of nearly white fixed-lightness text');
    const gold = apply([240, 150, 20], 'gold');
    assert.ok(gold[0] > 245 && gold[1] > 160 && gold[1] < 220 && gold[2] < 145,
        'a gold theme keeps a distinct gold tint');
    assert.ok(h.body.properties.get('--pulse-echo-color').endsWith('12%)'),
        'the enlarged echo uses a dark version of the same theme, not pure black');
    const before = h.body.properties.get('--pulse-text-color');
    h.pulse.emit('click');
    h.advance(1000);
    assert.equal(h.body.properties.get('--pulse-text-color'), before, 'ambient motion cannot modulate the lyric colour');
    const gray = apply([120, 120, 120], 'neutral');
    assert.ok(Math.max(...gray) - Math.min(...gray) < 12, 'neutral covers never receive artificially saturated type');
    const rgb = (hue, saturation, lightness) => {
        const a = saturation / 100 * Math.min(lightness / 100, 1 - lightness / 100);
        return [0, 8, 4].map(n => {
            const k = (n + hue / 30) % 12;
            return lightness / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        });
    };
    const luma = value => value.map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
        .reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
    for (let hue = 0; hue < 360; hue += 15) {
        const foreground = apply(rgb(hue, 80, 48).map(c => Math.round(c * 255)), `hue-${hue}`);
        const theme = h.palette();
        const dark = rgb(theme.hue, theme.saturation * .62, 10.5);
        const light = rgb(theme.hue, theme.saturation, 56);
        const background = dark.map((c, i) => c + (light[i] - c) * .5 ** 1.12);
        const contrast = (luma(foreground.map(c => c / 255)) + .05) / (luma(background) + .05);
        assert.ok(contrast >= 3.95, `theme ${hue} preserves central large-text contrast (${contrast})`);
    }
}
console.log('PASS: tinted pink/gold lyrics, dark theme echo, stable cover-only colour and central contrast across hues.');
