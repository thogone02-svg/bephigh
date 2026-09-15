import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', '_site');

/**
 * Wrap the mockup body in a complete HTML document.
 * `index.html` holds only the page body so that it can also be published as an
 * artifact, which supplies its own document skeleton.
 * @param {string} body - Contents of `mockup/index.html`.
 * @returns {string} Standalone HTML document.
 */
const wrap = (body) => {
  const title = body.match(/<title>([^<]*)<\/title>/)?.[1] ?? '원고 작업실';

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="description" content="${title} — 화면 시안" />
    <meta name="robots" content="noindex, nofollow" />
    <meta name="color-scheme" content="light dark" />
    <style>
      :root {
        padding-top: env(safe-area-inset-top, 0px);
        padding-bottom: env(safe-area-inset-bottom, 0px);
      }

      img {
        max-width: 100%;
      }

      [hidden] {
        display: none !important;
      }
    </style>
  </head>
  <body>
${body}
  </body>
</html>
`;
};

const body = await readFile(join(here, 'index.html'), 'utf8');

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'index.html'), wrap(body));
await writeFile(join(outDir, '.nojekyll'), '');
console.info(`mockup built -> ${join(outDir, 'index.html')}`);
