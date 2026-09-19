import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      colors: {
        // Warm espresso — modern near-black with a hint of brown warmth.
        ink: {
          50: "#f6f3ef",
          100: "#e8e1d7",
          200: "#cdc0af",
          300: "#a89a86",
          400: "#7d6f5d",
          500: "#574d41",
          600: "#40382f",
          700: "#2f2925",
          800: "#231e1b",
          900: "#181513",
        },
        // Honeyed amber — a warm, refined golden-hour accent.
        brass: {
          50: "#faf5ea",
          100: "#f4e7cb",
          200: "#e9cf9c",
          300: "#dbb56f",
          400: "#c9974a",
          500: "#b57a30",
          600: "#935f27",
          700: "#734a24",
        },
        // Porcelain / bone surfaces.
        parchment: {
          50: "#faf8f3",
          100: "#f4f0e7",
          200: "#e9e2d4",
          300: "#dccfbb",
        },
        // Muted sage — secondary / calm success.
        sage: {
          100: "#e7ede3",
          400: "#7d9a78",
          600: "#5b7658",
          700: "#45603e",
        },
        // Soft clay — reserved for destructive actions.
        clay: {
          100: "#f2ded6",
          500: "#b0503c",
          600: "#943f2e",
        },
        // Keep brand aliased to ink so leftover classes still resolve.
        brand: {
          50: "#f6f3ef",
          100: "#e8e1d7",
          500: "#574d41",
          600: "#40382f",
          700: "#2f2925",
        },
      },
      boxShadow: {
        pew: "0 1px 2px rgba(35, 30, 27, 0.04), 0 10px 30px -14px rgba(35, 30, 27, 0.20)",
        lift: "0 2px 6px rgba(35, 30, 27, 0.06), 0 24px 50px -20px rgba(35, 30, 27, 0.30)",
      },
      keyframes: {
        "rise-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "glow-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slow-spin": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        shimmer: {
          "0%, 100%": { opacity: "0.85", filter: "brightness(1)" },
          "50%": { opacity: "1", filter: "brightness(1.12)" },
        },
        "ray-sway": {
          "0%, 100%": { opacity: "0.35", transform: "translateX(0)" },
          "50%": { opacity: "0.6", transform: "translateX(6px)" },
        },
      },
      animation: {
        "rise-in": "rise-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        "glow-in": "glow-in 0.8s ease-out both",
        "slow-spin": "slow-spin 90s linear infinite",
        shimmer: "shimmer 6s ease-in-out infinite",
        "ray-sway": "ray-sway 9s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
