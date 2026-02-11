#!/usr/bin/env python3
"""
Analyze all workflows for hardcoded values (prompts, URLs, models).
Generates a CSV report.
"""

import json
import csv
import re
from pathlib import Path

WORKFLOWS_DIR = Path(__file__).parent.parent / "workflows"
OUTPUT_CSV = Path(__file__).parent.parent / "reports" / "hardcoded_values.csv"

# Patterns to detect hardcoded values
PATTERNS = {
    "hardcoded_url": re.compile(r'https?://(?!.*\{\{)[^\s"\']+(?:api\.anthropic|api\.openai|api\.google|api\.mistral|api\.cohere)[^\s"\']*', re.I),
    "hardcoded_model": re.compile(r'\b(claude-3[^\s"\']*|gpt-4[^\s"\']*|gpt-3\.5[^\s"\']*|gemini-[^\s"\']*|mistral-[^\s"\']*)\b', re.I),
    # Only match actual LLM prompts (in JSON body with messages array)
    "hardcoded_prompt": re.compile(r"'messages':\s*\[|\"messages\":\s*\[", re.I),
}

# Nodes and parameters to check
PARAMS_TO_CHECK = [
    ("url", "URL"),
    ("jsonBody", "JSON Body"),
    ("jsCode", "Code JS"),
    ("content", "Prompt/Content"),
    ("text", "Text"),
    ("message", "Message"),
    ("prompt", "Prompt"),
    ("systemMessage", "System Message"),
    ("model", "Model"),
]

def extract_hardcoded_values(workflow_path):
    """Extract hardcoded values from a workflow file."""
    results = []

    try:
        with open(workflow_path, 'r', encoding='utf-8') as f:
            workflow = json.load(f)
    except:
        return results

    workflow_name = workflow.get('name', workflow_path.stem)

    nodes = workflow.get('nodes', [])

    for node in nodes:
        node_name = node.get('name', 'Unknown')
        node_type = node.get('type', '')
        params = node.get('parameters', {})

        # Skip sticky notes for prompts (they're documentation)
        if 'stickyNote' in node_type:
            continue

        for param_key, param_label in PARAMS_TO_CHECK:
            value = params.get(param_key)
            if not value or not isinstance(value, str):
                continue

            # Skip if it's a pure expression
            if value.startswith('={{') and value.endswith('}}'):
                continue

            issues = []

            # Skip URL checks - external API URLs are expected to be hardcoded

            # Check for hardcoded models in jsonBody
            if param_key in ['jsonBody', 'jsCode', 'content']:
                model_matches = PATTERNS['hardcoded_model'].findall(value)
                unique_models = set(model_matches)

                # Skip if multiple models in same code (configuration/routing table)
                if len(unique_models) > 2:
                    continue

                for model in unique_models:
                    # Skip if model is used as fallback after || or ??
                    fallback_pattern = re.search(rf"(\|\||\\?\\?)\s*['\"]?{re.escape(model)}['\"]?", value)
                    if fallback_pattern:
                        continue
                    # Skip if model appears in conditional/switch logic
                    conditional_pattern = re.search(rf"(if|case|switch|===|==)\s*.*{re.escape(model)}", value, re.I)
                    if conditional_pattern:
                        continue
                    if '$json' not in value or model not in value.split('$json')[0]:
                        issues.append(f"Model en dur: {model}")

            # Check for hardcoded prompts
            if param_key in ['jsonBody', 'jsCode', 'content', 'text', 'prompt', 'systemMessage']:
                if PATTERNS['hardcoded_prompt'].search(value):
                    # Extract first 100 chars of the prompt
                    prompt_preview = value[:100].replace('\n', ' ').replace('"', "'")
                    if len(value) > 100:
                        prompt_preview += "..."
                    issues.append(f"Prompt en dur: {prompt_preview}")

            for issue in issues:
                results.append({
                    'workflow': workflow_name,
                    'node': node_name,
                    'parameter': param_label,
                    'issue': issue
                })

    return results

def main():
    OUTPUT_CSV.parent.mkdir(exist_ok=True)

    all_results = []
    workflow_files = sorted(WORKFLOWS_DIR.glob('*.json'))

    print(f"Analysing {len(workflow_files)} workflows...")

    for wf_path in workflow_files:
        results = extract_hardcoded_values(wf_path)
        all_results.extend(results)

    # Write CSV
    with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f, delimiter=';')
        writer.writerow(['Workflow', 'Node', 'Parameter', 'Issue'])

        current_workflow = None
        for r in all_results:
            if r['workflow'] != current_workflow:
                if current_workflow is not None:
                    writer.writerow([])  # Empty line between workflows
                current_workflow = r['workflow']
            writer.writerow([r['workflow'], r['node'], r['parameter'], r['issue']])

    # Summary
    workflows_with_issues = len(set(r['workflow'] for r in all_results))
    print(f"\nAnalysis complete!")
    print(f"  Total issues: {len(all_results)}")
    print(f"  Workflows with issues: {workflows_with_issues}")
    print(f"  Output: {OUTPUT_CSV}")

    # Print summary by type
    model_issues = sum(1 for r in all_results if 'Model' in r['issue'])
    prompt_issues = sum(1 for r in all_results if 'Prompt' in r['issue'])

    print(f"\nBy type:")
    print(f"  Models en dur: {model_issues}")
    print(f"  Prompts en dur: {prompt_issues}")

if __name__ == '__main__':
    main()
