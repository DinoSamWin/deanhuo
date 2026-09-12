(function () {
    const PHOTO_SOURCE_PATTERN = /^assets\/images\/photos\/([^/]+)\.(?:jpe?g|png|webp)$/i;
    const WIDTHS = [640, 1280, 1920];

    function getPhotoVariant(source, width) {
        const match = String(source || '').match(PHOTO_SOURCE_PATTERN);
        if (!match) return source;
        return `assets/images/photos-optimized/${match[1]}-${width}.webp`;
    }

    function applyResponsivePhoto(image, source, options = {}) {
        if (!image || !source) return;

        const isLocalPhoto = PHOTO_SOURCE_PATTERN.test(source);
        image.alt = options.alt || image.alt || '';
        image.decoding = 'async';
        image.loading = options.eager ? 'eager' : 'lazy';
        if (options.eager) image.fetchPriority = 'high';

        if (!isLocalPhoto) {
            image.src = source;
            return;
        }

        image.sizes = options.sizes || '(max-width: 768px) 100vw, 50vw';
        image.srcset = WIDTHS.map(width => `${getPhotoVariant(source, width)} ${width}w`).join(', ');
        image.src = getPhotoVariant(source, options.defaultWidth || 1280);
        image.onerror = function () {
            if (this.dataset.originalFallback === 'true') {
                this.onerror = null;
                if (typeof options.onError === 'function') options.onError(this);
                return;
            }

            this.dataset.originalFallback = 'true';
            this.removeAttribute('srcset');
            this.removeAttribute('sizes');
            this.src = source;
        };
    }

    window.DeanImages = {
        applyResponsivePhoto,
        getPhotoVariant
    };
})();
