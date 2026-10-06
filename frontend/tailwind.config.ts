import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

// Tokens definidos em src/styles.css como canais RGB — ver o comentário lá.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

// Acentos por papel: bg-* usa o preenchimento; text-* usa a versão "ink"
// (legível sobre superfície neutra); border/ring/outline/stroke usam "line".
const accentFill = {
  brand: token("accent-brand"),
  "brand-hover": token("accent-brand-hover"),
  "brand-soft": token("accent-brand-soft"),
  red: token("accent-red"),
  "red-hover": token("accent-red-hover"),
  yellow: token("accent-yellow"),
};
const accentInk = {
  brand: token("accent-brand-ink"),
  "brand-hover": token("accent-brand-hover"),
  "brand-soft": token("accent-brand-soft"),
  red: token("accent-red-ink"),
  "red-hover": token("accent-red-hover"),
  yellow: token("accent-yellow-ink"),
};
const accentLine = {
  ...accentInk,
  brand: token("accent-brand-line"),
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
        // Só as páginas públicas carregam esta fonte (public/fonts/bricolage-grotesque.css).
        display: ["Bricolage Grotesque", "DM Sans", "sans-serif"],
      },
    },
  },
  plugins: [
    // light:* — estilos que só existem no tema claro, sem tocar no escuro.
    plugin(({ addVariant }) => addVariant("light", "html.light &")),
  ],
} satisfies Config;
