document.addEventListener('DOMContentLoaded', () => {
    const shelves = document.getElementById('music-shelves');
    if (!shelves) return;

    let songs = [];
    let renderedColumnCount = 0;
    let resizeTimer = null;
    const exhibitionLaunch = document.getElementById('exhibition-launch');
    const exhibition = document.getElementById('record-exhibition');
    const ring = exhibition.querySelector('.exhibition-ring');
    const galleryAudio = document.getElementById('exhibition-audio');
    galleryAudio.volume = 0.25;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let rotation = null;
    let materialAnimations = [];
    let captionTimer = 0;
    let exhibitionIndex = -1;
    let previousOverflow = '';

    exhibitionLaunch.addEventListener('click', openExhibition);
    exhibition.querySelector('.exhibition-close').addEventListener('click', () => exhibition.close());
    exhibition.addEventListener('close', () => {
        rotation?.cancel();
        rotation = null;
        materialAnimations.forEach(animation => animation.cancel());
        materialAnimations = [];
        window.clearInterval(captionTimer);
        captionTimer = 0;
        galleryAudio.pause();
        galleryAudio.currentTime = 0;
        document.body.style.overflow = previousOverflow;
        ring.replaceChildren();
        exhibitionLaunch.focus({ preventScroll: true });
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) galleryAudio.pause();
        updateExhibitionMotion();
    });
    reducedMotion.addEventListener('change', updateExhibitionMotion);

    function openExhibition() {
        if (!songs.length || exhibition.open) return;
        ring.replaceChildren();
        const platter = document.createElement('div');
        platter.className = 'exhibition-platter';
        ring.append(platter);
        const bearing = document.createElement('div');
        bearing.className = 'exhibition-bearing';
        for (let segment = 0; segment < 36; segment += 1) {
            const face = document.createElement('div');
            face.className = 'exhibition-bearing-face';
            face.style.setProperty('--segment-angle', `${segment * 10}deg`);
            const shine = document.createElement('span');
            shine.className = 'bearing-shine';
            face.append(shine);
            if (segment % 3 === 0) {
                const light = document.createElement('span');
                light.className = 'bearing-lamp';
                face.append(light);
            }
            bearing.append(face);
            animateMaterial(shine, [{opacity: 0.62}, {opacity: 0.04, offset: 0.25}, {opacity: 0.3, offset: 0.5}, {opacity: 0.04, offset: 0.75}, {opacity: 0.62}], segment / 36);
        }
        ring.append(bearing);
        songs.forEach((song, index) => {
            const card = document.createElement('div');
            card.className = 'exhibition-card';
            card.style.setProperty('--card-angle', `${index * 360 / songs.length}deg`);
            const artwork = createArtworkLink(song).firstElementChild;
            artwork.querySelectorAll('.slot-play').forEach(node => node.remove());
            artwork.querySelectorAll('img').forEach(img => { img.loading = 'eager'; });
            const reflection = document.createElement('span');
            reflection.className = 'exhibition-specular';
            const glint = document.createElement('span');
            reflection.append(glint);
            artwork.querySelector('.sleeve-pack').append(reflection);
            animateMaterial(glint, [
                {transform: 'translateX(-110%)', opacity: 0},
                {transform: 'translateX(-35%)', opacity: 0.32, offset: 0.22},
                {transform: 'translateX(45%)', opacity: 0.08, offset: 0.44},
                {transform: 'translateX(110%)', opacity: 0, offset: 0.6},
                {transform: 'translateX(110%)', opacity: 0}
            ], index / songs.length);
            card.append(artwork);
            const back = document.createElement('div');
            back.className = 'exhibition-back';
            back.append(artwork.querySelector('.vinyl-record').cloneNode(true));
            const jacket = document.createElement('div');
            jacket.className = 'exhibition-back-jacket';
            const backArt = document.createElement('div');
            backArt.className = 'exhibition-back-art';
            appendCoverImage(backArt, song, true);
            const backCopy = document.createElement('div');
            backCopy.className = 'exhibition-back-copy';
            const edition = document.createElement('small');
            edition.textContent = 'DEAN HUO · RECORD COLLECTION';
            const backTitle = document.createElement('strong');
            backTitle.textContent = song.title || 'Untitled';
            const side = document.createElement('span');
            side.textContent = `SIDE B / ${String(index + 1).padStart(2, '0')}`;
            backCopy.append(edition, backTitle, side);
            jacket.append(backArt, backCopy);
            back.append(jacket);
            card.append(back);
            ['left', 'right', 'top', 'bottom'].forEach(edge => {
                const thickness = document.createElement('span');
                thickness.className = `exhibition-edge exhibition-edge-${edge}`;
                card.append(thickness);
            });
            ring.append(card);
        });
        exhibitionIndex = -1;
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        exhibition.showModal();
        exhibition.querySelector('.exhibition-hint').textContent = '古典钢琴伴奏 · Esc 退出';
        // The user's entry click provides the browser gesture required for audio.
        galleryAudio.play().then(() => {
            if (!exhibition.open) galleryAudio.pause();
        }).catch(() => {
            if (exhibition.open) exhibition.querySelector('.exhibition-hint').textContent = '本次为静音展示 · Esc 退出';
        });
        sizeExhibition();
        // One compositor-driven transform, independent of JS frame delivery.
        rotation = ring.animate([
            { transform: 'rotateY(0deg)' },
            { transform: 'rotateY(-360deg)' }
        ], { duration: 90000, iterations: Infinity, easing: 'linear' });
        rotation.currentTime = 0;
        paintExhibition();
        updateExhibitionMotion();
    }

    function animateMaterial(element, keyframes, phase) {
        const animation = element.animate(keyframes, { duration: 90000, iterations: Infinity, easing: 'linear' });
        animation.pause();
        animation.currentTime = phase * 90000;
        materialAnimations.push(animation);
    }

    function sizeExhibition() {
        if (!exhibition.open) return;
        const stageWidth = exhibition.querySelector('.exhibition-cabinet-stage').getBoundingClientRect().width;
        const radius = stageWidth * 0.285;
        // Use the chord between neighbours, not a fixed cover size: reserve 18% for a clear gap.
        const chord = 2 * radius * Math.sin(Math.PI / Math.max(2, songs.length));
        const width = Math.min(stageWidth * 0.15, chord * 0.82);
        exhibition.style.setProperty('--exhibit-width', `${width}px`);
        exhibition.style.setProperty('--exhibit-radius', `${radius}px`);
        exhibition.style.setProperty('--exhibit-perspective', `${stageWidth * 1.6}px`);
        exhibition.style.setProperty('--platter-radius', `${stageWidth * 0.33}px`);
        exhibition.style.setProperty('--bearing-radius', `${stageWidth * 0.306}px`);
        exhibition.style.setProperty('--bearing-face-width', `${2 * stageWidth * 0.306 * Math.tan(Math.PI / 36) + 0.6}px`);
        exhibition.style.setProperty('--bearing-height', `${stageWidth / 1.89 * 0.025}px`);
        exhibition.style.setProperty('--bearing-drop', `${stageWidth / 1.89 * 0.039}px`);
    }

    function paintExhibition() {
        const progress = ((Number(rotation?.currentTime) || 0) % 90000) / 90000;
        const index = Math.round(progress * songs.length) % songs.length;
        if (index !== exhibitionIndex) {
            exhibitionIndex = index;
            exhibition.querySelector('.exhibition-song').textContent = songs[index].title || 'Untitled';
            exhibition.querySelector('.exhibition-counter').textContent = `${String(index + 1).padStart(2, '0')} / ${String(songs.length).padStart(2, '0')} · RECORD COLLECTION`;
        }
    }

    function updateExhibitionMotion() {
        window.clearInterval(captionTimer);
        captionTimer = 0;
        if (!rotation || !exhibition.open) return;
        if (document.hidden || reducedMotion.matches || songs.length === 1) {
            rotation.pause();
            materialAnimations.forEach(animation => animation.pause());
        }
        else {
            rotation.play();
            materialAnimations.forEach(animation => animation.play());
            // Text is sampled at 5 Hz; visual motion follows the display refresh rate.
            captionTimer = window.setInterval(paintExhibition, 200);
        }
    }

    Promise.all([
        fetch('assets/data/music.json', { cache: 'no-cache' }).then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        }),
        window.DeanRecommendations
            ? window.DeanRecommendations.loadConfig()
            : Promise.resolve(null)
    ])
        .then(([catalogue, recommendationConfig]) => {
            songs = getVisibleResources(catalogue);
            if (window.DeanRecommendations) {
                songs = window.DeanRecommendations.prioritizeByModule(
                    songs,
                    recommendationConfig,
                    'musicPageFeatured'
                );
            }
            renderShelves(true);
            exhibitionLaunch.disabled = !songs.length;
        })
        .catch(error => {
            console.error('Error loading music:', error);
            shelves.innerHTML = '<p class="music-error" role="alert">Failed to load music works.</p>';
        });

    window.addEventListener('resize', () => {
        sizeExhibition();
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => renderShelves(false), 120);
    });

    function renderShelves(force) {
        const columnCount = getColumnCount();
        if (!force && renderedColumnCount === columnCount) return;
        renderedColumnCount = columnCount;

        shelves.replaceChildren();
        if (!songs.length) {
            const empty = document.createElement('p');
            empty.className = 'music-empty';
            empty.textContent = 'The record shelf is waiting for its first song.';
            shelves.appendChild(empty);
            return;
        }

        const fragment = document.createDocumentFragment();
        for (let start = 0; start < songs.length; start += columnCount) {
            fragment.appendChild(createShelfRow(songs.slice(start, start + columnCount), columnCount));
        }
        shelves.appendChild(fragment);

        if (window.lucide) window.lucide.createIcons();
    }

    function createShelfRow(rowSongs, columnCount) {
        const row = document.createElement('div');
        row.className = 'music-shelf-row';
        row.style.setProperty('--slot-count', String(columnCount));

        const artGrid = document.createElement('div');
        artGrid.className = 'shelf-art-grid';

        const board = document.createElement('div');
        board.className = 'shelf-board';
        board.setAttribute('aria-hidden', 'true');

        const lights = document.createElement('div');
        lights.className = 'shelf-lights';
        for (let index = 0; index < 2; index += 1) {
            const light = document.createElement('span');
            light.className = 'shelf-light';
            lights.appendChild(light);
        }
        board.appendChild(lights);

        const infoGrid = document.createElement('div');
        infoGrid.className = 'shelf-info-grid';

        rowSongs.forEach(song => {
            artGrid.appendChild(createArtworkLink(song));
            infoGrid.appendChild(createInfoLink(song));
        });

        row.append(artGrid, board, infoGrid);
        return row;
    }

    function createArtworkLink(song) {
        const link = document.createElement('a');
        link.className = 'slot-artwork';
        link.href = getSongUrl(song);
        link.setAttribute('aria-label', `Play ${song.title || 'this song'}`);

        const media = document.createElement('div');
        media.className = 'slot-media';

        const record = document.createElement('div');
        record.className = 'vinyl-record';
        record.setAttribute('aria-hidden', 'true');

        const label = document.createElement('span');
        label.className = 'vinyl-label';
        appendCoverImage(label, song, true);

        const labelDot = document.createElement('span');
        labelDot.className = 'vinyl-label-dot';
        record.append(label, labelDot);

        const sleeve = document.createElement('div');
        sleeve.className = 'album-sleeve';
        appendCoverImage(sleeve, song, false);

        const pack = document.createElement('div');
        pack.className = 'sleeve-pack';
        const spine = document.createElement('span');
        spine.className = 'sleeve-spine';
        spine.setAttribute('aria-hidden', 'true');
        const film = document.createElement('span');
        film.className = 'sleeve-film';
        film.setAttribute('aria-hidden', 'true');
        const patina = document.createElement('span');
        patina.className = 'sleeve-patina';
        patina.setAttribute('aria-hidden', 'true');
        applySleeveMaterial(pack, song);
        pack.append(spine, sleeve, patina, film);

        const sticker = document.createElement('span');
        sticker.className = 'record-label-sticker';
        sticker.setAttribute('aria-hidden', 'true');
        const stickerImage = document.createElement('img');
        stickerImage.src = 'assets/images/emi-records-sticker.png';
        stickerImage.alt = '';
        stickerImage.decoding = 'async';
        sticker.append(stickerImage);
        pack.append(sticker);

        const stopLeft = document.createElement('span');
        stopLeft.className = 'sleeve-stop sleeve-stop-left';
        stopLeft.setAttribute('aria-hidden', 'true');

        const stopRight = document.createElement('span');
        stopRight.className = 'sleeve-stop sleeve-stop-right';
        stopRight.setAttribute('aria-hidden', 'true');

        const play = document.createElement('span');
        play.className = 'slot-play';
        play.setAttribute('aria-hidden', 'true');
        play.innerHTML = '<i data-lucide="play"></i>';

        media.append(record, pack, stopLeft, stopRight, play);
        link.appendChild(media);
        return link;
    }

    function createInfoLink(song) {
        const link = document.createElement('a');
        link.className = 'slot-info';
        link.href = getSongUrl(song);

        const title = document.createElement('h2');
        title.className = 'slot-title';
        title.textContent = song.title || 'Untitled';

        const caption = document.createElement('div');
        caption.className = 'slot-caption';
        caption.append(title);
        link.append(caption);
        return link;
    }

    function appendCoverImage(container, song, isLabel) {
        const cover = typeof song.cover === 'string' ? song.cover.trim() : '';
        if (!cover) {
            if (!isLabel) container.appendChild(createCoverPlaceholder());
            return;
        }

        const image = document.createElement('img');
        image.src = cover;
        image.alt = isLabel ? '' : `${song.title || 'Music'} cover`;
        image.loading = 'lazy';
        image.decoding = 'async';
        image.addEventListener('error', () => {
            image.remove();
            if (!isLabel && !container.querySelector('.cover-placeholder')) {
                container.appendChild(createCoverPlaceholder());
            }
        }, { once: true });
        container.appendChild(image);
    }

    function createCoverPlaceholder() {
        const placeholder = document.createElement('div');
        placeholder.className = 'cover-placeholder';
        placeholder.innerHTML = '<i data-lucide="disc-3"></i><span>Cover coming soon</span>';
        return placeholder;
    }

    // Stable per-song wear: resizing or reordering must not change a jacket's identity.
    function applySleeveMaterial(pack, song) {
        let seed = 2166136261;
        for (const char of String(song.id || song.title || 'record')) {
            seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
        }
        const materialSeed = seed;
        const random = () => {
            seed += 0x6D2B79F5;
            let value = seed;
            value = Math.imul(value ^ value >>> 15, value | 1);
            value ^= value + Math.imul(value ^ value >>> 7, value | 61);
            return ((value ^ value >>> 14) >>> 0) / 4294967296;
        };
        const number = (low, high) => (low + random() * (high - low)).toFixed(2);
        const quadrant = Math.floor(random() * 4);
        const rotation = Math.floor(random() * 4) * 90;
        const flip = random() < 0.5 ? -1 : 1;
        pack.dataset.materialSeed = String(materialSeed);
        pack.style.setProperty('--film-position', `${quadrant % 2 * 100}% ${Math.floor(quadrant / 2) * 100}%`);
        pack.style.setProperty('--film-transform', `rotate(${rotation}deg) scaleX(${flip})`);
        pack.style.setProperty('--film-size', `${number(204, 217)}%`);
        pack.style.setProperty('--film-opacity', number(0.60, 0.99));
        pack.style.setProperty('--film-seam', `${number(-0.6, 0.6)}deg`);

        const marks = [];
        // Dust collects unevenly, mostly near the jacket edges.
        for (let i = 0; i < 80; i += 1) {
            let x = random() * 300;
            let y = random() * 300;
            if (random() < 0.7) {
                if (random() < 0.5) x = random() < 0.5 ? random() * 24 : 276 + random() * 24;
                else y = random() < 0.5 ? random() * 24 : 276 + random() * 24;
            }
            const color = random() < 0.72 ? '#332b20' : '#e5d7b5';
            marks.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${number(0.2, 0.95)}" fill="${color}" opacity="${number(0.30, 0.90)}"/>`);
        }
        for (let i = 0; i < 4; i += 1) {
            const x = random() < 0.5 ? number(3, 30) : number(270, 297);
            const y = number(12, 290);
            marks.push(`<ellipse cx="${x}" cy="${y}" rx="${number(3, 11)}" ry="${number(4, 16)}" fill="#594932" opacity="${number(0.15, 0.315)}" filter="url(#rub)"/>`);
        }
        for (let i = 0; i < 7; i += 1) {
            const x = number(3, 294);
            const y = random() < 0.5 ? number(1, 4) : number(296, 299);
            marks.push(`<path d="M${x} ${y} l${number(1, 6)} ${number(-0.8, 0.8)}" stroke="#e1cfab" stroke-width="${number(0.45, 1.2)}" opacity="${Math.min(1, Number(number(0.54, 1.125)))}"/>`);
        }
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><defs><filter id="rub"><feGaussianBlur stdDeviation="2.2"/></filter></defs>${marks.join('')}</svg>`;
        pack.style.setProperty('--patina-image', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
        // Stable hand-applied placement; changing the label does not reshuffle the sleeve wear.
        pack.style.setProperty('--sticker-angle', `${number(-2.2, 1.6)}deg`);
        pack.style.setProperty('--sticker-top', `${number(4, 7)}px`);
        pack.style.setProperty('--sticker-right', `${number(4, 6)}px`);
    }

    function getSongUrl(song) {
        return `music-player.html?id=${encodeURIComponent(song.id || '')}`;
    }

    function getColumnCount() {
        if (window.innerWidth >= 1180) return 4;
        if (window.innerWidth >= 820) return 3;
        if (window.innerWidth >= 560) return 2;
        return 1;
    }

    function getVisibleResources(items) {
        if (window.DeanRecommendations && window.DeanRecommendations.filterVisible) {
            return window.DeanRecommendations.filterVisible(items);
        }
        return Array.isArray(items) ? items.filter(item => item && !item.deletedAt) : [];
    }

    if (window.lucide) window.lucide.createIcons();
});
