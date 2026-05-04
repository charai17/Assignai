import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#102033",
        cloud: "#f7f9fc"
      },
      boxShadow: {
        soft: "0 24px 80px rgba(15, 23, 42, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;
