module.exports = {
  apps: [
    {
      name: "vite-dev-server",
      script: "npm",
      args: "run dev -- --host 0.0.0.0 --port 3000",
      cwd: "/tmp/project",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "development",
      },
    },
  ],
};