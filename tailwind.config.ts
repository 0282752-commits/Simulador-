import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        fondo: "#0b1220",
        panel: "#131c2e",
        borde: "#23304a",
        acento: "#22c55e",
      },
    },
  },
  plugins: [],
} satisfies Config;
