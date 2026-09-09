import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    solidPlugin(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["apoj-icon.svg", "pcm-recorder.worklet.js"],
      manifest: {
        name: "APOZH / АПОЖ — reverse song game",
        short_name: "APOZH",
        description: "A local reverse-song party game",
        theme_color: "#15142c",
        background_color: "#15142c",
        display: "standalone",
        orientation: "landscape",
        start_url: ".",
        icons: [
          {
            src: "apoj-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
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
