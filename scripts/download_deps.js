const fs = require('fs');
const path = require('path');

const libDir = path.join(__dirname, '../web/lib');
if (!fs.existsSync(libDir)) {
  fs.mkdirSync(libDir, { recursive: true });
}

const files = [
  { url: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/highlight.min.js', fallbackUrl: 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.8.0/build/highlight.min.js', name: 'highlight.min.js' },
  { url: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/github.min.css', fallbackUrl: 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.8.0/build/styles/github.min.css', name: 'github.min.css' },
  { url: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/github-dark.min.css', fallbackUrl: 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.8.0/build/styles/github-dark.min.css', name: 'github-dark.min.css' },
  { url: 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.8/katex.min.js', fallbackUrl: 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js', name: 'katex.min.js' },
  { url: 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.8/katex.min.css', fallbackUrl: 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css', name: 'katex.min.css' },
  { url: 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.8/contrib/auto-render.min.js', fallbackUrl: 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js', name: 'auto-render.min.js' },
  { url: 'https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.4.0/mermaid.min.js', fallbackUrl: 'https://cdn.jsdelivr.net/npm/mermaid@10.4.0/dist/mermaid.min.js', name: 'mermaid.min.js' },
  { url: 'https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako_deflate.min.js', fallbackUrl: 'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako_deflate.min.js', name: 'pako_deflate.min.js' }
];

async function download(url, dest) {
  console.log(`Downloading ${url} -> ${dest}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(dest, buffer);
  console.log(`Finished ${dest}`);
}

async function main() {
  for (const file of files) {
    const dest = path.join(libDir, file.name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      console.log(`Skipping ${file.name} as it already exists.`);
      continue;
    }
    let success = false;
    const urlsToTry = [file.url, file.fallbackUrl].filter(Boolean);
    for (const url of urlsToTry) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          await download(url, dest);
          success = true;
          break;
        } catch (err) {
          console.error(`Attempt ${attempt} failed for ${file.name} using ${url}:`, err.message || err);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      if (success) break;
    }
    if (!success) {
      console.error(`Failed to download ${file.name} after all attempts.`);
      process.exit(1);
    }
  }
  console.log('All downloads completed successfully.');
}

main();
