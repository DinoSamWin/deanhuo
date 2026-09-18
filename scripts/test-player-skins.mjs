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

    setAttribute(name, value) { this.attributes.set(name, value); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    contains(element) { return element === this; }
    closest(selector) { return selector === '.player-chrome' && this.chrome ? this : null; }
}

function createHarness({ storedSkin, audioUrl = 'assets/audio/test.mp3', reduced = false } = {}) {
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
    const original = new Element();
    const pulse = new Element();
    const audio = new Element();
    const motion = new Element();
    const chrome = [toggle, fullscreen];
    chrome.forEach(element => {
        element.chrome = true;
        element.focus = () => { document.activeElement = element; };
        let inert = false;
        Object.defineProperty(element, 'inert', {
            get: () => inert,
            set: value => {
                inert = value;
                if (!value || document.activeElement !== element) return;
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
    document.getElementById = id => ({
        'skin-toggle': toggle,
        'skin-menu': menu,
        'btn-fullscreen': fullscreen
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
        canvasFails: false, frames: [], resetCount: 0, palettes: [] };
    class AudioNode {
        constructor() { this.destinations = []; }
        connect(destination) { this.destinations.push(destination); }
        disconnect() { this.destinations = []; }
    }
    class AudioContext extends Element {
        constructor() {
            super();
            state.contexts.push(this);
            this.state = 'running';
            this.sampleRate = 44100;
            this.destination = new AudioNode();
        }
        resume() { this.state = 'running'; return Promise.resolve(); }
        createAnalyser() {
            const node = new AudioNode();
            node.frequencyBinCount = 512;
            node.getByteFrequencyData = data => state.spectrum ? data.set(state.spectrum) : data.fill(state.energy);
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
        AudioContext,
        DeanPulseVisuals: {
            draw: frame => state.frames.push({ ...frame, spectrum: Array.from(frame.spectrum) }),
            reset: () => { state.resetCount++; },
            setPalette: (hue, saturation) => state.palettes.push({ hue, saturation })
        }
    };
    const context = vm.createContext({
        window, document, URL, Image, Uint8Array,
        performance: { now: () => now },
        setTimeout: schedule,
        clearTimeout: id => scheduled.delete(id),
        requestAnimationFrame: callback => schedule(callback, 1000 / 60),
        cancelAnimationFrame: id => scheduled.delete(id),
        queueMicrotask
    });
    vm.runInContext(script, context);
    const skin = window.DeanPlayerSkin;
    let changes = 0;
    skin.init({ audio, onChange: () => changes++ });
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
    return { skin, document, body, toggle, menu, original, pulse, audio, motion, state, storage,
        advance, level, palette, solidPixels, spectrum, changes: () => changes };
}

{
    const h = createHarness({ storedSkin: 'pulse' });
    assert.equal(h.skin.isImmersive(), true);
    assert.equal(h.audio.playCount, 0, 'restoring a skin never autoplays');
    assert.equal(h.state.contexts.length, 0, 'paused restoration does not create an audio context');
    h.skin.prepareAudio();
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
        assert.ok(beats[index].now - beats[index - 1].now >= 320,
            'dense transients cannot trigger strobing more often than the onset cooldown');
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
    assert.equal(h.state.frames.length, framesBeforeSeek, 'no frames are drawn while seeking');
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
    assert.equal(h.toggle.inert, true);
    assert.equal(h.document.activeElement, h.body, 'inert removes the old mouse focus');
    h.advance(1000);
    assert.equal(h.body.classes.has('is-idle'), true, 'inert-generated blur must not wake controls');
    const touch = h.document.emit('pointerdown', { pointerType: 'touch' });
    assert.equal(touch.defaultPrevented, true);
    assert.equal(h.toggle.inert, false);
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
    assert.equal(h.toggle.inert, false);
    h.advance(12000);
    assert.equal(h.body.classes.has('is-idle'), false, 'paused controls never time out');
}
console.log('PASS: exact five-second idle, inert controls, touch/mouse wake, menu, keyboard focus and paused controls.');

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
