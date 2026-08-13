# 资源配置后台 SOP

## 目标

这个后台用于管理静态站里的图片、词作、音乐和知识内容。它遵循追加式内容管理：

- 历史 JSON 资源只读，不在后台开放编辑。
- 新资源追加到对应数组末尾。
- 推荐位单独写入 `assets/data/recommendations.json`。
- 线上配置完成后，可通过 GitHub API 自动提交，Vercel 自动部署。

## 核心文件

```text
admin/index.html
admin/admin.js
css/admin.css
js/recommendations.js
assets/data/recommendations.json
api/admin/content.js
api/admin/upload.js
```

现有内容库保持不变：

```text
assets/data/photos.json
assets/data/lyrics.json
assets/data/music.json
assets/data/knowledge-index.json
```

## 推荐配置

推荐配置集中放在：

```text
assets/data/recommendations.json
```

每个模块有独立推荐内容：

```text
homeLyrics
homeMusic
homePhotos
lyricsPageFeatured
musicPageFeatured
photosPageFeatured
knowledgePageFeatured
```

配置为空时，前台沿用旧逻辑；配置了 ID 后，前台优先按这里的顺序展示。

## 线上环境变量

部署到 Vercel 时配置：

```text
ADMIN_TOKEN=后台登录口令
GITHUB_TOKEN=GitHub 写入权限 token
GITHUB_REPO=owner/repo
GITHUB_BRANCH=main
```

`GITHUB_TOKEN` 需要目标仓库的 `Contents: Read and write` 权限。

## 使用流程

1. 打开 `/admin/`
2. 输入 `ADMIN_TOKEN`
3. 新增图片、词作、音乐或知识内容
4. 在“推荐配置”里给不同模块配置推荐 ID 和排序
5. 到“保存发布”检查草稿
6. 点击“保存发布”
7. 等待 Vercel 自动部署

## 本地/未配置接口模式

如果没有线上 API 或环境变量，后台会进入“草稿导出模式”：

- 可以读取现有 JSON。
- 可以新增资源草稿。
- 可以配置推荐位。
- 可以下载或复制草稿 JSON。
- 不会真正写入项目文件或 GitHub。

## 历史数据保护

发布接口会重新读取 GitHub 上的当前 JSON，并检查：

- 旧数组长度不能减少。
- 旧数组项不能改字段。
- 旧数组项不能重排。
- 只允许在数组末尾追加新内容。
- 推荐配置可以独立更新。

如果历史资源被误改，接口会拒绝保存。
