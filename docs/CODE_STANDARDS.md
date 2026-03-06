# Dean's Website - 代码规范 (Code Standards)

**版本**: v1.0  
**生效日期**: 2026-01-26

---

## 1. 总体原则 (General Principles)
- **语义化 (Semantic)**: 始终使用正确的HTML5标签（如 `<nav>`, `<main>`, `<article>`, `<section>`）。
- **可维护性 (Maintainability)**: 代码应清晰、注释良好，避免过度复杂的逻辑。
- **一致性 (Consistency)**: 遵循统一的命名和格式化风格。

---

## 2. HTML 规范

### 2.1 结构
- 必须包含完整的 `<!DOCTYPE html>` 声明。
- `<html>` 标签必须指定 `lang` 属性（如 `lang="en"` 或 `lang="zh-CN"`）。
- `<head>` 中必须包含 `meta charset="UTF-8"` 和 `viewport` 设置。

### 2.2 命名与属性
- **ID**: 使用 `kebab-case` (如 `hero-section`, `main-nav`)，仅用于唯一的页面元素或JS钩子。
- **Class**: 使用 `kebab-case` (如 `btn-primary`, `card-content`)。推荐使用 BEM (Block Element Modifier) 思想，但保持简洁。
- **属性顺序**: `class` -> `id` -> `name` -> `data-*` -> `src/href`。

### 2.3 注释
- 主要区块之间应保留注释，标明区块开始。
```html
<!-- Navigation -->
<nav>...</nav>

<!-- Hero Section -->
<section>...</section>
```

---

## 3. CSS 规范

### 3.1 变量系统 (CSS Variables)
- 所有颜色、字体、间距、圆角必须使用 `variables.css` 中定义的变量，严禁硬编码（Hard-coding）。
- **错误示范**: `color: #00FF88;`
- **正确示范**: `color: var(--accent-color);`

### 3.2 命名约定
- 遵循 BEM 命名风格的简化版：
    - `.block`
    - `.block-element` (注意是单横线连接，为了书写简便)
    - `.block.modifier` (状态使用辅助类，如 `.active`, `.disabled`)

### 3.3 属性顺序
1. Positioning (position, top, z-index)
2. Box Model (display, width, margin, padding)
3. Typography (font, color, text-align)
4. Visual (background, border, shadow)
5. Misc (transition, opacity)

### 3.4 响应式
- 采用 **Mobile-First** 或 **Desktop-First** 策略需统一（本项目目前采用 Desktop-First，通过 `@media (max-width: ...)` 适配移动端）。
- 断点变量化（如果使用预处理器），或保持断点值一致（768px, 1024px）。

---

## 4. JavaScript 规范

### 4.1 变量声明
- 优先使用 `const`，其次 `let`，禁止使用 `var`。
- 变量名使用 `camelCase` (如 `currentUser`, `navItems`)。

### 4.2 函数
- 函数名使用 `camelCase` 动词开头 (如 `initGallery`, `toggleMenu`)。
- 优先使用箭头函数 `() => {}` 处理回调。

### 4.3 DOM 操作
- 缓存 DOM 查询结果，避免重复查询。
- 使用 `data-*` 属性来存储状态或配置，而不是依赖 class。

---

## 5. 文件与目录命名
- **文件夹**: 全部小写，使用连字符 (如 `assets/images`, `css`, `js`)。
- **文件**: 全部小写，使用连字符 (如 `style.css`, `main.js`, `project-detail.html`)。
- **图片**: 描述性命名 (如 `profile-avatar.jpg`, `project-dashboard.png`)。

---
