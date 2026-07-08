/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#4f46e5",
          soft: "#6366f1",
          dark: "#4338ca",
        },
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
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
