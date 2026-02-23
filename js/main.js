// Initialize Lucide Icons
if (typeof lucide !== 'undefined') {
    lucide.createIcons();
}

// Global Logic
document.addEventListener('DOMContentLoaded', () => {
    initStickyNav();
    initLyricsCarousel();
    initMusicModule();
    initPhotographyModule();
    initHeroInteractive();
});

let isFlipping = false;

function initHeroInteractive() {
    const chatBtn = document.getElementById('chat-btn');
    const backBtn = document.getElementById('back-to-hero');
    const flipCard = document.querySelector('.hero-flip-card');

    if (chatBtn && flipCard) {
        chatBtn.addEventListener('click', (e) => {
            e.preventDefault();
            animateCardSwitch(true);
        });
    }

    if (backBtn && flipCard) {
        backBtn.addEventListener('click', (e) => {
            e.preventDefault();
            animateCardSwitch(false);
        });
    }
}

function animateCardSwitch(toBack) {
    if (isFlipping) return;
    isFlipping = true;

    const front = document.querySelector('.hero-front');
    const back = document.querySelector('.hero-back');
    const inner = document.getElementById('hero-flip-inner');
    const turbulence = document.getElementById('turbulence');
    const displacement = document.getElementById('displacement');

    if (!inner || !turbulence || !displacement || !front || !back) {
        // Fallback without animation
        if (toBack) {
            front.classList.remove('active');
            back.classList.add('active');
        } else {
            back.classList.remove('active');
            front.classList.add('active');
        }
        isFlipping = false;
        return;
    }

    // Prepare SVG filter
    inner.style.filter = 'url(#particle-dissolve)';
    inner.style.transform = 'translateZ(0)'; // force hardware accel
    inner.style.willChange = 'filter, opacity';

    // Phase 1: Dissolve (Scale up noise & fade out)
    const duration1 = 450;
    let startTime = performance.now();

    function step1(now) {
        let elapsed = now - startTime;
        let p = Math.min(elapsed / duration1, 1);
        let easeIn = p * p;

        displacement.setAttribute('scale', easeIn * 120);
        turbulence.setAttribute('baseFrequency', 0.01 + easeIn * 0.05);
        inner.style.opacity = 1 - easeIn;

        if (p < 1) {
            requestAnimationFrame(step1);
        } else {
            // Swap active cards while invisible
            if (toBack) {
                front.classList.remove('active');
                back.classList.add('active');
            } else {
                back.classList.remove('active');
                front.classList.add('active');
            }

            // Phase 2: Form (Scale down noise & fade in)
            startTime = performance.now();
            requestAnimationFrame(step2);
        }
    }

    function step2(now) {
        let elapsed = now - startTime;
        let p = Math.min(elapsed / duration1, 1);
        let inv = 1 - p;
        let easeOut = inv * inv; // quadratic ease in reverse

        displacement.setAttribute('scale', easeOut * 120);
        turbulence.setAttribute('baseFrequency', 0.01 + easeOut * 0.05);
        inner.style.opacity = p;

        if (p < 1) {
            requestAnimationFrame(step2);
        } else {
            // Cleanup
            inner.style.filter = 'none';
            displacement.setAttribute('scale', 0);
            inner.style.opacity = 1;
            inner.style.transform = '';
            inner.style.willChange = 'auto';
            isFlipping = false;
        }
    }

    requestAnimationFrame(step1);
}

function initStickyNav() {
    const navContainer = document.querySelector('.sticky-nav-container');
    const nav = document.querySelector('.sticky-nav');

    if (navContainer && nav) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 100) {
                nav.classList.add('is-sticky');
            } else {
                nav.classList.remove('is-sticky');
            }
        });
    }
}

async function initLyricsCarousel() {
    const container = document.getElementById('lyrics-home-carousel');
    if (!container) return;

    try {
        const response = await fetch('assets/data/lyrics.json?v=' + Date.now());
        const lyrics = await response.json();

        const homeLyrics = lyrics
            .filter(item => item.showOnHome)
            .sort((a, b) => (a.homeOrder || 99) - (b.homeOrder || 99))
            .slice(0, 5);

        if (homeLyrics.length === 0) {
            container.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-secondary);">No lyrics to display</div>';
            return;
        }

        renderCarousel(container, homeLyrics);
    } catch (error) {
        console.error('Error loading lyrics:', error);
    }
}

function renderCarousel(container, lyrics) {
    let html = '<div class="lyrics-carousel">';

    lyrics.forEach((item, index) => {
        html += `
            <div class="lyrics-slide ${index === 0 ? 'active' : ''}" data-index="${index}">
                <div class="now-playing-badge">
                    <div class="now-playing-dot"></div>
                    NOW PLAYING
                </div>
                <div class="album-art-container">
                    <img src="${item.cover}" alt="${item.title}" class="album-cover">
                    <div class="vinyl-disc"></div>
                </div>
                <div class="lyrics-info">
                    <h2 class="lyrics-title">${item.title}</h2>
                    <div class="lyrics-author">by ${item.author}</div>
                    <p class="lyrics-summary-excerpt">"${item.summary}"</p>
                </div>
                <div class="lyrics-footer">
                    <span class="release-date">RELEASED ${item.releaseYear || '2023'}</span>
                    <a href="lyric-detail.html?id=${item.id}" class="lyrics-arrow">
                        <i data-lucide="arrow-right"></i>
                    </a>
                </div>
            </div>
        `;
    });

    html += '<div class="carousel-dots">';
    lyrics.forEach((_, index) => {
        html += `<span class="dot ${index === 0 ? 'active' : ''}" data-index="${index}"></span>`;
    });
    html += '</div></div>';
    container.innerHTML = html;

    if (typeof lucide !== 'undefined') lucide.createIcons();

    let currentSlide = 0;
    const slides = container.querySelectorAll('.lyrics-slide');
    const dots = container.querySelectorAll('.dot');
    const totalSlides = lyrics.length;
    let timer;
    let isPaused = false;

    function showSlide(index) {
        slides[currentSlide].classList.remove('active');
        dots[currentSlide].classList.remove('active');
        currentSlide = index;
        slides[currentSlide].classList.add('active');
        dots[currentSlide].classList.add('active');
    }

    function nextSlide() {
        if (!isPaused) {
            showSlide((currentSlide + 1) % totalSlides);
        }
    }

    function startTimer() {
        if (totalSlides <= 1) return;
        timer = setInterval(nextSlide, 5000);
    }

    function resetTimer() {
        clearInterval(timer);
        startTimer();
    }

    // Hover Interaction: Pause/Resume
    container.addEventListener('mouseenter', () => {
        isPaused = true;
    });

    container.addEventListener('mouseleave', () => {
        isPaused = false;
    });

    dots.forEach(dot => {
        dot.addEventListener('click', () => {
            const index = parseInt(dot.getAttribute('data-index'));
            showSlide(index);
            resetTimer();
        });
    });

    startTimer();
}

async function initMusicModule() {
    const listContainer = document.getElementById('music-list-container');
    if (!listContainer) return;

    try {
        const response = await fetch('assets/data/music.json?v=' + Date.now());
        const musicData = await response.json();

        listContainer.innerHTML = musicData.slice(0, 4).map((item) => `
            <div class="music-item" onclick="location.href='music-player.html?id=${item.id}'">
                <img src="${item.cover}" alt="${item.title}" class="music-art">
                <div class="music-details">
                    <div class="music-name">${item.title}</div>
                    <div class="music-meta">${item.artist} • ${item.genre}</div>
                </div>
                <div class="play-pause-btn">
                    <i data-lucide="play" style="width: 14px; margin-left: 2px;"></i>
                </div>
            </div>
        `).join('');

        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) {
        console.error("Music error:", e);
    }
}

async function initPhotographyModule() {
    const section = document.getElementById('photography-home-section');
    if (!section) return;

    try {
        const response = await fetch('assets/data/photos.json?v=' + Date.now());
        const photos = await response.json();

        const homePhotos = photos.filter(p => p.showOnHome).sort((a, b) => a.homeOrder - b.homeOrder);
        if (homePhotos.length === 0) return;

        const thumbTrack = document.getElementById('photo-thumbnails-track');
        const featureImg = document.getElementById('main-feature-img');
        const featureTitle = document.getElementById('feature-photo-title');
        const featureDesc = document.getElementById('feature-photo-desc');

        function updateFeature(photo) {
            featureImg.style.opacity = '0.3';
            setTimeout(() => {
                featureImg.src = photo.src;
                featureTitle.innerText = photo.title + ' —';
                featureDesc.innerText = photo.description;
                featureImg.style.opacity = '1';
            }, 300);
        }

        thumbTrack.innerHTML = homePhotos.map((photo, index) => `
            <div class="thumbnail-item ${index === 0 ? 'active' : ''}" data-index="${index}">
                <img src="${photo.src}" alt="${photo.title}">
            </div>
        `).join('');

        const thumbs = thumbTrack.querySelectorAll('.thumbnail-item');
        thumbs.forEach((thumb, i) => {
            thumb.addEventListener('mouseenter', () => {
                thumbs.forEach(t => t.classList.remove('active'));
                thumb.classList.add('active');
                updateFeature(homePhotos[i]);
            });
        });

        // Init first one
        updateFeature(homePhotos[0]);

    } catch (e) {
        console.error("Photo error:", e);
    }
}
