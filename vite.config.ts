import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    solidPlugin(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: [
        "favicon.ico",
        "apple-touch-icon-180x180.png",
        "pwa-64x64.png",
        "pwa-192x192.png",
        "pwa-512x512.png",
        "maskable-icon-512x512.png",
      ],
      manifest: {
        name: "APOZH / АПОЖ — reverse song game",
        short_name: "APOZH",
        description: "A local reverse-song party game",
        id: "/",
        scope: "/",
        theme_color: "#15142c",
        background_color: "#15142c",
        display: "standalone",
        orientation: "landscape",
        start_url: "/",
        categories: ["games", "entertainment", "music"],
        icons: [
          {
            src: "pwa-64x64.png",
            sizes: "64x64",
            type: "image/png",
          },
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg}"],
        navigateFallback: "index.html",
      },
    }),
  ],
  server: {
    host: "0.0.0.0",
    port: 4174,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 4174,
    strictPort: true,
  },
  build: {
    target: "es2022",
  },
});
