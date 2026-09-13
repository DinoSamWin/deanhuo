import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// Isolated interaction tests (no browser or external media required).
class Element {
    constructor() { this.events = {}; this.style = {}; this.attrs = {}; this.textContent = ''; this.clientWidth = 1000; this.clientHeight = 600; this.open = false; this.naturalWidth = 3000; this.naturalHeight = 2000; this.complete = true; this.classList = { toggle() {}, add() {}, remove() {} }; }
    addEventListener(name, fn) { (this.events[name] ||= []).push(fn); }
    emit(name, event = {}) { for (const fn of this.events[name] || []) fn({ preventDefault() {}, ...event }); }
    querySelector(selector) { return nodes.get(selector); }
    getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; }
    setPointerCapture() {}
    focus() {}
    removeAttribute(name) { delete this[name]; }
    showModal() { this.open = true; }
    close() { this.open = false; this.emit('close'); }
    animate(frames, options) { this.lastAnimation = { frames, options }; return { cancel() {}, finish() {}, finished: Promise.resolve() }; }
}
const selectors = ['.photo-detail-veil', '.photo-detail-header', '.photo-detail-footer', '.photo-detail-viewport', '.photo-detail-flight', '.photo-detail-art', 'img', '.photo-detail-title', '.photo-detail-english', '.photo-detail-description', '.photo-detail-status', '.photo-detail-zoom-level', '.photo-detail-close', '[data-zoom="out"]', '[data-zoom="in"]', '[data-zoom="reset"]'];
const nodes = new Map(selectors.map(s => [s, new Element()]));
const dialog = new Element(), originals = [];
let returned = 0;
const context = vm.createContext({ window: {}, document: { getElementById: () => dialog }, Image: class { constructor() { originals.push(this); } decode() { return Promise.resolve(); } }, ResizeObserver: class { observe() {} } });
vm.runInContext(readFileSync(new URL('../js/photo-exhibition-viewer.js', import.meta.url), 'utf8'), context);
const reducedMotion = { matches: false };
const viewer = context.window.createPhotoExhibitionViewer({ onClose: () => returned++, reducedMotion });
const candidate = { photo: { title: '测试作品', description: '<b>plain text</b>', src: 'original.jpg' }, preview: 'preview.webp', ratio: 1.5, rect: { left: 200, top: 300, width: 240, height: 160 } };
viewer.show(candidate);
assert.equal(viewer.open, true);
assert.equal(nodes.get('.photo-detail-description').textContent, '<b>plain text</b>');
assert.equal(nodes.get('.photo-detail-flight').lastAnimation.options.duration, 1150);
const area = nodes.get('.photo-detail-viewport');
// Two-finger pinch expands around the midpoint; single-finger panning is bounded.
area.emit('pointerdown', { pointerId: 1, button: 0, clientX: 450, clientY: 300 });
area.emit('pointerdown', { pointerId: 2, button: 0, clientX: 550, clientY: 300 });
area.emit('pointermove', { pointerId: 2, clientX: 650, clientY: 300 });
assert.equal(nodes.get('.photo-detail-zoom-level').textContent, '200%');
area.emit('pointercancel', { pointerId: 2 });
area.emit('pointermove', { pointerId: 1, clientX: 5000, clientY: 5000 });
assert.match(nodes.get('.photo-detail-art').style.transform, /translate3d\(400px, 300px/);
area.emit('pointerup', { pointerId: 1 });
for (let i = 0; i < 12; i++) nodes.get('[data-zoom="in"]').emit('click');
assert.equal(nodes.get('.photo-detail-zoom-level').textContent, '400%');
assert.equal(nodes.get('[data-zoom="in"]').disabled, true);
nodes.get('[data-zoom="reset"]').emit('click');
assert.equal(nodes.get('.photo-detail-zoom-level').textContent, '100%');
assert.match(nodes.get('.photo-detail-art').style.transform, /translate3d\(0px, 0px/);
area.emit('wheel', { clientX: 500, clientY: 300, deltaY: -100, deltaMode: 0 });
assert.ok(parseInt(nodes.get('.photo-detail-zoom-level').textContent) > 100);
viewer.close(true);
assert.equal(returned, 1);
// A late original-image response cannot reopen or overwrite a closed viewer.
await originals[0].onload();
assert.equal(viewer.open, false);
assert.equal(nodes.get('img').src, undefined);
reducedMotion.matches = true;
viewer.show(candidate);
assert.equal(nodes.get('.photo-detail-flight').lastAnimation.options.duration, 0);
dialog.emit('cancel');
assert.equal(viewer.open, false);
assert.equal(returned, 2);
console.log('PASS: opening animation, original-image race, pinch, wheel, pan bounds, 1–4× limits, reset, Escape and reduced motion.');
