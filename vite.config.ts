import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// package.json is the one place the project's addresses are written down.
// The deploy workflow can override them (see .github/workflows/ship.yml).
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  homepage?: string;
  repository?: { url?: string };
};
const siteUrl = (process.env.SITE_URL || pkg.homepage || '.').replace(/\/$/, '');
const repoUrl = process.env.REPO_URL || pkg.repository?.url || 'https://github.com';

export default defineConfig({
  // Relative paths, so the same build works at <user>.github.io/banff-trip-cost/,
  // on a custom domain, or from any subfolder.
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      // Two pages: the trip cost (index.html) and where to stay (stay.html).
      input: {
        main: new URL('./index.html', import.meta.url).pathname,
        stay: new URL('./stay.html', import.meta.url).pathname,
      },
    },
  },
  plugins: [
    {
      name: 'fill-in-links',
      transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl).replaceAll('%REPO_URL%', repoUrl),
    },
  ],
  test: {
    include: ['src/**/*.test.ts', 'pipeline/**/*.test.ts'],
  },
});
