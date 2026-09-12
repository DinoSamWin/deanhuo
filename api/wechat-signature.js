const crypto = require('crypto');

const CACHE_SAFETY_SECONDS = 300;
const cache = globalThis.__deanWechatCache || {
    accessToken: '',
    accessTokenExpiresAt: 0,
    ticket: '',
    ticketExpiresAt: 0
};
globalThis.__deanWechatCache = cache;

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return sendJson(res, 405, { error: 'Method not allowed' });
    }

    const appId = String(process.env.WECHAT_APP_ID || '').trim();
    const appSecret = String(process.env.WECHAT_APP_SECRET || '').trim();
    if (!appId || !appSecret) {
        return sendJson(res, 503, {
            error: 'WeChat sharing is not configured',
            code: 'WECHAT_CONFIG_MISSING'
        });
    }

    try {
        const pageUrl = getPageUrl(req);
        assertAllowedPageUrl(pageUrl);
        const ticket = await getJsApiTicket(appId, appSecret);
        const timestamp = Math.floor(Date.now() / 1000);
        const nonceStr = crypto.randomBytes(16).toString('hex');
        const signatureSource = [
            `jsapi_ticket=${ticket}`,
            `noncestr=${nonceStr}`,
            `timestamp=${timestamp}`,
            `url=${pageUrl}`
        ].join('&');
        const signature = crypto.createHash('sha1').update(signatureSource).digest('hex');

        res.setHeader('Cache-Control', 'private, no-store, max-age=0');
        return sendJson(res, 200, { appId, timestamp, nonceStr, signature });
    } catch (error) {
        return sendJson(res, error.statusCode || 502, {
            error: error.message || 'Unable to prepare WeChat sharing'
        });
    }
};

function getPageUrl(req) {
    const requestUrl = new URL(req.url || '', 'https://www.deanhuo.com');
    const rawUrl = String(requestUrl.searchParams.get('url') || '').split('#')[0];
    if (!rawUrl) throw createHttpError(400, 'Missing page URL');
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch (error) {
        throw createHttpError(400, 'Invalid page URL');
    }
    return parsed.href;
}

function assertAllowedPageUrl(pageUrl) {
    const parsed = new URL(pageUrl);
    const configuredHosts = String(process.env.WECHAT_ALLOWED_HOSTS || 'www.deanhuo.com,deanhuo.com')
        .split(',')
        .map(host => host.trim().toLowerCase())
        .filter(Boolean);
    if (parsed.protocol !== 'https:' || !configuredHosts.includes(parsed.hostname.toLowerCase())) {
        throw createHttpError(400, 'Page URL is not an allowed WeChat JS-SDK domain');
    }
}

async function getJsApiTicket(appId, appSecret) {
    if (cache.ticket && cache.ticketExpiresAt > Date.now()) return cache.ticket;
    const accessToken = await getAccessToken(appId, appSecret);
    const endpoint = new URL('https://api.weixin.qq.com/cgi-bin/ticket/getticket');
    endpoint.searchParams.set('access_token', accessToken);
    endpoint.searchParams.set('type', 'jsapi');
    const payload = await fetchWechatJson(endpoint);
    if (payload.errcode !== 0 || !payload.ticket) {
        throw new Error(payload.errmsg || 'Unable to obtain WeChat JSAPI ticket');
    }
    cache.ticket = payload.ticket;
    cache.ticketExpiresAt = getExpiry(payload.expires_in);
    return cache.ticket;
}

async function getAccessToken(appId, appSecret) {
    if (cache.accessToken && cache.accessTokenExpiresAt > Date.now()) return cache.accessToken;
    const endpoint = new URL('https://api.weixin.qq.com/cgi-bin/token');
    endpoint.searchParams.set('grant_type', 'client_credential');
    endpoint.searchParams.set('appid', appId);
    endpoint.searchParams.set('secret', appSecret);
    const payload = await fetchWechatJson(endpoint);
    if (!payload.access_token) {
        throw new Error(payload.errmsg || 'Unable to obtain WeChat access token');
    }
    cache.accessToken = payload.access_token;
    cache.accessTokenExpiresAt = getExpiry(payload.expires_in);
    cache.ticket = '';
    cache.ticketExpiresAt = 0;
    return cache.accessToken;
}

async function fetchWechatJson(url) {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`WeChat API returned HTTP ${response.status}`);
    return response.json();
}

function getExpiry(expiresIn) {
    const lifetime = Math.max(60, Number(expiresIn) || 7200);
    return Date.now() + Math.max(60, lifetime - CACHE_SAFETY_SECONDS) * 1000;
}

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
