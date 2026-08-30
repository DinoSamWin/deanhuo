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
const ONLINE_UPLOAD_LIMIT_BYTES = Math.floor(4.5 * 1024 * 1024);
const PHOTO_UPLOAD_TARGET_BYTES = Math.floor(4.2 * 1024 * 1024);
const PHOTO_OPTIMIZE_MIME_TYPE = 'image/webp';
const PHOTO_OPTIMIZE_EXTENSION = '.webp';
const PHOTO_OPTIMIZE_QUALITY_STEPS = [0.96, 0.94, 0.92, 0.9, 0.88, 0.86, 0.84, 0.82, 0.8];
const PHOTO_BATCH_DRAFT_DB = 'deanhuo-photo-batch-draft';
const PHOTO_BATCH_DRAFT_STORE = 'drafts';
const PHOTO_BATCH_DRAFT_KEY = 'current-photo-batch';
const PHOTO_BATCH_DRAFT_VERSION = 1;
const PHOTO_BATCH_DRAFT_SAVE_DELAY_MS = 350;
const AUDIO_UPLOAD_TARGET_BYTES = Math.floor(4 * 1024 * 1024);
const AUDIO_TRANSCODE_TARGET_BYTES = AUDIO_UPLOAD_TARGET_BYTES;
const AUDIO_TRANSCODE_MAX_SOURCE_BYTES = 120 * 1024 * 1024;
const MP3_ENCODER_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js';
const MP3_MAX_BITRATE_KBPS = 192;
const MP3_MIN_BITRATE_KBPS = 128;
const MP3_QUALITY_WARNING_BITRATE_KBPS = 160;
const AUDIO_PICKER_ID = 'deanhuo-music-audio';
let mp3EncoderLoadPromise = null;
const COVER_CROP_UPLOAD_TYPES = new Set(['lyricsCover', 'musicCover']);
const coverCropTargetCache = {};
const preparedCoverFiles = new WeakMap();
const pickerSelectedFiles = new WeakMap();
const multiSelectedFiles = new WeakMap();
let imageCropperState = null;
let musicAudioPreviewUrl = '';
let photoBatchItems = [];
let photoBatchActiveIndex = 0;
let photoBatchDraftSaveTimer = null;
let photoBatchDraftRestoring = false;

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
        { key: 'linkedMusicId', label: '关联音乐', type: 'resourceSelect', source: 'music', empty: 'delete' },
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
        { key: 'urlFile', label: '替换音频文件', type: 'fileUpload', uploadType: 'musicAudio', targetKey: 'url', accept: 'audio/*', note: '选择新音频后，保存时会上传并替换上面的音频路径。大 WAV 会自动转 MP3。', uploadProgressEnd: 58 },
        { key: 'versions', label: '音频版本', type: 'musicVersions' },
        { key: 'description', label: '描述', type: 'textarea' },
        { key: 'lyricId', label: '关联词作', type: 'resourceSelect', source: 'lyrics', empty: 'delete' },
        { key: 'lyricText', label: '歌词内容', type: 'markdownText', fileLabel: '歌词 Markdown 文件', rows: 8, empty: 'delete' }
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
    restorePhotoBatchDraft();
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
            const message = music.url
                ? `已关联音乐并同步音频：${music.title || music.id}`
                : `已关联音乐：${music.title || music.id}。这首音乐暂无音频路径，词作可不填音频。`;
            setFormMessage($('#lyric-form'), message, 'info');
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
    $('#resource-editor-fields').addEventListener('click', handleResourceEditorFieldClick);
    $('#resource-editor-fields').addEventListener('change', handleResourceEditorFieldChange);
    $('#resource-editor-fields').addEventListener('input', handleResourceEditorFieldInput);
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
    bindImageCropperModal();

    $('#photo-form').elements.file.addEventListener('change', event => {
        syncActivePhotoBatchFromForm();
        const selectedFiles = getSelectedPhotoInputFiles(event.currentTarget);
        const selectedCount = selectedFiles.length;
        const addedCount = appendPhotoBatchFiles(selectedFiles);
        clearSelectedInputFile(event.currentTarget);
        renderPhotoBatchEditor();
        if (addedCount > 0) {
            savePhotoBatchDraftSoon();
            setFormMessage($('#photo-form'), `已加入 ${addedCount} 张图片，请逐张确认标题和描述。`, 'info');
        } else if (selectedCount > 0) {
            setFormMessage($('#photo-form'), '没有新增图片，可能是重复选择或文件不是图片格式。', 'info');
        }
    });
    $('#photo-batch-tabs').addEventListener('click', handlePhotoBatchTabClick);
    $('#photo-batch-tabs').addEventListener('wheel', handlePhotoBatchTabsWheel, { passive: false });
    $('#photo-batch-tabs').addEventListener('keydown', handlePhotoBatchTabKeydown);
    $('#photo-batch-clear-button').addEventListener('click', clearPhotoBatch);
    $('#photo-form').elements.title.addEventListener('input', syncActivePhotoBatchField);
    $('#photo-form').elements.description.addEventListener('input', syncActivePhotoBatchField);
    $('#photo-form').elements.category.addEventListener('input', savePhotoBatchDraftSoon);
    $('#photo-form').elements.date.addEventListener('input', savePhotoBatchDraftSoon);
    $('#photo-form').elements.showOnHome.addEventListener('change', savePhotoBatchDraftSoon);

    $('#music-form').elements.title.addEventListener('input', event => {
        if (event.target.value.trim() !== event.target.dataset.autoTitleValue) {
            delete event.target.dataset.autoTitleValue;
        }
    });
    $('#music-form').elements.audioUrl.addEventListener('input', () => {
        updateMusicAudioPreview();
        renderMusicVersionOptions();
    });
    $('#music-form').elements.versionAudioFiles.addEventListener('change', event => {
        appendSelectedInputFiles(event.currentTarget);
        renderMusicVersionOptions();
    });
    $('#music-version-options').addEventListener('click', event => {
        const removeButton = event.target.closest('[data-version-remove]');
        if (removeButton) {
            removeSelectedInputFileAt($('#music-form').elements.versionAudioFiles, Number(removeButton.dataset.versionRemove));
            renderMusicVersionOptions();
            return;
        }

        selectVersionOptionFromRow(event, 'defaultVersionSource');
    });
    $('#music-version-options').addEventListener('change', event => {
        if (event.target.name === 'defaultVersionSource') {
            renderMusicVersionOptions();
        }
    });
    $('#lyric-audio-picker-button').addEventListener('click', () => {
        selectAudioFileWithRememberedDirectory($('#lyric-form').elements.audioFile);
    });
    $('#music-audio-picker-button').addEventListener('click', () => {
        selectAudioFileWithRememberedDirectory($('#music-form').elements.audioFile);
    });
    $('#photo-image-paste-button').addEventListener('click', () => {
        pasteImageFromClipboard($('#photo-form').elements.file);
    });
    $('#lyric-cover-paste-button').addEventListener('click', () => {
        pasteImageFromClipboard($('#lyric-form').elements.coverFile);
    });
    $('#music-cover-paste-button').addEventListener('click', () => {
        pasteImageFromClipboard($('#music-form').elements.coverFile);
    });
    document.addEventListener('paste', handleGlobalImagePaste);

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

    $('#music-form').elements.lyricMarkdownFile.addEventListener('change', async event => {
        const file = event.target.files[0];
        if (!file) return;
        try {
            $('#music-form').elements.lyricMarkdownText.value = await readTextFile(file);
            showToast('Markdown 歌词已读取');
        } catch (error) {
            showToast(error.message || '读取 Markdown 文件失败');
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
    syncActivePhotoBatchFromForm();
    const items = getPhotoBatchItems();
    if (items.length === 0) return showFormError(form, '请选择图片文件');

    const emptyTitleIndex = items.findIndex(item => !String(item.title || '').trim());
    if (emptyTitleIndex !== -1) {
        photoBatchActiveIndex = emptyTitleIndex;
        renderPhotoBatchEditor();
        return showFormError(form, `第 ${emptyTitleIndex + 1} 张图片还没有标题`);
    }

    await runFormTask(form, async progress => {
        progress.set(8, `正在检查 ${items.length} 张图片`);
        validateUploads(items.map(item => ({ file: item.file, uploadType: 'photos' })));
        const uploaded = await uploadFiles(items.map((item, index) => ({
            key: `photo${index}`,
            file: item.file,
            uploadType: 'photos',
            label: `图片${index + 1}`
        })), progress, 16, 82);

        progress.set(90, '正在生成图片草稿');
        const showOnHome = form.elements.showOnHome.checked;
        const category = form.elements.category.value.trim() || 'Photography';
        const date = form.elements.date.value.trim() || formatMonthYear(new Date());
        const createdIds = [];

        items.forEach((item, index) => {
            const title = String(item.title || '').trim();
            const id = makeUniqueId('img', title || item.file.name, 'photos');
            state.previewUrls[id] = URL.createObjectURL(item.file);
            appendResource('photos', {
                id,
                title: title || id,
                description: String(item.description || '').trim(),
                src: uploaded[`photo${index}`],
                showOnHome,
                category,
                date,
                updateTime: Date.now() / 1000
            });
            createdIds.push(id);

            if (showOnHome) {
                addRecommendation('homePhotos', id);
            }
        });


        form.reset();
        clearPhotoBatch();
        clearSelectedInputFile(form.elements.file);
        setDefaultFormValues();
        return `${createdIds.length} 张图片资源创建成功，已进入待发布列表。`;
    });
}

async function handleLyricSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const coverInput = form.elements.coverFile;
    const coverFile = getPreparedUploadFile(coverInput) || getSelectedInputFile(coverInput);
    const audioFile = getSelectedInputFile(form.elements.audioFile);
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
        clearPreparedCoverFile(coverInput);
        clearSelectedInputFile(coverInput);
        clearSelectedInputFile(form.elements.audioFile);
        setDefaultFormValues();
        return '词作资源创建成功，已进入待发布列表。';
    });
}

async function handleMusicSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const coverInput = form.elements.coverFile;
    const coverFile = getPreparedUploadFile(coverInput) || getSelectedInputFile(coverInput);
    const audioFile = getSelectedInputFile(form.elements.audioFile);
    const versionAudioFiles = getSelectedInputFiles(form.elements.versionAudioFiles);
    const audioUrl = normalizeAssetInput(form.elements.audioUrl.value);
    if (!coverFile) return showFormError(form, '请选择封面图片');
    if (!audioFile && !audioUrl) return showFormError(form, '请选择音频文件，或填写音频外链/已上传路径');

    await runFormTask(form, async progress => {
        progress.set(8, '正在读取音乐信息');
        validateUploads([
            { file: coverFile, uploadType: 'musicCover' },
            ...(audioFile && !audioUrl ? [{ file: audioFile, uploadType: 'musicAudio' }] : []),
            ...versionAudioFiles.map(file => ({ file, uploadType: 'musicAudio' }))
        ]);

        const title = form.elements.title.value.trim();
        const id = makeUniqueId('music', title, 'music');
        const lyricMarkdownFile = form.elements.lyricMarkdownFile.files[0];
        const pastedLyricMarkdown = form.elements.lyricMarkdownText.value.trim();
        const fileLyricMarkdown = lyricMarkdownFile && !pastedLyricMarkdown
            ? (await readTextFile(lyricMarkdownFile)).trim()
            : '';
        const lyricMarkdown = pastedLyricMarkdown || fileLyricMarkdown;
        const shouldSyncLyric = Boolean(lyricMarkdown && form.elements.syncLyric.checked);
        state.previewUrls[id] = URL.createObjectURL(coverFile);
        const versionUploadItems = versionAudioFiles.map((file, index) => ({
            key: `version${index}`,
            file,
            uploadType: 'musicAudio',
            label: `版本音频${index + 1}`
        }));
        const uploaded = await uploadFiles([
            { key: 'cover', file: coverFile, uploadType: 'musicCover', label: '音乐封面' },
            ...(audioFile && !audioUrl ? [{ key: 'url', file: audioFile, uploadType: 'musicAudio', label: '音乐音频' }] : []),
            ...versionUploadItems
        ], progress, 22, 78);
        const cover = uploaded.cover;
        const primaryUrl = audioUrl || uploaded.url;
        const primarySource = audioUrl ? 'primary-url' : 'primary-file';
        const versionCandidates = [
            ...(primaryUrl ? [{ source: primarySource, url: primaryUrl, label: '主音频' }] : []),
            ...versionAudioFiles.map((file, index) => ({
                source: `extra-file-${index}`,
                url: uploaded[`version${index}`],
                label: makeTitleFromFilename(file.name) || `追加版本 ${index + 1}`
            }))
        ];
        const selectedVersionSource = form.querySelector('input[name="defaultVersionSource"]:checked')?.value;
        const versions = buildMusicVersions(versionCandidates, selectedVersionSource);
        const url = versions[0]?.url || primaryUrl;
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
            ...(versions.length > 1 ? { versions } : {}),
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
        clearPreparedCoverFile(coverInput);
        clearSelectedInputFile(coverInput);
        clearSelectedInputFile(form.elements.audioFile);
        clearSelectedInputFile(form.elements.versionAudioFiles);
        clearMusicAudioPreview();
        renderMusicVersionOptions();
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
        results[item.key] = await uploadAsset(item.file, item.uploadType, (ratio, statusLabel) => {
            const safeRatio = Math.max(0, Math.min(Number(ratio) || 0, 1));
            const percent = Math.round(safeRatio * 100);
            progress.set(
                itemStart + (itemEnd - itemStart) * safeRatio,
                statusLabel || `正在上传${label}（${percent}%）`
            );
        });
        progress.set(itemEnd, `${label}上传完成`);
    }

    return results;
}

async function uploadAsset(file, uploadType, onProgress) {
    let uploadFile = file;
    let uploadProgress = onProgress;
    if (shouldTranscodeAudioForUpload(file, uploadType)) {
        uploadFile = await transcodeAudioToMp3(file, (ratio, label) => {
            if (onProgress) onProgress(ratio * 0.72, label);
        });
        uploadProgress = (ratio, label) => {
            if (onProgress) onProgress(0.72 + ratio * 0.28, label);
        };
    } else if (shouldOptimizePhotoForUpload(file, uploadType)) {
        uploadFile = await optimizePhotoToWebp(file, (ratio, label) => {
            if (onProgress) onProgress(ratio * 0.68, label);
        });
        uploadProgress = (ratio, label) => {
            if (onProgress) onProgress(0.68 + ratio * 0.32, label);
        };
    }

    const uploadProblem = getUploadFileProblem(uploadFile, uploadType);
    if (uploadProblem) {
        throw new Error(uploadProblem);
    }

    if (!state.online) {
        const path = suggestAssetPath(uploadType, uploadFile.name);
        state.pendingAssets.push({
            path,
            name: uploadFile.name,
            size: uploadFile.size,
            type: uploadFile.type
        });
        if (uploadProgress) uploadProgress(1);
        return path;
    }

    const formData = new FormData();
    formData.append('uploadType', uploadType);
    formData.append('file', uploadFile);

    if (uploadProgress && window.XMLHttpRequest) {
        return uploadAssetWithProgress(uploadFile, uploadType, formData, uploadProgress);
    }

    const response = await fetch(buildAdminApiUrl('/api/admin/upload'), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(buildUploadErrorMessage(response, data, uploadFile, uploadType));
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
                const ratio = Math.min(event.loaded / event.total, 0.98);
                onProgress(ratio, `正在上传${file.name}（${Math.round(ratio * 100)}%）`);
            } else {
                onProgress(0.5, `正在上传${file.name}`);
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

            onProgress(1, `${file.name} 上传完成`);
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

async function optimizePhotoToWebp(file, onProgress) {
    onProgress?.(0.04, `正在读取大图：${file.name}`);
    const sourceUrl = URL.createObjectURL(file);
    let canvas = null;

    try {
        const image = await loadImageElement(sourceUrl);
        const width = image.naturalWidth;
        const height = image.naturalHeight;

        if (!width || !height) {
            throw new Error('无法读取图片尺寸');
        }

        await waitForBrowserFrame();
        canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext('2d', { alpha: true });
        if (!context) {
            throw new Error('当前浏览器无法创建图片优化画布');
        }

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, 0, 0, width, height);

        let bestFile = null;
        for (let index = 0; index < PHOTO_OPTIMIZE_QUALITY_STEPS.length; index += 1) {
            const quality = PHOTO_OPTIMIZE_QUALITY_STEPS[index];
            const progressRatio = 0.16 + (index / PHOTO_OPTIMIZE_QUALITY_STEPS.length) * 0.68;
            onProgress?.(progressRatio, `正在转成高质量 WebP（${Math.round(quality * 100)}%）`);
            const blob = await canvasToBlob(canvas, PHOTO_OPTIMIZE_MIME_TYPE, quality);
            const optimized = makeOptimizedPhotoFile(file, blob);

            if (!bestFile || optimized.size < bestFile.size) {
                bestFile = optimized;
            }

            if (optimized.size <= PHOTO_UPLOAD_TARGET_BYTES) {
                onProgress?.(0.96, `图片已优化：${formatFileSize(file.size)} → ${formatFileSize(optimized.size)}`);
                return optimized;
            }
        }

        throw new Error(buildPhotoOptimizeFailureMessage(file, bestFile));
    } catch (error) {
        throw new Error(error.message || '图片自动优化失败');
    } finally {
        URL.revokeObjectURL(sourceUrl);
        if (canvas) {
            canvas.width = 1;
            canvas.height = 1;
        }
    }
}

function makeOptimizedPhotoFile(sourceFile, blob) {
    const basename = String(sourceFile.name || 'photo').replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${basename}${PHOTO_OPTIMIZE_EXTENSION}`, {
        type: PHOTO_OPTIMIZE_MIME_TYPE,
        lastModified: Date.now()
    });
}

function buildPhotoOptimizeFailureMessage(sourceFile, bestFile) {
    const target = formatFileSize(PHOTO_UPLOAD_TARGET_BYTES);
    const bestSize = bestFile ? formatFileSize(bestFile.size) : formatFileSize(sourceFile.size);
    return `已尝试把「${sourceFile.name}」按原尺寸转成高质量 WebP，最小仍有 ${bestSize}，超过上传目标 ${target}。为了避免明显压坏画质，请换一张更小的原图或先裁剪后再上传。`;
}

async function transcodeAudioToMp3(file, onProgress) {
    if (!isMp3TranscodeCandidate(file)) {
        throw new Error(`${file.name} 超过 ${formatFileSize(AUDIO_UPLOAD_TARGET_BYTES)}，但当前文件类型不适合自动转 MP3。请上传 WAV/AIFF/音频文件，或填写音频外链。`);
    }
    if (file.size > AUDIO_TRANSCODE_MAX_SOURCE_BYTES) {
        throw new Error(`${file.name} 太大了（${formatFileSize(file.size)}）。当前浏览器端转码上限是 ${formatFileSize(AUDIO_TRANSCODE_MAX_SOURCE_BYTES)}，建议改用外链/云存储。`);
    }

    onProgress?.(0.04, `正在加载 MP3 编码器`);
    const lame = await ensureMp3Encoder();
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
        throw new Error('当前浏览器不支持音频解码，无法自动转 MP3。请使用最新版 Chrome，或填写音频外链。');
    }

    let audioContext;
    try {
        audioContext = new AudioContextCtor();
        onProgress?.(0.12, `正在读取${file.name}`);
        const arrayBuffer = await file.arrayBuffer();
        onProgress?.(0.22, '正在解码音频');
        const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const { buffer, sampleRate } = await prepareAudioBufferForMp3(decodedBuffer, ratio => {
            onProgress?.(0.24 + ratio * 0.16, `正在整理音频采样（${Math.round(ratio * 100)}%）`);
        });
        const bitrate = chooseMp3Bitrate(buffer.duration);
        const bitrateNote = bitrate < MP3_QUALITY_WARNING_BITRATE_KBPS
            ? `目标体积需要使用 ${bitrate}kbps；MP3 是有损格式，请发布后试听确认。`
            : `使用 ${bitrate}kbps MP3，优先保留听感质量。`;

        onProgress?.(0.42, bitrateNote);
        const mp3Blob = await encodeMp3Buffer(lame, buffer, sampleRate, bitrate, ratio => {
            onProgress?.(0.44 + ratio * 0.48, `正在转成 MP3（${Math.round(ratio * 100)}%）`);
        });
        let mp3File = makeMp3File(file, mp3Blob);

        if (mp3File.size > AUDIO_UPLOAD_TARGET_BYTES && bitrate > MP3_MIN_BITRATE_KBPS) {
            const retryBitrate = Math.max(MP3_MIN_BITRATE_KBPS, bitrate - 16);
            onProgress?.(0.44, `第一次 MP3 仍偏大，正在用 ${retryBitrate}kbps 重试`);
            const retryBlob = await encodeMp3Buffer(lame, buffer, sampleRate, retryBitrate, ratio => {
                onProgress?.(0.44 + ratio * 0.48, `正在重新转 MP3（${Math.round(ratio * 100)}%）`);
            });
            mp3File = makeMp3File(file, retryBlob);
        }

        if (mp3File.size > AUDIO_UPLOAD_TARGET_BYTES) {
            throw new Error(`已转成 MP3，但文件仍有 ${formatFileSize(mp3File.size)}，超过音频上传目标 ${formatFileSize(AUDIO_UPLOAD_TARGET_BYTES)}。为了避免明显压坏音质，请改用音频外链/云存储。`);
        }

        onProgress?.(0.96, `转码完成：${formatFileSize(file.size)} → ${formatFileSize(mp3File.size)}`);
        return mp3File;
    } catch (error) {
        throw new Error(error.message || '音频转 MP3 失败');
    } finally {
        if (audioContext && typeof audioContext.close === 'function') {
            audioContext.close().catch(() => {});
        }
    }
}

function shouldTranscodeAudioForUpload(file, uploadType) {
    return Boolean(state.online && isAudioUpload(uploadType) && file && file.size > AUDIO_UPLOAD_TARGET_BYTES);
}

function isMp3TranscodeCandidate(file) {
    const name = String(file && file.name || '').toLowerCase();
    const type = String(file && file.type || '').toLowerCase();
    return type.startsWith('audio/') || /\.(wav|wave|aif|aiff|flac|m4a|mp3|aac|ogg)$/i.test(name);
}

function ensureMp3Encoder() {
    if (window.lamejs && window.lamejs.Mp3Encoder) {
        return Promise.resolve(window.lamejs);
    }

    if (!mp3EncoderLoadPromise) {
        mp3EncoderLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = MP3_ENCODER_SCRIPT_URL;
            script.async = true;
            script.onload = () => {
                if (window.lamejs && window.lamejs.Mp3Encoder) {
                    resolve(window.lamejs);
                } else {
                    reject(new Error('MP3 编码器加载失败'));
                }
            };
            script.onerror = () => reject(new Error('MP3 编码器加载失败，请检查网络后重试'));
            document.head.appendChild(script);
        });
    }

    return mp3EncoderLoadPromise;
}

async function prepareAudioBufferForMp3(audioBuffer, onProgress) {
    const channels = Math.min(2, Math.max(1, audioBuffer.numberOfChannels || 1));
    const sampleRate = chooseMp3SampleRate(audioBuffer.sampleRate);
    const needsRender = audioBuffer.sampleRate !== sampleRate || audioBuffer.numberOfChannels !== channels;

    if (!needsRender) {
        onProgress?.(1);
        return { buffer: audioBuffer, sampleRate };
    }

    const OfflineContextCtor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineContextCtor) {
        onProgress?.(1);
        return { buffer: audioBuffer, sampleRate: audioBuffer.sampleRate };
    }

    const frameCount = Math.ceil(audioBuffer.duration * sampleRate);
    const offlineContext = new OfflineContextCtor(channels, frameCount, sampleRate);
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start(0);
    const rendered = await offlineContext.startRendering();
    onProgress?.(1);
    return { buffer: rendered, sampleRate };
}

function chooseMp3SampleRate(sampleRate) {
    if (sampleRate >= 48000) return 48000;
    if (sampleRate >= 44100) return 44100;
    if (sampleRate >= 32000) return 32000;
    if (sampleRate >= 22050) return 22050;
    return 44100;
}

function chooseMp3Bitrate(durationSeconds) {
    const duration = Math.max(Number(durationSeconds) || 0, 1);
    const maxKbpsForTarget = Math.floor((AUDIO_TRANSCODE_TARGET_BYTES * 8) / duration / 1000);
    const bitrate = Math.min(MP3_MAX_BITRATE_KBPS, maxKbpsForTarget);

    if (bitrate < MP3_MIN_BITRATE_KBPS) {
        const maxMinutes = Math.floor((AUDIO_TRANSCODE_TARGET_BYTES * 8) / (MP3_MIN_BITRATE_KBPS * 1000) / 60);
        throw new Error(`这首歌时长约 ${Math.ceil(duration / 60)} 分钟，若压到 ${formatFileSize(AUDIO_UPLOAD_TARGET_BYTES)} 内会明显牺牲音质。当前自动转码最低保留 ${MP3_MIN_BITRATE_KBPS}kbps，建议 ${maxMinutes} 分钟以上的歌曲使用外链/云存储。`);
    }

    return Math.max(MP3_MIN_BITRATE_KBPS, bitrate);
}

async function encodeMp3Buffer(lame, audioBuffer, sampleRate, bitrate, onProgress) {
    const channels = Math.min(2, Math.max(1, audioBuffer.numberOfChannels || 1));
    const encoder = new lame.Mp3Encoder(channels, sampleRate, bitrate);
    const left = audioBuffer.getChannelData(0);
    const right = channels > 1 ? audioBuffer.getChannelData(1) : null;
    const sampleBlockSize = 1152;
    const mp3Data = [];

    for (let offset = 0; offset < left.length; offset += sampleBlockSize) {
        const leftChunk = floatTo16BitPcm(left, offset, sampleBlockSize);
        const mp3Buffer = right
            ? encoder.encodeBuffer(leftChunk, floatTo16BitPcm(right, offset, sampleBlockSize))
            : encoder.encodeBuffer(leftChunk);

        if (mp3Buffer.length > 0) {
            mp3Data.push(mp3Buffer);
        }

        if (offset % (sampleBlockSize * 50) === 0) {
            onProgress?.(offset / left.length);
            await waitForBrowserFrame();
        }
    }

    const finalBuffer = encoder.flush();
    if (finalBuffer.length > 0) {
        mp3Data.push(finalBuffer);
    }
    onProgress?.(1);
    return new Blob(mp3Data, { type: 'audio/mpeg' });
}

function floatTo16BitPcm(channelData, offset, length) {
    const end = Math.min(offset + length, channelData.length);
    const result = new Int16Array(end - offset);

    for (let index = offset; index < end; index += 1) {
        const sample = Math.max(-1, Math.min(1, channelData[index] || 0));
        result[index - offset] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }

    return result;
}

function makeMp3File(sourceFile, mp3Blob) {
    const basename = String(sourceFile.name || 'audio').replace(/\.[^.]+$/, '') || 'audio';
    return new File([mp3Blob], `${basename}.mp3`, {
        type: 'audio/mpeg',
        lastModified: Date.now()
    });
}

function waitForBrowserFrame() {
    return new Promise(resolve => setTimeout(resolve, 0));
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
        { formId: 'lyric-form', field: 'coverFile', uploadType: 'lyricsCover' },
        { formId: 'lyric-form', field: 'audioFile', uploadType: 'lyricAudio' },
        { formId: 'music-form', field: 'coverFile', uploadType: 'musicCover' },
        { formId: 'music-form', field: 'audioFile', uploadType: 'musicAudio' }
    ].forEach(({ formId, field, uploadType }) => {
        const form = document.getElementById(formId);
        if (!form || !form.elements[field]) return;

        form.elements[field].addEventListener('change', event => {
            const input = event.target;
            const file = getSelectedInputFile(input);
            if (!file) {
                if (isCoverCropUpload(uploadType)) {
                    clearPreparedCoverFile(input);
                }
                if (formId === 'music-form' && field === 'audioFile') {
                    updateMusicAudioPreview();
                    renderMusicVersionOptions();
                }
                setFormMessage(form, '');
                return;
            }

            if (isCoverCropUpload(uploadType)) {
                handleCoverImageSelection(form, input, uploadType, file);
                return;
            }

            if (formId === 'music-form' && field === 'audioFile') {
                fillMusicTitleFromAudioFile(form, file);
                updateMusicAudioPreview();
                renderMusicVersionOptions();
            }

            if (shouldTranscodeAudioForUpload(file, uploadType)) {
                setFormMessage(
                    form,
                    `${UPLOAD_LABELS[uploadType]}已选择：${file.name}（${formatFileSize(file.size)}）。创建时会先在浏览器里转成 MP3，目标小于 ${formatFileSize(AUDIO_UPLOAD_TARGET_BYTES)}。MP3 是有损格式，发布后请试听确认。`,
                    'info'
                );
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

function appendPhotoBatchFiles(files) {
    const incoming = (files || []).filter(file => file && String(file.type || '').startsWith('image/'));
    if (incoming.length === 0) return 0;

    const seen = new Set(photoBatchItems.map(item => item.signature));
    let addedCount = 0;

    incoming.forEach(file => {
        const signature = getFileSignature(file);
        if (seen.has(signature)) return;

        seen.add(signature);
        photoBatchItems.push({
            signature,
            file,
            title: makeTitleFromFilename(file.name) || `图片 ${photoBatchItems.length + 1}`,
            description: '',
            previewUrl: URL.createObjectURL(file)
        });
        addedCount += 1;
    });

    if (photoBatchItems.length > 0) {
        photoBatchActiveIndex = Math.min(photoBatchActiveIndex, photoBatchItems.length - 1);
    }

    return addedCount;
}

function getSelectedPhotoInputFiles(input) {
    const selected = input && input.files ? Array.from(input.files) : [];
    if (selected.length > 0) return selected;

    const fallback = getSelectedInputFile(input);
    return fallback ? [fallback] : [];
}

function getPhotoBatchItems() {
    return photoBatchItems.filter(item => item && item.file);
}

function renderPhotoBatchEditor() {
    const form = $('#photo-form');
    const editor = $('#photo-batch-editor');
    if (!form || !editor) return;

    const items = getPhotoBatchItems();
    if (items.length === 0) {
        editor.classList.add('is-hidden');
        form.elements.title.value = '';
        form.elements.description.value = '';
        $('#photo-batch-tabs').innerHTML = '';
        $('#photo-batch-preview-image').removeAttribute('src');
        $('#photo-batch-preview-title').textContent = '未选择图片';
        $('#photo-batch-preview-detail').textContent = '';
        return;
    }

    photoBatchActiveIndex = Math.max(0, Math.min(photoBatchActiveIndex, items.length - 1));
    editor.classList.remove('is-hidden');
    $('#photo-batch-count').textContent = `${items.length} 张待创建`;
    renderPhotoBatchTabs();
    renderActivePhotoBatchItem();
    renderIcons();
}

function renderPhotoBatchTabs() {
    const container = $('#photo-batch-tabs');
    if (!container) return;

    container.innerHTML = getPhotoBatchItems().map((item, index) => `
        <div class="photo-batch-thumb ${index === photoBatchActiveIndex ? 'is-active' : ''}" role="button" tabindex="0" data-photo-batch-index="${index}">
            <img src="${escapeAttribute(item.previewUrl)}" alt="${escapeAttribute(item.title || item.file.name)}">
            <span>${index + 1}</span>
            <button class="photo-batch-remove" type="button" title="移除这张图片" aria-label="移除这张图片" data-photo-batch-remove="${index}">
                <i data-lucide="x"></i>
            </button>
        </div>
    `).join('');
}

function renderActivePhotoBatchItem() {
    const form = $('#photo-form');
    const item = getPhotoBatchItems()[photoBatchActiveIndex];
    if (!form || !item) return;

    $('#photo-batch-preview-image').src = item.previewUrl;
    $('#photo-batch-preview-title').textContent = item.file.name;
    const optimizeNote = shouldShowPhotoOptimizeNote(item.file)
        ? ` · 发布时自动优化到 ${formatFileSize(PHOTO_UPLOAD_TARGET_BYTES)} 内`
        : '';
    $('#photo-batch-preview-detail').textContent = `${photoBatchActiveIndex + 1} / ${photoBatchItems.length} · ${formatFileSize(item.file.size)}${optimizeNote}`;
    form.elements.title.value = item.title || '';
    form.elements.description.value = item.description || '';

    scrollActivePhotoBatchThumbIntoView();
}

function handlePhotoBatchTabClick(event) {
    const removeButton = event.target.closest('[data-photo-batch-remove]');
    if (removeButton) {
        removePhotoBatchItem(Number(removeButton.dataset.photoBatchRemove));
        return;
    }

    const thumb = event.target.closest('[data-photo-batch-index]');
    if (!thumb) return;

    setActivePhotoBatchIndex(Number(thumb.dataset.photoBatchIndex));
}

function handlePhotoBatchTabsWheel(event) {
    const tabs = event.currentTarget;
    if (!tabs || tabs.scrollWidth <= tabs.clientWidth) return;

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    if (!delta) return;

    event.preventDefault();
    tabs.scrollLeft += delta;
}

function handlePhotoBatchTabKeydown(event) {
    const thumb = event.target.closest('[data-photo-batch-index]');
    if (!thumb) return;

    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setActivePhotoBatchIndex(Number(thumb.dataset.photoBatchIndex));
        return;
    }

    if (event.key === 'ArrowRight') {
        event.preventDefault();
        setActivePhotoBatchIndex(Math.min(photoBatchActiveIndex + 1, photoBatchItems.length - 1));
        return;
    }

    if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setActivePhotoBatchIndex(Math.max(photoBatchActiveIndex - 1, 0));
    }
}

function setActivePhotoBatchIndex(index) {
    if (!Number.isInteger(index) || index < 0 || index >= photoBatchItems.length) return;

    syncActivePhotoBatchFromForm();
    photoBatchActiveIndex = index;
    renderPhotoBatchEditor();
    savePhotoBatchDraftSoon();
}

function syncActivePhotoBatchField(event) {
    const item = photoBatchItems[photoBatchActiveIndex];
    if (!item || !event.target) return;

    if (event.target.name === 'title') {
        item.title = event.target.value;
        renderPhotoBatchTabs();
        scrollActivePhotoBatchThumbIntoView();
        renderIcons();
        savePhotoBatchDraftSoon();
        return;
    }

    if (event.target.name === 'description') {
        item.description = event.target.value;
        savePhotoBatchDraftSoon();
    }
}

function syncActivePhotoBatchFromForm() {
    const form = $('#photo-form');
    const item = photoBatchItems[photoBatchActiveIndex];
    if (!form || !item) return;

    item.title = form.elements.title.value;
    item.description = form.elements.description.value;
}

function removePhotoBatchItem(index) {
    if (!Number.isInteger(index) || index < 0 || index >= photoBatchItems.length) return;

    const [removed] = photoBatchItems.splice(index, 1);
    if (removed && removed.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
    }
    if (photoBatchActiveIndex >= photoBatchItems.length) {
        photoBatchActiveIndex = Math.max(0, photoBatchItems.length - 1);
    }
    renderPhotoBatchEditor();
    savePhotoBatchDraftSoon();
}

function clearPhotoBatch() {
    resetPhotoBatchItems();
    renderPhotoBatchEditor();
    setFormMessage($('#photo-form'), '');
    deletePhotoBatchDraft();
}

function resetPhotoBatchItems() {
    photoBatchItems.forEach(item => {
        if (item && item.previewUrl) {
            URL.revokeObjectURL(item.previewUrl);
        }
    });
    photoBatchItems = [];
    photoBatchActiveIndex = 0;
}

function shouldShowPhotoOptimizeNote(file) {
    return state.online
        && isOptimizablePhotoUpload(file, 'photos')
        && file.size > PHOTO_UPLOAD_TARGET_BYTES;
}

function savePhotoBatchDraftSoon() {
    if (photoBatchDraftRestoring || !canUsePhotoBatchDraftStorage()) return;

    window.clearTimeout(photoBatchDraftSaveTimer);
    photoBatchDraftSaveTimer = window.setTimeout(() => {
        photoBatchDraftSaveTimer = null;
        savePhotoBatchDraft().catch(() => {
            // Draft persistence is best-effort and should never block resource creation.
        });
    }, PHOTO_BATCH_DRAFT_SAVE_DELAY_MS);
}

async function savePhotoBatchDraft() {
    if (photoBatchDraftRestoring || !canUsePhotoBatchDraftStorage()) return;

    const items = getPhotoBatchItems();
    if (items.length === 0) {
        await deletePhotoBatchDraft();
        return;
    }

    syncActivePhotoBatchFromForm();
    await putPhotoBatchDraftRecord({
        id: PHOTO_BATCH_DRAFT_KEY,
        savedAt: Date.now(),
        activeIndex: photoBatchActiveIndex,
        fields: getPhotoBatchDraftFormFields(),
        items: items.map(item => ({
            signature: item.signature || getFileSignature(item.file),
            title: item.title || '',
            description: item.description || '',
            fileName: item.file.name,
            fileType: item.file.type,
            fileSize: item.file.size,
            lastModified: item.file.lastModified || Date.now(),
            file: item.file
        }))
    });
}

async function restorePhotoBatchDraft() {
    if (!canUsePhotoBatchDraftStorage() || getPhotoBatchItems().length > 0) return;

    try {
        const record = await readPhotoBatchDraftRecord();
        const entries = Array.isArray(record && record.items) ? record.items : [];
        if (entries.length === 0) return;

        photoBatchDraftRestoring = true;
        resetPhotoBatchItems();
        photoBatchItems = entries
            .map((entry, index) => {
                const file = restorePhotoBatchDraftFile(entry);
                if (!file) return null;

                return {
                    signature: entry.signature || getFileSignature(file),
                    file,
                    title: entry.title || makeTitleFromFilename(file.name) || `图片 ${index + 1}`,
                    description: entry.description || '',
                    previewUrl: URL.createObjectURL(file)
                };
            })
            .filter(Boolean);

        if (photoBatchItems.length === 0) {
            await deletePhotoBatchDraft();
            return;
        }

        photoBatchActiveIndex = Math.max(
            0,
            Math.min(Number(record.activeIndex) || 0, photoBatchItems.length - 1)
        );
        restorePhotoBatchDraftFormFields(record.fields);
        renderPhotoBatchEditor();
        setFormMessage($('#photo-form'), `已恢复 ${photoBatchItems.length} 张未创建的图片草稿，可以继续编辑或清空。`, 'info');
        showToast(`已恢复 ${photoBatchItems.length} 张图片草稿`);
    } catch (error) {
        // A broken local draft should not stop the admin from opening.
    } finally {
        photoBatchDraftRestoring = false;
    }
}

function restorePhotoBatchDraftFile(entry) {
    const storedFile = entry && entry.file;
    if (storedFile instanceof File) return storedFile;
    if (storedFile instanceof Blob) {
        return new File([storedFile], entry.fileName || `photo-${Date.now()}.jpg`, {
            type: entry.fileType || storedFile.type || 'image/jpeg',
            lastModified: entry.lastModified || Date.now()
        });
    }

    return null;
}

function getPhotoBatchDraftFormFields() {
    const form = $('#photo-form');
    if (!form) return {};

    return {
        category: form.elements.category.value,
        date: form.elements.date.value,
        showOnHome: form.elements.showOnHome.checked
    };
}

function restorePhotoBatchDraftFormFields(fields) {
    const form = $('#photo-form');
    if (!form || !fields) return;

    form.elements.category.value = fields.category || form.elements.category.value || 'Photography';
    form.elements.date.value = fields.date || form.elements.date.value;
    form.elements.showOnHome.checked = Boolean(fields.showOnHome);
}

function deletePhotoBatchDraft() {
    cancelPhotoBatchDraftSave();
    if (!canUsePhotoBatchDraftStorage()) return Promise.resolve();

    return deletePhotoBatchDraftRecord().catch(() => {
        // Ignore draft cleanup failures.
    });
}

function cancelPhotoBatchDraftSave() {
    if (!photoBatchDraftSaveTimer) return;
    window.clearTimeout(photoBatchDraftSaveTimer);
    photoBatchDraftSaveTimer = null;
}

function canUsePhotoBatchDraftStorage() {
    return typeof window !== 'undefined' && Boolean(window.indexedDB);
}

function openPhotoBatchDraftDb() {
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(PHOTO_BATCH_DRAFT_DB, PHOTO_BATCH_DRAFT_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(PHOTO_BATCH_DRAFT_STORE)) {
                db.createObjectStore(PHOTO_BATCH_DRAFT_STORE, { keyPath: 'id' });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('无法打开图片草稿缓存'));
        request.onblocked = () => reject(new Error('图片草稿缓存被浏览器占用'));
    });
}

function readPhotoBatchDraftRecord() {
    return runPhotoBatchDraftRequest('readonly', store => store.get(PHOTO_BATCH_DRAFT_KEY));
}

function putPhotoBatchDraftRecord(record) {
    return runPhotoBatchDraftRequest('readwrite', store => store.put(record));
}

function deletePhotoBatchDraftRecord() {
    return runPhotoBatchDraftRequest('readwrite', store => store.delete(PHOTO_BATCH_DRAFT_KEY));
}

async function runPhotoBatchDraftRequest(mode, createRequest) {
    const db = await openPhotoBatchDraftDb();

    return new Promise((resolve, reject) => {
        let settled = false;
        let result;

        function finish(callback, value) {
            if (settled) return;
            settled = true;
            db.close();
            callback(value);
        }

        try {
            const transaction = db.transaction(PHOTO_BATCH_DRAFT_STORE, mode);
            const request = createRequest(transaction.objectStore(PHOTO_BATCH_DRAFT_STORE));

            request.onsuccess = () => {
                result = request.result;
            };
            request.onerror = () => {
                finish(reject, request.error || new Error('图片草稿缓存读写失败'));
            };
            transaction.oncomplete = () => {
                finish(resolve, result);
            };
            transaction.onerror = () => {
                finish(reject, transaction.error || request.error || new Error('图片草稿缓存读写失败'));
            };
            transaction.onabort = () => {
                finish(reject, transaction.error || request.error || new Error('图片草稿缓存写入被取消'));
            };
        } catch (error) {
            finish(reject, error);
        }
    });
}

function scrollActivePhotoBatchThumbIntoView() {
    const activeThumb = $('#photo-batch-tabs')?.querySelector('.photo-batch-thumb.is-active');
    if (activeThumb && typeof activeThumb.scrollIntoView === 'function') {
        activeThumb.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
}

async function pasteImageFromClipboard(input) {
    if (!input) return;

    if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
        showToast('当前浏览器不支持按钮读取剪贴板图片，可以在当前表单按 Cmd/Ctrl+V 粘贴图片');
        return;
    }

    try {
        const items = await navigator.clipboard.read();
        const file = await getImageFileFromClipboardItems(items);
        if (!file) {
            throw new Error('剪贴板里没有可粘贴的图片');
        }
        setClipboardImageFile(input, file);
    } catch (error) {
        const message = error && error.name === 'NotAllowedError'
            ? '浏览器没有授权读取剪贴板，请在当前表单按 Cmd/Ctrl+V 粘贴图片'
            : error.message || '读取剪贴板图片失败';
        showToast(message);
    }
}

async function getImageFileFromClipboardItems(items) {
    for (const item of items || []) {
        const imageType = (item.types || []).find(type => String(type).startsWith('image/'));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        return makeClipboardImageFile(blob, imageType);
    }

    return null;
}

function handleGlobalImagePaste(event) {
    const file = getImageFileFromPasteEvent(event);
    if (!file) return;

    const input = getActiveImagePasteInput();
    if (!input) return;

    event.preventDefault();
    setClipboardImageFile(input, file);
}

function getImageFileFromPasteEvent(event) {
    const items = event.clipboardData && event.clipboardData.items
        ? Array.from(event.clipboardData.items)
        : [];

    for (const item of items) {
        if (!String(item.type || '').startsWith('image/') || typeof item.getAsFile !== 'function') {
            continue;
        }
        const file = item.getAsFile();
        if (file) {
            return makeClipboardImageFile(file, file.type);
        }
    }

    return null;
}

function getActiveImagePasteInput() {
    const app = $('#admin-app');
    if (!app || app.classList.contains('is-hidden')) return null;

    const cropModal = $('#image-crop-modal');
    if (cropModal && !cropModal.classList.contains('is-hidden')) return null;

    const form = document.querySelector('.resource-form.is-active');
    if (!form) return null;
    if (form.id === 'photo-form') return form.elements.file;
    if (form.id === 'lyric-form') return form.elements.coverFile;
    if (form.id === 'music-form') return form.elements.coverFile;
    return null;
}

function setClipboardImageFile(input, file) {
    setSelectedInputFile(input, file);
    const uploadType = getImageInputUploadType(input);
    const label = UPLOAD_LABELS[uploadType] || '图片';
    showToast(`${label}已从剪贴板粘贴`);
}

function getImageInputUploadType(input) {
    const form = input && (input.form || (typeof input.closest === 'function' ? input.closest('form') : null));
    if (!form) return 'photos';
    if (form.id === 'photo-form') return 'photos';
    if (form.id === 'lyric-form') return 'lyricsCover';
    if (form.id === 'music-form') return 'musicCover';
    return 'photos';
}

function makeClipboardImageFile(blob, type) {
    const contentType = type || blob.type || 'image/png';
    const sourceName = String(blob.name || '');
    const extension = getClipboardImageExtension(sourceName, contentType);
    const name = sourceName && /\.[a-zA-Z0-9]+$/.test(sourceName)
        ? sourceName
        : `clipboard-image-${Date.now()}${extension}`;

    return new File([blob], name, {
        type: contentType,
        lastModified: Date.now()
    });
}

function getClipboardImageExtension(filename, type) {
    const existing = String(filename || '').match(/\.[a-zA-Z0-9]+$/);
    if (existing) return existing[0].toLowerCase();
    if (type === 'image/jpeg') return '.jpg';
    if (type === 'image/webp') return '.webp';
    if (type === 'image/gif') return '.gif';
    return '.png';
}

async function selectAudioFileWithRememberedDirectory(input) {
    if (!input) return;

    if (!window.showOpenFilePicker) {
        input.click();
        showToast('当前浏览器不支持目录记忆，已打开普通文件选择器');
        return;
    }

    try {
        const [handle] = await window.showOpenFilePicker({
            id: AUDIO_PICKER_ID,
            multiple: false,
            types: [{
                description: '音频文件',
                accept: {
                    'audio/*': ['.mp3', '.wav', '.wave', '.m4a', '.aac', '.flac', '.ogg', '.aif', '.aiff']
                }
            }]
        });
        const file = await handle.getFile();
        setSelectedInputFile(input, file);
        showToast(`已选择音频：${file.name}`);
    } catch (error) {
        if (error && error.name === 'AbortError') return;
        input.click();
        showToast('目录记忆选择器不可用，已打开普通文件选择器');
    }
}

function setSelectedInputFile(input, file) {
    clearSelectedInputFile(input);

    try {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        input.files = dataTransfer.files;
    } catch (error) {
        pickerSelectedFiles.set(input, file);
    }

    input.dispatchEvent(new Event('change', { bubbles: true }));
}

function getSelectedInputFile(input) {
    if (!input) return null;
    return (input.files && input.files[0]) || pickerSelectedFiles.get(input) || null;
}

function getSelectedInputFiles(input) {
    if (!input) return [];
    const queued = multiSelectedFiles.get(input);
    if (queued) return [...queued];

    const selected = input.files ? Array.from(input.files) : [];
    const fallback = pickerSelectedFiles.get(input);
    if (fallback && selected.length === 0) return [fallback];
    return selected;
}

function appendSelectedInputFiles(input) {
    if (!input || !input.files || input.files.length === 0) return 0;

    const current = multiSelectedFiles.get(input) || [];
    const next = [...current];
    const seen = new Set(current.map(getFileSignature));
    let addedCount = 0;

    Array.from(input.files).forEach(file => {
        const signature = getFileSignature(file);
        if (seen.has(signature)) return;

        seen.add(signature);
        next.push(file);
        addedCount += 1;
    });

    multiSelectedFiles.set(input, next);
    input.value = '';
    return addedCount;
}

function removeSelectedInputFileAt(input, index) {
    const current = getSelectedInputFiles(input);
    if (!input || !current.length || !Number.isInteger(index) || index < 0 || index >= current.length) return;

    const next = current.filter((_, fileIndex) => fileIndex !== index);
    if (next.length > 0) {
        multiSelectedFiles.set(input, next);
    } else {
        multiSelectedFiles.delete(input);
    }
    input.value = '';
}

function getFileSignature(file) {
    return `${file.name}:${file.size}:${file.lastModified || 0}`;
}

function selectVersionOptionFromRow(event, radioName) {
    if (event.target.closest('button, input, a')) return false;

    const row = event.target.closest('.version-upload-item');
    const radio = row && row.querySelector(`input[name="${radioName}"]`);
    if (!radio || radio.checked) return false;

    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
}

function clearSelectedInputFile(input) {
    if (input) {
        pickerSelectedFiles.delete(input);
        multiSelectedFiles.delete(input);
        input.value = '';
    }
}

function updateMusicAudioPreview() {
    const form = $('#music-form');
    if (!form) return;

    const preview = $('#music-audio-preview');
    const player = $('#music-audio-preview-player');
    const label = $('#music-audio-preview-name');
    const file = getSelectedInputFile(form.elements.audioFile);
    const audioUrl = normalizeAssetInput(form.elements.audioUrl.value);

    if (musicAudioPreviewUrl) {
        URL.revokeObjectURL(musicAudioPreviewUrl);
        musicAudioPreviewUrl = '';
    }

    if (audioUrl) {
        player.src = resolveAssetUrl(audioUrl);
        label.textContent = audioUrl;
        preview.classList.remove('is-hidden');
        return;
    }

    if (file) {
        musicAudioPreviewUrl = URL.createObjectURL(file);
        player.src = musicAudioPreviewUrl;
        label.textContent = `${file.name} · ${formatFileSize(file.size)}`;
        preview.classList.remove('is-hidden');
        return;
    }

    clearMusicAudioPreview();
}

function clearMusicAudioPreview() {
    const preview = $('#music-audio-preview');
    const player = $('#music-audio-preview-player');
    const label = $('#music-audio-preview-name');
    if (musicAudioPreviewUrl) {
        URL.revokeObjectURL(musicAudioPreviewUrl);
        musicAudioPreviewUrl = '';
    }
    if (player) {
        player.pause();
        player.removeAttribute('src');
        player.load();
    }
    if (label) {
        label.textContent = '未选择音频';
    }
    if (preview) {
        preview.classList.add('is-hidden');
    }
}

function getMusicVersionCandidates() {
    const form = $('#music-form');
    if (!form) return [];

    const candidates = [];
    const audioUrl = normalizeAssetInput(form.elements.audioUrl.value);
    const audioFile = getSelectedInputFile(form.elements.audioFile);
    const versionFiles = getSelectedInputFiles(form.elements.versionAudioFiles);

    if (audioUrl) {
        candidates.push({
            source: 'primary-url',
            label: '主音频外链 / 已上传路径',
            detail: audioUrl,
            file: null
        });
    } else if (audioFile) {
        candidates.push({
            source: 'primary-file',
            label: '主音频文件',
            detail: `${audioFile.name} · ${formatFileSize(audioFile.size)}`,
            file: audioFile
        });
    }

    versionFiles.forEach((file, index) => {
        candidates.push({
            source: `extra-file-${index}`,
            label: `追加版本 ${index + 1}`,
            detail: `${file.name} · ${formatFileSize(file.size)}`,
            file,
            fileIndex: index,
            canRemove: true
        });
    });

    return candidates;
}

function renderMusicVersionOptions() {
    const container = $('#music-version-options');
    if (!container) return;

    const existingValue = container.querySelector('input[name="defaultVersionSource"]:checked')?.value || '';
    const candidates = getMusicVersionCandidates();

    if (candidates.length === 0) {
        container.innerHTML = '';
        return;
    }

    const selectedValue = candidates.some(item => item.source === existingValue)
        ? existingValue
        : candidates[0].source;
    const orderedCandidates = orderMusicVersionCandidates(candidates, selectedValue);
    const positionBySource = new Map(orderedCandidates.map((candidate, index) => [candidate.source, index + 1]));

    container.innerHTML = candidates.map((candidate, index) => `
        <div class="version-upload-item">
            <input type="radio" name="defaultVersionSource" value="${escapeAttribute(candidate.source)}" ${candidate.source === selectedValue ? 'checked' : ''}>
            <span>
                <strong>${escapeHtml(candidate.source === selectedValue ? `版本1（默认推荐） · ${candidate.label}` : `版本${positionBySource.get(candidate.source) || index + 1} · ${candidate.label}`)}</strong>
                ${escapeHtml(candidate.detail)}
            </span>
            ${candidate.canRemove ? `
                <button class="version-upload-remove" type="button" title="移除这个版本" aria-label="移除这个版本" data-version-remove="${Number(candidate.fileIndex)}">
                    <i data-lucide="x"></i>
                </button>
            ` : ''}
        </div>
    `).join('');
    renderIcons();
}

function buildMusicVersions(candidates, selectedSource) {
    const ordered = orderMusicVersionCandidates(
        candidates.filter(candidate => normalizeAssetInput(candidate && candidate.url)),
        selectedSource
    );
    return ordered.map((candidate, index) => ({
        label: `版本${index + 1}`,
        url: normalizeAssetInput(candidate.url),
        ...(index === 0 ? { isDefault: true } : {})
    }));
}

function orderMusicVersionCandidates(candidates, selectedSource) {
    const validCandidates = dedupeMusicVersionCandidates(candidates, selectedSource);
    if (validCandidates.length === 0) return [];

    const defaultIndex = validCandidates.findIndex(candidate => candidate.source === selectedSource);
    if (defaultIndex <= 0) return validCandidates;

    return [
        validCandidates[defaultIndex],
        ...validCandidates.filter((_, index) => index !== defaultIndex)
    ];
}

function dedupeMusicVersionCandidates(candidates, selectedSource) {
    const result = [];
    const indexByKey = new Map();

    candidates.forEach(candidate => {
        const url = normalizeAssetInput(candidate && candidate.url);
        const source = String(candidate && candidate.source || '');
        if (!url && !source) return;

        const key = url || `source:${source}`;
        const item = { ...candidate, url };
        const existingIndex = indexByKey.get(key);
        if (existingIndex === undefined) {
            indexByKey.set(key, result.length);
            result.push(item);
            return;
        }

        if (candidate.source === selectedSource) {
            result[existingIndex] = item;
        }
    });

    return result;
}

function bindImageCropperModal() {
    const modal = $('#image-crop-modal');
    if (!modal) return;

    $('#image-crop-cancel-button').addEventListener('click', () => closeImageCropper(null));
    $('#image-crop-close-button').addEventListener('click', () => closeImageCropper(null));
    $('#image-crop-reset-button').addEventListener('click', resetImageCropperView);
    $('#image-crop-apply-button').addEventListener('click', applyImageCropper);
    $('#image-crop-zoom').addEventListener('input', event => {
        if (!imageCropperState) return;
        imageCropperState.zoom = Number(event.target.value) || 1;
        clampImageCropperOffset();
        renderImageCropper();
    });

    modal.addEventListener('click', event => {
        if (event.target.id === 'image-crop-modal') {
            closeImageCropper(null);
        }
    });

    const stage = $('#image-crop-stage');
    stage.addEventListener('pointerdown', startImageCropperDrag);
    stage.addEventListener('pointermove', moveImageCropperDrag);
    stage.addEventListener('pointerup', endImageCropperDrag);
    stage.addEventListener('pointercancel', endImageCropperDrag);

    window.addEventListener('resize', () => {
        if (!imageCropperState) return;
        resetImageCropperView();
    });
}

async function handleCoverImageSelection(form, input, uploadType, file) {
    clearPreparedCoverFile(input);
    setFormMessage(form, '正在读取封面尺寸...', 'info');

    try {
        const result = await openImageCropper(file, uploadType);
        if (!result) {
            input.value = '';
            clearSelectedInputFile(input);
            setFormMessage(form, '已取消封面裁剪', 'info');
            return;
        }

        preparedCoverFiles.set(input, result);
        setFormMessage(
            form,
            `${UPLOAD_LABELS[uploadType]}已裁剪为 ${result.width} × ${result.height}，原图 ${result.originalWidth} × ${result.originalHeight}，创建时会上传裁剪后的图片。`,
            'info'
        );
    } catch (error) {
        input.value = '';
        clearPreparedCoverFile(input);
        clearSelectedInputFile(input);
        setFormMessage(form, error.message || '封面裁剪失败，请重新选择图片', 'error');
    }
}

function clearPreparedCoverFile(input) {
    preparedCoverFiles.delete(input);
}

function getPreparedUploadFile(input) {
    const prepared = preparedCoverFiles.get(input);
    return prepared && prepared.file ? prepared.file : null;
}

function isCoverCropUpload(uploadType) {
    return COVER_CROP_UPLOAD_TYPES.has(uploadType);
}

async function openImageCropper(file, uploadType) {
    const sourceUrl = URL.createObjectURL(file);

    try {
        const sourceDimensions = await loadImageDimensions(sourceUrl);
        const target = await getCoverCropTarget(uploadType, sourceDimensions);

        return await new Promise(resolve => {
            imageCropperState = {
                file,
                uploadType,
                sourceUrl,
                sourceWidth: sourceDimensions.width,
                sourceHeight: sourceDimensions.height,
                targetWidth: target.width,
                targetHeight: target.height,
                targetSource: target.source,
                zoom: 1,
                offsetX: 0,
                offsetY: 0,
                drag: null,
                resolve
            };

            const modal = $('#image-crop-modal');
            const preview = $('#image-crop-preview');
            const stage = $('#image-crop-stage');
            const zoom = $('#image-crop-zoom');
            const aspectText = formatAspectRatio(target.width, target.height);
            const targetSourceText = target.source === 'existing'
                ? '比例来自现有线上封面的真实尺寸'
                : '暂未读到现有封面，比例来自本次上传图片';

            preview.src = sourceUrl;
            stage.style.setProperty('--crop-aspect', `${target.width} / ${target.height}`);
            zoom.value = '1';
            $('#image-crop-subtitle').textContent = `${UPLOAD_LABELS[uploadType]} · ${targetSourceText}`;
            $('#image-crop-meta').innerHTML = `
                <span>原图：${sourceDimensions.width} × ${sourceDimensions.height}</span>
                <span>目标：${target.width} × ${target.height}</span>
                <span>比例：${aspectText}</span>
            `;
            modal.classList.remove('is-hidden');
            modal.setAttribute('aria-hidden', 'false');
            requestAnimationFrame(resetImageCropperView);
        });
    } catch (error) {
        URL.revokeObjectURL(sourceUrl);
        throw error;
    }
}

function closeImageCropper(result) {
    if (!imageCropperState) return;
    const stateToClose = imageCropperState;
    imageCropperState = null;

    $('#image-crop-modal').classList.add('is-hidden');
    $('#image-crop-modal').setAttribute('aria-hidden', 'true');
    $('#image-crop-preview').removeAttribute('src');
    URL.revokeObjectURL(stateToClose.sourceUrl);
    stateToClose.resolve(result);
}

async function getCoverCropTarget(uploadType, fallbackDimensions) {
    if (coverCropTargetCache[uploadType]) {
        return coverCropTargetCache[uploadType];
    }

    const source = uploadType === 'musicCover' ? 'music' : 'lyrics';
    const candidates = getVisibleSourceItems(source)
        .map(item => getItemImage(source, item))
        .filter(Boolean)
        .slice(0, 12);

    for (const imagePath of candidates) {
        try {
            const dimensions = await loadImageDimensions(resolveAssetUrl(imagePath));
            const target = {
                width: dimensions.width,
                height: dimensions.height,
                source: 'existing'
            };
            coverCropTargetCache[uploadType] = target;
            return target;
        } catch (error) {
            // Try the next existing image. Broken images should not block uploads.
        }
    }

    const fallback = {
        width: fallbackDimensions.width,
        height: fallbackDimensions.height,
        source: 'uploaded'
    };
    coverCropTargetCache[uploadType] = fallback;
    return fallback;
}

function loadImageDimensions(src) {
    return loadImageElement(src).then(image => ({
        width: image.naturalWidth,
        height: image.naturalHeight
    }));
}

function loadImageElement(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            if (!image.naturalWidth || !image.naturalHeight) {
                reject(new Error('无法读取图片尺寸'));
                return;
            }
            resolve(image);
        };
        image.onerror = () => reject(new Error('图片读取失败，请换一张图片试试'));
        image.src = src;
    });
}

function resetImageCropperView() {
    if (!imageCropperState) return;
    const { width, height } = getImageCropperStageSize();
    const baseScale = getImageCropperBaseScale();
    const renderedWidth = imageCropperState.sourceWidth * baseScale;
    const renderedHeight = imageCropperState.sourceHeight * baseScale;
    imageCropperState.zoom = 1;
    imageCropperState.offsetX = (width - renderedWidth) / 2;
    imageCropperState.offsetY = (height - renderedHeight) / 2;
    $('#image-crop-zoom').value = '1';
    clampImageCropperOffset();
    renderImageCropper();
}

function startImageCropperDrag(event) {
    if (!imageCropperState) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    imageCropperState.drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: imageCropperState.offsetX,
        offsetY: imageCropperState.offsetY
    };
}

function moveImageCropperDrag(event) {
    if (!imageCropperState || !imageCropperState.drag) return;
    const drag = imageCropperState.drag;
    imageCropperState.offsetX = drag.offsetX + event.clientX - drag.startX;
    imageCropperState.offsetY = drag.offsetY + event.clientY - drag.startY;
    clampImageCropperOffset();
    renderImageCropper();
}

function endImageCropperDrag(event) {
    if (!imageCropperState || !imageCropperState.drag) return;
    if (event.currentTarget.hasPointerCapture(imageCropperState.drag.pointerId)) {
        event.currentTarget.releasePointerCapture(imageCropperState.drag.pointerId);
    }
    imageCropperState.drag = null;
}

function renderImageCropper() {
    if (!imageCropperState) return;
    const scale = getImageCropperScale();
    const preview = $('#image-crop-preview');
    preview.style.width = `${imageCropperState.sourceWidth * scale}px`;
    preview.style.height = `${imageCropperState.sourceHeight * scale}px`;
    preview.style.transform = `translate(${imageCropperState.offsetX}px, ${imageCropperState.offsetY}px)`;
}

function clampImageCropperOffset() {
    if (!imageCropperState) return;
    const { width, height } = getImageCropperStageSize();
    const scale = getImageCropperScale();
    const renderedWidth = imageCropperState.sourceWidth * scale;
    const renderedHeight = imageCropperState.sourceHeight * scale;

    imageCropperState.offsetX = clampOffset(imageCropperState.offsetX, width, renderedWidth);
    imageCropperState.offsetY = clampOffset(imageCropperState.offsetY, height, renderedHeight);
}

function clampOffset(value, stageSize, renderedSize) {
    if (renderedSize <= stageSize) return (stageSize - renderedSize) / 2;
    return Math.min(0, Math.max(stageSize - renderedSize, value));
}

function getImageCropperScale() {
    return getImageCropperBaseScale() * Math.max(1, Number(imageCropperState.zoom) || 1);
}

function getImageCropperBaseScale() {
    const { width, height } = getImageCropperStageSize();
    return Math.max(
        width / imageCropperState.sourceWidth,
        height / imageCropperState.sourceHeight
    );
}

function getImageCropperStageSize() {
    const stage = $('#image-crop-stage');
    return {
        width: stage.clientWidth || 1,
        height: stage.clientHeight || 1
    };
}

async function applyImageCropper() {
    if (!imageCropperState) return;

    try {
        const result = await createCroppedImageFile();
        closeImageCropper(result);
    } catch (error) {
        showToast(error.message || '裁剪失败，请重新选择图片');
    }
}

async function createCroppedImageFile() {
    const cropper = imageCropperState;
    const { width: stageWidth, height: stageHeight } = getImageCropperStageSize();
    const scale = getImageCropperScale();
    const sourceX = Math.max(0, -cropper.offsetX / scale);
    const sourceY = Math.max(0, -cropper.offsetY / scale);
    const sourceWidth = Math.min(cropper.sourceWidth - sourceX, stageWidth / scale);
    const sourceHeight = Math.min(cropper.sourceHeight - sourceY, stageHeight / scale);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const preview = $('#image-crop-preview');

    canvas.width = cropper.targetWidth;
    canvas.height = cropper.targetHeight;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
        preview,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        cropper.targetWidth,
        cropper.targetHeight
    );

    const file = await canvasToCoverFile(canvas, cropper.file);
    return {
        file,
        width: cropper.targetWidth,
        height: cropper.targetHeight,
        originalWidth: cropper.sourceWidth,
        originalHeight: cropper.sourceHeight
    };
}

async function canvasToCoverFile(canvas, sourceFile) {
    const basename = String(sourceFile.name || 'cover').replace(/\.[^.]+$/, '') || 'cover';
    let quality = 0.92;
    let blob = await canvasToBlob(canvas, 'image/jpeg', quality);

    while (blob.size > ONLINE_UPLOAD_LIMIT_BYTES && quality > 0.72) {
        quality -= 0.08;
        blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    }

    if (blob.size > ONLINE_UPLOAD_LIMIT_BYTES) {
        throw new Error(`裁剪后的封面仍超过 ${formatFileSize(ONLINE_UPLOAD_LIMIT_BYTES)}，请换一张更小的图片`);
    }

    return new File([blob], `${basename}-cover.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now()
    });
}

function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (!blob) {
                reject(new Error('图片导出失败'));
                return;
            }
            resolve(blob);
        }, type, quality);
    });
}

function formatAspectRatio(width, height) {
    const divisor = greatestCommonDivisor(width, height);
    return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

function greatestCommonDivisor(a, b) {
    let left = Math.abs(Math.round(a));
    let right = Math.abs(Math.round(b));
    while (right) {
        const next = left % right;
        left = right;
        right = next;
    }
    return left || 1;
}

function fillMusicTitleFromAudioFile(form, file) {
    const titleInput = form.elements.title;
    const title = makeTitleFromFilename(file.name);
    const currentTitle = titleInput.value.trim();
    const previousAutoTitle = titleInput.dataset.autoTitleValue || '';

    if (!title || (currentTitle && currentTitle !== previousAutoTitle)) {
        return;
    }

    titleInput.value = title;
    titleInput.dataset.autoTitleValue = title;
}

function makeTitleFromFilename(filename) {
    const withoutExtension = String(filename || '').replace(/\.[^.]+$/, '');
    const decoded = decodeFilenameSafely(withoutExtension);
    return decoded.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeFilenameSafely(value) {
    try {
        return decodeURIComponent(value);
    } catch (error) {
        return value;
    }
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
    const safeLimit = getUploadSafeLimitBytes(uploadType);
    if (!file || !state.online || file.size <= safeLimit) {
        return '';
    }

    const label = UPLOAD_LABELS[uploadType] || '上传文件';
    if (isAudioUpload(uploadType)) {
        if (!isMp3TranscodeCandidate(file)) {
            return `${label}「${file.name}」大小为 ${formatFileSize(file.size)}，超过音频上传目标 ${formatFileSize(safeLimit)}。当前文件类型无法自动转 MP3，请上传 WAV/AIFF/常见音频文件，或填写音频外链。`;
        }
        if (file.size > AUDIO_TRANSCODE_MAX_SOURCE_BYTES) {
            return `${label}「${file.name}」大小为 ${formatFileSize(file.size)}，超过浏览器端转码上限 ${formatFileSize(AUDIO_TRANSCODE_MAX_SOURCE_BYTES)}。请改用音频外链/云存储。`;
        }
        return '';
    }

    if (shouldOptimizePhotoForUpload(file, uploadType)) {
        return '';
    }

    const nextStep = isAudioUpload(uploadType)
        ? '请先压缩成更小的 mp3/m4a，或填写音频外链/已上传路径后再创建。'
        : isPhotoUpload(uploadType)
            ? '当前文件类型无法自动转 WebP，请换成 JPG/PNG/WebP/AVIF 等普通图片后再上传。'
            : '请先压缩后再上传。';

    return `${label}「${file.name}」大小为 ${formatFileSize(file.size)}，超过线上上传安全上限 ${formatFileSize(safeLimit)}。${nextStep}`;
}

function buildUploadErrorMessage(response, data, file, uploadType) {
    if (response.status === 413) {
        const label = UPLOAD_LABELS[uploadType] || '上传文件';
        if (isPhotoUpload(uploadType)) {
            return `${label}「${file.name}」上传被线上服务拒绝，当前发送文件大小 ${formatFileSize(file.size)}。后台会自动把大图转成 WebP；如果仍失败，请换一张更小的原图，或稍后改用云存储方案。`;
        }
        return `${label}「${file.name}」上传被线上服务拒绝，文件大小 ${formatFileSize(file.size)}。请压缩到 ${formatFileSize(getUploadSafeLimitBytes(uploadType))} 以内，或改用外链/云存储方案。`;
    }

    return data.error || `上传失败（HTTP ${response.status}）`;
}

function isAudioUpload(uploadType) {
    return uploadType === 'musicAudio' || uploadType === 'lyricAudio';
}

function isPhotoUpload(uploadType) {
    return uploadType === 'photos';
}

function isOptimizablePhotoUpload(file, uploadType) {
    if (!isPhotoUpload(uploadType) || !file) return false;

    const type = String(file.type || '').toLowerCase();
    if (type === 'image/gif' || type === 'image/svg+xml') return false;
    if (type.startsWith('image/')) return true;

    return /\.(jpe?g|png|webp|avif|bmp)$/i.test(String(file.name || ''));
}

function shouldOptimizePhotoForUpload(file, uploadType) {
    return state.online
        && isOptimizablePhotoUpload(file, uploadType)
        && file.size > getUploadSafeLimitBytes(uploadType);
}

function getUploadSafeLimitBytes(uploadType) {
    if (isAudioUpload(uploadType)) return AUDIO_UPLOAD_TARGET_BYTES;
    if (isPhotoUpload(uploadType)) return PHOTO_UPLOAD_TARGET_BYTES;
    return ONLINE_UPLOAD_LIMIT_BYTES;
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
            value: field.type === 'musicVersions'
                ? formatMusicVersionSummary(item)
                : formatResourceFieldValue(item[field.key])
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
    if (source === 'music') return getDefaultMusicAudioPath(item);
    if (source === 'lyrics') return item.audioPath || '';
    return '';
}

function getDefaultMusicAudioPath(item) {
    return getMusicVersionsForItem(item)[0]?.url || item?.url || '';
}

function getMusicVersionsForItem(item) {
    if (!item) return [];

    const versions = [];
    if (Array.isArray(item.versions)) {
        item.versions.forEach(version => {
            const url = normalizeAssetInput(version && version.url);
            if (!url) return;
            versions.push({
                url,
                label: version.label || version.title || '',
                isDefault: Boolean(version.isDefault || version.default)
            });
        });
    }

    const fallbackUrl = normalizeAssetInput(item.url);
    if (fallbackUrl && !versions.some(version => version.url === fallbackUrl)) {
        versions.unshift({
            url: fallbackUrl,
            label: '',
            isDefault: !versions.some(version => version.isDefault)
        });
    }

    if (versions.length === 0) return [];

    const defaultIndex = versions.findIndex(version => version.isDefault);
    const ordered = defaultIndex > 0
        ? [versions[defaultIndex], ...versions.filter((_, index) => index !== defaultIndex)]
        : versions;

    return ordered.map((version, index) => ({
        url: version.url,
        label: `版本${index + 1}`,
        isDefault: index === 0
    }));
}

function formatMusicVersionSummary(item) {
    const versions = getMusicVersionsForItem(item);
    if (versions.length <= 1) return '';
    return versions.map((version, index) => `${version.label || `版本${index + 1}`}${index === 0 ? '（默认）' : ''}：${version.url}`).join('；');
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
        .map(item => `
            <option value="${escapeAttribute(item.id)}">
                ${escapeHtml(formatRelationOptionLabel('music', item))}${item.url ? ' · 可同步音频' : ' · 无音频'}
            </option>
        `);

    select.innerHTML = [
        '<option value="">不关联音乐</option>',
        ...options
    ].join('');

    if ([...select.options].some(option => option.value === selectedValue)) {
        select.value = selectedValue;
    }
}

function getMusicAudioPath(id) {
    if (!id) return '';
    const item = getVisibleSourceItems('music').find(entry => String(entry.id) === String(id));
    return getDefaultMusicAudioPath(item);
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
    clearFormFeedback(form);
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
    renderEditorMusicVersionOptions();
    renderIcons();

    const firstInput = $('#resource-editor-fields input:not([disabled]), #resource-editor-fields select, #resource-editor-fields textarea');
    if (firstInput) {
        firstInput.focus();
        if (typeof firstInput.select === 'function') {
            firstInput.select();
        }
    }
}

function closeResourceEditor() {
    clearFormFeedback($('#resource-editor-form'));
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

    if (field.type === 'resourceSelect') {
        return renderResourceSelectField(field, item, value);
    }

    if (field.type === 'markdownText') {
        return renderMarkdownTextField(field, value);
    }

    if (field.type === 'fileUpload') {
        return renderEditorUploadField(field);
    }

    if (field.type === 'musicVersions') {
        return renderMusicVersionsEditorField(field, item);
    }

    return `
        <label class="field">
            <span>${escapeHtml(field.label)}</span>
            <input name="${escapeAttribute(field.key)}" value="${escapeAttribute(value)}" ${field.required ? 'required' : ''} ${field.type === 'number' ? 'inputmode="decimal"' : ''}>
        </label>
    `;
}

function renderResourceSelectField(field, item, value) {
    const relatedSource = field.source;
    const selectedValue = String(value || '');
    const items = getRelationOptions(relatedSource, selectedValue);
    const options = [
        `<option value="">不关联${escapeHtml(SOURCE_META[relatedSource].label)}</option>`,
        ...items.map(optionItem => `
            <option value="${escapeAttribute(optionItem.id)}" ${String(optionItem.id) === selectedValue ? 'selected' : ''}>
                ${escapeHtml(formatRelationOptionLabel(relatedSource, optionItem))}
            </option>
        `)
    ].join('');

    return `
        <label class="field">
            <span>${escapeHtml(field.label)}</span>
            <select name="${escapeAttribute(field.key)}">
                ${options}
            </select>
        </label>
    `;
}

function renderMarkdownTextField(field, value) {
    const fileKey = getMarkdownFileInputName(field);
    return `
        <div class="field editor-field-wide">
            <label class="field">
                <span>${escapeHtml(field.fileLabel || 'Markdown 文件')}</span>
                <input type="file" name="${escapeAttribute(fileKey)}" accept=".md,text/markdown,text/plain" data-editor-markdown-file="${escapeAttribute(field.key)}">
            </label>
            <label class="field">
                <span>${escapeHtml(field.label)}</span>
                <textarea name="${escapeAttribute(field.key)}" rows="${Number(field.rows) || 6}" placeholder="可以粘贴歌词，也可以上传 Markdown 文件">${escapeHtml(value)}</textarea>
            </label>
        </div>
    `;
}

function renderEditorUploadField(field) {
    const isAudio = isAudioUpload(field.uploadType);
    return `
        <div class="field editor-field-wide">
            <label class="field">
                <span>${escapeHtml(field.label)}</span>
                <input type="file" name="${escapeAttribute(field.key)}" accept="${escapeAttribute(field.accept || '*/*')}" data-editor-upload-type="${escapeAttribute(field.uploadType)}">
            </label>
            ${isAudio ? `
                <button class="secondary-action file-picker-action" type="button" data-editor-file-picker="${escapeAttribute(field.key)}">
                    <i data-lucide="folder-open"></i>
                    从上次目录选择音频
                </button>
            ` : ''}
            ${field.note ? `<span>${escapeHtml(field.note)}</span>` : ''}
        </div>
    `;
}

function renderMusicVersionsEditorField(field, item) {
    return `
        <div class="field editor-field-wide music-version-editor" data-editor-music-versions>
            <div class="editor-version-heading">
                <span>${escapeHtml(field.label)}</span>
                <small>当前选中的项目会成为前台版本1，也是列表自动播放的默认音频。</small>
            </div>
            <div class="version-upload-list" id="editor-music-version-options"></div>
            <label class="field">
                <span>追加版本音频（可多选，可重复选择追加）</span>
                <input type="file" name="versionsFiles" accept="audio/*" multiple data-editor-music-version-files>
            </label>
        </div>
    `;
}

function renderEditorMusicVersionOptions() {
    const form = $('#resource-editor-form');
    const container = $('#editor-music-version-options');
    if (!form || !container || form.elements.source.value !== 'music') return;

    const existingValue = container.querySelector('input[name="editorDefaultVersionSource"]:checked')?.value || '';
    const candidates = getEditorMusicVersionCandidates();
    if (candidates.length === 0) {
        container.innerHTML = '<div class="version-upload-empty">还没有可用音频，请填写音频路径或上传音频文件。</div>';
        return;
    }

    const selectedValue = candidates.some(candidate => candidate.source === existingValue)
        ? existingValue
        : candidates[0].source;
    const orderedCandidates = orderMusicVersionCandidates(candidates, selectedValue);
    const positionBySource = new Map(orderedCandidates.map((candidate, index) => [candidate.source, index + 1]));

    container.innerHTML = candidates.map((candidate, index) => `
        <div class="version-upload-item">
            <input type="radio" name="editorDefaultVersionSource" value="${escapeAttribute(candidate.source)}" ${candidate.source === selectedValue ? 'checked' : ''}>
            <span>
                <strong>${escapeHtml(candidate.source === selectedValue ? `版本1（默认推荐） · ${candidate.label}` : `版本${positionBySource.get(candidate.source) || index + 1} · ${candidate.label}`)}</strong>
                ${escapeHtml(candidate.detail || candidate.url)}
            </span>
            ${candidate.canRemove ? `
                <button class="version-upload-remove" type="button" title="移除这个版本" aria-label="移除这个版本" data-editor-version-remove="${Number(candidate.fileIndex)}">
                    <i data-lucide="x"></i>
                </button>
            ` : ''}
        </div>
    `).join('');
    renderIcons();
}

function getEditorMusicVersionCandidates() {
    const form = $('#resource-editor-form');
    if (!form || form.elements.source.value !== 'music') return [];

    const item = getSourceItems('music').find(entry => String(entry.id) === String(form.elements.resourceId.value));
    const versions = getMusicVersionsForItem(item);
    const typedUrl = normalizeAssetInput(form.elements.url?.value);
    const replacementFile = getSelectedInputFile(form.elements.urlFile);
    const versionFiles = getSelectedInputFiles(form.elements.versionsFiles);
    const candidates = [];

    if (replacementFile) {
        candidates.push({
            source: 'replacement-file',
            label: '替换后的主音频',
            detail: `${replacementFile.name} · ${formatFileSize(replacementFile.size)}`,
            file: replacementFile,
            url: typedUrl || getDefaultMusicAudioPath(item)
        });
    }

    if (versions.length > 0) {
        versions.forEach((version, index) => {
            const url = index === 0 && typedUrl ? typedUrl : version.url;
            candidates.push({
                source: `existing-${index}`,
                label: version.label || `已有版本 ${index + 1}`,
                detail: url,
                url
            });
        });
    } else if (typedUrl) {
        candidates.push({
            source: 'existing-url',
            label: '当前音频路径',
            detail: typedUrl,
            url: typedUrl
        });
    }

    versionFiles.forEach((file, index) => {
        candidates.push({
            source: `editor-extra-file-${index}`,
            label: `追加版本 ${index + 1}`,
            detail: `${file.name} · ${formatFileSize(file.size)}`,
            file,
            url: '',
            fileIndex: index,
            canRemove: true
        });
    });

    return candidates;
}

function getRelationOptions(source, selectedValue) {
    const visibleItems = getVisibleSourceItems(source);
    if (!selectedValue || visibleItems.some(item => String(item.id) === selectedValue)) {
        return visibleItems;
    }

    const currentItem = getSourceItems(source).find(item => String(item.id) === selectedValue);
    return currentItem ? [currentItem, ...visibleItems] : visibleItems;
}

function formatRelationOptionLabel(source, item) {
    if (!item) return '';
    const title = item.title || item.id;
    const parts = [];
    if (source === 'music' && item.artist) parts.push(item.artist);
    if (source === 'lyrics' && item.author) parts.push(item.author);
    if (isResourceDeleted(item)) parts.push('回收站');
    parts.push(item.id);
    return `${title} · ${parts.filter(Boolean).join(' · ')}`;
}

function getMarkdownFileInputName(field) {
    return field.fileKey || `${field.key}File`;
}

function getEditorFieldValue(field, item) {
    const value = item[field.key];
    if (field.type === 'checkbox') return Boolean(value);
    if (field.type === 'tags') return Array.isArray(value) ? value.join('，') : String(value || '');
    return value === undefined || value === null ? '' : String(value);
}

async function handleResourceEditorSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
    const originalButtonHtml = submitButton.innerHTML;
    const progress = createFormProgress(form);
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
    submitButton.disabled = true;
    submitButton.innerHTML = '<i data-lucide="loader-circle"></i> 正在保存';
    progress.set(6, '正在准备保存修改');
    setFormMessage(form, '正在保存资源修改，请稍候...', 'info');
    renderIcons();

    try {
        progress.set(14, '正在读取编辑字段');
        for (const field of schema) {
            await applyEditorFieldValue(updated, field, form.elements[field.key], form, { progress, original });
        }
        progress.set(88, '正在写入待发布列表');
    } catch (error) {
        progress.set(100, '保存失败', 'error');
        setFormMessage(form, error.message || '保存失败', 'error');
        showToast(error.message || '保存失败');
        submitButton.disabled = false;
        submitButton.innerHTML = originalButtonHtml;
        renderIcons();
        return;
    }

    updated.id = original.id;
    state.files[path][index] = updated;
    progress.set(100, '修改已保存到待发布列表', 'success');
    submitButton.disabled = false;
    submitButton.innerHTML = originalButtonHtml;
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

function handleResourceEditorFieldClick(event) {
    const removeButton = event.target.closest('[data-editor-version-remove]');
    if (removeButton) {
        removeSelectedInputFileAt($('#resource-editor-form').elements.versionsFiles, Number(removeButton.dataset.editorVersionRemove));
        renderEditorMusicVersionOptions();
        return;
    }

    if (selectVersionOptionFromRow(event, 'editorDefaultVersionSource')) {
        return;
    }

    const pickerButton = event.target.closest('[data-editor-file-picker]');
    if (!pickerButton) return;

    const input = $('#resource-editor-form').elements[pickerButton.dataset.editorFilePicker];
    if (input) {
        selectAudioFileWithRememberedDirectory(input);
    }
}

async function handleResourceEditorFieldChange(event) {
    if (event.target.name === 'editorDefaultVersionSource') {
        renderEditorMusicVersionOptions();
        return;
    }

    if (event.target.closest('[data-editor-music-version-files]')) {
        appendSelectedInputFiles(event.target);
        renderEditorMusicVersionOptions();
        return;
    }

    const uploadInput = event.target.closest('[data-editor-upload-type]');
    if (uploadInput) {
        handleResourceEditorUploadFieldChange(uploadInput);
        if ($('#resource-editor-form').elements.source.value === 'music') {
            renderEditorMusicVersionOptions();
        }
        return;
    }

    const input = event.target.closest('[data-editor-markdown-file]');
    if (!input || !input.files || !input.files[0]) return;

    const targetKey = input.dataset.editorMarkdownFile;
    const textarea = Array.from($('#resource-editor-fields').querySelectorAll('textarea'))
        .find(node => node.name === targetKey);
    if (!textarea) return;

    try {
        textarea.value = await readTextFile(input.files[0]);
        showToast('Markdown 歌词已读取');
    } catch (error) {
        showToast(error.message || '读取 Markdown 文件失败');
    }
}

function handleResourceEditorFieldInput(event) {
    const form = $('#resource-editor-form');
    if (form.elements.source.value !== 'music') return;
    if (event.target && event.target.name === 'url') {
        renderEditorMusicVersionOptions();
    }
}

function handleResourceEditorUploadFieldChange(input) {
    const form = $('#resource-editor-form');
    const uploadType = input.dataset.editorUploadType;
    const file = getSelectedInputFile(input);

    if (!file) {
        setFormMessage(form, '');
        return;
    }

    if (shouldTranscodeAudioForUpload(file, uploadType)) {
        setFormMessage(
            form,
            `${UPLOAD_LABELS[uploadType] || '素材'}已选择：${file.name}（${formatFileSize(file.size)}）。保存时会先在浏览器里转成 MP3，目标小于 ${formatFileSize(AUDIO_UPLOAD_TARGET_BYTES)}。`,
            'info'
        );
        return;
    }

    const problem = getUploadFileProblem(file, uploadType);
    if (problem) {
        setFormMessage(form, problem, 'error');
        return;
    }

    setFormMessage(form, `${UPLOAD_LABELS[uploadType] || '素材'}已选择：${file.name}（${formatFileSize(file.size)}）`, 'info');
}

async function applyEditorFieldValue(item, field, input, form, context = {}) {
    if (field.type === 'musicVersions') {
        await applyMusicVersionsEditorValue(item, field, form, context);
        return;
    }

    if (!input) return;

    if (field.type === 'checkbox') {
        item[field.key] = input.checked;
        return;
    }

    if (field.type === 'markdownText') {
        await applyMarkdownTextFieldValue(item, field, input, form);
        return;
    }

    if (field.type === 'fileUpload') {
        await applyEditorUploadFieldValue(item, field, input, context);
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

async function applyEditorUploadFieldValue(item, field, input, context = {}) {
    const file = getSelectedInputFile(input);
    if (!file) return;

    const uploadType = field.uploadType;
    const targetKey = field.targetKey || field.key;
    const label = field.uploadLabel || field.label || UPLOAD_LABELS[uploadType] || '素材';
    const progress = context.progress;

    if (!uploadType) {
        throw new Error(`${field.label}缺少上传类型配置`);
    }

    const startPercent = Number.isFinite(field.uploadProgressStart) ? field.uploadProgressStart : 22;
    const endPercent = Number.isFinite(field.uploadProgressEnd) ? field.uploadProgressEnd : 84;

    validateUploads([{ file, uploadType }]);
    progress?.set(startPercent, `准备上传${label}`);
    const uploadedPath = await uploadAsset(file, uploadType, (ratio, statusLabel) => {
        const safeRatio = Math.max(0, Math.min(Number(ratio) || 0, 1));
        const percent = Math.round(safeRatio * 100);
        progress?.set(
            startPercent + safeRatio * (endPercent - startPercent),
            statusLabel || `正在上传${label}（${percent}%）`
        );
    });
    item[targetKey] = uploadedPath;
    progress?.set(endPercent, `${label}上传完成`);
}

async function applyMusicVersionsEditorValue(item, field, form, context = {}) {
    if (!form || form.elements.source.value !== 'music') return;

    const extraFiles = getSelectedInputFiles(form.elements.versionsFiles);
    validateUploads(extraFiles.map(file => ({ file, uploadType: 'musicAudio' })));

    const uploaded = extraFiles.length > 0
        ? await uploadFiles(
            extraFiles.map((file, index) => ({
                key: `editorVersion${index}`,
                file,
                uploadType: 'musicAudio',
                label: `追加版本音频${index + 1}`
            })),
            context.progress,
            60,
            84
        )
        : {};

    const selectedSource = form.querySelector('input[name="editorDefaultVersionSource"]:checked')?.value;
    const original = context.original || item;
    const replacementFile = getSelectedInputFile(form.elements.urlFile);
    const baseVersions = getMusicVersionsForItem(original);
    const currentUrl = normalizeAssetInput(item.url);
    const candidates = [];

    if (replacementFile && currentUrl) {
        candidates.push({
            source: 'replacement-file',
            url: currentUrl,
            label: makeTitleFromFilename(replacementFile.name) || '替换后的主音频'
        });
    }

    if (baseVersions.length > 0) {
        baseVersions.forEach((version, index) => {
            const url = index === 0 && currentUrl ? currentUrl : version.url;
            candidates.push({
                source: `existing-${index}`,
                url,
                label: version.label || `版本${index + 1}`
            });
        });
    } else if (currentUrl) {
        candidates.push({
            source: 'existing-url',
            url: currentUrl,
            label: '版本1'
        });
    }

    extraFiles.forEach((file, index) => {
        candidates.push({
            source: `editor-extra-file-${index}`,
            url: uploaded[`editorVersion${index}`],
            label: makeTitleFromFilename(file.name) || `追加版本 ${index + 1}`
        });
    });

    const versions = buildMusicVersions(candidates, selectedSource);
    if (versions.length > 0) {
        item.url = versions[0].url;
    }

    if (versions.length > 1) {
        item.versions = versions;
    } else {
        delete item.versions;
    }
}

async function applyMarkdownTextFieldValue(item, field, input, form) {
    const fileInput = form && form.elements[getMarkdownFileInputName(field)];
    const markdownFile = fileInput && fileInput.files ? fileInput.files[0] : null;
    const rawValue = markdownFile
        ? (await readTextFile(markdownFile)).trim()
        : String(input.value || '').trim();

    if (field.required && !rawValue) {
        throw new Error(`${field.label}不能为空`);
    }

    if (!rawValue && field.empty === 'delete') {
        delete item[field.key];
        return;
    }

    item[field.key] = markdownToPlainText(rawValue);
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
        insertFormFeedbackNode(form, progressNode);
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
        insertFormFeedbackNode(form, messageNode);
    }

    messageNode.textContent = message || '';
    messageNode.hidden = !message;
    messageNode.className = `form-message is-${tone}`;
}

function insertFormFeedbackNode(form, node) {
    const anchor = form.querySelector('.modal-actions') || form.querySelector('button[type="submit"]');
    if (anchor && anchor.parentElement === form) {
        form.insertBefore(node, anchor);
        return;
    }

    form.appendChild(node);
}

function clearFormFeedback(form) {
    const progressNode = form.querySelector('.form-progress');
    const messageNode = form.querySelector('.form-message');
    if (progressNode) progressNode.hidden = true;
    if (messageNode) {
        messageNode.hidden = true;
        messageNode.textContent = '';
    }
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
