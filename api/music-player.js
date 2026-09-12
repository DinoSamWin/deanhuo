const fs = require('fs');
const path = require('path');

const DEFAULT_TITLE = 'Dean Huo｜Music Player';
const DEFAULT_DESCRIPTION = '聆听 Dean Huo 的原创音乐作品。';
const DEFAULT_IMAGE_PATH = '/assets/images/brand/dean-logo-512.png';

module.exports = async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        res.statusCode = 405;
        return res.end('Method not allowed');
    }

    try {
        const requestUrl = new URL(req.url || '', getSiteOrigin());
        const songId = String(requestUrl.searchParams.get('id') || '').trim();
        const song = songId ? await findSong(songId) : null;
        const siteOrigin = getSiteOrigin();
        const pageUrl = new URL('/music-player.html', siteOrigin);
        if (songId) pageUrl.searchParams.set('id', songId);

        const share = {
            title: song ? `Dean Huo｜${song.title}` : DEFAULT_TITLE,
            description: song && String(song.description || '').trim()
                ? String(song.description).trim()
                : song ? `聆听 Dean Huo 的原创音乐《${song.title}》。` : DEFAULT_DESCRIPTION,
            image: toAbsoluteUrl(song?.cover || DEFAULT_IMAGE_PATH, siteOrigin),
            url: pageUrl.href
        };

        const template = readTemplate();
        const html = template
            .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(share.title)}</title>`)
            .replace(
                /<!-- SHARE_META_START -->[\s\S]*?<!-- SHARE_META_END -->/,
                renderShareMeta(share)
            );

        res.statusCode = songId && !song ? 404 : 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
        if (req.method === 'HEAD') return res.end();
        return res.end(html);
    } catch (error) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.end('Unable to load music player');
    }
};

function readTemplate() {
    const candidates = [
        path.join(process.cwd(), 'music-player.html'),
        path.join(__dirname, '..', 'music-player.html')
    ];
    const templatePath = candidates.find(candidate => fs.existsSync(candidate));
    if (!templatePath) throw new Error('Music player template not found');
    return fs.readFileSync(templatePath, 'utf8');
}

async function findSong(songId) {
    try {
        const dataPath = path.join(process.cwd(), 'assets', 'data', 'music.json');
        const songs = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        const localSong = songs.find(song => song.id === songId && !song.deletedAt && !song.hidden);
        if (localSong) return localSong;
    } catch (error) {
        // Fall through to the currently deployed catalogue.
    }

    try {
        const catalogueUrl = new URL('/assets/data/music.json', getSiteOrigin());
        const response = await fetch(catalogueUrl, { headers: { Accept: 'application/json' } });
        if (!response.ok) return null;
        const songs = await response.json();
        return songs.find(song => song.id === songId && !song.deletedAt && !song.hidden) || null;
    } catch (error) {
        return null;
    }
}

function renderShareMeta(share) {
    const title = escapeHtml(share.title);
    const description = escapeHtml(share.description);
    const image = escapeHtml(share.image);
    const url = escapeHtml(share.url);
    return `<!-- SHARE_META_START -->
    <meta name="description" content="${description}">
    <meta property="og:type" content="music.song">
    <meta property="og:site_name" content="Dean Huo">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${image}">
    <meta property="og:image:width" content="800">
    <meta property="og:image:height" content="800">
    <meta property="og:url" content="${url}">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${image}">
    <!-- SHARE_META_END -->`;
}

function getSiteOrigin() {
    try {
        return new URL(process.env.SITE_ORIGIN || 'https://www.deanhuo.com').origin;
    } catch (error) {
        return 'https://www.deanhuo.com';
    }
}

function toAbsoluteUrl(value, origin) {
    try {
        return new URL(value, origin).href;
    } catch (error) {
        return new URL(DEFAULT_IMAGE_PATH, origin).href;
    }
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
