# Dean's Website - 发布流程规范 (Deployment Process)

**版本**: v1.0  
**生效日期**: 2026-01-26

---

## 1. 发布前检查清单 (Pre-flight Checklist)

在每次发布更新前，必须完成以下检查：

### 1.1 功能测试
- [ ] **链接检查**: 确认所有导航链接、"View All" 链接、外部项目链接均可正常跳转。
- [ ] **新标签页**: 确认所有详情页链接是否按预期在 `_blank` (新标签页) 打开。
- [ ] **媒体资源**: 确认所有图片、音乐文件加载正常，无 404 错误。

### 1.2 视觉与响应式
- [ ] **移动端检查**: 在手机模式（Chrome DevTools）下检查布局是否错乱。
- [ ] **暗色模式**: 确认文字在深色背景下的对比度是否足够清晰。

### 1.3 代码质量
- [ ] **清理代码**: 删除无用的 console.log 调试信息。
- [ ] **格式化**: 确保 HTML/CSS/JS 代码已格式化，缩进统一。

---

## 2. 发布方式 (Deployment Options)

本项目为纯静态网站 (Static Website)，可部署于任何静态托管服务。

### 方案 A: GitHub Pages (推荐)
1. 将项目代码提交至 GitHub 仓库。
2. 进入仓库 Settings -> Pages。
3. Source 选择 `main` branch (或 `master`)，文件夹选择 `/ (root)`。
4. 保存后，GitHub 会自动生成访问链接 (如 `username.github.io/repo-name`)。

### 方案 B: Vercel / Netlify (高性能)
1. 注册 Vercel 或 Netlify 账号。
2. 连接 GitHub 账号并导入本项目仓库。
3. 保持默认设置（Framework Preset: None），点击 Deploy。
4. 获得自动分配的域名 (如 `dean-website.vercel.app`)。
5. **优势**: 全球CDN加速，自动化构建，支持自定义域名 HTTPS。

### 方案 C: 传统服务器 (Nginx/Apache)
1. 将项目所有文件上传至服务器 `/var/www/html/` (或自定义目录)。
2. 配置 Nginx 指向 `index.html`。
3. 确保文件权限正确 (通常为 755 或 644)。

---

## 3. 版本管理 (Versioning)

- 建议使用 Git 进行版本控制。
- 提交信息 (Commit Message) 规范：
    - `feat: ...` (新增功能)
    - `fix: ...` (修复Bug)
    - `docs: ...` (文档更新)
    - `style: ...` (样式调整，不影响逻辑)
    - `content: ...` (更新照片/文字内容)

---

## 4. 紧急回滚 (Rollback)

如果发布后发现严重问题：
1. **Git回滚**: `git revert <commit-hash>` 回退到上一个稳定版本。
2. **重新部署**: 推送回滚后的代码，触发自动部署。

---
