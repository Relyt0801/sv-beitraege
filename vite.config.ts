import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

declare const process: { env: Record<string, string | undefined> };

// Woher kommt dieser Build? Ohne diese Angabe kann niemand sehen, welcher Stand
// gerade live ist – dann sucht man Fehler in Code, der gar nicht deployt ist.
// Das Kürzel steht unten im Profil. Vercel und GitHub Actions legen den Commit
// als Umgebungsvariable ab; nur lokal fragen wir git selbst.
async function bauStand(): Promise<string> {
  const ausUmgebung = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA;
  if (ausUmgebung) return ausUmgebung.slice(0, 7);
  try {
    // Modulname in einer Variablen: ohne @types/node stolpert TypeScript sonst
    // über den fehlenden Typ.
    const modul = "node:child_process";
    const { execSync } = (await import(/* @vite-ignore */ modul)) as {
      execSync: (cmd: string, opts: { encoding: string }) => unknown;
    };
    const sha = String(execSync("git rev-parse HEAD", { encoding: "utf8" })).trim();
    if (sha) return sha.slice(0, 7);
  } catch {
    /* kein git zur Hand – dann eben ohne */
  }
  return "unbekannt";
}

export default defineConfig(async () => ({
  // Sourcemaps: im Fehlerfall steht die echte Datei/Zeile in der Meldung
  // statt minifiziertem Kauderwelsch wie "n is not a function".
  build: { sourcemap: true },
  define: {
    __BAU_COMMIT__: JSON.stringify(await bauStand()),
    __BAU_ZEIT__: JSON.stringify(new Date().toISOString()),
  },
  // base = "/" für Vercel/eigene Domain; für GitHub Pages "/sv-beitraege/"
  // (wird im Deploy-Workflow via BASE_PATH gesetzt).
  base: process.env.BASE_PATH || "/",
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
      },
      manifest: {
        name: "Stufenkasse",
        short_name: "Stufenkasse",
        description: "Beiträge & Beteiligungen der Stufe verwalten",
        theme_color: "#f2f2f7",
        background_color: "#f2f2f7",
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
}));
