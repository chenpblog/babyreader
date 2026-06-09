/* ============================================================
   BabyReader — app.js
   ============================================================ */

'use strict';

/* --- State --- */
const state = {
  isNative: !!window.webkit?.messageHandlers?.native,
  mode: 'read',        // 'read' | 'edit'
  currentPath: null,
  currentName: null,
  content: '',
  dirty: false,
  theme: localStorage.getItem('babyreader_theme') || 'dark',
  width: localStorage.getItem('babyreader_width') || 'default',
  fontFamily: localStorage.getItem('babyreader_font_family') || 'sans',
  tocOpen: localStorage.getItem('babyreader_toc_open') === 'true',
  tocNumbered: localStorage.getItem('babyreader_toc_numbered') === 'true',
  pumlLocal: localStorage.getItem('babyreader_puml_local') === 'true',
  pumlJarPath: localStorage.getItem('babyreader_puml_jar_path') || '',
  pumlJavaPath: localStorage.getItem('babyreader_puml_java_path') || '/usr/bin/java'
};

/* --- Native Bridge --- */
function sendNative(type, payload = {}) {
  if (!state.isNative) return;
  window.webkit.messageHandlers.native.postMessage({ type, payload });
}

async function copyTextToClipboard(text) {
  if (!text) return false;

  if (state.isNative) {
    sendNative('copyText', { text });
    return true;
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // Fall through to the legacy selection-based copy.
    }
  }

  const hiddenInput = document.getElementById('hiddenPathInput');
  if (!hiddenInput) return false;

  hiddenInput.value = text;
  hiddenInput.style.left = '0';
  hiddenInput.style.opacity = '0.01';
  hiddenInput.focus();
  hiddenInput.select();

  let copied = false;
  try { copied = document.execCommand('copy'); } catch (e) { copied = false; }

  hiddenInput.style.left = '-9999px';
  hiddenInput.style.opacity = '0';
  hiddenInput.blur();

  return copied;
}

function setDirty(nextDirty, notify = true) {
  state.dirty = !!nextDirty;
  if (notify) {
    sendNative('dirtyChanged', {
      dirty: state.dirty,
      content: state.content
    });
  }
}

/* ============================================================
   Custom Block Preprocessor
   ============================================================ */

/**
 * Replace [[TYPE]]...[[/TYPE]] blocks with <div class="block-type">...</div>
 * before passing the remainder to marked.
 *
 * Supported types:
 *   TITLE, SUBTITLE, SIGN, HEADING — single-content, rendered as-is
 *   LEDE, QUOTE                    — multi-paragraph (split on \n\n)
 *   META                           — lines joined with <br>
 *   BREAK                          — visual separator (renders as <hr>)
 *
 * Returns an object { html, remaining } where:
 *   html      — fully pre-rendered HTML string for all custom blocks
 *   remaining — the leftover text that marked should handle
 *
 * Strategy: walk the content top-to-bottom, collect custom-block segments
 * as pre-rendered HTML, and leave the rest for marked.
 */
function preprocessCustomBlocks(content) {
  // Supported block types (case-insensitive match)
  const BLOCK_TYPES = ['TITLE', 'SUBTITLE', 'LEDE', 'META', 'HEADING', 'QUOTE', 'SIGN', 'BREAK'];
  const typePattern = BLOCK_TYPES.join('|');

  // Regex: [[TYPE]] ... [[/TYPE]]  — DOTALL via workaround
  const blockRegex = new RegExp(
    `\\[\\[(${typePattern})\\]\\]([\\s\\S]*?)\\[\\[\\/(${typePattern})\\]\\]`,
    'gi'
  );

  // Also detect first h1 and restyle it
  let isFirstH1 = true;

  const segments = []; // { type: 'custom'|'markdown', content: string }
  let lastIndex = 0;

  let match;
  blockRegex.lastIndex = 0;

  while ((match = blockRegex.exec(content)) !== null) {
    const openType  = match[1].toUpperCase();
    const innerRaw  = match[2];
    const closeType = match[3].toUpperCase();

    // Collect markdown text before this block
    if (match.index > lastIndex) {
      segments.push({ type: 'markdown', content: content.slice(lastIndex, match.index) });
    }

    // Only process if open/close tags match
    if (openType === closeType) {
      segments.push({ type: 'custom', blockType: openType, content: innerRaw.trim() });
    } else {
      // Mismatched tags — treat as plain markdown
      segments.push({ type: 'markdown', content: match[0] });
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last block
  if (lastIndex < content.length) {
    segments.push({ type: 'markdown', content: content.slice(lastIndex) });
  }

  // Now build output HTML
  let outputHTML = '';

  for (const seg of segments) {
    if (seg.type === 'markdown') {
      // Render through marked; then post-process first h1
      let mdHTML = marked.parse(seg.content);
      if (isFirstH1) {
        // Add .is-title class to the very first <h1> in the document
        mdHTML = mdHTML.replace(/<h1([ >])/, (m, rest) => {
          isFirstH1 = false;
          return `<h1 class="is-title"${rest === '>' ? '>' : ' ' + rest}`;
        });
      }
      outputHTML += mdHTML;
    } else {
      outputHTML += renderCustomBlock(seg.blockType, seg.content);
    }
  }

  return outputHTML;
}

/**
 * Render a single custom block to HTML.
 */
function renderCustomBlock(type, inner) {
  const cls = 'block-' + type.toLowerCase();

  switch (type) {
    case 'LEDE':
    case 'QUOTE': {
      // Split on double newlines → multiple <p> tags
      const paragraphs = inner
        .split(/\n{2,}/)
        .map(p => p.trim())
        .filter(Boolean)
        .map(p => `<p>${inlineMarkdown(p)}</p>`)
        .join('');
      return `<div class="${cls}">${paragraphs}</div>\n`;
    }

    case 'META': {
      // Each line becomes text separated by <br>
      const lines = inner
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => inlineMarkdown(l))
        .join('<br>');
      return `<div class="${cls}">${lines}</div>\n`;
    }

    case 'TITLE':
    case 'SUBTITLE':
    case 'SIGN': {
      return `<div class="${cls}">${inlineMarkdown(inner)}</div>\n`;
    }

    case 'HEADING': {
      return `<div class="${cls}">${escapeHtml(inner)}</div>\n`;
    }

    case 'BREAK': {
      return '<hr class="block-break">\n';
    }

    default: {
      // Unknown type — wrap generically
      return `<div class="${cls}">${inlineMarkdown(inner)}</div>\n`;
    }
  }
}

/**
 * Process inline markdown (bold, italic, code, links) but not block-level.
 * Uses a lightweight approach rather than a full marked.parse to avoid
 * wrapping in <p> tags.
 */
function inlineMarkdown(text) {
  // We use marked's lexer trick: parse and strip the outer <p> wrapper.
  const html = marked.parseInline(text);
  return html;
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugifyHeading(text, fallbackIndex) {
  const slug = (text || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || `heading-${fallbackIndex}`;
}

/**
 * Normalize a file path: ensure it starts with / and does not end with /.
 * Returns null if the input is falsy.
 */
function normalizePath(p) {
  if (!p) return null;
  let result = p;
  // Ensure leading /
  if (!result.startsWith('/')) result = '/' + result;
  // Remove trailing /
  while (result.length > 1 && result.endsWith('/')) result = result.slice(0, -1);
  return result;
}

/* ============================================================
   PlantUML Encoder & Native Render Bridge
   ============================================================ */

// Map 6-bit index to PlantUML Base64 character set
function encode6bit(b) {
  if (b < 10) return String.fromCharCode(48 + b);
  b -= 10;
  if (b < 26) return String.fromCharCode(65 + b);
  b -= 26;
  if (b < 26) return String.fromCharCode(97 + b);
  b -= 26;
  if (b === 0) return '-';
  if (b === 1) return '_';
  return '?';
}

function append3bytes(b1, b2, b3) {
  const c1 = b1 >> 2;
  const c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
  const c3 = ((b2 & 0xF) << 2) | (b3 >> 6);
  const c4 = b3 & 0x3F;
  return encode6bit(c1 & 0x3F) +
         encode6bit(c2 & 0x3F) +
         encode6bit(c3 & 0x3F) +
         encode6bit(c4 & 0x3F);
}

function encode64(data) {
  let r = "";
  for (let i = 0; i < data.length; i += 3) {
    if (i + 2 < data.length) {
      r += append3bytes(data[i], data[i + 1], data[i + 2]);
    } else if (i + 1 < data.length) {
      r += append3bytes(data[i], data[i + 1], 0);
    } else {
      r += append3bytes(data[i], 0, 0);
    }
  }
  return r;
}

function getPlantumlOnlineUrl(text) {
  try {
    // UTF-8 encode -> DeflateRaw -> PlantUML Base64
    const utf8Encoder = new TextEncoder();
    const bytes = utf8Encoder.encode(text);
    // Use pako to perform raw deflate
    if (typeof pako !== 'undefined') {
      const deflated = pako.deflateRaw(bytes);
      return `http://www.plantuml.com/plantuml/svg/${encode64(deflated)}`;
    }
    return '';
  } catch (err) {
    console.error('PlantUML online encoding error:', err);
    return '';
  }
}

// Track pending PlantUML renders for DOM update
const pumlRequests = new Map();

function requestPlantumlLocalRender(id, code) {
  if (!state.isNative) {
    updatePumlResult(id, '', '错误: 当前不在客户端内，无法执行本地渲染，请使用在线渲染模式。');
    return;
  }
  
  pumlRequests.set(id, code);
  sendNative('renderPlantuml', {
    id: id,
    content: code,
    jarPath: state.pumlJarPath,
    javaPath: state.pumlJavaPath
  });
}

function updatePumlResult(id, svg, error) {
  const container = document.getElementById(`puml-${id}`);
  if (!container) return;
  
  if (error) {
    container.innerHTML = `<div class="puml-error">
      <div class="puml-error-title">PlantUML 渲染失败</div>
      <pre>${escapeHtml(error)}</pre>
    </div>`;
  } else if (svg) {
    // Insert SVG directly
    container.innerHTML = svg;
  }
  pumlRequests.delete(id);
}

/* ============================================================
   Marked Configuration
   ============================================================ */
function configureMarked() {
  if (typeof marked === 'undefined') return;

  marked.setOptions({
    gfm: true,
    breaks: false
  });
}

/* ============================================================
   Settings (Theme & Width & Fonts)
   ============================================================ */
function setTheme(theme) {
  state.theme = theme;
  localStorage.setItem('babyreader_theme', theme);
  document.body.setAttribute('data-theme', theme);

  document.querySelectorAll('[data-theme-btn]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-theme-btn') === theme);
  });

  // Sync highlight.js theme stylesheet
  const themeLink = document.getElementById('hljs-theme');
  if (themeLink) {
    themeLink.href = theme === 'dark' ? 'lib/github-dark.min.css' : 'lib/github.min.css';
  }

  // Update mermaid theme
  if (typeof mermaid !== 'undefined') {
    mermaid.initialize({
      startOnLoad: false,
      theme: theme === 'dark' ? 'dark' : 'default',
      securityLevel: 'loose'
    });
  }
}

function setWidth(width) {
  state.width = width;
  localStorage.setItem('babyreader_width', width);
  document.body.setAttribute('data-width', width);

  document.querySelectorAll('[data-width-btn]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-width-btn') === width);
  });
}

function setFontFamily(family) {
  state.fontFamily = family;
  localStorage.setItem('babyreader_font_family', family);
  document.body.setAttribute('data-font-family', family);

  document.querySelectorAll('[data-font-btn]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-font-btn') === family);
  });
}

function toggleSettingsPanel() {
  const panel = document.getElementById('settingsPanel');
  if (!panel) return;
  const isHidden = panel.style.display === 'none';
  panel.style.display = isHidden ? 'block' : 'none';
  if (isHidden) {
    document.getElementById('pumlLocal').checked = state.pumlLocal;
    document.getElementById('pumlJarPath').value = state.pumlJarPath;
    document.getElementById('pumlJavaPath').value = state.pumlJavaPath;
  }
}

function saveSettings() {
  const local = document.getElementById('pumlLocal').checked;
  const jar = document.getElementById('pumlJarPath').value;
  const java = document.getElementById('pumlJavaPath').value;

  state.pumlLocal = local;
  state.pumlJarPath = jar;
  state.pumlJavaPath = java;

  localStorage.setItem('babyreader_puml_local', local);
  localStorage.setItem('babyreader_puml_jar_path', jar);
  localStorage.setItem('babyreader_puml_java_path', java);

  if (state.mode === 'read') {
    renderArticle();
  } else if (state.mode === 'edit') {
    renderPreview();
  }
}

function applyInitialSettings() {
  setTheme(state.theme);
  setWidth(state.width);
  setFontFamily(state.fontFamily);
}

/* ============================================================
   Rendering
   ============================================================ */
function renderArticle() {
  const article = document.getElementById('article');
  const reader = document.getElementById('reader');
  const welcome = document.getElementById('welcome');
  const isWelcome = !state.currentPath && (!state.content || !state.content.trim());

  if (reader) reader.classList.toggle('is-welcome', isWelcome);

  if (isWelcome) {
    article.innerHTML = '';
    if (welcome) {
      welcome.style.display = '';
      article.appendChild(welcome);
    }
    updateToc();
    return;
  }

  if (!state.content || !state.content.trim()) {
    article.innerHTML = '';
    updateToc();
    return;
  }

  const html = preprocessCustomBlocks(state.content);
  article.innerHTML = html;
  
  enhanceMarkdownContent(article);
  updateToc();
}

function enhanceMarkdownContent(root) {
  if (!root) return;

  // 1. Process PlantUML blocks
  let pumlCounter = 0;
  root.querySelectorAll('pre > code').forEach(code => {
    const pre = code.parentElement;
    if (!pre) return;
    const isPuml = code.classList.contains('language-puml') || code.classList.contains('language-plantuml');
    if (!isPuml) return;

    const pumlCode = code.textContent.trim();
    const container = document.createElement('div');
    container.className = 'puml-svg-container';
    
    if (state.pumlLocal && state.pumlJarPath) {
      pumlCounter++;
      const id = `req-${Date.now()}-${pumlCounter}`;
      container.id = `puml-${id}`;
      container.innerHTML = '<div class="puml-loading">正在通过本地 PlantUML 渲染图表...</div>';
      pre.replaceWith(container);
      requestPlantumlLocalRender(id, pumlCode);
    } else {
      const url = getPlantumlOnlineUrl(pumlCode);
      if (url) {
        container.innerHTML = `<img src="${url}" alt="PlantUML Diagram" class="puml-online-img" style="max-width: 100%; display: block; margin: 0 auto;">`;
      } else {
        container.innerHTML = '<div class="puml-error">PlantUML 编码出错。</div>';
      }
      pre.replaceWith(container);
    }
  });

  // 2. Process Mermaid blocks
  if (typeof mermaid !== 'undefined') {
    let mermaidCounter = 0;
    root.querySelectorAll('pre > code.language-mermaid').forEach(code => {
      const pre = code.parentElement;
      if (!pre) return;
      mermaidCounter++;
      
      const mId = `mermaid-render-${Date.now()}-${mermaidCounter}`;
      const codeText = code.textContent.trim();
      const div = document.createElement('div');
      div.className = 'mermaid-svg-container';
      div.id = mId;
      pre.replaceWith(div);

      try {
        mermaid.render(mId + '-svg', codeText).then(({ svg }) => {
          div.innerHTML = svg;
        }).catch(err => {
          console.error('Mermaid render error:', err);
          div.innerHTML = `<div class="mermaid-error">Mermaid 渲染错误: ${escapeHtml(err.message || err)}</div>`;
        });
      } catch (err) {
        console.error('Mermaid exception:', err);
        div.innerHTML = `<div class="mermaid-error">Mermaid 渲染异常: ${escapeHtml(err.message || err)}</div>`;
      }
    });
  }

  // 3. Process Syntax Highlighting & Code Copy bar
  if (typeof hljs !== 'undefined') {
    root.querySelectorAll('pre > code').forEach(code => {
      const pre = code.parentElement;
      if (!pre || pre.parentElement?.classList.contains('code-block')) return;

      let lang = 'text';
      code.classList.forEach(cls => {
        if (cls.startsWith('language-')) {
          lang = cls.replace('language-', '');
        }
      });

      hljs.highlightElement(code);

      const wrapper = document.createElement('div');
      wrapper.className = 'code-block';

      const header = document.createElement('div');
      header.className = 'code-block-header';
      
      const langSpan = document.createElement('span');
      langSpan.className = 'code-block-lang';
      langSpan.textContent = lang.toUpperCase();

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'code-copy-btn-new';
      button.textContent = '复制';
      button.setAttribute('aria-label', '复制代码');

      button.addEventListener('click', async () => {
        const copied = await copyTextToClipboard(code.textContent || '');
        if (!copied) return;

        button.textContent = '已复制';
        button.classList.add('copied');
        setTimeout(() => {
          button.textContent = '复制';
          button.classList.remove('copied');
        }, 1200);
      });

      header.append(langSpan, button);
      pre.before(wrapper);
      wrapper.append(header, pre);
    });
  }

  // 4. Process KaTeX math formulas
  if (typeof renderMathInElement !== 'undefined') {
    renderMathInElement(root, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true }
      ],
      throwOnError: false
    });
  }
}

function renderPreview() {
  const preview = document.getElementById('preview');
  if (!preview) return;

  const raw = document.getElementById('editor')?.value || '';
  const html = preprocessCustomBlocks(raw);
  preview.innerHTML = html;
  enhanceMarkdownContent(preview);
}

/* ============================================================
   Mode Switching
   ============================================================ */
function setMode(mode) {
  const prevMode = state.mode;
  state.mode = mode;

  const reader          = document.getElementById('reader');
  const editorContainer = document.getElementById('editorContainer');
  const btnRead         = document.getElementById('btnRead');
  const btnEdit         = document.getElementById('btnEdit');
  const editor          = document.getElementById('editor');
  const sidebar         = document.getElementById('sidebar');

  if (mode === 'read') {
    if (prevMode === 'edit' && editor) {
      state.content = editor.value;
      if (state.isNative && state.currentPath && state.dirty) {
        sendNative('save');
      }
    }

    reader.style.display          = '';
    editorContainer.style.display = 'none';
    if (sidebar) sidebar.style.display = '';
    btnRead.classList.add('active');
    btnEdit.classList.remove('active');
    renderArticle();

  } else if (mode === 'edit') {
    reader.style.display          = 'none';
    editorContainer.style.display = 'flex';
    if (sidebar) sidebar.style.display = 'none';
    closeTocPanel();
    btnRead.classList.remove('active');
    btnEdit.classList.add('active');

    editor.value = state.content;
    renderPreview();
    editor.focus();
  }
}

/* ============================================================
   Table of Contents
   ============================================================ */
function getTocElements() {
  return {
    panel: document.getElementById('tocPanel'),
    list: document.getElementById('tocList'),
    group: document.getElementById('tocSidebarGroup'),
    button: document.getElementById('tocToggleBtn'),
    numberButton: document.getElementById('tocNumberBtn')
  };
}

function setTocNumbered(numbered, render = true) {
  state.tocNumbered = !!numbered;
  localStorage.setItem('babyreader_toc_numbered', state.tocNumbered ? 'true' : 'false');

  const { numberButton } = getTocElements();
  if (numberButton) {
    numberButton.classList.toggle('active', state.tocNumbered);
    numberButton.setAttribute('aria-pressed', state.tocNumbered ? 'true' : 'false');
  }

  if (render) updateToc();
}

function setTocOpen(open) {
  state.tocOpen = !!open;
  localStorage.setItem('babyreader_toc_open', state.tocOpen ? 'true' : 'false');

  const { panel, button } = getTocElements();
  document.body.classList.toggle('toc-open', state.tocOpen);
  if (panel) panel.hidden = !state.tocOpen;
  if (button) {
    button.classList.toggle('active', state.tocOpen);
    button.setAttribute('aria-expanded', state.tocOpen ? 'true' : 'false');
  }
}

function closeTocPanel() {
  const { panel, button } = getTocElements();
  document.body.classList.remove('toc-open');
  if (panel) panel.hidden = true;
  if (button) {
    button.classList.remove('active');
    button.setAttribute('aria-expanded', 'false');
  }
}

function updateToc() {
  const article = document.getElementById('article');
  const reader = document.getElementById('reader');
  const { panel, list, group, button } = getTocElements();
  if (!article || !list || !group || !panel) return;

  const headings = Array.from(article.querySelectorAll('h1, h2, h3, h4, .block-heading'))
    .filter(heading => heading.textContent.trim());
  const shouldShow = state.mode === 'read' && !reader?.classList.contains('is-welcome') && headings.length > 1;

  group.style.display = shouldShow ? '' : 'none';
  if (!shouldShow) {
    list.innerHTML = '';
    closeTocPanel();
    return;
  }

  const headingMeta = headings.map(heading => ({
    heading,
    level: heading.classList.contains('block-heading')
      ? 2
      : Math.min(4, Math.max(1, Number(heading.tagName.slice(1)) || 2))
  }));
  const baseLevel = Math.min(...headingMeta.map(item => item.level));
  const counters = [0, 0, 0, 0];
  const usedIds = new Set();
  list.innerHTML = '';
  headingMeta.forEach(({ heading, level }, index) => {
    let baseId = heading.id || slugifyHeading(heading.textContent, index + 1);
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id) || (document.getElementById(id) && document.getElementById(id) !== heading)) {
      id = `${baseId}-${suffix++}`;
    }
    heading.id = id;
    usedIds.add(id);

    const link = document.createElement('button');
    link.type = 'button';
    link.className = `toc-item toc-level-${level}`;
    if (state.tocNumbered) {
      const depth = Math.min(counters.length, Math.max(1, level - baseLevel + 1));
      for (let i = 0; i < depth - 1; i++) {
        if (counters[i] === 0) counters[i] = 1;
      }
      counters[depth - 1] += 1;
      counters.fill(0, depth);

      const number = counters.slice(0, depth).filter(Boolean).join('.');
      const numberEl = document.createElement('span');
      numberEl.className = 'toc-number';
      numberEl.textContent = number;
      const labelEl = document.createElement('span');
      labelEl.className = 'toc-label';
      labelEl.textContent = heading.textContent.trim();
      link.append(numberEl, labelEl);
    } else {
      link.textContent = heading.textContent.trim();
    }
    link.addEventListener('click', () => {
      heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    list.appendChild(link);
  });

  setTocOpen(state.tocOpen);
  setTocNumbered(state.tocNumbered, false);
  if (button) button.disabled = false;
}

/* ============================================================
   Debounce
   ============================================================ */
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/* ============================================================
   Zoom
   ============================================================ */
let zoomLevel = 100; // percentage

function applyZoom() {
  document.documentElement.style.fontSize = (zoomLevel / 100 * 16) + 'px';
}

/* ============================================================
   Reload
   ============================================================ */
function reloadFile() {
  if (state.isNative) {
    sendNative('reload');
  }
}

/* ============================================================
   File Operations — Browser Fallback
   ============================================================ */
function openFileBrowser() {
  const input = document.createElement('input');
  input.type   = 'file';
  input.accept = '.md,.txt,text/markdown,text/plain';

  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      window.appHost.receiveDocument({
        path: file.name,
        name: file.name,
        content: ev.target.result
      });
    };
    reader.readAsText(file, 'UTF-8');
  };

  input.click();
}

function saveFileBrowser() {
  const blob = new Blob([state.content || ''], { type: 'text/markdown;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = state.currentName || 'document.md';
  a.click();
  URL.revokeObjectURL(url);
}

/* ============================================================
   Keyboard Shortcuts
   ============================================================ */
function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const mod   = isMac ? e.metaKey : e.ctrlKey;

    if (!mod) return;

    switch (e.key.toLowerCase()) {
      case 'o':
        e.preventDefault();
        if (state.isNative) {
          sendNative('open');
        } else {
          openFileBrowser();
        }
        break;

      case 's':
        e.preventDefault();
        if (state.mode === 'edit') {
          const editor = document.getElementById('editor');
          if (editor) state.content = editor.value;
        }
        if (state.isNative) {
          sendNative('save', { content: state.content, path: state.currentPath });
        } else {
          saveFileBrowser();
        }
        break;

      case 'r':
        e.preventDefault();
        reloadFile();
        break;

      case 'e':
        e.preventDefault();
        setMode(state.mode === 'read' ? 'edit' : 'read');
        break;

      case '=':
      case '+':
        e.preventDefault();
        zoomLevel = Math.min(200, zoomLevel + 10);
        applyZoom();
        break;

      case '-':
        e.preventDefault();
        zoomLevel = Math.max(60, zoomLevel - 10);
        applyZoom();
        break;

      case '0':
        e.preventDefault();
        zoomLevel = 100;
        applyZoom();
        break;
    }
  });
}

/* ============================================================
   Scrollspy & Throttle
   ============================================================ */
let currentActiveIndex = -1;

function setupScrollspy() {
  const reader = document.getElementById('reader');
  if (!reader) return;

  reader.addEventListener('scroll', throttle(() => {
    if (state.mode !== 'read') return;
    
    const article = document.getElementById('article');
    if (!article || reader.classList.contains('is-welcome')) return;

    const headings = Array.from(article.querySelectorAll('h1, h2, h3, h4, .block-heading'))
      .filter(heading => heading.textContent.trim());
    if (headings.length === 0) return;

    let activeIndex = 0;
    const scrollTolerance = 120; // 顶栏高度 + 微调值

    for (let i = 0; i < headings.length; i++) {
      const rect = headings[i].getBoundingClientRect();
      if (rect.top <= scrollTolerance) {
        activeIndex = i;
      } else {
        if (i > 0) {
          activeIndex = i - 1;
        }
        break;
      }
    }

    if (activeIndex !== currentActiveIndex) {
      currentActiveIndex = activeIndex;
      const tocPanel = document.getElementById('tocPanel');
      if (tocPanel) {
        const tocItems = tocPanel.querySelectorAll('.toc-item');
        tocItems.forEach((item, index) => {
          const isActive = index === activeIndex;
          item.classList.toggle('active', isActive);
          if (isActive) {
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        });
      }
    }
  }, 100));
}

function throttle(fn, delay) {
  let lastTime = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastTime >= delay) {
      fn.apply(this, args);
      lastTime = now;
    }
  };
}

/* ============================================================
   appHost API — called by native layer
   ============================================================ */
window.appHost = {
  async receiveDocument({ path, name, content }) {
    state.currentPath  = path;
    state.currentName  = name;

    const fileNameEl = document.getElementById('fileName');
    const copyBtn = document.getElementById('pathCopyBtn');

    const displayPath = normalizePath(path);
    state.currentPath = displayPath || path;

    if (fileNameEl) {
      fileNameEl.textContent = displayPath || name;
      fileNameEl.title = displayPath || name;
    }
    if (copyBtn) copyBtn.style.display = displayPath ? '' : 'none';

    state.content = content || '';

    setDirty(false);
    setMode('read');
    renderArticle();
  },

  notifySaved({ path, name } = {}) {
    if (path) state.currentPath = path;
    if (name) state.currentName = name;
    setDirty(false, false);

    const fileNameEl = document.getElementById('fileName');
    if (!fileNameEl) return;

    const displayName = normalizePath(state.currentPath) || name || state.currentName;
    fileNameEl.textContent = '已保存';
    fileNameEl.style.color = 'var(--accent)';

    setTimeout(() => {
      fileNameEl.textContent = displayName;
      fileNameEl.style.color = '';
    }, 1200);
  },

  getContent() {
    if (state.mode === 'edit') {
      const editor = document.getElementById('editor');
      if (editor) state.content = editor.value;
    }
    return state.content;
  },

  toggleEditMode() {
    setMode(state.mode === 'read' ? 'edit' : 'read');
  },

  receivePlantumlResult({ id, svg, error }) {
    updatePumlResult(id, svg, error);
  },

  zoomIn()    { zoomLevel = Math.min(200, zoomLevel + 10); applyZoom(); },
  zoomOut()   { zoomLevel = Math.max(60, zoomLevel - 10);  applyZoom(); },
  zoomReset() { zoomLevel = 100; applyZoom(); },

  setImmersive(on) {
    document.body.classList.toggle('immersive', !!on);
  }
};

/* ============================================================
   DOMContentLoaded — Boot
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  configureMarked();
  
  // Configure Mermaid theme before initial settings (which render)
  if (typeof mermaid !== 'undefined') {
    mermaid.initialize({
      startOnLoad: false,
      theme: state.theme === 'dark' ? 'dark' : 'default',
      securityLevel: 'loose'
    });
  }

  applyInitialSettings();

  const editor = document.getElementById('editor');
  if (editor) {
    const debouncedPreview = debounce(() => {
      state.content = editor.value;
      renderPreview();
    }, 300);

    editor.addEventListener('input', () => {
      state.content = editor.value;
      setDirty(true);
      debouncedPreview();
    });
  }

  setupKeyboard();
  setupScrollspy();

  async function copyPathToClipboard() {
    const path = state.currentPath;
    if (!path) return;

    const copyBtn = document.getElementById('pathCopyBtn');
    const fileNameEl = document.getElementById('fileName');
    const copied = await copyTextToClipboard(path);

    if (copied) showCopyFeedback(copyBtn, fileNameEl);
  }

  function showCopyFeedback(copyBtn, fileNameEl) {
    if (copyBtn) copyBtn.classList.add('copied');
    const original = fileNameEl?.textContent || '';
    if (fileNameEl) {
      fileNameEl.textContent = '已复制';
      fileNameEl.style.color = 'var(--accent)';
    }
    setTimeout(() => {
      if (copyBtn) copyBtn.classList.remove('copied');
      if (fileNameEl) {
        fileNameEl.textContent = original;
        fileNameEl.style.color = '';
      }
    }, 1200);
  }

  const pathCopyBtn = document.getElementById('pathCopyBtn');
  if (pathCopyBtn) pathCopyBtn.addEventListener('click', copyPathToClipboard);

  const tocToggleBtn = document.getElementById('tocToggleBtn');
  if (tocToggleBtn) {
    tocToggleBtn.addEventListener('click', () => {
      setTocOpen(!state.tocOpen);
    });
  }

  const tocNumberBtn = document.getElementById('tocNumberBtn');
  if (tocNumberBtn) {
    tocNumberBtn.addEventListener('click', () => {
      setTocNumbered(!state.tocNumbered);
    });
    setTocNumbered(state.tocNumbered, false);
  }

  // Populate inputs in settings panel on load
  const pumlLocalCheck = document.getElementById('pumlLocal');
  if (pumlLocalCheck) pumlLocalCheck.checked = state.pumlLocal;
  const pumlJarInput = document.getElementById('pumlJarPath');
  if (pumlJarInput) pumlJarInput.value = state.pumlJarPath;
  const pumlJavaInput = document.getElementById('pumlJavaPath');
  if (pumlJavaInput) pumlJavaInput.value = state.pumlJavaPath;

  sendNative('ready');
});
