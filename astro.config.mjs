import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

import react from '@astrojs/react';

export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
  },

  server: { port: 2468 },
  devToolbar: { enabled: false },
  integrations: [react()]
});