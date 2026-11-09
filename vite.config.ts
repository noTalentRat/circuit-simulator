/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

export default defineConfig({
  // Relative asset paths, so the built app works from any folder (GitHub Pages, a share link, a USB stick).
  base: './',
  plugins: [svelte()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
