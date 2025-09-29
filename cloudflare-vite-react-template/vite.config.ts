import { defineConfig } from "vite";
import path from "path";
import react from "@vitejs/plugin-react";
import { exec } from "node:child_process";

import { cloudflare } from "@cloudflare/vite-plugin";

function watchDependenciesPlugin() {
  return {
    // Plugin to clear caches when dependencies change
    name: "watch-dependencies",
    configureServer(server: any) {
      const filesToWatch = [
        path.resolve("package.json"),
        path.resolve("bun.lock"),
      ];

      server.watcher.add(filesToWatch);

      server.watcher.on("change", (filePath: string) => {
        if (filesToWatch.includes(filePath)) {
          console.log(
            `\n📦 Dependency file changed: ${path.basename(
              filePath
            )}. Clearing caches...`
          );

          // Run the cache-clearing command
          exec(
            "rm -f .eslintcache tsconfig.tsbuildinfo",
            (err, stdout, stderr) => {
              if (err) {
                console.error("Failed to clear caches:", stderr);
                return;
              }
              console.log("✅ Caches cleared successfully.\n");
            }
          );
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cloudflare(), watchDependenciesPlugin()],
  build: {
    minify: true,
    sourcemap: "inline", // Use inline source maps for better error reporting
    rollupOptions: {
      output: {
        sourcemapExcludeSources: false, // Include original source in source maps
      },
    },
  },
  // Enable source maps in development too
  css: {
    devSourcemap: true,
  },
  server: {
    allowedHosts: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  optimizeDeps: {
    // This is still crucial for reducing the time from when `bun run dev`
    // is executed to when the server is actually ready.
    include: ["react", "react-dom", "react-router-dom"],
    exclude: ["agents"], // Exclude agents package from pre-bundling due to Node.js dependencies
    force: true,
  },
  define: {
    // Define Node.js globals for the agents package
    global: "globalThis",
  },
  // Clear cache more aggressively
  cacheDir: "node_modules/.vite",
});
