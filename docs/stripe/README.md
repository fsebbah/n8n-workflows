# Stripe Configuration Management

This directory contains documentation for the Stripe configuration management system used by n8n workflows.

## Overview

The system allows managing multiple Stripe projects (Torah, MCP, etc.) without restarting n8n. Configuration is stored in a local SQLite database that n8n workflows can query at runtime.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     SERVICE APPELANT                             │
│                   (Torah Bot, MCP, etc.)                        │
│                                                                  │
│  Envoie: project_id, price_id, callbacks, metadata              │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    n8n Workflow                                  │
│                                                                  │
│  1. Reçoit project_id                                           │
│  2. SELECT * FROM stripe_projects WHERE project_id = ?          │
│  3. Utilise secret_key pour appeler Stripe API                  │
│  4. Retourne checkout URL                                       │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              data/stripe-config.db (SQLite)                      │
│                                                                  │
│  stripe_projects:                                               │
│  - project_id, display_name                                     │
│  - secret_key, webhook_secret                                   │
│  - prices (JSON), active                                        │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# 1. Initialize the database (once)
./scripts/stripe/init-db.sh

# 2. Add your Stripe projects
./scripts/stripe/manage-projects.sh add \
  -i torah \
  -n "Torah Bot" \
  -k sk_live_xxx \
  -w whsec_xxx \
  -P '{"basic": "price_basic", "premium": "price_premium"}'

# 3. Validate configuration
./scripts/stripe/validate-config.sh

# 4. List configured projects
./scripts/stripe/manage-projects.sh list
```

## Documentation

| Document | Description |
|----------|-------------|
| [init-db.md](./init-db.md) | Database initialization script |
| [manage-projects.md](./manage-projects.md) | Project management CLI |
| [validate-config.md](./validate-config.md) | Configuration validation |

## File Structure

```
n8n-workflows/
├── data/
│   └── stripe-config.db        # SQLite database (created by init-db.sh)
├── scripts/stripe/
│   ├── init-db.sh              # Initialize database
│   ├── manage-projects.sh      # Manage projects CLI
│   └── validate-config.sh      # Validate configuration
└── docs/stripe/
    ├── README.md               # This file
    ├── init-db.md              # init-db.sh documentation
    ├── manage-projects.md      # manage-projects.sh documentation
    └── validate-config.md      # validate-config.sh documentation
```

## Database Schema

```sql
CREATE TABLE stripe_projects (
    project_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    secret_key TEXT NOT NULL,
    webhook_secret TEXT NOT NULL,
    prices TEXT NOT NULL DEFAULT '{}',
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
```

## Security Notes

- Secret keys are stored in SQLite (local file)
- Use file permissions to restrict access: `chmod 600 data/stripe-config.db`
- Secrets are masked in CLI output by default
- Use `--show-secrets` flag only when necessary
- Never commit the database file to git (add to .gitignore)

## Adding a New Project

When a new service needs Stripe integration:

1. Create the products/prices in Stripe Dashboard
2. Note the `price_xxx` IDs
3. Get the API keys from Stripe Dashboard
4. Run:
   ```bash
   ./scripts/stripe/manage-projects.sh add \
     -i new_service \
     -n "New Service Name" \
     -k sk_live_xxx \
     -w whsec_xxx \
     -P '{"plan1": "price_xxx", "plan2": "price_yyy"}'
   ```
5. Validate: `./scripts/stripe/validate-config.sh`

**No n8n restart required!**
