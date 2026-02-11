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

def import_workflow(json_file):
    """Import workflow from JSON file"""
    if not os.path.exists(json_file):
        print(f"Error: File not found: {json_file}")
        return

    with open(json_file) as f:
        workflow_data = json.load(f)

    # Remove properties not accepted by n8n API
    properties_to_remove = [
        'id', 'active', 'versionId', 'createdAt', 'updatedAt',
        'meta', 'tags', 'triggerCount', 'staticData', 'isArchived',
        'activeVersionId', 'versionCounter', 'description', 'pinData',
        'activeVersion'
    ]
    for prop in properties_to_remove:
        workflow_data.pop(prop, None)

    print(f"Importing workflow: {workflow_data.get('name', 'Unknown')}")
    response = api_request('POST', '/workflows', workflow_data, debug=True)
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

def update_workflow(workflow_id, json_file):
    """Update workflow from JSON file"""
    if not os.path.exists(json_file):
        print(f"Error: File not found: {json_file}")
        return

    with open(json_file) as f:
        workflow_data = json.load(f)

    response = api_request('PUT', f'/workflows/{workflow_id}', workflow_data)
    if response and response.status_code == 200:
        d = response.json()
        print(f"✅ Updated workflow: {d.get('name')} (ID: {d.get('id')})")
    else:
        print(f"❌ Update failed: {response.text if response else 'No response'}")

def show_help():
    """Show help message"""
    print("n8n API Helper Script")
    print("")
    print("Usage: python3 n8n_api.py <action> [params]")
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
    print("Configuration:")
    print(f"  N8N_API_URL: {N8N_API_URL}")
    print(f"  N8N_WEBHOOK_BASE_URL: {N8N_WEBHOOK_BASE_URL}")
    print(f"  N8N_API_KEY: {N8N_API_KEY[:20]}...")

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
    else:
        show_help()

if __name__ == '__main__':
    main()
