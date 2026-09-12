(function () {
    const WECHAT_UA_PATTERN = /MicroMessenger/i;
    const DEFAULT_IMAGE = 'https://www.deanhuo.com/assets/images/brand/dean-logo-512.png';
    let sdkPromise = null;
    let configurationVersion = 0;

    function absoluteUrl(value) {
        if (!value) return DEFAULT_IMAGE;
        try {
            return new URL(value, document.baseURI || window.location.href).href;
        } catch (error) {
            return DEFAULT_IMAGE;
        }
    }

    function upsertMeta(attribute, key, content) {
        if (content === undefined || content === null) return;
        let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
        if (!element) {
            element = document.createElement('meta');
            element.setAttribute(attribute, key);
            document.head.appendChild(element);
        }
        element.setAttribute('content', content);
    }

    function readMeta(attribute, key) {
        return document.head.querySelector(`meta[${attribute}="${key}"]`)?.content || '';
    }

    function normalizeShareData(data) {
        const title = String(data.title || document.title || 'Dean Huo').trim();
        const description = Object.prototype.hasOwnProperty.call(data, 'description')
            ? String(data.description || '').trim()
            : '在结构之外，留一束光。';
        return {
            title,
            description,
            link: absoluteUrl(data.link || window.location.href.split('#')[0]),
            image: absoluteUrl(data.image || DEFAULT_IMAGE)
        };
    }

    function updateDocumentMetadata(data) {
        document.title = data.title;
        upsertMeta('name', 'description', data.description);
        upsertMeta('property', 'og:title', data.title);
        upsertMeta('property', 'og:description', data.description);
        upsertMeta('property', 'og:image', data.image);
        upsertMeta('property', 'og:url', data.link);
        upsertMeta('name', 'twitter:title', data.title);
        upsertMeta('name', 'twitter:description', data.description);
        upsertMeta('name', 'twitter:image', data.image);
    }

    function loadWechatSdk() {
        if (window.wx) return Promise.resolve(window.wx);
        if (sdkPromise) return sdkPromise;

        sdkPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js';
            script.async = true;
            script.onload = () => window.wx ? resolve(window.wx) : reject(new Error('WeChat JS-SDK unavailable'));
            script.onerror = () => reject(new Error('Unable to load WeChat JS-SDK'));
            document.head.appendChild(script);
        });
        return sdkPromise;
    }

    async function configureWechat(data, version) {
        if (!WECHAT_UA_PATTERN.test(navigator.userAgent)) return;

        const signedUrl = window.location.href.split('#')[0];
        const response = await fetch(`/api/wechat-signature?url=${encodeURIComponent(signedUrl)}`, {
            credentials: 'same-origin',
            cache: 'no-store'
        });

        if (!response.ok) return;
        const signature = await response.json();
        if (version !== configurationVersion) return;

        const wx = await loadWechatSdk();
        if (version !== configurationVersion) return;

        wx.config({
            debug: false,
            appId: signature.appId,
            timestamp: signature.timestamp,
            nonceStr: signature.nonceStr,
            signature: signature.signature,
            jsApiList: ['updateTimelineShareData', 'updateAppMessageShareData']
        });

        wx.ready(() => {
            if (version !== configurationVersion) return;
            wx.updateTimelineShareData({
                title: data.title,
                link: data.link,
                imgUrl: data.image
            });
            wx.updateAppMessageShareData({
                title: data.title,
                desc: data.description,
                link: data.link,
                imgUrl: data.image
            });
        });
    }

    function configure(data) {
        const normalized = normalizeShareData(data || {});
        const version = ++configurationVersion;
        updateDocumentMetadata(normalized);
        configureWechat(normalized, version).catch(() => {
            // Standard Open Graph metadata remains available when JS-SDK setup is absent.
        });
        return normalized;
    }

    function configurePage() {
        return configure({
            title: readMeta('property', 'og:title') || document.title,
            description: readMeta('property', 'og:description') || readMeta('name', 'description'),
            image: readMeta('property', 'og:image') || DEFAULT_IMAGE,
            link: readMeta('property', 'og:url') || window.location.href.split('#')[0]
        });
    }

    function configureTrack(song) {
        if (!song) return configurePage();
        const title = `${song.title}｜作词：霍澍`;
        const description = String(song.description || '').trim();
        const link = new URL(`/song/${encodeURIComponent(song.id)}`, window.location.origin);

        return configure({
            title,
            description,
            image: song.cover || DEFAULT_IMAGE,
            link: link.href
        });
    }

    window.DeanShare = { configure, configurePage, configureTrack };

    document.addEventListener('DOMContentLoaded', () => {
        if (document.body?.dataset.shareDynamic !== 'true') configurePage();
    }, { once: true });
})();
