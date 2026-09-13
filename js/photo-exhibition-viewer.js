(() => {
    window.createPhotoExhibitionViewer = ({ onClose, reducedMotion, onCameraMove }) => {
        const dialog = document.getElementById('photo-detail-viewer');
        const viewport = dialog.querySelector('.photo-detail-viewport');
        const flight = dialog.querySelector('.photo-detail-flight');
        const art = dialog.querySelector('.photo-detail-art');
        const image = dialog.querySelector('img');
        const title = dialog.querySelector('.photo-detail-title');
        const english = dialog.querySelector('.photo-detail-english');
        const description = dialog.querySelector('.photo-detail-description');
        const status = dialog.querySelector('.photo-detail-status');
        const zoomLabel = dialog.querySelector('.photo-detail-zoom-level');
        const closeButton = dialog.querySelector('.photo-detail-close');
        const veil = dialog.querySelector('.photo-detail-veil');
        const chrome = [dialog.querySelector('.photo-detail-header'), dialog.querySelector('.photo-detail-footer')];
        let cameraMove = null, atmosphere = [];
        let selected = null, token = 0, zoom = 1, panX = 0, panY = 0, fitWidth = 1, fitHeight = 1;
        let animation = null, closing = false, entered = false;
        const pointers = new Map();
        const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

        function paint() {
            const maxX = Math.max(0, (fitWidth * zoom - viewport.clientWidth) / 2);
            const maxY = Math.max(0, (fitHeight * zoom - viewport.clientHeight) / 2);
            panX = clamp(panX, -maxX, maxX); panY = clamp(panY, -maxY, maxY);
            art.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`;
            viewport.classList.toggle('is-zoomed', zoom > 1.01);
            zoomLabel.textContent = Math.round(zoom * 100) + '%';
            dialog.querySelector('[data-zoom="out"]').disabled = zoom <= 1;
            dialog.querySelector('[data-zoom="in"]').disabled = zoom >= 4;
        }
        function fit() {
            if (!selected || !dialog.open) return;
            const ratio = image.naturalWidth / image.naturalHeight || selected.ratio || 1.5;
            fitWidth = Math.min(viewport.clientWidth, viewport.clientHeight * ratio);
            fitHeight = fitWidth / ratio;
            flight.style.width = fitWidth + 'px'; flight.style.height = fitHeight + 'px';
            flight.style.marginLeft = -fitWidth / 2 + 'px'; flight.style.marginTop = -fitHeight / 2 + 'px';
            paint();
        }
        function originTransform() {
            const rect = selected.rect, area = viewport.getBoundingClientRect();
            const dx = rect.left + rect.width / 2 - (area.left + area.width / 2);
            const dy = rect.top + rect.height / 2 - (area.top + area.height / 2);
            return `translate3d(${dx}px, ${dy}px, 0) scale(${rect.width / fitWidth}, ${rect.height / fitHeight})`;
        }
        function enter() {
            if (entered || !selected || !dialog.open) return;
            entered = true; fit();
            dialog.classList.remove('is-awaiting-photo');
            const duration = reducedMotion.matches ? 0 : 1150;
            const area = viewport.getBoundingClientRect();
            cameraMove = onCameraMove?.(selected.rect, { left: area.left + (area.width - fitWidth) / 2,
                top: area.top + (area.height - fitHeight) / 2, width: fitWidth, height: fitHeight }, duration);
            atmosphere = [veil.animate([{ opacity: 0 }, { opacity: 0, offset: .32 }, { opacity: 1 }],
                { duration, easing: 'ease', fill: 'both' }),
                ...chrome.map(element => element.animate([{ opacity: 0 }, { opacity: 1 }],
                    { duration: reducedMotion.matches ? 0 : 400, delay: reducedMotion.matches ? 0 : 650, fill: 'both' }))];
            animation?.cancel();
            animation = flight.animate([
                { transform: originTransform(), opacity: 0 },
                { opacity: 0, offset: .32 },
                { opacity: 1, offset: .78 },
                { transform: 'translate3d(0,0,0) scale(1)', opacity: 1 }
            ], { duration, easing: 'cubic-bezier(.22,.68,0,1)' });
        }
        function setZoom(value, x = 0, y = 0) {
            const next = clamp(value, 1, 4), factor = next / zoom;
            panX = x - (x - panX) * factor; panY = y - (y - panY) * factor;
            zoom = next; paint();
        }
        function point(event) {
            const rect = viewport.getBoundingClientRect();
            return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
        }
        function close(immediate = false) {
            if (!dialog.open || closing) return;
            closing = true; token++; pointers.clear(); animation?.cancel();
            atmosphere.forEach(item => item.cancel());
            if (immediate || reducedMotion.matches || !entered) { dialog.close(); return; }
            cameraMove?.reverse();
            atmosphere = [veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 520, fill: 'forwards' }),
                ...chrome.map(element => element.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }))];
            zoom = 1; panX = panY = 0; paint();
            animation = flight.animate([
                { transform: 'translate3d(0,0,0) scale(1)', opacity: 1 },
                { transform: originTransform(), opacity: 0 }
            ], { duration: 520, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
            animation.finished.then(() => { if (dialog.open) dialog.close(); }).catch(() => {});
        }
        dialog.addEventListener('close', () => {
            token++; animation?.cancel(); animation = null; closing = false; entered = false;
            atmosphere.forEach(item => item.cancel()); atmosphere = []; cameraMove?.reset(); cameraMove = null;
            pointers.clear(); selected = null; image.removeAttribute('src');
            onClose();
        });
        dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
        closeButton.addEventListener('click', () => close());
        dialog.querySelector('[data-zoom="in"]').addEventListener('click', () => setZoom(zoom + .5));
        dialog.querySelector('[data-zoom="out"]').addEventListener('click', () => setZoom(zoom - .5));
        dialog.querySelector('[data-zoom="reset"]').addEventListener('click', () => { zoom = 1; panX = panY = 0; paint(); });
        viewport.addEventListener('wheel', event => {
            event.preventDefault(); const p = point(event);
            const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1);
            setZoom(zoom * Math.exp(-delta * .0018), p.x, p.y);
        }, { passive: false });
        viewport.addEventListener('dblclick', event => { const p = point(event); setZoom(zoom > 1.01 ? 1 : 2.5, p.x, p.y); });
        viewport.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            animation?.finish(); cameraMove?.finish(); atmosphere.forEach(item => item.finish());
            pointers.set(event.pointerId, point(event)); viewport.setPointerCapture(event.pointerId);
        });
        viewport.addEventListener('pointermove', event => {
            if (!pointers.has(event.pointerId)) return;
            const before = [...pointers.values()], previous = pointers.get(event.pointerId), next = point(event);
            pointers.set(event.pointerId, next);
            if (pointers.size === 2) {
                const after = [...pointers.values()];
                const distance = p => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
                const oldX = (before[0].x + before[1].x) / 2, oldY = (before[0].y + before[1].y) / 2;
                setZoom(zoom * distance(after) / Math.max(1, distance(before)), oldX, oldY);
                panX += (after[0].x + after[1].x) / 2 - oldX;
                panY += (after[0].y + after[1].y) / 2 - oldY;
            } else { panX += next.x - previous.x; panY += next.y - previous.y; }
            paint();
        });
        const release = event => { pointers.delete(event.pointerId); };
        viewport.addEventListener('pointerup', release); viewport.addEventListener('pointercancel', release); viewport.addEventListener('lostpointercapture', release);
        dialog.addEventListener('keydown', event => {
            if (['+', '=', '-', '0', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) event.preventDefault();
            if (event.key === '+' || event.key === '=') setZoom(zoom + .5);
            if (event.key === '-') setZoom(zoom - .5);
            if (event.key === '0') { zoom = 1; panX = panY = 0; paint(); }
            if (event.key.startsWith('Arrow')) {
                panX += event.key === 'ArrowLeft' ? 60 : event.key === 'ArrowRight' ? -60 : 0;
                panY += event.key === 'ArrowUp' ? 60 : event.key === 'ArrowDown' ? -60 : 0;
                paint();
            }
        });
        new ResizeObserver(fit).observe(viewport);
        return {
            get open() { return dialog.open; }, close,
            show(candidate) {
                if (!candidate || dialog.open) return;
                selected = candidate; const request = ++token;
                dialog.classList.add('is-awaiting-photo');
                zoom = 1; panX = panY = 0; entered = false;
                title.textContent = /^img\d+$/i.test(candidate.photo.title || '') ? '光影记录' : (candidate.photo.title || '摄影作品');
                english.textContent = candidate.photo.titleEn || 'A moment in light';
                description.textContent = candidate.photo.description || '';
                image.alt = title.textContent; status.textContent = '正在加载高清原图…';
                image.onload = () => { if (request === token) { fit(); enter(); } };
                image.onerror = () => { if (request === token) { dialog.classList.remove('is-awaiting-photo'); status.textContent = '图片加载失败，请返回展墙重试'; } };
                image.src = candidate.preview || candidate.photo.src;
                dialog.showModal(); fit(); closeButton.focus({ preventScroll: true });
                if (image.complete && image.naturalWidth) enter();
                const original = new Image();
                original.onload = async () => {
                    await original.decode().catch(() => {});
                    if (request !== token || !dialog.open) return;
                    image.src = original.src;
                    status.textContent = '高清原图 · 滚轮 / 双指缩放 · 拖动查看细节';
                };
                original.onerror = () => { if (request === token) status.textContent = '原图暂不可用 · 当前为预览画质'; };
                original.src = candidate.photo.src;
            }
        };
    };
})();
