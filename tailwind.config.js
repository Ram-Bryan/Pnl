/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // PnL Trading Journal palette
        primary: "#10B981", // emerald 500 — primary actions, profitiable states
        "primary-dark": "#059669",
        "primary-soft": "#D1FAE5",
        accent: "#F59E0B", // warning/neutral
        "accent-dark": "#D97706",
        "accent-soft": "#FEF3C7",
        background: "#F8FAFC",
        surface: "#FFFFFF",
        border: "#E2E8F0",
        "text-primary": "#0F172A",
        "text-secondary": "#64748B",
        success: "#10B981",
        warning: "#F59E0B",
        error: "#EF4444",
        loss: "#EF4444",
        profit: "#10B981",
        disabled: "#CBD5E1",
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
