module.exports = {
  apps: [
    {
      name: "hydroplon-api",
      cwd: "/opt/hydroplon/api",
      script: "dist/server.js",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "750M",
      kill_timeout: 15_000,
      env: {
        NODE_ENV: "production",
        API_HOST: "127.0.0.1",
        API_PORT: 3100,
        WEB_ORIGIN: "https://hydroplon.aixir.pl",
      },
    },
  ],
};
