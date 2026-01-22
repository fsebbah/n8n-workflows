module.exports = {
  apps: [
    {
      name: 'n8n',
      script: 'n8n',
      args: 'start',
      cwd: '/home/fsebb/n8n-workflows',

      // Environnement
      env: {
        // Logging
        N8N_LOG_LEVEL: 'debug',

        // Accès réseau
        N8N_HOST: '0.0.0.0',
        N8N_PORT: 5678,
        N8N_PROTOCOL: 'http',

        // Custom nodes
        N8N_CUSTOM_EXTENSIONS: '/home/fsebb/n8n-workflows/custom-nodes/n8n-nodes-gmail-dynamic',

        // Performance SQLite
        DB_SQLITE_POOL_SIZE: 4,

        // Task runners (recommandé)
        N8N_RUNNERS_ENABLED: 'true',

        // Accès aux env vars dans les nodes (nécessaire pour credentials dynamiques)
        N8N_BLOCK_ENV_ACCESS_IN_NODE: 'false',

        // Sécurité
        N8N_GIT_NODE_DISABLE_BARE_REPOS: 'true',
        N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS: 'true',
        N8N_SECURE_COOKIE: 'false',

        // Activer l'API publique
        N8N_PUBLIC_API_DISABLED: 'false',

        // Allégement / Mode offline
        N8N_DIAGNOSTICS_ENABLED: 'false',
        N8N_HIRING_BANNER_ENABLED: 'false',
        N8N_VERSION_NOTIFICATIONS_ENABLED: 'false',
        N8N_TEMPLATES_ENABLED: 'false',

        // Webhook URL
        WEBHOOK_URL: 'http://pi6.local:5678/',

        // Stripe redirect URL (pour success/cancel après checkout)
        STRIPE_WEBHOOK_URL: 'https://stripe.azy.solutions',

        // API URL
        API_URL: 'http://pi6.local:3031',
        API_KEY: '17ae129e4b49828e7439cae4949803e0a78d3725ff5dd76857e32d071f33af26',

        // LLM API Keys (set via environment or .env.local)
        MISTRAL_API_KEY: process.env.MISTRAL_API_KEY || '',
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',

        // Discord API
        DISCORD_API_URL: 'https://discord.com/api/v10',
        DISCORD_URL_CHANNEL: 'https://discord.com/api/v10/channels/',
        DISCORD_TOKEN: process.env.DISCORD_TOKEN || '',
      },

      // Environnement production (moins de logs)
      env_production: {
        N8N_LOG_LEVEL: 'info',
        N8N_HOST: '0.0.0.0',
        N8N_PORT: 5678,
        N8N_PROTOCOL: 'http',
        N8N_CUSTOM_EXTENSIONS: '/home/fsebb/n8n-workflows/custom-nodes/n8n-nodes-gmail-dynamic',
        DB_SQLITE_POOL_SIZE: 4,
        N8N_RUNNERS_ENABLED: 'true',
        N8N_BLOCK_ENV_ACCESS_IN_NODE: 'false',
        N8N_GIT_NODE_DISABLE_BARE_REPOS: 'true',
        N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS: 'true',
        N8N_SECURE_COOKIE: 'false',
        N8N_PUBLIC_API_DISABLED: 'false',
        N8N_DIAGNOSTICS_ENABLED: 'false',
        N8N_HIRING_BANNER_ENABLED: 'false',
        N8N_VERSION_NOTIFICATIONS_ENABLED: 'false',
        N8N_TEMPLATES_ENABLED: 'false',
        WEBHOOK_URL: 'http://pi6.local:5678/',
        STRIPE_WEBHOOK_URL: 'https://stripe.azy.solutions',
        API_URL: 'http://pi6.local:3031',
        API_KEY: '17ae129e4b49828e7439cae4949803e0a78d3725ff5dd76857e32d071f33af26',

        // LLM API Keys (set via environment or .env.local)
        MISTRAL_API_KEY: process.env.MISTRAL_API_KEY || '',
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',

        // Discord API
        DISCORD_API_URL: 'https://discord.com/api/v10',
        DISCORD_URL_CHANNEL: 'https://discord.com/api/v10/channels/',
        DISCORD_TOKEN: process.env.DISCORD_TOKEN || '',
      },

      // Redémarrage automatique
      autorestart: true,
      watch: false,
      max_memory_restart: '1536M',

      // Logs - dans le dossier du projet
      error_file: '/home/fsebb/n8n-workflows/logs/n8n-error.log',
      out_file: '/home/fsebb/n8n-workflows/logs/n8n-out.log',
      combine_logs: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      // Gestion des crashes
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 5000,

      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 10000,
    }
  ]
};
