import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

// Tokens definidos em src/styles.css como canais RGB — ver o comentário lá.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

// Acentos por papel: bg-* usa o preenchimento; text-* usa a versão "ink"
// (legível sobre superfície neutra); border/ring/outline/stroke usam "line".
const accentFill = {
  lime: token("accent-lime"),
  orange: token("accent-orange"),
  red: token("accent-red"),
  yellow: token("accent-yellow"),
};
const accentInk = {
  lime: token("accent-lime-ink"),
  orange: token("accent-orange-ink"),
  red: token("accent-red-ink"),
  yellow: token("accent-yellow-ink"),
};
const accentLine = {
  ...accentInk,
  lime: token("accent-lime-line"),
};

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          base: token("bg-base"),
          card: token("bg-card"),
          muted: token("bg-muted"),
          overlay: token("bg-overlay"),
        },
        accent: accentFill,
        semantic: {
          income: token("color-income"),
          expense: token("color-expense"),
          pending: token("color-pending"),
        },
        status: {
          info: token("status-info"),
          "info-soft": token("status-info-soft"),
          warning: token("status-warning"),
          "warning-soft": token("status-warning-soft"),
          "warning-softer": token("status-warning-softer"),
          danger: token("status-danger"),
          "danger-soft": token("status-danger-soft"),
        },
        text: {
          primary: token("text-primary"),
          secondary: token("text-secondary"),
          muted: token("text-muted"),
        },
        border: {
          default: token("border-default"),
          strong: token("border-strong"),
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
      textColor: { accent: accentInk },
      placeholderColor: { accent: accentInk },
      borderColor: { accent: accentLine },
      ringColor: { accent: accentLine },
      outlineColor: { accent: accentLine },
      backgroundColor: { scrollbar: token("scrollbar-modal") },
      stroke: { accent: accentLine },
      borderRadius: { card: "16px", pill: "9999px", icon: "12px" },
      keyframes: {
        "auth-rise": {
          from: { opacity: "0", transform: "translateY(10px)", filter: "blur(6px)" },
          to: { opacity: "1", transform: "none", filter: "none" },
        },
      },
      animation: {
        "auth-rise": "auth-rise 700ms cubic-bezier(0.16, 1, 0.3, 1) both",
      },
      fontFamily: {
        sans: ["Syne", "sans-serif"],
        body: ["DM Sans", "sans-serif"],
      },
    },
  },
  plugins: [
    // light:* — estilos que só existem no tema claro, sem tocar no escuro.
    plugin(({ addVariant }) => addVariant("light", "html.light &")),
  ],
} satisfies Config;
