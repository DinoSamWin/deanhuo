document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('knowledge-grid');

    if (!grid) return;

    fetch('assets/data/knowledge-index.json?v=' + Date.now())
        .then(res => {
            if (!res.ok) throw new Error('Network response was not ok');
            return res.json();
        })
        .then(data => {
            if (data.length === 0) {
                grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: 40px;">暂无保鲜知识，请在 knowledge-index.json 中添加。</div>';
                return;
            }

            grid.innerHTML = data.map(item => {
                // Determine destination URL and target
                const destUrl = item.externalUrl ? item.externalUrl : `knowledge-detail.html?id=${item.id}`;
                const targetAttr = item.externalUrl ? `target="_blank" rel="noopener noreferrer"` : ``;

                return `
                <a href="${destUrl}" ${targetAttr} class="knowledge-card">
                    <div class="knowledge-card-body">
                        <div class="knowledge-tags">
                            ${(item.tags || []).map(tag => `<span class="k-tag">${tag}</span>`).join('')}
                        </div>
                        <h2 class="knowledge-card-title">${item.title}</h2>
                        <p class="knowledge-card-desc">${item.description}</p>
                        <div class="knowledge-card-meta">
                            <span>${item.date}</span>
                            <span style="display: flex; align-items: center; gap: 4px; color: var(--accent-color); font-weight: 500;">
                                ${item.externalUrl ? 'Visit <i data-lucide="external-link" style="width: 14px;"></i>' : 'Read <i data-lucide="arrow-right" style="width: 14px;"></i>'}
                            </span>
                        </div>
                    </div>
                </a>
                `;
            }).join('');

            if (window.lucide) {
                lucide.createIcons();
            }
        })
        .catch(err => {
            console.error('Error loading knowledge index:', err);
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 40px;">
                    <i data-lucide="alert-circle" style="width: 48px; height: 48px; color: #ff5555; margin-bottom: 16px;"></i>
                    <p style="color: var(--text-secondary);">加载知识列表失败。<br>请检查 <code>assets/data/knowledge-index.json</code> 文件格式。</p>
                </div>
            `;
            if (window.lucide) {
                lucide.createIcons();
            }
        });
});
