# BabyReader

> 本项目 fork 自 [KingJing1/babyreader](https://github.com/KingJing1/babyreader)。
> 
> 本项目的 Git 地址是：[https://github.com/chenpblog/babyreader.git](https://github.com/chenpblog/babyreader.git)

BabyReader 是一款专为 macOS 设计的本地 Markdown 文档阅读器，旨在提供沉浸、无干扰的极致阅读体验。

**本项目专注于 Markdown 文档的渲染与阅读，不再支持 EPUB，并引入了更丰富的扩展排版支持。**

## 核心特性

- **只读 Markdown**：纯粹的 Markdown (.md) 及文本 (.txt) 阅读器，排版精美。
- **暗黑/明亮/护眼主题**：提供深色、浅色、暖黄护眼等多种阅读背景，完美契合不同光线环境。
- **富文本渲染增强**：
  - **代码高亮**：内置 Highlight.js，支持多语言语法高亮。
  - **Mermaid.js**：原生支持 Mermaid 流程图、时序图、甘特图等。
  - **PlantUML 渲染**：支持 PlantUML 图表渲染（支持在线渲染及本地 `plantuml.jar` 渲染）。
  - **LaTeX 数学公式**：内置 KaTeX，数学公式排版优雅快速。
- **双栏编辑模式**：按下 `Cmd+E` 可切换至双栏实时编辑与预览模式，修改后自动保存。
- **多窗口与缩放**：支持独立多窗口对比阅读，并支持 `Cmd+`/`Cmd-` 自由缩放字体大小。
- **无重度依赖**：纯 Objective-C 原生外壳 + WKWebView 构建，无需 Electron，无需 Node.js，极速轻量。

## 安装指南

安装需要 macOS 且已安装 Xcode 命令行工具（clang）。

```bash
# 安装 Xcode 命令行工具（如果未安装）
xcode-select --install

# 克隆并编译本项目
git clone https://github.com/chenpblog/babyreader.git
cd babyreader
./scripts/build.sh
```

脚本会自动编译原生二进制程序、打包应用并将其安装至 `~/Applications/BabyReader.app`。同时它会向 Launch Services 注册，并将 BabyReader 设为 `.md` 和 `.txt` 文件的默认打开方式。

## 使用说明

- **双击任何 `.md` 或 `.txt` 文件**：即可直接在 BabyReader 中以精美的排版视图阅读。
- **命令行打开**：
  ```bash
  open -a BabyReader ~/path/to/article.md
  ```
- **快捷键**：
  - `Cmd+E`：在“只读阅读”与“双栏编辑”模式之间切换（编辑模式下修改会自动保存）。
  - `Cmd+` / `Cmd-` / `Cmd+0`：放大 / 缩小 / 恢复默认字号。
  - `Cmd+N`：新建窗口。
  - `Cmd+O`：打开文件。

## 目录结构

```
babyreader/
├── native/
│   ├── main.m          # Objective-C 原生应用：窗口、WKWebView、菜单及文件关联
│   ├── Info.plist      # 应用元数据与文件关联配置
│   └── AppIcon.icns    # 应用程序图标
├── web/
│   ├── index.html      # WKWebView 承载容器
│   ├── styles.css      # 阅读主题、Markdown 排版与 UI 样式
│   ├── app.js          # Markdown 渲染逻辑、Mermaid/PlantUML 渲染、原生交互桥梁
│   ├── lib/
│   │   ├── marked.min.js      # Markdown 解析器
│   │   ├── highlight.min.js   # 代码高亮库
│   │   ├── mermaid.min.js     # Mermaid 图表渲染
│   │   ├── pako_deflate.min.js # PlantUML 编码压缩库
│   │   ├── katex.min.js       # LaTeX 数学公式库
│   │   └── auto-render.min.js # LaTeX 自动渲染脚本
│   └── assets/
│       └── cat-logo.png       # 软件 Logo/吉祥物
└── scripts/
    └── build.sh        # 一键编译、打包、签名、注册与安装脚本
```

## PlantUML 配置说明

在阅读界面点击左下角的设置齿轮图标 ⚙️，可以配置 PlantUML 的渲染方式：
1. **在线渲染（默认）**：若未勾选“启用本地 PlantUML 渲染”，则将图表代码压缩后通过 PlantUML 官方在线服务器渲染生成图片。
2. **本地渲染**：勾选“启用本地 PlantUML 渲染”后，需指定您本地的 `plantuml.jar` 路径以及 Java 可执行路径（默认为 `/usr/bin/java`），即可在无网环境下进行本地秒级渲染。

## 许可证

[MIT](LICENSE)
