document.addEventListener('DOMContentLoaded', () => {
    const masonryGrid = document.querySelector('.masonry-grid');

    // Fetch photos data - using a static version or no version to allow caching
    fetch('assets/data/photos.json?v=1.0')
        .then(response => response.json())
        .then(data => {
            console.log('Loaded photos:', data.length);
            renderPhotos(data);
        })
        .catch(error => console.error('Error loading photos:', error));

    function renderPhotos(photos) {
        masonryGrid.innerHTML = ''; // Clear existing content
        photos.forEach(photo => {
            const item = document.createElement('div');
            item.classList.add('masonry-item');

            const img = document.createElement('img');
            img.alt = photo.description || 'Photo';

            // Set up load handler BEFORE setting src
            img.onload = function () {
                this.classList.add('loaded');
            };

            img.src = photo.src;

            // CRITICAL: If image is already in cache, it will be 'complete' immediately
            if (img.complete) {
                img.classList.add('loaded');
                img.style.transition = 'none'; // No animation for cached images
            }

            // Error handling
            img.onerror = function () {
                this.parentElement.style.display = 'none';
            };

            item.appendChild(img);
            masonryGrid.appendChild(item);
        });
    }
});
