document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const initialId = urlParams.get('id');

    let songs = [];
    let currentIndex = 0;
    let currentVersionIndex = 0;
    let isPlaying = false;
    let lyrics = [];

    const elements = {
        audio: document.getElementById('audio-element'),
        playBtn: document.getElementById('btn-toggle'),
        playIcon: document.getElementById('play-icon'),
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
        playerBody: document.getElementById('player-body'),
        versionStrip: document.getElementById('version-strip')
    };

    // 1. Fetch Music Data (Cache busting added)
    fetch(`assets/data/music.json?t=${new Date().getTime()}`)
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
        loadTrack(currentIndex, true);

        // Listeners
        elements.playBtn.addEventListener('click', togglePlay);
        elements.nextBtn.addEventListener('click', () => nextTrack());
        elements.prevBtn.addEventListener('click', () => prevTrack());
        bindVersionStripScroll();

        elements.audio.addEventListener('timeupdate', updateProgress);
        elements.audio.addEventListener('ended', () => nextTrack());

        elements.slider.addEventListener('input', (e) => {
            if (elements.audio.duration) {
                elements.audio.currentTime = (e.target.value / 100) * elements.audio.duration;
            }
        });
    }

    function createStars() {
        if (!elements.starsContainer) return;
        elements.starsContainer.innerHTML = '';
        const count = 400; // Massively increased for realism
        const colors = ['#ffffff', '#cce0ff', '#ffe8cc', '#e6f2ff']; // White, blueish, yellowish

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
            star.style.boxShadow = `0 0 ${size * 2}px ${color}`;

            star.style.setProperty('--size', `${size}px`);
            star.style.setProperty('--base-opacity', Math.random() * 0.6 + 0.1);
            star.style.setProperty('--duration', `${Math.random() * 4 + 2}s`);
            star.style.animationDelay = `${Math.random() * 5}s`;

            elements.starsContainer.appendChild(star);
        }
    }

    async function loadTrack(index, initial = false) {
        const song = songs[index];
        currentVersionIndex = 0;
        elements.title.textContent = song.title;
        elements.artist.textContent = song.artist || 'Unknown Artist';
        elements.blurBg.style.backgroundImage = `url(${song.cover})`;
        elements.audio.src = getSongVersions(song)[currentVersionIndex]?.url || song.url || '';

        updateCarouselUI();
        renderVersionStrip(song);
        loadLyrics(song);

        if (!initial) {
            playAudio();
        } else {
            // Check for potential autoplay policy issues
            elements.audio.play().then(() => {
                isPlaying = true;
                updatePlayState();
            }).catch(() => {
                isPlaying = false;
                updatePlayState();
            });
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
        if (active && typeof active.scrollIntoView === 'function') {
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
            card.style.backgroundImage = `url(${song.cover})`;
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
            } else if (i === (currentIndex - 1 + len) % len) {
                card.classList.add('prev');
            } else if (i === (currentIndex + 1) % len) {
                card.classList.add('next');
            } else {
                card.classList.add('hidden');
            }
        });
    }

    async function loadLyrics(song) {
        elements.lyricsBox.innerHTML = '';
        lyrics = [];
        let lrcText = null;

        try {
            // Priority 1: Try to fetch a generated .lrc file
            const lrcRes = await fetch(`assets/lyrics/${song.id}.lrc?t=${new Date().getTime()}`);
            if (lrcRes.ok) {
                lrcText = await lrcRes.text();
            }
        } catch (e) { console.log('No LRC found for', song.id); }

        if (lrcText) {
            // Parse LRC file with timestamps
            const lines = lrcText.split('\n');
            const regex = /\[(\d{2}):(\d{2}\.\d{2,3})\](.*)/;
            lines.forEach(line => {
                const match = regex.exec(line);
                if (match) {
                    const min = parseInt(match[1]);
                    const sec = parseFloat(match[2]);
                    const time = min * 60 + sec;
                    const text = match[3].trim();
                    if (text) {
                        lyrics.push({ time, text });
                    }
                }
            });
            lyrics.sort((a, b) => a.time - b.time);
        } else {
            // Priority 2: Fallback to existing static lyrics setup
            try {
                if (song.lyricText) {
                    lyrics = song.lyricText.split('\n').filter(l => l.trim()).map(l => ({ text: l, time: 0 }));
                } else if (song.lyricId) {
                    const res = await fetch('assets/data/lyrics.json');
                    const data = getVisibleResources(await res.json());
                    const entry = data.find(d => d.id === song.lyricId);
                    if (entry && entry.contentPath) {
                        const lRes = await fetch(entry.contentPath);
                        const text = await lRes.text();
                        lyrics = text.split('\n')
                            .filter(l => l.trim())
                            .map(l => ({ text: l.replace(/^#+\s*/, '').trim(), time: 0 }));
                    }
                }
            } catch (e) {
                console.error("Lyrics error", e);
            }
        }

        if (lyrics.length === 0) {
            lyrics = [{ text: "No lyrics available", time: 0 }];
        }

        lyrics.forEach((line, i) => {
            const div = document.createElement('div');
            div.className = 'lyric-line';
            div.textContent = line.text;
            div.dataset.index = i;
            elements.lyricsBox.appendChild(div);
        });

        // Initialize display
        updateLyricsDisplay(0);
    }

    function updateLyricsDisplay(currentTime) {
        const lines = elements.lyricsBox.querySelectorAll('.lyric-line');
        if (!lines.length) return;

        let activeIdx = -1;
        const hasTimestamps = lyrics.some(l => l.time > 0);

        if (hasTimestamps) {
            // Find the active lyric based on actual timestamp
            for (let i = lyrics.length - 1; i >= 0; i--) {
                if (currentTime >= lyrics[i].time) {
                    activeIdx = i;
                    // If multiple lines have identical or very close timestamps, prevent skipping to the end instantly
                    // If we are still very close to this timestamp, prefer the earliest one in the cluster
                    if (currentTime - lyrics[i].time < 0.5) {
                        while (activeIdx > 0 && lyrics[activeIdx - 1].time === lyrics[activeIdx].time) {
                            activeIdx--;
                        }
                    }
                    break;
                }
            }
        } else {
            // Fallback: static proportional timing
            if (elements.audio.duration) {
                const ratio = elements.audio.currentTime / elements.audio.duration;
                activeIdx = Math.floor(ratio * lyrics.length);
            }
        }

        // Apply active classes
        lines.forEach((line, i) => {
            line.classList.remove('active', 'near-prev', 'near-next', 'far-prev', 'far-next');
            if (i === activeIdx) {
                line.classList.add('active');
            } else if (i === activeIdx - 1) {
                line.classList.add('near-prev');
            } else if (i === activeIdx + 1) {
                line.classList.add('near-next');
            } else if (i < activeIdx - 1) {
                line.classList.add('far-prev');
            } else if (i > activeIdx + 1) {
                line.classList.add('far-next');
            }
        });
    }

    function togglePlay() {
        if (isPlaying) pauseAudio();
        else playAudio();
    }

    function playAudio() {
        elements.audio.play();
        isPlaying = true;
        updatePlayState();
    }

    function pauseAudio() {
        elements.audio.pause();
        isPlaying = false;
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
    }

    function nextTrack() {
        currentIndex = (currentIndex + 1) % songs.length;
        loadTrack(currentIndex);
    }

    function prevTrack() {
        currentIndex = (currentIndex - 1 + songs.length) % songs.length;
        loadTrack(currentIndex);
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

    function updateProgress() {
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

        updateLyricsDisplay(audio.currentTime);
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
