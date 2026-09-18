(() => {
    'use strict';

    const STORAGE_KEY = 'dean-player-skin';
    const IDLE_DELAY = 5000;
    const FRAME_INTERVAL = 1000 / 30;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let audio = null;
    let onChange = null;
    let initialized = false;
    let toggle = null;
    let menu = null;
    let fullscreenButton = null;
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
    let lastFrameTime = 0;
    let smoothLevel = 0;
    let paletteRequest = 0;

    function setPalette(hue = 218, saturation = 64) {
        document.body.style.setProperty('--pulse-hue', String(Math.round(hue)));
        document.body.style.setProperty('--pulse-saturation', `${Math.round(saturation)}%`);
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
        document.querySelectorAll('.player-chrome').forEach(element => {
            element.inert = idle;
        });
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
        if (isImmersive() && isPlaying()) prepareAudio();
        else stopVisuals();
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
            nextAnalyser.smoothingTimeConstant = 0.76;
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
            });
        } catch (error) {
            resumePending = false;
            stopVisuals();
        }
    }

    function canAnimate() {
        return isImmersive() && isPlaying() && !document.hidden && !reducedMotion?.matches
            && analyser && audioContext?.state === 'running' && hasSameOriginAudio();
    }

    function setPulseLevel(value) {
        document.body.style.setProperty('--pulse-level', value.toFixed(4));
    }

    function stopVisuals() {
        if (visualFrame !== null) cancelAnimationFrame(visualFrame);
        visualFrame = null;
        lastFrameTime = 0;
        smoothLevel = 0;
        document.body.classList.remove('is-audio-reactive');
        setPulseLevel(0);
        // Do not suspend or disconnect the context: the same audio keeps playing in every skin.
    }

    function startVisuals() {
        if (!canAnimate()) {
            stopVisuals();
            return;
        }
        if (visualFrame !== null) return;
        document.body.classList.add('is-audio-reactive');
        const renderFrame = now => {
            visualFrame = null;
            if (!canAnimate()) {
                stopVisuals();
                return;
            }
            const elapsed = lastFrameTime ? now - lastFrameTime : FRAME_INTERVAL;
            if (elapsed >= FRAME_INTERVAL - 1) {
                lastFrameTime = now;
                analyser.getByteFrequencyData(frequencyData);
                const binWidth = audioContext.sampleRate / analyser.fftSize;
                const firstBin = Math.max(1, Math.floor(40 / binWidth));
                const lastBin = Math.min(frequencyData.length - 1, Math.ceil(220 / binWidth));
                let bass = 0;
                for (let index = firstBin; index <= lastBin; index++) bass += frequencyData[index] / 255;
                const target = Math.pow(bass / Math.max(1, lastBin - firstBin + 1), 1.65);
                // Real bass energy, with a gentle rise and a longer release; no synthetic beat clock.
                const timeConstant = target > smoothLevel ? 180 : 650;
                const smoothing = 1 - Math.exp(-Math.min(elapsed, 100) / timeConstant);
                smoothLevel += (target - smoothLevel) * smoothing;
                setPulseLevel(Math.min(1, Math.max(0, smoothLevel)));
            }
            visualFrame = requestAnimationFrame(renderFrame);
        };
        visualFrame = requestAnimationFrame(renderFrame);
    }

    function updateFullscreenButton() {
        if (!fullscreenButton) return;
        const supported = typeof document.documentElement.requestFullscreen === 'function'
            && document.fullscreenEnabled !== false;
        fullscreenButton.hidden = !supported;
        fullscreenButton.setAttribute('aria-pressed', String(Boolean(document.fullscreenElement)));
        fullscreenButton.setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '进入全屏');
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
            if (wasIdle && event.pointerType !== 'mouse') {
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
            if (performance.now() < swallowTouchClickUntil) {
                swallowTouchClickUntil = 0;
                event.preventDefault();
                event.stopImmediatePropagation();
                return;
            }
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

        toggle?.addEventListener('click', () => setMenuOpen(!isMenuOpen()));
        document.querySelectorAll('[data-skin-option]').forEach(button => {
            button.addEventListener('click', () => {
                applySkin(button.dataset.skinOption, true);
                if (keyboardNavigation) toggle?.focus();
            });
        });
        fullscreenButton?.addEventListener('click', () => {
            wakeControls();
            const request = document.fullscreenElement
                ? document.exitFullscreen?.()
                : document.documentElement.requestFullscreen?.();
            Promise.resolve(request).catch(() => {
                // Fullscreen is optional (for example, an embedded preview may disallow it).
            });
        });
        document.addEventListener('fullscreenchange', () => {
            updateFullscreenButton();
            wakeControls();
            onChange?.(document.body.dataset.playerSkin);
        });

        ['play', 'playing'].forEach(name => audio.addEventListener(name, () => {
            if (isImmersive() || mediaSource) prepareAudio();
            wakeControls();
        }));
        ['pause', 'ended', 'emptied', 'error'].forEach(name => audio.addEventListener(name, () => {
            stopVisuals();
            wakeControls();
        }));
        audio.addEventListener('loadstart', () => {
            stopVisuals();
            wakeControls();
        });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) stopVisuals();
            else if ((isImmersive() || mediaSource) && isPlaying()) prepareAudio();
            wakeControls();
        });
        reducedMotion?.addEventListener('change', () => {
            if (reducedMotion.matches) stopVisuals();
            else if (isImmersive() && isPlaying()) prepareAudio();
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

    window.DeanPlayerSkin = { init, isImmersive, prepareAudio, setCover };
})();
