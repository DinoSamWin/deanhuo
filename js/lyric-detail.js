document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    let lyricId = urlParams.get('id') || localStorage.getItem('currentLyricId');

    const elements = {
        title: document.getElementById('lyric-title'),
        author: document.getElementById('lyric-author'),
        body: document.getElementById('lyric-body'),
        audio: document.getElementById('lyric-audio'),
        playBtn: document.getElementById('play-btn'),
        currentTime: document.getElementById('current-time'),
        duration: document.getElementById('duration'),
        progressBar: document.getElementById('progress-bar'),
        progressContainer: document.querySelector('.progress-bar-container'),
        prevBtn: document.getElementById('prev-btn'),
        nextBtn: document.getElementById('next-btn'),
        audioModule: document.getElementById('audio-module'),
        fixedNavInfo: document.getElementById('fixed-nav-info'),
        volumeBtn: document.getElementById('volume-btn'),
        panelBg: document.getElementById('left-panel-bg'),
        date: document.getElementById('lyric-date'),
        avatarCircle: document.querySelector('.avatar-circle'),
        rightPanel: document.querySelector('.right-panel')
    };

    // 滚动防抖逻辑：滑动时禁用悬停动画，防止“眼花”
    let scrollTimer;
    if (elements.rightPanel) {
        elements.rightPanel.addEventListener('scroll', () => {
            document.body.classList.add('is-scrolling');
            clearTimeout(scrollTimer);
            scrollTimer = setTimeout(() => {
                document.body.classList.remove('is-scrolling');
            }, 150);
        }, { passive: true });
    }

    function formatDate(dateStr) {
        if (!dateStr) return 'UNKNOWN';
        const date = new Date(dateStr);
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        return `${months[date.getMonth()]} ${date.getFullYear()}`;
    }

    function getInitials(name) {
        if (!name) return 'DH';
        return name.split(' ')
            .map(word => word[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();
    }

    // Configure Markdown
    if (window.marked) {
        marked.setOptions({
            breaks: true,
            gfm: true
        });
    }

    if (!lyricId) {
        elements.body.innerHTML = '<h2>参数错误</h2><p>请从列表页选择歌词查看。</p>';
        return;
    }

    fetch('assets/data/lyrics.json?v=' + Date.now())
        .then(res => res.json())
        .then(data => {
            const index = data.findIndex(item => String(item.id).trim() === String(lyricId).trim());
            if (index === -1) {
                elements.body.innerHTML = '<h2>未找到该内容</h2>';
                return;
            }

            const current = data[index];
            const prev = index > 0 ? data[index - 1] : null;
            const next = index < data.length - 1 ? data[index + 1] : null;

            initPage(current, prev, next);
        });

    function initPage(lyric, prev, next) {
        document.title = `${lyric.title} | Dean Huo`;
        elements.title.textContent = lyric.title;
        elements.author.textContent = lyric.author || 'Dean Huo';

        if (elements.date) {
            elements.date.textContent = formatDate(lyric.date);
        }

        if (elements.avatarCircle) {
            elements.avatarCircle.textContent = getInitials(lyric.author || 'Dean Huo');
        }

        if (elements.panelBg) {
            elements.panelBg.style.backgroundImage = `url(${lyric.cover})`;
        }

        // Populate Fixed Nav Info
        if (elements.fixedNavInfo) {
            let navHtml = '';
            if (prev) navHtml += `<span>上一篇：${prev.title}</span>`;
            if (next) navHtml += `<span>下一篇：${next.title}</span>`;
            elements.fixedNavInfo.innerHTML = navHtml;
        }

        // Load Markdown Content
        fetch(lyric.contentPath + '?v=' + Date.now())
            .then(res => res.text())
            .then(text => {
                const cleanedText = text.replace(/\xA0/g, ' ');
                // 核心逻辑：按行拆分，实现“逐行点亮”并保留空行高度
                const lines = cleanedText.split('\n').map(line => {
                    if (line.trim() === '') return '<div class="lyric-spacer"></div>';
                    return `<p class="lyric-line">${marked.parseInline(line)}</p>`;
                }).join('');
                elements.body.innerHTML = lines;
            })
            .catch(() => elements.body.innerHTML = '<p>内容加载失败。</p>');

        // Handle Audio
        if (lyric.audioPath) {
            elements.audio.src = lyric.audioPath;
            elements.audioModule.style.display = 'flex';
            setupAudioPlayer();
        } else {
            elements.audioModule.style.display = 'none';
        }

        // Setup Arrow Navigation
        setupNavigation(prev, next);

        if (window.lucide) lucide.createIcons();
    }

    function setupAudioPlayer() {
        const audio = elements.audio;
        const playBtn = elements.playBtn;

        playBtn.onclick = () => {
            if (audio.paused) {
                audio.play();
                playBtn.innerHTML = '<i data-lucide="pause"></i>';
            } else {
                audio.pause();
                playBtn.innerHTML = '<i data-lucide="play"></i>';
            }
            lucide.createIcons();
        };

        audio.ontimeupdate = () => {
            const progress = (audio.currentTime / audio.duration) * 100;
            elements.progressBar.style.width = `${progress}%`;
            elements.currentTime.textContent = formatTime(audio.currentTime);
        };

        audio.onloadedmetadata = () => {
            elements.duration.textContent = formatTime(audio.duration);
        };

        elements.progressContainer.onclick = (e) => {
            const width = elements.progressContainer.clientWidth;
            const clickX = e.offsetX;
            const duration = audio.duration;
            audio.currentTime = (clickX / width) * duration;
        };

        elements.volumeBtn.onclick = () => {
            audio.muted = !audio.muted;
            elements.volumeBtn.innerHTML = audio.muted ?
                '<i data-lucide="volume-x"></i>' :
                '<i data-lucide="volume-2"></i>';
            lucide.createIcons();
        };
    }

    function formatTime(seconds) {
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        return `${min}:${sec < 10 ? '0' : ''}${sec}`;
    }

    function setupNavigation(prev, next) {
        if (prev) {
            elements.prevBtn.onclick = () => navigateTo(prev.id);
            elements.prevBtn.style.opacity = '1';
        } else {
            elements.prevBtn.style.opacity = '0.3';
            elements.prevBtn.style.pointerEvents = 'none';
        }

        if (next) {
            elements.nextBtn.onclick = () => navigateTo(next.id);
            elements.nextBtn.style.opacity = '1';
        } else {
            elements.nextBtn.style.opacity = '0.3';
            elements.nextBtn.style.pointerEvents = 'none';
        }
    }

    function navigateTo(id) {
        localStorage.setItem('currentLyricId', id);
        window.location.href = `lyric-detail.html?id=${id}`;
    }
});
