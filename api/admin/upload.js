const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;

const UPLOAD_DIRECTORIES = {
    photos: 'assets/images/admin-uploads/photos',
    lyricsCover: 'assets/images/admin-uploads/lyrics',
    musicCover: 'assets/images/admin-uploads/music',
    musicAudio: 'assets/audio/admin-uploads',
    lyricAudio: 'assets/audio/admin-uploads'
};

const MIME_EXTENSIONS = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'audio/mpeg': '.mp3',
    'audio/mp3': '.mp3',
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
    'audio/aac': '.aac',
    'audio/mp4': '.m4a'
};

module.exports = async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return sendJson(res, 405, { error: 'Method not allowed' });
        }

        requireAdmin(req);
        const github = getGithubConfig();
        const body = await readBuffer(req);
        const { fields, files } = parseMultipart(req, body);
        const file = files.file || files.asset || Object.values(files)[0];

        if (!file) {
            throw createHttpError(400, '没有收到上传文件');
        }

        const uploadType = fields.uploadType || fields.resourceType || 'photos';
        const directory = UPLOAD_DIRECTORIES[uploadType];
        if (!directory) {
            throw createHttpError(400, `不支持的上传类型：${uploadType}`);
        }

        validateFile(file, uploadType);

        const ext = getExtension(file.filename, file.contentType);
        const basename = sanitizeFilename(file.filename.replace(/\.[^.]+$/, '')) || uploadType;
        const path = `${directory}/${Date.now()}-${basename}${ext}`;
        const result = await uploadGithubFile(github, path, file.data, `Upload admin resource ${path}`);

        return sendJson(res, 200, {
            ok: true,
            path,
            htmlUrl: result.content && result.content.html_url,
            commitSha: result.commit && result.commit.sha,
            commitUrl: result.commit && result.commit.html_url
        });
    } catch (error) {
        const status = error.statusCode || 500;
        return sendJson(res, status, buildErrorResponse(error));
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

function buildErrorResponse(error) {
    const response = { error: error.message || 'Upload failed' };
    if (error.code) response.code = error.code;
    if (error.details) response.details = error.details;
    return response;
}

function createAuthError(presented) {
    const error = createHttpError(401, '后台登录已失效，请重新登录');
    error.code = 'ADMIN_TOKEN_MISMATCH';
    error.details = {
        tokenReceived: Boolean(presented.token),
        transport: presented.transport
    };
    return error;
}

function requireAdmin(req) {
    const rawExpected = process.env.ADMIN_TOKEN;
    if (!rawExpected) {
        throw createHttpError(500, '线上发布配置缺失：ADMIN_TOKEN');
    }

    const expected = normalizeAdminToken(rawExpected);
    if (!expected) {
        throw createHttpError(500, '线上发布配置为空：ADMIN_TOKEN');
    }

    const presented = getPresentedAdminToken(req);

    if (presented.token !== expected) {
        throw createAuthError(presented);
    }
}

function getPresentedAdminToken(req) {
    const encodedHeader = getHeaderValue(req.headers['x-admin-token-encoded']);
    if (encodedHeader) {
        return {
            token: normalizeAdminToken(decodeHeaderToken(encodedHeader)),
            transport: 'encoded-header'
        };
    }

    const headerToken = getHeaderValue(req.headers['x-admin-token']);
    if (headerToken) {
        return {
            token: normalizeAdminToken(headerToken),
            transport: 'header'
        };
    }

    const authHeader = getHeaderValue(req.headers.authorization) || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (bearerToken) {
        return {
            token: normalizeAdminToken(bearerToken),
            transport: 'bearer'
        };
    }

    return { token: '', transport: 'missing' };
}

function decodeHeaderToken(value) {
    try {
        return decodeURIComponent(String(value || ''));
    } catch (error) {
        return String(value || '');
    }
}

function getHeaderValue(value) {
    return Array.isArray(value) ? value[0] : value;
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

function getGithubConfig() {
    const repo = process.env.GITHUB_REPO;
    const token = process.env.GITHUB_TOKEN;
    const branch = process.env.GITHUB_BRANCH || 'main';

    if (!repo) throw createHttpError(500, '线上发布配置缺失：GITHUB_REPO');
    if (!token) throw createHttpError(500, '线上发布配置缺失：GITHUB_TOKEN');
    if (!repo.includes('/')) throw createHttpError(500, 'GITHUB_REPO 格式应为 owner/repo');

    return { repo, token, branch };
}

function readBuffer(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let length = 0;
        req.on('data', chunk => {
            length += chunk.length;
            if (length > MAX_UPLOAD_SIZE) {
                reject(createHttpError(413, '上传文件过大'));
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

function parseMultipart(req, body) {
    const contentType = req.headers['content-type'] || '';
    const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!match) {
        throw createHttpError(400, '请求不是有效的 multipart 表单');
    }

    const boundary = Buffer.from('--' + (match[1] || match[2]));
    const parts = splitBuffer(body, boundary);
    const fields = {};
    const files = {};

    parts.forEach(part => {
        let buffer = trimMultipartPart(part);
        if (buffer.length === 0 || buffer.equals(Buffer.from('--'))) return;

        const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'));
        if (headerEnd === -1) return;

        const headerText = buffer.slice(0, headerEnd).toString('utf8');
        let data = buffer.slice(headerEnd + 4);
        if (data.slice(-2).toString('utf8') === '\r\n') {
            data = data.slice(0, -2);
        }

        const disposition = headerText.match(/content-disposition:\s*form-data;([^\r\n]+)/i);
        if (!disposition) return;

        const name = getHeaderParam(disposition[1], 'name');
        const filename = getHeaderParam(disposition[1], 'filename');
        const contentTypeMatch = headerText.match(/content-type:\s*([^\r\n]+)/i);
        const partContentType = contentTypeMatch ? contentTypeMatch[1].trim().toLowerCase() : '';

        if (filename) {
            files[name] = {
                filename,
                contentType: partContentType,
                data
            };
        } else {
            fields[name] = data.toString('utf8');
        }
    });

    return { fields, files };
}

function splitBuffer(buffer, separator) {
    const result = [];
    let start = 0;
    let index = buffer.indexOf(separator, start);

    while (index !== -1) {
        result.push(buffer.slice(start, index));
        start = index + separator.length;
        index = buffer.indexOf(separator, start);
    }

    result.push(buffer.slice(start));
    return result;
}

function trimMultipartPart(part) {
    let start = 0;
    let end = part.length;

    if (part.slice(0, 2).toString('utf8') === '\r\n') start = 2;
    if (part.slice(end - 2).toString('utf8') === '\r\n') end -= 2;
    if (part.slice(end - 2, end).toString('utf8') === '--') end -= 2;

    return part.slice(start, end);
}

function getHeaderParam(text, paramName) {
    const match = text.match(new RegExp(`${paramName}="([^"]*)"`, 'i'));
    return match ? match[1] : '';
}

function validateFile(file, uploadType) {
    const isAudio = uploadType === 'musicAudio' || uploadType === 'lyricAudio';
    const isImage = !isAudio;
    const contentType = file.contentType || '';

    if (isImage && !contentType.startsWith('image/')) {
        throw createHttpError(400, '该位置只能上传图片');
    }
    if (isAudio && !contentType.startsWith('audio/')) {
        throw createHttpError(400, '该位置只能上传音频');
    }
    if (!MIME_EXTENSIONS[contentType]) {
        throw createHttpError(400, `不支持的文件类型：${contentType || 'unknown'}`);
    }
}

function getExtension(filename, contentType) {
    const existing = (filename.match(/\.[a-zA-Z0-9]+$/) || [''])[0].toLowerCase();
    return existing || MIME_EXTENSIONS[contentType] || '';
}

function sanitizeFilename(value) {
    return value
        .normalize('NFKD')
        .replace(/[^\w.-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
        .slice(0, 80);
}

async function uploadGithubFile(github, path, buffer, message) {
    const response = await githubFetch(github, `/contents/${encodeURIComponentPath(path)}`, {
        method: 'PUT',
        body: {
            message,
            branch: github.branch,
            content: buffer.toString('base64')
        }
    });

    if (!response.ok) {
        const detail = await safeResponseText(response);
        throw createHttpError(response.status, `GitHub 上传失败${detail}`);
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

async function safeResponseText(response) {
    try {
        const text = await response.text();
        if (!text) return '';
        return `：${text.slice(0, 500)}`;
    } catch (error) {
        return '';
    }
}
