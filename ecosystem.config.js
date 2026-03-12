module.exports = {
    apps: [
        {
            name: 'node-banana',
            script: 'node_modules/next/dist/bin/next',
            args: 'start --port 3012',
            instances: 1,
            exec_mode: 'cluster',
            watch: false,
            max_memory_restart: '1G',
            env: {
                NODE_ENV: 'production',
                PORT: 3012
            },
            error_file: '/data/wwwlogs/node-banana-error.log',
            out_file: '/data/wwwlogs/node-banana-out.log',
            log_file: '/data/wwwlogs/node-banana-combined.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true,
            autorestart: true,
            max_restarts: 10,
            min_uptime: '10s'
        }
    ]
}
