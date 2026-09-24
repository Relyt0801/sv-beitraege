/** @type {import('tailwindcss').Config} */

/**
 * Farben im Stil der Apple-Systemfarben. Die Werte stehen als Variablen in
 * src/index.css – je einmal fuer hell und dunkel –, damit auch Stellen ohne
 * eigene dark:-Klasse im Dunkelmodus stimmen. Alle Textfarben sind auf
 * mindestens 4,5:1 Kontrast geprueft.
 */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // systemBlue in der barrierearmen Variante (wie auf apple.com)
        brand: {
          DEFAULT: v("brand"),
          soft: v("brand-soft"),
          dark: v("brand-dark"),
        },
        // Gruppierter Hintergrund (#F2F2F7) mit weissen Zellen
        papier: {
          DEFAULT: v("papier"),
          karte: v("karte"),
          linie: v("linie"),
          matt: v("matt"),
        },
        tinte: {
          DEFAULT: v("tinte"),
          matt: v("tinte-matt"),
          leise: v("tinte-leise"),
        },
        // Die drei Zustaende einer Zahlung, einmal festgelegt.
        bezahlt: { DEFAULT: v("bezahlt"), grund: v("bezahlt-grund"), rand: v("bezahlt-rand") },
        offen: { DEFAULT: v("offen"), grund: v("offen-grund"), rand: v("offen-rand") },
        erlassen: { DEFAULT: v("erlassen"), grund: v("erlassen-grund"), rand: v("erlassen-rand") },
        // Neutrale Grautoene wie bei Apple statt des blaeulichen Schiefers.
        // Die ganze App nutzt slate-* fuer den Dunkelmodus – so wird er
        // ueberall zu den echten iOS-Dunkeltoenen (#000, #1C1C1E, #2C2C2E …).
        slate: {
          50: "#F2F2F7",
          100: "#E5E5EA",
          200: "#D1D1D6",
          300: "#AEAEB2",
          400: "#98989F",
          500: "#7C7C83",
          600: "#545458",
          700: "#3A3A3C",
          800: "#2C2C2E",
          900: "#1C1C1E",
          950: "#000000",
        },
        // Gruen, Orange und Rot ebenfalls als Apple-Systemfarben. Die dunklen
        // Stufen (600/700) sind die barrierearmen Varianten fuer Text auf Weiss.
        emerald: {
          50: "#EAF9EE", 100: "#D3F4DC", 200: "#A8E8B8", 300: "#7ADB94", 400: "#30D158",
          500: "#34C759", 600: "#1F7F38", 700: "#1E7B34", 800: "#17602A", 900: "#0F4A1F", 950: "#08290F",
        },
        amber: {
          50: "#FFF6E5", 100: "#FFEBC7", 200: "#FFD68A", 300: "#FFC24D", 400: "#FFB020",
          500: "#FF9500", 600: "#C96A00", 700: "#A35200", 800: "#7A3E00", 900: "#5C2E00", 950: "#331A00",
        },
        red: {
          50: "#FFEEED", 100: "#FFDAD7", 200: "#FFB4AE", 300: "#FF8A80", 400: "#FF6259",
          500: "#FF3B30", 600: "#D70015", 700: "#B00012", 800: "#8A000E", 900: "#66000A", 950: "#3D0006",
        },
      },
      fontFamily: {
        // San Francisco auf iPhone, iPad und Mac; sonst die Systemschrift
        // des Geraets (Segoe UI unter Windows, Roboto unter Android).
        sans: [
          "-apple-system", "BlinkMacSystemFont", "\"SF Pro Text\"", "system-ui",
          "\"Segoe UI Variable Text\"", "\"Segoe UI\"", "Roboto", "\"Helvetica Neue\"", "Arial", "sans-serif",
        ],
        // Fuer Betraege und grosse Titel: SF Pro Display mit gleich breiten Ziffern.
        zahl: [
          "-apple-system", "BlinkMacSystemFont", "\"SF Pro Display\"", "system-ui",
          "\"Segoe UI Variable Display\"", "\"Segoe UI\"", "Roboto", "\"Helvetica Neue\"", "Arial", "sans-serif",
        ],
      },
      // Apple setzt kaum Extra-Fett ein – "extrabold" wird zu "bold".
      fontWeight: {
        extrabold: "700",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,.04), 0 0 0 .5px rgba(0,0,0,.03)",
        cardDark: "none",
        glas: "0 8px 32px rgba(0,0,0,.12), 0 1px 3px rgba(0,0,0,.08)",
      },
      transitionTimingFunction: {
        // Die "Feder" von iOS: schnell los, weich aus
        ios: "cubic-bezier(.32,.72,0,1)",
      },
      keyframes: {
        sheetIn: { "0%": { transform: "translateY(100%)" }, "100%": { transform: "translateY(0)" } },
        popIn: { "0%": { transform: "scale(.96)", opacity: "0" }, "100%": { transform: "scale(1)", opacity: "1" } },
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        aufsteigen: { "0%": { transform: "translateY(8px)", opacity: "0" }, "100%": { transform: "translateY(0)", opacity: "1" } },
        puls: { "0%,100%": { boxShadow: "0 0 0 0 rgb(var(--brand) / .45)" }, "50%": { boxShadow: "0 0 0 8px rgb(var(--brand) / 0)" } },
      },
      animation: {
        sheetIn: "sheetIn .42s cubic-bezier(.32,.72,0,1)",
        popIn: "popIn .28s cubic-bezier(.32,.72,0,1)",
        fadeIn: "fadeIn .2s ease",
        aufsteigen: "aufsteigen .32s cubic-bezier(.32,.72,0,1) backwards",
        puls: "puls 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
