#!/usr/bin/env python3
"""
Export all active workflows from n8n into a SNAPSHOT directory.

Unlike export_all_active.py (which writes into ./workflows), this script writes
into a dedicated snapshot directory (default: workflows-2026-06-26), one file
per workflow named with the SAME convention as ./workflows
(spaces -> '_', parentheses and dashes preserved).

SAFETY: this script refuses to write into the ./workflows directory.
It never overwrites or modifies ./workflows.

Usage:
    python3 scripts/n8n/export_snapshot.py [output_dir]

    output_dir defaults to "workflows-2026-06-26" (relative to repo root).
"""

import os
import sys
import json
import requests
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent.parent
PROTECTED_DIR = (REPO_ROOT / "workflows").resolve()
DEFAULT_OUTPUT = "workflows-2026-06-26"


def load_env():
    env_file = REPO_ROOT / ".env.local"
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

# Characters that are unsafe on common filesystems -> replaced with '-'
_UNSAFE_CHARS = ['/', '\\', ':', '*', '?', '"', '<', '>', '|']


def workflow_filename(name):
    """Match ./workflows naming: spaces -> '_', keep () and -, drop unsafe chars."""
    safe = name
    for ch in _UNSAFE_CHARS:
        safe = safe.replace(ch, '-')
    safe = safe.replace(' ', '_')
    return f"{safe}.json"


def get_all_workflows():
    all_workflows = []
    cursor = None
    page = 1
    limit = 250

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
    url = f"{N8N_API_URL}/workflows/{workflow_id}"
    try:
        response = requests.get(url, headers=HEADERS)
        if response.status_code == 200:
            return response.json()
    except requests.exceptions.RequestException:
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
    output_name = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUTPUT
    output_dir = (REPO_ROOT / output_name).resolve()

    # SAFETY GUARD: never write into ./workflows
    if output_dir == PROTECTED_DIR or PROTECTED_DIR in output_dir.parents:
        print(f"ABORT: refusing to write into the protected workflows directory ({PROTECTED_DIR})")
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("n8n Active Workflows SNAPSHOT Export")
    print(f"Output: {output_dir}")
    print("=" * 60)
    print()

    print("Step 1: Fetching workflow list...")
    all_workflows = get_all_workflows()
    print(f"\nTotal workflows found: {len(all_workflows)}")

    active_workflows = [w for w in all_workflows if w.get('active')]
    print(f"Active workflows: {len(active_workflows)}")
    print()

    print("Step 2: Exporting active workflows...")
    print("-" * 60)

    exported = 0
    errors = 0

    for i, w in enumerate(active_workflows, 1):
        workflow_id = w['id']
        name = w['name']

        full_workflow = export_workflow(workflow_id)
        if not full_workflow:
            print(f"[{i}/{len(active_workflows)}] ERROR: {name}")
            errors += 1
            continue

        clean_workflow = clean_workflow_for_export(full_workflow)
        filepath = output_dir / workflow_filename(name)

        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(clean_workflow, f, indent=2, ensure_ascii=False)

        print(f"[{i}/{len(active_workflows)}] {name}")
        exported += 1

    print()
    print("=" * 60)
    print("Snapshot export complete!")
    print(f"  Exported: {exported}")
    print(f"  Errors: {errors}")
    print(f"  Output: {output_dir}")
    print("=" * 60)


if __name__ == '__main__':
    main()
