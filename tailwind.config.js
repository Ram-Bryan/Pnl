/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Messenger Calm palette (ui-ux-pro-max design system)
        primary: "#2563EB", // messenger blue — primary actions, user bubbles, active states
        "primary-dark": "#1D4ED8",
        "primary-soft": "#DBEAFE",
        accent: "#059669", // online green — success, enabled, online states
        "accent-dark": "#047857",
        "accent-soft": "#D1FAE5",
        background: "#FFFFFF",
        surface: "#F8FAFC",
        border: "#E4ECFC",
        "text-primary": "#0F172A",
        "text-secondary": "#64748B",
        success: "#059669",
        warning: "#F59E0B",
        error: "#DC2626",
        disabled: "#CBD5E1",
        "chat-user": "#2563EB",
        "chat-ai": "#F1F5FD"
      },
      fontFamily: {
        heading: ["Poppins_600SemiBold"],
        "heading-bold": ["Poppins_700Bold"],
        body: ["OpenSans_400Regular"],
        "body-medium": ["OpenSans_500Medium"],
        "body-semibold": ["OpenSans_600SemiBold"]
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.05)",
        sheet: "0 -4px 12px rgba(15, 23, 42, 0.08)"
      }
    },
  },
  plugins: [],
};
