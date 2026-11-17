import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The site is served from https://tgpiercy.github.io/hockey-roguelite/
  base: '/hockey-roguelite/',
  test: {
    include: ['tests/**/*.test.ts'],
    // Several tests play whole games. They take two or three seconds alone and more when every file runs at once,
    // so the usual five-second limit fails them on a busy machine without anything being wrong.
    testTimeout: 20_000,
  },
});
