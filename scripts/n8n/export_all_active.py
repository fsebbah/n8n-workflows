#!/usr/bin/env python3
"""
Export all active workflows from n8n with pagination support.
Handles more than 250 workflows.
"""

import os
import sys
import json
import requests
import re
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
N8N_API_KEY = config.get('N8N_API_KEY', '')

if not N8N_API_KEY or N8N_API_KEY == 'your-n8n-api-key-here':
    print("Error: N8N_API_KEY not configured in .env.local")
    sys.exit(1)

HEADERS = {
    'X-N8N-API-KEY': N8N_API_KEY,
    'Content-Type': 'application/json'
}

def sanitize_filename(name):
    """Convert workflow name to valid filename"""
    # Replace spaces and special chars
    name = re.sub(r'[^\w\s\-]', '', name)
    name = name.replace(' ', '-')
    # Remove multiple dashes
    name = re.sub(r'-+', '-', name)
    return name

def get_all_workflows():
    """Fetch all workflows with pagination"""
    all_workflows = []
    cursor = None
    page = 1
    limit = 250  # Max per page

    while True:
        url = f"{N8N_API_URL}/workflows?limit={limit}"
        if cursor:
            url += f"&cursor={cursor}"

        print(f"Fetching page {page}... ", end="", flush=True)

        try:
            response = requests.get(url, headers=HEADERS)
            if response.status_code != 200:
                print(f"Error: {response.status_code}")
                print(response.text)
                break

            data = response.json()
            workflows = data.get('data', [])
            all_workflows.extend(workflows)

            print(f"got {len(workflows)} workflows (total: {len(all_workflows)})")

            # Check for next page
            next_cursor = data.get('nextCursor')
            if not next_cursor or len(workflows) < limit:
                break

            cursor = next_cursor
            page += 1

        except requests.exceptions.RequestException as e:
            print(f"Request error: {e}")
            break

    return all_workflows

def export_workflow(workflow_id):
    """Get full workflow details"""
    url = f"{N8N_API_URL}/workflows/{workflow_id}"
    try:
        response = requests.get(url, headers=HEADERS)
        if response.status_code == 200:
            return response.json()
    except:
        pass
    return None

# Settings acceptés par le schéma d'écriture de l'API n8n (sinon le réimport
# échoue en 400 "settings must NOT have additional properties").
VALID_WORKFLOW_SETTINGS = {
    'executionOrder', 'saveManualExecutions', 'saveExecutionProgress',
    'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout',
    'errorWorkflow', 'timezone', 'callerPolicy', 'callerIds',
}


def clean_workflow_for_export(workflow):
    """Remove read-only fields that cause import errors"""
    fields_to_remove = [
        'id', 'versionId', 'createdAt', 'updatedAt',
        'meta', 'triggerCount', 'staticData', 'isArchived',
        'activeVersionId', 'activeVersion', 'versionCounter', 'description',
        'pinData', 'shared', 'homeProject', 'scopes'
    ]
    for field in fields_to_remove:
        workflow.pop(field, None)
    # Sanitize settings : ne garder que les clés acceptées en écriture
    s = workflow.get('settings')
    if isinstance(s, dict):
        workflow['settings'] = {k: v for k, v in s.items() if k in VALID_WORKFLOW_SETTINGS}
    return workflow

def main():
    output_dir = Path(__file__).parent.parent.parent / "workflows"
    output_dir.mkdir(exist_ok=True)

    print("=" * 60)
    print("n8n Active Workflows Export")
    print("=" * 60)
    print()

    # Get all workflows
    print("Step 1: Fetching workflow list...")
    all_workflows = get_all_workflows()
    print(f"\nTotal workflows found: {len(all_workflows)}")

    # Filter active only
    active_workflows = [w for w in all_workflows if w.get('active')]
    print(f"Active workflows: {len(active_workflows)}")
    print()

    # Export each active workflow
    print("Step 2: Exporting active workflows...")
    print("-" * 60)

    exported = 0
    errors = 0

    for i, w in enumerate(active_workflows, 1):
        workflow_id = w['id']
        name = w['name']

        # Get full workflow
        full_workflow = export_workflow(workflow_id)
        if not full_workflow:
            print(f"[{i}/{len(active_workflows)}] ERROR: {name}")
            errors += 1
            continue

        # Clean for export
        clean_workflow = clean_workflow_for_export(full_workflow)

        # Generate filename
        filename = f"{sanitize_filename(name)}.json"
        filepath = output_dir / filename

        # Write to file
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(clean_workflow, f, indent=2, ensure_ascii=False)

        print(f"[{i}/{len(active_workflows)}] {name}")
        exported += 1

    print()
    print("=" * 60)
    print(f"Export complete!")
    print(f"  Exported: {exported}")
    print(f"  Errors: {errors}")
    print(f"  Output: {output_dir}")
    print("=" * 60)

if __name__ == '__main__':
    main()
