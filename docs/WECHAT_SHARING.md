# 微信分享配置

站点已包含通用 Open Graph 分享元数据、音乐页动态标题/封面，以及微信 JS-SDK 的朋友圈和好友分享配置。

要启用微信 JS-SDK，需在线上环境配置：

- `WECHAT_APP_ID`：微信公众号 AppID。
- `WECHAT_APP_SECRET`：微信公众号 AppSecret，只允许保存在服务器环境变量中。
- `WECHAT_ALLOWED_HOSTS`：可选，默认为 `www.deanhuo.com,deanhuo.com`。
- `SITE_ORIGIN`：可选，默认为 `https://www.deanhuo.com`。

在微信公众号后台的「JS 接口安全域名」中添加 `www.deanhuo.com`，并按微信要求完成域名校验。

部署后，在微信内打开歌曲页，通过右上角菜单分享。歌曲页会使用当前歌名、歌曲封面和带 `id` 的页面链接；其他页面使用 Dean Huo 品牌 Logo。

复制 URL 后直接粘贴到朋友圈的输入框，仍会被微信视为普通文字；应从微信内网页右上角菜单分享。
