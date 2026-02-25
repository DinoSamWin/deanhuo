document.addEventListener('DOMContentLoaded', () => {
    // Make sure marked is available
    if (typeof marked === 'undefined') {
        document.getElementById('article-body').innerHTML = '<p style="color: red;">Error: Marked.js is not loaded.</p>';
        return;
    }

    // Get ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const articleId = urlParams.get('id');

    if (!articleId) {
        document.getElementById('article-title').innerHTML = "出错了";
        document.getElementById('article-body').innerHTML = "<p>未找到指定的文章。请返回 <a href='knowledge.html'>知识冰箱</a>。</p>";
        if (window.lucide) lucide.createIcons();
        return;
    }

    // Custom Extension for auto-parsing Bilibili, YouTube, and Gamma links
    const embedExtension = {
        name: 'videoEmbed',
        level: 'block',
        start(src) { return src.match(/^https?:\/\/(www\.)?(bilibili\.com|youtube\.com|youtu\.be|gamma\.app)\//)?.index; },
        tokenizer(src, tokens) {
            // Match a full URL that sits on a line by itself
            const rule = /^(https?:\/\/(?:www\.)?(?:bilibili\.com\/video\/[a-zA-Z0-9]+|youtube\.com\/watch\?v=[a-zA-Z0-9_-]+|youtu\.be\/[a-zA-Z0-9_-]+|gamma\.app\/docs\/[a-zA-Z0-9_-]+)[^\s]*)(?:\n|$)/;
            const match = rule.exec(src);
            if (match) {
                return {
                    type: 'videoEmbed',
                    raw: match[0],
                    url: match[1].trim()
                };
            }
            return false;
        },
        renderer(token) {
            const url = token.url;

            // Bilibili
            if (url.includes('bilibili.com/video/')) {
                // Extract BV id
                const bvMatch = url.match(/video\/(BV[a-zA-Z0-9]+)/);
                if (bvMatch) {
                    const bvid = bvMatch[1];
                    return `<div class="video-embed-container">
                        <iframe src="//player.bilibili.com/player.html?bvid=${bvid}&page=1&high_quality=1&danmaku=0" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe>
                    </div>`;
                }
            }

            // YouTube (youtube.com or youtu.be)
            let ytId = null;
            if (url.includes('youtube.com/watch?v=')) {
                ytId = new URL(url).searchParams.get('v');
            } else if (url.includes('youtu.be/')) {
                ytId = url.split('youtu.be/')[1].split('?')[0];
            }
            if (ytId) {
                return `<div class="video-embed-container">
                    <iframe src="https://www.youtube.com/embed/${ytId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                </div>`;
            }

            if (url.includes('gamma.app/docs/') || url.includes('gamma.app/embed/')) {
                const embedUrl = url.includes('/docs/') ? url.replace('/docs/', '/embed/') : url;
                return `<div class="embed-wrapper">
                    <div class="gamma-scroll-overlay"></div>
                    <div class="video-embed-container gamma-embed">
                        <iframe src="${embedUrl}" allow="fullscreen" title="Gamma Presentation"></iframe>
                    </div>
                    <button class="gamma-fullscreen-btn" aria-label="建议全屏预览">
                        <i data-lucide="maximize"></i> 建议全屏预览
                    </button>
                </div>`;
            }

            return `<p><a href="${url}" target="_blank">${url}</a></p>`;
        }
    };

    // Override the default html tokenizer to also catch pasted iframe tags
    const iframeHtmlExtension = {
        name: 'html',
        level: 'block',
        // Hook into renderer to inject wrappers around raw iframes if they are Gamma or otherwise
        renderer(token) {
            if (token.text && token.text.trim().startsWith('<iframe') && token.text.includes('gamma.app')) {
                // Return original iframe wrapped with our custom button
                return `<div class="embed-wrapper">
                    <div class="gamma-scroll-overlay"></div>
                    ${token.text}
                    <button class="gamma-fullscreen-btn" aria-label="建议全屏预览">
                        <i data-lucide="maximize"></i> 建议全屏预览
                    </button>
                </div>`;
            }
            return false; // Leave other HTML alone
        }
    };

    marked.use({ extensions: [embedExtension, iframeHtmlExtension] });

    // Step 1: Fetch metadata from knowledge-index.json to populate header
    fetch('assets/data/knowledge-index.json?v=' + Date.now())
        .then(res => res.json())
        .then(data => {
            const articleMeta = data.find(item => item.id === articleId);
            if (!articleMeta) {
                document.getElementById('article-title').innerText = "文章未找到";
                return;
            }

            // Populate Metadata
            document.title = `${articleMeta.title} | 知识冰箱`;
            document.getElementById('article-title').innerText = articleMeta.title;
            document.getElementById('article-date').innerText = articleMeta.date;

            const tagsContainer = document.getElementById('article-tags');
            if (articleMeta.tags && articleMeta.tags.length > 0) {
                tagsContainer.innerHTML = articleMeta.tags.map(tag => `<span class="a-tag">${tag}</span>`).join('');
            }

            // Step 2: Fetch the actual markdown file content
            return fetch(`assets/data/knowledge/${articleMeta.filename}?v=${Date.now()}`);
        })
        .then(res => {
            if (!res) return; // Prevent cascading error if not found
            if (!res.ok) throw new Error('Markdown file not found');
            return res.text();
        })
        .then(text => {
            if (text) {
                document.getElementById('article-body').innerHTML = marked.parse(text);

                // Re-initialize icons for newly added buttons
                if (window.lucide) {
                    lucide.createIcons();
                }

                // Add Intersection Observer for smart scroll overlay
                const wrappers = document.querySelectorAll('.embed-wrapper');
                if (wrappers.length > 0) {
                    const observer = new IntersectionObserver((entries) => {
                        entries.forEach(entry => {
                            const rect = entry.boundingClientRect;
                            // Check if the bottom is visible in viewport or iframe is mostly visible
                            const isBottomVisible = entry.isIntersecting && rect.bottom <= window.innerHeight + 10;
                            const isFullyVisible = entry.intersectionRatio >= 0.95;

                            if (isFullyVisible || isBottomVisible) {
                                entry.target.classList.add('is-interactive');
                            } else {
                                entry.target.classList.remove('is-interactive');
                            }
                        });
                    }, { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.0] });

                    wrappers.forEach(w => observer.observe(w));
                }
            }
        })
        .catch(err => {
            console.error(err);
            document.getElementById('article-title').innerText = "加载失败";
            document.getElementById('article-body').innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <i data-lucide="alert-triangle" style="width: 48px; height: 48px; color: #ffbc00; margin-bottom: 16px;"></i>
                    <p>好像找不到对应的 Markdown 文件。<br>请检查 <code>assets/data/knowledge/</code> 下是否存在该文件。</p>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        });

    // Handle Fullscreen button clicks using event delegation
    document.getElementById('article-body').addEventListener('click', (e) => {
        const btn = e.target.closest('.gamma-fullscreen-btn');
        if (!btn) return;

        const wrapper = btn.closest('.embed-wrapper');
        if (!wrapper) return;

        const iframe = wrapper.querySelector('iframe');
        if (!iframe) return;

        if (iframe.requestFullscreen) {
            iframe.requestFullscreen();
        } else if (iframe.webkitRequestFullscreen) { /* Safari */
            iframe.webkitRequestFullscreen();
        } else if (iframe.msRequestFullscreen) { /* IE11 */
            iframe.msRequestFullscreen();
        }
    });
});
