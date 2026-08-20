import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "var(--bg-base)",
          card: "var(--bg-card)",
          muted: "var(--bg-muted)",
          overlay: "var(--bg-overlay)",
        },
        accent: {
          lime: "#A3E635",
          orange: "#F97316",
          red: "#EF4444",
          yellow: "#EAB308",
        },
        semantic: {
          income: "var(--color-income)",
          expense: "var(--color-expense)",
          pending: "var(--color-pending)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
        },
        border: {
          default: "var(--border-default)",
          strong: "var(--border-strong)",
        },
        category: {
          shopping: "#EF4444",
          food: "#F97316",
          groceries: "#22C55E",
          health: "#06B6D4",
          travel: "#8B5CF6",
          taxi: "#3B82F6",
          other: "#6B7280",
        },
      },
      borderRadius: { card: "16px", pill: "9999px", icon: "12px" },
      fontFamily: {
        sans: ["Syne", "sans-serif"],
        body: ["DM Sans", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
