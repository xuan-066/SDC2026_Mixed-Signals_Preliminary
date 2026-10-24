import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.resolve(root, '../..');
const output = path.join(workspace, 'generated-artifacts');
await build({ configFile: path.join(root, 'vite.standalone.config.ts') });

// Embed only the Latin variable-font faces used by the existing design.
// The resulting HTML has no network dependency, including fonts and logo.
const fontRequest = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400..800&family=Fraunces:opsz,wght@9..144,600..800&family=JetBrains+Mono:wght@400..700&display=swap';
const response = await fetch(fontRequest, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36' } });
if (!response.ok) throw new Error('Could not download fonts for the offline HTML export: ' + response.status);
const fontCss = await response.text();
let faces = [...fontCss.matchAll(/\/\* latin \*\/\s*(@font-face\s*\{[^}]+\})/g)].map((match) => match[1]).join('\n');
// Google may return unsplit TrueType faces rather than subset-labelled WOFF2.
if (!faces) faces = [...fontCss.matchAll(/@font-face\s*\{[^}]+\}/g)].map((match) => match[0]).join('\n');
if (!faces) throw new Error('No font faces were returned for the standalone export.');
for (const url of new Set([...faces.matchAll(/url\((https:[^)]+)\)/g)].map((match) => match[1]))) {
  const font = await fetch(url);
  if (!font.ok) throw new Error('Could not embed a required font.');
  faces = faces.replaceAll(url, 'data:' + (font.headers.get('content-type') || 'font/woff2') + ';base64,' + Buffer.from(await font.arrayBuffer()).toString('base64'));
}

const assets = path.join(output, 'standalone-build/assets');
const files = await fs.readdir(assets);
const javascript = files.filter((file) => file.endsWith('.js'));
if (javascript.length !== 1) throw new Error('The standalone export must contain exactly one JavaScript bundle.');
const js = await fs.readFile(path.join(assets, javascript[0]), 'utf8');
let css = (await Promise.all(files.filter((file) => file.endsWith('.css')).map((file) => fs.readFile(path.join(assets, file), 'utf8')))).join('\n');
css = css.replace(/@import\s*(?:url\([^;]+\)|["'][^"']+["'])[^;]*;/g, '');
if (/@import\b|url\(["']?https?:/i.test(css)) throw new Error('A stylesheet still depends on an external asset.');
const logo = 'data:image/png;base64,' + (await fs.readFile(path.join(root, 'public/glacier-link-logo.png'))).toString('base64');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Glacier Link interactive standalone demo. All edits stay in your own browser. No backend or real business data.">
<meta name="theme-color" content="#f4bd78">
<title>Glacier Link — Standalone HTML Demo</title>
<link rel="icon" href="${logo}">
<style>${faces}\n${css.replace(/<\/style/gi, '<\\/style')}</style>
</head><body><div id="root"></div>
<noscript>This interactive demo requires JavaScript. It runs entirely in your browser.</noscript>
<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>
</body></html>`;
const destination = path.join(output, 'glacier-link-demo.html');
await fs.writeFile(destination, html);
console.info(`Standalone HTML exported: ${destination} (${Math.round(Buffer.byteLength(html) / 1024)} KB)`);
