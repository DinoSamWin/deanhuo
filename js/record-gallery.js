import * as THREE from '../assets/vendor/three-0.169.0.module.min.js';

// All geometry, shadows and highlights share one eye-level perspective camera.
export async function createGallery(container, songs) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.className = 'exhibition-webgl';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 70);
    const group = new THREE.Group();
    scene.add(group);
    const textures = new Set();
    const bitmaps = new Set();
    const loader = new THREE.TextureLoader();
    const load = async (url, color = true) => {
        if (!url) return null;
        try {
            const texture = await loader.loadAsync(url);
            const largest = Math.max(texture.image.width, texture.image.height);
            if (largest > 1024 && typeof createImageBitmap === 'function') {
                const bitmap = await createImageBitmap(texture.image, {
                    resizeWidth: Math.max(1, Math.round(texture.image.width * 1024 / largest)),
                    resizeHeight: Math.max(1, Math.round(texture.image.height * 1024 / largest)),
                    imageOrientation: 'flipY'
                });
                bitmaps.add(bitmap);
                texture.image = bitmap;
                texture.flipY = false;
                texture.needsUpdate = true;
            }
            if (color) texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
            textures.add(texture);
            return texture;
        } catch { return null; }
    };
    const photoCatalogue = await fetch('assets/data/photos.json').then(response => response.ok ? response.json() : []).catch(() => []);
    const photos = (Array.isArray(photoCatalogue) ? photoCatalogue : []).filter(photo => photo && !photo.deletedAt && photo.src).slice(0, 6);
    const [covers, sticker, wrinkles, wood, photoTextures] = await Promise.all([
        Promise.all(songs.map(song => load(song.cover))),
        load('assets/images/emi-records-sticker.png'),
        load('assets/images/record-film-atlas.png', false),
        load('assets/images/shelf-wood-grain.svg', false),
        Promise.all(photos.map(photo => load(photo.src)))
    ]);
    const canvasTexture = (draw, width = 512, height = 512) => {
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        draw(canvas.getContext('2d'), width, height);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        textures.add(texture);
        return texture;
    };
    const grooves = canvasTexture((ctx, w) => {
        ctx.fillStyle = '#111111'; ctx.fillRect(0, 0, w, w);
        for (let radius = 65; radius < w / 2; radius += 1.6) {
            ctx.strokeStyle = radius % 4 < 2 ? '#383735' : '#171716';
            ctx.lineWidth = 0.65;
            ctx.beginPath(); ctx.arc(w / 2, w / 2, radius, 0, Math.PI * 2); ctx.stroke();
        }
    });
    const veneer = canvasTexture((ctx, w, h) => {
        ctx.fillStyle = '#593921'; ctx.fillRect(0, 0, w, h);
        for (let line = 0; line < 380; line += 1) {
            ctx.strokeStyle = line % 3 === 0 ? '#bd885424' : '#20120836';
            ctx.lineWidth = line % 5 === 0 ? 1.2 : 0.5;
            ctx.beginPath();
            for (let y = 0; y <= h; y += 6) {
                const x = line * w / 380 + Math.sin(y * 0.012 + line * 0.14) * 2.2 + Math.sin(y * 0.035 + line) * 0.7;
                if (y === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
    });
    veneer.wrapS = THREE.RepeatWrapping; veneer.repeat.set(5, 1);
    const mesh = (geometry, material, parent = scene) => {
        const object = new THREE.Mesh(geometry, material);
        object.castShadow = false; object.receiveShadow = true;
        parent.add(object);
        return object;
    };

    // A small lighting environment supplies physical plastic/record reflections.
    const studio = new THREE.Scene();
    studio.background = new THREE.Color('#44372b');
    const room = new THREE.Mesh(new THREE.BoxGeometry(20, 12, 20), new THREE.MeshBasicMaterial({color: '#665648', side: THREE.BackSide}));
    studio.add(room);
    [[-4, 5, 3], [5, 4, -2], [0, 5, -5]].forEach(([x, y, z]) => {
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), new THREE.MeshBasicMaterial({color: new THREE.Color(3, 2.4, 1.8), side: THREE.DoubleSide}));
        panel.position.set(x, y, z); panel.lookAt(0, 0, 0); studio.add(panel);
    });
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(studio, 0.06);
    scene.environment = environment.texture;
    studio.traverse(node => { node.geometry?.dispose(); node.material?.dispose(); });
    pmrem.dispose();
    scene.add(new THREE.HemisphereLight('#ffe1b5', '#39271a', 1.4));

    const radius = Math.max(3.3, songs.length * 2.95 / (2 * Math.PI));
    const pedestal = mesh(new THREE.CylinderGeometry(radius + 1.15, radius + 1.22, 0.22, 96), new THREE.MeshStandardMaterial({color: '#49321f', roughness: 0.55, metalness: 0.12, bumpMap: wood, bumpScale: 0.025}));
    pedestal.position.y = 0.83;
    const pedestalBase = mesh(new THREE.CylinderGeometry(radius * 0.76, radius * 0.8, 1.44, 64), new THREE.MeshStandardMaterial({map: veneer, roughness: 0.65, bumpMap: veneer, bumpScale: 0.012}));
    pedestalBase.position.y = 0;
    const foot = mesh(new THREE.CylinderGeometry(radius * 0.82, radius * 0.82, 0.1, 64), new THREE.MeshStandardMaterial({color: '#241d16', roughness: 0.55, metalness: 0.25}));
    foot.position.y = -0.72;
    const contact = canvasTexture((ctx, w, h) => {
        const gradient = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w / 2);
        gradient.addColorStop(0, '#000b'); gradient.addColorStop(0.7, '#0006'); gradient.addColorStop(1, '#0000');
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
    }, 128, 128);
    const contactShadow = mesh(new THREE.PlaneGeometry(radius * 2.2, radius * 2.2), new THREE.MeshBasicMaterial({map: contact, transparent: true, depthWrite: false}));
    contactShadow.rotation.x = -Math.PI / 2; contactShadow.position.y = -0.765;
    const rim = mesh(new THREE.TorusGeometry(radius + 1.16, 0.018, 8, 96), new THREE.MeshStandardMaterial({color: '#af8753', metalness: 0.75, roughness: 0.28}));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.91;
    const underlight = mesh(new THREE.TorusGeometry(radius + 1.17, 0.014, 8, 96), new THREE.MeshBasicMaterial({color: '#ffe1a0'}));
    underlight.rotation.x = Math.PI / 2; underlight.position.y = 0.75;
    const floor = mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({opacity: 0.28}));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.77; floor.castShadow = false;

    // No freestanding racks behind the records: photography is displayed along the side walls.
    photoTextures.forEach((texture, index) => {
        if (!texture) return;
        const side = index < 3 ? -1 : 1;
        const frame = new THREE.Group();
        frame.position.set(side * (radius + 1.7), 2.6, 1 - (index % 3) * 3.2);
        frame.rotation.y = -side * 0.72;
        frame.name = `photography-${photos[index].id}`;
        scene.add(frame);
        const walnut = new THREE.MeshStandardMaterial({color: '#49301e', roughness: 0.7});
        mesh(new THREE.BoxGeometry(1.9, 1.65, 0.12), walnut, frame);
        const mat = mesh(new THREE.PlaneGeometry(1.76, 1.51), new THREE.MeshStandardMaterial({color: '#d4c6ae', roughness: 0.9}), frame);
        mat.position.z = 0.065;
        const aspect = texture.image.width / texture.image.height;
        const width = Math.min(1.58, 1.32 * aspect), height = width / aspect;
        const photo = mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({map: texture, roughness: 0.62}), frame);
        photo.position.z = 0.069;
        const ledge = mesh(new THREE.BoxGeometry(2.1, 0.09, 0.38), walnut, frame);
        ledge.position.set(0, -0.87, 0.07);
        const strip = mesh(new THREE.BoxGeometry(1.7, 0.022, 0.04), new THREE.MeshBasicMaterial({color: '#ffe2b8'}), frame);
        strip.position.set(0, 0.86, 0.13);
    });

    const spots = [[-5, 7, 5, 260], [5, 6, 3, 210], [0, 6, -4, 240]];
    spots.forEach(([x, y, z, power], index) => {
        const spot = new THREE.SpotLight('#ffdb9d', power, 26, Math.PI / 5, 0.65, 1.5);
        spot.position.set(x, y, z); spot.target.position.set(x * 0.35, 1, z * 0.35);
        spot.castShadow = index === 0;
        spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0003; spot.shadow.normalBias = 0.025;
        scene.add(spot, spot.target);
        const fixture = mesh(new THREE.CylinderGeometry(0.1, 0.2, 0.3, 16), new THREE.MeshStandardMaterial({color: '#211b15', metalness: 0.7, roughness: 0.35}));
        fixture.position.copy(spot.position);
        const bulb = mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({color: '#ffe4ad'}));
        bulb.position.set(x, y - 0.18, z);
    });

    songs.forEach((song, index) => {
        const angle = index * Math.PI * 2 / songs.length;
        const recordGroup = new THREE.Group();
        recordGroup.position.set(Math.sin(angle) * radius, 2.05, Math.cos(angle) * radius);
        recordGroup.rotation.y = angle;
        group.add(recordGroup);
        const cover = covers[index];
        const bump = wrinkles?.clone();
        if (bump) {
            bump.repeat.set(0.48, 0.48); bump.offset.set((index % 2) * 0.5, (Math.floor(index / 2) % 2) * 0.5);
            bump.rotation = index % 4 * Math.PI / 2; bump.center.set(0.5, 0.5); textures.add(bump);
        }
        const front = new THREE.MeshPhysicalMaterial({map: cover, color: cover ? '#ffffff' : '#3a3027', roughness: 0.45, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.23, bumpMap: bump, bumpScale: 0.009, envMapIntensity: 0.65});
        const back = new THREE.MeshPhysicalMaterial({map: cover, color: '#8e7d64', roughness: 0.65, clearcoat: 0.25, envMapIntensity: 0.35});
        const edge = new THREE.MeshStandardMaterial({color: '#b6a48b', roughness: 0.85});
        const jacket = mesh(new THREE.BoxGeometry(2.2, 2.2, 0.07), [edge, edge, edge, edge, front, back], recordGroup);
        jacket.position.x = -0.25;
        jacket.castShadow = true;

        const backText = canvasTexture((ctx, w, h) => {
            const gradient = ctx.createLinearGradient(0, 0, 0, h);
            gradient.addColorStop(0, '#16100b22'); gradient.addColorStop(1, '#16100be8');
            ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#eadac0'; ctx.font = '17px sans-serif';
            ctx.fillText('DEAN HUO / RECORD COLLECTION', 40, 330);
            ctx.font = '30px sans-serif'; ctx.fillText(song.title || 'Untitled', 40, 385, 430);
            ctx.fillRect(40, 411, 432, 1); ctx.font = '15px sans-serif';
            ctx.fillText(`SIDE B · ${String(index + 1).padStart(2, '0')}`, 40, 448);
        });
        const reverse = mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({map: backText, transparent: true, depthWrite: false}), recordGroup);
        reverse.position.set(-0.25, 0, -0.036); reverse.rotation.y = Math.PI;
        if (sticker) {
            const badge = mesh(new THREE.PlaneGeometry(0.35, 0.35), new THREE.MeshPhysicalMaterial({map: sticker, roughness: 0.6, clearcoat: 0.25}), recordGroup);
            badge.position.set(0.6, 0.85, 0.039); badge.rotation.z = (index % 3 - 1) * 0.018;
        }
        const disc = mesh(new THREE.CylinderGeometry(1.04, 1.04, 0.027, 96), [new THREE.MeshStandardMaterial({color: '#111111', roughness: 0.35}), new THREE.MeshPhysicalMaterial({map: grooves, color: '#b9b9b9', roughness: 0.26, metalness: 0.3, clearcoat: 0.8}), new THREE.MeshPhysicalMaterial({map: grooves, color: '#b9b9b9', roughness: 0.26, metalness: 0.3, clearcoat: 0.8})], recordGroup);
        disc.rotation.x = Math.PI / 2; disc.position.set(0.4, 0, -0.065);
        [-1, 1].forEach(side => {
            const label = mesh(new THREE.CircleGeometry(0.31, 48), new THREE.MeshStandardMaterial({map: cover, color: cover ? '#ffffff' : '#b78452', roughness: 0.65}), recordGroup);
            label.position.set(0.4, 0, -0.065 + side * 0.016); if (side < 0) label.rotation.y = Math.PI;
        });
        const stand = mesh(new THREE.BoxGeometry(1.7, 0.08, 0.48), new THREE.MeshStandardMaterial({color: '#775438', roughness: 0.55}), recordGroup);
        stand.position.set(-0.25, -1.06, 0);
    });
    container.append(renderer.domElement);
    let dragX = null;
    renderer.domElement.addEventListener('pointerdown', event => {
        dragX = event.clientX;
        renderer.domElement.setPointerCapture(event.pointerId);
    });
    renderer.domElement.addEventListener('pointermove', event => {
        if (dragX === null) return;
        container.dispatchEvent(new CustomEvent('gallery-rotate', {detail: (event.clientX - dragX) * 0.18}));
        dragX = event.clientX;
    });
    const endDrag = () => { dragX = null; };
    renderer.domElement.addEventListener('pointerup', endDrag);
    renderer.domElement.addEventListener('pointercancel', endDrag);
    let disposed = false;
    let angle = 0;
    let frameNumber = 0;
    let sampleStart = 0;
    let sampleFrames = 0;
    const render = degrees => {
        if (disposed) return;
        angle = degrees; group.rotation.y = THREE.MathUtils.degToRad(degrees);
        renderer.shadowMap.needsUpdate = frameNumber++ % 2 === 0;
        renderer.render(scene, camera);
        const now = performance.now();
        if (!sampleStart) sampleStart = now;
        sampleFrames += 1;
        if (now - sampleStart > 1500) {
            const fps = sampleFrames * 1000 / (now - sampleStart);
            renderer.domElement.dataset.fps = fps.toFixed(1);
            renderer.domElement.dataset.drawCalls = String(renderer.info.render.calls);
            if (fps < 42 && renderer.getPixelRatio() > 1) renderer.setPixelRatio(1);
            sampleFrames = 0; sampleStart = now;
        }
    };
    const resize = () => {
        if (disposed) return;
        const {width, height} = container.getBoundingClientRect();
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.fov = width < 600 ? 49 : 42;
        camera.position.set(0, 1.5, radius + 8.8);
        camera.lookAt(0, 1.5, 0); // Horizontal line of sight: never tilt the orbit independently.
        camera.updateProjectionMatrix(); render(angle);
    };
    await renderer.compileAsync(scene, camera);
    resize();
    return { render, resize, dispose() {
        if (disposed) return; disposed = true;
        const geometries = new Set(), materials = new Set();
        scene.traverse(node => {
            if (node.geometry) geometries.add(node.geometry);
            if (node.material) (Array.isArray(node.material) ? node.material : [node.material]).forEach(material => materials.add(material));
            if (node.shadow) node.shadow.dispose();
        });
        geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose());
        textures.forEach(texture => texture.dispose()); environment.dispose();
        bitmaps.forEach(bitmap => bitmap.close());
        renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    }};
}
