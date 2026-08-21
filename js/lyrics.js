document.addEventListener('DOMContentLoaded', () => {
    const lyricsGrid = document.querySelector('.lyrics-grid');
    const modal = document.getElementById('lyrics-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalContent = document.getElementById('modal-content');
    const modalAudio = document.getElementById('modal-audio');
    const modalAudioContainer = document.getElementById('modal-audio-container');
    const closeModal = document.querySelector('.close-modal');

    // Fetch lyrics data
    Promise.all([
        fetch('assets/data/lyrics.json?v=' + Date.now()).then(response => response.json()),
        window.DeanRecommendations ? window.DeanRecommendations.loadConfig() : Promise.resolve(null)
    ])
        .then(([data, recommendationConfig]) => {
            data = getVisibleResources(data);
            // Sort data by order
            data.sort((a, b) => a.order - b.order);
            if (window.DeanRecommendations) {
                data = window.DeanRecommendations.prioritizeByModule(data, recommendationConfig, 'lyricsPageFeatured');
            }
            renderLyrics(data);
        })
        .catch(error => console.error('Error loading lyrics:', error));

    function renderLyrics(lyrics) {
        lyricsGrid.innerHTML = ''; // Clear existing content
        lyrics.forEach(lyric => {
            const card = document.createElement('div');
            card.classList.add('lyrics-card');

            card.innerHTML = `
                <div class="lyrics-card-img-container">
                    <img src="${lyric.cover}" alt="${lyric.title}" class="lyrics-card-img">
                </div>
                <div class="lyrics-card-content">
                    <h3 class="lyrics-card-title">${lyric.title}</h3>
                    <p class="lyrics-card-summary">${lyric.summary}</p>
                    <button class="btn btn-primary read-lyrics-btn" data-id="${lyric.id}" style="font-size: 12px; margin-top: auto; align-self: flex-start;">Read Lyrics</button>
                </div>
            `;

            // Add event listener to the button
            const btn = card.querySelector('.read-lyrics-btn');
            btn.addEventListener('click', () => {
                // Set fallback in localStorage in case URL params are lost during redirection
                localStorage.setItem('currentLyricId', lyric.id);

                const url = `lyric-detail.html?id=${encodeURIComponent(lyric.id)}`;
                console.log('Opening detail page:', url);
                window.open(url, '_blank');
            });

            lyricsGrid.appendChild(card);
        });
    }

    async function openModal(lyric) {
        modalTitle.textContent = lyric.title;
        modalContent.innerHTML = 'Loading lyrics...';

        // Handle Audio
        if (lyric.audioPath) {
            modalAudio.src = lyric.audioPath;
            modalAudioContainer.style.display = 'block';
        } else {
            modalAudioContainer.style.display = 'none';
            modalAudio.src = '';
        }

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        // Load Markdown Content
        try {
            const response = await fetch(lyric.contentPath);
            const markdownText = await response.text();
            // Use marked library to parse markdown
            modalContent.innerHTML = marked.parse(markdownText);
        } catch (error) {
            console.error('Error fetching markdown:', error);
            modalContent.innerHTML = '<p>Sorry, could not load the lyrics content.</p>';
        }
    }

    function closeModalFunction() {
        modal.style.display = 'none';
        document.body.style.overflow = '';
        // Stop audio when closing
        modalAudio.pause();
        modalAudio.currentTime = 0;
    }

    if (closeModal) {
        closeModal.addEventListener('click', closeModalFunction);
    }

    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeModalFunction();
        }
    });

    function getVisibleResources(items) {
        if (window.DeanRecommendations && window.DeanRecommendations.filterVisible) {
            return window.DeanRecommendations.filterVisible(items);
        }

        return Array.isArray(items) ? items.filter(item => item && !item.deletedAt) : [];
    }
});
