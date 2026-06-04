import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        government: {
          navy: "#15345b",
          blue: "#2463b3",
          sky: "#e8f1ff",
          slate: "#2f3a4a",
          line: "#d7dee8",
        },
      },
      boxShadow: {
        panel: "0 10px 30px rgba(21, 52, 91, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
