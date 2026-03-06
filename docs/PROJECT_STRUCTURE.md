# Dean's Website - 目录结构规范 (Project Structure)

**版本**: v1.0  
**生效日期**: 2026-01-26

---

## 1. 目录层级概览

```
/Dean (项目根目录)
├── /assets              # 静态资源目录
│   ├── /images          # 图片资源 (网站UI图、头像等)
│   ├── /music           # 音乐文件 (mp3等)
│   └── /icons           # 自定义图标 (SVG等)
│
├── /css                 # 样式文件目录
│   ├── variables.css    # [核心] 设计系统变量定义
│   └── style.css        # [核心] 全局及组件样式
│
├── /js                  # 脚本文件目录
│   └── main.js          # 主逻辑脚本
│
├── /docs                # 项目文档目录
│   ├── CODE_STANDARDS.md
│   ├── PROJECT_STRUCTURE.md
│   └── DEPLOYMENT_PROCESS.md
│
├── index.html           # 网站首页
├── photos.html          # 照片详情页
├── lyrics.html          # 歌词详情页
├── music.html           # 音乐详情页
└── projects.html        # 项目详情页
```

---

## 2. 模块职责划分

### 2.1 根目录 (Root)
- 仅存放 HTML 入口文件。
- 每个 HTML 文件对应一个独立的页面路由。

### 2.2 Assets (资源层)
- **Images**: 存放所有图片。建议按模块建立子文件夹（如 `/images/projects`, `/images/photos`）如果图片数量较多。
- **Music**: 存放试听音频文件。

### 2.3 CSS (表现层)
- **variables.css**: 这里的定义是网站的"源头"。修改主题色、字体、圆角大小时，**仅**修改此文件。
- **style.css**: 包含 Reset, Typography, Utility Classes, Components, Layouts。如果项目变大，应拆分为 `components/` 和 `layouts/` 目录。

### 2.4 JS (交互层)
- **main.js**: 处理全局交互（如导航栏高亮、移动端菜单切换、图标初始化）。
- 特定页面的逻辑（如音乐播放器）如果变得复杂，应拆分为独立文件（如 `music-player.js`）。

---

## 3. 引用路径规范
- **相对路径**: 在 HTML 中引用资源时，使用相对路径。
    - 正确: `src="assets/images/logo.png"`
    - 正确: `href="css/style.css"`
- **绝对路径**: 仅用于外部链接（CDN, 友情链接）。

---
