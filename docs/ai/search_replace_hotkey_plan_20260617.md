# 编辑器高亮选中可见性优化执行计划

解决在编辑模式下，由于焦点在查找输入框而导致左侧编辑器文本框 (`#editor`) 失去焦点，从而使文本选择高亮（灰色）极不明显的问题。

## 解决方案
1. **强对比度 Selection 样式**：
   在 `styles.css` 中，为 `.editor::selection` 显式设置 `background: var(--accent) !important; color: #fff !important;`。在 WebKit 中，即使输入框失去焦点，使用强对比度的 solid 颜色定义的选择区依然具有极高的辨识度。
2. **全局 Cmd+G / F3 快捷键导航**：
   - 增加快捷键 `Cmd+G` / `Ctrl+G` (下一个) 和 `Shift+Cmd+G` (上一个)，以及 `F3` 快捷键。
   - 当用户在编辑器中打字并使用快捷键导航时，将焦点保持在编辑器中（`keepFocus = true`），此时文本选择处于激活状态，呈现最亮的原生蓝色/主题高亮。
3. **增加 `keepFocus` 参数控制**：
   在 `selectActiveMatch(keepFocus)` 中，如果 `keepFocus` 为 `true`，则不将焦点挪回查找框，让光标和强高亮保持在编辑器内。

## 拟议的修改

### web 核心模块

#### [MODIFY] [styles.css](file:///Users/chenping/open/babyreader/web/styles.css)
- 增加 `.editor::selection` 样式，指定高对比度的 `var(--accent)` 背景与白色文字。

#### [MODIFY] [app.js](file:///Users/chenping/open/babyreader/web/app.js)
- **快捷键绑定**：在 `setupKeyboard()` 中增加对 `F3`、`Cmd+G` / `Ctrl+G` 键的拦截。
- **高亮逻辑优化**：
  - 更新 `navigateSearch` 和 `selectActiveMatch`，引入 `keepFocus` 参数。
  - 在通过快捷键 (`Cmd+G` / `F3`) 导航时传入 `keepFocus = true`。

---

## 验证计划
1. **测试查找高亮**：
   - 进入编辑模式，按 `Cmd+F`，输入关键词，按 `Enter`。验证左侧编辑器中被选中的词即便在失焦状态下，依然呈现出清晰的橙色高亮。
2. **测试快捷键导航**：
   - 焦点在左侧编辑器中，按 `Cmd+G` 或 `F3`，验证高亮是否向下跳转，且左侧编辑器依然保持焦点，呈现最亮的原生选择状态。
   - 按 `Shift+Cmd+G` 向上跳转。
