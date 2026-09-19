(() => {
    'use strict';

    const STORAGE_KEY = 'dean-player-skin';
    const IDLE_DELAY = 5000;
    const FULLSCREEN_WAIT_LIMIT = 1500;
    const ANALYSIS_INTERVAL = 1000 / 60;
    // Preserve quick subdivisions instead of dropping every other drum hit.
    const BEAT_COOLDOWN = 170;
    const DETECTOR_WARMUP = 180;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let audio = null;
    let onChange = null;
    let initialized = false;
    let toggle = null;
    let menu = null;
    let fullscreenButton = null;
    let fullscreenToolbar = null;
    let closeButton = null;
    let fullscreenPending = false;
    let fullscreenOperation = 0;
    let idleTimer = null;
    let keyboardNavigation = false;
    let swallowTouchClickUntil = 0;
    let audioContext = null;
    let mediaSource = null;
    let analyser = null;
    let frequencyData = null;
    let graphUnavailable = false;
    let resumePending = false;
    let visualFrame = null;
    let visualRestoreTimer = null;
    let visualContextLost = false;
    let analysingAudio = false;
    let awaitingAudioData = false;
    let lastFrameTime = 0;
    let lastAnalysisTime = 0;
    let nextAnalysisTime = 0;
    let targetBass = 0;
    let targetMid = 0;
    let targetTreble = 0;
    let targetEnergy = 0;
    let smoothLevel = 0;
    let smoothBass = 0;
    let smoothMid = 0;
    let smoothTreble = 0;
    let impact = 0;
    let previousSpectrum = null;
    let previousBass = 0;
    let fluxBaseline = 0;
    let fluxDeviation = 0;
    let energyBaseline = 0;
    let detectorReadyAt = 0;
    let lastBeatTime = -Infinity;
    let paletteRequest = 0;

    function themeRgb(hue, saturation, lightness) {
        const s = saturation / 100, l = lightness / 100;
        const a = s * Math.min(l, 1 - l);
        return [0, 8, 4].map(offset => {
            const k = (offset + hue / 30) % 12;
            return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        });
    }

    function luminance(rgb) {
        const linear = rgb.map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
        return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
    }

    function lyricColour(hue, saturation) {
        // Match the stable middle of the GPU gradient, not the bright rim.
        // Derive once per cover: wave highlights must never flicker the text.
        const dark = themeRgb(hue, saturation * .62, 10.5);
        const light = themeRgb(hue, saturation, 56);
        const blend = .5 ** 1.12;
        const background = luminance(dark.map((channel, index) => channel + (light[index] - channel) * blend));
        const hueBrightness = luminance(themeRgb(hue, 100, 50));
        const ramp = Math.min(1, Math.max(0, (hueBrightness - .21) / .27));
        // Light pinks and golds keep substantially more colour than fixed 88% L.
        let lightness = 80 - 12 * ramp * ramp * (3 - 2 * ramp);
        const chroma = saturation <= 10 ? saturation : Math.min(96, Math.max(70, saturation * 1.5 + 16));
        let colour = themeRgb(hue, chroma, lightness);
        while ((luminance(colour) + .05) / (background + .05) < 4 && lightness < 94) {
            lightness += .5;
            colour = themeRgb(hue, chroma, lightness);
        }
        return `rgb(${colour.map(channel => Math.round(channel * 255)).join(' ')})`;
    }

    function setPalette(hue = 218, saturation = 64) {
        document.body.style.setProperty('--pulse-hue', String(Math.round(hue)));
        document.body.style.setProperty('--pulse-saturation', `${Math.round(saturation)}%`);
        document.body.style.setProperty('--pulse-text-color', lyricColour(hue, saturation));
        document.body.style.setProperty('--pulse-echo-color', `hsl(${hue} ${saturation * .8}% 12%)`);
        window.DeanPulseVisuals?.setPalette?.(hue, saturation);
    }

    function setCover(value) {
        const request = ++paletteRequest;
        setPalette();
        if (!value) return;
        let url;
        try {
            url = new URL(value, document.baseURI);
            if (!['http:', 'https:', 'blob:', 'data:'].includes(url.protocol)) return;
        } catch (error) {
            return;
        }
        const cover = new Image();
        if (url.origin !== window.location.origin && ['http:', 'https:'].includes(url.protocol)) {
            cover.crossOrigin = 'anonymous';
        }
        cover.onload = () => {
            if (request !== paletteRequest) return;
            try {
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = 32;
                const context = canvas.getContext('2d', { willReadFrequently: true });
                if (!context) return;
                context.drawImage(cover, 0, 0, 32, 32);
                const pixels = context.getImageData(0, 0, 32, 32).data;
                const buckets = Array.from({ length: 24 }, () => ({ weight: 0, x: 0, y: 0, saturation: 0 }));
                let includedPixels = 0;
                let colourSum = 0;
                for (let index = 0; index < pixels.length; index += 4) {
                    if (pixels[index + 3] < 128) continue;
                    const red = pixels[index] / 255;
                    const green = pixels[index + 1] / 255;
                    const blue = pixels[index + 2] / 255;
                    const max = Math.max(red, green, blue);
                    const min = Math.min(red, green, blue);
                    const lightness = (max + min) / 2;
                    if (lightness < 0.07 || lightness > 0.94) continue;
                    includedPixels++;
                    const delta = max - min;
                    const saturation = delta / Math.max(0.001, 1 - Math.abs(2 * lightness - 1));
                    colourSum += saturation;
                    if (saturation < 0.08) continue;
                    let hue = max === red
                        ? ((green - blue) / delta) % 6
                        : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4;
                    hue = (hue * 60 + 360) % 360;
                    const weight = saturation * saturation * (1 - Math.abs(lightness - 0.5));
                    const bucket = buckets[Math.floor(hue / 15)];
                    const radians = hue * Math.PI / 180;
                    bucket.weight += weight;
                    bucket.x += Math.cos(radians) * weight;
                    bucket.y += Math.sin(radians) * weight;
                    bucket.saturation += saturation * weight;
                }
                if (!includedPixels || colourSum / includedPixels < 0.09) {
                    setPalette(218, 6);
                    return;
                }
                const dominantIndex = buckets.reduce((best, bucket, index) => bucket.weight > buckets[best].weight ? index : best, 0);
                const neighbours = [-1, 0, 1].map(offset => buckets[(dominantIndex + offset + buckets.length) % buckets.length]);
                const dominant = neighbours.reduce((result, bucket) => ({
                    weight: result.weight + bucket.weight,
                    x: result.x + bucket.x,
                    y: result.y + bucket.y,
                    saturation: result.saturation + bucket.saturation
                }), { weight: 0, x: 0, y: 0, saturation: 0 });
                if (!dominant.weight) {
                    setPalette(218, 6);
                    return;
                }
                const hue = (Math.atan2(dominant.y, dominant.x) * 180 / Math.PI + 360) % 360;
                const saturation = Math.min(72, Math.max(24, dominant.saturation / dominant.weight * 78));
                setPalette(hue, saturation);
            } catch (error) {
                // Missing assets and a canvas blocked by CORS retain the quiet blue fallback.
            }
        };
        cover.onerror = () => {
            // setCover already reset the palette; an older failed request must not override it.
        };
        cover.src = url.href;
    }

    function isImmersive() {
        return document.body.dataset.playerSkin === 'pulse';
    }

    function isPlaying() {
        return Boolean(audio && !audio.paused && !audio.ended && !audio.error);
    }

    function isMenuOpen() {
        return Boolean(menu && !menu.hidden);
    }

    function hasKeyboardControlFocus() {
        return keyboardNavigation && Boolean(document.activeElement?.closest('.player-chrome'));
    }

    function setIdle(idle) {
        document.body.classList.toggle('is-idle', idle);
        const keepExitControls = isImmersive() && Boolean(fullscreenElement());
        document.querySelectorAll('.player-chrome').forEach(element => {
            // Native fullscreen has no surrounding browser navigation. Keep
            // its visible escape controls focusable and clickable even while
            // the song information and playback controls fade away.
            const escapeControl = element === fullscreenToolbar || element === closeButton;
            element.inert = idle && !(keepExitControls && escapeControl);
        });
    }

    function isFullscreenEscapeTarget(target) {
        return isImmersive() && Boolean(fullscreenElement()) && Boolean(target)
            && Boolean(fullscreenToolbar?.contains(target) || closeButton?.contains(target));
    }

    function wakeControls() {
        clearTimeout(idleTimer);
        idleTimer = null;
        setIdle(false);
        if (!isImmersive() || !isPlaying() || document.hidden || isMenuOpen() || hasKeyboardControlFocus()) return;
        idleTimer = setTimeout(() => {
            idleTimer = null;
            if (isImmersive() && isPlaying() && !document.hidden && !isMenuOpen() && !hasKeyboardControlFocus()) {
                setIdle(true);
            }
        }, IDLE_DELAY);
    }

    function setMenuOpen(open) {
        if (!menu || !toggle) return;
        menu.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
        wakeControls();
    }

    function applySkin(value, persist = false) {
        const skin = value === 'pulse' ? 'pulse' : 'original';
        document.body.dataset.playerSkin = skin;
        document.querySelectorAll('[data-skin-option]').forEach(button => {
            const selected = button.dataset.skinOption === skin;
            button.setAttribute('aria-pressed', String(selected));
            button.classList.toggle('is-selected', selected);
        });
        if (persist) {
            try {
                window.localStorage.setItem(STORAGE_KEY, skin);
            } catch (error) {
                // Private browsing and storage restrictions must not interrupt playback.
            }
        }
        setMenuOpen(false);
        wakeControls();
        stopVisuals();
        if (isImmersive()) {
            startVisuals();
            if (isPlaying()) prepareAudio();
        }
        onChange?.(skin);
    }

    function hasSameOriginAudio() {
        if (!audio || audio.srcObject) return false;
        // Prefer src: currentSrc can still refer to the preceding track during a switch.
        const src = audio.getAttribute('src') || audio.currentSrc;
        if (!src) return false;
        try {
            const url = new URL(src, document.baseURI);
            return ['http:', 'https:', 'blob:'].includes(url.protocol) && url.origin === window.location.origin;
        } catch (error) {
            return false;
        }
    }

    function connectAudioGraph() {
        if (mediaSource || graphUnavailable || !isImmersive() || !audioContext || audioContext.state !== 'running' || !hasSameOriginAudio()) return;
        let nextAnalyser = null;
        try {
            nextAnalyser = audioContext.createAnalyser();
            nextAnalyser.fftSize = 1024;
            // Preserve attacks for onset detection; the visual envelope is smoothed separately.
            nextAnalyser.smoothingTimeConstant = 0.32;
            nextAnalyser.minDecibels = -85;
            nextAnalyser.maxDecibels = -20;
            nextAnalyser.connect(audioContext.destination);
            mediaSource = audioContext.createMediaElementSource(audio);
            mediaSource.connect(nextAnalyser);
            analyser = nextAnalyser;
            frequencyData = new Uint8Array(analyser.frequencyBinCount);
        } catch (error) {
            graphUnavailable = true;
            // Once a media source exists, always retain an audible destination.
            if (mediaSource) {
                try {
                    mediaSource.disconnect();
                    mediaSource.connect(audioContext.destination);
                } catch (connectionError) {
                    // No new graph or second MediaElementSource will be attempted.
                }
            }
            nextAnalyser?.disconnect();
            analyser = null;
            frequencyData = null;
        }
    }

    function prepareAudio() {
        if (!initialized) return;
        startVisuals();
        // A selected skin can animate its quiet field before playback, but it
        // must never open/resume an audio context merely to draw that field.
        if (!isPlaying()) return;
        // An existing graph must also be resumable after returning to the original skin.
        if (!mediaSource && (!isImmersive() || graphUnavailable || reducedMotion?.matches || !hasSameOriginAudio())) return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        try {
            if (!audioContext) {
                audioContext = new AudioContextClass();
                audioContext.addEventListener('statechange', () => {
                    if (audioContext.state === 'running') {
                        connectAudioGraph();
                        startVisuals();
                    } else {
                        stopVisuals();
                        startVisuals();
                    }
                });
            }
            if (audioContext.state === 'running') {
                connectAudioGraph();
                startVisuals();
                return;
            }
            if (resumePending || audioContext.state === 'closed') return;
            resumePending = true;
            // Call resume synchronously within the user's gesture, but never delay audio.play().
            Promise.resolve(audioContext.resume()).then(() => {
                resumePending = false;
                connectAudioGraph();
                startVisuals();
            }).catch(() => {
                resumePending = false;
                stopVisuals();
                startVisuals();
            });
        } catch (error) {
            resumePending = false;
            stopVisuals();
            startVisuals();
        }
    }

    function canAnimate() {
        return isImmersive() && !document.hidden && !reducedMotion?.matches && !visualContextLost
            && typeof window.DeanPulseVisuals?.draw === 'function'
            && window.DeanPulseVisuals.getDiagnostics?.().renderer !== 'static';
    }

    function canAnalyse() {
        return isPlaying() && !audio.seeking && !awaitingAudioData
            && analyser && audioContext?.state === 'running' && hasSameOriginAudio();
    }

    function setPulseLevel(value) {
        document.body.style.setProperty('--pulse-level', value.toFixed(4));
    }

    function resetDetector() {
        smoothLevel = smoothBass = smoothMid = smoothTreble = impact = 0;
        targetBass = targetMid = targetTreble = targetEnergy = 0;
        lastAnalysisTime = nextAnalysisTime = 0;
        previousSpectrum = null;
        previousBass = fluxBaseline = fluxDeviation = energyBaseline = 0;
        detectorReadyAt = 0;
        lastBeatTime = -Infinity;
    }

    function sampleBand(low, high, binWidth) {
        const first = Math.max(1, Math.ceil(low / binWidth));
        const last = Math.min(frequencyData.length - 1, Math.floor(high / binWidth));
        let magnitude = 0;
        let flux = 0;
        for (let index = first; index <= last; index++) {
            const value = frequencyData[index] / 255;
            magnitude += value;
            if (previousSpectrum) flux += Math.max(0, value - previousSpectrum[index] / 255);
        }
        const count = Math.max(1, last - first + 1);
        return { energy: Math.pow(magnitude / count, 1.5), flux: flux / count };
    }

    function followEnvelope(previous, target, elapsed, attack, release) {
        const timeConstant = target > previous ? attack : release;
        return previous + (target - previous) * (1 - Math.exp(-elapsed / timeConstant));
    }

    function analyseSpectrum(now, delta) {
        const elapsed = Math.min(delta, 100);
        const binWidth = audioContext.sampleRate / analyser.fftSize;
        const low = sampleBand(40, 250, binWidth);
        const middle = sampleBand(250, 2400, binWidth);
        const high = sampleBand(2400, 10000, binWidth);
        const energy = low.energy * 0.52 + middle.energy * 0.34 + high.energy * 0.14;
        // Positive spectral change detects a drum/vocal attack, not sustained loudness.
        const flux = low.flux * 0.52 + middle.flux * 0.34 + high.flux * 0.14;
        const bassRise = Math.max(0, low.energy - previousBass);
        let beat = 0;
        if (!previousSpectrum) {
            previousSpectrum = new Uint8Array(frequencyData.length);
            energyBaseline = energy;
            detectorReadyAt = now + DETECTOR_WARMUP;
        } else {
            const threshold = Math.max(0.014, fluxBaseline * 1.8 + fluxDeviation * 0.8);
            if (now >= detectorReadyAt && now - lastBeatTime >= BEAT_COOLDOWN
                && energy > 0.035 && flux > threshold && (bassRise > 0.012 || flux > 0.025)) {
                // Absolute attack energy retains the difference between a quiet accent and a kick.
                beat = Math.min(1, Math.max(0.025,
                    flux * 1.35 + Math.max(0, energy - energyBaseline) * 0.45 + bassRise * 0.24));
                lastBeatTime = now;
            }
            const adaptation = 1 - Math.exp(-elapsed / 1100);
            fluxDeviation += (Math.abs(flux - fluxBaseline) - fluxDeviation) * adaptation;
            fluxBaseline += (flux - fluxBaseline) * adaptation;
            energyBaseline += (energy - energyBaseline) * (1 - Math.exp(-elapsed / 750));
        }
        previousSpectrum.set(frequencyData);
        previousBass = low.energy;
        targetBass = low.energy;
        targetMid = middle.energy;
        targetTreble = high.energy;
        targetEnergy = energy;
        return beat;
    }

    function drawFrame(now, delta, beat) {
        const elapsed = Math.min(delta, 100);
        smoothBass = followEnvelope(smoothBass, targetBass, elapsed, 40, 200);
        smoothMid = followEnvelope(smoothMid, targetMid, elapsed, 55, 240);
        smoothTreble = followEnvelope(smoothTreble, targetTreble, elapsed, 30, 160);
        smoothLevel = followEnvelope(smoothLevel, targetEnergy, elapsed, 65, 300);
        // Immediate attack and ~300 ms visible release; silence never creates a beat.
        impact = Math.max(beat, impact * Math.exp(-elapsed / 135));
        if (impact < 0.001) impact = 0;
        setPulseLevel(smoothLevel);
        document.body.style.setProperty('--pulse-impact', impact.toFixed(4));
        window.DeanPulseVisuals?.draw?.({
            now, delta, bass: smoothBass, mid: smoothMid, treble: smoothTreble,
            energy: smoothLevel, beat, impact, spectrum: frequencyData,
            binWidth: audioContext.sampleRate / analyser.fftSize
        });
    }

    function stopVisuals() {
        if (visualRestoreTimer !== null) clearTimeout(visualRestoreTimer);
        visualRestoreTimer = null;
        if (visualFrame !== null) cancelAnimationFrame(visualFrame);
        visualFrame = null;
        lastFrameTime = 0;
        analysingAudio = false;
        resetDetector();
        document.body.classList.remove('is-audio-reactive');
        setPulseLevel(0);
        document.body.style.setProperty('--pulse-impact', '0');
        window.DeanPulseVisuals?.reset?.();
        // Do not suspend or disconnect the context: the same audio keeps playing in every skin.
    }

    function startVisuals() {
        if (isImmersive() && !document.hidden && !reducedMotion?.matches && !visualContextLost
            && window.DeanPulseVisuals?.getDiagnostics?.().renderer === 'static') {
            // A hidden/reduced-motion initial load may not have allocated a
            // renderer yet. Try once here, never in a self-sustaining RAF loop.
            window.DeanPulseVisuals?.reset?.();
        }
        if (!canAnimate()) {
            stopVisuals();
            return;
        }
        if (visualFrame !== null) return;
        const renderFrame = now => {
            visualFrame = null;
            if (!canAnimate()) {
                stopVisuals();
                return;
            }
            const elapsed = lastFrameTime ? now - lastFrameTime : ANALYSIS_INTERVAL;
            lastFrameTime = now;
            if (!canAnalyse()) {
                // The same display loop draws a non-musical, zero-energy base
                // flow while paused, buffering, seeking, or awaiting the graph.
                if (analysingAudio) {
                    resetDetector();
                    window.DeanPulseVisuals?.reset?.();
                }
                analysingAudio = false;
                document.body.classList.remove('is-audio-reactive');
                setPulseLevel(0);
                document.body.style.setProperty('--pulse-impact', '0');
                window.DeanPulseVisuals.draw({
                    ambient: true, now, delta: elapsed,
                    bass: 0, mid: 0, treble: 0, energy: 0, beat: 0, impact: 0
                });
                if (canAnimate()) visualFrame = requestAnimationFrame(renderFrame);
                else stopVisuals();
                return;
            }
            analysingAudio = true;
            document.body.classList.add('is-audio-reactive');
            let beat = 0;
            // Analyze at a stable ~60 Hz cadence, independently of a 60/90/120 Hz
            // display. Each onset is delivered once; intermediate display frames
            // continue the time-based band envelopes and impact decay.
            if (!nextAnalysisTime || now >= nextAnalysisTime - 0.5) {
                const analysisElapsed = lastAnalysisTime ? now - lastAnalysisTime : ANALYSIS_INTERVAL;
                lastAnalysisTime = now;
                if (!nextAnalysisTime) nextAnalysisTime = now;
                const missedIntervals = Math.max(1, Math.floor((now - nextAnalysisTime) / ANALYSIS_INTERVAL) + 1);
                nextAnalysisTime += missedIntervals * ANALYSIS_INTERVAL;
                analyser.getByteFrequencyData(frequencyData);
                beat = analyseSpectrum(now, analysisElapsed);
            }
            // Never cap visual motion to the FFT cadence: draw on every rAF.
            drawFrame(now, elapsed, beat);
            if (canAnimate()) visualFrame = requestAnimationFrame(renderFrame);
            else stopVisuals();
        };
        visualFrame = requestAnimationFrame(renderFrame);
    }

    function fullscreenElement() {
        return document.fullscreenElement || document.webkitFullscreenElement || null;
    }

    function fullscreenRequest() {
        // Keep the actual player and all its controls in one native fullscreen
        // surface, including hosts that expose only the prefixed WebKit API.
        const target = document.body;
        if (typeof target.requestFullscreen === 'function' && document.fullscreenEnabled !== false) {
            return { target, method: target.requestFullscreen };
        }
        if (typeof target.webkitRequestFullscreen === 'function' && document.webkitFullscreenEnabled !== false) {
            return { target, method: target.webkitRequestFullscreen };
        }
        return null;
    }

    function updateFullscreenButton() {
        const active = Boolean(fullscreenElement());
        document.body.classList.toggle('is-player-fullscreen', active);
        const closeLabel = active ? '关闭播放器并返回音乐列表' : '返回音乐列表';
        closeButton?.setAttribute('aria-label', closeLabel);
        closeButton?.setAttribute('title', closeLabel);
        if (!fullscreenButton) return;
        const label = active ? '退出全屏' : '进入全屏';
        fullscreenButton.hidden = !active && !fullscreenRequest();
        fullscreenButton.setAttribute('aria-pressed', String(active));
        fullscreenButton.setAttribute('aria-label', label);
        fullscreenButton.setAttribute('title', label);
    }

    async function waitForFullscreen(operation) {
        // Some embedded hosts leave native transition promises unresolved.
        // Never let one trap the exit control or delay X navigation indefinitely.
        let timeout;
        try {
            await Promise.race([
                Promise.resolve(operation).catch(() => {}),
                new Promise(resolve => { timeout = setTimeout(resolve, FULLSCREEN_WAIT_LIMIT); })
            ]);
        } finally {
            clearTimeout(timeout);
        }
    }

    async function exitFullscreen() {
        if (!fullscreenElement()) return;
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        try {
            await waitForFullscreen(exit?.call(document));
        } catch (error) {
            // A host may already be leaving native fullscreen. Navigation and
            // skin changes must still remain usable when its promise rejects.
        }
        updateFullscreenButton();
        wakeControls();
    }

    function fullscreenChanged() {
        fullscreenPending = false;
        swallowTouchClickUntil = 0;
        updateFullscreenButton();
        wakeControls();
        onChange?.(document.body.dataset.playerSkin);
    }

    async function toggleFullscreen() {
        if (fullscreenPending) return;
        const operation = ++fullscreenOperation;
        wakeControls();
        fullscreenPending = true;
        try {
            if (fullscreenElement()) await exitFullscreen();
            else {
                const request = fullscreenRequest();
                await waitForFullscreen(request?.method.call(request.target));
            }
        } catch (error) {
            // Fullscreen is optional (for example, an embedded preview may disallow it).
        } finally {
            if (operation === fullscreenOperation) fullscreenPending = false;
            updateFullscreenButton();
            wakeControls();
        }
    }

    function bindActivity() {
        document.addEventListener('pointermove', () => {
            if (isImmersive()) wakeControls();
        }, { passive: true });
        document.addEventListener('pointerdown', event => {
            keyboardNavigation = false;
            if (!isImmersive()) return;
            const wasIdle = document.body.classList.contains('is-idle');
            wakeControls();
            if (wasIdle && event.pointerType !== 'mouse' && !isFullscreenEscapeTarget(event.target)) {
                swallowTouchClickUntil = performance.now() + 800;
                event.preventDefault();
                event.stopPropagation();
            } else {
                swallowTouchClickUntil = 0;
            }
            if (isPlaying()) prepareAudio();
        }, { capture: true, passive: false });
        document.addEventListener('touchstart', () => {
            if (isImmersive()) wakeControls();
        }, { passive: true });
        document.addEventListener('wheel', () => {
            if (isImmersive()) wakeControls();
        }, { passive: true });
        document.addEventListener('click', event => {
            if (performance.now() < swallowTouchClickUntil && !isFullscreenEscapeTarget(event.target)) {
                swallowTouchClickUntil = 0;
                event.preventDefault();
                event.stopImmediatePropagation();
                return;
            }
            swallowTouchClickUntil = 0;
            if (isMenuOpen() && !menu.contains(event.target) && !toggle.contains(event.target)) setMenuOpen(false);
        }, true);
        document.addEventListener('keydown', event => {
            keyboardNavigation = true;
            if (event.key === 'Escape' && isMenuOpen()) {
                setMenuOpen(false);
                toggle.focus();
            }
            if (isImmersive()) wakeControls();
        });
        document.addEventListener('focusin', () => {
            if (isImmersive() && !document.body.classList.contains('is-idle')) wakeControls();
        });
        document.addEventListener('focusout', () => {
            // Applying inert blurs a mouse-focused button. That generated blur
            // must not immediately undo the idle state we have just entered.
            if (!isImmersive() || document.body.classList.contains('is-idle')) return;
            queueMicrotask(() => {
                if (!document.body.classList.contains('is-idle')) wakeControls();
            });
        });
    }

    function init(options = {}) {
        if (initialized || !options.audio) return;
        initialized = true;
        audio = options.audio;
        onChange = typeof options.onChange === 'function' ? options.onChange : null;
        toggle = document.getElementById('skin-toggle');
        menu = document.getElementById('skin-menu');
        fullscreenButton = document.getElementById('btn-fullscreen');
        fullscreenToolbar = fullscreenButton?.closest('.player-chrome') || null;
        closeButton = document.getElementById('btn-close');

        toggle?.addEventListener('click', () => setMenuOpen(!isMenuOpen()));
        document.querySelectorAll('[data-skin-option]').forEach(button => {
            button.addEventListener('click', () => {
                applySkin(button.dataset.skinOption, true);
                if (keyboardNavigation) toggle?.focus();
            });
        });
        fullscreenButton?.addEventListener('click', toggleFullscreen);
        document.addEventListener('fullscreenchange', fullscreenChanged);
        document.addEventListener('webkitfullscreenchange', fullscreenChanged);
        document.addEventListener('fullscreenerror', fullscreenChanged);
        document.addEventListener('webkitfullscreenerror', fullscreenChanged);

        ['play', 'playing'].forEach(name => audio.addEventListener(name, () => {
            if (name === 'playing') awaitingAudioData = false;
            if (isImmersive() || mediaSource) prepareAudio();
            wakeControls();
        }));
        ['pause', 'ended', 'emptied', 'error'].forEach(name => audio.addEventListener(name, () => {
            awaitingAudioData = true;
            stopVisuals();
            startVisuals();
            wakeControls();
        }));
        ['loadstart', 'waiting'].forEach(name => audio.addEventListener(name, () => {
            awaitingAudioData = true;
            stopVisuals();
            startVisuals();
            wakeControls();
        }));
        audio.addEventListener('seeking', () => {
            stopVisuals();
            startVisuals();
        });
        audio.addEventListener('seeked', () => {
            awaitingAudioData = false;
            if ((isImmersive() || mediaSource) && isPlaying()) prepareAudio();
            else startVisuals();
        });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) stopVisuals();
            else if ((isImmersive() || mediaSource) && isPlaying()) prepareAudio();
            else startVisuals();
            wakeControls();
        });
        reducedMotion?.addEventListener('change', () => {
            if (reducedMotion.matches) stopVisuals();
            else if (isImmersive() && isPlaying()) prepareAudio();
            else {
                // Reduced motion may have prevented the first GPU allocation.
                window.DeanPulseVisuals?.reset?.();
                startVisuals();
            }
        });
        const visualCanvas = document.getElementById('pulse-canvas');
        visualCanvas?.addEventListener('webglcontextlost', event => {
            event.preventDefault();
            visualContextLost = true;
            stopVisuals();
        });
        visualCanvas?.addEventListener('webglcontextrestored', () => {
            visualContextLost = false;
            if (visualRestoreTimer !== null) clearTimeout(visualRestoreTimer);
            // Native events can run a microtask checkpoint between listeners.
            // Wait one task (not a microtask) for the renderer's later listener
            // to rebuild its program; lifecycle teardown can cancel this retry.
            visualRestoreTimer = setTimeout(() => {
                visualRestoreTimer = null;
                startVisuals();
            }, 0);
        });
        bindActivity();
        updateFullscreenButton();

        let savedSkin = 'original';
        try {
            savedSkin = window.localStorage.getItem(STORAGE_KEY) || 'original';
        } catch (error) {
            // A skin preference is optional; playback never depends on storage access.
        }
        applySkin(savedSkin);
    }

    window.DeanPlayerSkin = { init, isImmersive, prepareAudio, setCover, exitFullscreen };
})();
