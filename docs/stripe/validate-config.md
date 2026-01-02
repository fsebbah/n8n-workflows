# validate-config.sh

Validate Stripe configuration and identify potential issues.

## Synopsis

```bash
./scripts/stripe/validate-config.sh [OPTIONS]
```

## Description

Performs comprehensive validation of the Stripe projects configuration. Checks for common issues, missing data, and configuration inconsistencies.

## Options

| Option | Description |
|--------|-------------|
| `-d, --db PATH` | Path to SQLite database |
| `-v, --verbose` | Show detailed output for all checks |
| `-j, --json` | Output results as JSON |
| `--check-stripe` | Test actual connection to Stripe API (requires curl) |
| `-h, --help` | Show help message |

## Checks Performed

| Check | Description | Severity |
|-------|-------------|----------|
| Database exists | Verifies database file exists | Error |
| Database readable | Verifies database can be opened | Error |
| Table exists | Verifies stripe_projects table exists | Error |
| Table structure | Verifies all required columns exist | Error |
| Has projects | At least one project configured | Error |
| Has active projects | At least one active project | Warning |
| Required fields | All required fields populated | Error |
| Secret key format | Keys match sk_test_* or sk_live_* | Warning |
| Webhook secret format | Secrets match whsec_* | Warning |
| Prices JSON valid | Prices field contains valid JSON | Error |
| Prices not empty | Prices are defined | Warning |
| Environment consistency | No mix of test/live keys | Warning |
| Stripe API (optional) | Actual API connectivity test | Error |

## Examples

### Basic validation

```bash
./scripts/stripe/validate-config.sh
```

Output:
```
Stripe Configuration Validator
===============================

Database: /path/to/data/stripe-config.db

[PASS] Database exists: /path/to/data/stripe-config.db
[PASS] Database is readable
[PASS] Table 'stripe_projects' exists
[PASS] All required columns present
[PASS] Found 2 project(s)
[PASS] Found 2 active project(s)
[PASS] All required fields are populated
[PASS] All secret keys have valid format
[PASS] All webhook secrets have valid format
[PASS] All prices are valid JSON
[PASS] All projects have prices defined
[PASS] All active projects use LIVE keys

========================================
Validation Summary
========================================

  Passed:   12
  Warnings: 0
  Errors:   0

Configuration is valid!
```

### Verbose output with project overview

```bash
./scripts/stripe/validate-config.sh --verbose
```

Additional output:
```
Projects Overview
==================

ID      Name        Mode  Active  Prices
------  ----------  ----  ------  ------
torah   Torah Bot   LIVE  Yes     3
mcp     MCP Tools   LIVE  Yes     1
```

### Test Stripe API connectivity

```bash
./scripts/stripe/validate-config.sh --check-stripe
```

Additional check:
```
[CHECK] Stripe API connectivity
  ✓ torah: API key valid
  ✓ mcp: API key valid
[PASS] All Stripe API keys are valid
```

### JSON output (for CI/CD)

```bash
./scripts/stripe/validate-config.sh --json
```

Output:
```json
{
  "status": "ok",
  "passed": 12,
  "warnings": 0,
  "errors": 0,
  "database": "/path/to/data/stripe-config.db"
}
```

## Warning Examples

### Mixed test/live keys

```
[WARN] Mixed test and live keys detected
       Test mode: test_project
       Live mode: torah, mcp
       Consider using consistent environments
```

### Empty prices

```
[WARN] Empty prices for: new_project
       Use './manage-projects.sh update <id> -P '{...}'' to add prices
```

### Invalid key format

```
[WARN] Invalid secret key format for: bad_project
       Expected format: sk_test_* or sk_live_*
```

## Error Examples

### Database not found

```
[FAIL] Database not found at: /path/to/data/stripe-config.db
       Run './init-db.sh' to create the database
```

### No projects configured

```
[FAIL] No projects configured
       Run './manage-projects.sh add' to add a project
```

### Invalid JSON

```
[FAIL] Invalid JSON in prices for: broken_project
```

## Exit Codes

| Code | Description |
|------|-------------|
| 0 | All checks passed |
| 1 | Errors found (critical issues that must be fixed) |
| 2 | Warnings only (non-critical issues, review recommended) |

## CI/CD Integration

```bash
# In your CI pipeline
./scripts/stripe/validate-config.sh --json

# Check exit code
if [ $? -eq 0 ]; then
  echo "Configuration valid"
elif [ $? -eq 2 ]; then
  echo "Configuration has warnings"
else
  echo "Configuration has errors"
  exit 1
fi
```

## See Also

- [init-db.md](./init-db.md) - Initialize database
- [manage-projects.md](./manage-projects.md) - Manage projects
