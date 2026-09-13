(() => {
    const dialog = document.getElementById('photo-exhibition');
    const entry = document.getElementById('open-photo-exhibition');
    const stage = dialog.querySelector('.photo-exhibition-stage');
    const counter = dialog.querySelector('.photo-exhibition-counter');
    const progress = dialog.querySelector('.photo-exhibition-progress span');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const frames = new Map();
    let photos = [], position = 0, target = 0, raf = 0, lastTime = 0;
    let width = 1, height = 1, spacing = 1, radius = 1, angleStep = .21;
    let pointer = null, previousOverflow = '', savedFocus = null, announced = -1;
    const wrap = index => ((index % photos.length) + photos.length) % photos.length;

    window.DeanPhotoExhibition = {
        setPhotos(items) {
            photos = items.filter(photo => photo && photo.src && !photo.deletedAt);
            entry.disabled = !photos.length;
        }
    };

    function makeFrame(index) {
        const photo = photos[wrap(index)];
        const frame = document.createElement('figure');
        frame.className = 'photo-exhibition-frame';
        const mat = document.createElement('div');
        mat.className = 'photo-exhibition-mat';
        const img = document.createElement('img');
        img.alt = photo.description || photo.title || '摄影作品';
        img.draggable = false;
        const onError = () => {
            const message = document.createElement('span');
            message.className = 'photo-exhibition-image-error';
            message.textContent = '照片暂时无法加载';
            mat.replaceChildren(message);
        };
        if (window.DeanImages) {
            window.DeanImages.applyResponsivePhoto(img, photo.src, {
                eager: true, defaultWidth: 640, sizes: '(max-width: 600px) 65vw, 24vw', onError
            });
        } else { img.src = photo.src; img.onerror = onError; }
        mat.append(img);
        const caption = document.createElement('figcaption');
        const number = document.createElement('small');
        number.textContent = String(wrap(index) + 1).padStart(2, '0');
        caption.append(number, document.createTextNode(/^img\d+$/i.test(photo.title || '') ? '光影记录' : (photo.title || '摄影作品')));
        frame.append(mat, caption);
        stage.append(frame);
        frames.set(index, frame);
        return frame;
    }

    function measure() {
        width = stage.clientWidth;
        height = stage.clientHeight;
        const mobile = width <= 600;
        spacing = mobile ? width * .73 : width * .205;
        radius = mobile ? width * 1.8 : width;
        angleStep = spacing / radius;
        stage.style.perspective = `${width * (mobile ? 2.6 : 1.65)}px`;
        render();
    }

    function render() {
        if (!dialog.open || !photos.length) return;
        const center = Math.round(position);
        const reach = width <= 600 ? 2 : 4;
        const visibleKeys = new Set();
        const frameWidth = Math.min(width * (width <= 600 ? .59 : .153), height * .30);
        const frameHeight = Math.min(height * .34, frameWidth * 1.28);
        for (let index = center - reach; index <= center + reach; index++) {
            // Small catalogues should never repeat the same photo on the wall.
            if (photos.length < reach * 2 + 1 && Math.abs(index - position) > (photos.length - 1) / 2) continue;
            visibleKeys.add(index);
            const frame = frames.get(index) || makeFrame(index);
            const distance = index - position;
            const angle = distance * angleStep;
            const x = Math.sin(angle) * radius;
            const z = (1 - Math.cos(angle)) * radius;
            frame.style.width = `${frameWidth}px`;
            frame.style.height = `${frameHeight}px`;
            frame.style.transform = `translate(-50%, -50%) translate3d(${x}px, 0, ${z}px) rotateY(${-angle}rad)`;
            frame.style.opacity = String(Math.max(0, Math.min(1, reach - Math.abs(distance))));
            frame.setAttribute('aria-hidden', Math.abs(distance) > .5 ? 'true' : 'false');
        }
        for (const [key, frame] of frames) {
            if (!visibleKeys.has(key)) { frame.remove(); frames.delete(key); }
        }
        const active = wrap(center);
        if (Math.abs(position - target) < .01 && active !== announced) {
            counter.textContent = `${String(active + 1).padStart(2, '0')} / ${String(photos.length).padStart(2, '0')}`;
            progress.style.transform = `scaleX(${(active + 1) / photos.length})`;
            announced = active;
        }
    }

    function animate(time) {
        raf = 0;
        const delta = lastTime ? Math.min(time - lastTime, 40) : 16;
        lastTime = time;
        position += (target - position) * (1 - Math.exp(-delta / 115));
        if (Math.abs(target - position) < .001) position = target;
        render();
        if (position !== target) raf = requestAnimationFrame(animate);
        else lastTime = 0;
    }

    function moveTo(next) {
        target = next;
        if (reducedMotion.matches) { cancelAnimationFrame(raf); raf = 0; position = target; render(); }
        else if (!raf) raf = requestAnimationFrame(animate);
    }

    entry.addEventListener('click', () => {
        if (!photos.length || dialog.open) return;
        savedFocus = document.activeElement;
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        dialog.showModal();
        measure();
        dialog.querySelector('.photo-exhibition-close').focus({ preventScroll: true });
    });
    dialog.querySelector('.photo-exhibition-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
        cancelAnimationFrame(raf); raf = 0; lastTime = 0;
        position = target = Math.round(position);
        pointer = null;
        stage.classList.remove('is-dragging');
        document.body.style.overflow = previousOverflow;
        savedFocus?.focus({ preventScroll: true });
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
        cancelAnimationFrame(raf); raf = 0; lastTime = 0;
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
    new ResizeObserver(() => { if (dialog.open) measure(); }).observe(stage);
})();
