import * as THREE from '../assets/vendor/three-0.169.0.module.min.js';

// Full-scene, camera-registered live-action plates only. The actor's route and
// sit/stand transition belong to the footage, not a translated static cutout.
export async function createVideoVisitors({ reducedMotion, canvas }) {
    const config = await fetch('assets/data/photo-exhibition-visitors.json').then(r => r.ok ? r.json() : null).catch(() => null);
    const clips = (config?.clips || []).filter(clip => /^assets\/[\w./-]+\.(mp4|webm)$/i.test(clip.src || '') && !clip.src.includes('..') && Number(clip.people || 1) <= 2);
    const noop = { update() {}, render() {}, setPlaying() {}, reset() {}, dispose() {} };
    if (!config?.enabled || !clips.length || reducedMotion) {
        canvas.dataset.visitors = reducedMotion ? 'reduced-motion' : 'waiting-for-video';
        return noop;
    }
    const layer = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
    camera.position.z = 1;
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.preload = 'auto'; video.loop = false;
    const texture = new THREE.VideoTexture(video);
    const material = new THREE.ShaderMaterial({
        transparent: true, depthTest: false, depthWrite: false,
        uniforms: {
            frame: { value: texture }, crop: { value: new THREE.Vector2(1, 1) },
            keyColor: { value: new THREE.Vector3(0, 1, 0) }, threshold: { value: .25 }, softness: { value: .12 },
            useAlpha: { value: 0 }
        },
        vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
        fragmentShader: `
            uniform sampler2D frame; uniform vec2 crop; uniform vec3 keyColor;
            uniform float threshold; uniform float softness; uniform float useAlpha;
            varying vec2 vUv;
            vec2 chroma(vec3 c){return vec2(-.168736*c.r-.331264*c.g+.5*c.b,.5*c.r-.418688*c.g-.081312*c.b);}
            void main(){
                vec4 color=texture2D(frame,(vUv-.5)*crop+.5);
                float distanceToKey=distance(chroma(color.rgb),chroma(keyColor));
                float alpha=useAlpha>.5?color.a:smoothstep(threshold,threshold+softness,distanceToKey);
                float spill=(1.-smoothstep(threshold+.03,threshold+softness+.12,distanceToKey))*(1.-useAlpha);
                color.g=mix(color.g,min(color.g,max(color.r,color.b)+.025),spill);
                gl_FragColor=vec4(color.rgb,alpha);
            }`
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material); layer.add(quad);
    let playing = true, active = false, elapsed = 0, previous = -1, disposed = false;
    const randomDelay = (range, fallback) => Array.isArray(range) && range.length === 2 ? Math.max(0, range[0]) + Math.random() * Math.max(0, range[1] - range[0]) : fallback;
    let arrival = randomDelay(config.firstArrivalSeconds, 25);
    function finish() {
        video.pause(); active = false;
        arrival = elapsed + randomDelay(config.quietSeconds, 75);
        canvas.dataset.visitorCount = '0';
        canvas.dataset.visitors = 'quiet';
    }
    video.addEventListener('ended', finish);
    video.addEventListener('error', () => { finish(); canvas.dataset.visitors = 'video-error'; });
    function startClip() {
        const candidates = clips.map((_, i) => i).filter(i => clips.length === 1 || i !== previous);
        previous = candidates[Math.floor(Math.random() * candidates.length)];
        const clip = clips[previous];
        material.uniforms.threshold.value = clip.threshold ?? .25;
        material.uniforms.softness.value = clip.softness ?? .12;
        material.uniforms.useAlpha.value = clip.alpha ? 1 : 0;
        material.uniforms.keyColor.value.fromArray(clip.keyColor || [0, 1, 0]);
        video.src = clip.src; active = true;
        canvas.dataset.visitorCount = String(clip.people || 1);
        canvas.dataset.visitors = 'live-action';
        video.play().catch(() => { active = false; canvas.dataset.visitors = 'playback-blocked'; arrival = elapsed + 60; });
    }
    return {
        update(delta) { if (playing && !disposed) { elapsed += Math.min(delta, .1); if (!active && elapsed >= arrival) startClip(); } },
        render(renderer, width, height) {
            if (!active || video.readyState < 2) return;
            const sceneAspect = config.sceneAspect || 16 / 9, viewportAspect = width / height;
            material.uniforms.crop.value.set(Math.min(1, viewportAspect / sceneAspect), Math.min(1, sceneAspect / viewportAspect));
            const autoClear = renderer.autoClear;
            renderer.autoClear = false; renderer.render(layer, camera); renderer.autoClear = autoClear;
        },
        setPlaying(value) { playing = value; if (!playing) video.pause(); else if (active) video.play().catch(() => {}); },
        reset() { video.pause(); active = false; elapsed = 0; arrival = randomDelay(config.firstArrivalSeconds, 25); canvas.dataset.visitorCount = '0'; },
        dispose() { disposed = true; video.pause(); video.removeAttribute('src'); video.load(); texture.dispose(); material.dispose(); quad.geometry.dispose(); }
    };
}
