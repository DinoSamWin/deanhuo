(() => {
    'use strict';

    // A single renderer driven by the player's actual FFT frames. There is no
    // synthetic beat clock, second audio element, or independent animation loop.
    let canvas = null;
    let context = null;
    let width = 0;
    let height = 0;
    let ratio = 1;
    let hue = 218;
    let saturation = 64;
    let phase = 0;
    let ripples = [];
    const TAU = Math.PI * 2;
    const POINTS = 96;

    function colour(lightness, alpha) {
        return `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
    }

    function resize() {
        if (!canvas) {
            canvas = document.getElementById('pulse-canvas');
            context = canvas?.getContext('2d');
        }
        if (!context) return false;
        const nextWidth = window.innerWidth;
        const nextHeight = window.innerHeight;
        const nextRatio = Math.min(window.devicePixelRatio || 1, 1.5);
        if (nextWidth !== width || nextHeight !== height || nextRatio !== ratio) {
            width = nextWidth;
            height = nextHeight;
            ratio = nextRatio;
            canvas.width = Math.round(width * ratio);
            canvas.height = Math.round(height * ratio);
            context.setTransform(ratio, 0, 0, ratio, 0, 0);
        }
        return true;
    }

    function ringPath(x, y, radius, amplitude, rotation, harmonics, flatten = 1) {
        context.beginPath();
        for (let step = 0; step <= POINTS; step++) {
            const angle = step / POINTS * TAU;
            // Broad, smooth lobes rather than a spiky equalizer. Each harmonic
            // has an independent frequency-band weight sampled this frame.
            const wave = Math.sin(angle * 3 + rotation) * harmonics[0]
                + Math.sin(angle * 5 - rotation * .7) * harmonics[1] * .55
                + Math.cos(angle * 8 + rotation * .4) * harmonics[2] * .22;
            const r = radius + amplitude * wave;
            const px = x + Math.cos(angle) * r;
            const py = y + Math.sin(angle) * r * flatten;
            if (step === 0) context.moveTo(px, py);
            else context.lineTo(px, py);
        }
        context.closePath();
    }

    function drawSide(x, y, size, mirror, frame, harmonics) {
        const punch = Math.sqrt(frame.impact);
        const rotation = phase * mirror;
        const drift = size * frame.bass * .035;
        const gradient = context.createLinearGradient(x - size, y, x + size, y + size * .3);
        gradient.addColorStop(0, colour(78, .025));
        gradient.addColorStop(.5, colour(80, .17 + frame.treble * .2));
        gradient.addColorStop(1, colour(90, .05));
        for (let layer = 0; layer < 5; layer++) {
            const radius = size * (.44 + layer * .17 + punch * .09) + drift;
            const amplitude = size * (.006 + frame.mid * .06 + punch * .045);
            ringPath(x, y, radius, amplitude, rotation + layer * .65, harmonics);
            // Wide dark trough + soft coloured shoulder gives the rings depth.
            context.strokeStyle = colour(4, .065 + frame.bass * .045);
            context.lineWidth = size * (.035 + layer * .006);
            context.stroke();
            context.strokeStyle = colour(66, .02 + frame.energy * .045);
            context.lineWidth = size * .017;
            context.stroke();
            if (layer < 3) {
                context.strokeStyle = gradient;
                context.lineWidth = .7 + punch * 1.1;
                context.stroke();
            }
        }
    }

    function drawFloor(frame) {
        const punch = Math.sqrt(frame.impact);
        const alpha = frame.energy * .16 + punch * .15;
        if (alpha < .001) return;
        context.save();
        context.translate(width * .58, height * 1.08);
        context.scale(1, .3 + frame.bass * .06);
        const radius = Math.max(width * .7, height * .65);
        const light = context.createRadialGradient(0, 0, radius * .06, 0, 0, radius);
        light.addColorStop(0, colour(84, alpha));
        light.addColorStop(.35, colour(71, alpha * .7));
        light.addColorStop(1, colour(55, 0));
        context.fillStyle = light;
        context.fillRect(-radius, -radius, radius * 2, radius * 2);
        context.restore();
    }

    function draw(frame) {
        if (!resize()) return;
        const { now, beat, spectrum, binWidth } = frame;
        context.clearRect(0, 0, width, height);
        if (frame.energy < .002 && !ripples.length) return;
        phase += Math.min(frame.delta, 100) / 1000 * frame.energy * 1.8;
        const portrait = width < height && width <= 600;
        const size = portrait ? width * .63 : Math.min(height * .5, width * .41);
        const sides = portrait
            ? [[width * -.28, height * .4], [width * 1.23, height * .57]]
            : [[width * -.05, height * .5], [width * 1.03, height * .5]];
        const atFrequency = hz => {
            const index = Math.min(spectrum.length - 1, Math.max(0, Math.round(hz / binWidth)));
            return spectrum[index] / 255;
        };
        const harmonics = [frame.bass * .6 + atFrequency(110) * .4,
            frame.mid * .6 + atFrequency(640) * .4,
            frame.treble * .6 + atFrequency(3200) * .4];

        if (beat > 0) {
            ripples.push({ start: now, strength: Math.sqrt(beat), duration: 850 + beat * 600 });
            if (ripples.length > 8) ripples.shift();
        }
        drawFloor(frame);
        sides.forEach(([x, y], index) => drawSide(x, y, size, index ? -1 : 1, frame, harmonics));
        ripples = ripples.filter(ripple => now - ripple.start < ripple.duration);
        for (const ripple of ripples) {
            const age = (now - ripple.start) / ripple.duration;
            const fade = Math.sin(Math.min(1, age * 7) * Math.PI / 2) * Math.pow(1 - age, 1.6);
            // The first 200 ms overshoot/recoil feels like a struck membrane;
            // the same impulse then travels outward as a fading water ripple.
            const recoil = Math.sin(age * 19) * Math.exp(-age * 7) * ripple.strength * .09;
            const radius = size * (.5 + age * (.65 + ripple.strength * .6) + recoil);
            for (const [x, y] of sides) {
                ringPath(x, y, radius, size * .015 * ripple.strength * (1 - age), phase, harmonics);
                context.strokeStyle = colour(80, fade * ripple.strength * .32);
                context.lineWidth = .8 + ripple.strength * 1.5 * (1 - age);
                context.stroke();
                context.strokeStyle = colour(70, fade * ripple.strength * .05);
                context.lineWidth = size * .024;
                context.stroke();
            }
            ringPath(width * .58, height * 1.12, width * (.12 + age * .65),
                height * .025 * ripple.strength, phase, harmonics, .21);
            context.strokeStyle = colour(83, fade * ripple.strength * .15);
            context.lineWidth = 1 + ripple.strength;
            context.stroke();
        }
    }

    function reset() {
        ripples = [];
        phase = 0;
        context?.clearRect(0, 0, width, height);
    }

    window.DeanPulseVisuals = {
        draw,
        reset,
        setPalette(nextHue, nextSaturation) {
            hue = nextHue;
            saturation = nextSaturation;
        }
    };
})();
