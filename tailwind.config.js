/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // ── Dark background tiers ──
        "dark-bg": "#0A0E1A",
        "dark-card": "#12162B",
        "dark-elevated": "#1A1F35",
        "dark-surface": "#242940",

        // ── Neon accents ──
        "neon-green": "#00E68A",
        "neon-red": "#FF4D6A",
        "neon-blue": "#4D9EFF",
        "neon-amber": "#FFB547",

        // ── Text (Lightened for more visibility) ──
        "dark-text": "#F0F2F5",
        "dark-text-secondary": "#A8AEC1",
        "dark-text-muted": "#757B8E",

        // ── Borders ──
        "dark-border": "#1F2437",

        // ── Semantic aliases ──
        primary: "#00E68A",
        "primary-dark": "#00CC7A",
        "primary-soft": "#00E68A1A",
        accent: "#FFB547",
        "accent-dark": "#E6A03F",
        "accent-soft": "#FFB54726",
        background: "#0A0E1A",
        surface: "#12162B",
        border: "#1F2437",
        "text-primary": "#F0F2F5",
        "text-secondary": "#A8AEC1",
        success: "#00E68A",
        warning: "#FFB547",
        error: "#FF4D6A",
        loss: "#FF4D6A",
        profit: "#00E68A",
        disabled: "#3D4255",
      },
      fontFamily: {
        heading: ["Roboto_700Bold"],
        "heading-bold": ["Roboto_900Black"],
        body: ["Roboto_400Regular"],
        "body-medium": ["Roboto_500Medium"],
        "body-semibold": ["Roboto_700Bold"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0, 0, 0, 0.3)",
        sheet: "0 -4px 12px rgba(0, 0, 0, 0.5)",
        glow: "0 0 20px rgba(0, 230, 138, 0.15)",
      },
    },
  },
  plugins: [],
};
