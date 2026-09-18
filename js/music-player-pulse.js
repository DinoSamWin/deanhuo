(() => {
    'use strict';

    // One GPU surface, driven by the shared analyser at display refresh rate.
    // Beats displace existing material locally, rather than spawning ring sprites.
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
        uniform vec4 u_audio;
        uniform float u_impact;
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
        float noise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            vec2 s = f * f * (3. - 2. * f);
            return mix(mix(hash(i), hash(i + vec2(1., 0.)), s.x),
                       mix(hash(i + vec2(0., 1.)), hash(i + 1.), s.x), s.y);
        }
        float flowNoise(vec2 p) {
            return noise(p) * .67 + noise(mat2(.8, -.6, .6, .8) * p * 2.03 + 7.1) * .33;
        }
        vec2 drift(vec2 p, float t, float seed) {
            // Low-frequency domains stay coherent across pixels and frames.
            vec2 n = vec2(flowNoise(p * 1.7 + vec2(t * .32, seed)),
                          flowNoise(p * 1.6 + vec2(seed, -t * .27)));
            return (n - .5) * .38 + vec2(sin(p.y * 2.2 + t * .63),
                cos(p.x * 2.1 - t * .49)) * .09;
        }
        float sheet(vec2 p, vec2 centre, float radius, float t, float seed) {
            vec2 q = (p - centre) / radius;
            q += drift(q, t, seed) * (1. + u_audio.y * .7);
            float angle = atan(q.y, q.x);
            float r = length(q);
            float fold = r + .11 * sin(angle * 3. + t * .56 + seed)
                + .065 * cos(angle * 5. - t * .42);
            // Broad uneven folds, not stacks of outlined circles.
            float a = .62 + .07 * sin(angle * 2. - t * .4);
            float b = 1.05 + .12 * cos(angle * 2. + t * .32 + seed);
            float c = 1.48 + .08 * sin(angle * 3. + t * .23);
            float h = .058 * exp(-square((fold - a) / .18))
                    - .032 * exp(-square((fold - b) / .23))
                    + .022 * exp(-square((fold - c) / .26));
            return h * (1. - smoothstep(1.5, 2.15, r));
        }
        vec2 distort(vec2 p, vec2 scale) {
            for (int i = 0; i < 4; i++) {
                vec4 impulse = u_impulses[i];
                vec2 d = p - impulse.xy * scale;
                float radius = .13 + impulse.w * .24;
                float lens = exp(-dot(d, d) / (radius * radius));
                float age = impulse.z;
                // Soft attack, elastic recoil and a long viscous release.
                float envelope = (1. - exp(-age * 15.)) * exp(-age * 3.1);
                float bend = sin(age * 7.5) * envelope * impulse.w;
                p += (d * .55 + vec2(-d.y, d.x) * .7) * lens * bend;
            }
            return p;
        }
        float surface(vec2 p, vec2 scale) {
            float t = u_time;
            p = distort(p, scale);
            bool portrait = scale.y > scale.x * 1.1;
            float r = portrait ? .70 : min(scale.x * .35, .43);
            vec2 left = vec2(-.04, portrait ? .59 : .51) * scale;
            vec2 right = vec2(1.04, portrait ? .40 : .52) * scale;
            left += vec2(sin(t * .31) * .038, cos(t * .37) * .067);
            right += vec2(cos(t * .23 + 2.) * .047, sin(t * .29 + 1.) * .079);
            float h = sheet(p, left, r * (1. + .075 * sin(t * .43)), t, 2.7);
            h += sheet(p, right, r * (1. + .11 * cos(t * .36)), -t * .87, 8.3);
            float floorY = .07 + .035 * sin(p.x * 2.3 + t * .64)
                + .022 * sin(p.x * 5.1 - t * .48);
            h += exp(-square((p.y - floorY) / .14)) * (.009 + u_audio.x * .022);
            return h;
        }
        void main() {
            vec2 scale = u_resolution / min(u_resolution.x, u_resolution.y);
            vec2 p = v_uv * scale;
            float h = surface(p, scale);
            vec2 slope;
            #ifdef HAS_DERIVATIVES
                slope = vec2(dFdx(h), dFdy(h)) * min(u_resolution.x, u_resolution.y);
            #else
                float epsilon = .003;
                slope = vec2(surface(p + vec2(epsilon, 0.), scale) - h,
                    surface(p + vec2(0., epsilon), scale) - h) / epsilon;
            #endif
            vec3 normal = normalize(vec3(-slope * 1.35, 1.));
            vec3 lightDirection = normalize(vec3(-.5, .65, .75));
            float shading = dot(normal, lightDirection);
            float specular = pow(max(0., dot(reflect(-lightDirection, normal), vec3(0., 0., 1.))), 9.);
            float rightLight = smoothstep(0., 1.1, v_uv.x);
            vec3 colour = mix(u_dark, u_mid, smoothstep(0., 1., v_uv.x));
            colour = mix(colour, u_light, rightLight * .32);
            colour *= clamp(.97 + (shading - .73) * .68 + h * .9, .52, 1.35);
            float sideMask = smoothstep(.08, .44, abs(v_uv.x - .5));
            float sheen = specular * sideMask * (.11 + u_audio.z * .10);
            colour += u_light * sheen;
            float bottom = exp(-pow(v_uv.y / .19, 2.));
            float caustic = .6 + .4 * sin(p.x * 3.1 + u_time * .7 + h * 24.);
            colour += u_light * bottom * caustic * (u_audio.x * .16 + u_impact * .065);
            float vignette = 1. - .13 * pow(abs(v_uv.y - .5) * 2., 2.);
            colour *= vignette;
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
    let lastFrame = { bass: 0, mid: 0, treble: 0, energy: 0, impact: 0 };

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
        colours = [hsl(hue, saturation, 9), hsl(hue, saturation, 29), hsl(hue, saturation, 64)];
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
        for (const name of ['u_resolution', 'u_time', 'u_audio', 'u_impact', 'u_dark', 'u_mid', 'u_light', 'u_impulses[0]']) {
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

    function render(frame) {
        if (!width || !height || !program || lost) return;
        gl.useProgram(program);
        gl.uniform2f(uniforms.u_resolution, width, height);
        gl.uniform1f(uniforms.u_time, flowTime);
        gl.uniform4f(uniforms.u_audio, frame.bass, frame.mid, frame.treble, frame.energy);
        gl.uniform1f(uniforms.u_impact, frame.impact);
        ['u_dark', 'u_mid', 'u_light'].forEach((name, index) => gl.uniform3fv(uniforms[name], colours[index]));
        impulseData.fill(0);
        impulses.forEach((impulse, index) => {
            impulseData.set([impulse.x, impulse.y, clockTime - impulse.time, impulse.strength], index * 4);
        });
        gl.uniform4fv(uniforms['u_impulses[0]'], impulseData);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function draw(frame) {
        lastFrame = frame;
        if (!initialize()) return;
        const delta = Math.min(Math.max(frame.delta || 16.67, 0), 50);
        clockTime += delta / 1000;
        flowTime += delta / 1000 * (.14 + Math.sqrt(frame.energy) * 1.8);
        if (frame.beat > 0) {
            const side = random();
            impulses.push({ x: side < .43 ? .025 + random() * .18 : side < .86 ? .80 + random() * .18 : .25 + random() * .5,
                y: side < .86 ? .16 + random() * .70 : .035,
                time: clockTime, strength: Math.min(1, Math.sqrt(frame.beat) * 1.3) });
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
        lastFrame = { bass: 0, mid: 0, treble: 0, energy: 0, impact: 0 };
        // Keep a still liquid surface when paused, not a flash back to old circles.
        if (program && !lost) { resize(); render(lastFrame); }
    }

    window.DeanPulseVisuals = {
        draw, reset, setPalette,
        getDiagnostics: () => ({ renderer: program && !lost ? 'webgl-liquid' : 'static',
            width, height, renderScale, frameCount, averageDelta, activeImpulses: impulses.length })
    };
})();
