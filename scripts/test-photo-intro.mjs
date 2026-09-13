import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
class Element {
    constructor() { this.events = {}; this.style = {}; this.hidden = false; this.open = false; }
    addEventListener(name, fn) { (this.events[name] ||= []).push(fn); }
    emit(name) { for (const fn of this.events[name] || []) fn(); }
    querySelector(name) { return elements[name]; }
    showModal() { this.open = true; }
    close() { this.open = false; queueMicrotask(() => this.emit('close')); }
    focus() {}
}
const elements = Object.fromEntries(['.photo-intro-status','.photo-intro-progress span','.photo-intro-play','.photo-intro-skip','.photo-intro-close'].map(name => [name,new Element()]));
const dialog = new Element(), audio = new Element(), document = new Element();
audio.paused = true; audio.currentTime = 0; audio.duration = 11;
audio.play = () => { audio.paused = false; return Promise.resolve(); };
audio.pause = () => { audio.paused = true; };
document.body = { style: { overflow: '' } }; document.hidden = false;
document.getElementById = id => id === 'photo-gallery-intro' ? dialog : audio;
const context = vm.createContext({ window: {}, document, setTimeout: () => 1, clearTimeout() {} });
vm.runInContext(readFileSync(new URL('../js/photo-exhibition-intro.js', import.meta.url), 'utf8'), context);
let musicStarted = 0, musicCancelled = 0;
const intro = context.window.createPhotoGalleryIntro({ onStart: () => musicStarted++, onCancel: () => musicCancelled++ });
let entered = 0;
const enter = () => { entered++; document.body.style.overflow = 'hidden'; };
intro.begin(enter); await Promise.resolve();
assert.equal(entered, 0); assert.equal(audio.paused, false); assert.equal(intro.open, true);
assert.equal(musicStarted, 1, 'background bed starts with the welcome gesture');
audio.currentTime = 11; audio.emit('ended'); await Promise.resolve();
assert.equal(entered, 1); assert.equal(audio.paused, true); assert.equal(audio.currentTime, 0);
assert.equal(document.body.style.overflow, 'hidden', 'queued intro close must not unlock the new gallery');
assert.equal(musicCancelled, 0, 'successful entry keeps background music running');
document.body.style.overflow = '';
intro.begin(enter); await Promise.resolve();
assert.equal(audio.currentTime, 0, 'replays on every entry');
elements['.photo-intro-skip'].emit('click'); await Promise.resolve();
assert.equal(entered, 2); assert.equal(audio.paused, true);
document.body.style.overflow = '';
intro.begin(enter); elements['.photo-intro-close'].emit('click'); await Promise.resolve();
assert.equal(entered, 2); assert.equal(audio.paused, true); assert.equal(document.body.style.overflow, '');
assert.equal(musicCancelled, 1, 'cancel also stops the background bed');
intro.begin(enter); await Promise.resolve();
document.hidden = true; document.emit('visibilitychange'); assert.equal(audio.paused, true);
document.hidden = false; document.emit('visibilitychange'); await Promise.resolve(); assert.equal(audio.paused, false);
elements['.photo-intro-close'].emit('click'); await Promise.resolve();
audio.play = () => Promise.reject(new Error('blocked'));
intro.begin(enter); await Promise.resolve(); await Promise.resolve();
assert.equal(elements['.photo-intro-play'].hidden, false, 'blocked playback exposes retry');
elements['.photo-intro-skip'].emit('click'); await Promise.resolve(); assert.equal(entered, 3);
console.log('PASS: intro-before-entry, ended transition, replay, skip, cancel, scroll restoration, visibility and blocked-audio fallback.');
