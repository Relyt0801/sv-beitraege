import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Diese Datei laeuft in Node, nicht im Browser. Das Projekt zieht bewusst kein
// @types/node herein (haelt die Installation klein), deshalb stehen die beiden
// gebrauchte Angabe hier von Hand.
declare const process: { env: Record<string, string | undefined> };

// Woher kommt dieser Build?
//
// Ohne diese Angabe kann niemand sehen, welcher Stand gerade live ist. Genau
// daran ist schon einmal eine Fehlersuche vorbeigelaufen: gemeldet wurden
// Aenderungen als fehlend, die im Code laengst fertig waren - nur nicht
// deployt. Das Kuerzel steht ab jetzt unten im Profil.
//
// Vercel und GitHub Actions legen den Commit als Umgebungsvariable ab. Nur
// wenn beide fehlen (also lokal), fragen wir git selbst. Diese Datei laeuft
// als ES-Modul, deshalb per import() und nicht per require().
async function bauStand(): Promise<string> {
  const ausUmgebung = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA;
  if (ausUmgebung) return ausUmgebung.slice(0, 7);
  try {
    // Der Modulname steht absichtlich in einer Variablen: ohne @types/node
    // wuerde TypeScript sonst ueber den fehlenden Typ stolpern.
    const modul = "node:child_process";
    const { execSync } = (await import(/* @vite-ignore */ modul)) as {
      execSync: (cmd: string, opts: { encoding: string }) => unknown;
    };
    const sha = String(execSync("git rev-parse HEAD", { encoding: "utf8" })).trim();
    if (sha) return sha.slice(0, 7);
  } catch {
    /* kein git zur Hand (z. B. im Docker-Build) - dann eben ohne */
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
}));
