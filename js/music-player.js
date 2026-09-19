document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const songPathMatch = window.location.pathname.match(/^\/song\/([^/]+)\/?$/);
    const initialId = urlParams.get('id') || (songPathMatch ? decodeURIComponent(songPathMatch[1]) : null);

    let songs = [];
    let currentIndex = 0;
    let currentVersionIndex = 0;
    let isPlaying = false;
    let playbackRequestId = 0;
    let playbackPending = false;
    let autoplayBlocked = false;
    let playerClosed = false;
    let lyrics = [];
    let lyricsHaveTimestamps = false;
    let activeLyricIndex = -1;
    let lyricScrollIndex = -1;
    let lyricAnimationFrameId = null;
    let lyricScrollAnimationFrameId = null;
    let lyricsRequestId = 0;
    let lyricExitTimer = null;
    let exitingLyric = null;
    let exitingLyricEcho = null;
    const LYRIC_SCROLL_LEAD_SECONDS = 0.28;
    const LYRIC_SCROLL_DURATION_MS = 240;
    const desktopRoomQuery = window.matchMedia
        ? window.matchMedia('(min-width: 901px) and (hover: hover) and (pointer: fine)')
        : null;
    const reduceMotionQuery = window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;

    const elements = {
        audio: document.getElementById('audio-element'),
        playBtn: document.getElementById('btn-toggle'),
        prevBtn: document.getElementById('btn-prev'),
        nextBtn: document.getElementById('btn-next'),
        closeBtn: document.getElementById('btn-close'),
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
        lyricEcho: document.getElementById('pulse-lyric-echo'),
        playerBody: document.body,
        versionStrip: document.getElementById('version-strip')
    };

    elements.closeBtn?.addEventListener('click', closePlayer);
    window.DeanPlayerSkin?.init({
        audio: elements.audio,
        onChange: () => requestAnimationFrame(() => {
            cancelLyricScrollAnimation();
            updateLyricsDisplay(elements.audio.currentTime || 0, true);
            updateVersionStripOverflow();
        })
    });
    window.addEventListener('resize', () => {
        cancelLyricScrollAnimation();
        updateLyricsDisplay(elements.audio.currentTime || 0, true);
    });
    window.addEventListener('pagehide', () => {
        playerClosed = true;
        pauseAudio();
    });
    window.addEventListener('pageshow', event => {
        // A history-restored player remains paused, but its controls work again.
        if (event.persisted) playerClosed = false;
    });

    // Keep the catalogue cacheable so repeat H5 visits do not refetch it.
    fetch('assets/data/music.json')
        .then(res => res.json())
        .then(data => {
            if (playerClosed) return;
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
        elements.audio.addEventListener('timeupdate', () => updateProgress());
        elements.audio.addEventListener('seeking', () => updateProgress(true));
        elements.audio.addEventListener('seeked', () => updateProgress(true));
        elements.audio.addEventListener('loadedmetadata', updateDuration);
        elements.audio.addEventListener('durationchange', updateDuration);
        elements.audio.addEventListener('play', () => {
            // A queued play event may arrive after the user has already paused
            // or closed the player. Reflect the element, not the stale event.
            if (playerClosed) elements.audio.pause();
            setPlayingState(!playerClosed && !elements.audio.paused && !elements.audio.ended);
        });
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

    async function closePlayer() {
        if (playerClosed) return;
        playerClosed = true;
        pauseAudio();
        await window.DeanPlayerSkin?.exitFullscreen?.();
        let canReturnToReferrer = false;

        if (document.referrer) {
            try {
                const referrerUrl = new URL(document.referrer);
                const currentUrl = new URL(window.location.href);
                canReturnToReferrer = referrerUrl.origin === currentUrl.origin
                    && referrerUrl.href !== currentUrl.href
                    && window.history.length > 1;
            } catch (error) {
                canReturnToReferrer = false;
            }
        }

        if (canReturnToReferrer) {
            window.history.back();
            return;
        }

        window.location.assign('/music.html');
    }

    function createStars() {
        if (!elements.starsContainer) return;
        elements.starsContainer.innerHTML = '';
        // The desktop player uses the sunlit room instead of the H5 star field.
        if (desktopRoomQuery && desktopRoomQuery.matches) return;
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
        if (playerClosed) return;
        const song = songs[index];
        if (!song) return;
        pauseAudio();
        currentVersionIndex = 0;
        const songPath = `/song/${encodeURIComponent(song.id)}`;
        if (window.location.pathname !== songPath && window.history?.replaceState) {
            window.history.replaceState(null, '', songPath);
        }
        elements.title.textContent = song.title;
        elements.artist.textContent = song.artist || 'Unknown Artist';
        elements.blurBg.style.backgroundImage = song.cover ? `url(${song.cover})` : 'none';
        window.DeanPlayerSkin?.setCover(song.cover || '');
        const pulseCover = document.getElementById('pulse-cover');
        if (pulseCover) {
            pulseCover.hidden = !song.cover;
            if (song.cover) pulseCover.src = song.cover;
            else pulseCover.removeAttribute('src');
        }
        elements.audio.src = getSongVersions(song)[currentVersionIndex]?.url || song.url || '';

        if (window.DeanShare) {
            window.DeanShare.configureTrack(song);
        }

        updateCarouselUI();
        renderVersionStrip(song);
        loadLyrics(song);

        // Start immediately, independently of the lyric request. Browsers which
        // disallow audible autoplay keep an honest paused state and a play hint.
        playAudio({ automatic: initial });
    }

    function renderVersionStrip(song) {
        if (!elements.versionStrip) return;

        const versions = getSongVersions(song);
        if (versions.length <= 1) {
            elements.versionStrip.classList.add('is-hidden');
            elements.versionStrip.classList.remove('is-overflowing', 'has-many-versions');
            elements.versionStrip.removeAttribute('data-version-count');
            elements.versionStrip.innerHTML = '';
            return;
        }

        elements.versionStrip.classList.remove('is-hidden');
        elements.versionStrip.classList.toggle('has-many-versions', versions.length > 2);
        elements.versionStrip.dataset.versionCount = String(versions.length);
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
        if (playerClosed) return;
        const song = songs[currentIndex];
        const versions = getSongVersions(song);
        const version = versions[index];
        if (!version || index === currentVersionIndex) return;

        const shouldResume = isPlaying || playbackPending;
        pauseAudio();
        currentVersionIndex = index;
        elements.audio.src = version.url;
        elements.audio.currentTime = 0;
        elements.slider.value = 0;
        elements.slider.style.setProperty('--progress', '0%');
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
        let dragPointerId = null;
        let dragStartX = 0;
        let dragStartScrollLeft = 0;
        let suppressVersionClick = false;

        strip.addEventListener('pointerdown', event => {
            event.stopPropagation();
            if (event.pointerType !== 'mouse' || event.button !== 0 || strip.scrollWidth <= strip.clientWidth) return;

            dragPointerId = event.pointerId;
            dragStartX = event.clientX;
            dragStartScrollLeft = strip.scrollLeft;
            suppressVersionClick = false;
            strip.classList.add('is-dragging');
            strip.setPointerCapture?.(event.pointerId);
        });

        strip.addEventListener('pointermove', event => {
            if (event.pointerId !== dragPointerId) return;

            const dragDistance = event.clientX - dragStartX;
            if (Math.abs(dragDistance) > 3) suppressVersionClick = true;
            if (!suppressVersionClick) return;

            event.preventDefault();
            strip.scrollLeft = dragStartScrollLeft - dragDistance;
        });

        const finishVersionDrag = event => {
            if (event.pointerId !== dragPointerId) return;
            if (strip.hasPointerCapture?.(event.pointerId)) {
                strip.releasePointerCapture(event.pointerId);
            }
            strip.classList.remove('is-dragging');
            dragPointerId = null;
            setTimeout(() => {
                suppressVersionClick = false;
            }, 0);
        };

        strip.addEventListener('pointerup', finishVersionDrag);
        strip.addEventListener('pointercancel', finishVersionDrag);

        strip.addEventListener('click', event => {
            if (!suppressVersionClick) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            suppressVersionClick = false;
        }, true);

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
            card.dataset.cover = song.cover || '';
            const recordLabel = document.createElement('span');
            recordLabel.className = 'desktop-record-label';
            recordLabel.style.backgroundImage = song.cover ? `url("${song.cover}")` : 'none';
            card.appendChild(recordLabel);
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
                card.style.backgroundImage = card.dataset.cover ? `url(${card.dataset.cover})` : 'none';
            } else if (i === (currentIndex - 1 + len) % len) {
                card.classList.add('prev');
                card.style.backgroundImage = card.dataset.cover ? `url(${card.dataset.cover})` : 'none';
            } else if (i === (currentIndex + 1) % len) {
                card.classList.add('next');
                card.style.backgroundImage = card.dataset.cover ? `url(${card.dataset.cover})` : 'none';
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

        clearLyricExit();
        elements.lyricsBox.innerHTML = '';
        if (elements.lyricEcho) elements.lyricEcho.textContent = '';
        lyricsHaveTimestamps = false;
        activeLyricIndex = -1;
        lyricScrollIndex = -1;
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
        if (nextLyrics.length === 0) nextLyrics.push({ text: '暂无歌词', time: null });
        lyrics = nextLyrics;
        lyricsHaveTimestamps = hasUsableLyricTiming(lyrics);

        const fragment = document.createDocumentFragment();
        lyrics.forEach((line, index) => {
            const item = document.createElement('div');
            item.className = 'lyric-line';
            renderLyricText(item, line.text);
            item.dataset.index = index;
            fragment.appendChild(item);
        });
        elements.lyricsBox.appendChild(fragment);

        requestAnimationFrame(() => updateLyricsDisplay(elements.audio.currentTime || 0, true));
    }

    function renderLyricText(item, text) {
        // CJK/kana characters stay individual (including combining marks),
        // while Latin words and contractions stay intact. Never echo punctuation.
        const cjkCharacter = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
        const tokens = [...text.matchAll(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]\p{M}*|\p{Script=Latin}[\p{Script=Latin}\p{M}\p{N}]*(?:['’]\p{Script=Latin}[\p{Script=Latin}\p{M}\p{N}]*)*/gu)];
        // Estimate line length in ems without changing its layout as it enters.
        // Longer lines converge as separate glyphs, never stretched letterforms.
        const textWidth = Array.from(text).reduce((width, character) => width
            + (cjkCharacter.test(character) ? 1 : /[\p{L}\p{N}]/u.test(character) ? .55 : .25), 0);
        item.style.setProperty('--pulse-line-units', Math.max(1, textWidth));
        item.classList.toggle('is-long-lyric', textWidth >= 10);
        if (!tokens.length) {
            item.textContent = text;
            return;
        }
        // Sample only when the line is created. Seeking or resizing must not
        // reroll it, and adjacent lines are free to choose the same position.
        const token = tokens[Math.floor(Math.random() * tokens.length)];
        const keyword = document.createElement('span');
        keyword.className = 'lyric-keyword';
        const ink = document.createElement('span');
        ink.className = 'lyric-keyword-ink';
        ink.textContent = token[0];
        item.dataset.echo = token[0];
        keyword.appendChild(ink);
        // Keep one flex item in the original H5 layout, so long lines still
        // wrap as a sentence instead of three separate text columns.
        const sentence = document.createElement('span');
        sentence.className = 'lyric-text';
        const glyphs = typeof Intl.Segmenter === 'function'
            ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(part => ({ text: part.segment, index: part.index }))
            : [...text.matchAll(/\P{M}\p{M}*|\p{M}+/gu)].map(part => ({ text: part[0], index: part.index }));
        // Individual inline glyphs keep the original layout untouched; only the
        // pulse skin makes them transformable. Spaces remain ordinary text so
        // Latin phrases retain their normal word-wrap opportunities.
        ink.textContent = '';
        let keywordAdded = false;
        glyphs.forEach(part => {
            let glyph;
            if (/^\s+$/u.test(part.text)) {
                glyph = document.createTextNode(part.text);
            } else {
                glyph = document.createElement('span');
                glyph.className = 'lyric-glyph';
                glyph.textContent = part.text;
            }
            if (part.index >= token.index && part.index < token.index + token[0].length) {
                if (!keywordAdded) { sentence.appendChild(keyword); keywordAdded = true; }
                ink.appendChild(glyph);
            } else {
                sentence.appendChild(glyph);
            }
        });
        item.appendChild(sentence);
    }

    function clearLyricExit() {
        if (lyricExitTimer !== null) clearTimeout(lyricExitTimer);
        lyricExitTimer = null;
        if (exitingLyric) {
            exitingLyric.classList.remove('is-exiting');
            exitingLyric.removeAttribute('aria-hidden');
        }
        exitingLyricEcho?.remove();
        exitingLyric = null;
        exitingLyricEcho = null;
    }

    function beginLyricExit(line) {
        clearLyricExit();
        exitingLyric = line;
        line.classList.add('is-exiting');
        line.setAttribute('aria-hidden', 'true');
        if (elements.lyricEcho?.textContent) {
            exitingLyricEcho = elements.lyricEcho.cloneNode(true);
            exitingLyricEcho.removeAttribute('id');
            exitingLyricEcho.className = 'lyric-echo lyric-echo-out';
            elements.lyricEcho.after(exitingLyricEcho);
        }
        lyricExitTimer = setTimeout(clearLyricExit, 280);
    }

    function preparePulseGlyphs(line) {
        if (!line.classList.contains('is-long-lyric')) return;
        const rows = new Map();
        // offset geometry ignores CSS transforms. Measure the final line layout
        // once, then move each glyph away from its own row center without reflow.
        for (const glyph of line.querySelectorAll('.lyric-glyph')) {
            const row = Math.round(glyph.offsetTop / 4);
            if (!rows.has(row)) rows.set(row, []);
            rows.get(row).push({ glyph, center: glyph.offsetLeft + glyph.offsetWidth / 2 });
        }
        for (const glyphs of rows.values()) {
            const center = (glyphs[0].center + glyphs[glyphs.length - 1].center) / 2;
            for (const { glyph, center: glyphCenter } of glyphs) {
                glyph.style.setProperty('--lyric-drift', `${(glyphCenter - center) * .65}px`);
            }
        }
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
            const isPulse = window.DeanPlayerSkin?.isImmersive();
            const canExit = !force && isPulse && !reduceMotionQuery?.matches
                && activeLyricIndex >= 0 && activeLyricIndex !== activeIdx;
            if (canExit) beginLyricExit(lines[activeLyricIndex]);
            else clearLyricExit();
            activeLyricIndex = activeIdx;
            lines[activeIdx].style.setProperty('--pulse-entry-delay', canExit ? '180ms' : '0ms');

            // The enlarged token belongs to the scene, not the word's inline
            // box: its center stays at the viewport center even on wrapped lines.
            if (elements.lyricEcho) {
                const token = lines[activeIdx].dataset.echo || '';
                elements.lyricEcho.textContent = token;
                elements.lyricEcho.style.setProperty('--echo-length', Math.max(1, Array.from(token).length * .62));
                elements.lyricEcho.style.setProperty('--pulse-entry-delay', canExit ? '180ms' : '0ms');
                elements.lyricEcho.classList.toggle('echo-alternate', activeIdx % 2 === 1);
            }

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
            if (isPulse) preparePulseGlyphs(lines[activeIdx]);
        }

        // The light-field skin presents one centered line using the same
        // timestamp/highlight above, without moving the original scroll panel.
        if (window.DeanPlayerSkin?.isImmersive()) {
            cancelLyricScrollAnimation();
            elements.lyricsBox.scrollTop = 0;
            lyricScrollIndex = -1;
            return;
        }

        let scrollIdx = activeIdx;
        if (!force && isPlaying && lyricsHaveTimestamps && activeIdx < lyrics.length - 1) {
            const nextTime = lyrics[activeIdx + 1].time;
            const timeUntilNext = nextTime - currentTime;
            if (timeUntilNext > 0 && timeUntilNext <= LYRIC_SCROLL_LEAD_SECONDS) {
                scrollIdx = activeIdx + 1;
            }
        }

        if (force || scrollIdx !== lyricScrollIndex) {
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
        if (playerClosed) return;
        if (playbackPending || (!elements.audio.paused && !elements.audio.ended)) pauseAudio();
        else playAudio();
    }

    async function playAudio({ automatic = false } = {}) {
        if (playerClosed) return;
        const requestId = ++playbackRequestId;
        playbackPending = true;
        autoplayBlocked = false;
        updatePlayState();
        try {
            // Manual interaction can unlock Web Audio synchronously. Automatic
            // entry waits for the actual play event before creating that graph.
            if (!automatic) window.DeanPlayerSkin?.prepareAudio();
            await elements.audio.play();
            if (requestId !== playbackRequestId || playerClosed) return;
            playbackPending = false;
            setPlayingState(!elements.audio.paused && !elements.audio.ended);
        } catch (error) {
            // A cancelled request from an old track must not pause the new one
            // or replace its control state after a quick version/track change.
            if (requestId !== playbackRequestId || playerClosed) return;
            playbackPending = false;
            autoplayBlocked = error?.name === 'NotAllowedError';
            setPlayingState(!elements.audio.paused && !elements.audio.ended);
            if (!autoplayBlocked && error?.name !== 'AbortError') {
                console.warn('Playback could not start:', error);
            }
        }
    }

    function pauseAudio() {
        playbackRequestId += 1;
        playbackPending = false;
        autoplayBlocked = false;
        elements.audio.pause();
        setPlayingState(false);
    }

    function setPlayingState(nextState) {
        isPlaying = nextState;
        if (isPlaying) {
            autoplayBlocked = false;
            startLyricSync();
        } else {
            stopLyricSync();
            cancelLyricScrollAnimation();
            updateLyricsDisplay(elements.audio.currentTime || 0, true);
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
        const playLabel = isPlaying ? '暂停播放'
            : autoplayBlocked ? '浏览器已阻止自动播放，点击播放' : '开始播放';
        elements.playBtn.setAttribute('aria-label', playLabel);
        elements.playBtn.setAttribute('title', playLabel);
        elements.playerBody?.classList.toggle('autoplay-blocked', autoplayBlocked);
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
        elements.slider.style.setProperty('--progress', `${percent}%`);
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
