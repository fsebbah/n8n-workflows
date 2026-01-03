# manage-projects.sh

Manage Stripe project configurations via command line.

## Synopsis

```bash
./scripts/stripe/manage-projects.sh <COMMAND> [OPTIONS]
```

## Description

A full-featured CLI for managing Stripe project configurations stored in SQLite. Allows adding, listing, updating, and removing projects without restarting n8n.

## Commands

| Command | Description |
|---------|-------------|
| `add` | Add a new Stripe project |
| `list` | List all projects |
| `get` | Get details of a specific project |
| `update` | Update an existing project |
| `remove` | Deactivate a project (soft delete) |
| `delete` | Permanently delete a project |

## Global Options

| Option | Description |
|--------|-------------|
| `-d, --db PATH` | Path to SQLite database |
| `-h, --help` | Show help for a command |

---

## Command: `add`

Add a new Stripe project to the configuration.

### Usage

```bash
./manage-projects.sh add [OPTIONS]
```

### Required Options

| Option | Description |
|--------|-------------|
| `-i, --id ID` | Project identifier (lowercase, no spaces) |
| `-n, --name NAME` | Display name for the project |
| `-k, --key KEY` | Stripe secret key (sk_test_* or sk_live_*) |
| `-w, --webhook SECRET` | Stripe webhook secret (whsec_*) |

### Optional

| Option | Description |
|--------|-------------|
| `-P, --prices JSON` | Prices mapping as JSON (default: '{}') |

### Examples

```bash
# Add Torah project with prices
./manage-projects.sh add \
  -i torah \
  -n "Torah Bot" \
  -k sk_live_xxxxxxxxxxxx \
  -w whsec_xxxxxxxxxxxx \
  -P '{"basic": "price_basic_xxx", "premium": "price_premium_xxx", "unlimited": "price_unlimited_xxx"}'

# Add MCP project
./manage-projects.sh add \
  -i mcp \
  -n "MCP Tools" \
  -k sk_live_yyyyyyyyyyyy \
  -w whsec_yyyyyyyyyyyy \
  -P '{"pro": "price_pro_xxx"}'

# Add project with test keys
./manage-projects.sh add \
  -i myproject \
  -n "My Project" \
  -k sk_test_abc123 \
  -w whsec_test_xyz789 \
  -P '{"starter": "price_starter"}'
```

### Output

```
[OK] Project 'torah' added successfully!

  Project ID:     torah
  Display Name:   Torah Bot
  Secret Key:     sk_live...xxxx
  Webhook Secret: whsec_x...xxxx
  Prices:         {"basic": "price_basic_xxx", "premium": "price_premium_xxx"}
```

---

## Command: `list`

List all configured projects.

### Usage

```bash
./manage-projects.sh list [OPTIONS]
```

### Options

| Option | Description |
|--------|-------------|
| `-a, --all` | Include inactive projects |
| `-j, --json` | Output as JSON |

### Examples

```bash
# List active projects
./manage-projects.sh list

# Include inactive projects
./manage-projects.sh list --all

# Output as JSON (for scripting)
./manage-projects.sh list --json
```

### Output

```
Stripe Projects
===============

ID      Name        Active  Key (masked)   Created
------  ----------  ------  -------------  -------------------
torah   Torah Bot   Yes     sk_live_xx...  2026-01-02 15:42:39
mcp     MCP Tools   Yes     sk_live_yy...  2026-01-02 15:43:12

  Total: 2 project(s)
```

---

## Command: `get`

Get details of a specific project.

### Usage

```bash
./manage-projects.sh get <PROJECT_ID> [OPTIONS]
```

### Options

| Option | Description |
|--------|-------------|
| `-s, --show-secrets` | Show full secrets (default: masked) |
| `-j, --json` | Output as JSON |

### Examples

```bash
# Get project details (secrets masked)
./manage-projects.sh get torah

# Get with full secrets visible
./manage-projects.sh get torah --show-secrets

# Get as JSON
./manage-projects.sh get torah --json
```

### Output

```
Project Details: torah
==============================

  Project ID:     torah
  Display Name:   Torah Bot
  Active:         Yes

  Secret Key:     sk_live...xxxx
  Webhook Secret: whsec_x...xxxx
  (use --show-secrets to reveal)

  Prices:
    - basic: price_basic_xxx
    - premium: price_premium_xxx
    - unlimited: price_unlimited_xxx

  Created:        2026-01-02 15:42:39
  Updated:        2026-01-02 15:42:39
```

---

## Command: `update`

Update an existing project.

### Usage

```bash
./manage-projects.sh update <PROJECT_ID> [OPTIONS]
```

### Options

| Option | Description |
|--------|-------------|
| `-n, --name NAME` | Update display name |
| `-k, --key KEY` | Update secret key |
| `-w, --webhook SECRET` | Update webhook secret |
| `-P, --prices JSON` | Update prices mapping |
| `-a, --activate` | Reactivate a deactivated project |

### Examples

```bash
# Update display name
./manage-projects.sh update torah -n "Torah Bot Production"

# Rotate secret key
./manage-projects.sh update torah -k sk_live_new_xxx

# Update prices
./manage-projects.sh update torah -P '{"basic": "price_new_basic", "premium": "price_new_premium"}'

# Reactivate a disabled project
./manage-projects.sh update torah --activate

# Multiple updates at once
./manage-projects.sh update torah \
  -n "Torah Bot v2" \
  -k sk_live_new_xxx \
  -P '{"basic": "price_v2_basic"}'
```

---

## Command: `remove`

Deactivate a project (soft delete). The project remains in the database but is marked as inactive.

### Usage

```bash
./manage-projects.sh remove <PROJECT_ID>
```

### Examples

```bash
./manage-projects.sh remove torah
```

### Output

```
[OK] Project 'torah' deactivated
  To reactivate: ./manage-projects.sh update torah --activate
  To delete permanently: ./manage-projects.sh delete torah
```

---

## Command: `delete`

Permanently delete a project from the database.

### Usage

```bash
./manage-projects.sh delete <PROJECT_ID> [OPTIONS]
```

### Options

| Option | Description |
|--------|-------------|
| `-f, --force` | Skip confirmation prompt |

### Examples

```bash
# Delete with confirmation
./manage-projects.sh delete torah

# Delete without confirmation (use with caution)
./manage-projects.sh delete torah --force
```

### Output

```
WARNING: This will permanently delete project 'torah'
Type the project ID to confirm: torah
[OK] Project 'torah' permanently deleted
```

---

## Validation

The script validates inputs:

- **Project ID**: Must be lowercase, alphanumeric with underscores/hyphens
- **Secret Key**: Warns if not matching `sk_test_*` or `sk_live_*`
- **Webhook Secret**: Warns if not matching `whsec_*`
- **Prices**: Must be valid JSON

---

## Exit Codes

| Code | Description |
|------|-------------|
| 0 | Success |
| 1 | Error (invalid input, project not found, etc.) |

---

## See Also

- [init-db.md](./init-db.md) - Initialize database
- [validate-config.md](./validate-config.md) - Validate configuration
