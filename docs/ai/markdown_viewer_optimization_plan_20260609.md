# Markdown 阅读页面优化执行计划 (Reference: MPE)

本项目（BabyReader）是一个基于 macOS WebView 包装的 Markdown 与文本阅读器。为了提升 Markdown 的阅读和预览体验，我们将参考 **VS Code Markdown Preview Enhanced (MPE)** 插件，对阅读页面进行全方位的视觉和功能优化，增加 PlantUML 本地与在线渲染支持，同时**完全移除原有的 EPUB 文件阅读支持**，使项目聚焦于极致的 Markdown 渲染体验。

## 1. 优化目标与核心功能

1. **高级排版与主题视觉调优 (Premium Typography & Styling)**：
   - 优化整体版面布局、字号比例、行高、段落间距。
   - 优化 `dark`、`light` 和 `sepia` 护眼模式的色彩搭配，引入更具品质感和杂志感的配色体系。
   - 增加**衬线/无衬线字体切换**（Serif / Sans-serif），方便用户切换更适合深度阅读的宋体与清晰的系统字体。
   - 重新设计表格、引用块（Blockquote）和任务列表（Task lists）的展示样式。
2. **代码语法高亮 (Syntax Highlighting)**：
   - 引入 `highlight.js`，自动识别和高亮所有代码块。
   - 实现代码高亮主题的自动切换：暗色主题使用 `github-dark` 样式，亮色与护眼主题使用 `github` 样式。
   - 重新设计代码块包装器（`.code-block`），添加语言类型标签栏，并美化复制按钮。
3. **数学公式渲染 (KaTeX)**：
   - 引入 `KaTeX`，在本地渲染行内公式 `$...$` 和块级公式 `$$...$$`。
4. **Mermaid 流程图支持**：
   - 引入 `mermaid.js`，对 ` ```mermaid ` 代码块进行图形化渲染，呈现流程图、时序图等。
5. **PlantUML 图形渲染支持（支持本地与在线执行）**：
   - 匹配 ` ```puml ` 或 ` ```plantuml ` 代码块。
   - **在线模式（默认）**：若未配置本地执行，在前端对 PUML 文本进行 Deflate 压缩和专用的 Base64 变体编码，通过官方的在线 PlantUML 服务器 `http://www.plantuml.com/plantuml/svg/` 动态加载 SVG。
   - **本地执行模式（可配置）**：若用户开启“本地执行”并配置了本地 `plantuml.jar` 路径与 `java` 可执行路径，前端将在渲染时向 macOS Native 侧发送渲染消息。Native 侧将在后台通过 `NSTask` 执行 `java -jar plantuml.jar -pipe -tsvg`，通过 stdin 传入 PUML 代码并获取 stdout 输出的 SVG 代码，最后异步回传至前端渲染。
6. **滚动监听目录 (Scrollspy Table of Contents)**：
   - 监听阅读区域的滚动事件，动态高亮当前正在阅读的章节。
   - 美化 TOC 面板，增加平滑的过渡动效和现代感的毛玻璃效果。
7. **【新增变动】完全移除 EPUB 格式支持**：
   - 彻底删除 `jszip.min.js` 依赖，不再对其进行打包与引入。
   - 清理所有前端与 Native 中有关 EPUB 二进制解析、类型判断、只读限制等逻辑，使代码大幅精简，专注于文本/Markdown。

---

## 2. 核心链路代码变动与修改范围

### 2.1 [MODIFY] [index.html](file:///Users/chenping/open/babyreader/web/index.html)
- **【移除】** 删除 `<script src="lib/jszip.min.js"></script>` 的引用。
- 引入 `lib/katex.min.css` 用于数学公式显示。
- 在 `</body>` 前引入下载好的库：
  - `lib/highlight.min.js`
  - `lib/katex.min.js`
  - `lib/auto-render.min.js`
  - `lib/mermaid.min.js`
- 在侧边栏（Sidebar）添加两个按钮：
  - 字体切换按钮组（Serif `宋`/ Sans `系统`）。
  - 设置按钮（齿轮图标 ⚙️），用于呼出配置面板。
- 在主界面添加一个隐藏的**设置面板**（Settings Panel，毛玻璃质感浮层）。
- 动态加载代码高亮样式的 `<link id="hljs-theme">` 标签。
- 欢迎界面提示信息移除 `.epub` 描述。

### 2.2 [MODIFY] [app.js](file:///Users/chenping/open/babyreader/web/app.js)
- **【精简】** 彻底删除 `parseEpub` 异步解析函数。
- **【精简】** 移除全局 `state` 的 `contentType`（不再区分 epub 和 text）以及关于 EPUB 文件的只读保护逻辑（如限制编辑模式等）。
- **状态与配置管理**：
  - 在 `state` 中维护 `fontFamily`、`pumlLocal`、`pumlJarPath`、`pumlJavaPath`，并存入 `localStorage`。
- **渲染引擎更新 (`renderArticle` & `renderPreview`)**：
  - 去除 EPUB HTML 的直接输出分支，将所有文档流统一按照 Markdown/纯文本 进行渲染。
  - 在 Markdown 解析为 HTML 并放入页面后，按顺序执行：
    1. **PlantUML 渲染**（本地发送请求或在线生成 img 标签）。
    2. **Mermaid 图表渲染**。
    3. **代码语法高亮**。
    4. **KaTeX 数学公式渲染**。
- **Native 回传处理**：
  - 在 `window.appHost` 下增加 `receivePlantumlResult({ id, svg, error })`，用以异步填充 SVG。
- **滚动监听 (Scrollspy)**：
  - 监听 `.reader` 容器的 `scroll` 事件，动态高亮 TOC 中当前可见最上方的标题。
- **字体控制**：支持 `setFontFamily(family)` 并控制 `body` 的 `data-font-family` 属性。
- **文件打开提示**：在 `openFileBrowser` 文件选择器的 accept 列表中移除 `.epub` 及 `application/epub+zip`。

### 2.3 [MODIFY] [styles.css](file:///Users/chenping/open/babyreader/web/styles.css)
- **字体控制样式**：根据 `[data-font-family="serif"]` 将阅读区域的正文、段落字体切换为衬线宋体。
- **设置面板样式**：毛玻璃（Glassmorphism）质感的精致弹窗。
- **代码高亮和代码块包装样式**：
  - 重新设计 `.code-block` 容器，引入微弱阴影和精美圆角。
  - 添加顶部语言标签栏样式。
- **Markdown 元素排版美化**：美化引用块 `blockquote`、表格 `table` 以及任务列表（Task lists）。
- **TOC 目录面板优化**：
  - 采用现代 Glassmorphism 设计，加深在暗色下的对比度。
  - TOC 列表项滚动监听激活状态：高亮的 TOC 项添加左边框指示条，并带有平滑的 transition。

### 2.4 [MODIFY] [main.m](file:///Users/chenping/open/babyreader/native/main.m)
- **【精简】** 在 `supportedTypes` 中删除 `[UTType typeWithFilenameExtension:@"epub"]` 和 `org.idpf.epub-container` 的注册。
- **【精简】** 在 `openFileAtURL:` 中，删除解析 `.epub` 的 binary 读取分支和 base64 转换逻辑，只保留纯文本读取分支。
- **拦截 Bridge 消息**：
  - 在 `userContentController:didReceiveScriptMessage:` 中，增加对 `"renderPlantuml"` 消息的捕获。
- **后台 NSTask 执行**：
  - 在子线程中启动 `NSTask` 执行 `java -jar <jarPath> -pipe -tsvg`，通过 stdin 传入 PUML 代码并获取 stdout 输出的 SVG，最后异步回传至前端渲染。

### 2.5 [MODIFY] [build.sh](file:///Users/chenping/open/babyreader/scripts/build.sh)
- **【精简】** 移除复制 `web/lib/jszip.min.js` 到 bundle 的行。
- 修改复制 `web/lib` 中库文件的指令，确保所有新增的 js 和 css 库都被复制到最终的 `.app` bundle 的指定路径中。

### 2.6 [DELETE] [jszip.min.js](file:///Users/chenping/open/babyreader/web/lib/jszip.min.js)
- 彻底从工作区中删除 `web/lib/jszip.min.js` 依赖文件。

---

## 3. 第三方依赖库准备

我们将通过脚本或 curl 下载以下第三方依赖并放入 `web/lib/` 目录下：
1. **Highlight.js**:
   - `highlight.min.js`
   - `github.min.css`
   - `github-dark.min.css`
2. **KaTeX**:
   - `katex.min.js`
   - `katex.min.css`
   - `auto-render.min.js`
3. **Mermaid**:
   - `mermaid.min.js`

---

## 4. 验证计划

1. **自动构建与部署验证**：
   - 运行 `./scripts/build.sh` 编译并安装应用，检查编译是否成功、文件复制是否完整，确认 `jszip.min.js` 已被清除。
2. **功能与渲染验证**：
   - 准备一份测试文件 `test.md`（包含代码块、行内/块级数学公式、Mermaid 流程图、多级标题、表格、任务列表以及 PlantUML 图形）。
   - 在 BabyReader 中打开并检查：
     - 代码高亮、数学公式渲染、Mermaid 是否正常。
     - **在线/本地 PlantUML 验证**：分别在在线模式和本地模式下验证 PlantUML SVG 图是否能完美绘制。
     - **移除 EPUB 验证**：尝试拖入或打开 `.epub` 文件，确认系统或应用报错/拦截，不再进行加载。
     - 切换主题和宽度时，渲染样式和代码高亮配色是否正常自适应切换。
     - 切换字体（宋体/系统）时，正文字体是否能够相应切换，排版是否合理。
