import { describe, expect, it } from 'vitest';

// Every source file, as text, keyed by its path.
const sources = import.meta.glob<string>('../src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const stripComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const importTargets = (code: string): string[] =>
  [...code.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)].map((m) => m[1] as string);

const FORBIDDEN_IMPORT = /(^|\/)(game|ui)(\/|$)|^phaser|^preact/;
const DOM_GLOBAL =
  /\b(window|document|navigator|localStorage|sessionStorage|indexedDB|requestAnimationFrame|HTMLElement|globalThis|self)\b/;

const allFiles = Object.entries(sources);
const pureFiles = allFiles.filter(([path]) => /\/src\/(core|sim)\//.test(path));

describe('folder rules', () => {
  it('finds the source files', () => {
    expect(allFiles.length).toBeGreaterThan(0);
    expect(pureFiles.length).toBeGreaterThan(0);
  });

  it.each(pureFiles)('%s imports nothing from src/game, src/ui, Phaser or Preact', (_path, code) => {
    const bad = importTargets(stripComments(code)).filter((target) => FORBIDDEN_IMPORT.test(target));
    expect(bad).toEqual([]);
  });

  it.each(pureFiles)('%s does not touch the DOM', (_path, code) => {
    expect(stripComments(code).match(DOM_GLOBAL)?.[0]).toBeUndefined();
  });

  it.each(allFiles)('%s takes randomness only from src/core/rng', (_path, code) => {
    expect(stripComments(code)).not.toMatch(/Math\s*\.\s*random|getRandomValues|randomUUID/);
  });
});
