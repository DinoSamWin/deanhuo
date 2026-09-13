import * as THREE from '../assets/vendor/three-0.169.0.module.min.js';
import { createScreenLayout, SCREEN_RADIUS, wrap } from './photo-exhibition-layout.mjs?v=5';
import { calibrateScreenMaterial, coverScale, screenBand } from './photo-exhibition-projection.mjs?v=6';

function curvedPlane(radius, start, length, height, y) {
    const segments = Math.max(12, Math.ceil(length * radius * 12));
    const positions = [], uv = [], indices = [];
    for (let row = 0; row < 2; row++) {
        for (let i = 0; i <= segments; i++) {
            const angle = start + length * i / segments;
            positions.push(radius * Math.sin(angle), y + height * (.5 - row), -radius * Math.cos(angle));
            uv.push(i / segments, 1 - row);
        }
    }
    for (let i = 0; i < segments; i++) {
        const a = i, b = i + 1, c = i + segments + 1, d = c + 1;
        indices.push(a, c, b, b, c, d);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

function labelTexture(photo, index, width) {
    const canvas = document.createElement('canvas');
    // Constant physical type size, including narrow portrait photographs.
    canvas.width = Math.max(224, Math.round(width * 320)); canvas.height = 160;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#666359'; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
    ctx.font = '300 34px "Songti SC", "Noto Serif CJK SC", STSong, serif';
    ctx.letterSpacing = '2px';
    let title = /^img\d+$/i.test(photo.title || '') ? '光影记录' : (photo.title || '摄影作品');
    const available = canvas.width - 28;
    if (ctx.measureText(title).width > available) {
        while (title.length && ctx.measureText(title + '…').width > available) title = title.slice(0, -1);
        title += '…';
    }
    ctx.fillText(title, canvas.width / 2, 12);
    // Small, tracked museum-label capitals, not a stretched italic subtitle.
    ctx.font = '400 21px "Gallery Sans", Arial, sans-serif'; ctx.fillStyle = '#817b6f';
    ctx.letterSpacing = '4px';
    let english = (photo.titleEn || 'A moment in light').toLocaleUpperCase('en');
    if (ctx.measureText(english).width > available) {
        while (english.length && ctx.measureText(english + '…').width > available) english = english.slice(0, -1);
        english += '…';
    }
    ctx.fillText(english, canvas.width / 2, 71);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

export async function createPhotoScreen(stage, photos) {
    await document.fonts.load('400 21px "Gallery Sans"').catch(() => {});
    const aspects = await fetch('assets/data/photo-exhibition-aspects.json').then(r => r.ok ? r.json() : {}).catch(() => ({}));
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = false;
    const canvas = renderer.domElement;
    canvas.className = 'photo-exhibition-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const accessible = document.createElement('p');
    accessible.className = 'photo-exhibition-accessible';
    accessible.setAttribute('aria-live', 'off');
    const scene = new THREE.Scene();
    const backgroundCover = new THREE.Vector2(1, 1);
    const camera = new THREE.PerspectiveCamera(50, 1, .1, 120);
    camera.position.set(0, 1.6, 0);
    camera.lookAt(0, 1.6, -12);

    // Calibrated to the photographed concave wall, not the size of the catalogue.
    // Virtual works recycle beyond the camera's arc; adding photos cannot flatten
    // the wall or change its perspective. The visible screen remains continuous.
    const layoutModel = createScreenLayout(photos, aspects);
    const layouts = layoutModel.items;
    const radius = SCREEN_RADIUS;
    const { angleAt } = layoutModel;
    const ring = new THREE.Group();
    ring.position.z = radius - 12;
    scene.add(ring);
    const exhibits = new Map();
    const resourceCache = new Map();
    let active = -1, disposed = false, lastPosition = 0;

    function ensure(index) {
        const key = wrap(index, photos.length);
        if (exhibits.has(index)) return exhibits.get(index);
        const photo = photos[key], layout = layouts[key];
        const group = new THREE.Group();
        const start = -layout.arc / 2;
        const artMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: THREE.DoubleSide, transparent: true, alphaTest: .01 });
        const updateArtHeight = calibrateScreenMaterial(artMaterial, backgroundCover, layout.height / 2.65);
        const art = new THREE.Mesh(curvedPlane(radius - .008, start, layout.arc, layout.height, 1.8), artMaterial);
        art.visible = false;
        group.add(art);
        const textTexture = labelTexture(photo, key, layout.width);
        const label = new THREE.Mesh(curvedPlane(radius - .015, start, layout.arc, .5, 1.8 - layout.height / 2 - .35), new THREE.MeshBasicMaterial({ map: textTexture, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
        const updateLabelHeight = calibrateScreenMaterial(label.material, backgroundCover, layout.height / 2.65, true);
        art.frustumCulled = label.frustumCulled = false;
        group.add(label);
        ring.add(group);
        const entry = { group, art, label, key, texture: null, image: null, heightRatio: layout.height / 2.65 };
        // Keep virtual copies separate across the last -> first seam.
        exhibits.set(index, entry);

        let resource = resourceCache.get(key);
        if (!resource) {
            resource = new Promise(resolve => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = () => resolve(null);
                const options = { eager: true, defaultWidth: 1280, sizes: '(max-width: 800px) 85vw, 32vw', onError: () => resolve(null) };
                if (window.DeanImages) window.DeanImages.applyResponsivePhoto(image, photo.src, options);
                else { image.onerror = () => resolve(null); image.src = photo.src; }
            });
            resourceCache.set(key, resource);
        }
        resource.then(async image => {
            if (disposed || exhibits.get(index) !== entry) return;
            if (!image) {
                label.material.map.dispose();
                label.material.map = labelTexture({ title: '照片加载失败', description: '请稍后重新打开展览' }, key, layout.width);
                label.material.needsUpdate = true;
                renderer.render(scene, camera);
                return;
            }
            await image.decode().catch(() => {});
            if (disposed || exhibits.get(index) !== entry) return;
            const bitmap = document.createElement('canvas');
            const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
            bitmap.width = Math.max(1, Math.round(image.naturalWidth * scale));
            bitmap.height = Math.max(1, Math.round(image.naturalHeight * scale));
            const bitmapContext = bitmap.getContext('2d');
            const cornerRadius = Math.min(bitmap.height * .025, bitmap.width * .08);
            bitmapContext.beginPath();
            bitmapContext.roundRect(0, 0, bitmap.width, bitmap.height, cornerRadius);
            bitmapContext.clip();
            bitmapContext.drawImage(image, 0, 0, bitmap.width, bitmap.height);
            const texture = new THREE.CanvasTexture(bitmap);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
            texture.needsUpdate = true;
            // New uploads without cached dimensions still display without stretching.
            const ratio = image.naturalWidth / image.naturalHeight;
            const imageWidth = Math.min(layout.width, layout.height * ratio);
            const imageHeight = imageWidth / ratio;
            entry.image = image; entry.heightRatio = imageHeight / 2.65;
            updateArtHeight(imageHeight / 2.65);
            updateLabelHeight(imageHeight / 2.65);
            art.geometry.dispose();
            art.geometry = curvedPlane(radius - .008, -imageWidth / radius / 2, imageWidth / radius, imageHeight, 1.8);
            label.geometry.dispose();
            label.geometry = curvedPlane(radius - .015, -imageWidth / radius / 2, imageWidth / radius, .5, 1.8 - imageHeight / 2 - .35);
            if (Math.abs(imageWidth - layout.width) > .01) {
                label.material.map.dispose();
                label.material.map = labelTexture(photo, key, imageWidth);
                label.material.needsUpdate = true;
            }
            entry.texture = texture; artMaterial.map = texture; artMaterial.needsUpdate = true; art.visible = true;
            renderer.render(scene, camera);
        });
        return entry;
    }

    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); canvas.dataset.context = 'lost'; });
    canvas.addEventListener('webglcontextrestored', () => { canvas.dataset.context = 'ready'; render(lastPosition); });
    stage.replaceChildren(canvas, accessible);
    stage.classList.add('has-curved-screen');
    stage.dataset.renderer = 'webgl-curved-screen';

    function resize() {
        const width = stage.clientWidth, height = stage.clientHeight;
        // Match the same centered `cover` crop as the background photograph.
        const aspect = width / height;
        backgroundCover.set(...coverScale(width, height));
        camera.aspect = aspect;
        camera.fov = aspect > 16 / 9 ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(25)) * (16 / 9) / aspect)) : 50;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
    }

    function render(position) {
        lastPosition = position;
        const center = Math.round(position), needed = new Set(), resources = new Set(), viewAngle = angleAt(position);
        for (const i of layoutModel.visibleIndices(position)) {
            needed.add(i); resources.add(wrap(i, photos.length));
            const entry = ensure(i);
            const relativeAngle = angleAt(i) - viewAngle;
            entry.group.rotation.y = -relativeAngle;
            entry.group.visible = Math.abs(relativeAngle) < 2.0;
        }
        for (const [key, entry] of exhibits) {
            if (!needed.has(key)) {
                ring.remove(entry.group);
                entry.art.geometry.dispose(); entry.art.material.dispose(); entry.texture?.dispose();
                entry.label.geometry.dispose(); entry.label.material.map.dispose(); entry.label.material.dispose();
                exhibits.delete(key);
                // Retain decoded resources only for nearby works; no unbounded GPU/cache growth.
            }
        }
        for (const key of resourceCache.keys()) if (!resources.has(key)) resourceCache.delete(key);
        const index = wrap(center, photos.length);
        if (active !== index) {
            active = index;
            const title = /^img\d+$/i.test(photos[index].title || '') ? '光影记录' : (photos[index].title || '摄影作品');
            accessible.textContent = title + '。' + (photos[index].description || '');
            canvas.dataset.activePhoto = String(index + 1);
        }
        renderer.render(scene, camera);
    }

    resize(); render(0);
    function projectedPhoto(entry) {
        if (!entry?.art?.visible || !entry.group.visible || !entry.image) return null;
        // Raycasting the unwarped cylinder would miss the GPU-calibrated photos.
        // Reproject its top/bottom columns with the exact same wall formula.
        scene.updateMatrixWorld(true);
        const rect = stage.getBoundingClientRect();
        const vertices = entry.art.geometry.attributes.position;
        const columns = vertices.count / 2, points = [];
        for (let i = 0; i < columns; i++) {
            const point = new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(entry.art.matrixWorld).project(camera);
            const band = screenBand(point.x / backgroundCover.x);
            const bottom = band.top + (band.bottom - band.top) * entry.heightRatio;
            points.push({ x: rect.left + (point.x + 1) * rect.width / 2,
                top: rect.top + (.5 + (band.top - .5) * backgroundCover.y) * rect.height,
                bottom: rect.top + (.5 + (bottom - .5) * backgroundCover.y) * rect.height });
        }
        const left = Math.min(...points.map(p => p.x)), right = Math.max(...points.map(p => p.x));
        const top = Math.min(...points.map(p => p.top)), bottom = Math.max(...points.map(p => p.bottom));
        return { index: entry.key, photo: photos[entry.key], preview: entry.image.currentSrc,
            ratio: entry.image.naturalWidth / entry.image.naturalHeight, points,
            rect: { left, top, width: right - left, height: bottom - top } };
    }
    function pick(clientX, clientY) {
        for (const entry of exhibits.values()) {
            const candidate = projectedPhoto(entry);
            if (!candidate) continue;
            for (let i = 1; i < candidate.points.length; i++) {
                const a = candidate.points[i - 1], b = candidate.points[i];
                if (clientX < Math.min(a.x, b.x) || clientX > Math.max(a.x, b.x)) continue;
                const t = (clientX - a.x) / (b.x - a.x);
                if (clientY >= a.top + (b.top - a.top) * t && clientY <= a.bottom + (b.bottom - a.bottom) * t) return candidate;
            }
        }
        return null;
    }
    return {
        resize, render, advance: layoutModel.advance, pick,
        currentPhoto() { return projectedPhoto(exhibits.get(Math.round(lastPosition)) || {}) || null; },
        dispose() {
            disposed = true;
            for (const entry of exhibits.values()) {
                entry.art.geometry.dispose(); entry.art.material.dispose(); entry.texture?.dispose();
                entry.label.geometry.dispose(); entry.label.material.map.dispose(); entry.label.material.dispose();
            }
            renderer.dispose(); resourceCache.clear();
        }
    };
}
