import { cpSync, existsSync, statSync } from "node:fs";
import { defineConfig } from "vite";

// The client asks for game media, the cache and the bzip2 decoder by URL at
// runtime, so the bundler never sees them. Copy them into the build as they are.
// ponytail: extension filter over the whole tree; move runtime media to a
// Vite `public/` directory once the asset layout settles.
const copyRuntimeFiles = {
  name: "copy-runtime-files",
  apply: "build",
  closeBundle() {
    cpSync("client", "dist", {
      recursive: true,
      filter: (source) =>
        statSync(source).isDirectory() ||
        !/\.(js|css|html)$/.test(source) ||
        source.endsWith("bzip2-module.js"),
    });
  },
};

// Unknown paths fall back to index.html so that /yama/ and /zebak/ open the
// app. A missing sprite or sound must be a 404 instead, not a page of HTML.
const missingMediaIs404 = {
  name: "missing-media-is-404",
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const path = decodeURIComponent(request.url.split("?")[0]);
      if (/\.(png|webp|svg|ogg|ttf|dat|bin|json|zip|wasm)$/.test(path) && !existsSync("client" + path)) {
        response.statusCode = 404;
        response.end();
        return;
      }
      next();
    });
  },
};

export default defineConfig(({ mode }) => {
  // `npm test` uses mode "test": same unbundled modules as `npm run dev`, but
  // with production React. Development React runs StrictMode's double mount,
  // which builds a second simulation engine and confuses the test probes.
  if (mode === "test") process.env.NODE_ENV = "production";
  return {
    root: "client",
    publicDir: false,
    cacheDir: mode === "test" ? "../node_modules/.vite-test" : "../node_modules/.vite",
    server: { host: "127.0.0.1" },
    preview: { host: "127.0.0.1" },
    build: { outDir: "../dist", emptyOutDir: true },
    plugins: [missingMediaIs404, copyRuntimeFiles],
  };
});
