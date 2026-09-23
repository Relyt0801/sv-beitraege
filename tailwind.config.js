/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#4a3fd4",
          soft: "#6357e8",
          dark: "#3529b8",
        },
        // Warmes Papierweiss statt kaltem Grau – ruhiger als Blaugrau und
        // laesst die Betraege staerker hervortreten.
        papier: {
          DEFAULT: "#fbfaf8",
          karte: "#ffffff",
          linie: "#e6e4df",
          matt: "#f6f5f2",
        },
        tinte: {
          DEFAULT: "#191a1f",
          matt: "#6b6b76",
          leise: "#8a8a94",
        },
        // Die drei Zustaende einer Zahlung, einmal festgelegt.
        bezahlt: { DEFAULT: "#157f5f", grund: "#e6f3ee", rand: "#c8e6da" },
        offen: { DEFAULT: "#8a4f06", grund: "#fdf3e3", rand: "#f0dcb8" },
        erlassen: { DEFAULT: "#5b6b8c", grund: "#eef1f7", rand: "#d8dfeb" },
      },
      fontFamily: {
        sans: ["Public Sans", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Helvetica", "sans-serif"],
        // Fuer Betraege, Prozente und Ueberschriften: eigener Charakter,
        // gleiche Ziffernbreite, damit Zahlen untereinander stehen.
        zahl: ["Bricolage Grotesque Variable", "Bricolage Grotesque", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 4px 20px rgba(20,24,45,.06)",
        cardDark: "0 4px 24px rgba(0,0,0,.35)",
      },
      keyframes: {
        sheetIn: { "0%": { transform: "translateY(24px)", opacity: "0" }, "100%": { transform: "translateY(0)", opacity: "1" } },
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
      },
      animation: {
        sheetIn: "sheetIn .22s cubic-bezier(.2,.8,.2,1)",
        fadeIn: "fadeIn .15s ease",
      },
    },
  },
  plugins: [],
};
