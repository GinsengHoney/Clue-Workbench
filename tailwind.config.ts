import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#1a1f1c",
        paper: "#f6f3ed",
        moss: "#2d5a47",
        rust: "#b45309",
        mist: "#e8e4dc",
      },
    },
  },
  plugins: [],
};
export default config;
