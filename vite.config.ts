import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The site is served from https://tgpiercy.github.io/hockey-roguelite/
  base: '/hockey-roguelite/',
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
