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
const ONLINE_UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;

const UPLOAD_LABELS = {
    photos: '图片文件',
    lyricsCover: '词作封面',
    lyricAudio: '词作音频',
    musicCover: '音乐封面',
    musicAudio: '音乐音频'
};

const RESOURCE_EDIT_SCHEMAS = {
    photos: [
        { key: 'title', label: '标题', required: true },
        { key: 'description', label: '描述', type: 'textarea' },
        { key: 'src', label: '图片路径/URL', empty: 'delete' },
        { key: 'category', label: '分类' },
        { key: 'date', label: '日期' },
        { key: 'showOnHome', label: '首页显示标记', type: 'checkbox' }
    ],
    lyrics: [
        { key: 'title', label: '标题', required: true },
        { key: 'author', label: '作者' },
        { key: 'date', label: '日期' },
        { key: 'releaseYear', label: '发行年份' },
        { key: 'cover', label: '封面路径/URL', empty: 'delete' },
        { key: 'summary', label: '摘要', type: 'textarea' },
        { key: 'audioPath', label: '音频路径/URL', empty: 'delete' },
        { key: 'linkedMusicId', label: '关联音乐 ID', empty: 'delete' },
        { key: 'contentPath', label: '正文 Markdown 路径', empty: 'delete' },
        { key: 'order', label: '词作排序', type: 'number', empty: 'delete' },
        { key: 'showOnHome', label: '首页显示标记', type: 'checkbox' },
        { key: 'homeOrder', label: '首页排序', type: 'number', empty: 'delete' }
    ],
    music: [
        { key: 'title', label: '标题', required: true },
        { key: 'artist', label: '艺术家' },
        { key: 'year', label: '年份' },
        { key: 'genre', label: '曲风' },
        { key: 'cover', label: '封面路径/URL', empty: 'delete' },
        { key: 'url', label: '音频路径/URL', empty: 'delete' },
        { key: 'description', label: '描述', type: 'textarea' },
        { key: 'lyricId', label: '关联词作 ID', empty: 'delete' }
    ],
    knowledge: [
        { key: 'title', label: '标题', required: true },
        { key: 'description', label: '摘要', type: 'textarea' },
        { key: 'date', label: '日期' },
        { key: 'tags', label: '标签', type: 'tags' },
        { key: 'externalUrl', label: '外部链接', empty: 'delete' },
        { key: 'filename', label: '正文 Markdown 文件', empty: 'delete' }
    ]
};

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
    activeLibrary: 'all',
    activeResourceList: 'all',
    activeTrashList: 'all',
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

    $('#toggle-password-button').addEventListener('click', togglePasswordVisibility);

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
            setLoginError(buildAuthErrorMessage(apiError));
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
    const response = await fetch(buildAdminApiUrl('/api/admin/content'), {
        headers: getAuthHeaders(),
        cache: 'no-store'
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const error = new Error(data.error || '线上接口不可用');
        error.status = response.status;
        error.code = data.code || '';
        error.details = data.details || {};
        throw error;
    }

    return data.files || {};
}

function getAuthHeaders() {
    const headers = {
        'x-admin-token-encoded': encodeURIComponent(state.token)
    };

    if (isAsciiHeaderValue(state.token)) {
        headers['x-admin-token'] = state.token;
        headers.Authorization = `Bearer ${state.token}`;
    }

    return headers;
}

function buildAdminApiUrl(path) {
    const url = new URL(path, window.location.origin);
    url.searchParams.set('admin_token', state.token);
    url.searchParams.set('auth_v', '3');
    return `${url.pathname}${url.search}`;
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
    const unquoted = pair && trimmed.length >= 2 ? trimmed.slice(1, -1).trim() : trimmed;
    return unquoted.normalize('NFC');
}

function buildAuthErrorMessage(error) {
    const details = error && error.details ? error.details : {};
    if (!error || error.code !== 'ADMIN_TOKEN_MISMATCH') {
        return '服务端返回了旧格式的 401。请等待 Vercel Production 部署完成后，用 /admin/?v=auth3 重新打开。';
    }
    const receivedText = details.tokenReceived
        ? '服务端已经收到你输入的密码，但它和 Vercel Production 里的 ADMIN_TOKEN 不一致。'
        : '服务端没有收到有效密码。';
    return `${receivedText} 可以点眼睛按钮核对输入；如果确认是 123456，请检查 Vercel 的 Production 环境变量并重新部署。`;
}

function isAsciiHeaderValue(value) {
    return /^[\x20-\x7e]*$/.test(String(value || ''));
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
    $('#resource-library').addEventListener('click', handleResourceCardClick);
    $('#resource-list-source-select').addEventListener('change', event => {
        state.activeResourceList = event.target.value;
        renderResourceList();
    });
    $('#resource-list-search').addEventListener('input', renderResourceList);
    $('#resource-list').addEventListener('click', handleResourceCardClick);
    $('#trash-source-select').addEventListener('change', event => {
        state.activeTrashList = event.target.value;
        renderTrashList();
    });
    $('#trash-search').addEventListener('input', renderTrashList);
    $('#trash-list').addEventListener('click', handleTrashListClick);
    $('#lyric-music-audio-select').addEventListener('change', event => {
        const music = getVisibleSourceItems('music').find(item => String(item.id) === String(event.target.value));
        if (music) {
            setFormMessage($('#lyric-form'), `已选择音乐音频：${music.title || music.id}`, 'info');
        }
    });

    $('#photo-form').addEventListener('submit', handlePhotoSubmit);
    $('#lyric-form').addEventListener('submit', handleLyricSubmit);
    $('#music-form').addEventListener('submit', handleMusicSubmit);
    $('#knowledge-form').addEventListener('submit', handleKnowledgeSubmit);
    $('#resource-editor-form').addEventListener('submit', handleResourceEditorSubmit);
    $('#resource-editor-close-button').addEventListener('click', closeResourceEditor);
    $('#resource-editor-cancel-button').addEventListener('click', closeResourceEditor);
    $('#resource-editor-delete-button').addEventListener('click', handleResourceEditorDelete);
    $('#resource-editor-restore-button').addEventListener('click', handleResourceEditorRestore);
    $('#resource-editor-modal').addEventListener('click', event => {
        if (event.target.id === 'resource-editor-modal') {
            closeResourceEditor();
        }
    });
    $('#resource-viewer-close-button').addEventListener('click', closeResourceViewer);
    $('#resource-viewer-modal').addEventListener('click', event => {
        if (event.target.id === 'resource-viewer-modal') {
            closeResourceViewer();
        }
    });
    $('#resource-viewer-edit-button').addEventListener('click', () => {
        const button = $('#resource-viewer-edit-button');
        closeResourceViewer();
        openResourceEditor(button.dataset.source, button.dataset.resourceId);
    });
    $('#resource-viewer-restore-button').addEventListener('click', () => {
        const button = $('#resource-viewer-restore-button');
        restoreResource(button.dataset.source, button.dataset.resourceId);
    });
    bindUploadInputFeedback();

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
        removeDraftItem(button.dataset.source, button.dataset.removeDraft);
    });

    $('#pending-list').addEventListener('click', event => {
        const publishButton = event.target.closest('[data-publish-draft]');
        const removeButton = event.target.closest('[data-remove-draft]');

        if (publishButton) {
            publishSingleDraft(publishButton.dataset.source, publishButton.dataset.publishDraft);
            return;
        }

        if (removeButton) {
            removeDraftItem(removeButton.dataset.source, removeButton.dataset.removeDraft);
        }
    });
}

async function handlePhotoSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = form.elements.file.files[0];
    if (!file) return showFormError(form, '请选择图片文件');

    await runFormTask(form, async progress => {
        progress.set(8, '正在检查图片文件');
        const title = form.elements.title.value.trim();
        const id = makeUniqueId('img', title || file.name, 'photos');
        state.previewUrls[id] = URL.createObjectURL(file);
        const uploaded = await uploadFiles([
            { key: 'src', file, uploadType: 'photos', label: '图片文件' }
        ], progress, 16, 82);

        progress.set(90, '正在生成图片草稿');
        appendResource('photos', {
            id,
            title: title || id,
            description: form.elements.description.value.trim(),
            src: uploaded.src,
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
        return '图片资源创建成功，已进入待发布列表。';
    });
}

async function handleLyricSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const coverFile = form.elements.coverFile.files[0];
    const audioFile = form.elements.audioFile.files[0];
    const selectedMusicId = form.elements.musicAudioId.value;
    const selectedMusicAudioPath = getMusicAudioPath(selectedMusicId);
    const audioUrl = normalizeAssetInput(form.elements.audioUrl.value);
    if (!coverFile) return showFormError(form, '请选择封面图片');

    await runFormTask(form, async progress => {
        progress.set(8, '正在读取词作内容');
        validateUploads([
            { file: coverFile, uploadType: 'lyricsCover' },
            ...(audioFile && !audioUrl && !selectedMusicAudioPath ? [{ file: audioFile, uploadType: 'lyricAudio' }] : [])
        ]);

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
        const uploaded = await uploadFiles([
            { key: 'cover', file: coverFile, uploadType: 'lyricsCover', label: '词作封面' },
            ...(audioFile && !audioUrl && !selectedMusicAudioPath ? [{ key: 'audioPath', file: audioFile, uploadType: 'lyricAudio', label: '词作音频' }] : [])
        ], progress, 24, 78);
        const cover = uploaded.cover;
        const audioPath = selectedMusicAudioPath || audioUrl || uploaded.audioPath || '';
        const contentPath = `assets/lyrics/admin-generated/${id}.md`;
        const showOnHome = form.elements.showOnHome.checked;

        progress.set(88, '正在生成词作草稿');
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
            releaseYear: form.elements.releaseYear.value.trim() || String(new Date().getFullYear()),
            ...(selectedMusicId ? { linkedMusicId: selectedMusicId } : {})
        });

        if (showOnHome) {
            addRecommendation('homeLyrics', id);
        }

        form.reset();
        setDefaultFormValues();
        return '词作资源创建成功，已进入待发布列表。';
    });
}

async function handleMusicSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const coverFile = form.elements.coverFile.files[0];
    const audioFile = form.elements.audioFile.files[0];
    const audioUrl = normalizeAssetInput(form.elements.audioUrl.value);
    if (!coverFile) return showFormError(form, '请选择封面图片');
    if (!audioFile && !audioUrl) return showFormError(form, '请选择音频文件，或填写音频外链/已上传路径');

    await runFormTask(form, async progress => {
        progress.set(8, '正在读取音乐信息');
        validateUploads([
            { file: coverFile, uploadType: 'musicCover' },
            ...(audioFile && !audioUrl ? [{ file: audioFile, uploadType: 'musicAudio' }] : [])
        ]);

        const title = form.elements.title.value.trim();
        const id = makeUniqueId('music', title, 'music');
        const lyricMarkdownFile = form.elements.lyricMarkdownFile.files[0];
        const lyricMarkdown = lyricMarkdownFile ? (await readTextFile(lyricMarkdownFile)).trim() : '';
        const shouldSyncLyric = Boolean(lyricMarkdown && form.elements.syncLyric.checked);
        state.previewUrls[id] = URL.createObjectURL(coverFile);
        const uploaded = await uploadFiles([
            { key: 'cover', file: coverFile, uploadType: 'musicCover', label: '音乐封面' },
            ...(audioFile && !audioUrl ? [{ key: 'url', file: audioFile, uploadType: 'musicAudio', label: '音乐音频' }] : [])
        ], progress, 22, 78);
        const cover = uploaded.cover;
        const url = audioUrl || uploaded.url;
        let lyricId = form.elements.lyricId.value;

        progress.set(86, shouldSyncLyric ? '正在生成音乐和关联词作草稿' : '正在生成音乐草稿');
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
        return shouldSyncLyric
            ? '音乐和关联词作创建成功，已进入待发布列表。'
            : '音乐资源创建成功，已进入待发布列表。';
    });
}

async function handleKnowledgeSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;

    await runFormTask(form, async progress => {
        progress.set(20, '正在检查知识内容');
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

        progress.set(68, '正在生成知识草稿');
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
        return '知识资源创建成功，已进入待发布列表。';
    });
}

async function runFormTask(form, task) {
    const submitButton = form.querySelector('button[type="submit"]');
    const originalButtonHtml = submitButton.innerHTML;
    const progress = createFormProgress(form);
    submitButton.disabled = true;
    submitButton.innerHTML = '<i data-lucide="loader-circle"></i> 正在处理';
    progress.set(3, '正在准备创建资源');
    setFormMessage(form, '正在检查并上传素材，请稍候...', 'info');
    renderIcons();

    try {
        const result = await task(progress);
        const message = typeof result === 'string' && result ? result : '资源创建成功，已进入待发布列表。';
        progress.set(100, '创建成功，正在进入待发布列表', 'success');
        setFormMessage(form, message, 'success');
        showToast(message);
        renderAll();
        setPanel('pending-panel');
    } catch (error) {
        const message = error.message || '操作失败';
        progress.set(100, '创建失败', 'error');
        setFormMessage(form, message, 'error');
        showToast(message);
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = originalButtonHtml;
        renderIcons();
    }
}

async function uploadFiles(uploadItems, progress, startPercent = 12, endPercent = 82) {
    const items = uploadItems.filter(item => item.file);
    validateUploads(items);

    if (items.length === 0) {
        progress.set(endPercent, '无需上传素材');
        return {};
    }

    const results = {};
    const span = (endPercent - startPercent) / items.length;

    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const label = item.label || UPLOAD_LABELS[item.uploadType] || '素材';
        const itemStart = startPercent + span * index;
        const itemEnd = startPercent + span * (index + 1);

        progress.set(itemStart, `准备上传${label}`);
        results[item.key] = await uploadAsset(item.file, item.uploadType, ratio => {
            const safeRatio = Math.max(0, Math.min(Number(ratio) || 0, 1));
            const percent = Math.round(safeRatio * 100);
            progress.set(itemStart + (itemEnd - itemStart) * safeRatio, `正在上传${label}（${percent}%）`);
        });
        progress.set(itemEnd, `${label}上传完成`);
    }

    return results;
}

async function uploadAsset(file, uploadType, onProgress) {
    const uploadProblem = getUploadFileProblem(file, uploadType);
    if (uploadProblem) {
        throw new Error(uploadProblem);
    }

    if (!state.online) {
        const path = suggestAssetPath(uploadType, file.name);
        state.pendingAssets.push({
            path,
            name: file.name,
            size: file.size,
            type: file.type
        });
        if (onProgress) onProgress(1);
        return path;
    }

    const formData = new FormData();
    formData.append('uploadType', uploadType);
    formData.append('file', file);

    if (onProgress && window.XMLHttpRequest) {
        return uploadAssetWithProgress(file, uploadType, formData, onProgress);
    }

    const response = await fetch(buildAdminApiUrl('/api/admin/upload'), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(buildUploadErrorMessage(response, data, file, uploadType));
    }

    return data.path;
}

function uploadAssetWithProgress(file, uploadType, formData, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', buildAdminApiUrl('/api/admin/upload'), true);

        Object.entries(getAuthHeaders()).forEach(([name, value]) => {
            xhr.setRequestHeader(name, value);
        });

        xhr.upload.addEventListener('progress', event => {
            if (event.lengthComputable && event.total > 0) {
                onProgress(Math.min(event.loaded / event.total, 0.98));
            } else {
                onProgress(0.5);
            }
        });

        xhr.addEventListener('load', () => {
            const data = parseJsonSafely(xhr.responseText);
            if (xhr.status < 200 || xhr.status >= 300) {
                reject(new Error(buildUploadErrorMessage({ status: xhr.status }, data, file, uploadType)));
                return;
            }

            if (!data.path) {
                reject(new Error(data.error || '上传成功但没有返回文件路径'));
                return;
            }

            onProgress(1);
            resolve(data.path);
        });

        xhr.addEventListener('error', () => {
            reject(new Error('上传失败，请检查网络后重试'));
        });

        xhr.addEventListener('abort', () => {
            reject(new Error('上传已取消'));
        });

        xhr.send(formData);
    });
}

function parseJsonSafely(text) {
    try {
        return JSON.parse(text || '{}');
    } catch (error) {
        return {};
    }
}

function bindUploadInputFeedback() {
    [
        { formId: 'photo-form', field: 'file', uploadType: 'photos' },
        { formId: 'lyric-form', field: 'coverFile', uploadType: 'lyricsCover' },
        { formId: 'lyric-form', field: 'audioFile', uploadType: 'lyricAudio' },
        { formId: 'music-form', field: 'coverFile', uploadType: 'musicCover' },
        { formId: 'music-form', field: 'audioFile', uploadType: 'musicAudio' }
    ].forEach(({ formId, field, uploadType }) => {
        const form = document.getElementById(formId);
        if (!form || !form.elements[field]) return;

        form.elements[field].addEventListener('change', event => {
            const file = event.target.files[0];
            if (!file) {
                setFormMessage(form, '');
                return;
            }

            const problem = getUploadFileProblem(file, uploadType);
            if (problem) {
                setFormMessage(form, problem, 'error');
                return;
            }

            if (isAudioUpload(uploadType)) {
                setFormMessage(form, `${UPLOAD_LABELS[uploadType]}已选择：${file.name}（${formatFileSize(file.size)}）`, 'info');
            } else {
                setFormMessage(form, '');
            }
        });
    });
}

function validateUploads(items) {
    items.forEach(({ file, uploadType }) => {
        const problem = getUploadFileProblem(file, uploadType);
        if (problem) {
            throw new Error(problem);
        }
    });
}

function getUploadFileProblem(file, uploadType) {
    if (!file || !state.online || file.size <= ONLINE_UPLOAD_LIMIT_BYTES) {
        return '';
    }

    const label = UPLOAD_LABELS[uploadType] || '上传文件';
    const nextStep = isAudioUpload(uploadType)
        ? '请先压缩成更小的 mp3/m4a，或填写音频外链/已上传路径后再创建。'
        : '请先压缩后再上传。';

    return `${label}「${file.name}」大小为 ${formatFileSize(file.size)}，超过线上上传安全上限 ${formatFileSize(ONLINE_UPLOAD_LIMIT_BYTES)}。${nextStep}`;
}

function buildUploadErrorMessage(response, data, file, uploadType) {
    if (response.status === 413) {
        const label = UPLOAD_LABELS[uploadType] || '上传文件';
        return `${label}「${file.name}」上传被线上服务拒绝，文件大小 ${formatFileSize(file.size)}。请压缩到 ${formatFileSize(ONLINE_UPLOAD_LIMIT_BYTES)} 以内，或改用外链/云存储方案。`;
    }

    return data.error || `上传失败（HTTP ${response.status}）`;
}

function isAudioUpload(uploadType) {
    return uploadType === 'musicAudio' || uploadType === 'lyricAudio';
}

function formatFileSize(bytes) {
    const size = Number(bytes) || 0;
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function appendResource(source, item) {
    state.files[DATA_FILES[source]].push(item);
    state.newIds[source].add(String(item.id));
}

function removeDraftItem(source, id) {
    const entry = getDraftEntry(source, id);
    if (!entry) {
        showToast('这条资源没有待发布修改');
        return;
    }

    const filePath = DATA_FILES[source];
    const item = state.files[filePath].find(entry => String(entry.id) === String(id));
    if (entry.kind === 'new') {
        state.files[filePath] = state.files[filePath].filter(entry => String(entry.id) !== String(id));
        state.newIds[source].delete(String(id));
    } else {
        const baseItem = getBaseResourceItem(source, id);
        const index = state.files[filePath].findIndex(entry => String(entry.id) === String(id));
        if (baseItem && index !== -1) {
            state.files[filePath][index] = clone(baseItem);
        }
    }

    if (entry.kind === 'delete') {
        restoreBaseRecommendationReferences(source, id);
    }

    if (entry.kind === 'new' && item && item.contentPath) {
        delete state.textFiles[item.contentPath];
    }
    if (entry.kind === 'new' && item && item.filename) {
        delete state.textFiles[`assets/data/knowledge/${item.filename}`];
    }

    if (entry.kind === 'new') {
        Object.values(getRecommendations().modules).forEach(moduleConfig => {
            moduleConfig.items = moduleConfig.items.filter(itemId => String(itemId) !== String(id));
        });
    }

    renderAll();
    showToast(entry.kind === 'new' ? '已从待发布列表移除' : `已撤销${getDraftKindLabel(entry.kind)}`);
}

function softDeleteResource(source, id) {
    const filePath = DATA_FILES[source];
    const index = getSourceItems(source).findIndex(item => String(item.id) === String(id));
    const item = index !== -1 ? state.files[filePath][index] : null;

    if (!item) {
        showToast('没有找到这条资源');
        return;
    }

    if (isResourceDeleted(item)) {
        showToast('这条资源已经在回收站');
        return;
    }

    const title = item.title || item.id;
    const confirmed = window.confirm(`确认把「${title}」移入回收站吗？\n\n这会做软删除：资源仍保留在 JSON 里，发布后前台会隐藏它。`);
    if (!confirmed) return;

    if (!confirmAdminAccessToken('请输入 ADMIN_TOKEN 确认删除')) {
        return;
    }

    if (state.newIds[source].has(String(id))) {
        removeNewDraftResource(source, id);
        closeResourceEditor();
        closeResourceViewer();
        renderAll();
        setPanel('pending-panel');
        showToast('本次新增资源尚未发布，已从待发布列表移除');
        return;
    }

    state.files[filePath][index] = {
        ...clone(item),
        deletedAt: new Date().toISOString(),
        deletedBy: 'admin',
        deletedReason: '后台软删除'
    };

    removeResourceFromRecommendations(source, id);
    closeResourceEditor();
    closeResourceViewer();
    renderAll();
    setPanel('trash-panel');
    showToast('已移入回收站，发布后前台会隐藏这条资源');
}

function restoreResource(source, id) {
    const filePath = DATA_FILES[source];
    const index = getSourceItems(source).findIndex(item => String(item.id) === String(id));
    const item = index !== -1 ? state.files[filePath][index] : null;

    if (!item) {
        showToast('没有找到这条资源');
        return;
    }

    if (!isResourceDeleted(item)) {
        showToast('这条资源不在回收站');
        return;
    }

    const title = item.title || item.id;
    if (!window.confirm(`确认恢复「${title}」到资源列表吗？\n\n恢复后需要发布才会同步到线上。`)) {
        return;
    }

    const restored = clone(item);
    delete restored.deletedAt;
    delete restored.deletedBy;
    delete restored.deletedReason;
    state.files[filePath][index] = restored;

    const baseItem = getBaseResourceItem(source, id);
    if (baseItem && !isResourceDeleted(baseItem)) {
        restoreBaseRecommendationReferences(source, id);
    }

    closeResourceEditor();
    closeResourceViewer();
    renderAll();
    setPanel('pending-panel');
    showToast('已恢复到资源列表，记得发布这条恢复改动');
}

function removeNewDraftResource(source, id) {
    const filePath = DATA_FILES[source];
    const item = getSourceItems(source).find(entry => String(entry.id) === String(id));
    state.files[filePath] = state.files[filePath].filter(entry => String(entry.id) !== String(id));
    state.newIds[source].delete(String(id));

    if (item && item.contentPath) {
        delete state.textFiles[item.contentPath];
    }
    if (item && item.filename) {
        delete state.textFiles[`assets/data/knowledge/${item.filename}`];
    }

    removeResourceFromRecommendations(source, id);
}

function removeResourceFromRecommendations(source, id) {
    Object.values(getRecommendations().modules).forEach(moduleConfig => {
        if (moduleConfig.source !== source) return;
        moduleConfig.items = moduleConfig.items.filter(itemId => String(itemId) !== String(id));
    });
}

function restoreBaseRecommendationReferences(source, id) {
    const currentModules = getRecommendations().modules;
    const baseModules = (state.baseFiles[DATA_FILES.recommendations] || {}).modules || {};

    Object.entries(baseModules).forEach(([moduleKey, baseModule]) => {
        const currentModule = currentModules[moduleKey];
        if (!currentModule || currentModule.source !== source || !Array.isArray(baseModule.items)) return;
        const baseIndex = baseModule.items.map(String).indexOf(String(id));
        if (baseIndex === -1 || currentModule.items.map(String).includes(String(id))) return;

        const nextItems = currentModule.items.slice();
        nextItems.splice(Math.min(baseIndex, nextItems.length), 0, String(id));
        currentModule.items = nextItems;
    });
}

function confirmAdminAccessToken(message) {
    const input = window.prompt(`${message}\n资源不会真正删除，只会进入回收站。`);
    if (input === null) return false;

    if (normalizeAdminToken(input) !== state.token) {
        showToast('ADMIN_TOKEN 校验失败，删除已取消');
        return false;
    }

    return true;
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
    renderResourceList();
    renderTrashList();
    renderRecommendationModuleSelect();
    renderRecommendationPanel();
    renderRelationSelects();
    renderPublishChecks();
    renderIcons();
}

function renderStats() {
    const stats = Object.entries(SOURCE_META).map(([source, meta]) => {
        const total = getVisibleSourceItems(source).length;
        const deleted = getTrashSourceItems(source).length;
        const entries = getDraftEntries().filter(entry => entry.source === source);
        const summary = summarizeDraftEntries(entries);
        const detail = [deleted > 0 ? `回收站 ${deleted}` : '', summary].filter(Boolean).join('，');
        return `
            <div class="stat-card">
                <span>${escapeHtml(meta.label)}</span>
                <strong>${total}</strong>
                <p>${detail || '无待发布改动'}</p>
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
    const entrySummary = summarizeDraftEntries(entries);

    $('#draft-summary').textContent = totalChanges === 0
        ? '暂无新增内容。'
        : `${entrySummary || '资源改动 0 个'}，生成 Markdown ${textCount} 个，待处理附件 ${assetCount} 个${recChanged ? '，推荐配置已调整' : ''}。`;

    if (entries.length === 0 && !recChanged && textCount === 0) {
        $('#draft-list').innerHTML = '<div class="draft-item"><span>还没有草稿内容</span><span>安全</span></div>';
        return;
    }

    const rows = entries.map(({ source, item, kind }) => `
        <div class="draft-item">
            <div>
                <strong>${escapeHtml(item.title || item.id)}</strong>
                <div>${escapeHtml(SOURCE_META[source].label)} · ${escapeHtml(item.id)} · ${getDraftKindLabel(kind)}</div>
            </div>
            <button class="ghost-action" data-remove-draft="${escapeAttribute(item.id)}" data-source="${source}">
                <i data-lucide="${getDraftUndoIcon(kind)}"></i>
                ${getDraftUndoLabel(kind)}
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
    const entrySummary = summarizeDraftEntries(entries);
    const modeText = state.online
        ? '已连接线上发布接口，可以直接提交到 GitHub。'
        : `未连接线上发布接口${state.apiError ? `：${state.apiError}` : ''}。当前只能下载草稿包。`;

    $('#pending-status').textContent = totalChanges === 0
        ? `${modeText} 暂无待发布资源。`
        : `${modeText} ${entrySummary || '资源改动 0 个'}，生成 Markdown ${textCount} 个，待处理附件 ${assetCount} 个${recChanged ? '，推荐配置已调整' : ''}。`;

    if (entries.length === 0 && !recChanged) {
        $('#pending-list').innerHTML = `
            <div class="pending-empty">
                <i data-lucide="check-circle"></i>
                <strong>没有待发布资源</strong>
                <span>新增或编辑图片、词作、音乐、知识内容后，会立刻出现在这里。</span>
            </div>
        `;
        return;
    }

    const cards = entries.map(({ source, item, kind }) => {
        const availability = getSinglePublishAvailability(source, item);
        const textFiles = kind === 'new' ? getTextFilePathsForItem(source, item) : [];
        const recommendationLabels = getRecommendationLabelsForItem(source, item.id);
        const badges = [
            `<span>${escapeHtml(SOURCE_META[source].label)}</span>`,
            `<span>${getDraftKindLabel(kind)}</span>`,
            ...textFiles.map(() => '<span>Markdown</span>'),
            ...recommendationLabels.map(label => `<span>${escapeHtml(label)}</span>`)
        ].join('');

        return `
            <article class="pending-card ${kind === 'delete' ? 'is-delete-draft' : ''}">
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
                        <i data-lucide="${getDraftUndoIcon(kind)}"></i>
                        ${getDraftUndoLabel(kind)}
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
    const entries = source === 'all'
        ? Object.keys(SOURCE_META).flatMap(itemSource => filterItems(getVisibleSourceItems(itemSource), query)
            .map(item => ({ source: itemSource, item })))
        : filterItems(getVisibleSourceItems(source), query).map(item => ({ source, item }));

    $('#resource-library').innerHTML = entries.map(({ source: itemSource, item }) => renderResourceCard(itemSource, item)).join('')
        || '<div class="draft-item"><span>没有匹配资源</span></div>';
}

function renderResourceList() {
    const source = state.activeResourceList;
    const query = $('#resource-list-search').value.trim().toLowerCase();
    const entries = source === 'all'
        ? Object.keys(SOURCE_META).flatMap(itemSource => filterItems(getVisibleSourceItems(itemSource), query)
            .map(item => ({ source: itemSource, item })))
        : filterItems(getVisibleSourceItems(source), query).map(item => ({ source, item }));

    const summary = entries.length > 0
        ? `<div class="resource-list-summary">共 ${entries.length} 条可见资源，点击卡片查看详情。</div>`
        : '';

    $('#resource-list').innerHTML = summary + (entries.map(({ source: itemSource, item }) => renderResourceCard(itemSource, item, true)).join('')
        || '<div class="pending-empty"><i data-lucide="search-x"></i><strong>没有匹配资源</strong><span>换一个关键词或模块再试。</span></div>');
}

function renderTrashList() {
    const source = state.activeTrashList;
    const query = $('#trash-search').value.trim().toLowerCase();
    const entries = source === 'all'
        ? Object.keys(SOURCE_META).flatMap(itemSource => filterItems(getTrashSourceItems(itemSource), query)
            .map(item => ({ source: itemSource, item })))
        : filterItems(getTrashSourceItems(source), query).map(item => ({ source, item }));

    const summary = entries.length > 0
        ? `<div class="resource-list-summary">共 ${entries.length} 条回收站资源，恢复或继续编辑后需要发布才会生效。</div>`
        : '';

    $('#trash-list').innerHTML = summary + (entries.map(({ source: itemSource, item }) => renderResourceCard(itemSource, item, true)).join('')
        || '<div class="pending-empty"><i data-lucide="archive-x"></i><strong>回收站为空</strong><span>在资源编辑里软删除后，会出现在这里。</span></div>');
}

function renderResourceCard(source, item, isLarge = false) {
    const image = getItemImage(source, item);
    const kind = getResourceChangeKind(source, item);
    const isDeleted = isResourceDeleted(item);
    const media = image
        ? `<img class="resource-thumb" src="${escapeAttribute(resolveAssetUrl(state.previewUrls[item.id] || image))}" alt="${escapeAttribute(item.title || item.id)}">`
        : `<div class="resource-icon"><i data-lucide="${SOURCE_META[source].icon}"></i></div>`;
    const badgeText = kind ? getDraftKindLabel(kind) : isDeleted ? '回收站' : '可编辑';
    const detailText = isLarge ? `<div class="resource-card-extra">${escapeHtml(getResourcePreviewText(source, item))}</div>` : '';

    return `
        <article class="resource-card ${isLarge ? 'resource-card-large' : ''} ${isDeleted ? 'is-deleted' : ''}" data-view-resource="${escapeAttribute(item.id)}" data-source="${source}">
            ${media}
            <div>
                <h4>${escapeHtml(item.title || item.id)}</h4>
                <p>${escapeHtml(getItemMeta(source, item))}</p>
                ${detailText}
            </div>
            <div class="resource-card-actions">
                <span class="resource-badge ${getDraftKindClass(kind, isDeleted)}">${badgeText}</span>
                ${isDeleted ? `
                    <button class="icon-action" type="button" title="恢复" data-restore-resource="${escapeAttribute(item.id)}" data-source="${source}">
                        <i data-lucide="rotate-ccw"></i>
                    </button>
                ` : ''}
                <button class="icon-action" type="button" title="查看" data-view-button="${escapeAttribute(item.id)}" data-source="${source}">
                    <i data-lucide="eye"></i>
                </button>
                <button class="icon-action" type="button" title="编辑" data-edit-resource="${escapeAttribute(item.id)}" data-source="${source}">
                    <i data-lucide="pencil"></i>
                </button>
            </div>
        </article>
    `;
}

function handleResourceCardClick(event) {
    const editButton = event.target.closest('[data-edit-resource]');
    if (editButton) {
        openResourceEditor(editButton.dataset.source, editButton.dataset.editResource);
        return;
    }

    const viewButton = event.target.closest('[data-view-button]');
    if (viewButton) {
        openResourceViewer(viewButton.dataset.source, viewButton.dataset.viewButton);
        return;
    }

    const card = event.target.closest('[data-view-resource]');
    if (card) {
        openResourceViewer(card.dataset.source, card.dataset.viewResource);
    }
}

function handleTrashListClick(event) {
    const restoreButton = event.target.closest('[data-restore-resource]');
    if (restoreButton) {
        restoreResource(restoreButton.dataset.source, restoreButton.dataset.restoreResource);
        return;
    }

    handleResourceCardClick(event);
}

function openResourceViewer(source, id) {
    const item = getSourceItems(source).find(entry => String(entry.id) === String(id));
    if (!item) {
        showToast('没有找到这条资源');
        return;
    }

    const title = item.title || item.id;
    const publicUrl = getResourcePublicUrl(source, item);
    const isDeleted = isResourceDeleted(item);
    $('#resource-viewer-title').textContent = title;
    $('#resource-viewer-subtitle').textContent = `${SOURCE_META[source].label} · ${item.id}${isDeleted ? ' · 回收站' : ''}`;
    $('#resource-viewer-public-link').href = publicUrl;
    $('#resource-viewer-public-link').classList.toggle('is-hidden', isDeleted);
    $('#resource-viewer-edit-button').dataset.source = source;
    $('#resource-viewer-edit-button').dataset.resourceId = item.id;
    $('#resource-viewer-restore-button').dataset.source = source;
    $('#resource-viewer-restore-button').dataset.resourceId = item.id;
    $('#resource-viewer-restore-button').classList.toggle('is-hidden', !isDeleted);
    $('#resource-viewer-body').innerHTML = renderResourceDetail(source, item);
    $('#resource-viewer-modal').classList.remove('is-hidden');
    $('#resource-viewer-modal').setAttribute('aria-hidden', 'false');
    renderIcons();
}

function closeResourceViewer() {
    $('#resource-viewer-modal').classList.add('is-hidden');
    $('#resource-viewer-modal').setAttribute('aria-hidden', 'true');
}

function renderResourceDetail(source, item) {
    const image = getItemImage(source, item);
    const audioPath = getItemAudioPath(source, item);
    const fields = getResourceDetailFields(source, item);

    return `
        <div class="resource-detail-hero">
            ${image
                ? `<img class="resource-detail-image" src="${escapeAttribute(resolveAssetUrl(state.previewUrls[item.id] || image))}" alt="${escapeAttribute(item.title || item.id)}">`
                : `<div class="resource-detail-icon"><i data-lucide="${SOURCE_META[source].icon}"></i></div>`}
            <div>
                <div class="editor-meta">
                    <span>${escapeHtml(SOURCE_META[source].label)}</span>
                    <span>ID：${escapeHtml(item.id)}</span>
                    <span>${escapeHtml(getResourceStatusLabel(source, item))}</span>
                </div>
                <p>${escapeHtml(getResourcePreviewText(source, item) || getItemMeta(source, item))}</p>
                ${audioPath ? `
                    <audio class="resource-detail-audio" src="${escapeAttribute(resolveAssetUrl(audioPath))}" controls></audio>
                ` : ''}
            </div>
        </div>
        <div class="resource-detail-grid">
            ${fields.map(({ label, value }) => `
                <div class="resource-detail-row">
                    <span>${escapeHtml(label)}</span>
                    <strong>${escapeHtml(value)}</strong>
                </div>
            `).join('')}
        </div>
    `;
}

function getResourceDetailFields(source, item) {
    const schema = RESOURCE_EDIT_SCHEMAS[source] || [];
    return [
        { label: '资源 ID', value: item.id || '' },
        ...(isResourceDeleted(item) ? [
            { label: '删除时间', value: item.deletedAt || '' },
            { label: '删除方式', value: item.deletedReason || item.deletedBy || '后台软删除' }
        ] : []),
        ...schema.map(field => ({
            label: field.label,
            value: formatResourceFieldValue(item[field.key])
        }))
    ].filter(field => field.value !== '');
}

function formatResourceFieldValue(value) {
    if (Array.isArray(value)) return value.join('，');
    if (typeof value === 'boolean') return value ? '是' : '否';
    if (value === undefined || value === null) return '';
    return String(value);
}

function getResourcePreviewText(source, item) {
    if (!item) return '';
    if (source === 'photos') return item.description || item.src || '';
    if (source === 'lyrics') return item.summary || item.contentPath || '';
    if (source === 'music') return item.description || item.url || '';
    if (source === 'knowledge') return item.description || item.externalUrl || item.filename || '';
    return '';
}

function getItemAudioPath(source, item) {
    if (!item) return '';
    if (source === 'music') return item.url || '';
    if (source === 'lyrics') return item.audioPath || '';
    return '';
}

function getResourcePublicUrl(source, item) {
    const id = encodeURIComponent(item && item.id ? item.id : '');
    if (source === 'lyrics') return `../lyric-detail.html?id=${id}`;
    if (source === 'music') return `../music-player.html?id=${id}`;
    if (source === 'knowledge') return `../knowledge-detail.html?id=${id}`;
    if (source === 'photos') return '../photos.html';
    return '../index.html';
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
    const visibleItems = getVisibleSourceItems(source);
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
                    <p>${item ? escapeHtml(isResourceDeleted(item) ? '资源已在回收站，请移除' : getItemMeta(source, item)) : '资源不存在，请移除'}</p>
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
    const candidates = filterItems(visibleItems, query).slice(0, 80);

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

function renderRelationSelects() {
    renderMusicLyricSelect();
    renderLyricMusicAudioSelect();
}

function renderMusicLyricSelect() {
    const lyrics = getVisibleSourceItems('lyrics');
    $('#music-lyric-select').innerHTML = [
        '<option value="">不关联词作</option>',
        ...lyrics.map(item => `<option value="${escapeAttribute(item.id)}">${escapeHtml(item.title || item.id)}</option>`)
    ].join('');
}

function renderLyricMusicAudioSelect() {
    const select = $('#lyric-music-audio-select');
    if (!select) return;

    const selectedValue = select.value;
    const options = getVisibleSourceItems('music')
        .filter(item => item.url)
        .map(item => `
            <option value="${escapeAttribute(item.id)}">
                ${escapeHtml(item.title || item.id)}${item.artist ? ` · ${escapeHtml(item.artist)}` : ''}
            </option>
        `);

    select.innerHTML = [
        '<option value="">不从音乐选择</option>',
        ...options
    ].join('');

    if ([...select.options].some(option => option.value === selectedValue)) {
        select.value = selectedValue;
    }
}

function getMusicAudioPath(id) {
    if (!id) return '';
    const item = getVisibleSourceItems('music').find(entry => String(entry.id) === String(id));
    return item && item.url ? item.url : '';
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
            text: problems.length === 0 ? '资源结构检查通过' : problems[0]
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
    setPanel('publish-panel');
    setPublishProgress(6, '正在检查待发布内容');
    renderPublishChecks();

    const problems = getPublishProblems();
    if (problems.length > 0) {
        setPublishOutput(`发布被拦截：\n${problems.join('\n')}`);
        setPublishProgress(100, '发布检查未通过', 'error');
        showToast('发布检查未通过');
        return;
    }

    if (!hasChanges()) {
        setPublishOutput('没有待发布改动。');
        setPublishProgress(100, '没有待发布改动');
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
        setPublishProgress(100, '线上发布接口未连接', 'error');
        showToast('线上发布接口未连接');
        return;
    }

    const payload = buildPublishPayload();
    setPublishOutput('正在提交到 GitHub...');
    setPublishProgress(28, '正在准备提交到 GitHub');
    setPublishBusy(true);

    try {
        setPublishProgress(58, '正在提交到 GitHub');
        const response = await fetch(buildAdminApiUrl('/api/admin/content'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                ...getAuthHeaders()
            },
            body: JSON.stringify(payload)
        });
        setPublishProgress(84, '正在读取 GitHub 返回结果');
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
        setPublishProgress(100, data.changed ? '发布成功，Vercel 会自动部署' : '没有实际变更', 'success');
        renderAll();
        showToast('发布成功，待发布列表已清空');
    } catch (error) {
        setPublishOutput(`发布失败：${error.message}`);
        setPublishProgress(100, '发布失败', 'error');
        showToast('发布失败');
    } finally {
        setPublishBusy(false);
    }
}

async function publishSingleDraft(source, id) {
    setPanel('publish-panel');
    setPublishProgress(6, '正在检查这条资源');
    const entry = getDraftEntry(source, id);
    if (!entry) {
        setPublishProgress(100, '这条资源已经不在待发布列表');
        showToast('这条资源已经不在待发布列表');
        renderAll();
        return;
    }

    const entries = expandEntriesWithDependencies([entry]);
    const availability = getSinglePublishAvailability(source, entry.item);
    if (!availability.canPublish) {
        setPublishProgress(100, availability.reason || '暂时不能单条发布', 'error');
        showToast(availability.reason || '暂时不能单条发布');
        return;
    }

    const problems = getPublishProblems();
    if (problems.length > 0) {
        setPublishOutput(`发布被拦截：\n${problems.join('\n')}`);
        setPublishProgress(100, '发布检查未通过', 'error');
        showToast('发布检查未通过');
        return;
    }

    const payload = buildSinglePublishPayload(entries);
    if (Object.keys(payload.files).length === 0 && Object.keys(payload.textFiles).length === 0) {
        setPublishProgress(100, '没有可发布的改动');
        showToast('没有可发布的改动');
        return;
    }

    setPublishOutput(`正在发布：${entries.map(item => item.item.title || item.item.id).join('、')}`);
    setPublishProgress(30, '正在准备单条发布');
    setPublishBusy(true);

    try {
        setPublishProgress(60, '正在提交这条资源到 GitHub');
        const response = await fetch(buildAdminApiUrl('/api/admin/content'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                ...getAuthHeaders()
            },
            body: JSON.stringify(payload)
        });
        setPublishProgress(86, '正在读取 GitHub 返回结果');
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || '发布失败');
        }

        Object.entries(payload.files).forEach(([path, value]) => {
            state.baseFiles[path] = clone(value);
        });

        entries.forEach(({ source: entrySource, item, kind }) => {
            if (kind === 'new') {
                state.newIds[entrySource].delete(String(item.id));
                getTextFilePathsForItem(entrySource, item).forEach(path => {
                    delete state.textFiles[path];
                });
            }
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
        setPublishProgress(100, data.changed ? '单条发布成功，Vercel 会自动部署' : '没有实际变更', 'success');
        renderAll();
        showToast('单条发布成功');
    } catch (error) {
        setPublishOutput(`发布失败：${error.message}`);
        setPublishProgress(100, '发布失败', 'error');
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
    const files = {};
    const selectedBySource = buildSelectedIdMap(entries);
    const entriesBySource = entries.reduce((result, entry) => {
        if (!result[entry.source]) {
            result[entry.source] = [];
        }
        result[entry.source].push(entry);
        return result;
    }, {});

    Object.entries(entriesBySource).forEach(([source, sourceEntries]) => {
        const path = DATA_FILES[source];
        const baseItems = clone(state.baseFiles[path] || []);
        const nextItems = clone(baseItems);
        const editEntries = sourceEntries.filter(entry => isUpdateDraftKind(entry.kind));
        const newIds = new Set(sourceEntries
            .filter(entry => entry.kind === 'new')
            .map(entry => String(entry.item.id)));

        editEntries.forEach(({ item }) => {
            const index = nextItems.findIndex(baseItem => String(baseItem.id) === String(item.id));
            if (index !== -1) {
                nextItems[index] = clone(item);
            }
        });

        const publishItems = getSourceItems(source)
            .filter(item => state.newIds[source].has(String(item.id)) && newIds.has(String(item.id)))
            .map(clone);

        if (publishItems.length > 0) {
            nextItems.push(...publishItems);
        }

        if (stableStringify(nextItems) !== stableStringify(baseItems)) {
            files[path] = nextItems;
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
        const currentItemMap = new Map(getSourceItems(source).map(item => [String(item.id), item]));
        const allowedIds = new Set(baseItems.map(item => String(item.id)));
        const selectedIds = selectedBySource[source] || new Set();
        selectedIds.forEach(id => allowedIds.add(String(id)));
        moduleConfig.items = moduleConfig.items.filter(id => {
            const currentItem = currentItemMap.get(String(id));
            return allowedIds.has(String(id)) && !isResourceDeleted(currentItem);
        });
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

function openResourceEditor(source, id) {
    const item = getSourceItems(source).find(entry => String(entry.id) === String(id));
    const schema = RESOURCE_EDIT_SCHEMAS[source];

    if (!item || !schema) {
        showToast('没有找到可编辑资源');
        return;
    }

    const form = $('#resource-editor-form');
    form.elements.source.value = source;
    form.elements.resourceId.value = item.id;
    const isDeleted = isResourceDeleted(item);
    const deleteButton = $('#resource-editor-delete-button');
    const restoreButton = $('#resource-editor-restore-button');
    deleteButton.dataset.source = source;
    deleteButton.dataset.resourceId = item.id;
    restoreButton.dataset.source = source;
    restoreButton.dataset.resourceId = item.id;
    deleteButton.classList.toggle('is-hidden', isDeleted);
    restoreButton.classList.toggle('is-hidden', !isDeleted);
    $('#resource-editor-title').textContent = `编辑${SOURCE_META[source].label}资源`;
    $('#resource-editor-subtitle').textContent = item.title || item.id;
    $('#resource-editor-meta').innerHTML = `
        <span>${escapeHtml(SOURCE_META[source].label)}</span>
        <span>ID：${escapeHtml(item.id)}</span>
        <span>${escapeHtml(getResourceStatusLabel(source, item))}</span>
    `;
    $('#resource-editor-fields').innerHTML = `
        <label class="field">
            <span>资源 ID</span>
            <input value="${escapeAttribute(item.id)}" disabled>
        </label>
        ${schema.map(field => renderEditorField(field, item)).join('')}
    `;

    $('#resource-editor-modal').classList.remove('is-hidden');
    $('#resource-editor-modal').setAttribute('aria-hidden', 'false');
    renderIcons();

    const firstInput = $('#resource-editor-fields input:not([disabled]), #resource-editor-fields textarea');
    if (firstInput) {
        firstInput.focus();
        firstInput.select();
    }
}

function closeResourceEditor() {
    $('#resource-editor-modal').classList.add('is-hidden');
    $('#resource-editor-modal').setAttribute('aria-hidden', 'true');
}

function renderEditorField(field, item) {
    const value = getEditorFieldValue(field, item);
    if (field.type === 'checkbox') {
        return `
            <label class="check-field editor-field-wide">
                <input type="checkbox" name="${escapeAttribute(field.key)}" ${value ? 'checked' : ''}>
                <span>${escapeHtml(field.label)}</span>
            </label>
        `;
    }

    if (field.type === 'textarea') {
        return `
            <label class="field editor-field-wide">
                <span>${escapeHtml(field.label)}</span>
                <textarea name="${escapeAttribute(field.key)}" rows="4" ${field.required ? 'required' : ''}>${escapeHtml(value)}</textarea>
            </label>
        `;
    }

    return `
        <label class="field">
            <span>${escapeHtml(field.label)}</span>
            <input name="${escapeAttribute(field.key)}" value="${escapeAttribute(value)}" ${field.required ? 'required' : ''} ${field.type === 'number' ? 'inputmode="decimal"' : ''}>
        </label>
    `;
}

function getEditorFieldValue(field, item) {
    const value = item[field.key];
    if (field.type === 'checkbox') return Boolean(value);
    if (field.type === 'tags') return Array.isArray(value) ? value.join('，') : String(value || '');
    return value === undefined || value === null ? '' : String(value);
}

function handleResourceEditorSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const source = form.elements.source.value;
    const id = form.elements.resourceId.value;
    const schema = RESOURCE_EDIT_SCHEMAS[source] || [];
    const path = DATA_FILES[source];
    const index = getSourceItems(source).findIndex(item => String(item.id) === String(id));

    if (index === -1) {
        showToast('这条资源已经不在资源库里');
        closeResourceEditor();
        renderAll();
        return;
    }

    const original = getSourceItems(source)[index];
    const updated = clone(original);

    try {
        schema.forEach(field => {
            applyEditorFieldValue(updated, field, form.elements[field.key]);
        });
    } catch (error) {
        showToast(error.message || '保存失败');
        return;
    }

    updated.id = original.id;
    state.files[path][index] = updated;
    closeResourceEditor();
    renderAll();

    if (getResourceChangeKind(source, updated)) {
        setPanel('pending-panel');
        showToast('修改已保存到待发布列表');
    } else {
        showToast('没有检测到修改');
    }
}

function handleResourceEditorDelete() {
    const button = $('#resource-editor-delete-button');
    softDeleteResource(button.dataset.source, button.dataset.resourceId);
}

function handleResourceEditorRestore() {
    const button = $('#resource-editor-restore-button');
    restoreResource(button.dataset.source, button.dataset.resourceId);
}

function applyEditorFieldValue(item, field, input) {
    if (!input) return;

    if (field.type === 'checkbox') {
        item[field.key] = input.checked;
        return;
    }

    const rawValue = String(input.value || '').trim();
    if (field.required && !rawValue) {
        throw new Error(`${field.label}不能为空`);
    }

    if (!rawValue && field.empty === 'delete') {
        delete item[field.key];
        return;
    }

    if (field.type === 'number') {
        if (!rawValue) {
            delete item[field.key];
            return;
        }
        const numberValue = Number(rawValue);
        if (!Number.isFinite(numberValue)) {
            throw new Error(`${field.label}必须是数字`);
        }
        item[field.key] = numberValue;
        return;
    }

    if (field.type === 'tags') {
        item[field.key] = splitTags(rawValue);
        return;
    }

    item[field.key] = rawValue;
}

function getDraftEntries() {
    return Object.keys(SOURCE_META).flatMap(source => getSourceItems(source)
        .map(item => {
            const kind = getResourceChangeKind(source, item);
            return kind ? { source, item, kind } : null;
        })
        .filter(Boolean));
}

function getDraftEntry(source, id) {
    const item = getSourceItems(source).find(entry => String(entry.id) === String(id));
    const kind = item ? getResourceChangeKind(source, item) : '';
    return item && kind ? { source, item, kind } : null;
}

function getResourceChangeKind(source, item) {
    if (!item) return '';
    const id = String(item.id);
    if (state.newIds[source] && state.newIds[source].has(id)) {
        return 'new';
    }

    const baseItem = getBaseResourceItem(source, id);
    if (!baseItem) return '';
    const baseDeleted = isResourceDeleted(baseItem);
    const currentDeleted = isResourceDeleted(item);
    if (!baseDeleted && currentDeleted) return 'delete';
    if (baseDeleted && !currentDeleted) return 'restore';
    return stableStringify(baseItem) === stableStringify(item) ? '' : 'edit';
}

function getBaseResourceItem(source, id) {
    return (state.baseFiles[DATA_FILES[source]] || [])
        .find(item => String(item.id) === String(id));
}

function getVisibleSourceItems(source) {
    return getSourceItems(source).filter(item => !isResourceDeleted(item));
}

function getTrashSourceItems(source) {
    return getSourceItems(source).filter(isResourceDeleted);
}

function isResourceDeleted(item) {
    return Boolean(item && item.deletedAt);
}

function getResourceStatusLabel(source, item) {
    const kind = getResourceChangeKind(source, item);
    if (kind) {
        return kind === 'new' ? '本次新增' : `待发布${getDraftKindLabel(kind)}`;
    }
    return isResourceDeleted(item) ? '回收站' : '线上资源';
}

function getDraftKindLabel(kind) {
    const labels = {
        new: '新增',
        edit: '修改',
        delete: '删除',
        restore: '恢复'
    };
    return labels[kind] || '修改';
}

function getDraftUndoLabel(kind) {
    if (kind === 'new') return '移除';
    if (kind === 'delete') return '撤销删除';
    if (kind === 'restore') return '撤销恢复';
    return '撤销修改';
}

function getDraftUndoIcon(kind) {
    return kind === 'new' ? 'trash-2' : 'rotate-ccw';
}

function getDraftKindClass(kind, isDeleted = false) {
    if (kind === 'delete' || isDeleted) return 'is-deleted';
    if (kind) return 'is-new';
    return '';
}

function summarizeDraftEntries(entries) {
    const labels = [
        ['new', '新增'],
        ['edit', '修改'],
        ['delete', '删除'],
        ['restore', '恢复']
    ];
    return labels
        .map(([kind, label]) => {
            const count = entries.filter(entry => entry.kind === kind).length;
            return count > 0 ? `${label} ${count}` : '';
        })
        .filter(Boolean)
        .join('，');
}

function isUpdateDraftKind(kind) {
    return kind === 'edit' || kind === 'delete' || kind === 'restore';
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
            .map(item => ({ source, item, kind: getResourceChangeKind(source, item) }));
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
        .filter(entry => entry.kind === 'new')
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
            if (!current[index] || String(base[index].id || '') !== String(current[index].id || '')) {
                problems.push(`${SOURCE_META[source].label}第 ${index + 1} 个资源被删除、重排或修改 ID`);
                break;
            }
        }

        const seen = new Set();
        current.forEach(item => {
            if (!item || !item.id) return;
            const id = String(item.id);
            if (seen.has(id)) {
                problems.push(`${SOURCE_META[source].label}存在重复 ID：${id}`);
            }
            seen.add(id);
        });
    });

    getDraftEntries().forEach(({ source, item }) => {
        if (!state.newIds[source].has(String(item.id))) return;
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
            item.linkedMusicId,
            item.lyricId,
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

function normalizeAssetInput(value) {
    return String(value || '').trim().replace(/^\.\.\//, '');
}

function setPanel(panelId) {
    state.activePanel = panelId;
    $$('.panel').forEach(panel => panel.classList.toggle('is-active', panel.id === panelId));
    $$('.side-link').forEach(button => button.classList.toggle('is-active', button.dataset.panel === panelId));

    const titleMap = {
        'dashboard-panel': '总览',
        'resources-panel': '新增资源',
        'resource-list-panel': '资源列表',
        'trash-panel': '回收站',
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

function setPublishProgress(value, label, tone = 'info') {
    const progressNode = $('#publish-progress');
    if (!progressNode) return;

    const percent = Math.max(0, Math.min(Math.round(Number(value) || 0), 100));
    progressNode.className = `publish-progress is-${tone}`;
    progressNode.querySelector('.publish-progress-label').textContent = label || '正在处理';
    progressNode.querySelector('.publish-progress-value').textContent = `${percent}%`;
    progressNode.querySelector('.publish-progress-bar').style.width = `${percent}%`;
}

function setLoginError(message) {
    const error = $('#login-error');
    error.textContent = message || '';
    error.classList.toggle('is-visible', Boolean(message));
}

function setLoginBusy(isBusy) {
    $('#login-button').disabled = isBusy;
    $('#admin-token-input').disabled = isBusy;
    $('#toggle-password-button').disabled = isBusy;
}

function showFormError(form, message) {
    setFormMessage(form, message, 'error');
    showToast(message);
}

function createFormProgress(form) {
    return {
        set(value, label, tone = 'info') {
            setFormProgress(form, value, label, tone);
        }
    };
}

function setFormProgress(form, value, label, tone = 'info') {
    let progressNode = form.querySelector('.form-progress');
    if (!progressNode) {
        progressNode = document.createElement('div');
        progressNode.className = 'form-progress';
        progressNode.innerHTML = `
            <div class="form-progress-header">
                <span class="form-progress-label"></span>
                <span class="form-progress-value"></span>
            </div>
            <div class="form-progress-track">
                <div class="form-progress-bar"></div>
            </div>
        `;
        const submitButton = form.querySelector('button[type="submit"]');
        form.insertBefore(progressNode, submitButton || null);
    }

    const percent = Math.max(0, Math.min(Math.round(Number(value) || 0), 100));
    progressNode.hidden = false;
    progressNode.className = `form-progress is-${tone}`;
    progressNode.querySelector('.form-progress-label').textContent = label || '正在处理';
    progressNode.querySelector('.form-progress-value').textContent = `${percent}%`;
    progressNode.querySelector('.form-progress-bar').style.width = `${percent}%`;
}

function setFormMessage(form, message, tone = 'info') {
    let messageNode = form.querySelector('.form-message');
    if (!messageNode) {
        messageNode = document.createElement('div');
        messageNode.className = 'form-message';
        messageNode.setAttribute('role', 'status');
        messageNode.setAttribute('aria-live', 'polite');
        const submitButton = form.querySelector('button[type="submit"]');
        form.insertBefore(messageNode, submitButton || null);
    }

    messageNode.textContent = message || '';
    messageNode.hidden = !message;
    messageNode.className = `form-message is-${tone}`;
}

function togglePasswordVisibility() {
    const input = $('#admin-token-input');
    const button = $('#toggle-password-button');
    const willShow = input.type === 'password';

    input.type = willShow ? 'text' : 'password';
    button.setAttribute('aria-label', willShow ? '隐藏密码' : '显示密码');
    button.setAttribute('aria-pressed', String(willShow));
    button.title = willShow ? '隐藏密码' : '显示密码';
    button.innerHTML = `<i data-lucide="${willShow ? 'eye-off' : 'eye'}"></i>`;
    renderIcons();
    input.focus();
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
