import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,         // listen on 0.0.0.0 + :: — fixes IPv4-only port forwards
    strictPort: true    // fail fast if 5173 is taken instead of jumping to 5174
  }
});
