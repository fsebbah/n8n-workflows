// PM2 Ecosystem file for n8n
// Charge les variables depuis docker/.env.local
module.exports = {
  apps: [{
    name: 'n8n',
    script: 'n8n',
    args: 'start',
    cwd: '/storage6/pi6/n8n-workflows',
    env: {
      NODES_EXCLUDE: '[]',  // Réactive Execute Command et LocalFileTrigger (désactivés par défaut en n8n 2.0)
      N8N_COMMUNITY_PACKAGES_ENABLED: 'true',  // Active l'installation des community packages
      N8N_REINSTALL_MISSING_PACKAGES: 'true',  // Réinstalle les packages manquants au démarrage
      N8N_BLOCK_ENV_ACCESS_IN_NODE: 'false',
      N8N_SECURE_COOKIE: 'false',
      REDIS_XADD_SERVICE_URL: 'http://pi6.local:8765'  // Micro-service Redis XADD (RFC-090)
    }
  }]
};
