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
  content: ''
};

/* --- Native Bridge --- */
function sendNative(type, payload = {}) {
  if (!state.isNative) return;
  window.webkit.messageHandlers.native.postMessage({ type, payload });
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
   Rendering
   ============================================================ */
function renderArticle() {
  const article = document.getElementById('article');
  const welcome = document.getElementById('welcome');

  if (!state.content || !state.content.trim()) {
    article.innerHTML = '';
    if (welcome) {
      welcome.style.display = '';
      article.appendChild(welcome);
    }
    return;
  }

  // Render content
  const html = preprocessCustomBlocks(state.content);
  article.innerHTML = html;
}

function renderPreview() {
  const preview = document.getElementById('preview');
  if (!preview) return;

  const raw = document.getElementById('editor')?.value || '';
  const html = preprocessCustomBlocks(raw);
  preview.innerHTML = html;
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

  if (mode === 'read') {
    // Flush editor content before switching — only if coming from edit mode
    if (prevMode === 'edit' && editor) {
      state.content = editor.value;
    }

    reader.style.display          = '';
    editorContainer.style.display = 'none';
    btnRead.classList.add('active');
    btnEdit.classList.remove('active');
    renderArticle();

  } else if (mode === 'edit') {
    reader.style.display          = 'none';
    editorContainer.style.display = 'flex';
    btnRead.classList.remove('active');
    btnEdit.classList.add('active');

    // Populate textarea with raw content
    editor.value = state.content;

    // Render initial preview
    renderPreview();

    // Focus editor
    editor.focus();
  }
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
  if (!state.content) return;
  const blob = new Blob([state.content], { type: 'text/markdown;charset=utf-8' });
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
        // Sync editor content to state before saving
        if (state.mode === 'edit') {
          state.content = document.getElementById('editor')?.value || state.content;
        }
        if (state.isNative) {
          sendNative('save', { content: state.content, path: state.currentPath });
        } else {
          saveFileBrowser();
        }
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
   appHost API — called by native layer
   ============================================================ */
window.appHost = {
  receiveDocument({ path, name, content }) {
    state.currentPath = path;
    state.currentName = name;
    state.content     = content;

    const fileNameEl = document.getElementById('fileName');
    if (fileNameEl) fileNameEl.textContent = name;

    renderArticle();
    setMode('read');
  },

  notifySaved({ path, name } = {}) {
    // Update state if Save As provided new path
    if (path) state.currentPath = path;
    if (name) state.currentName = name;

    const fileNameEl = document.getElementById('fileName');
    if (!fileNameEl) return;

    const displayName = name || state.currentName;
    fileNameEl.textContent = '已保存';
    fileNameEl.style.color = 'var(--accent)';

    setTimeout(() => {
      fileNameEl.textContent = displayName;
      fileNameEl.style.color = '';
    }, 1200);
  },

  getContent() {
    // Called by native to fetch current content before saving
    if (state.mode === 'edit') {
      state.content = document.getElementById('editor')?.value || state.content;
    }
    return state.content;
  },

  toggleEditMode() {
    setMode(state.mode === 'read' ? 'edit' : 'read');
  },

  zoomIn()    { zoomLevel = Math.min(200, zoomLevel + 10); applyZoom(); },
  zoomOut()   { zoomLevel = Math.max(60, zoomLevel - 10);  applyZoom(); },
  zoomReset() { zoomLevel = 100; applyZoom(); }
};

/* ============================================================
   DOMContentLoaded — Boot
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  configureMarked();

  // Set up editor live preview with debounce
  const editor = document.getElementById('editor');
  if (editor) {
    const debouncedPreview = debounce(() => {
      state.content = editor.value;
      renderPreview();
    }, 300);

    editor.addEventListener('input', debouncedPreview);
  }

  setupKeyboard();

  // Tell native layer the web view is ready
  sendNative('ready');
});
