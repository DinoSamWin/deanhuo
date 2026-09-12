# 中国大陆访问加速与上线手册

本文档对应 `codex/china-performance-prep` 分支。当前生产域名继续指向 Vercel；本文中的 OSS、CDN 和 DNS 步骤只有在 ICP 备案完成并通过预览验收后才执行。

## 1. 推荐架构

### 当前（备案前）

```text
deanhuo.com / www.deanhuo.com
              |
              v
          Vercel 全球站
```

不要在备案前接入中国大陆 CDN。当前可安全完成的工作是：站内资源优化、生成 OSS 发布包、准备上传脚本和保留 Vercel 回滚源站。

### 备案后

```text
www.deanhuo.com   -> 阿里云 CDN -> 中国大陆 OSS（仅公开静态站）
admin.deanhuo.com -> Vercel     -> /admin + /api/admin（后台与 API）
deanhuo.com       -> 301 跳转到 https://www.deanhuo.com
```

公开站与后台分开有两个好处：OSS 中不会出现管理/API 文件；切换 CDN 或回滚公开站时，后台发布能力仍留在 Vercel。经典 CDN 已足够覆盖这个静态网站，不必先购买 DCDN。

## 2. 已完成的技术准备

- 海外 Google Fonts、unpkg、jsDelivr 和 UI Avatars 依赖已本地化。
- 47 张相册原图已生成 640/1280/1920 三档 WebP；原图保留在源码中，OSS 发布包不携带原相册目录。
- 首屏外图片、音频和嵌入内容已使用懒加载或 metadata 预加载。
- 公开页面的数据请求已移除时间戳缓存穿透；后台仍保持读取最新数据的行为。
- `vercel.json` 已准备静态资源缓存和 API 禁止缓存规则。
- `scripts/build_cn_static.sh` 生成只包含公开站的 `dist-cn/`。
- `scripts/deploy_cn_oss.sh` 默认只预览；真实同步需要双重显式确认，并且永远不删除 OSS 上的旧对象。
- GitHub Actions 的 `Build mainland-China static package` 只能手动触发，只产出审查包，不部署、不改 DNS。

## 3. 本地构建与 OSS 上传

构建：

```bash
./scripts/build_cn_static.sh
```

仅检查目标，不上传：

```bash
ALIYUN_OSS_BUCKET=你的Bucket名 ./scripts/deploy_cn_oss.sh
```

备案、Bucket 和 ossutil 2.0 凭据都配置好以后，才执行：

```bash
ALIYUN_OSS_BUCKET=你的Bucket名 \
CN_UPLOAD_MODE=upload \
CN_DEPLOY_CONFIRM=upload-deanhuo-com \
./scripts/deploy_cn_oss.sh
```

如果网站放在 Bucket 子目录，再增加 `ALIYUN_OSS_PREFIX=目录名`。脚本不接受密钥参数；请使用 ossutil 官方配置文件、RAM 角色或环境凭据，避免密钥进入终端历史和 Git。RAM 权限应只允许操作指定 Bucket，不要使用主账号 AccessKey。

## 4. ICP 备案

域名在阿里云购买并不等于已经备案，也不能单凭域名直接获得大陆 CDN 加速资格。

1. 确认阿里云账号已实名认证，域名所有者信息与备案主体一致。
2. 确定备案主体：个人非经营性网站用个人备案；公司、产品推广或经营性内容用企业备案。不要为了省步骤选择不符合实际用途的主体。
3. 准备一个支持阿里云备案的中国大陆云资源。OSS/CDN 本身通常不是备案服务实例；在阿里云备案控制台按当时规则购买或绑定可备案的 ECS/轻量应用服务器等资源。
4. 在[阿里云 ICP 备案控制台](https://beian.aliyun.com/)填写主体、网站、负责人、服务内容和接入信息，完成人脸核验或资料上传。
5. 完成短信核验，等待阿里云初审和省通信管理局审核。各省要求和时间不同，以备案控制台提示为准。
6. 获得备案号后，在网站页脚展示备案号并链接至[工信部备案系统](https://beian.miit.gov.cn/)。网站在大陆正式开通后，再按所在地要求完成公安联网备案。

备案期间不要提前把未备案域名解析到大陆 OSS/CDN，也不要停止当前 Vercel 站点。

## 5. OSS 和 CDN 创建建议

### OSS

- 区域优先选主要访客附近的大陆地域；不确定时可从杭州或上海开始。
- Bucket 名使用独立名称，例如 `deanhuo-cn-web`，不要与后台上传仓库混用。
- 优先使用私有 Bucket，并在 CDN 回源配置中授权读取私有 OSS；若该能力或套餐不适用，再评估公共读。
- 开启版本控制或至少保留历史发布前缀，方便回滚。
- 首页设为 `index.html`，错误页可先设为 `index.html` 或单独的 `404.html`（当前站点是多 HTML 页面，不需要 SPA 重写）。
- OSS 中只上传 `dist-cn/`；`admin/`、`api/` 和原始相册目录不得上传。

### CDN

- 加速区域选择“中国大陆”。源站选择上述 OSS Bucket，回源 Host 使用 OSS 提供的源站域名。
- 先绑定备案后的预览子域名，例如 `cn-preview.deanhuo.com`，通过验收后再添加 `www.deanhuo.com`。
- 配置 HTTPS 证书，强制 HTTP 跳转 HTTPS，启用 TLS 1.2/1.3、HTTP/2；HTTP/3 可在兼容性验证后开启。
- 开启 Gzip/Brotli 压缩；保留音频 Range 请求。
- 缓存键保留查询参数，或者确保每次发布后主动刷新 CSS/JS；当前页面使用了少量版本查询参数。
- 不要对 HTML 设置一年缓存，也不要将 `/api/` 配进公开 CDN。

建议缓存规则：

| 路径 | CDN 缓存 | 浏览器缓存 | 发布动作 |
| --- | ---: | ---: | --- |
| `*.html` | 5 分钟 | 0 / 必须校验 | 发布后刷新 |
| `assets/data/**`, `assets/lyrics/**` | 5 分钟 | 1 分钟 | 内容更新后刷新 |
| `css/**`, `js/**` | 1 天 | 1 小时 | 每次发布刷新 |
| `assets/images/**`, `assets/audio/**` | 30 天 | 1 天 | 同名覆盖时刷新 |
| `assets/fonts/**` | 1 年 | 30 天 | 文件名变化时发布 |
| `assets/vendor/**` | 1 年 | 1 年 immutable | 文件名已带版本号 |

## 6. 无中断切换清单

1. 保持 Vercel 生产部署和现有 DNS 完全不动。
2. 上传 `dist-cn/`，通过 OSS 源站地址检查文件、MIME 类型、中文文件名和音频 Range。
3. 使用 `cn-preview.deanhuo.com` 验证 CDN，至少覆盖中国移动、联通、电信和一台真实手机网络。
4. 检查全部公开页面、浏览器 Console、404、字体、图片 `srcset`、歌词、音乐播放和知识文章。
5. 检查响应头、HTTPS 证书、压缩、缓存命中、回源比例；重复访问静态资源时应出现 CDN 命中。
6. 切换前一天把 `www` 的 DNS TTL 降到 600 秒。记录当前 Vercel DNS 值和截图。
7. 只把 `www` 的 CNAME 改到阿里云 CDN；根域名和后台暂不动。观察 24 小时。
8. 稳定后再处理根域名 301 和 `admin.deanhuo.com`。根域名的记录类型按 AliDNS 当时支持能力选择，不要强行使用违反 DNS 规则的裸域 CNAME。
9. 确认无误后再逐步延长 TTL。Vercel 保留至少两周作为回滚源站。

## 7. 回滚

出现大量 4xx/5xx、证书异常、资源加载失败或国内性能反而下降时：

1. 立即把 `www` DNS 恢复到切换前记录；不要删除 CDN 或 OSS 内容。
2. 在阿里云 CDN 暂停新增流量并保留日志，用于排查。
3. 等 TTL 生效后，从移动/联通/电信分别确认已经回到 Vercel。
4. 修复后先重新走预览域名验收，不能直接二次切生产。

因为 Vercel 站始终保留且上传脚本不删除远端对象，DNS 回切和版本回滚互不依赖。

## 8. 切换后验收指标

- 中国大陆三网请求成功率目标：至少 99%。
- 首页 HTML 的大陆三网中位 TTFB 目标：低于 300 ms；较差地区 P95 目标低于 1 s。
- 首屏不再请求 Google Fonts、unpkg、jsDelivr、Unsplash 或 UI Avatars。
- 图片请求按视口命中 640/1280/1920 WebP，而不是 3–5 MB 原图。
- 静态资源重复访问显示 CDN 命中，API 响应永不被公开缓存。

上线前后的测试必须使用相同节点、相近时段和相同 URL，保存结果以便回归。

## 9. 官方入口

- [阿里云 ICP 备案](https://beian.aliyun.com/)
- [阿里云备案文档](https://help.aliyun.com/zh/icp-filing/)
- [OSS 文档](https://help.aliyun.com/zh/oss/)
- [ossutil 2.0 文档](https://help.aliyun.com/zh/oss/developer-reference/ossutil-overview)
- [阿里云 CDN 文档](https://help.aliyun.com/zh/cdn/)
