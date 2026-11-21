import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { generate, OUT_PATH, TOKENS_PATH } from '../scripts/gen-theme';
import { darkColors, fontFiles, lightColors, type } from '../src/theme/tokens';

const root = join(__dirname, '..');

test('src/theme/tokens.ts is up to date with docs/design/focus-tokens.json', () => {
  const fresh = generate(readFileSync(TOKENS_PATH, 'utf8'));
  assert.equal(readFileSync(OUT_PATH, 'utf8').replace(/\r\n/g, '\n'), fresh, 'Run `npm run theme`');
});

test('the theme is the dusty rose pack, light and dark', () => {
  assert.equal(lightColors.primary, '#9C4F67');
  assert.equal(darkColors.primary, '#E3A9BA');
  assert.deepEqual(Object.keys(darkColors).sort(), Object.keys(lightColors).sort());
  assert.match(type.display.fontFamily, /^Lexend_/);
  assert.match(type.body.fontFamily, /^AtkinsonHyperlegibleNext_/);
});

test('every font the type styles need is loaded at start-up', () => {
  const layout = readFileSync(join(root, 'src', 'app', '_layout.tsx'), 'utf8');
  for (const f of fontFiles) assert.ok(new RegExp(`useFonts\\(\\{[^}]*\\b${f}\\b`, 's').test(layout), `${f} isn't loaded in _layout.tsx`);
});

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

test('no hand-picked colours outside src/theme (teal is gone)', () => {
  const themeDir = join(root, 'src', 'theme');
  const bad: string[] = [];
  for (const f of files(join(root, 'src'))) {
    if (f.startsWith(themeDir)) continue;
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b(?![\w-])|rgba?\(/.test(line.replace(/\/\/.*$/, ''))) bad.push(`${f.slice(root.length + 1)}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, []);
});
