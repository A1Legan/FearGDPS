module.exports = {
  apps: [
    {
      name: 'nextjs',
      cwd: '/opt/justland',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'gd-server',
      cwd: '/opt/justland/gd-server',
      script: '/root/.bun/bin/bun',
      args: 'run index.ts',
      env: {
        NODE_ENV: 'production',
        GD_PORT: '4443',
        GD_NO_TLS: '1',
      },
    },
  ],
}
