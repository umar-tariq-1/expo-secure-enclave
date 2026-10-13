#!/usr/bin/env node
// Keeps README.md and llms-full.txt in sync with docs/*.md, which are the single source of truth.
//
//   node scripts/sync-docs.mjs          rewrite the generated parts
//   node scripts/sync-docs.mjs --check  exit 1 if anything is out of date (CI)
//
// README.md contains `<!-- include docs/<page>.md -->` ... `<!-- end include -->` blocks; this
// script replaces what's between each pair with that page, adapted to live inside one long
// document: front matter and `<!-- site-only -->` blocks dropped, headings demoted one level (the
// home page's title dropped instead), and links between pages turned into in-document anchors.
// llms-full.txt is the same pages, in the same order, under its own header.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

const PAGES = [
  'index.md',
  'getting-started.md',
  'api.md',
  'recipes.md',
  'server-verification.md',
  'testing.md',
  'security-model.md',
  'comparison.md',
  'faq.md',
  'troubleshooting.md',
];

// GitHub's heading anchors: lowercase, punctuation dropped, spaces to hyphens.
function slug(heading) {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

function readPage(page) {
  return readFileSync(join(root, 'docs', page), 'utf8').replace(/^---\n[\s\S]*?\n---\n+/, '');
}

function pageTitle(page) {
  return readPage(page).match(/^# (.+)$/m)[1];
}

// Where a link to another page should point once every page is in one document.
const pageAnchor = Object.fromEntries(
  PAGES.map((page) => [page, page === 'index.md' ? 'expo-secure-enclave' : slug(pageTitle(page))])
);

function adapt(page) {
  let inFence = false;
  const out = [];
  for (const line of readPage(page)
    .replace(/<!-- site-only -->[\s\S]*?<!-- \/site-only -->\n?/g, '')
    .split('\n')) {
    if (/^(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && /^#{1,5} /.test(line)) {
      if (page === 'index.md' && line.startsWith('# ')) continue;
      if (page !== 'index.md') {
        out.push(`#${line}`);
        continue;
      }
    }
    out.push(
      inFence
        ? line
        : line.replace(/\]\(([a-z-]+\.md)(#[^)]*)?\)/g, (match, target, hash) => {
            if (!(target in pageAnchor)) throw new Error(`${page}: link to unknown page ${target}`);
            return `](${hash ?? `#${pageAnchor[target]}`})`;
          })
    );
  }
  return out.join('\n').trim();
}

function syncReadme(readme) {
  return readme.replace(
    /(<!-- include docs\/([a-z-]+\.md) -->)[\s\S]*?(<!-- end include -->)/g,
    (match, open, page, close) => `${open}\n${adapt(page)}\n${close}`
  );
}

const LLMS_FULL_HEADER = `# expo-secure-enclave: complete reference

> Hardware-backed ECDSA P-256 signing for Expo and React Native. Keys are generated in the iOS
> Secure Enclave or the Android Keystore (StrongBox-backed where available), never leave it, and
> every signature requires a fresh Face ID, Touch ID, or fingerprint check. Public keys are base64
> X9.63 points; signatures are base64 DER ECDSA/SHA-256. This file is generated from the
> documentation pages in docs/ of https://github.com/umar-tariq-1/expo-secure-enclave.`;

function buildLlmsFull() {
  return `${LLMS_FULL_HEADER}\n\n${PAGES.map(adapt).join('\n\n')}\n`;
}

const targets = [
  ['README.md', (current) => syncReadme(current)],
  ['llms-full.txt', () => buildLlmsFull()],
];

let stale = false;
for (const [file, build] of targets) {
  const path = join(root, file);
  let current = '';
  try {
    current = readFileSync(path, 'utf8');
  } catch {}
  const next = build(current);
  if (next === current) continue;
  stale = true;
  if (check) console.error(`${file} is out of date: run \`npm run docs\`.`);
  else {
    writeFileSync(path, next);
    console.log(`updated ${file}`);
  }
}
if (check && stale) process.exit(1);
