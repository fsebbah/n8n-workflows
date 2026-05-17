// PM2 Ecosystem file for n8n
// Charge les variables depuis .env.local

const fs = require('fs');
const path = require('path');

// Charger .env.local manuellement (PM2 ne supporte pas dotenv nativement)
function loadEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) {
    console.warn(`Warning: ${filePath} not found`);
    return env;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    // Ignorer commentaires et lignes vides
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Parser KEY=VALUE
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) {
      let [, key, value] = match;
      // Retirer les quotes si présentes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  }
  return env;
}

// Charger les variables d'environnement depuis .env.local
const envFile = path.join(__dirname, '.env.local');
const envVars = loadEnvFile(envFile);

module.exports = {
  apps: [{
    name: 'n8n',
    script: 'n8n',
    args: 'start',
    cwd: '/storage6/pi6/n8n-workflows',
    env: {
      // Variables chargées depuis .env.local
      ...envVars,

      // Overrides spécifiques PM2 (prioritaires)
      NODES_EXCLUDE: '[]',  // Réactive Execute Command et LocalFileTrigger
      N8N_COMMUNITY_PACKAGES_ENABLED: 'true',
      N8N_REINSTALL_MISSING_PACKAGES: 'true',
      N8N_BLOCK_ENV_ACCESS_IN_NODE: 'false',
      N8N_SECURE_COOKIE: 'false',

      // Custom nodes (important pour classroomToolDynamic)
      N8N_CUSTOM_EXTENSIONS: '/storage6/pi6/n8n-workflows/custom-nodes/n8n-nodes-classroom-dynamic'
    }
  }]
};
