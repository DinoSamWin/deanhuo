document.addEventListener('DOMContentLoaded', () => {
    const masonryGrid = document.querySelector('.masonry-grid');

    // Fetch photos data
    fetch('assets/data/photos.json')
        .then(response => response.json())
        .then(data => {
            renderPhotos(data);
        })
        .catch(error => console.error('Error loading photos:', error));

    function renderPhotos(photos) {
        masonryGrid.innerHTML = ''; // Clear existing content
        photos.forEach(photo => {
            const item = document.createElement('div');
            item.classList.add('masonry-item');

            // Create image element
            const img = document.createElement('img');
            img.src = photo.src;
            img.alt = photo.description || 'Photo';

            // Add error handling for images
            img.onerror = function () {
                this.style.display = 'none'; // Hide if image fails to load
                console.warn('Image not found:', photo.src);
            };

            item.appendChild(img);
            masonryGrid.appendChild(item);
        });
    }
});
