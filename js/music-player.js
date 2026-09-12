document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const songPathMatch = window.location.pathname.match(/^\/song\/([^/]+)\/?$/);
    const initialId = urlParams.get('id') || (songPathMatch ? decodeURIComponent(songPathMatch[1]) : null);

    let songs = [];
    let currentIndex = 0;
    let currentVersionIndex = 0;
    let isPlaying = false;
    let lyrics = [];
    let lyricsHaveTimestamps = false;
    let activeLyricIndex = -1;
    let lyricScrollIndex = -1;
    let lyricFollowSuspendedUntil = 0;
    let lyricAnimationFrameId = null;
    let lyricScrollAnimationFrameId = null;
    let lyricsRequestId = 0;
    const LYRIC_SCROLL_LEAD_SECONDS = 0.28;
    const LYRIC_SCROLL_DURATION_MS = 240;
    const reduceMotionQuery = window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;

    const elements = {
        audio: document.getElementById('audio-element'),
        playBtn: document.getElementById('btn-toggle'),
        prevBtn: document.getElementById('btn-prev'),
        nextBtn: document.getElementById('btn-next'),
        title: document.getElementById('track-title'),
        artist: document.getElementById('track-artist'),
        blurBg: document.getElementById('cover-blur'),
        bgContainer: document.getElementById('bg-container'),
        starsContainer: document.getElementById('stars-container'),
        carousel: document.getElementById('carousel-deck'),
        orbitPath: document.getElementById('progress-orbit'),
        orbitDot: document.getElementById('orbit-dot'),
        timeCurr: document.getElementById('time-current'),
        timeTotal: document.getElementById('time-total'),
        slider: document.getElementById('progress-slider'),
        lyricsBox: document.getElementById('lyrics-display'),
        playerBody: document.body,
        versionStrip: document.getElementById('version-strip')
    };

    // Keep the catalogue cacheable so repeat H5 visits do not refetch it.
    fetch('assets/data/music.json')
        .then(res => res.json())
        .then(data => {
            songs = getVisibleResources(data);
            if (songs.length === 0) return;

            currentIndex = songs.findIndex(s => s.id === initialId);
            if (initialId && currentIndex === -1) {
                elements.title.textContent = '音乐未找到';
                elements.artist.textContent = '这条资源已下线或不存在';
                return;
            }
            if (currentIndex === -1) currentIndex = 0;

            initPlayer();
        });

    function initPlayer() {
        createStars();
        renderCarousel();

        // Listeners
        elements.playBtn.addEventListener('click', togglePlay);
        elements.nextBtn.addEventListener('click', () => nextTrack());
        elements.prevBtn.addEventListener('click', () => prevTrack());
        bindVersionStripScroll();
        bindLyricsInteraction();

        elements.audio.addEventListener('timeupdate', () => updateProgress());
        elements.audio.addEventListener('seeking', () => updateProgress(true));
        elements.audio.addEventListener('seeked', () => updateProgress(true));
        elements.audio.addEventListener('loadedmetadata', updateDuration);
        elements.audio.addEventListener('durationchange', updateDuration);
        elements.audio.addEventListener('play', () => setPlayingState(true));
        elements.audio.addEventListener('pause', () => setPlayingState(false));
        elements.audio.addEventListener('ended', () => nextTrack());

        elements.slider.addEventListener('input', (e) => {
            if (elements.audio.duration) {
                elements.audio.currentTime = (e.target.value / 100) * elements.audio.duration;
                updateProgress(true);
            }
        });

        loadTrack(currentIndex, true);
    }

    function createStars() {
        if (!elements.starsContainer) return;
        elements.starsContainer.innerHTML = '';
        const isCompact = window.matchMedia('(max-width: 600px)').matches;
        const hasLowMemory = navigator.deviceMemory && navigator.deviceMemory <= 4;
        const count = isCompact ? (hasLowMemory ? 6 : 10) : (hasLowMemory ? 80 : 140);
        const colors = ['#ffffff', '#cce0ff', '#ffe8cc', '#e6f2ff']; // White, blueish, yellowish
        const fragment = document.createDocumentFragment();

        for (let i = 0; i < count; i++) {
            const star = document.createElement('div');
            star.className = 'star';

            // Randomize styling properties
            const size = Math.random() * 2.5 + 0.5;

            // Create a Milky Way distribution bias (cluster towards the center Y axis)
            let topPosition;
            if (Math.random() > 0.4) {
                // 60% of stars cluster in the middle 40% height
                topPosition = 30 + (Math.random() * 40);
            } else {
                // 40% scatter everywhere
                topPosition = Math.random() * 100;
            }

            star.style.width = `${size}px`;
            star.style.height = `${size}px`;
            star.style.left = `${Math.random() * 100}%`;
            star.style.top = `${topPosition}%`;

            // Add slight color variations
            const color = colors[Math.floor(Math.random() * colors.length)];
            star.style.background = color;
            if (!isCompact) star.style.boxShadow = `0 0 ${size * 2}px ${color}`;

            star.style.setProperty('--size', `${size}px`);
            star.style.setProperty('--base-opacity', Math.random() * 0.6 + 0.1);
            star.style.setProperty('--duration', `${Math.random() * 4 + 2}s`);
            star.style.animationDelay = `${Math.random() * 5}s`;

            fragment.appendChild(star);
        }

        elements.starsContainer.appendChild(fragment);
    }

    async function loadTrack(index, initial = false) {
        const song = songs[index];
        currentVersionIndex = 0;
        const songPath = `/song/${encodeURIComponent(song.id)}`;
        if (window.location.pathname !== songPath && window.history?.replaceState) {
            window.history.replaceState(null, '', songPath);
        }
        elements.title.textContent = song.title;
        elements.artist.textContent = song.artist || 'Unknown Artist';
        elements.blurBg.style.backgroundImage = `url(${song.cover})`;
        elements.audio.src = getSongVersions(song)[currentVersionIndex]?.url || song.url || '';

        if (window.DeanShare) {
            window.DeanShare.configureTrack(song);
        }

        updateCarouselUI();
        renderVersionStrip(song);
        loadLyrics(song);

        if (!initial) {
            playAudio();
        } else {
            // WeChat and iOS block autoplay. Begin paused so the control and
            // visual state always agree with the actual audio element.
            setPlayingState(false);
        }
    }

    function renderVersionStrip(song) {
        if (!elements.versionStrip) return;

        const versions = getSongVersions(song);
        if (versions.length <= 1) {
            elements.versionStrip.classList.add('is-hidden');
            elements.versionStrip.classList.remove('is-overflowing');
            elements.versionStrip.innerHTML = '';
            return;
        }

        elements.versionStrip.classList.remove('is-hidden');
        elements.versionStrip.innerHTML = '';
        versions.forEach((version, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `version-btn${index === currentVersionIndex ? ' is-active' : ''}`;
            button.textContent = version.label || `版本${index + 1}`;
            button.dataset.versionIndex = index;
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                selectVersion(index);
            });
            elements.versionStrip.appendChild(button);
        });
        requestAnimationFrame(updateVersionStripOverflow);
    }

    function selectVersion(index) {
        const song = songs[currentIndex];
        const versions = getSongVersions(song);
        const version = versions[index];
        if (!version || index === currentVersionIndex) return;

        const shouldResume = isPlaying;
        currentVersionIndex = index;
        elements.audio.src = version.url;
        elements.audio.currentTime = 0;
        elements.slider.value = 0;
        elements.timeCurr.textContent = '0:00';
        elements.timeTotal.textContent = '0:00';
        updateVersionStripState();
        loadLyrics(song);

        if (shouldResume) {
            playAudio();
        } else {
            isPlaying = false;
            updatePlayState();
        }
    }

    function updateVersionStripState() {
        if (!elements.versionStrip) return;
        elements.versionStrip.querySelectorAll('.version-btn').forEach((button, index) => {
            button.classList.toggle('is-active', index === currentVersionIndex);
        });
        const active = elements.versionStrip.querySelector('.version-btn.is-active');
        if (active && elements.versionStrip.classList.contains('is-overflowing') && typeof active.scrollIntoView === 'function') {
            active.scrollIntoView({ inline: 'nearest', block: 'nearest' });
        }
    }

    function bindVersionStripScroll() {
        if (!elements.versionStrip) return;
        const strip = elements.versionStrip;

        strip.addEventListener('pointerdown', event => {
            event.stopPropagation();
        });
        strip.addEventListener('click', event => {
            event.stopPropagation();
        });

        strip.addEventListener('wheel', event => {
            event.stopPropagation();
            if (strip.scrollWidth <= strip.clientWidth) return;

            const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
                ? event.deltaX
                : event.deltaY;
            if (!delta) return;

            event.preventDefault();
            strip.scrollLeft += delta;
        }, { passive: false });

        window.addEventListener('resize', updateVersionStripOverflow);
    }

    function updateVersionStripOverflow() {
        if (!elements.versionStrip || elements.versionStrip.classList.contains('is-hidden')) return;

        const isOverflowing = elements.versionStrip.scrollWidth > elements.versionStrip.clientWidth + 1;
        elements.versionStrip.classList.toggle('is-overflowing', isOverflowing);
    }

    function renderCarousel() {
        elements.carousel.innerHTML = '';
        songs.forEach((song, i) => {
            const card = document.createElement('div');
            card.className = 'cover-card';
            card.dataset.cover = song.cover;
            card.dataset.index = i;
            card.onclick = () => {
                if (i !== currentIndex) {
                    currentIndex = i;
                    loadTrack(currentIndex);
                } else {
                    togglePlay();
                }
            };
            elements.carousel.appendChild(card);
        });
    }

    function updateCarouselUI() {
        const cards = elements.carousel.querySelectorAll('.cover-card');
        const len = songs.length;

        cards.forEach((card, i) => {
            card.classList.remove('active', 'prev', 'next', 'hidden');

            if (i === currentIndex) {
                card.classList.add('active');
                card.style.backgroundImage = `url(${card.dataset.cover})`;
            } else if (i === (currentIndex - 1 + len) % len) {
                card.classList.add('prev');
                card.style.backgroundImage = `url(${card.dataset.cover})`;
            } else if (i === (currentIndex + 1) % len) {
                card.classList.add('next');
                card.style.backgroundImage = `url(${card.dataset.cover})`;
            } else {
                card.classList.add('hidden');
                card.style.backgroundImage = 'none';
            }
        });
    }

    async function loadLyrics(song) {
        const requestId = ++lyricsRequestId;
        const nextLyrics = [];
        let lrcText = null;
        const catalogTiming = getCatalogLyricTiming(song);

        elements.lyricsBox.innerHTML = '';
        lyricsHaveTimestamps = false;
        activeLyricIndex = -1;
        lyricScrollIndex = -1;
        lyricFollowSuspendedUntil = 0;
        cancelLyricScrollAnimation();

        if (catalogTiming.lines.length > 0) {
            nextLyrics.push(...catalogTiming.lines);
        } else if (!catalogTiming.hasAnyVersion) {
            try {
                const lrcRes = await fetch(`assets/lyrics/${song.id}.lrc`);
                if (lrcRes.ok) lrcText = await lrcRes.text();
            } catch (error) {
                // A missing timed-lyrics file is expected for older tracks.
            }
        }

        if (nextLyrics.length > 0) {
            // The timing saved by the admin is already in lyric order.
        } else if (lrcText) {
            const linePattern = /\[(\d{2}):(\d{2}(?:\.\d{1,3})?)\](.*)/;
            lrcText.split('\n').forEach(line => {
                const match = linePattern.exec(line);
                if (!match) return;

                const time = (parseInt(match[1], 10) * 60) + parseFloat(match[2]);
                const text = match[3].trim();
                if (text) nextLyrics.push({ time, text });
            });
            nextLyrics.sort((a, b) => a.time - b.time);
        } else {
            try {
                if (song.lyricText) {
                    nextLyrics.push(...song.lyricText
                        .split('\n')
                        .filter(line => line.trim())
                        .map(line => ({ text: line, time: null })));
                } else if (song.lyricId) {
                    const res = await fetch('assets/data/lyrics.json');
                    const data = getVisibleResources(await res.json());
                    const entry = data.find(item => item.id === song.lyricId);
                    if (entry && entry.contentPath) {
                        const lyricResponse = await fetch(entry.contentPath);
                        const text = await lyricResponse.text();
                        nextLyrics.push(...text
                            .split('\n')
                            .filter(line => line.trim())
                            .map(line => ({ text: line.replace(/^#+\s*/, '').trim(), time: null })));
                    }
                }
            } catch (error) {
                console.error('Lyrics error', error);
            }
        }

        // Ignore a slow response from a track the user has already left.
        if (requestId !== lyricsRequestId) return;
        if (nextLyrics.length === 0) nextLyrics.push({ text: 'No lyrics available', time: null });
        lyrics = nextLyrics;
        lyricsHaveTimestamps = hasUsableLyricTiming(lyrics);

        const fragment = document.createDocumentFragment();
        lyrics.forEach((line, index) => {
            const item = document.createElement('div');
            item.className = 'lyric-line';
            item.textContent = line.text;
            item.dataset.index = index;
            fragment.appendChild(item);
        });
        elements.lyricsBox.appendChild(fragment);

        requestAnimationFrame(() => updateLyricsDisplay(elements.audio.currentTime || 0, true));
    }

    function bindLyricsInteraction() {
        if (!elements.lyricsBox) return;

        let pointerActive = false;
        const suspendFollow = () => {
            lyricFollowSuspendedUntil = Date.now() + 8000;
            lyricScrollIndex = -1;
            cancelLyricScrollAnimation();
        };

        if ('PointerEvent' in window) {
            elements.lyricsBox.addEventListener('pointerdown', () => {
                pointerActive = true;
                suspendFollow();
            }, { passive: true });
            elements.lyricsBox.addEventListener('pointermove', () => {
                if (pointerActive) suspendFollow();
            }, { passive: true });
            ['pointerup', 'pointercancel'].forEach(eventName => {
                elements.lyricsBox.addEventListener(eventName, () => {
                    pointerActive = false;
                    suspendFollow();
                }, { passive: true });
            });
        } else {
            elements.lyricsBox.addEventListener('touchstart', suspendFollow, { passive: true });
            elements.lyricsBox.addEventListener('touchmove', suspendFollow, { passive: true });
        }

        elements.lyricsBox.addEventListener('wheel', suspendFollow, { passive: true });
    }

    function updateLyricsDisplay(currentTime, force = false) {
        const lines = elements.lyricsBox.children;
        if (!lines.length) return;

        let activeIdx = 0;
        if (lyricsHaveTimestamps) {
            activeIdx = findActiveLyricIndex(currentTime);
        } else if (elements.audio.duration) {
            const ratio = elements.audio.currentTime / elements.audio.duration;
            activeIdx = Math.floor(ratio * lyrics.length);
        }

        activeIdx = Math.max(0, Math.min(activeIdx, lines.length - 1));
        if (force || activeIdx !== activeLyricIndex) {
            activeLyricIndex = activeIdx;

            // The highlight always changes at the exact saved timestamp. Only
            // the scroll position below is allowed to anticipate the next line.
            for (let index = 0; index < lines.length; index++) {
                const line = lines[index];
                line.classList.remove('active', 'near-prev', 'near-next', 'far-prev', 'far-next');
                line.removeAttribute('aria-current');
                if (index === activeIdx) {
                    line.classList.add('active');
                    line.setAttribute('aria-current', 'true');
                } else if (index === activeIdx - 1) {
                    line.classList.add('near-prev');
                } else if (index === activeIdx + 1) {
                    line.classList.add('near-next');
                } else if (index < activeIdx - 1) {
                    line.classList.add('far-prev');
                } else {
                    line.classList.add('far-next');
                }
            }
        }

        let scrollIdx = activeIdx;
        if (!force && isPlaying && lyricsHaveTimestamps && activeIdx < lyrics.length - 1) {
            const nextTime = lyrics[activeIdx + 1].time;
            const timeUntilNext = nextTime - currentTime;
            if (timeUntilNext > 0 && timeUntilNext <= LYRIC_SCROLL_LEAD_SECONDS) {
                scrollIdx = activeIdx + 1;
            }
        }

        // A touch/wheel gesture temporarily owns the lyric position; playback
        // resumes auto-following after the user has finished reading.
        if ((force || Date.now() >= lyricFollowSuspendedUntil)
            && (force || scrollIdx !== lyricScrollIndex)) {
            lyricScrollIndex = scrollIdx;
            const targetLine = lines[scrollIdx];
            const targetTop = targetLine.offsetTop - ((elements.lyricsBox.clientHeight - targetLine.offsetHeight) / 2);
            scrollLyricsTo(Math.max(0, targetTop), force);
        }
    }

    function findActiveLyricIndex(currentTime) {
        let low = 0;
        let high = lyrics.length - 1;
        let activeIdx = 0;

        while (low <= high) {
            const middle = Math.floor((low + high) / 2);
            if (currentTime >= lyrics[middle].time) {
                activeIdx = middle;
                low = middle + 1;
            } else {
                high = middle - 1;
            }
        }

        if (currentTime - lyrics[activeIdx].time < 0.5) {
            while (activeIdx > 0 && lyrics[activeIdx - 1].time === lyrics[activeIdx].time) {
                activeIdx--;
            }
        }

        return activeIdx;
    }

    function scrollLyricsTo(targetTop, immediate = false) {
        cancelLyricScrollAnimation();

        if (immediate || (reduceMotionQuery && reduceMotionQuery.matches)) {
            elements.lyricsBox.scrollTop = targetTop;
            return;
        }

        const startTop = elements.lyricsBox.scrollTop;
        const distance = targetTop - startTop;
        if (Math.abs(distance) < 0.5) {
            elements.lyricsBox.scrollTop = targetTop;
            return;
        }

        const startedAt = performance.now();
        const animateScroll = now => {
            const progress = Math.min(1, (now - startedAt) / LYRIC_SCROLL_DURATION_MS);
            const easedProgress = 1 - Math.pow(1 - progress, 3);
            elements.lyricsBox.scrollTop = startTop + (distance * easedProgress);

            if (progress < 1) {
                lyricScrollAnimationFrameId = requestAnimationFrame(animateScroll);
            } else {
                lyricScrollAnimationFrameId = null;
            }
        };

        lyricScrollAnimationFrameId = requestAnimationFrame(animateScroll);
    }

    function cancelLyricScrollAnimation() {
        if (lyricScrollAnimationFrameId === null) return;
        cancelAnimationFrame(lyricScrollAnimationFrameId);
        lyricScrollAnimationFrameId = null;
    }

    function startLyricSync() {
        if (lyricAnimationFrameId !== null) return;

        const syncLyrics = () => {
            if (elements.audio.paused || elements.audio.ended) {
                lyricAnimationFrameId = null;
                return;
            }

            updateLyricsDisplay(elements.audio.currentTime);
            lyricAnimationFrameId = requestAnimationFrame(syncLyrics);
        };

        lyricAnimationFrameId = requestAnimationFrame(syncLyrics);
    }

    function stopLyricSync() {
        if (lyricAnimationFrameId === null) return;
        cancelAnimationFrame(lyricAnimationFrameId);
        lyricAnimationFrameId = null;
    }

    function togglePlay() {
        if (elements.audio.paused || elements.audio.ended) playAudio();
        else pauseAudio();
    }

    async function playAudio() {
        try {
            await elements.audio.play();
        } catch (error) {
            setPlayingState(false);
            console.warn('Playback could not start:', error);
        }
    }

    function pauseAudio() {
        elements.audio.pause();
    }

    function setPlayingState(nextState) {
        isPlaying = nextState;
        if (isPlaying) {
            startLyricSync();
        } else {
            stopLyricSync();
            cancelLyricScrollAnimation();
            if (Date.now() >= lyricFollowSuspendedUntil) {
                updateLyricsDisplay(elements.audio.currentTime || 0, true);
            }
        }
        updatePlayState();
    }

    function updatePlayState() {
        if (isPlaying) {
            if (elements.playerBody) elements.playerBody.classList.add('is-playing');
            if (elements.bgContainer) elements.bgContainer.classList.add('is-playing');
        } else {
            if (elements.playerBody) elements.playerBody.classList.remove('is-playing');
            if (elements.bgContainer) elements.bgContainer.classList.remove('is-playing');
        }

        elements.playBtn.setAttribute('aria-pressed', String(isPlaying));
        elements.playBtn.setAttribute('aria-label', isPlaying ? '暂停播放' : '开始播放');
    }

    function nextTrack() {
        currentIndex = (currentIndex + 1) % songs.length;
        loadTrack(currentIndex);
    }

    function prevTrack() {
        currentIndex = (currentIndex - 1 + songs.length) % songs.length;
        loadTrack(currentIndex);
    }

    function getCatalogLyricTiming(song) {
        const timingMap = song && song.lyricTimings;
        if (!timingMap || typeof timingMap !== 'object' || Array.isArray(timingMap)) {
            return { lines: [], hasAnyVersion: false };
        }

        const entries = Object.entries(timingMap)
            .filter(([, lines]) => Array.isArray(lines));
        if (entries.length === 0) return { lines: [], hasAnyVersion: false };

        const selectedVersion = getSongVersions(song)[currentVersionIndex];
        const selectedUrl = normalizeAudioUrl(selectedVersion && selectedVersion.url);
        const selectedEntry = entries.find(([url]) => normalizeAudioUrl(url) === selectedUrl);
        const selectedLines = normalizeCatalogLyricLines(selectedEntry && selectedEntry[1]);
        if (selectedLines.length > 0) {
            return { lines: selectedLines, hasAnyVersion: true };
        }

        // A different mix may not have been timed yet. Reuse only its text so
        // the player never applies another version's incorrect timestamps.
        const fallbackLines = normalizeCatalogLyricLines(entries[0][1])
            .map(line => ({ text: line.text, time: null }));
        return { lines: fallbackLines, hasAnyVersion: true };
    }

    function normalizeCatalogLyricLines(lines) {
        if (!Array.isArray(lines)) return [];
        return lines.map(line => {
            const text = String(line && line.text || '').trim();
            if (!text) return null;
            const rawTime = line.time;
            const numericTime = rawTime === null || rawTime === undefined || rawTime === ''
                ? null
                : Number(rawTime);
            return {
                text,
                time: Number.isFinite(numericTime) && numericTime >= 0 ? numericTime : null
            };
        }).filter(Boolean);
    }

    function hasUsableLyricTiming(lines) {
        let previousTime = -1;
        return lines.length > 0 && lines.every(line => {
            if (!Number.isFinite(line.time) || line.time < previousTime) return false;
            previousTime = line.time;
            return true;
        });
    }

    function getSongVersions(song) {
        if (!song) return [];

        const versions = [];
        if (Array.isArray(song.versions)) {
            song.versions.forEach(version => {
                const url = normalizeAudioUrl(version && version.url);
                if (!url) return;
                versions.push({
                    url,
                    label: version.label || version.title || '',
                    isDefault: Boolean(version.isDefault || version.default)
                });
            });
        }

        const fallbackUrl = normalizeAudioUrl(song.url);
        if (fallbackUrl && !versions.some(version => version.url === fallbackUrl)) {
            versions.unshift({
                url: fallbackUrl,
                label: '',
                isDefault: !versions.some(version => version.isDefault)
            });
        }

        if (versions.length === 0) return [];

        const defaultIndex = versions.findIndex(version => version.isDefault);
        const ordered = defaultIndex > 0
            ? [versions[defaultIndex], ...versions.filter((_, index) => index !== defaultIndex)]
            : versions;

        return ordered.map((version, index) => ({
            url: version.url,
            label: `版本${index + 1}`,
            isDefault: index === 0
        }));
    }

    function normalizeAudioUrl(value) {
        return String(value || '').trim();
    }

    function updateProgress(forceLyrics = false) {
        const audio = elements.audio;
        if (!audio.duration) return;

        const percent = (audio.currentTime / audio.duration) * 100;

        // Update Orbit
        elements.orbitPath.style.strokeDashoffset = 100 - percent;

        // Update Dot Position on the path
        const pathLen = elements.orbitPath.getTotalLength();
        const point = elements.orbitPath.getPointAtLength((percent / 100) * pathLen);
        elements.orbitDot.setAttribute('cx', point.x);
        elements.orbitDot.setAttribute('cy', point.y);

        elements.slider.value = percent;
        elements.timeCurr.textContent = formatTime(audio.currentTime);
        elements.timeTotal.textContent = formatTime(audio.duration);

        updateLyricsDisplay(audio.currentTime, forceLyrics);
    }

    function updateDuration() {
        elements.timeTotal.textContent = formatTime(elements.audio.duration);
    }

    function formatTime(s) {
        if (!s || isNaN(s)) return '0:00';
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec < 10 ? '0' : ''}${sec}`;
    }

    function getVisibleResources(items) {
        if (window.DeanRecommendations && window.DeanRecommendations.filterVisible) {
            return window.DeanRecommendations.filterVisible(items);
        }

        return Array.isArray(items) ? items.filter(item => item && !item.deletedAt) : [];
    }
});
