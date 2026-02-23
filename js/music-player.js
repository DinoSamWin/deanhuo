document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const songId = urlParams.get('id');

    let songs = [];
    let currentIndex = -1;
    let isPlaying = false;

    const elements = {
        audio: document.getElementById('audio-player'),
        playPauseBtn: document.getElementById('play-pause-btn'),
        prevBtn: document.getElementById('prev-btn'),
        nextBtn: document.getElementById('next-btn'),
        progressFill: document.getElementById('progress-fill'),
        progressContainer: document.getElementById('progress-container'),
        currentTime: document.getElementById('current-time'),
        duration: document.getElementById('duration'),
        title: document.getElementById('track-title'),
        artist: document.getElementById('track-artist'),
        description: document.getElementById('track-description'),
        coverArt: document.getElementById('cover-art'),
        bgBlur: document.getElementById('bg-blur'),
        lyricsPanel: document.getElementById('lyrics-panel')
    };

    // Load Music Data with cache busting
    fetch(`assets/data/music.json?t=${Date.now()}`)
        .then(res => res.json())
        .then(data => {
            songs = data;
            currentIndex = songs.findIndex(s => s.id === songId);
            if (currentIndex === -1) currentIndex = 0;
            loadSong(currentIndex);
        });

    async function loadSong(index) {
        const song = songs[index];
        if (!song) return;

        // UI Updates
        elements.title.textContent = song.title;
        elements.artist.textContent = song.artist;
        elements.description.textContent = song.description || '';
        elements.coverArt.style.backgroundImage = `url(${song.cover})`;
        elements.bgBlur.style.backgroundImage = `url(${song.cover})`;

        // Audio Setup
        elements.audio.src = song.url;
        elements.audio.load();

        // --- Improved Lyrics Loading ---
        let finalLyrics = [];

        if (song.lyricId) {
            // Case 1: Use ID to fetch from existing lyrics.json + markdown
            try {
                // Add cache busting to lyrics.json
                const res = await fetch(`assets/data/lyrics.json?t=${Date.now()}`);
                const lyricsData = await res.json();
                const lyricEntry = lyricsData.find(l => l.id === song.lyricId);
                if (lyricEntry && lyricEntry.contentPath) {
                    // Add cache busting to markdown file
                    const mdRes = await fetch(`${lyricEntry.contentPath}?t=${Date.now()}`);
                    const mdText = await mdRes.text();
                    finalLyrics = mdText.split('\n')
                        .filter(line => line.trim() !== '')
                        .map((line, i) => ({ time: 0, text: line.replace(/^#+\s+/, '').trim() })); // Remove md headers
                }
            } catch (err) {
                console.error('Error fetching linked lyrics:', err);
            }
        }

        if (finalLyrics.length === 0 && song.lyricText) {
            // Case 2: Use a raw block of text
            finalLyrics = song.lyricText.split('\n')
                .filter(line => line.trim() !== '')
                .map((line, i) => ({ time: 0, text: line.trim() }));
        }

        if (finalLyrics.length === 0 && song.lyrics) {
            // Case 3: Legacy array format
            finalLyrics = song.lyrics;
        }

        renderLyrics(finalLyrics);

        // Reset Player State
        if (isPlaying) {
            elements.audio.play();
        }
    }

    function renderLyrics(lyrics) {
        if (!lyrics || lyrics.length === 0) {
            elements.lyricsPanel.innerHTML = '<p class="lyric-line">No lyrics available for this track.</p>';
            return;
        }

        elements.lyricsPanel.innerHTML = lyrics.map((l, i) => `
            <div class="lyric-line" data-time="${l.time || 0}" data-index="${i}">
                ${l.text}
            </div>
        `).join('');

        // Manual Scroll Listener for Highlight
        elements.lyricsPanel.onscroll = () => {
            handleManualLyricHighlight();
        };

        // Click to Seek (Only works if timestamps are provided)
        document.querySelectorAll('.lyric-line').forEach(line => {
            line.onclick = () => {
                const time = parseFloat(line.dataset.time);
                if (time > 0) {
                    elements.audio.currentTime = time;
                }
                // Center the clicked line
                const panelHeight = elements.lyricsPanel.offsetHeight;
                const lineOffset = line.offsetTop;
                elements.lyricsPanel.scrollTo({
                    top: lineOffset - panelHeight / 2 + line.offsetHeight / 2,
                    behavior: 'smooth'
                });
            };
        });

        // Initial highlight check
        handleManualLyricHighlight();
    }

    function handleManualLyricHighlight() {
        const panel = elements.lyricsPanel;
        const lines = panel.querySelectorAll('.lyric-line');
        const panelCenter = panel.scrollTop + (panel.offsetHeight / 2);

        let closestLine = null;
        let minDistance = Infinity;

        lines.forEach(line => {
            const lineCenter = line.offsetTop + (line.offsetHeight / 2);
            const distance = Math.abs(panelCenter - lineCenter);

            if (distance < minDistance) {
                minDistance = distance;
                closestLine = line;
            }
        });

        lines.forEach(line => {
            if (line === closestLine) {
                line.classList.add('active');
            } else {
                line.classList.remove('active');
            }
        });
    }

    // Event Listeners
    elements.playPauseBtn.onclick = () => {
        if (elements.audio.paused) {
            elements.audio.play();
            isPlaying = true;
            elements.playPauseBtn.innerHTML = '<i data-lucide="pause" fill="currentColor"></i>';
        } else {
            elements.audio.pause();
            isPlaying = false;
            elements.playPauseBtn.innerHTML = '<i data-lucide="play" fill="currentColor"></i>';
        }
        lucide.createIcons();
    };

    elements.nextBtn.onclick = () => {
        currentIndex = (currentIndex + 1) % songs.length;
        loadSong(currentIndex);
    };

    elements.prevBtn.onclick = () => {
        currentIndex = (currentIndex - 1 + songs.length) % songs.length;
        loadSong(currentIndex);
    };

    elements.audio.ontimeupdate = () => {
        const progress = (elements.audio.currentTime / elements.audio.duration) * 100;
        elements.progressFill.style.width = `${progress}%`;
        elements.currentTime.textContent = formatTime(elements.audio.currentTime);
    };

    elements.audio.onloadedmetadata = () => {
        elements.duration.textContent = formatTime(elements.audio.duration);
    };

    elements.progressContainer.onclick = (e) => {
        const width = elements.progressContainer.clientWidth;
        const clickX = e.offsetX;
        const duration = elements.audio.duration;
        elements.audio.currentTime = (clickX / width) * duration;
    };

    elements.audio.onended = () => {
        elements.nextBtn.click();
    };

    function formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        return `${min}:${sec < 10 ? '0' : ''}${sec}`;
    }
});
