# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## HTTPS dev server (for camera/mic/location permissions)

The buyer's KYC flow requests camera, microphone, and geolocation — Chrome **only** shows those permission popups on a secure origin (HTTPS or `localhost`). On a plain `http://<lan-ip>:5173` URL the browser silently refuses.

Two options:

1. **Use `http://localhost:5173` (or `https://localhost:5173`)** — `localhost` is always treated as a secure context, no setup needed.

2. **Generate a self-signed cert and run over HTTPS on the LAN IP:**

   ```bash
   cd frontend
   npm run dev:https   # generates .dev-certs/ and starts Vite on HTTPS
   ```

   First time you open the page Chrome shows `Your connection is not private`. Click **Advanced → Proceed to <ip> (unsafe)** once per browser to accept the cert. After that the camera/mic/location permission popups will appear normally.

3. **Chrome flag (alternative to HTTPS):** open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add your origin (`http://192.168.x.x:5173`), restart Chrome. Then the LAN IP origin is treated as secure and the popups will appear over plain HTTP.

