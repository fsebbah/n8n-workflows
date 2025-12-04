module.exports = {
  apps: [
    {
      name: 'n8n',
      script: 'n8n',
      args: 'start',

      // Environnement
      env: {
        // Logging
        N8N_LOG_LEVEL: 'debug',

        // Accès réseau
        N8N_HOST: '0.0.0.0',
        N8N_PORT: 5678,
        N8N_PROTOCOL: 'http',

        // Mode API uniquement (sans frontend) - décommenter si souhaité
        // N8N_DISABLE_UI: 'true',

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

        // Gestion des utilisateurs activée (nécessaire pour l'UI)
        // N8N_USER_MANAGEMENT_DISABLED: 'true',

        // Activer l'API publique
        N8N_PUBLIC_API_DISABLED: 'false',

        // Allégement / Mode offline
        N8N_DIAGNOSTICS_ENABLED: 'false',
        N8N_HIRING_BANNER_ENABLED: 'false',
        N8N_VERSION_NOTIFICATIONS_ENABLED: 'false',  // Pas de check de version
        N8N_TEMPLATES_ENABLED: 'false',              // Pas de templates depuis api.n8n.io

        // Webhook URL (remplacer par ton IP/domaine)
        WEBHOOK_URL: 'http://pi6.local:5678/',

        // Authentification basique (recommandé si accès externe)
        // N8N_BASIC_AUTH_ACTIVE: 'true',
        // N8N_BASIC_AUTH_USER: 'admin',
        // N8N_BASIC_AUTH_PASSWORD: 'change_this_password',
      },

      // Redémarrage automatique
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',

      // Logs
      error_file: '/home/fsebb/.n8n/logs/n8n-error.log',
      out_file: '/home/fsebb/.n8n/logs/n8n-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      // Gestion des crashes
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 5000,
    }
  ]
};
