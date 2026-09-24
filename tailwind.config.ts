import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a"
        },
        night: {
          950: "#040a17",
          900: "#081226",
          850: "#0b1730",
          800: "#0f1f3d",
          700: "#16294d"
        },
        gold: {
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b"
        }
      },
      fontFamily: {
        sans: ["var(--font-sora)", "ui-sans-serif", "system-ui", "sans-serif"],
        num: ["var(--font-num)", "ui-monospace", "monospace"]
      },
      boxShadow: {
        glow: "0 0 24px -6px rgba(59,130,246,.55)",
        card: "0 8px 30px -12px rgba(2,8,30,.35)"
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(.96) translateY(8px)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" }
        }
      },
      animation: {
        "fade-up": "fade-up .5s cubic-bezier(.22,.8,.32,1) both",
        "pop-in": "pop-in .22s cubic-bezier(.22,.8,.32,1) both"
      }
    }
  },
  plugins: []
};
export default config;
