import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/music-player.js', import.meta.url), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const functions = [
    section('    async function closePlayer()', '    function createStars()'),
    section('    async function loadTrack(', '    function renderVersionStrip('),
    section('    function selectVersion(', '    function updateVersionStripState('),
    section('    function togglePlay()', '    function getCatalogLyricTiming(')
].join('\n');

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function element() {
    const attributes = new Map();
    const classes = new Set();
    return {
        attributes, classes, textContent: '', style: { setProperty() {} },
        setAttribute(name, value) { attributes.set(name, value); },
        removeAttribute(name) { attributes.delete(name); },
        classList: {
            add: name => classes.add(name), remove: name => classes.delete(name),
            toggle: (name, value) => value ? classes.add(name) : classes.delete(name)
        }
    };
}

function harness() {
    const requests = [];
    const warnings = [];
    let prepares = 0, lyricsLoads = 0, exits = 0;
    const exit = deferred();
    const nodes = Object.fromEntries(['playBtn', 'title', 'artist', 'blurBg', 'slider',
        'timeCurr', 'timeTotal', 'playerBody', 'bgContainer'].map(key => [key, element()]));
    nodes.audio = { paused: true, ended: false, currentTime: 0, src: '',
        play() {
            const request = deferred(); requests.push(request);
            return request.promise;
        },
        pause() { this.paused = true; sandbox.setPlayingState(false); }
    };
    const song = { id: 'one', title: 'One', versions: [{ url: 'one.mp3' }, { url: 'one-v2.mp3' }] };
    const sandbox = {
        elements: nodes, songs: [song, { id: 'two', title: 'Two', versions: [{ url: 'two.mp3' }] }],
        currentIndex: 0, currentVersionIndex: 0, isPlaying: false,
        playbackRequestId: 0, playbackPending: false, autoplayBlocked: false, playerClosed: false,
        console: { warn: (...args) => warnings.push(args) },
        document: { getElementById: () => null, referrer: '' },
        window: {
            location: { pathname: '/song/one', href: 'https://example.test/song/one',
                assign(url) { sandbox.destination = url; } },
            history: { replaceState() {}, length: 1 },
            DeanPlayerSkin: { prepareAudio() { prepares++; }, setCover() {},
                exitFullscreen() { exits++; return exit.promise; } }
        },
        getSongVersions: song => song.versions,
        updateCarouselUI() {}, renderVersionStrip() {}, updateVersionStripState() {},
        loadLyrics() { lyricsLoads++; return new Promise(() => {}); },
        startLyricSync() {}, stopLyricSync() {}, cancelLyricScrollAnimation() {}, updateLyricsDisplay() {},
        URL
    };
    vm.createContext(sandbox);
    vm.runInContext(functions, sandbox);
    const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
    return { sandbox, nodes, requests, warnings, exit, flush,
        get prepares() { return prepares; }, get lyricsLoads() { return lyricsLoads; }, get exits() { return exits; },
        async accept(index = requests.length - 1) {
            nodes.audio.paused = false; sandbox.setPlayingState(true);
            requests[index].resolve(); await flush();
        },
        async reject(index, name) {
            requests[index].reject(Object.assign(new Error(name), { name })); await flush();
        }
    };
}

{
    const h = harness();
    await h.sandbox.loadTrack(0, true);
    assert.equal(h.requests.length, 1, 'entry requests playback without waiting for lyrics');
    assert.equal(h.lyricsLoads, 1);
    assert.equal(h.prepares, 0, 'an automatic attempt does not precreate the audio graph');
    await h.accept();
    assert.equal(h.sandbox.isPlaying, true);
    assert.equal(h.nodes.playBtn.attributes.get('aria-label'), '暂停播放');
    console.log('PASS allowed entry autoplay starts without lyric latency');
}
{
    const h = harness();
    await h.sandbox.loadTrack(0, true);
    await h.reject(0, 'NotAllowedError');
    assert.equal(h.sandbox.isPlaying, false);
    assert.equal(h.requests.length, 1, 'denied entry is never retried automatically');
    assert.match(h.nodes.playBtn.attributes.get('aria-label'), /点击播放/);
    assert.match(h.nodes.playBtn.attributes.get('title'), /阻止自动播放/);
    assert.equal(h.warnings.length, 0, 'an expected browser policy rejection is handled');
    h.sandbox.togglePlay();
    assert.equal(h.prepares, 1, 'manual retry unlocks Web Audio in the gesture');
    await h.accept();
    assert.equal(h.sandbox.autoplayBlocked, false);
    assert.equal(h.nodes.playBtn.attributes.get('title'), '暂停播放');
    console.log('PASS blocked entry stays paused and manual play recovers');
}
{
    const h = harness();
    await h.sandbox.loadTrack(0, true);
    h.sandbox.togglePlay();
    await h.reject(0, 'AbortError');
    assert.equal(h.requests.length, 1, 'click while starting cancels rather than retries');
    assert.equal(h.sandbox.playbackPending, false);
    assert.equal(h.sandbox.isPlaying, false);
    assert.equal(h.sandbox.autoplayBlocked, false);
    console.log('PASS user pause cancels a pending automatic start');
}
{
    const h = harness();
    await h.sandbox.loadTrack(0, true);
    h.sandbox.selectVersion(1);
    assert.equal(h.nodes.audio.src, 'one-v2.mp3');
    assert.equal(h.requests.length, 2, 'version selection preserves pending playback intent');
    await h.accept(1);
    await h.reject(0, 'NotAllowedError');
    assert.equal(h.sandbox.isPlaying, true, 'old version rejection cannot corrupt the new version');
    assert.equal(h.sandbox.autoplayBlocked, false);
    h.sandbox.pauseAudio();
    h.sandbox.selectVersion(0);
    assert.equal(h.requests.length, 2, 'switching a paused version remains paused');
    console.log('PASS version request races preserve latest intent');
}
{
    const h = harness();
    await h.sandbox.loadTrack(0, true);
    h.sandbox.nextTrack();
    await h.accept(1);
    await h.reject(0, 'AbortError');
    assert.equal(h.nodes.audio.src, 'two.mp3');
    assert.equal(h.sandbox.isPlaying, true);
    assert.equal(h.warnings.length, 0);
    console.log('PASS old track promise cannot pause the new track');
}
{
    const h = harness();
    await h.sandbox.loadTrack(0, true);
    const close = h.sandbox.closePlayer();
    assert.equal(h.nodes.audio.paused, true, 'close stops audio before fullscreen exit completes');
    h.sandbox.togglePlay();
    await h.sandbox.loadTrack(1);
    await h.reject(0, 'NotAllowedError');
    assert.equal(h.requests.length, 1, 'closing player cannot be restarted by a pending task');
    assert.equal(h.sandbox.autoplayBlocked, false);
    h.exit.resolve(); await close;
    assert.equal(h.sandbox.destination, '/music.html');
    await h.sandbox.closePlayer();
    assert.equal(h.exits, 1, 'duplicate close is harmless');
    console.log('PASS close cancels playback before waiting for fullscreen exit');
}
{
    const h = harness();
    await h.sandbox.loadTrack(0, true);
    await h.reject(0, 'NotSupportedError');
    assert.equal(h.sandbox.isPlaying, false);
    assert.equal(h.sandbox.autoplayBlocked, false, 'unsupported files are not misreported as policy blocks');
    assert.equal(h.warnings.length, 1);
    assert.match(source, /if \(playerClosed\) return;\s*songs = getVisibleResources/,
        'catalogue arriving after close cannot initialize autoplay');
    assert.match(source, /addEventListener\('pagehide',[\s\S]*?playerClosed = true;[\s\S]*?pauseAudio\(\)/);
    assert.match(source, /if \(event.persisted\) playerClosed = false/);
    console.log('PASS playback errors, leaving, and history restoration are guarded');
}
