import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

declare const process: { env: Record<string, string | undefined> };

// base = "/" für Vercel/eigene Domain; für GitHub Pages "/sv-beitraege/"
// (wird im Deploy-Workflow via BASE_PATH gesetzt).
export default defineConfig({
  base: process.env.BASE_PATH || "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Stufenkasse",
        short_name: "Stufenkasse",
        description: "Beiträge & Beteiligungen der Stufe verwalten",
        theme_color: "#4f46e5",
        background_color: "#0e1017",
        display: "standalone",
        orientation: "portrait",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});
