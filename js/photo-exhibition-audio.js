(() => {
    window.createPhotoGalleryMusic = ({ audio, button }) => {
        const INTRO_VOLUME = .10, GALLERY_VOLUME = .24, FADE_MS = 2600;
        let phase = 'off', enabled = true, request = 0, frame = 0;
        const canPlay = () => enabled && phase !== 'off' && !document.hidden;
        const targetVolume = () => phase === 'intro' ? INTRO_VOLUME : GALLERY_VOLUME;
        function updateButton() {
            const playing = canPlay() && !audio.paused && !audio.ended;
            button.textContent = playing ? '♫ 音乐已开启' : '♫ 开启音乐';
            button.setAttribute('aria-pressed', String(playing));
            button.title = playing ? '关闭背景音乐' : '播放展厅背景音乐';
        }
        function cancelFade() { cancelAnimationFrame(frame); frame = 0; }
        function fadeToLevel() {
            cancelFade();
            const from = audio.volume, to = targetVolume();
            if (phase === 'intro' || Math.abs(from - to) < .001) { audio.volume = to; return; }
            const start = performance.now();
            function tick(now) {
                frame = 0;
                if (!canPlay() || audio.paused) return;
                const t = Math.min(1, Math.max(0, (now - start) / FADE_MS));
                const eased = t * t * (3 - 2 * t);
                audio.volume = from + (to - from) * eased;
                if (t < 1) frame = requestAnimationFrame(tick);
            }
            frame = requestAnimationFrame(tick);
        }
        function pause() {
            request++; cancelFade(); audio.pause(); updateButton();
        }
        function stop(reset = true) {
            phase = 'off'; pause();
            if (reset) audio.currentTime = 0;
            audio.volume = INTRO_VOLUME;
        }
        function play() {
            if (!canPlay()) return;
            const attempt = ++request;
            // Called synchronously from the entrance gesture to unlock music
            // alongside narration; the same media element continues into the hall.
            audio.play().then(() => {
                if (attempt !== request) { if (!canPlay()) audio.pause(); return; }
                if (!canPlay()) { pause(); return; }
                fadeToLevel(); updateButton();
            }).catch(() => {
                if (attempt !== request || !canPlay()) return;
                cancelFade(); updateButton();
                button.textContent = audio.error ? '♫ 音乐暂不可用' : '♫ 点击开启音乐';
            });
        }
        button.addEventListener('click', () => {
            if (!audio.paused) { enabled = false; pause(); }
            else { enabled = true; play(); }
        });
        audio.addEventListener('play', () => {
            if (!canPlay()) audio.pause();
            updateButton();
        });
        audio.addEventListener('pause', updateButton);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) pause(); else play();
        });
        audio.volume = INTRO_VOLUME;
        return {
            beginIntro() { stop(); phase = 'intro'; play(); },
            enterGallery() { phase = 'gallery'; play(); },
            retry: play,
            stop
        };
    };
})();
