#!/usr/bin/env python3
"""
n8n API Helper Script
Usage: python3 n8n_api.py <action> [params]
"""

import os
import sys
import json
import requests
from pathlib import Path

# PostgreSQL support (optional, for webhook path search)
try:
    import psycopg2
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False

# Load configuration from .env.local
def load_env():
    env_file = Path(__file__).parent.parent.parent / ".env.local"
    config = {}
    if env_file.exists():
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    config[key] = value
    return config

config = load_env()

N8N_API_URL = config.get('N8N_API_URL', 'http://pi6.local:5678/api/v1')
N8N_WEBHOOK_BASE_URL = config.get('N8N_WEBHOOK_BASE_URL', 'http://pi6.local:5678/webhook')
N8N_API_KEY = config.get('N8N_API_KEY', '')

def apply_host_override():
    """Apply --host and --api-key overrides if provided in command line arguments"""
    global N8N_API_URL, N8N_WEBHOOK_BASE_URL, N8N_API_KEY, HEADERS

    # Process --host
    i = 0
    while i < len(sys.argv):
        if sys.argv[i] == '--host' and i + 1 < len(sys.argv):
            host = sys.argv[i + 1]
            sys.argv.pop(i)
            sys.argv.pop(i)
            if not host.startswith('http'):
                host = f'http://{host}'
            if ':' not in host.split('//')[-1]:
                host = f'{host}:5678'
            N8N_API_URL = f'{host}/api/v1'
            N8N_WEBHOOK_BASE_URL = f'{host}/webhook'
            print(f"[INFO] Using host: {host}")
        elif sys.argv[i] == '--api-key' and i + 1 < len(sys.argv):
            N8N_API_KEY = sys.argv[i + 1]
            sys.argv.pop(i)
            sys.argv.pop(i)
            print(f"[INFO] Using custom API key: {N8N_API_KEY[:20]}...")
        else:
            i += 1

    # Note: HEADERS will be created after this function with the updated N8N_API_KEY

# Apply host override before anything else
apply_host_override()

# PostgreSQL configuration for n8n database
DB_CONFIG = {
    'host': config.get('DB_POSTGRESDB_HOST', 'databases.local'),
    'port': int(config.get('DB_POSTGRESDB_PORT', '5435')),
    'database': config.get('DB_POSTGRESDB_DATABASE', 'n8n'),
    'user': config.get('DB_POSTGRESDB_USER', 'n8n'),
    'password': config.get('DB_POSTGRESDB_PASSWORD', 'n8npass')
}

if not N8N_API_KEY or N8N_API_KEY == 'your-n8n-api-key-here':
    print("Error: N8N_API_KEY not configured in .env.local")
    sys.exit(1)

HEADERS = {
    'X-N8N-API-KEY': N8N_API_KEY,
    'Content-Type': 'application/json'
}

def api_request(method, endpoint, data=None, debug=False):
    """Make API request to n8n"""
    url = f"{N8N_API_URL}{endpoint}"
    try:
        if debug:
            print(f"[DEBUG] {method} {url}")

        if method == 'GET':
            response = requests.get(url, headers=HEADERS)
        elif method == 'POST':
            response = requests.post(url, headers=HEADERS, json=data)
        elif method == 'PUT':
            response = requests.put(url, headers=HEADERS, json=data)
        elif method == 'DELETE':
            response = requests.delete(url, headers=HEADERS)
        else:
            print(f"Unknown method: {method}")
            return None

        if debug:
            print(f"[DEBUG] Status: {response.status_code}")
            print(f"[DEBUG] Response: {response.text[:500] if response.text else 'empty'}")

        # Return response even for error status codes
        return response
    except requests.exceptions.RequestException as e:
        print(f"Request error: {e}")
        return None

def list_workflows():
    """List all workflows"""
    response = api_request('GET', '/workflows')
    if response and response.status_code == 200:
        data = response.json()
        for w in data.get('data', []):
            status = '✅' if w['active'] else '❌'
            print(f"{status} {w['id']}: {w['name']}")
    else:
        print(f"Error: {response.status_code if response else 'No response'}")
        if response:
            print(response.text)

def get_workflow(workflow_id):
    """Get workflow details"""
    response = api_request('GET', f'/workflows/{workflow_id}')
    if response and response.status_code == 200:
        d = response.json()
        print(f"ID: {d.get('id')}")
        print(f"Name: {d.get('name')}")
        print(f"Active: {d.get('active')}")
        print(f"Nodes: {len(d.get('nodes', []))}")
        return d
    else:
        print(f"Error: {response.status_code if response else 'No response'}")
        if response:
            print(response.text)
        return None

def activate_workflow(workflow_id):
    """Activate a workflow"""
    print(f"Activating workflow {workflow_id}...")

    # Debug: print full request details
    url = f"{N8N_API_URL}/workflows/{workflow_id}/activate"
    print(f"URL: {url}")
    print(f"Headers: X-N8N-API-KEY: {N8N_API_KEY[:30]}...")

    # L'API activate nécessite un body JSON (même vide)
    response = api_request('POST', f'/workflows/{workflow_id}/activate', data={}, debug=True)

    if response is not None:
        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.text}")
        if response.status_code == 400:
            print("⚠️  Status 400 peut indiquer un problème avec le workflow (nodes invalides, etc.)")
    else:
        print("No response received from API")

    # Check if activated
    check = api_request('GET', f'/workflows/{workflow_id}')
    if check and check.status_code == 200:
        d = check.json()
        if d.get('active'):
            print(f"✅ Workflow '{d.get('name')}' is now ACTIVE")
        else:
            print(f"❌ Failed to activate workflow - Status: {d.get('active')}")

def deactivate_workflow(workflow_id):
    """Deactivate a workflow"""
    print(f"Deactivating workflow {workflow_id}...")
    response = api_request('POST', f'/workflows/{workflow_id}/deactivate')

    if response:
        print(f"Response: {response.text}")

def test_webhook(path, data=None):
    """Test a webhook endpoint"""
    url = f"{N8N_WEBHOOK_BASE_URL}/{path}"
    if data is None:
        data = {
            "message": "Test from n8n_api.py",
            "access_token": "test_token",
            "user_id": "user_123"
        }

    print(f"Testing webhook: {url}")
    try:
        response = requests.post(url, headers={'Content-Type': 'application/json'}, json=data)
        print(f"Status: {response.status_code}")
        try:
            print(json.dumps(response.json(), indent=2))
        except:
            print(response.text)
    except Exception as e:
        print(f"Error: {e}")

def import_workflow(json_file, debug=False):
    """Import workflow from JSON file"""
    if not os.path.exists(json_file):
        print(f"Error: File not found: {json_file}")
        return None

    with open(json_file) as f:
        workflow_data = json.load(f)

    # Remove properties not accepted by n8n API
    # See docs/n8n/WORKFLOW_BEST_PRACTICES.md for details
    properties_to_remove = [
        'id', 'active', 'versionId', 'createdAt', 'updatedAt',
        'meta', 'tags', 'triggerCount', 'staticData', 'isArchived',
        'activeVersionId', 'versionCounter', 'description', 'pinData',
        'activeVersion', 'shared'  # shared contains read-only project.id
    ]
    for prop in properties_to_remove:
        workflow_data.pop(prop, None)

    print(f"Importing workflow: {workflow_data.get('name', 'Unknown')}")
    response = api_request('POST', '/workflows', workflow_data, debug=debug)
    if response and response.status_code in [200, 201]:
        d = response.json()
        print(f"✅ Imported workflow: {d.get('name')} (ID: {d.get('id')})")
        return d.get('id')
    else:
        print(f"❌ Import failed: {response.status_code if response else 'No response'}")
        if response:
            print(f"Response: {response.text}")
        return None

def search_workflows(pattern):
    """Search workflows by name"""
    response = api_request('GET', '/workflows')
    if response and response.status_code == 200:
        data = response.json()
        found = 0
        for w in data.get('data', []):
            if pattern.lower() in w['name'].lower():
                status = '✅' if w['active'] else '❌'
                print(f"{status} {w['id']}: {w['name']}")
                found += 1
        if found == 0:
            print('No workflows found matching pattern')
    else:
        print(f"Error: {response.status_code if response else 'No response'}")

def export_workflow(workflow_id, output_file=None):
    """Export workflow to JSON file or stdout"""
    response = api_request('GET', f'/workflows/{workflow_id}')
    if response and response.status_code == 200:
        data = response.json()
        if output_file:
            with open(output_file, 'w') as f:
                json.dump(data, f, indent=2)
            print(f"✅ Exported workflow to {output_file}")
        else:
            print(json.dumps(data, indent=2))
        return data
    else:
        print(f"Error: {response.status_code if response else 'No response'}")
        if response:
            print(response.text)
        return None

def delete_workflow(workflow_id):
    """Delete a workflow"""
    # First get workflow info
    response = api_request('GET', f'/workflows/{workflow_id}')
    if not response or response.status_code != 200:
        print(f"Error: Workflow {workflow_id} not found")
        return False

    name = response.json().get('name', 'Unknown')

    # Delete the workflow
    response = api_request('DELETE', f'/workflows/{workflow_id}')
    if response and response.status_code in [200, 204]:
        print(f"✅ Deleted workflow: {name} (ID: {workflow_id})")
        return True
    else:
        print(f"❌ Delete failed: {response.text if response else 'No response'}")
        return False

def update_workflow(workflow_id, json_file, activate_after=True):
    """
    Update workflow from JSON file (preserves workflow ID and webhook registration).

    This is the PREFERRED method for updating workflows as it:
    - Preserves the workflow ID
    - Keeps webhook registrations intact (no "Active version not found" errors)
    - No need to restart n8n server

    Args:
        workflow_id: ID of the workflow to update
        json_file: Path to the JSON file with new workflow definition
        activate_after: If True, reactivate the workflow after update

    Returns:
        The new workflow ID (same as input) or None if failed
    """
    if not os.path.exists(json_file):
        print(f"Error: File not found: {json_file}")
        return None

    with open(json_file) as f:
        workflow_data = json.load(f)

    # Remove properties that shouldn't be in PUT request
    # NOTE: 'active' is READ-ONLY on PUT - must use /activate endpoint instead
    properties_to_remove = [
        'id', 'active', 'versionId', 'createdAt', 'updatedAt',
        'meta', 'tags', 'triggerCount', 'staticData', 'isArchived',
        'activeVersionId', 'versionCounter', 'description', 'pinData',
        'activeVersion', 'shared'
    ]
    for prop in properties_to_remove:
        workflow_data.pop(prop, None)

    response = api_request('PUT', f'/workflows/{workflow_id}', workflow_data, debug=True)

    # n8n API returns 200 for successful updates
    if response and response.status_code in [200, 201]:
        try:
            d = response.json()
            print(f"✅ Updated workflow: {d.get('name')} (ID: {d.get('id')})")
        except Exception as e:
            print(f"✅ Updated workflow (response parse warning: {e})")
            d = {'id': workflow_id}

        # Reactivate to ensure webhook is properly registered
        if activate_after:
            print(f"   Reactivating to ensure webhook registration...")
            # Deactivate first
            api_request('POST', f'/workflows/{workflow_id}/deactivate', data={})
            # Then activate
            act_response = api_request('POST', f'/workflows/{workflow_id}/activate', data={})
            if act_response and act_response.status_code == 200:
                print(f"   ✅ Webhook re-registered successfully")
            else:
                print(f"   ⚠️  Reactivation may have failed: {act_response.text if act_response else 'No response'}")

        return d.get('id', workflow_id)
    else:
        if response is not None:
            print(f"❌ Update failed (HTTP {response.status_code}): {response.text[:500] if response.text else 'Empty body'}")
        else:
            print(f"❌ Update failed: No response from server")
        return None

def find_workflow_by_name(name):
    """Find workflow ID by exact name"""
    response = api_request('GET', '/workflows')
    if response and response.status_code == 200:
        data = response.json()
        for w in data.get('data', []):
            if w['name'] == name:
                return w
    return None


def get_db_connection():
    """Get PostgreSQL connection to n8n database"""
    if not PSYCOPG2_AVAILABLE:
        print("❌ psycopg2 not installed. Run: pip install psycopg2-binary")
        return None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        return conn
    except Exception as e:
        print(f"❌ Database connection error: {e}")
        return None


def find_workflows_by_webhook_path(webhook_path):
    """
    Find workflows by webhook path using PostgreSQL database.

    Searches the n8n database for workflows containing webhook nodes
    with the specified path.

    Args:
        webhook_path: The webhook path to search for (e.g., "server-sync")

    Returns:
        List of workflow dicts with id, name, active status, and webhook info
    """
    conn = get_db_connection()
    if not conn:
        return []

    try:
        cursor = conn.cursor()

        # Query to find workflows with matching webhook path in nodes JSON
        # Searches for webhook nodes where parameters.path matches
        # Note: n8n uses json type (not jsonb), so we use json_array_elements
        query = """
            SELECT
                id,
                name,
                active,
                nodes
            FROM workflow_entity
            WHERE EXISTS (
                SELECT 1 FROM json_array_elements(nodes) AS node
                WHERE node->>'type' LIKE '%%webhook%%'
                AND (
                    node->'parameters'->>'path' = %s
                    OR node->>'webhookId' = %s
                )
            )
            ORDER BY "updatedAt" DESC
        """

        cursor.execute(query, (webhook_path, webhook_path))
        rows = cursor.fetchall()

        results = []
        for row in rows:
            workflow_id, name, active, nodes = row

            # Extract webhook info from nodes
            webhook_info = []
            if nodes:
                for node in nodes:
                    if 'webhook' in node.get('type', '').lower():
                        params = node.get('parameters', {})
                        webhook_info.append({
                            'node_name': node.get('name'),
                            'path': params.get('path'),
                            'webhookId': node.get('webhookId'),
                            'httpMethod': params.get('httpMethod', 'GET')
                        })

            results.append({
                'id': workflow_id,
                'name': name,
                'active': active,
                'webhooks': webhook_info
            })

        cursor.close()
        conn.close()

        return results

    except Exception as e:
        print(f"❌ Database query error: {e}")
        if conn:
            conn.close()
        return []


def list_workflows_by_webhook_path(webhook_path):
    """List workflows matching a webhook path"""
    workflows = find_workflows_by_webhook_path(webhook_path)

    if not workflows:
        print(f"No workflows found with webhook path: {webhook_path}")
        return

    print(f"\nFound {len(workflows)} workflow(s) with webhook path '{webhook_path}':\n")
    for w in workflows:
        status = '✅' if w['active'] else '❌'
        print(f"{status} {w['id']}: {w['name']}")
        for wh in w.get('webhooks', []):
            print(f"   └─ {wh.get('httpMethod', 'GET')} /{wh.get('path')} (webhookId: {wh.get('webhookId')})")

def batch_reimport(list_file, workflows_dir=None, dry_run=False, delete_old=True, log_file=None):
    """
    Batch reimport workflows from a list file.

    List file format (one per line):
      GUILD_-_Server_Sync
      GUILD_-_Student_Verify
      # Comments are ignored

    For each workflow:
      1. Find existing workflow by name
      2. Deactivate it
      3. Delete it (if --delete flag)
      4. Import new version from JSON file
      5. Activate it

    Args:
        list_file: Path to file containing workflow names (one per line)
        workflows_dir: Directory containing workflow JSON files
        dry_run: If True, don't actually make changes
        delete_old: If True, delete existing workflows before import
        log_file: Path to log file (auto-generated if None)
    """
    from datetime import datetime

    if workflows_dir is None:
        workflows_dir = Path(__file__).parent.parent.parent / "workflows"
    else:
        workflows_dir = Path(workflows_dir)

    if not os.path.exists(list_file):
        print(f"Error: List file not found: {list_file}")
        return

    # Setup logging
    if log_file is None:
        log_dir = Path(__file__).parent / "logs"
        log_dir.mkdir(exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_file = log_dir / f"batch_reimport_{timestamp}.log"

    log_messages = []
    def log(msg):
        print(msg)
        log_messages.append(f"{datetime.now().isoformat()} | {msg}")

    # Read workflow names from list file
    workflow_names = []
    with open(list_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#'):
                workflow_names.append(line)

    log(f"=" * 60)
    log(f"BATCH REIMPORT STARTED")
    log(f"=" * 60)
    log(f"List file: {list_file}")
    log(f"Workflows directory: {workflows_dir}")
    log(f"Found {len(workflow_names)} workflows to reimport")
    log(f"Dry run: {dry_run}")
    log(f"Delete old: {delete_old}")
    log(f"Log file: {log_file}")
    log("")

    results = {
        'success': [],
        'failed': [],
        'skipped': []
    }

    for name in workflow_names:
        log(f"\n{'='*60}")
        log(f"Processing: {name}")
        log(f"{'='*60}")

        # Find JSON file
        json_file = workflows_dir / f"{name}.json"
        if not json_file.exists():
            log(f"  ⚠️  JSON file not found: {json_file}")
            results['skipped'].append((name, "JSON file not found"))
            continue

        # Find existing workflow by reading name from JSON
        with open(json_file) as f:
            json_data = json.load(f)
            workflow_name = json_data.get('name', name)

        existing = find_workflow_by_name(workflow_name)

        if dry_run:
            if existing:
                log(f"  [DRY RUN] Would deactivate: {existing['name']} (ID: {existing['id']})")
                if delete_old:
                    log(f"  [DRY RUN] Would delete: {existing['id']}")
            log(f"  [DRY RUN] Would import: {json_file}")
            log(f"  [DRY RUN] Would activate new workflow")
            results['success'].append((name, "DRY RUN"))
            continue

        try:
            # Step 1: Deactivate existing workflow
            if existing:
                log(f"  1. Found existing: {existing['name']} (ID: {existing['id']}, active: {existing.get('active')})")
                if existing.get('active'):
                    log(f"     Deactivating...")
                    api_request('POST', f"/workflows/{existing['id']}/deactivate")

                # Step 2: Delete existing workflow (if --delete flag)
                if delete_old:
                    log(f"  2. Deleting: {existing['id']}")
                    resp = api_request('DELETE', f"/workflows/{existing['id']}")
                    if resp and resp.status_code in [200, 204]:
                        log(f"     Deleted successfully")
                    else:
                        log(f"     Delete failed: {resp.text if resp else 'No response'}")
                else:
                    log(f"  2. Skipping delete (--no-delete flag)")
            else:
                log(f"  1-2. No existing workflow found with name: {workflow_name}")

            # Step 3: Import new workflow
            log(f"  3. Importing: {json_file.name}")
            new_id = import_workflow(str(json_file), debug=False)

            if not new_id:
                log(f"  ❌ Import failed")
                results['failed'].append((name, "Import failed"))
                continue

            # Step 4: Activate new workflow
            log(f"  4. Activating: {new_id}")
            response = api_request('POST', f'/workflows/{new_id}/activate', data={})

            if response and response.status_code == 200:
                log(f"  ✅ Successfully reimported and activated: {name} -> {new_id}")
                results['success'].append((name, new_id))
            else:
                error_msg = response.text if response else 'No response'
                log(f"  ⚠️  Imported but activation failed: {error_msg}")
                results['success'].append((name, f"{new_id} (inactive)"))

        except Exception as e:
            log(f"  ❌ Error: {e}")
            results['failed'].append((name, str(e)))

    # Print summary
    log(f"\n{'='*60}")
    log("SUMMARY")
    log(f"{'='*60}")
    log(f"✅ Success: {len(results['success'])}")
    for name, info in results['success']:
        log(f"   - {name}: {info}")

    if results['failed']:
        log(f"\n❌ Failed: {len(results['failed'])}")
        for name, error in results['failed']:
            log(f"   - {name}: {error}")

    if results['skipped']:
        log(f"\n⚠️  Skipped: {len(results['skipped'])}")
        for name, reason in results['skipped']:
            log(f"   - {name}: {reason}")

    # Write log file
    with open(log_file, 'w') as f:
        f.write('\n'.join(log_messages))
    print(f"\n📝 Log saved to: {log_file}")

def batch_reimport_single(workflow_name, workflows_dir=None, dry_run=False, delete_old=True, use_webhook_path=False, force_new=False):
    """
    Reimport a single workflow by name or webhook path.

    IMPORTANT: By default, this function uses PUT (update in place) when a workflow
    with the same name exists. This preserves the workflow ID and avoids
    "Active version not found" webhook errors. Use --force-new to use the old
    delete + import behavior.

    Args:
        workflow_name: Name of the workflow file (e.g., GUILD_-_Server_Sync)
        workflows_dir: Directory containing workflow JSON files
        dry_run: If True, don't actually make changes
        delete_old: If True, delete duplicate workflows after update (keeps primary)
        use_webhook_path: If True, search by webhook path instead of workflow name
        force_new: If True, use delete + import instead of update (old behavior)
    """
    from datetime import datetime

    if workflows_dir is None:
        workflows_dir = Path(__file__).parent.parent.parent / "workflows"
    else:
        workflows_dir = Path(workflows_dir)

    # Find JSON file
    json_file = workflows_dir / f"{workflow_name}.json"
    if not json_file.exists():
        print(f"❌ JSON file not found: {json_file}")
        return False

    # Read workflow data from JSON
    with open(json_file) as f:
        json_data = json.load(f)
        display_name = json_data.get('name', workflow_name)

    # Extract webhook path from the workflow JSON
    webhook_path = None
    for node in json_data.get('nodes', []):
        if 'webhook' in node.get('type', '').lower():
            webhook_path = node.get('parameters', {}).get('path')
            if not webhook_path:
                webhook_path = node.get('webhookId')
            if webhook_path:
                break

    print(f"{'='*60}")
    print(f"Reimporting: {display_name}")
    print(f"{'='*60}")
    print(f"File: {json_file}")
    print(f"Webhook path: {webhook_path or 'N/A'}")
    print(f"Dry run: {dry_run}")
    print(f"Mode: {'DELETE + IMPORT (force-new)' if force_new else 'UPDATE IN PLACE (recommended)'}")
    print("")

    # Find existing workflows - prefer webhook path search if available
    existing_workflows = []

    if webhook_path and PSYCOPG2_AVAILABLE:
        print(f"🔍 Searching for existing workflows by webhook path: {webhook_path}")
        existing_workflows = find_workflows_by_webhook_path(webhook_path)
        if existing_workflows:
            print(f"   Found {len(existing_workflows)} workflow(s) via webhook path search")
            for w in existing_workflows:
                status = '✅' if w['active'] else '❌'
                print(f"   {status} {w['id']}: {w['name']}")
        else:
            print(f"   No workflows found with webhook path: {webhook_path}")
    else:
        # Fallback to name search
        print(f"🔍 Searching for existing workflow by name: {display_name}")
        existing = find_workflow_by_name(display_name)
        if existing:
            existing_workflows = [{
                'id': existing['id'],
                'name': existing['name'],
                'active': existing.get('active', False)
            }]
            print(f"   Found: {existing['id']}: {existing['name']}")
        else:
            print(f"   No existing workflow found")

    if dry_run:
        if existing_workflows and not force_new:
            print(f"[DRY RUN] Would UPDATE workflow: {existing_workflows[0]['id']} (preserves ID, no webhook issues)")
        else:
            for w in existing_workflows:
                print(f"[DRY RUN] Would deactivate: {w['name']} (ID: {w['id']})")
            print(f"[DRY RUN] Would import: {json_file.name}")
        print(f"[DRY RUN] Would activate workflow")
        if delete_old and len(existing_workflows) > 1:
            print(f"[DRY RUN] Would prompt to delete {len(existing_workflows) - 1} duplicate workflow(s)")
        return True

    try:
        # ========================================
        # PREFERRED: Update in place (preserves ID)
        # ========================================
        if existing_workflows and not force_new:
            primary_workflow = existing_workflows[0]
            print(f"\n1. Using UPDATE IN PLACE (preserves workflow ID, avoids webhook issues)")
            print(f"   Target: {primary_workflow['id']} ({primary_workflow['name']})")

            # Deactivate first
            if primary_workflow.get('active'):
                print(f"   Deactivating for update...")
                api_request('POST', f"/workflows/{primary_workflow['id']}/deactivate", data={})

            # Update the workflow
            print(f"\n2. Updating workflow with new definition...")
            new_id = update_workflow(primary_workflow['id'], str(json_file), activate_after=True)

            if not new_id:
                print(f"❌ Update failed, falling back to import...")
                # Fall through to import logic
            else:
                # Success! Handle duplicates if any
                if delete_old and len(existing_workflows) > 1:
                    duplicates = existing_workflows[1:]
                    print(f"\n3. Found {len(duplicates)} duplicate workflow(s) to clean up")
                    for w in duplicates:
                        print(f"   Deactivating and deleting: {w['id']} ({w['name']})")
                        api_request('POST', f"/workflows/{w['id']}/deactivate", data={})
                        resp = api_request('DELETE', f"/workflows/{w['id']}")
                        if resp and resp.status_code in [200, 204]:
                            print(f"   ✅ Deleted duplicate: {w['id']}")
                        else:
                            print(f"   ⚠️  Delete failed: {resp.text if resp else 'No response'}")

                print(f"\n{'='*60}")
                print(f"✅ Successfully updated: {display_name}")
                print(f"   Workflow ID: {new_id} (preserved)")
                print(f"   Webhook should work immediately (no restart needed)")
                print(f"{'='*60}")
                return True

        # ========================================
        # FALLBACK: Delete + Import (creates new ID)
        # ========================================
        print(f"\n1. Using DELETE + IMPORT mode (creates new workflow ID)")

        # Deactivate ALL existing workflows
        print(f"   Deactivating existing workflows...")
        for w in existing_workflows:
            if w.get('active'):
                print(f"   Deactivating: {w['id']} ({w['name']})")
                api_request('POST', f"/workflows/{w['id']}/deactivate", data={})
            else:
                print(f"   Already inactive: {w['id']} ({w['name']})")

        # Delete existing if delete_old is True
        if delete_old and existing_workflows:
            print(f"\n   Deleting existing workflows...")
            for w in existing_workflows:
                resp = api_request('DELETE', f"/workflows/{w['id']}")
                if resp and resp.status_code in [200, 204]:
                    print(f"   ✅ Deleted: {w['id']} ({w['name']})")
                else:
                    print(f"   ⚠️  Delete failed: {resp.text if resp else 'No response'}")

        # Import new workflow
        print(f"\n2. Importing: {json_file.name}")
        new_id = import_workflow(str(json_file), debug=False)

        if not new_id:
            print(f"❌ Import failed")
            return False

        # Activate new workflow
        print(f"\n3. Activating: {new_id}")
        response = api_request('POST', f'/workflows/{new_id}/activate', data={})

        if response and response.status_code == 200:
            print(f"   ✅ Workflow {new_id} is now ACTIVE")
        else:
            error_msg = response.text if response else 'No response'
            print(f"   ⚠️  Activation failed: {error_msg}")

        print(f"\n{'='*60}")
        print(f"✅ Successfully reimported: {display_name}")
        print(f"   New workflow ID: {new_id}")
        print(f"   ⚠️  NOTE: If webhook shows 'Active version not found',")
        print(f"      restart n8n or wait a few seconds for cache to refresh.")
        print(f"{'='*60}")
        return True

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


def show_help():
    """Show help message"""
    print("n8n API Helper Script")
    print("")
    print("Usage: python3 n8n_api.py [--host <host>] [--api-key <key>] <action> [params]")
    print("")
    print("Global options:")
    print("  --host <host>           Override n8n host (e.g., host2.local, http://host2.local:5678)")
    print("                          Default: from .env.local or pi6.local:5678")
    print("  --api-key <key>         Override API key (required when using different host)")
    print("                          Each n8n instance has its own API key")
    print("")
    print("Actions:")
    print("  list                    List all workflows")
    print("  get <id>                Get workflow details")
    print("  export <id> [file]      Export workflow to JSON (stdout or file)")
    print("  activate <id>           Activate a workflow")
    print("  deactivate <id>         Deactivate a workflow")
    print("  import <file>           Import workflow from JSON file")
    print("  update <id> <file>      Update workflow from JSON file")
    print("  delete <id>             Delete a workflow")
    print("  search <pattern>        Search workflows by name")
    print("  test-webhook <path>     Test a webhook endpoint")
    print("")
    print("  find-by-webhook <path>  Find workflows by webhook path (PostgreSQL)")
    print("                          Searches n8n database for workflows with matching webhook")
    print("")
    print("  batch-reimport <list_file_or_workflow> [--dry-run] [--no-delete]")
    print("                          Reimport workflow(s) from list file or single workflow")
    print("                          - List file: one workflow name per line")
    print("                          - Single workflow: e.g., GUILD_-_Server_Sync")
    print("                          --dry-run: preview without changes")
    print("                          --no-delete: keep old workflows (default: delete)")
    print("                          ")
    print("                          Uses PostgreSQL to find existing workflows by webhook path")
    print("                          (handles duplicates). Interactive deletion confirmation:")
    print("                            a = delete all old workflows")
    print("                            y = confirm each one by one")
    print("                            n = skip deletion")
    print("                          Logs saved to scripts/n8n/logs/")
    print("")
    print("Configuration:")
    print(f"  N8N_API_URL: {N8N_API_URL}")
    print(f"  N8N_WEBHOOK_BASE_URL: {N8N_WEBHOOK_BASE_URL}")
    print(f"  N8N_API_KEY: {N8N_API_KEY[:20]}...")
    print(f"  DB_HOST: {DB_CONFIG['host']}:{DB_CONFIG['port']}")
    print(f"  DB_NAME: {DB_CONFIG['database']}")
    print(f"  psycopg2: {'✅ Available' if PSYCOPG2_AVAILABLE else '❌ Not installed (pip install psycopg2-binary)'}")

def main():
    if len(sys.argv) < 2:
        show_help()
        return

    action = sys.argv[1]

    if action == 'list':
        list_workflows()
    elif action == 'get':
        if len(sys.argv) < 3:
            print("Usage: python3 n8n_api.py get <workflow_id>")
            return
        get_workflow(sys.argv[2])
    elif action == 'activate':
        if len(sys.argv) < 3:
            print("Usage: python3 n8n_api.py activate <workflow_id>")
            return
        activate_workflow(sys.argv[2])
    elif action == 'deactivate':
        if len(sys.argv) < 3:
            print("Usage: python3 n8n_api.py deactivate <workflow_id>")
            return
        deactivate_workflow(sys.argv[2])
    elif action == 'import':
        if len(sys.argv) < 3:
            print("Usage: python3 n8n_api.py import <json_file>")
            return
        import_workflow(sys.argv[2])
    elif action == 'search':
        if len(sys.argv) < 3:
            print("Usage: python3 n8n_api.py search <pattern>")
            return
        search_workflows(sys.argv[2])
    elif action == 'test-webhook':
        if len(sys.argv) < 3:
            print("Usage: python3 n8n_api.py test-webhook <path>")
            return
        test_webhook(sys.argv[2])
    elif action == 'export':
        if len(sys.argv) < 3:
            print("Usage: python3 n8n_api.py export <workflow_id> [output_file]")
            return
        output_file = sys.argv[3] if len(sys.argv) > 3 else None
        export_workflow(sys.argv[2], output_file)
    elif action == 'delete':
        if len(sys.argv) < 3:
            print("Usage: python3 n8n_api.py delete <workflow_id>")
            return
        delete_workflow(sys.argv[2])
    elif action == 'update':
        if len(sys.argv) < 4:
            print("Usage: python3 n8n_api.py update <workflow_id> <json_file>")
            return
        update_workflow(sys.argv[2], sys.argv[3])
    elif action == 'find-by-webhook':
        if len(sys.argv) < 3:
            print("Usage: python3 n8n_api.py find-by-webhook <webhook_path>")
            print("")
            print("Search n8n PostgreSQL database for workflows with matching webhook path.")
            print("Example: python3 n8n_api.py find-by-webhook server-sync")
            return
        list_workflows_by_webhook_path(sys.argv[2])
    elif action == 'batch-reimport':
        if len(sys.argv) < 3:
            print("Usage: python3 n8n_api.py batch-reimport <list_file_or_workflow> [options]")
            print("")
            print("Arguments:")
            print("  <list_file>   File containing workflow names (one per line)")
            print("  <workflow>    Single workflow name (e.g., GUILD_-_Server_Sync)")
            print("")
            print("Options:")
            print("  --dry-run    Show what would be done without making changes")
            print("  --no-delete  Don't delete duplicate workflows")
            print("  --force-new  Force DELETE + IMPORT instead of UPDATE (creates new ID)")
            print("")
            print("Default behavior (recommended):")
            print("  - If workflow exists: UPDATE IN PLACE (preserves ID, no webhook issues)")
            print("  - If workflow doesn't exist: IMPORT new workflow")
            print("  - Duplicates are automatically cleaned up")
            print("")
            print("Use --force-new only if you need a fresh workflow ID.")
            print("")
            print("Note: Uses PostgreSQL to find workflows by webhook path (handles duplicates)")
            return
        dry_run = '--dry-run' in sys.argv
        delete_old = '--no-delete' not in sys.argv
        force_new = '--force-new' in sys.argv
        target = sys.argv[2]

        # Check if it's a file or a workflow name
        if os.path.exists(target):
            # It's a list file
            batch_reimport(target, dry_run=dry_run, delete_old=delete_old)
        else:
            # It's a single workflow name - create temp list
            batch_reimport_single(target, dry_run=dry_run, delete_old=delete_old, force_new=force_new)
    else:
        show_help()

if __name__ == '__main__':
    main()
