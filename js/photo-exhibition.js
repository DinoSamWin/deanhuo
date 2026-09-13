(() => {
    const dialog = document.getElementById('photo-exhibition');
    const entry = document.getElementById('open-photo-exhibition');
    const stage = dialog.querySelector('.photo-exhibition-stage');
    const counter = dialog.querySelector('.photo-exhibition-counter');
    const progress = dialog.querySelector('.photo-exhibition-progress span');
    const autoplayButton = dialog.querySelector('.photo-exhibition-autoplay');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const mounts = new Map(), dimensions = new Map();
    let photos = [], position = 0, target = 0, raf = 0, lastTime = 0;
    let width = 1, height = 1, spacing = 1, radius = 1, angleStep = .24;
    let pointer = null, previousOverflow = '', savedFocus = null, announced = -1;
    let autoplay = !reducedMotion.matches, holdUntil = 0, settling = false;
    const wrap = index => ((index % photos.length) + photos.length) % photos.length;
    window.DeanPhotoExhibition = {
        setPhotos(items) {
            photos = items.filter(photo => photo && photo.src && !photo.deletedAt);
            entry.disabled = !photos.length;
        }
    };

    function makeMount(index) {
        const photo = photos[wrap(index)];
        const panel = document.createElement('div');
        panel.className = 'photo-exhibition-wall';
        const surface = document.createElement('div');
        surface.className = 'photo-exhibition-wall-surface';
        surface.setAttribute('aria-hidden', 'true');
        const frame = document.createElement('figure');
        frame.className = 'photo-exhibition-frame';
        const mat = document.createElement('div');
        mat.className = 'photo-exhibition-mat';
        const img = document.createElement('img');
        img.alt = photo.description || photo.title || '摄影作品';
        img.draggable = false;
        const mount = { panel, surface, frame, ratio: dimensions.get(photo.src) || 1, index };
        img.onload = () => {
            if (!img.naturalWidth || !img.naturalHeight) return;
            mount.ratio = img.naturalWidth / img.naturalHeight;
            dimensions.set(photo.src, mount.ratio);
            sizeMount(mount);
            frame.classList.add('is-ready');
        };
        const onError = () => {
            const message = document.createElement('span');
            message.className = 'photo-exhibition-image-error';
            message.textContent = '照片暂时无法加载';
            mat.replaceChildren(message);
            frame.classList.add('is-ready');
        };
        if (window.DeanImages) {
            window.DeanImages.applyResponsivePhoto(img, photo.src, {
                eager: true, defaultWidth: 640, sizes: '(max-width: 600px) 70vw, 24vw', onError
            });
        } else { img.src = photo.src; img.onerror = onError; }
        mat.append(img);
        const caption = document.createElement('figcaption');
        const number = document.createElement('small');
        number.textContent = String(wrap(index) + 1).padStart(2, '0');
        const title = document.createElement('strong');
        title.textContent = /^img\d+$/i.test(photo.title || '') ? '光影记录' : (photo.title || '摄影作品');
        caption.append(number, title);
        if (photo.description?.trim()) {
            const description = document.createElement('p');
            description.className = 'photo-exhibition-description';
            description.textContent = photo.description.trim();
            description.title = photo.description.trim();
            caption.append(description);
        }
        frame.append(mat, caption);
        panel.append(surface, frame);
        stage.append(panel);
        mounts.set(index, mount);
        sizeMount(mount);
        return mount;
    }

    function sizeMount(mount) {
        // Photograph, label and contact shadow share their tangent wall plane.
        const panelWidth = 2 * radius * Math.tan(angleStep / 2);
        const wallHeight = height * .46;
        const maxWidth = panelWidth * .80;
        const maxHeight = wallHeight * .70;
        const imageWidth = Math.min(maxWidth, maxHeight * mount.ratio);
        const imageHeight = imageWidth / mount.ratio;
        mount.panel.style.width = (panelWidth + .7) + 'px';
        mount.panel.style.height = wallHeight + 'px';
        mount.frame.style.width = (imageWidth + 4) + 'px';
        mount.frame.style.height = (imageHeight + 4) + 'px';
        // Continuous photographic plaster material, cropped to the wall band.
        const materialColumn = ((mount.index % 9) + 9) % 9 + 3;
        mount.surface.style.backgroundSize = (panelWidth * 15) + 'px ' + (wallHeight * 3.4) + 'px';
        mount.surface.style.backgroundPosition = (-materialColumn * panelWidth) + 'px 55%';
    }

    function measure() {
        width = stage.clientWidth;
        height = stage.clientHeight;
        const mobile = width <= 800;
        radius = width * (mobile ? 1.5 : .90);
        angleStep = mobile ? .52 : .24;
        spacing = radius * angleStep;
        stage.style.perspective = radius + 'px';
        mounts.forEach(sizeMount);
        render();
    }

    function render() {
        if (!dialog.open || !photos.length) return;
        const center = Math.round(position);
        const reach = width <= 800 ? 2 : 4;
        const visibleKeys = new Set();
        for (let index = center - reach; index <= center + reach; index++) {
            visibleKeys.add(index);
            const mount = mounts.get(index) || makeMount(index);
            const distance = index - position;
            const angle = distance * angleStep;
            const x = Math.sin(angle) * radius;
            const z = radius * (1 - Math.cos(angle));
            mount.panel.style.transform = 'translate(-50%, -50%) translate3d(' + x + 'px, 0, ' + z + 'px) rotateY(' + (-angle) + 'rad)';
            mount.frame.hidden = photos.length < reach * 2 + 1 && Math.abs(distance) > (photos.length - 1) / 2;
            mount.frame.setAttribute('aria-hidden', Math.abs(distance) > .5 ? 'true' : 'false');
        }
        for (const [key, mount] of mounts) {
            if (!visibleKeys.has(key)) { mount.panel.remove(); mounts.delete(key); }
        }
        const active = wrap(center);
        if (active !== announced) {
            counter.textContent = String(active + 1).padStart(2, '0') + ' / ' + String(photos.length).padStart(2, '0');
            progress.style.transform = 'scaleX(' + ((active + 1) / photos.length) + ')';
            announced = active;
        }
    }

    function canAnimate() { return dialog.open && !document.hidden && !pointer; }
    function start() {
        if (!raf && canAnimate() && (settling || autoplay)) raf = requestAnimationFrame(animate);
    }
    function animate(time) {
        raf = 0;
        if (!canAnimate()) { lastTime = 0; return; }
        const delta = lastTime ? Math.min(time - lastTime, 40) : 0;
        lastTime = time;
        if (settling) {
            position += (target - position) * (1 - Math.exp(-delta / 115));
            if (Math.abs(target - position) < .001) { position = target; settling = false; }
        } else if (autoplay && time >= holdUntil && photos.length > 1) {
            // One work every 14 seconds, independent of display refresh rate.
            position += delta / 14000;
            target = position;
        }
        render();
        start();
        if (!raf) lastTime = 0;
    }
    function updateAutoplay() {
        autoplayButton.textContent = autoplay ? '暂停巡展' : '自动巡展';
        autoplayButton.setAttribute('aria-pressed', String(autoplay));
        counter.setAttribute('aria-live', autoplay ? 'off' : 'polite');
    }
    function moveTo(next) {
        holdUntil = performance.now() + 5000;
        target = next;
        settling = !reducedMotion.matches;
        if (!settling) { position = target; render(); }
        start();
    }

    entry.addEventListener('click', () => {
        if (!photos.length || dialog.open) return;
        savedFocus = document.activeElement;
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        dialog.showModal();
        holdUntil = performance.now() + 1800;
        updateAutoplay();
        measure();
        start();
        dialog.querySelector('.photo-exhibition-close').focus({ preventScroll: true });
    });
    dialog.querySelector('.photo-exhibition-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
        cancelAnimationFrame(raf); raf = 0; lastTime = 0;
        position = target = Math.round(position); settling = false;
        pointer = null;
        stage.classList.remove('is-dragging');
        document.body.style.overflow = previousOverflow;
        savedFocus?.focus({ preventScroll: true });
    });
    autoplayButton.addEventListener('click', () => {
        autoplay = !autoplay;
        holdUntil = 0;
        updateAutoplay();
        start();
    });
    dialog.querySelector('.photo-exhibition-prev').addEventListener('click', () => moveTo(Math.round(target) - 1));
    dialog.querySelector('.photo-exhibition-next').addEventListener('click', () => moveTo(Math.round(target) + 1));
    dialog.addEventListener('keydown', event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            moveTo(Math.round(target) + (event.key === 'ArrowRight' ? 1 : -1));
        }
    });
    stage.addEventListener('pointerdown', event => {
        if (!event.isPrimary || event.button !== 0) return;
        cancelAnimationFrame(raf); raf = 0; lastTime = 0; settling = false;
        pointer = { id: event.pointerId, x: event.clientX, origin: position };
        target = position;
        stage.setPointerCapture(event.pointerId);
        stage.classList.add('is-dragging');
    });
    stage.addEventListener('pointermove', event => {
        if (!pointer || event.pointerId !== pointer.id) return;
        position = target = pointer.origin + (pointer.x - event.clientX) / spacing;
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); });
    });
    function finishDrag(event) {
        if (!pointer || event.pointerId !== pointer.id) return;
        pointer = null;
        stage.classList.remove('is-dragging');
        if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
        cancelAnimationFrame(raf); raf = 0;
        moveTo(Math.round(position));
    }
    stage.addEventListener('pointerup', finishDrag);
    stage.addEventListener('pointercancel', finishDrag);
    stage.addEventListener('lostpointercapture', finishDrag);
    document.addEventListener('visibilitychange', () => {
        cancelAnimationFrame(raf); raf = 0; lastTime = 0;
        start();
    });
    reducedMotion.addEventListener('change', () => {
        if (reducedMotion.matches) { autoplay = false; settling = false; position = target = Math.round(position); render(); }
        updateAutoplay();
    });
    new ResizeObserver(() => { if (dialog.open) measure(); }).observe(stage);
})();
