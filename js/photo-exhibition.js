(() => {
    const dialog = document.getElementById('photo-exhibition');
    const entry = document.getElementById('open-photo-exhibition');
    const stage = dialog.querySelector('.photo-exhibition-stage');
    const counter = dialog.querySelector('.photo-exhibition-counter');
    const progress = dialog.querySelector('.photo-exhibition-progress span');
    const autoplayButton = dialog.querySelector('.photo-exhibition-autoplay');
    const galleryAudio = dialog.querySelector('#photo-exhibition-audio');
    const soundButton = dialog.querySelector('.photo-exhibition-sound');
    const music = window.createPhotoGalleryMusic({ audio: galleryAudio, button: soundButton });
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const entrance = window.createPhotoGalleryIntro({ onStart: music.beginIntro, onCancel: music.stop, onRetry: music.retry });
    const mounts = new Map(), dimensions = new Map();
    let photos = [], position = 0, target = 0, raf = 0, lastTime = 0;
    let width = 1, height = 1, spacing = 1, radius = 1, angleStep = .24;
    let pointer = null, previousOverflow = '', savedFocus = null, announced = -1;
    let autoplay = !reducedMotion.matches, holdUntil = 0, settling = false;
    let exhibitionScene = null, scenePromise = null;
    const viewer = window.createPhotoExhibitionViewer({ reducedMotion, onCameraMove(source, destination, duration) {
        const world = dialog.querySelector('.photo-exhibition-world');
        const centerX = source.left + source.width / 2, centerY = source.top + source.height / 2;
        const dx = destination.left + destination.width / 2 - centerX;
        const dy = destination.top + destination.height / 2 - centerY;
        const scale = Math.min(destination.width / source.width, destination.height / source.height);
        const near = `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`;
        world.style.transformOrigin = `${centerX}px ${centerY}px`;
        dialog.classList.add('is-camera-close');
        let motion = world.animate([{ transform: 'translate3d(0,0,0) scale(1)' }, { transform: near }],
            { duration, easing: 'cubic-bezier(.22,.68,0,1)', fill: 'forwards' });
        return {
            finish() { motion.finish(); },
            reverse() {
                const current = getComputedStyle(world).transform;
                motion.cancel();
                motion = world.animate([{ transform: current }, { transform: 'translate3d(0,0,0) scale(1)' }],
                    { duration: reducedMotion.matches ? 0 : 520, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
            },
            reset() { motion.cancel(); world.style.transformOrigin = ''; dialog.classList.remove('is-camera-close'); }
        };
    }, onClose() {
        if (!dialog.open) return;
        holdUntil = performance.now() + 1500; lastTime = 0;
        dialog.querySelector('.photo-exhibition-inspect').focus({ preventScroll: true });
        start();
    } });
    function inspectPhoto(candidate) {
        if (!candidate) return;
        cancelAnimationFrame(raf); raf = 0; lastTime = 0;
        viewer.show(candidate);
    }
    dialog.querySelector('.photo-exhibition-inspect').addEventListener('click', () => {
        const current = exhibitionScene?.currentPhoto();
        if (current) inspectPhoto(current);
        else {
            const mount = mounts.get(Math.round(position));
            if (mount) inspectPhoto({ photo: photos[wrap(Math.round(position))], ratio: mount.ratio,
                preview: mount.frame.querySelector('img')?.currentSrc, rect: mount.frame.getBoundingClientRect() });
        }
    });
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
        const title = document.createElement('strong');
        title.textContent = /^img\d+$/i.test(photo.title || '') ? '光影记录' : (photo.title || '摄影作品');
        const subtitle = document.createElement('p');
        subtitle.className = 'photo-exhibition-subtitle';
        subtitle.textContent = photo.titleEn || 'A moment in light';
        caption.append(title, subtitle);
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
        if (exhibitionScene) {
            exhibitionScene.resize();
            render();
            return;
        }
        stage.style.perspective = radius + 'px';
        mounts.forEach(sizeMount);
        render();
    }

    function render() {
        if (!dialog.open || !photos.length) return;
        if (exhibitionScene) {
            exhibitionScene.render(position);
            announcePosition();
            return;
        }
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
        announcePosition();
    }

    function announcePosition() {
        const active = wrap(Math.round(position));
        if (active !== announced) {
            counter.textContent = String(active + 1).padStart(2, '0') + ' / ' + String(photos.length).padStart(2, '0');
            progress.style.transform = 'scaleX(' + ((active + 1) / photos.length) + ')';
            announced = active;
        }
    }

    function canAnimate() { return dialog.open && !viewer.open && !document.hidden && !pointer; }
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
            // Travel at a constant wall-arc speed, without accelerating at format changes.
            position = exhibitionScene ? exhibitionScene.advance(position, delta / 1000) : position + delta / 14000;
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

    function openGallery() {
        savedFocus = entry;
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        dialog.showModal();
        music.enterGallery();
        if (!scenePromise) {
            stage.classList.add('is-loading-screen');
            scenePromise = import('./photo-exhibition-scene.js?v=12').then(module => module.createPhotoScreen(stage, photos)).then(scene => {
                exhibitionScene = scene;
                mounts.clear();
                if (dialog.open) { measure(); render(); }
            }).catch(error => {
                console.warn('Curved screen unavailable; retaining CSS exhibition.', error);
                stage.dataset.renderer = 'css-fallback';
            }).finally(() => stage.classList.remove('is-loading-screen'));
        }
        holdUntil = performance.now() + 1800;
        updateAutoplay();
        measure();
        start();
        dialog.querySelector('.photo-exhibition-close').focus({ preventScroll: true });
    }
    entry.addEventListener('click', () => {
        if (!photos.length || dialog.open || entrance.open) return;
        entrance.begin(openGallery);
    });
    dialog.querySelector('.photo-exhibition-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
        viewer.close(true);
        music.stop();
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
        pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, origin: position, moved: false };
        target = position;
        stage.setPointerCapture(event.pointerId);
        stage.classList.add('is-dragging');
    });
    stage.addEventListener('pointermove', event => {
        if (!pointer || event.pointerId !== pointer.id) return;
        if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 7) pointer.moved = true;
        if (!pointer.moved) return;
        position = target = pointer.origin + (pointer.x - event.clientX) / spacing;
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); });
    });
    function finishDrag(event) {
        if (!pointer || event.pointerId !== pointer.id) return;
        const tap = event.type === 'pointerup' && !pointer.moved;
        pointer = null;
        stage.classList.remove('is-dragging');
        if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
        cancelAnimationFrame(raf); raf = 0;
        if (tap) {
            let selected = exhibitionScene?.pick(event.clientX, event.clientY);
            if (!exhibitionScene) for (const [index, mount] of mounts) {
                const rect = mount.frame.getBoundingClientRect();
                if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) {
                    selected = { photo: photos[wrap(index)], preview: mount.frame.querySelector('img')?.currentSrc, ratio: mount.ratio, rect }; break;
                }
            }
            if (selected) { inspectPhoto(selected); return; }
            start(); return;
        }
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
