document.addEventListener('DOMContentLoaded', () => {
    const shelves = document.getElementById('music-shelves');
    if (!shelves) return;

    let songs = [];
    let renderedColumnCount = 0;
    let resizeTimer = null;

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
        })
        .catch(error => {
            console.error('Error loading music:', error);
            shelves.innerHTML = '<p class="music-error" role="alert">Failed to load music works.</p>';
        });

    window.addEventListener('resize', () => {
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
