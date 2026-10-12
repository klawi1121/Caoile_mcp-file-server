module.exports = {
  apps: [
    {
      name: "caoile-mcp-server",
      script: "dist/index.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOST: "0.0.0.0",
        WORKSPACE_ROOT: "./workspace",
        AUTH_TOKEN: "caoile-secret-token-2026",
      },
    },
  ],
};
