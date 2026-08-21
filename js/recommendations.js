(function () {
    const DEFAULT_MODULES = {
        homeLyrics: { label: '首页词作轮播', source: 'lyrics', limit: 5, items: [] },
        homeMusic: { label: '首页音乐作品', source: 'music', limit: 4, items: [] },
        homePhotos: { label: '首页摄影橱窗', source: 'photos', limit: 6, items: [] },
        lyricsPageFeatured: { label: '词作页优先展示', source: 'lyrics', limit: 8, items: [] },
        musicPageFeatured: { label: '音乐页优先展示', source: 'music', limit: 8, items: [] },
        photosPageFeatured: { label: '摄影页优先展示', source: 'photos', limit: 12, items: [] },
        knowledgePageFeatured: { label: '知识页优先展示', source: 'knowledge', limit: 6, items: [] }
    };

    const currentScript = document.currentScript;
    const pathPrefix = currentScript && currentScript.dataset.base ? currentScript.dataset.base : '';

    function normalizeItems(items) {
        if (!Array.isArray(items)) return [];
        return items
            .map(item => typeof item === 'string' ? item : item && item.id)
            .filter(Boolean);
    }

    function normalizeConfig(config) {
        const modules = { ...DEFAULT_MODULES };

        if (config && config.modules) {
            Object.keys(DEFAULT_MODULES).forEach(key => {
                const incoming = config.modules[key] || {};
                modules[key] = {
                    ...DEFAULT_MODULES[key],
                    ...incoming,
                    items: normalizeItems(incoming.items)
                };
            });
        }

        return {
            version: config && config.version ? config.version : 1,
            updatedAt: config && config.updatedAt ? config.updatedAt : '',
            modules
        };
    }

    async function fetchJson(path, fallback) {
        try {
            const response = await fetch(path + (path.includes('?') ? '&' : '?') + 'v=' + Date.now());
            if (!response.ok) throw new Error('Request failed: ' + path);
            return await response.json();
        } catch (error) {
            return fallback;
        }
    }

    async function loadConfig() {
        const config = await fetchJson(pathPrefix + 'assets/data/recommendations.json', null);
        return normalizeConfig(config);
    }

    function isVisibleItem(item) {
        return Boolean(item) && !item.deletedAt;
    }

    function filterVisible(items) {
        return Array.isArray(items) ? items.filter(isVisibleItem) : [];
    }

    function pickByModule(items, config, moduleKey, fallbackPicker) {
        const visibleItems = filterVisible(items);
        const moduleConfig = config && config.modules ? config.modules[moduleKey] : null;
        const ids = normalizeItems(moduleConfig && moduleConfig.items);
        const limit = moduleConfig && moduleConfig.limit ? Number(moduleConfig.limit) : undefined;

        if (ids.length > 0) {
            const itemMap = new Map(visibleItems.map(item => [String(item.id), item]));
            return ids
                .map(id => itemMap.get(String(id)))
                .filter(Boolean)
                .slice(0, limit || ids.length);
        }

        return typeof fallbackPicker === 'function' ? fallbackPicker(visibleItems) : visibleItems;
    }

    function prioritizeByModule(items, config, moduleKey) {
        const visibleItems = filterVisible(items);
        const moduleConfig = config && config.modules ? config.modules[moduleKey] : null;
        const ids = normalizeItems(moduleConfig && moduleConfig.items);
        if (ids.length === 0) return visibleItems;

        const rank = new Map(ids.map((id, index) => [String(id), index]));
        return [...visibleItems].sort((a, b) => {
            const aRank = rank.has(String(a.id)) ? rank.get(String(a.id)) : Number.MAX_SAFE_INTEGER;
            const bRank = rank.has(String(b.id)) ? rank.get(String(b.id)) : Number.MAX_SAFE_INTEGER;
            if (aRank !== bRank) return aRank - bRank;
            return 0;
        });
    }

    window.DeanRecommendations = {
        defaultModules: DEFAULT_MODULES,
        loadConfig,
        filterVisible,
        pickByModule,
        prioritizeByModule
    };
})();
