const DATA_FILES = {
    photos: 'assets/data/photos.json',
    lyrics: 'assets/data/lyrics.json',
    music: 'assets/data/music.json',
    knowledge: 'assets/data/knowledge-index.json',
    recommendations: 'assets/data/recommendations.json'
};

const SOURCE_META = {
    photos: { label: '图片', icon: 'image', uploadType: 'photos' },
    lyrics: { label: '词作', icon: 'file-text', uploadType: 'lyricsCover' },
    music: { label: '音乐', icon: 'music', uploadType: 'musicCover' },
    knowledge: { label: '知识', icon: 'book-open', uploadType: '' }
};

const UPLOAD_DIRS = {
    photos: 'assets/images/admin-uploads/photos',
    lyricsCover: 'assets/images/admin-uploads/lyrics',
    lyricAudio: 'assets/audio/admin-uploads',
    musicCover: 'assets/images/admin-uploads/music',
    musicAudio: 'assets/audio/admin-uploads'
};

const AUTH_STORAGE_KEY = 'deanAdminAuth';
const LEGACY_AUTH_STORAGE_KEY = 'deanAdminToken';
const AUTH_TTL_DAYS = 7;
const AUTH_TTL_MS = AUTH_TTL_DAYS * 24 * 60 * 60 * 1000;

const state = {
    token: '',
    online: false,
    apiError: '',
    apiStatus: 0,
    baseFiles: {},
    files: {},
    textFiles: {},
    pendingAssets: [],
    previewUrls: {},
    newIds: {
        photos: new Set(),
        lyrics: new Set(),
        music: new Set(),
        knowledge: new Set()
    },
    activePanel: 'dashboard-panel',
    activeLibrary: 'photos',
    activeRecommendation: 'homeLyrics'
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

document.addEventListener('DOMContentLoaded', () => {
    bindChrome();
    bindForms();
    bindRecommendations();
    bindPublishActions();
    setDefaultFormValues();

    const savedToken = getStoredAdminToken();
    if (savedToken) {
        $('#admin-token-input').value = savedToken;
        login(savedToken);
    }
});

function bindChrome() {
    $('#login-button').addEventListener('click', () => {
        login($('#admin-token-input').value.trim());
    });

    $('#admin-token-input').addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            login($('#admin-token-input').value.trim());
        }
    });

    $('#logout-button').addEventListener('click', () => {
        clearStoredAdminToken();
        window.location.reload();
    });

    $('#reload-button').addEventListener('click', () => {
        if (hasChanges() && !window.confirm('当前有未保存草稿，重新读取会清空这些草稿。确定继续吗？')) {
            return;
        }
        loadContent();
    });

    $$('.side-link').forEach(button => {
        button.addEventListener('click', () => setPanel(button.dataset.panel));
    });

    document.addEventListener('click', event => {
        const shortcut = event.target.closest('[data-panel-shortcut]');
        if (shortcut) {
            setPanel(shortcut.dataset.panelShortcut);
            return;
        }

        if (event.target.closest('[data-publish-all-shortcut]')) {
            publishAllDrafts();
        }
    });
}

async function login(token) {
    const normalizedToken = normalizeAdminToken(token);
    if (!normalizedToken) {
        setLoginError('请先输入后台口令');
        showToast('请先输入后台口令');
        return;
    }

    setLoginError('');
    setLoginBusy(true);
    state.token = normalizedToken;
    const loaded = await loadContent();
    setLoginBusy(false);

    if (!loaded) {
        return;
    }

    saveStoredAdminToken(normalizedToken);
    $('#login-screen').classList.add('is-hidden');
    $('#admin-app').classList.remove('is-hidden');
}

async function loadContent() {
    setMode('读取中', false);
    setPublishOutput('正在读取内容库...');

    try {
        const apiFiles = await loadFromApi();
        state.online = true;
        state.apiError = '';
        state.apiStatus = 200;
        initializeFiles(apiFiles);
        showToast('已连接线上发布接口');
    } catch (apiError) {
        state.online = false;
        state.apiError = apiError.message;
        state.apiStatus = apiError.status || 0;

        if (apiError.status === 401) {
            state.token = '';
            clearStoredAdminToken();
            $('#admin-app').classList.add('is-hidden');
            $('#login-screen').classList.remove('is-hidden');
            setLoginError('后台口令和 Vercel 里的 ADMIN_TOKEN 不匹配，请检查后重新输入。');
            showToast('后台口令不正确');
            return false;
        }

        try {
            const staticFiles = await loadStaticFiles();
            initializeFiles(staticFiles);
            showToast(apiError.status >= 500 ? '线上发布配置未完成' : '已进入本地草稿模式');
        } catch (staticError) {
            setPublishOutput(`读取失败：${staticError.message}`);
            showToast('读取内容库失败');
            return false;
        }
    }

    updateModePill();
    renderAll();
    return true;
}

async function loadFromApi() {
    const response = await fetch('/api/admin/content', {
        headers: getAuthHeaders(),
        cache: 'no-store'
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const error = new Error(data.error || '线上接口不可用');
        error.status = response.status;
        throw error;
    }

    return data.files || {};
}

function getAuthHeaders() {
    return {
        'x-admin-token': state.token,
        Authorization: `Bearer ${state.token}`
    };
}

function normalizeAdminToken(value) {
    const trimmed = String(value || '').trim();
    const quotePairs = [
        ['"', '"'],
        ["'", "'"],
        ['“', '”'],
        ['‘', '’']
    ];
    const pair = quotePairs.find(([start, end]) => trimmed.startsWith(start) && trimmed.endsWith(end));
    return pair && trimmed.length >= 2 ? trimmed.slice(1, -1).trim() : trimmed;
}

function getStoredAdminToken() {
    try {
        const rawValue = localStorage.getItem(AUTH_STORAGE_KEY);
        if (rawValue) {
            const savedAuth = JSON.parse(rawValue);
            const expiresAt = Number(savedAuth && savedAuth.expiresAt);
            if (savedAuth && savedAuth.token && expiresAt > Date.now()) {
                return savedAuth.token;
            }
            localStorage.removeItem(AUTH_STORAGE_KEY);
        }

        return sessionStorage.getItem(LEGACY_AUTH_STORAGE_KEY) || '';
    } catch (error) {
        clearStoredAdminToken();
        return '';
    }
}

function saveStoredAdminToken(token) {
    try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
            token,
            savedAt: Date.now(),
            expiresAt: Date.now() + AUTH_TTL_MS
        }));
        sessionStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
    } catch (error) {
        sessionStorage.setItem(LEGACY_AUTH_STORAGE_KEY, token);
    }
}

function clearStoredAdminToken() {
    try {
        localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (error) {
        // Ignore storage cleanup errors.
    }
    sessionStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
}

async function loadStaticFiles() {
    const [photos, lyrics, music, knowledge, recommendations] = await Promise.all([
        fetchJson('../assets/data/photos.json'),
        fetchJson('../assets/data/lyrics.json'),
        fetchJson('../assets/data/music.json'),
        fetchJson('../assets/data/knowledge-index.json'),
        fetchJson('../assets/data/recommendations.json', buildDefaultRecommendations())
    ]);

    return {
        [DATA_FILES.photos]: photos,
        [DATA_FILES.lyrics]: lyrics,
        [DATA_FILES.music]: music,
        [DATA_FILES.knowledge]: knowledge,
        [DATA_FILES.recommendations]: recommendations
    };
}

async function fetchJson(path, fallback) {
    try {
        const response = await fetch(`${path}?v=${Date.now()}`);
        if (!response.ok) throw new Error(`${path} ${response.status}`);
        return response.json();
    } catch (error) {
        if (fallback !== undefined) return clone(fallback);
        throw error;
    }
}

function initializeFiles(files) {
    const normalized = {
        [DATA_FILES.photos]: Array.isArray(files[DATA_FILES.photos]) ? files[DATA_FILES.photos] : [],
        [DATA_FILES.lyrics]: Array.isArray(files[DATA_FILES.lyrics]) ? files[DATA_FILES.lyrics] : [],
        [DATA_FILES.music]: Array.isArray(files[DATA_FILES.music]) ? files[DATA_FILES.music] : [],
        [DATA_FILES.knowledge]: Array.isArray(files[DATA_FILES.knowledge]) ? files[DATA_FILES.knowledge] : [],
        [DATA_FILES.recommendations]: normalizeRecommendations(files[DATA_FILES.recommendations])
    };

    state.baseFiles = clone(normalized);
    state.files = clone(normalized);
    state.textFiles = {};
    state.pendingAssets = [];
    state.previewUrls = {};
    Object.values(state.newIds).forEach(set => set.clear());
}

function buildDefaultRecommendations() {
    const modules = window.DeanRecommendations && window.DeanRecommendations.defaultModules
        ? clone(window.DeanRecommendations.defaultModules)
        : {};

    return {
        version: 1,
        updatedAt: '',
        modules
    };
}

function normalizeRecommendations(value) {
    const defaults = buildDefaultRecommendations();
    const normalized = {
        version: value && value.version ? value.version : 1,
        updatedAt: value && value.updatedAt ? value.updatedAt : '',
        modules: {}
    };

    Object.entries(defaults.modules).forEach(([key, defaultModule]) => {
        const incoming = value && value.modules ? value.modules[key] : null;
        normalized.modules[key] = {
            ...defaultModule,
            ...(incoming || {}),
            items: normalizeRecommendationItems(incoming && incoming.items)
        };
    });

    return normalized;
}

function normalizeRecommendationItems(items) {
    if (!Array.isArray(items)) return [];
    return items
        .map(item => typeof item === 'string' ? item : item && item.id)
        .filter(Boolean)
        .map(String);
}

function bindForms() {
    $$('#resource-type-tabs button').forEach(button => {
        button.addEventListener('click', () => {
            $$('#resource-type-tabs button').forEach(item => item.classList.remove('is-active'));
            $$('.resource-form').forEach(form => form.classList.remove('is-active'));
            button.classList.add('is-active');
            $('#' + button.dataset.resourceForm).classList.add('is-active');
            renderIcons();
        });
    });

    $('#library-source-select').addEventListener('change', event => {
        state.activeLibrary = event.target.value;
        renderLibrary();
    });

    $('#library-search').addEventListener('input', renderLibrary);

    $('#photo-form').addEventListener('submit', handlePhotoSubmit);
    $('#lyric-form').addEventListener('submit', handleLyricSubmit);
    $('#music-form').addEventListener('submit', handleMusicSubmit);
    $('#knowledge-form').addEventListener('submit', handleKnowledgeSubmit);

    $('#lyric-form').elements.contentFile.addEventListener('change', async event => {
        const file = event.target.files[0];
        if (!file) return;
        try {
            $('#lyric-form').elements.content.value = await readTextFile(file);
            showToast('Markdown 歌词已读取');
        } catch (error) {
            showToast('读取 Markdown 文件失败');
        }
    });

    $('#draft-list').addEventListener('click', event => {
        const button = event.target.closest('[data-remove-draft]');
        if (!button) return;
        removeDraftItem(button.dataset.source, button.dataset.id);
    });

    $('#pending-list').addEventListener('click', event => {
        const publishButton = event.target.closest('[data-publish-draft]');
        const removeButton = event.target.closest('[data-remove-draft]');

        if (publishButton) {
            publishSingleDraft(publishButton.dataset.source, publishButton.dataset.id);
            return;
        }

        if (removeButton) {
            removeDraftItem(removeButton.dataset.source, removeButton.dataset.id);
        }
    });
}

async function handlePhotoSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = form.elements.file.files[0];
    if (!file) return showToast('请选择图片文件');

    await runFormTask(form, async () => {
        const title = form.elements.title.value.trim();
        const id = makeUniqueId('img', title || file.name, 'photos');
        state.previewUrls[id] = URL.createObjectURL(file);
        const src = await uploadAsset(file, 'photos');

        appendResource('photos', {
            id,
            title: title || id,
            description: form.elements.description.value.trim(),
            src,
            showOnHome: form.elements.showOnHome.checked,
            category: form.elements.category.value.trim() || 'Photography',
            date: form.elements.date.value.trim() || formatMonthYear(new Date()),
            updateTime: Date.now() / 1000
        });

        if (form.elements.showOnHome.checked) {
            addRecommendation('homePhotos', id);
        }

        form.reset();
        setDefaultFormValues();
        showToast('图片资源已加入待发布列表');
    });
}

async function handleLyricSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const coverFile = form.elements.coverFile.files[0];
    const audioFile = form.elements.audioFile.files[0];
    if (!coverFile) return showToast('请选择封面图片');

    await runFormTask(form, async () => {
        const title = form.elements.title.value.trim();
        const pastedContent = form.elements.content.value.trim();
        const fileContent = form.elements.contentFile.files[0]
            ? (await readTextFile(form.elements.contentFile.files[0])).trim()
            : '';
        const content = fileContent || pastedContent;
        if (!content) {
            throw new Error('请上传 Markdown 文件或填写正文内容');
        }

        const id = makeUniqueId('lyric', title, 'lyrics');
        state.previewUrls[id] = URL.createObjectURL(coverFile);
        const cover = await uploadAsset(coverFile, 'lyricsCover');
        const audioPath = audioFile ? await uploadAsset(audioFile, 'lyricAudio') : '';
        const contentPath = `assets/lyrics/admin-generated/${id}.md`;
        const showOnHome = form.elements.showOnHome.checked;

        state.textFiles[contentPath] = content;
        appendResource('lyrics', {
            id,
            title,
            author: form.elements.author.value.trim() || 'Dean Huo',
            date: form.elements.date.value || formatInputDate(new Date()),
            cover,
            summary: form.elements.summary.value.trim(),
            contentPath,
            ...(audioPath ? { audioPath } : {}),
            order: getNextNumber('lyrics', 'order'),
            showOnHome,
            homeOrder: getNextHomeOrder('lyrics'),
            releaseYear: form.elements.releaseYear.value.trim() || String(new Date().getFullYear())
        });

        if (showOnHome) {
            addRecommendation('homeLyrics', id);
        }

        form.reset();
        setDefaultFormValues();
        showToast('词作资源已加入待发布列表');
    });
}

async function handleMusicSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const coverFile = form.elements.coverFile.files[0];
    const audioFile = form.elements.audioFile.files[0];
    if (!coverFile) return showToast('请选择封面图片');
    if (!audioFile) return showToast('请选择音频文件');

    await runFormTask(form, async () => {
        const title = form.elements.title.value.trim();
        const id = makeUniqueId('music', title, 'music');
        const lyricMarkdownFile = form.elements.lyricMarkdownFile.files[0];
        const lyricMarkdown = lyricMarkdownFile ? (await readTextFile(lyricMarkdownFile)).trim() : '';
        const shouldSyncLyric = Boolean(lyricMarkdown && form.elements.syncLyric.checked);
        state.previewUrls[id] = URL.createObjectURL(coverFile);
        const cover = await uploadAsset(coverFile, 'musicCover');
        const url = await uploadAsset(audioFile, 'musicAudio');
        let lyricId = form.elements.lyricId.value;

        if (shouldSyncLyric) {
            lyricId = makeUniqueId('lyric', title, 'lyrics');
            const contentPath = `assets/lyrics/admin-generated/${lyricId}.md`;
            state.textFiles[contentPath] = lyricMarkdown;
            appendResource('lyrics', {
                id: lyricId,
                title,
                author: form.elements.artist.value.trim() || 'Dean Huo',
                date: formatInputDate(new Date()),
                cover,
                summary: form.elements.description.value.trim() || summarizeMarkdown(lyricMarkdown),
                contentPath,
                audioPath: url,
                order: getNextNumber('lyrics', 'order'),
                showOnHome: false,
                homeOrder: getNextHomeOrder('lyrics'),
                releaseYear: form.elements.year.value.trim() || String(new Date().getFullYear())
            });
        }

        const musicItem = {
            id,
            title,
            artist: form.elements.artist.value.trim() || 'Dean Huo',
            year: form.elements.year.value.trim() || String(new Date().getFullYear()),
            cover,
            url,
            genre: form.elements.genre.value.trim() || 'Original',
            description: form.elements.description.value.trim(),
            ...(lyricId ? { lyricId } : {})
        };

        if (lyricMarkdown && !shouldSyncLyric) {
            musicItem.lyricText = markdownToPlainText(lyricMarkdown);
        }

        appendResource('music', musicItem);

        if (form.elements.showOnHome.checked) {
            addRecommendation('homeMusic', id);
        }

        form.reset();
        setDefaultFormValues();
        showToast(shouldSyncLyric ? '音乐和关联词作已加入待发布列表' : '音乐资源已加入待发布列表');
    });
}

async function handleKnowledgeSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;

    await runFormTask(form, async () => {
        const title = form.elements.title.value.trim();
        const externalUrl = form.elements.externalUrl.value.trim();
        const content = form.elements.content.value.trim();

        if (!externalUrl && !content) {
            throw new Error('知识内容需要填写正文或外部链接');
        }

        const id = makeUniqueId('knowledge', title, 'knowledge');
        const item = {
            id,
            title,
            description: form.elements.description.value.trim(),
            date: form.elements.date.value || formatInputDate(new Date()),
            tags: splitTags(form.elements.tags.value)
        };

        if (externalUrl) {
            item.externalUrl = externalUrl;
        } else {
            item.filename = `admin-generated/${id}.md`;
            state.textFiles[`assets/data/knowledge/${item.filename}`] = content;
        }

        appendResource('knowledge', item);

        if (form.elements.featured.checked) {
            addRecommendation('knowledgePageFeatured', id);
        }

        form.reset();
        setDefaultFormValues();
        showToast('知识资源已加入待发布列表');
    });
}

async function runFormTask(form, task) {
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
        await task();
        renderAll();
        setPanel('pending-panel');
    } catch (error) {
        showToast(error.message || '操作失败');
    } finally {
        submitButton.disabled = false;
    }
}

async function uploadAsset(file, uploadType) {
    if (!state.online) {
        const path = suggestAssetPath(uploadType, file.name);
        state.pendingAssets.push({
            path,
            name: file.name,
            size: file.size,
            type: file.type
        });
        return path;
    }

    const formData = new FormData();
    formData.append('uploadType', uploadType);
    formData.append('file', file);

    const response = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || '上传失败');
    }

    return data.path;
}

function appendResource(source, item) {
    state.files[DATA_FILES[source]].push(item);
    state.newIds[source].add(String(item.id));
}

function removeDraftItem(source, id) {
    if (!state.newIds[source] || !state.newIds[source].has(String(id))) {
        showToast('历史资源不能在后台删除');
        return;
    }

    const filePath = DATA_FILES[source];
    const item = state.files[filePath].find(entry => String(entry.id) === String(id));
    state.files[filePath] = state.files[filePath].filter(entry => String(entry.id) !== String(id));
    state.newIds[source].delete(String(id));

    if (item && item.contentPath) {
        delete state.textFiles[item.contentPath];
    }
    if (item && item.filename) {
        delete state.textFiles[`assets/data/knowledge/${item.filename}`];
    }

    Object.values(getRecommendations().modules).forEach(moduleConfig => {
        moduleConfig.items = moduleConfig.items.filter(itemId => String(itemId) !== String(id));
    });

    renderAll();
    showToast('已从待发布列表移除');
}

function bindRecommendations() {
    $('#recommendation-module-select').addEventListener('change', event => {
        state.activeRecommendation = event.target.value;
        renderRecommendationPanel();
    });

    $('#recommendation-search').addEventListener('input', renderRecommendationPanel);

    $('#recommendations-panel').addEventListener('click', event => {
        const addButton = event.target.closest('[data-rec-add]');
        const removeButton = event.target.closest('[data-rec-remove]');
        const moveButton = event.target.closest('[data-rec-move]');

        if (addButton) {
            addRecommendation(state.activeRecommendation, addButton.dataset.recAdd);
            renderAll();
            return;
        }

        if (removeButton) {
            removeRecommendation(state.activeRecommendation, removeButton.dataset.recRemove);
            renderAll();
            return;
        }

        if (moveButton) {
            moveRecommendation(state.activeRecommendation, moveButton.dataset.recMove, moveButton.dataset.direction);
            renderAll();
        }
    });
}

function addRecommendation(moduleKey, id) {
    const moduleConfig = getRecommendations().modules[moduleKey];
    if (!moduleConfig) return;
    const ids = moduleConfig.items.map(String);

    if (ids.includes(String(id))) return;
    if (moduleConfig.limit && ids.length >= moduleConfig.limit) {
        showToast(`该模块最多推荐 ${moduleConfig.limit} 个内容`);
        return;
    }

    moduleConfig.items.push(String(id));
}

function removeRecommendation(moduleKey, id) {
    const moduleConfig = getRecommendations().modules[moduleKey];
    if (!moduleConfig) return;
    moduleConfig.items = moduleConfig.items.filter(itemId => String(itemId) !== String(id));
}

function moveRecommendation(moduleKey, id, direction) {
    const moduleConfig = getRecommendations().modules[moduleKey];
    if (!moduleConfig) return;

    const index = moduleConfig.items.findIndex(itemId => String(itemId) === String(id));
    if (index === -1) return;

    const offset = direction === 'up' ? -1 : 1;
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= moduleConfig.items.length) return;

    const [item] = moduleConfig.items.splice(index, 1);
    moduleConfig.items.splice(nextIndex, 0, item);
}

function renderAll() {
    renderStats();
    renderDraft();
    renderPendingList();
    renderLibrary();
    renderRecommendationModuleSelect();
    renderRecommendationPanel();
    renderMusicLyricSelect();
    renderPublishChecks();
    renderIcons();
}

function renderStats() {
    const stats = Object.entries(SOURCE_META).map(([source, meta]) => {
        const total = getSourceItems(source).length;
        const added = state.newIds[source].size;
        return `
            <div class="stat-card">
                <span>${escapeHtml(meta.label)}</span>
                <strong>${total}</strong>
                <p>${added > 0 ? `本次新增 ${added}` : '无新增草稿'}</p>
            </div>
        `;
    }).join('');

    $('#stats-grid').innerHTML = stats;
}

function renderDraft() {
    const entries = getDraftEntries();
    const textCount = Object.keys(state.textFiles).length;
    const recChanged = hasFileChanged(DATA_FILES.recommendations);
    const assetCount = state.pendingAssets.length;
    const totalChanges = entries.length + textCount + (recChanged ? 1 : 0);

    $('#draft-summary').textContent = totalChanges === 0
        ? '暂无新增内容。'
        : `新增资源 ${entries.length} 个，生成 Markdown ${textCount} 个，待处理附件 ${assetCount} 个${recChanged ? '，推荐配置已调整' : ''}。`;

    if (entries.length === 0 && !recChanged && textCount === 0) {
        $('#draft-list').innerHTML = '<div class="draft-item"><span>还没有草稿内容</span><span>安全</span></div>';
        return;
    }

    const rows = entries.map(({ source, item }) => `
        <div class="draft-item">
            <div>
                <strong>${escapeHtml(item.title || item.id)}</strong>
                <div>${escapeHtml(SOURCE_META[source].label)} · ${escapeHtml(item.id)}</div>
            </div>
            <button class="ghost-action" data-remove-draft="${escapeAttribute(item.id)}" data-source="${source}">
                <i data-lucide="trash-2"></i>
                移除
            </button>
        </div>
    `);

    if (recChanged) {
        rows.push('<div class="draft-item"><span>推荐配置已调整</span><span>recommendations.json</span></div>');
    }

    if (textCount > 0) {
        rows.push(`<div class="draft-item"><span>生成 Markdown 文件</span><span>${textCount} 个</span></div>`);
    }

    $('#draft-list').innerHTML = rows.join('');
}

function renderPendingList() {
    const entries = getDraftEntries();
    const recChanged = hasFileChanged(DATA_FILES.recommendations);
    const textCount = Object.keys(state.textFiles).length;
    const assetCount = state.pendingAssets.length;
    const totalChanges = entries.length + textCount + (recChanged ? 1 : 0);
    const modeText = state.online
        ? '已连接线上发布接口，可以直接提交到 GitHub。'
        : `未连接线上发布接口${state.apiError ? `：${state.apiError}` : ''}。当前只能下载草稿包。`;

    $('#pending-status').textContent = totalChanges === 0
        ? `${modeText} 暂无待发布资源。`
        : `${modeText} 待发布资源 ${entries.length} 个，生成 Markdown ${textCount} 个，待处理附件 ${assetCount} 个${recChanged ? '，推荐配置已调整' : ''}。`;

    if (entries.length === 0 && !recChanged) {
        $('#pending-list').innerHTML = `
            <div class="pending-empty">
                <i data-lucide="check-circle"></i>
                <strong>没有待发布资源</strong>
                <span>新增图片、词作、音乐或知识内容后，会立刻出现在这里。</span>
            </div>
        `;
        return;
    }

    const cards = entries.map(({ source, item }) => {
        const availability = getSinglePublishAvailability(source, item);
        const textFiles = getTextFilePathsForItem(source, item);
        const recommendationLabels = getRecommendationLabelsForItem(source, item.id);
        const badges = [
            `<span>${escapeHtml(SOURCE_META[source].label)}</span>`,
            ...textFiles.map(() => '<span>Markdown</span>'),
            ...recommendationLabels.map(label => `<span>${escapeHtml(label)}</span>`)
        ].join('');

        return `
            <article class="pending-card">
                ${renderMiniMedia(source, item)}
                <div class="pending-card-body">
                    <div class="pending-card-heading">
                        <h3>${escapeHtml(item.title || item.id)}</h3>
                        <span>${escapeHtml(item.id)}</span>
                    </div>
                    <p>${escapeHtml(getItemMeta(source, item))}</p>
                    <div class="pending-badges">${badges}</div>
                    ${availability.reason ? `<div class="pending-note">${escapeHtml(availability.reason)}</div>` : ''}
                </div>
                <div class="pending-card-actions">
                    <button class="primary-action" data-publish-draft="${escapeAttribute(item.id)}" data-source="${source}" ${availability.canPublish ? '' : 'disabled'} title="${escapeAttribute(availability.reason || '发布这条资源')}">
                        <i data-lucide="cloud-upload"></i>
                        发布这条
                    </button>
                    <button class="ghost-action" data-remove-draft="${escapeAttribute(item.id)}" data-source="${source}">
                        <i data-lucide="trash-2"></i>
                        移除
                    </button>
                </div>
            </article>
        `;
    });

    if (recChanged) {
        cards.push(`
            <article class="pending-card pending-card-config">
                <div class="resource-icon"><i data-lucide="list-ordered"></i></div>
                <div class="pending-card-body">
                    <div class="pending-card-heading">
                        <h3>推荐配置改动</h3>
                        <span>recommendations.json</span>
                    </div>
                    <p>推荐位和排序会跟随一键发布保存；单条发布会只带上已发布资源可用的推荐引用。</p>
                    <div class="pending-badges"><span>推荐配置</span></div>
                </div>
                <div class="pending-card-actions">
                    <button class="primary-action" data-publish-all-shortcut>
                        <i data-lucide="cloud-upload"></i>
                        一键发布
                    </button>
                </div>
            </article>
        `);
    }

    $('#pending-list').innerHTML = cards.join('');
}

function renderLibrary() {
    const source = state.activeLibrary;
    const query = $('#library-search').value.trim().toLowerCase();
    const items = filterItems(getSourceItems(source), query);

    $('#resource-library').innerHTML = items.map(item => renderResourceCard(source, item)).join('')
        || '<div class="draft-item"><span>没有匹配资源</span></div>';
}

function renderResourceCard(source, item) {
    const image = getItemImage(source, item);
    const isNew = state.newIds[source].has(String(item.id));
    const media = image
        ? `<img class="resource-thumb" src="${escapeAttribute(resolveAssetUrl(state.previewUrls[item.id] || image))}" alt="${escapeAttribute(item.title || item.id)}">`
        : `<div class="resource-icon"><i data-lucide="${SOURCE_META[source].icon}"></i></div>`;

    return `
        <article class="resource-card">
            ${media}
            <div>
                <h4>${escapeHtml(item.title || item.id)}</h4>
                <p>${escapeHtml(getItemMeta(source, item))}</p>
            </div>
            <span class="resource-badge ${isNew ? 'is-new' : ''}">${isNew ? '本次新增' : '历史只读'}</span>
        </article>
    `;
}

function renderRecommendationModuleSelect() {
    const recommendations = getRecommendations();
    const options = Object.entries(recommendations.modules).map(([key, moduleConfig]) => `
        <option value="${key}" ${key === state.activeRecommendation ? 'selected' : ''}>
            ${escapeHtml(moduleConfig.label)}
        </option>
    `).join('');

    $('#recommendation-module-select').innerHTML = options;
}

function renderRecommendationPanel() {
    const recommendations = getRecommendations();
    const moduleConfig = recommendations.modules[state.activeRecommendation];
    if (!moduleConfig) return;

    const source = moduleConfig.source;
    const items = getSourceItems(source);
    const itemMap = new Map(items.map(item => [String(item.id), item]));
    const selectedIds = moduleConfig.items.map(String);

    $('#module-meta').textContent = `${moduleConfig.label} · 来源：${SOURCE_META[source].label} · 上限：${moduleConfig.limit}`;

    $('#selected-recommendations').innerHTML = selectedIds.map((id, index) => {
        const item = itemMap.get(id);
        return `
            <article class="recommendation-item">
                ${renderMiniMedia(source, item)}
                <div>
                    <h4>${escapeHtml(item ? item.title || id : id)}</h4>
                    <p>${item ? escapeHtml(getItemMeta(source, item)) : '资源不存在，请移除'}</p>
                </div>
                <div class="recommendation-actions">
                    <button class="icon-action" title="上移" data-rec-move="${escapeAttribute(id)}" data-direction="up" ${index === 0 ? 'disabled' : ''}>
                        <i data-lucide="arrow-up"></i>
                    </button>
                    <button class="icon-action" title="下移" data-rec-move="${escapeAttribute(id)}" data-direction="down" ${index === selectedIds.length - 1 ? 'disabled' : ''}>
                        <i data-lucide="arrow-down"></i>
                    </button>
                    <button class="icon-action" title="移除" data-rec-remove="${escapeAttribute(id)}">
                        <i data-lucide="x"></i>
                    </button>
                </div>
            </article>
        `;
    }).join('') || '<div class="draft-item"><span>该模块暂无推荐内容</span></div>';

    const query = $('#recommendation-search').value.trim().toLowerCase();
    const selectedSet = new Set(selectedIds);
    const candidates = filterItems(items, query).slice(0, 80);

    $('#recommendation-candidates').innerHTML = candidates.map(item => {
        const isSelected = selectedSet.has(String(item.id));
        return `
            <article class="candidate-item ${isSelected ? 'is-selected' : ''}">
                ${renderMiniMedia(source, item)}
                <div>
                    <h4>${escapeHtml(item.title || item.id)}</h4>
                    <p>${escapeHtml(getItemMeta(source, item))}</p>
                </div>
                <div class="candidate-actions">
                    <button class="icon-action" title="加入推荐" data-rec-add="${escapeAttribute(item.id)}" ${isSelected ? 'disabled' : ''}>
                        <i data-lucide="plus"></i>
                    </button>
                </div>
            </article>
        `;
    }).join('') || '<div class="draft-item"><span>没有匹配资源</span></div>';
}

function renderMiniMedia(source, item) {
    if (!item) {
        return `<div class="resource-icon"><i data-lucide="alert-circle"></i></div>`;
    }

    const image = getItemImage(source, item);
    return image
        ? `<img class="resource-thumb" src="${escapeAttribute(resolveAssetUrl(state.previewUrls[item.id] || image))}" alt="${escapeAttribute(item.title || item.id)}">`
        : `<div class="resource-icon"><i data-lucide="${SOURCE_META[source].icon}"></i></div>`;
}

function renderMusicLyricSelect() {
    const lyrics = getSourceItems('lyrics');
    $('#music-lyric-select').innerHTML = [
        '<option value="">不关联词作</option>',
        ...lyrics.map(item => `<option value="${escapeAttribute(item.id)}">${escapeHtml(item.title || item.id)}</option>`)
    ].join('');
}

function bindPublishActions() {
    $('#publish-button').addEventListener('click', publishAllDrafts);
    $('#quick-publish-button').addEventListener('click', () => {
        setPanel('publish-panel');
        publishAllDrafts();
    });
    $('#dashboard-publish-all-button').addEventListener('click', publishAllDrafts);
    $('#pending-publish-all-button').addEventListener('click', publishAllDrafts);
    $('#export-button').addEventListener('click', downloadDraftBundle);
    $('#download-payload-button').addEventListener('click', downloadDraftBundle);
    $('#pending-download-button').addEventListener('click', downloadDraftBundle);
    $('#copy-payload-button').addEventListener('click', copyDraftBundle);
}

function renderPublishChecks() {
    const problems = getPublishProblems();
    const checks = [
        {
            icon: problems.length === 0 ? 'shield-check' : 'alert-triangle',
            text: problems.length === 0 ? '历史数据保护检查通过' : problems[0]
        },
        {
            icon: state.online ? 'cloud' : 'file-json',
            text: state.online ? '当前为线上发布模式' : `当前为草稿导出模式${state.apiError ? `：${state.apiError}` : ''}`
        },
        {
            icon: hasChanges() ? 'pen-line' : 'check-circle',
            text: hasChanges() ? '存在未保存草稿' : '没有待发布改动'
        },
        {
            icon: 'paperclip',
            text: state.pendingAssets.length > 0
                ? `本地草稿包含 ${state.pendingAssets.length} 个待上传附件`
                : '没有本地待上传附件'
        }
    ];

    $('#publish-checks').innerHTML = checks.map(check => `
        <div class="check-item">
            <i data-lucide="${check.icon}"></i>
            <span>${escapeHtml(check.text)}</span>
        </div>
    `).join('');
}

async function publishAllDrafts() {
    renderPublishChecks();

    const problems = getPublishProblems();
    if (problems.length > 0) {
        setPublishOutput(`发布被拦截：\n${problems.join('\n')}`);
        showToast('发布检查未通过');
        return;
    }

    if (!hasChanges()) {
        setPublishOutput('没有待发布改动。');
        showToast('没有待发布改动');
        return;
    }

    if (!state.online) {
        const bundle = buildDraftBundle();
        setPublishOutput([
            '当前未连接线上 GitHub 发布接口，所以还不能直接保存发布。',
            '',
            '请确认 Vercel 已配置 ADMIN_TOKEN / GITHUB_TOKEN / GITHUB_REPO / GITHUB_BRANCH，并使用正确后台口令重新进入后台。',
            '在配置完成前，可以先下载草稿包备份本次新增内容。',
            '',
            JSON.stringify(bundle.summary, null, 2)
        ].join('\n'));
        showToast('线上发布接口未连接');
        return;
    }

    const payload = buildPublishPayload();
    setPublishOutput('正在提交到 GitHub...');
    setPublishBusy(true);

    try {
        const response = await fetch('/api/admin/content', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                ...getAuthHeaders()
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || '发布失败');
        }

        if (payload.files[DATA_FILES.recommendations]) {
            state.files[DATA_FILES.recommendations] = clone(payload.files[DATA_FILES.recommendations]);
        }
        state.baseFiles = clone(state.files);
        state.textFiles = {};
        state.pendingAssets = [];
        Object.values(state.newIds).forEach(set => set.clear());

        setPublishOutput(JSON.stringify({
            message: data.changed ? '已保存到 GitHub，Vercel 会自动发布' : '没有实际变更',
            commitSha: data.commitSha,
            commitUrl: data.commitUrl,
            links: {
                home: '../index.html',
                photos: '../photos.html',
                lyrics: '../lyrics.html',
                music: '../music.html',
                knowledge: '../knowledge.html'
            }
        }, null, 2));
        renderAll();
        showToast('发布成功，待发布列表已清空');
    } catch (error) {
        setPublishOutput(`发布失败：${error.message}`);
        showToast('发布失败');
    } finally {
        setPublishBusy(false);
    }
}

async function publishSingleDraft(source, id) {
    const entry = getDraftEntry(source, id);
    if (!entry) {
        showToast('这条资源已经不在待发布列表');
        renderAll();
        return;
    }

    const entries = expandEntriesWithDependencies([entry]);
    const availability = getSinglePublishAvailability(source, entry.item);
    if (!availability.canPublish) {
        showToast(availability.reason || '暂时不能单条发布');
        return;
    }

    const problems = getPublishProblems();
    if (problems.length > 0) {
        setPublishOutput(`发布被拦截：\n${problems.join('\n')}`);
        showToast('发布检查未通过');
        return;
    }

    const payload = buildSinglePublishPayload(entries);
    if (Object.keys(payload.files).length === 0 && Object.keys(payload.textFiles).length === 0) {
        showToast('没有可发布的改动');
        return;
    }

    setPublishOutput(`正在发布：${entries.map(item => item.item.title || item.item.id).join('、')}`);
    setPublishBusy(true);

    try {
        const response = await fetch('/api/admin/content', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                ...getAuthHeaders()
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || '发布失败');
        }

        Object.entries(payload.files).forEach(([path, value]) => {
            state.baseFiles[path] = clone(value);
        });

        entries.forEach(({ source: entrySource, item }) => {
            state.newIds[entrySource].delete(String(item.id));
            getTextFilePathsForItem(entrySource, item).forEach(path => {
                delete state.textFiles[path];
            });
        });

        setPublishOutput(JSON.stringify({
            message: data.changed ? '这条资源已保存到 GitHub，Vercel 会自动发布' : '没有实际变更',
            published: entries.map(({ source: entrySource, item }) => ({
                source: SOURCE_META[entrySource].label,
                id: item.id,
                title: item.title
            })),
            commitSha: data.commitSha,
            commitUrl: data.commitUrl
        }, null, 2));
        renderAll();
        showToast('单条发布成功');
    } catch (error) {
        setPublishOutput(`发布失败：${error.message}`);
        showToast('发布失败');
    } finally {
        setPublishBusy(false);
    }
}

function buildPublishPayload() {
    const files = {};

    Object.entries(DATA_FILES).forEach(([source, path]) => {
        if (source === 'recommendations') return;
        if (hasFileChanged(path)) {
            files[path] = clone(state.files[path]);
        }
    });

    if (hasFileChanged(DATA_FILES.recommendations)) {
        const recommendations = clone(getRecommendations());
        recommendations.updatedAt = new Date().toISOString();
        files[DATA_FILES.recommendations] = recommendations;
    }

    return {
        message: 'Update resources from admin',
        files,
        textFiles: clone(state.textFiles)
    };
}

function buildSinglePublishPayload(entries) {
    const selectedBySource = buildSelectedIdMap(entries);
    const files = {};

    Object.entries(selectedBySource).forEach(([source, ids]) => {
        if (ids.size === 0) return;

        const path = DATA_FILES[source];
        const baseItems = clone(state.baseFiles[path] || []);
        const publishItems = getSourceItems(source)
            .filter(item => state.newIds[source].has(String(item.id)) && ids.has(String(item.id)))
            .map(clone);

        if (publishItems.length > 0) {
            files[path] = baseItems.concat(publishItems);
        }
    });

    const recommendations = buildPublishedRecommendations(selectedBySource);
    if (stableStringify(recommendations) !== stableStringify(state.baseFiles[DATA_FILES.recommendations])) {
        recommendations.updatedAt = new Date().toISOString();
        files[DATA_FILES.recommendations] = recommendations;
    }

    const textFiles = {};
    entries.forEach(({ source, item }) => {
        getTextFilePathsForItem(source, item).forEach(path => {
            if (state.textFiles[path] !== undefined) {
                textFiles[path] = state.textFiles[path];
            }
        });
    });

    return {
        message: `Publish resource from admin: ${entries.map(({ item }) => item.title || item.id).join(', ')}`,
        files,
        textFiles
    };
}

function buildPublishedRecommendations(selectedBySource) {
    const recommendations = clone(getRecommendations());

    Object.values(recommendations.modules).forEach(moduleConfig => {
        const source = moduleConfig.source;
        const baseItems = state.baseFiles[DATA_FILES[source]] || [];
        const allowedIds = new Set(baseItems.map(item => String(item.id)));
        const selectedIds = selectedBySource[source] || new Set();
        selectedIds.forEach(id => allowedIds.add(String(id)));
        moduleConfig.items = moduleConfig.items.filter(id => allowedIds.has(String(id)));
    });

    return recommendations;
}

function buildDraftBundle() {
    const payload = buildPublishPayload();
    return {
        summary: {
            mode: state.online ? 'online' : 'draft',
            changedFiles: Object.keys(payload.files),
            generatedTextFiles: Object.keys(payload.textFiles),
            pendingAssets: state.pendingAssets.map(asset => ({
                path: asset.path,
                name: asset.name,
                size: asset.size,
                type: asset.type
            }))
        },
        payload
    };
}

function downloadDraftBundle() {
    const bundle = buildDraftBundle();
    const blob = new Blob([JSON.stringify(bundle, null, 4)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `resource-admin-draft-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('草稿包已下载');
}

async function copyDraftBundle() {
    const text = JSON.stringify(buildDraftBundle(), null, 4);

    try {
        await navigator.clipboard.writeText(text);
        showToast('草稿 JSON 已复制');
    } catch (error) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
        showToast('草稿 JSON 已复制');
    }
}

function getDraftEntries() {
    return Object.keys(SOURCE_META).flatMap(source => {
        return getSourceItems(source)
            .filter(item => state.newIds[source].has(String(item.id)))
            .map(item => ({ source, item }));
    });
}

function getDraftEntry(source, id) {
    if (!state.newIds[source] || !state.newIds[source].has(String(id))) {
        return null;
    }

    const item = getSourceItems(source).find(entry => String(entry.id) === String(id));
    return item ? { source, item } : null;
}

function expandEntriesWithDependencies(entries) {
    const selected = new Map();
    entries.forEach(entry => {
        selected.set(`${entry.source}:${entry.item.id}`, entry);
    });

    entries.forEach(({ source, item }) => {
        if (source !== 'music' || !item.lyricId || !state.newIds.lyrics.has(String(item.lyricId))) {
            return;
        }

        const lyricEntry = getDraftEntry('lyrics', item.lyricId);
        if (lyricEntry) {
            selected.set(`lyrics:${lyricEntry.item.id}`, lyricEntry);
        }
    });

    return Object.keys(SOURCE_META).flatMap(source => {
        const ids = new Set([...selected.values()]
            .filter(entry => entry.source === source)
            .map(entry => String(entry.item.id)));
        return getSourceItems(source)
            .filter(item => ids.has(String(item.id)))
            .map(item => ({ source, item }));
    });
}

function buildSelectedIdMap(entries) {
    return entries.reduce((result, { source, item }) => {
        if (!result[source]) {
            result[source] = new Set();
        }
        result[source].add(String(item.id));
        return result;
    }, {});
}

function getSinglePublishAvailability(source, item) {
    if (!state.online) {
        return {
            canPublish: false,
            reason: '线上发布接口未连接，先配置发布环境或下载草稿包。'
        };
    }

    const entries = expandEntriesWithDependencies([{ source, item }]);
    const selectedBySource = buildSelectedIdMap(entries);

    for (const [entrySource, selectedIds] of Object.entries(selectedBySource)) {
        const drafts = getSourceItems(entrySource).filter(entry => state.newIds[entrySource].has(String(entry.id)));
        const maxSelectedIndex = drafts.reduce((max, draft, index) => {
            return selectedIds.has(String(draft.id)) ? Math.max(max, index) : max;
        }, -1);

        for (let index = 0; index <= maxSelectedIndex; index += 1) {
            if (!selectedIds.has(String(drafts[index].id))) {
                return {
                    canPublish: false,
                    reason: `请先发布上方更早创建的${SOURCE_META[entrySource].label}草稿，或使用一键发布全部。`
                };
            }
        }
    }

    const missingTextPath = entries
        .flatMap(entry => getTextFilePathsForItem(entry.source, entry.item))
        .find(path => state.textFiles[path] === undefined);

    if (missingTextPath) {
        return {
            canPublish: false,
            reason: `缺少生成的 Markdown 文件：${missingTextPath}`
        };
    }

    return { canPublish: true, reason: '' };
}

function getTextFilePathsForItem(source, item) {
    if (!item) return [];
    if (source === 'lyrics' && item.contentPath) {
        return [item.contentPath];
    }
    if (source === 'knowledge' && item.filename && !item.externalUrl) {
        return [`assets/data/knowledge/${item.filename}`];
    }
    return [];
}

function getRecommendationLabelsForItem(source, id) {
    return Object.values(getRecommendations().modules)
        .filter(moduleConfig => moduleConfig.source === source && moduleConfig.items.map(String).includes(String(id)))
        .map(moduleConfig => moduleConfig.label);
}

function setPublishBusy(isBusy) {
    [
        'publish-button',
        'quick-publish-button',
        'dashboard-publish-all-button',
        'pending-publish-all-button'
    ].forEach(id => {
        const button = document.getElementById(id);
        if (button) {
            button.disabled = isBusy;
        }
    });

    $$('[data-publish-draft]').forEach(button => {
        if (isBusy) {
            button.dataset.wasDisabled = button.disabled ? 'true' : 'false';
            button.disabled = true;
        } else if (button.dataset.wasDisabled !== undefined) {
            button.disabled = button.dataset.wasDisabled === 'true';
            delete button.dataset.wasDisabled;
        }
    });

    $$('[data-publish-all-shortcut]').forEach(button => {
        button.disabled = isBusy;
    });
}

function readTextFile(file) {
    return new Promise((resolve, reject) => {
        if (file.size > 200 * 1024) {
            reject(new Error('Markdown 文件不能超过 200KB'));
            return;
        }

        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsText(file, 'utf-8');
    });
}

function markdownToPlainText(markdown) {
    return String(markdown || '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/!\[[^\]]*]\([^)]+\)/g, '')
        .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s{0,3}>\s?/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        .replace(/[*_~]/g, '')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .join('\n');
}

function summarizeMarkdown(markdown) {
    const plainText = markdownToPlainText(markdown);
    const firstLine = plainText.split('\n').find(Boolean) || '同步上传的歌词内容';
    return firstLine.length > 90 ? `${firstLine.slice(0, 90)}...` : firstLine;
}

function getPublishProblems() {
    const problems = [];

    Object.keys(SOURCE_META).forEach(source => {
        const path = DATA_FILES[source];
        const base = state.baseFiles[path] || [];
        const current = state.files[path] || [];

        if (current.length < base.length) {
            problems.push(`${SOURCE_META[source].label}历史资源数量减少`);
            return;
        }

        for (let index = 0; index < base.length; index += 1) {
            if (stableStringify(base[index]) !== stableStringify(current[index])) {
                problems.push(`${SOURCE_META[source].label}第 ${index + 1} 个历史资源被修改或重排`);
                break;
            }
        }
    });

    getDraftEntries().forEach(({ source, item }) => {
        getTextFilePathsForItem(source, item).forEach(path => {
            if (state.textFiles[path] === undefined) {
                problems.push(`${item.title || item.id} 缺少生成的 Markdown 文件：${path}`);
            }
        });
    });

    Object.entries(getRecommendations().modules).forEach(([moduleKey, moduleConfig]) => {
        const ids = new Set(getSourceItems(moduleConfig.source).map(item => String(item.id)));
        moduleConfig.items.forEach(id => {
            if (!ids.has(String(id))) {
                problems.push(`${moduleConfig.label} 引用了不存在的资源：${id}`);
            }
        });
        if (moduleConfig.limit && moduleConfig.items.length > moduleConfig.limit) {
            problems.push(`${moduleConfig.label} 超过推荐上限`);
        }
    });

    return problems;
}

function hasChanges() {
    return Object.values(DATA_FILES).some(path => hasFileChanged(path)) || Object.keys(state.textFiles).length > 0;
}

function hasFileChanged(path) {
    return stableStringify(state.baseFiles[path]) !== stableStringify(state.files[path]);
}

function getRecommendations() {
    return state.files[DATA_FILES.recommendations];
}

function getSourceItems(source) {
    return state.files[DATA_FILES[source]] || [];
}

function getItemImage(source, item) {
    if (!item) return '';
    if (source === 'photos') return item.src || '';
    if (source === 'lyrics' || source === 'music') return item.cover || '';
    return '';
}

function getItemMeta(source, item) {
    if (!item) return '';
    if (source === 'photos') return `${item.id} · ${item.date || item.category || 'Photography'}`;
    if (source === 'lyrics') return `${item.id} · ${item.author || 'Dean Huo'} · ${item.releaseYear || item.date || ''}`;
    if (source === 'music') return `${item.id} · ${item.artist || 'Dean Huo'} · ${item.genre || 'Original'}`;
    if (source === 'knowledge') return `${item.id} · ${(item.tags || []).join(' / ') || item.date || 'Knowledge'}`;
    return item.id || '';
}

function filterItems(items, query) {
    if (!query) return items;
    return items.filter(item => {
        const haystack = [
            item.id,
            item.title,
            item.description,
            item.summary,
            item.author,
            item.artist,
            item.genre,
            Array.isArray(item.tags) ? item.tags.join(' ') : ''
        ].join(' ').toLowerCase();
        return haystack.includes(query);
    });
}

function makeUniqueId(prefix, title, source) {
    const base = slugify(title) || `${prefix}-${Date.now().toString(36)}`;
    const existing = new Set(getSourceItems(source).map(item => String(item.id)));
    let candidate = base;
    let index = 2;

    while (existing.has(candidate)) {
        candidate = `${base}-${index}`;
        index += 1;
    }

    return candidate;
}

function slugify(value) {
    return String(value || '')
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
}

function splitTags(value) {
    return String(value || '')
        .split(/[,，、]/)
        .map(tag => tag.trim())
        .filter(Boolean);
}

function getNextNumber(source, key) {
    return getSourceItems(source).reduce((max, item) => Math.max(max, Number(item[key]) || 0), 0) + 1;
}

function getNextHomeOrder(source) {
    return getSourceItems(source)
        .filter(item => item.showOnHome)
        .reduce((max, item) => Math.max(max, Number(item.homeOrder) || 0), 0) + 1;
}

function suggestAssetPath(uploadType, filename) {
    const directory = UPLOAD_DIRS[uploadType] || 'assets/admin-uploads';
    const ext = getExtension(filename);
    const name = slugify(filename.replace(/\.[^.]+$/, '')) || 'asset';
    return `${directory}/${Date.now()}-${name}${ext}`;
}

function getExtension(filename) {
    const match = String(filename || '').match(/\.[a-zA-Z0-9]+$/);
    return match ? match[0].toLowerCase() : '';
}

function resolveAssetUrl(path) {
    if (!path) return '';
    if (/^(https?:|data:|blob:|\/)/.test(path)) return path;
    return `../${path}`;
}

function setPanel(panelId) {
    state.activePanel = panelId;
    $$('.panel').forEach(panel => panel.classList.toggle('is-active', panel.id === panelId));
    $$('.side-link').forEach(button => button.classList.toggle('is-active', button.dataset.panel === panelId));

    const titleMap = {
        'dashboard-panel': '总览',
        'resources-panel': '新增资源',
        'pending-panel': '待发布资源',
        'recommendations-panel': '推荐配置',
        'publish-panel': '发布检查'
    };

    $('#panel-title').textContent = titleMap[panelId] || '资源配置后台';
    renderIcons();
}

function updateModePill() {
    setMode(state.online ? '线上发布模式' : '草稿导出模式', state.online);
    renderPublishChecks();
}

function setMode(text, isOnline) {
    const pill = $('#mode-pill');
    pill.textContent = text;
    pill.classList.toggle('is-online', Boolean(isOnline));
}

function setPublishOutput(text) {
    $('#publish-output').textContent = text;
}

function setLoginError(message) {
    const error = $('#login-error');
    error.textContent = message || '';
    error.classList.toggle('is-visible', Boolean(message));
}

function setLoginBusy(isBusy) {
    $('#login-button').disabled = isBusy;
    $('#admin-token-input').disabled = isBusy;
}

function setDefaultFormValues() {
    const now = new Date();
    const inputDate = formatInputDate(now);
    const year = String(now.getFullYear());
    const monthYear = formatMonthYear(now);

    $('#photo-form').elements.date.value = monthYear;
    $('#lyric-form').elements.date.value = inputDate;
    $('#lyric-form').elements.releaseYear.value = year;
    $('#music-form').elements.year.value = year;
    $('#knowledge-form').elements.date.value = inputDate;
}

function formatInputDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatMonthYear(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function renderIcons() {
    if (window.lucide) {
        lucide.createIcons();
    }
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function stableStringify(value) {
    if (Array.isArray(value)) {
        return '[' + value.map(stableStringify).join(',') + ']';
    }
    if (value && typeof value === 'object') {
        return '{' + Object.keys(value).sort().map(key => {
            return JSON.stringify(key) + ':' + stableStringify(value[key]);
        }).join(',') + '}';
    }
    return JSON.stringify(value);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
    return escapeHtml(value);
}
