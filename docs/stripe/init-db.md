# init-db.sh

Initialize the SQLite database for Stripe projects configuration.

## Synopsis

```bash
./scripts/stripe/init-db.sh [OPTIONS]
```

## Description

Creates the SQLite database and table structure required for storing Stripe project configurations. This script should be run once before using the other management scripts.

## Options

| Option | Description |
|--------|-------------|
| `-p, --path PATH` | Path to SQLite database (default: `data/stripe-config.db`) |
| `-f, --force` | Force recreation of database (WARNING: drops existing tables) |
| `-h, --help` | Show help message |

## Examples

### Basic initialization

```bash
./scripts/stripe/init-db.sh
```

Output:
```
[INFO] Creating database at: /path/to/data/stripe-config.db
[OK] Database created successfully!

========================================
Database initialized!
========================================

  Path: /path/to/data/stripe-config.db
  Tables: stripe_projects
```

### Custom path

```bash
./scripts/stripe/init-db.sh -p /custom/path/stripe.db
```

### Force recreation (WARNING: deletes all data)

```bash
./scripts/stripe/init-db.sh --force
```

## Database Structure Created

### Table: `stripe_projects`

| Column | Type | Description |
|--------|------|-------------|
| `project_id` | TEXT | Primary key, unique identifier (e.g., "torah", "mcp") |
| `display_name` | TEXT | Human-readable name |
| `secret_key` | TEXT | Stripe secret key (sk_test_* or sk_live_*) |
| `webhook_secret` | TEXT | Stripe webhook secret (whsec_*) |
| `prices` | TEXT | JSON mapping of plan names to price IDs |
| `active` | INTEGER | 1 = active, 0 = inactive |
| `created_at` | TEXT | Creation timestamp |
| `updated_at` | TEXT | Last update timestamp (auto-updated) |

### Indexes

- `idx_stripe_projects_active` on `active` column

### Triggers

- `update_stripe_projects_timestamp`: Auto-updates `updated_at` on row modification

## Prerequisites

- `sqlite3` must be installed
  ```bash
  # Ubuntu/Debian
  sudo apt install sqlite3

  # MacOS
  brew install sqlite3
  ```

## Exit Codes

| Code | Description |
|------|-------------|
| 0 | Success |
| 1 | Error (sqlite3 not installed, cannot create directory, etc.) |

## See Also

- [manage-projects.md](./manage-projects.md) - Manage projects
- [validate-config.md](./validate-config.md) - Validate configuration
