import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../photos.html', import.meta.url), 'utf8');
assert.match(page, /id="photo-exhibition-audio" src="assets\/audio\/photo-gallery-versailles-hall\.mp3"/, 'welcome and gallery use the requested recording');
assert.doesNotMatch(page, /Bossa Antigua|creativecommons\.org/, 'active credits must not misattribute the replacement');

class Element {
    events = {}; attributes = {};
    addEventListener(name, fn) { (this.events[name] ||= []).push(fn); }
    emit(name) { for (const fn of this.events[name] || []) fn(); }
    setAttribute(name, value) { this.attributes[name] = value; }
}
const audio = new Element(), button = new Element(), document = new Element();
audio.paused = true; audio.currentTime = 0; audio.volume = 1;
audio.pause = () => { audio.paused = true; audio.emit('pause'); };
const normalPlay = () => { audio.paused = false; audio.emit('play'); return Promise.resolve(); };
audio.play = normalPlay;
document.hidden = false;
let now = 0, id = 0;
const frames = new Map();
function advance(ms) {
    now += ms;
    const pending = [...frames.values()]; frames.clear();
    for (const callback of pending) callback(now);
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const context = vm.createContext({ window: {}, document, performance: { now: () => now },
    requestAnimationFrame: callback => { frames.set(++id, callback); return id; },
    cancelAnimationFrame: key => frames.delete(key) });
vm.runInContext(readFileSync(new URL('../js/photo-exhibition-audio.js', import.meta.url), 'utf8'), context);
const music = context.window.createPhotoGalleryMusic({ audio, button });
music.beginIntro(); await flush();
assert.equal(audio.paused, false); assert.equal(audio.volume, .10, 'audible quiet bed under narration');
audio.currentTime = 11.5;
music.enterGallery(); await flush();
assert.equal(audio.currentTime, 11.5, 'welcome completion never rewinds music');
assert.equal(audio.volume, .10, 'no abrupt volume jump');
let previous = audio.volume;
for (let i = 0; i < 26; i++) {
    advance(100);
    assert.ok(audio.volume >= previous && audio.volume <= .24);
    previous = audio.volume;
}
assert.equal(audio.volume, .24); assert.equal(frames.size, 0);
music.stop(); assert.equal(audio.paused, true); assert.equal(audio.currentTime, 0);
music.beginIntro(); await flush(); audio.currentTime = 1;
music.enterGallery(); await flush(); advance(500);
assert.equal(audio.currentTime, 1, 'skip continues the same music');
document.hidden = true; document.emit('visibilitychange');
const heldVolume = audio.volume;
advance(5000); assert.equal(audio.paused, true); assert.equal(audio.volume, heldVolume);
document.hidden = false; document.emit('visibilitychange'); await flush();
assert.equal(audio.volume, heldVolume, 'resume avoids a loudness jump');
advance(2600); assert.equal(audio.volume, .24);
button.emit('click'); assert.equal(audio.paused, true);
music.stop(); music.beginIntro(); await flush();
assert.equal(audio.paused, true, 'mute preference persists across entry');
music.enterGallery(); await flush(); assert.equal(audio.paused, true);
button.emit('click'); await flush(); advance(2600); assert.equal(audio.paused, false);
music.stop();
audio.play = () => Promise.reject(new Error('blocked'));
music.beginIntro(); await flush();
assert.equal(audio.paused, true); assert.equal(button.textContent, '♫ 点击开启音乐');
audio.play = normalPlay; music.retry(); await flush();
assert.equal(audio.paused, false); assert.equal(audio.volume, .10);
music.stop();
let resolvePlay;
audio.play = () => new Promise(resolve => { resolvePlay = () => { audio.paused = false; resolve(); }; });
music.beginIntro(); music.stop(); resolvePlay(); await flush();
assert.equal(audio.paused, true, 'late play promise cannot leak sound after cancellation');
assert.equal(frames.size, 0);
console.log('PASS: quiet intro bed, continuous skip/end transition, 2.6s smooth gain, visibility, mute, retry and cancellation races.');
