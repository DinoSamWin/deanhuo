(() => {
    'use strict';

    // Outward travelling water/light waves, measured against the rotated MP4.
    // Only the centres and outer fade are fixed: every crest is born inside,
    // travels out, widens and disappears. Nothing oscillates at a fixed radius.
    // .19H crest spacing, with shader side factors 1.50/.75, gives the measured
    // mean intervals of .8s left / 1.6s right, including ambient (paused) frames.
    const BASE_WAVE_SPEED = .19 / (.8 * 1.50);
    const AMBIENT_STRENGTH = [.30, .32];
    const VERTEX = `
        attribute vec2 a_position;
        varying vec2 v_uv;
        void main() {
            v_uv = a_position * .5 + .5;
            gl_Position = vec4(a_position, 0., 1.);
        }
    `;
    const FRAGMENT = `
        #ifdef GL_FRAGMENT_PRECISION_HIGH
        precision highp float;
        #else
        precision mediump float;
        #endif
        varying vec2 v_uv;
        uniform vec2 u_resolution;
        uniform float u_time;
        uniform float u_travel;
        uniform vec4 u_audio;
        uniform float u_impact;
        uniform vec3 u_response;
        uniform vec2 u_waveStrength;
        uniform vec3 u_dark;
        uniform vec3 u_mid;
        uniform vec3 u_light;
        uniform vec4 u_impulses[4];

        float square(float value) { return value * value; }
        float hash(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
        }
        float band(float radius, float centre, float width) {
            return exp(-square((radius - centre) / width));
        }
        vec3 speakerWaves(vec2 q, float side) {
            float angle = atan(q.y, q.x);
            // Visible inward-facing half only: unlike atan's +/-PI seam on the
            // right, this coordinate stays continuous through the middle.
            float inwardAngle = atan(q.y, abs(q.x) + .0001);
            float radius = length(q * vec2(1., .97));
            float t = u_time * .32;
            float light = 0., shade = 0., thin = 0.;
            // Left: a quicker, feathered wash. Right: smaller/slower ripples.
            // Offsets and per-emission values break the equally spaced tunnel
            // pattern, without introducing per-frame randomness or phase jumps.
            float travel = u_travel * mix(1.50, .75, side);
            float extent = mix(.65, .57, side);
            for (int index = 0; index < 4; index++) {
                float layer = float(index);
                float distance = travel + layer * .19 + sin(layer * 2.3 + side) * .010 + side * .037;
                float age = mod(distance, .76) / .76;
                float seed = hash(vec2(floor(distance / .76), layer + side * 7.));
                float character = hash(vec2(layer + 9.3, floor(distance / .76) + side * 4.7));
                float centre = .045 + age * .76;
                // Broad shoulders are present even in the paused reference.
                // Fade their lifetime beyond the spatial envelope, rather than
                // multiplying two early fades that erase the outer two waves.
                float fade = smoothstep(.055, .14, centre) * (1. - smoothstep(extent, extent + .12, centre));
                float width = .036 + character * .018 + age * .012;
                float shape = sin(angle * 2. + seed * 6.28) * .002;
                float shoulder = square(.5 + .5 * cos(angle + character * 6.28));
                float exposure = .78 + shoulder * .22;
                // The travelling texture has its own visible floor; music
                // accents it instead of being required to reveal the texture.
                float contrast = .65 + clamp(u_waveStrength.x, 0., 1.) * .35;
                float strength = (.72 + pow(seed, 1.4) * .45) * contrast * mix(1.2, 1., side);
                // The dark left field sheds a broad luminous shoulder; its
                // shadow is secondary, rather than another dark outlined ring.
                light += band(radius + shape, centre, width) * fade * strength * exposure
                    * (.12 + character * .10) * mix(1.28, 1., side);
                // Separate the broad bright and dark shoulders by roughly half
                // a wavelength so they do not cancel into a flat colour field.
                shade += band(radius + shape, centre + .085, width * 1.10)
                    * fade * strength * exposure * (.14 + (1. - character) * .10);
            }
            float thinWidth = max(.0040, 1.5 / min(u_resolution.x, u_resolution.y));
            // No full-circle baseline: translucent details only catch light in
            // a soft local patch, then disappear. Never a hard traced contour.
            for (int index = 0; index < 3; index++) {
                float layer = float(index);
                float distance = travel * 1.12 + layer * .24 + side * .08;
                float age = mod(distance, .72) / .72;
                float seed = hash(vec2(floor(distance / .72) + 11., layer + side * 5.));
                float centre = .09 + age * .58;
                float fade = smoothstep(.03, .21, age) * (1. - smoothstep(.32, .72, age));
                float pinch = .5 + .5 * sin(t * .75 + seed * 6.28);
                float patch = (seed * 2. - 1.) * .94 + sin(t * .22 + seed * 5.) * .10;
                float arc = exp(-square((inwardAngle - patch) / (.20 + pinch * .18)));
                float shape = sin(inwardAngle * 3. + seed * 5.) * .008
                    + sin(inwardAngle * 5. - t * .65 + seed * 4.) * .012 * pinch;
                float strength = fade * arc * (.075 + seed * .085) * u_waveStrength.y * mix(.6, 1., side);
                float width = thinWidth * (.9 + pinch * 1.1);
                thin += band(radius + shape, centre, width) * strength;
                // A soft second shoulder pinches away from the first, making a
                // little refracted-water glint rather than an unbroken neon arc.
                thin += band(radius + shape, centre + .012 + pinch * .009, width * 1.3) * strength * pinch * .32;
                light += band(radius + shape, centre, width * 5.) * strength * .38;
            }
            // Real onsets add lighter, partially transparent water rings. Their
            // age always increases, so a release can never pull a wave backwards.
            for (int index = 0; index < 4; index++) {
                vec4 impulse = u_impulses[index];
                float age = impulse.z;
                float centre = .12 + age * (.22 + impulse.w * .025) * mix(1., .72, side);
                // Finish before a fifth 170ms onset can recycle this pool slot.
                float fade = smoothstep(0., .07, age) * (1. - smoothstep(.25, .64, age));
                float sideWeight = mix(.55, 1., side < .5 ? 1. - impulse.x : impulse.x);
                float arc = exp(-square((inwardAngle - (impulse.y - .5) * 2.) / .32));
                float strength = fade * impulse.w * sideWeight;
                light += band(radius, centre, .044 + age * .020) * arc * strength * .065;
                thin += band(radius, centre, thinWidth * 1.8) * arc * strength * .055;
            }
            float envelope = 1. - smoothstep(extent - .12, extent, length(q));
            return vec3(light, shade, thin) * envelope;
        }
        void main() {
            vec2 scale = u_resolution / min(u_resolution.x, u_resolution.y);
            vec2 p = v_uv * scale;
            bool portrait = scale.y > scale.x * 1.1;
            // A 400px-high reference has centres ~28px beyond either edge.
            // On portrait screens shrink the circles without stretching them.
            float size = portrait ? .82 : min(1., scale.x * .46);
            vec2 left = (p - vec2(-.07 * size, scale.y * .5)) / size;
            vec2 right = (p - vec2(scale.x + .07 * size, scale.y * .5)) / size;
            vec3 waves = speakerWaves(left, 0.) + speakerWaves(right, 1.);
            float edge = min(v_uv.x, 1. - v_uv.x);
            waves *= 1. - smoothstep(portrait ? .20 : .25, portrait ? .35 : .36, edge);
            // The centre is a still, low-frequency cover-colour gradient. Left
            // dark / right light is deliberate and also shapes the optical waves.
            vec3 colour = mix(u_dark, u_light, pow(v_uv.x, 1.12));
            colour *= 1. - waves.y;
            colour += u_light * waves.x * mix(.60, 1., v_uv.x);
            colour += mix(u_light, vec3(1.), .10) * waves.z * mix(.60, 1., v_uv.x);
            float edgeY = abs(v_uv.y - .5) * 2.;
            colour *= 1. - .56 * smoothstep(.65, 1., edgeY) - .12 * smoothstep(.91, 1., edgeY);
            colour += (hash(gl_FragCoord.xy) - .5) / 255.;
            gl_FragColor = vec4(max(colour, vec3(0.)), 1.);
        }
    `;

    let canvas = null, gl = null, program = null, buffer = null;
    let uniforms = {};
    let unavailable = false, lost = false, eventsBound = false;
    let width = 0, height = 0, renderScale = 1, quality = 1;
    let flowTime = 0, clockTime = 0, sequence = 7;
    let impulses = [];
    const impulseData = new Float32Array(16);
    let palette = [218, 64];
    let colours = [];
    let frameCount = 0, averageDelta = 16.67, slowFrames = 0;
    let drive = 0, punch = 0, density = 0;
    let playbackBlend = 0;
    let strength = [...AMBIENT_STRENGTH];
    let lastFrame = { ambient: true, bass: 0, mid: 0, treble: 0, energy: 0, beat: 0, impact: 0 };

    function hsl(hue, saturation, lightness) {
        const s = saturation / 100, l = lightness / 100;
        const a = s * Math.min(l, 1 - l);
        return [0, 8, 4].map(n => {
            const k = (n + hue / 30) % 12;
            return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        });
    }

    function setPalette(hue, saturation) {
        palette = [hue, saturation];
        // Preserve the cover hue and neutral covers; use the same hue for dark
        // translucent waves and the bright, unwhitened light source on the right.
        colours = [hsl(hue, saturation * .62, 10.5), hsl(hue, saturation, 32), hsl(hue, saturation, 56)];
        if (gl && program && !lost) render(lastFrame);
    }

    function compile(type, source) {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.warn('Liquid player shader unavailable:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    function initialize() {
        if (unavailable || lost) return false;
        if (program) return true;
        canvas ||= document.getElementById('pulse-canvas');
        if (!canvas) return false;
        try {
            gl = canvas.getContext('webgl', { alpha: false, antialias: false,
                depth: false, stencil: false, powerPreference: 'low-power' });
        } catch (error) { gl = null; }
        if (!gl) { unavailable = true; return false; }
        const derivatives = gl.getExtension('OES_standard_derivatives');
        if (!derivatives) quality = Math.min(quality, .7);
        const prefix = derivatives ? '#extension GL_OES_standard_derivatives : enable\n#define HAS_DERIVATIVES\n' : '';
        const vertex = compile(gl.VERTEX_SHADER, VERTEX);
        const fragment = compile(gl.FRAGMENT_SHADER, prefix + FRAGMENT);
        if (!vertex || !fragment) {
            if (vertex) gl.deleteShader(vertex);
            if (fragment) gl.deleteShader(fragment);
            unavailable = true;
            return false;
        }
        program = gl.createProgram();
        if (!program) {
            gl.deleteShader(vertex);
            gl.deleteShader(fragment);
            unavailable = true;
            return false;
        }
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            gl.deleteProgram(program);
            program = null;
            unavailable = true;
            return false;
        }
        gl.useProgram(program);
        buffer = gl.createBuffer();
        if (!buffer) {
            gl.deleteProgram(program);
            program = null;
            unavailable = true;
            return false;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const attribute = gl.getAttribLocation(program, 'a_position');
        gl.enableVertexAttribArray(attribute);
        gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
        for (const name of ['u_resolution', 'u_time', 'u_travel', 'u_audio', 'u_impact', 'u_response', 'u_waveStrength', 'u_dark', 'u_mid', 'u_light', 'u_impulses[0]']) {
            uniforms[name] = gl.getUniformLocation(program, name);
        }
        if (!eventsBound) {
            eventsBound = true;
            canvas.addEventListener('webglcontextlost', event => {
                event.preventDefault();
                lost = true;
                document.body.classList.remove('has-liquid-field');
            });
            canvas.addEventListener('webglcontextrestored', () => {
                lost = false;
                program = null;
                width = height = 0;
                if (initialize()) { resize(); render(lastFrame); }
            });
            window.addEventListener('resize', () => {
                // Rotation while paused must redraw the same still surface at
                // its new aspect, not stretch a landscape frame into portrait.
                if (program && !lost) { resize(); render(lastFrame); }
            }, { passive: true });
        }
        setPalette(...palette);
        canvas.dataset.renderer = 'webgl-liquid';
        document.body.classList.add('has-liquid-field');
        return true;
    }

    function resize() {
        // Limit fill cost rather than frame rate; a soft surface needs no 3x buffer.
        const w = window.innerWidth, h = window.innerHeight;
        renderScale = Math.min(window.devicePixelRatio || 1, 1.25, Math.sqrt(1100000 / (w * h))) * quality;
        const nextWidth = Math.max(1, Math.round(w * renderScale));
        const nextHeight = Math.max(1, Math.round(h * renderScale));
        if (nextWidth === width && nextHeight === height) return;
        canvas.width = width = nextWidth;
        canvas.height = height = nextHeight;
        gl.viewport(0, 0, width, height);
    }

    function random() {
        sequence = (sequence * 1664525 + 1013904223) >>> 0;
        return sequence / 4294967296;
    }

    function targetWaveStrength(ambient) {
        if (ambient) return AMBIENT_STRENGTH;
        // Idle and quiet playback are different states. Raise only the playing
        // low-energy floor; the boost fades out before loud passages, preserving
        // their existing highlight/shadow peaks instead of globally brightening.
        const ramp = Math.min(1, Math.max(0, (drive - .12) / .38));
        const quietBoost = 1 - ramp * ramp * (3 - 2 * ramp);
        const broad = .36 + drive * .64 + quietBoost * .08;
        const glint = .48 + drive * .70 + quietBoost * .10;
        return [broad, glint];
    }

    function render(frame) {
        if (!width || !height || !program || lost) return;
        gl.useProgram(program);
        gl.uniform2f(uniforms.u_resolution, width, height);
        gl.uniform1f(uniforms.u_time, flowTime);
        // The reference's broad-wave cadence persists during silent/paused
        // passages. Audio changes local light/shape, not this transport clock.
        gl.uniform1f(uniforms.u_travel, clockTime * BASE_WAVE_SPEED);
        gl.uniform4f(uniforms.u_audio, frame.bass, frame.mid, frame.treble, frame.energy);
        gl.uniform1f(uniforms.u_impact, frame.impact);
        gl.uniform3fv(uniforms.u_response, [drive, punch, density]);
        gl.uniform2f(uniforms.u_waveStrength, ...strength);
        ['u_dark', 'u_mid', 'u_light'].forEach((name, index) => gl.uniform3fv(uniforms[name], colours[index]));
        impulseData.fill(0);
        impulses.forEach((impulse, index) => {
            impulseData.set([impulse.x, impulse.y, clockTime - impulse.time, impulse.strength], index * 4);
        });
        gl.uniform4fv(uniforms['u_impulses[0]'], impulseData);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function draw(frame) {
        // The sole RAF owner supplies ambient frames before play and on pause.
        // Never interpret stale/nonzero analyser fields as beats in that mode.
        const ambient = frame.ambient === true;
        if (ambient) frame = { ...frame, bass: 0, mid: 0, treble: 0, energy: 0, beat: 0, impact: 0 };
        lastFrame = frame;
        if (!initialize()) return;
        const delta = Math.min(Math.max(frame.delta || 16.67, 0), 50);
        const transition = 1 - Math.exp(-delta / (ambient ? 280 : 180));
        playbackBlend += ((ambient ? 0 : 1) - playbackBlend) * transition;
        clockTime += delta / 1000;
        // A convex loudness curve preserves quiet/loud contrast; a fast attack
        // and slower release avoid delayed response without discontinuous jumps.
        const targetDrive = Math.pow(Math.min(1, Math.max(0, (frame.energy - .025) / .50)), 1.25);
        drive += (targetDrive - drive) * (1 - Math.exp(-delta / (targetDrive > drive ? 32 : 240)));
        const strike = Math.pow(Math.min(1, Math.max(0, (frame.beat - .015) / .42)), 1.25);
        punch = Math.max(strike, punch * Math.exp(-delta / 160));
        density = Math.min(1, density * Math.exp(-delta / 800) + (frame.beat > 0 ? strike * .28 : 0));
        if (ambient) {
            impulses = [];
            punch = density = 0;
        }
        const targetStrength = targetWaveStrength(ambient);
        strength = strength.map((value, index) => value + (targetStrength[index] - value) * transition);
        flowTime += delta / 1000 * (.14 + drive * 2.3 + punch * 2.1 + density * 1.25);
        if (frame.beat > 0) {
            const side = random();
            impulses.push({ x: side < .43 ? .025 + random() * .18 : side < .86 ? .80 + random() * .18 : .25 + random() * .5,
                y: side < .86 ? .16 + random() * .70 : .035,
                time: clockTime, strength: strike });
            if (impulses.length > 4) impulses.shift();
        }
        impulses = impulses.filter(impulse => clockTime - impulse.time < 1.6);
        frameCount++;
        averageDelta += (delta - averageDelta) * .025;
        if (frame.delta > 23) slowFrames++;
        if (frameCount % 180 === 0) {
            if (slowFrames > 54 && quality > .55) quality = Math.max(.55, quality * .84);
            slowFrames = 0;
        }
        resize();
        render(frame);
    }

    function reset() {
        impulses = [];
        drive = punch = density = 0;
        lastFrame = { ambient: true, bass: 0, mid: 0, treble: 0, energy: 0, beat: 0, impact: 0 };
        // The selected skin needs its quiet initial still before audio starts;
        // otherwise the older CSS rings remain visible until the first play.
        // Allocate nothing for the original skin, hidden pages or reduced motion.
        if (!program && document.body.dataset?.playerSkin === 'pulse' && !document.hidden
            && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) initialize();
        // Preserve phase and current broad-wave contrast at this boundary.
        // Subsequent ambient frames ease toward the softer floor; reset itself
        // cannot flash/reseed the background or schedule a second animation loop.
        if (program && !lost) { resize(); render(lastFrame); }
    }

    window.DeanPulseVisuals = {
        draw, reset, setPalette,
        getDiagnostics: () => ({ renderer: program && !lost ? 'webgl-liquid' : 'static',
            width, height, renderScale, frameCount, averageDelta, activeImpulses: impulses.length,
            drive, punch, density, playbackBlend, ambient: lastFrame.ambient === true,
            waveStrength: [...strength], waveTravel: clockTime * BASE_WAVE_SPEED })
    };
})();
