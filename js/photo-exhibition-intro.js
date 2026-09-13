(() => {
    window.createPhotoGalleryIntro = ({ onStart, onCancel, onRetry } = {}) => {
        const dialog = document.getElementById('photo-gallery-intro');
        const audio = document.getElementById('photo-gallery-intro-audio');
        const status = dialog.querySelector('.photo-intro-status');
        const progress = dialog.querySelector('.photo-intro-progress span');
        const retry = dialog.querySelector('.photo-intro-play');
        let enter = null, request = 0, savedOverflow = '', watchdog = 0, resume = false, pendingEnd = false;
        audio.volume = .85;
        function stop() { request++; clearTimeout(watchdog); audio.pause(); audio.currentTime = 0; resume = false; pendingEnd = false; }
        function finish() {
            if (!dialog.open) return;
            if (document.hidden) { pendingEnd = true; return; }
            const next = enter; enter = null;
            stop(); dialog.close();
            document.body.style.overflow = savedOverflow;
            next?.();
        }
        function play() {
            if (!dialog.open || document.hidden) return;
            const attempt = ++request;
            retry.hidden = true; status.textContent = '请稍候，正在为你打开光影之门…';
            audio.play().then(() => {
                if (attempt !== request) return;
                status.textContent = '开场音频播放完毕后，将自动进入展览';
                clearTimeout(watchdog);
            }).catch(() => {
                if (attempt !== request || !dialog.open) return;
                retry.hidden = false; status.textContent = '点击播放开场音频，或直接进入展览';
            });
            clearTimeout(watchdog);
            watchdog = setTimeout(() => {
                if (dialog.open && audio.paused) {
                    retry.hidden = false; status.textContent = '音频加载较慢，可重试或跳过进入';
                }
            }, 15000);
        }
        audio.addEventListener('ended', finish);
        audio.addEventListener('timeupdate', () => {
            progress.style.transform = `scaleX(${audio.duration > 0 ? Math.min(1, audio.currentTime / audio.duration) : 0})`;
        });
        audio.addEventListener('error', () => {
            if (!dialog.open) return;
            retry.hidden = false; status.textContent = '开场音频暂不可用，可直接进入展览';
        });
        retry.addEventListener('click', () => { onRetry?.(); if (audio.error) audio.load(); play(); });
        dialog.querySelector('.photo-intro-skip').addEventListener('click', finish);
        dialog.querySelector('.photo-intro-close').addEventListener('click', () => dialog.close());
        dialog.addEventListener('close', () => {
            // finish() clears enter before opening the exhibition. Its queued
            // close event must not restore scrolling over the newly opened gallery.
            if (enter) { document.body.style.overflow = savedOverflow; enter = null; onCancel?.(); }
            stop();
        });
        document.addEventListener('visibilitychange', () => {
            if (!dialog.open) return;
            if (document.hidden) { resume = !audio.paused; request++; audio.pause(); }
            else if (pendingEnd) finish();
            else if (resume) { resume = false; play(); }
        });
        return {
            get open() { return dialog.open; },
            begin(callback) {
                if (dialog.open) return;
                enter = callback; savedOverflow = document.body.style.overflow;
                document.body.style.overflow = 'hidden';
                audio.currentTime = 0; progress.style.transform = 'scaleX(0)';
                dialog.showModal(); onStart?.(); play();
                dialog.querySelector('.photo-intro-skip').focus({ preventScroll: true });
            }
        };
    };
})();
