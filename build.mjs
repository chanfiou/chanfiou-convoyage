import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

const STYLE_FILES = ['tokens.css', 'base.css', 'fonts.css', 'components.css', 'invoice.css'];

const BRAND_FONT = 'assets/fonts/archivo-brand.woff2';
const FONT_PLACEHOLDER = '__BRAND_FONT_SRC__';

const ENTRY_SCRIPT = `
import { startApp } from './js/app.js';
startApp(document.getElementById('app'));
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
`;

const readStyles = async () => {
  const parts = await Promise.all(
    STYLE_FILES.map((file) => readFile(path.join(SRC, 'styles', file), 'utf8')),
  );
  return parts.join('\n');
};

const bundleScript = async () => {
  const result = await build({
    stdin: { contents: ENTRY_SCRIPT, resolveDir: SRC, loader: 'js' },
    bundle: true,
    format: 'iife',
    target: ['es2022'],
    minify: false,
    write: false,
    charset: 'utf8',
  });
  return result.outputFiles[0].text;
};

const run = async () => {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(path.join(DIST, 'assets'), { recursive: true });

  const [template, styles, script, fontBuffer] = await Promise.all([
    readFile(path.join(SRC, 'index.html'), 'utf8'),
    readStyles(),
    bundleScript(),
    readFile(path.join(SRC, BRAND_FONT)),
  ]);

  const hostedStyles = styles.replaceAll(FONT_PLACEHOLDER, `../${BRAND_FONT}`);
  const inlineStyles = styles.replaceAll(
    FONT_PLACEHOLDER,
    `data:font/woff2;base64,${fontBuffer.toString('base64')}`,
  );

  const hostedHtml = template
    .replace('<!--STYLES-->', '<link rel="stylesheet" href="styles/app.css" />')
    .replace('<!--SCRIPT-->', '<script src="app.js" defer></script>');

  await mkdir(path.join(DIST, 'styles'), { recursive: true });
  await writeFile(path.join(DIST, 'index.html'), hostedHtml, 'utf8');
  await writeFile(path.join(DIST, 'styles', 'app.css'), hostedStyles, 'utf8');
  await writeFile(path.join(DIST, 'app.js'), script, 'utf8');
  await cp(path.join(SRC, 'manifest.webmanifest'), path.join(DIST, 'manifest.webmanifest'));

  const swSource = await readFile(path.join(SRC, 'sw.js'), 'utf8');
  const buildVersion = createHash('sha256')
    .update(template)
    .update(styles)
    .update(script)
    .update(swSource)
    .digest('hex')
    .slice(0, 8);
  await writeFile(
    path.join(DIST, 'sw.js'),
    swSource.replace(/CACHE_NAME = '[^']+'/, `CACHE_NAME = 'chanfiou-${buildVersion}'`),
    'utf8',
  );
  await cp(path.join(SRC, 'assets'), path.join(DIST, 'assets'), { recursive: true });

  const standaloneHtml = template
    .replace('<!--STYLES-->', `<style>\n${inlineStyles}\n</style>`)
    .replace('<!--SCRIPT-->', `<script>\n${script}\n</script>`)
    .replace('<link rel="manifest" href="manifest.webmanifest" />', '')
    .replace('<link rel="apple-touch-icon" href="assets/icon-192.png" />', '');

  await writeFile(path.join(DIST, 'chanfiou-app.html'), standaloneHtml, 'utf8');

  console.log('dist/index.html, dist/app.js, dist/styles/app.css, dist/chanfiou-app.html');
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
