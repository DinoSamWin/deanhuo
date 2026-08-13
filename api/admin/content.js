const JSON_FILES = {
    photos: 'assets/data/photos.json',
    lyrics: 'assets/data/lyrics.json',
    music: 'assets/data/music.json',
    knowledge: 'assets/data/knowledge-index.json',
    recommendations: 'assets/data/recommendations.json'
};

const APPEND_ONLY_FILES = new Set([
    JSON_FILES.photos,
    JSON_FILES.lyrics,
    JSON_FILES.music,
    JSON_FILES.knowledge
]);

const TEXT_FILE_PREFIXES = [
    'assets/lyrics/admin-generated/',
    'assets/data/knowledge/admin-generated/'
];

const DEFAULT_RECOMMENDATIONS = {
    version: 1,
    updatedAt: '',
    modules: {
        homeLyrics: { label: '首页词作轮播', source: 'lyrics', limit: 5, items: [] },
        homeMusic: { label: '首页音乐作品', source: 'music', limit: 4, items: [] },
        homePhotos: { label: '首页摄影橱窗', source: 'photos', limit: 6, items: [] },
        lyricsPageFeatured: { label: '词作页优先展示', source: 'lyrics', limit: 8, items: [] },
        musicPageFeatured: { label: '音乐页优先展示', source: 'music', limit: 8, items: [] },
        photosPageFeatured: { label: '摄影页优先展示', source: 'photos', limit: 12, items: [] },
        knowledgePageFeatured: { label: '知识页优先展示', source: 'knowledge', limit: 6, items: [] }
    }
};

module.exports = async function handler(req, res) {
    try {
        if (req.method !== 'GET' && req.method !== 'POST') {
            return sendJson(res, 405, { error: 'Method not allowed' });
        }

        requireAdmin(req);
        const github = getGithubConfig();

        if (req.method === 'GET') {
            const files = await readAllJsonFiles(github);
            return sendJson(res, 200, {
                repo: github.repo,
                branch: github.branch,
                files
            });
        }

        const payload = await readJsonBody(req);
        const incomingFiles = payload.files || {};
        const incomingTextFiles = payload.textFiles || {};
        const message = payload.message || 'Update resource content from admin';
        const currentFiles = await readAllJsonFiles(github);

        validateIncomingJsonFiles(incomingFiles, currentFiles);
        validateTextFiles(incomingTextFiles);

        const treeEntries = [];
        for (const [path, value] of Object.entries(incomingFiles)) {
            const content = JSON.stringify(value, null, 4) + '\n';
            const previousValue = currentFiles[path];
            const previousContent = previousValue === undefined ? '' : JSON.stringify(previousValue, null, 4) + '\n';
            if (content !== previousContent) {
                treeEntries.push(makeTextTreeEntry(path, content));
            }
        }

        for (const [path, content] of Object.entries(incomingTextFiles)) {
            treeEntries.push(makeTextTreeEntry(path, normalizeTextContent(content)));
        }

        if (treeEntries.length === 0) {
            return sendJson(res, 200, {
                ok: true,
                changed: false,
                message: 'No changes to publish'
            });
        }

        const commit = await commitFiles(github, treeEntries, message);
        return sendJson(res, 200, {
            ok: true,
            changed: true,
            commitSha: commit.sha,
            commitUrl: commit.html_url
        });
    } catch (error) {
        const status = error.statusCode || 500;
        return sendJson(res, status, { error: error.message || 'Server error' });
    }
};

function sendJson(res, statusCode, value) {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(value));
}

function createHttpError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function requireAdmin(req) {
    const expected = process.env.ADMIN_TOKEN;
    if (!expected) {
        throw createHttpError(500, '线上发布配置缺失：ADMIN_TOKEN');
    }

    const headerToken = req.headers['x-admin-token'];
    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const token = headerToken || bearerToken;

    if (token !== expected) {
        throw createHttpError(401, '后台登录已失效，请重新登录');
    }
}

function getGithubConfig() {
    const repo = process.env.GITHUB_REPO;
    const token = process.env.GITHUB_TOKEN;
    const branch = process.env.GITHUB_BRANCH || 'main';

    if (!repo) throw createHttpError(500, '线上发布配置缺失：GITHUB_REPO');
    if (!token) throw createHttpError(500, '线上发布配置缺失：GITHUB_TOKEN');
    if (!repo.includes('/')) throw createHttpError(500, 'GITHUB_REPO 格式应为 owner/repo');

    return { repo, token, branch };
}

async function readJsonBody(req) {
    const raw = await readBody(req);
    try {
        return raw ? JSON.parse(raw) : {};
    } catch (error) {
        throw createHttpError(400, '请求内容不是有效 JSON');
    }
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.setEncoding('utf8');
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 6 * 1024 * 1024) {
                reject(createHttpError(413, '提交内容过大'));
            }
        });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

async function readAllJsonFiles(github) {
    const result = {};

    for (const path of Object.values(JSON_FILES)) {
        try {
            const text = await readGithubFile(github, path);
            result[path] = JSON.parse(text);
        } catch (error) {
            if (path === JSON_FILES.recommendations && error.statusCode === 404) {
                result[path] = DEFAULT_RECOMMENDATIONS;
                continue;
            }
            throw error;
        }
    }

    return result;
}

async function readGithubFile(github, path) {
    const response = await githubFetch(github, `/contents/${encodeURIComponentPath(path)}?ref=${encodeURIComponent(github.branch)}`);
    if (response.status === 404) {
        throw createHttpError(404, `GitHub 文件不存在：${path}`);
    }
    if (!response.ok) {
        const detail = await safeResponseText(response);
        throw createHttpError(response.status, `读取 GitHub 文件失败：${path}${detail}`);
    }

    const data = await response.json();
    const encoded = String(data.content || '').replace(/\n/g, '');
    return Buffer.from(encoded, 'base64').toString('utf8');
}

function validateIncomingJsonFiles(incomingFiles, currentFiles) {
    const allowedPaths = new Set(Object.values(JSON_FILES));

    for (const path of Object.keys(incomingFiles)) {
        if (!allowedPaths.has(path)) {
            throw createHttpError(400, `不允许写入该 JSON 文件：${path}`);
        }
    }

    for (const path of APPEND_ONLY_FILES) {
        if (incomingFiles[path] === undefined) continue;
        assertAppendOnly(path, currentFiles[path], incomingFiles[path]);
    }

    if (incomingFiles[JSON_FILES.recommendations] !== undefined) {
        validateRecommendations(incomingFiles[JSON_FILES.recommendations]);
    }
}

function assertAppendOnly(path, currentValue, incomingValue) {
    if (!Array.isArray(currentValue) || !Array.isArray(incomingValue)) {
        throw createHttpError(400, `${path} 必须保持数组结构`);
    }
    if (incomingValue.length < currentValue.length) {
        throw createHttpError(409, `${path} 不能删除历史资源`);
    }

    for (let index = 0; index < currentValue.length; index += 1) {
        if (stableStringify(currentValue[index]) !== stableStringify(incomingValue[index])) {
            throw createHttpError(409, `${path} 的历史资源不能被修改或重排：第 ${index + 1} 项`);
        }
    }

    const seen = new Set();
    incomingValue.forEach(item => {
        if (!item || !item.id) return;
        const id = String(item.id);
        if (seen.has(id)) {
            throw createHttpError(409, `${path} 存在重复 ID：${id}`);
        }
        seen.add(id);
    });
}

function validateRecommendations(value) {
    if (!value || typeof value !== 'object' || !value.modules || typeof value.modules !== 'object') {
        throw createHttpError(400, '推荐配置结构不正确');
    }

    const allowedSources = new Set(['photos', 'lyrics', 'music', 'knowledge']);
    Object.entries(value.modules).forEach(([key, moduleConfig]) => {
        if (!moduleConfig || typeof moduleConfig !== 'object') {
            throw createHttpError(400, `推荐模块结构不正确：${key}`);
        }
        if (!allowedSources.has(moduleConfig.source)) {
            throw createHttpError(400, `推荐模块来源不正确：${key}`);
        }
        if (!Array.isArray(moduleConfig.items)) {
            throw createHttpError(400, `推荐模块 items 必须是数组：${key}`);
        }
        if (moduleConfig.items.length > 50) {
            throw createHttpError(400, `推荐模块条目过多：${key}`);
        }
    });
}

function validateTextFiles(textFiles) {
    for (const [path, content] of Object.entries(textFiles)) {
        const isAllowedPath = TEXT_FILE_PREFIXES.some(prefix => path.startsWith(prefix));
        if (!isAllowedPath || !path.endsWith('.md')) {
            throw createHttpError(400, `不允许写入该文本文件：${path}`);
        }
        if (typeof content !== 'string') {
            throw createHttpError(400, `文本文件内容必须是字符串：${path}`);
        }
        if (content.length > 200 * 1024) {
            throw createHttpError(413, `文本文件过大：${path}`);
        }
    }
}

function normalizeTextContent(content) {
    return content.endsWith('\n') ? content : content + '\n';
}

function makeTextTreeEntry(path, content) {
    return {
        path,
        mode: '100644',
        type: 'blob',
        content
    };
}

async function commitFiles(github, treeEntries, message) {
    const ref = await githubJson(github, `/git/ref/heads/${github.branch}`);
    const baseCommit = await githubJson(github, `/git/commits/${ref.object.sha}`);
    const tree = await githubJson(github, '/git/trees', {
        method: 'POST',
        body: {
            base_tree: baseCommit.tree.sha,
            tree: treeEntries
        }
    });
    const commit = await githubJson(github, '/git/commits', {
        method: 'POST',
        body: {
            message,
            tree: tree.sha,
            parents: [ref.object.sha]
        }
    });

    await githubJson(github, `/git/refs/heads/${github.branch}`, {
        method: 'PATCH',
        body: { sha: commit.sha }
    });

    return commit;
}

async function githubJson(github, path, options = {}) {
    const response = await githubFetch(github, path, options);
    if (!response.ok) {
        const detail = await safeResponseText(response);
        throw createHttpError(response.status, `GitHub 操作失败${detail}`);
    }
    return response.json();
}

function githubFetch(github, path, options = {}) {
    const headers = {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${github.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...options.headers
    };

    let body = options.body;
    if (body && typeof body !== 'string' && !Buffer.isBuffer(body)) {
        headers['Content-Type'] = 'application/json; charset=utf-8';
        body = JSON.stringify(body);
    }

    return fetch(`https://api.github.com/repos/${github.repo}${path}`, {
        ...options,
        headers,
        body
    });
}

function encodeURIComponentPath(path) {
    return path.split('/').map(encodeURIComponent).join('/');
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

async function safeResponseText(response) {
    try {
        const text = await response.text();
        if (!text) return '';
        return `：${text.slice(0, 500)}`;
    } catch (error) {
        return '';
    }
}
