#!/usr/bin/env python3
"""
n8n Active Workflows Analyzer

Fetches all active workflows from n8n, displays them by category,
detects duplicates/inconsistencies, and maps webhook + API endpoints.

Usage:
    python3 scripts/n8n/list_active_workflows.py
    python3 scripts/n8n/list_active_workflows.py --all        # Include inactive
    python3 scripts/n8n/list_active_workflows.py --duplicates # Show only duplicates
    python3 scripts/n8n/list_active_workflows.py --endpoints  # Show webhook endpoints
    python3 scripts/n8n/list_active_workflows.py --api        # Show API endpoints called
    python3 scripts/n8n/list_active_workflows.py --json       # Output as JSON
    python3 scripts/n8n/list_active_workflows.py --cleanup    # Show cleanup plan
"""

import os
import sys
import json
import argparse
import requests
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from urllib.parse import urlparse

try:
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich.tree import Tree
    from rich import box
    from rich.text import Text
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False

# Configuration
N8N_API_URL = os.environ.get("N8N_API_URL", "http://pi6.local:5678/api/v1")
N8N_API_KEY = os.environ.get("N8N_API_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MjliMWE2ZS1hMjQxLTQxNjAtYTExNS01MGI5NDA0YjIxNmMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzY0NzgxODYxfQ.qzNk9ixI5t8xQ9L3PF9ZF-fsRgIf_YwIcx91LqcPpX0")

# Category detection patterns
CATEGORIES = [
    ("MCP", ["MCP"], "📦"),
    ("TORAH", ["Torah"], "📜"),
    ("DISCORD", ["DISCORD", "Discord"], "💬"),
    ("RECIPES", ["Recipe", "Recipes"], "🍳"),
    ("BOOKS", ["Book", "Books"], "📚"),
    ("STRIPE", ["STRIPE", "Stripe"], "💳"),
    ("VIDEO", ["Video"], "🎬"),
    ("TRANSCRI", ["Transcri"], "📝"),
]

console = Console() if RICH_AVAILABLE else None


def get_all_workflows(active_only: bool = True) -> List[dict]:
    """Fetch all workflows from n8n API with pagination."""
    headers = {"X-N8N-API-KEY": N8N_API_KEY}
    all_workflows = []
    cursor = None

    while True:
        url = f"{N8N_API_URL}/workflows?limit=100"
        if cursor:
            url += f"&cursor={cursor}"

        try:
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            data = response.json()
        except requests.RequestException as e:
            print(f"Error fetching workflows: {e}", file=sys.stderr)
            sys.exit(1)

        workflows = data.get("data", [])
        if active_only:
            workflows = [w for w in workflows if w.get("active")]
        all_workflows.extend(workflows)

        cursor = data.get("nextCursor")
        if not cursor:
            break

    return all_workflows


def get_category(name: str) -> Tuple[str, str]:
    """Determine workflow category and icon from name."""
    for category, patterns, icon in CATEGORIES:
        for pattern in patterns:
            if name.lower().startswith(pattern.lower()):
                return category, icon
    return "AUTRES", "🔧"


def extract_webhook_endpoints(workflow: dict) -> List[dict]:
    """Extract webhook endpoints from workflow nodes."""
    endpoints = []
    nodes = workflow.get("nodes", [])

    for node in nodes:
        node_type = node.get("type", "")
        if "webhook" in node_type.lower():
            params = node.get("parameters", {})
            path = params.get("path") or node.get("webhookId", "")
            method = params.get("httpMethod", "POST")

            if path:
                endpoints.append({
                    "type": "webhook",
                    "path": path,
                    "method": method,
                    "url": f"http://pi6.local:5678/webhook/{path}",
                    "node_name": node.get("name", ""),
                })

    return endpoints


def extract_api_endpoints(workflow: dict) -> List[dict]:
    """Extract external API endpoints called by workflow."""
    endpoints = []
    nodes = workflow.get("nodes", [])

    for node in nodes:
        node_type = node.get("type", "")
        params = node.get("parameters", {})

        # HTTP Request nodes
        if "httpRequest" in node_type.lower() or node_type == "n8n-nodes-base.httpRequest":
            url = params.get("url", "")
            method = params.get("method", params.get("requestMethod", "GET"))

            if url and not url.startswith("={{"):
                # Parse URL to get domain
                try:
                    parsed = urlparse(url)
                    domain = parsed.netloc or "dynamic"
                except:
                    domain = "unknown"

                endpoints.append({
                    "type": "api_call",
                    "url": url[:80] + "..." if len(url) > 80 else url,
                    "method": method,
                    "domain": domain,
                    "node_name": node.get("name", ""),
                })

        # OpenAI nodes
        elif "openai" in node_type.lower():
            resource = params.get("resource", "chat")
            operation = params.get("operation", "")
            endpoints.append({
                "type": "api_call",
                "url": f"OpenAI API ({resource}/{operation})",
                "method": "POST",
                "domain": "api.openai.com",
                "node_name": node.get("name", ""),
            })

        # Anthropic/Claude nodes
        elif "anthropic" in node_type.lower() or "claude" in node_type.lower():
            endpoints.append({
                "type": "api_call",
                "url": "Anthropic API",
                "method": "POST",
                "domain": "api.anthropic.com",
                "node_name": node.get("name", ""),
            })

        # Google nodes
        elif "google" in node_type.lower():
            service = node_type.split(".")[-1].replace("google", "").replace("Google", "")
            endpoints.append({
                "type": "api_call",
                "url": f"Google {service} API",
                "method": "varies",
                "domain": "googleapis.com",
                "node_name": node.get("name", ""),
            })

        # Postgres nodes
        elif "postgres" in node_type.lower():
            creds = node.get("credentials", {})
            cred_name = list(creds.values())[0].get("name", "default") if creds else "default"
            operation = params.get("operation", "query")
            endpoints.append({
                "type": "database",
                "url": f"PostgreSQL ({cred_name})",
                "method": operation,
                "domain": "postgresql",
                "node_name": node.get("name", ""),
            })

        # Discord nodes
        elif "discord" in node_type.lower():
            resource = params.get("resource", "")
            operation = params.get("operation", "")
            endpoints.append({
                "type": "api_call",
                "url": f"Discord API ({resource}/{operation})",
                "method": "POST",
                "domain": "discord.com",
                "node_name": node.get("name", ""),
            })

    return endpoints


def analyze_workflows(workflows: List[dict]) -> dict:
    """Analyze workflows and return structured data."""
    by_category = defaultdict(list)
    by_name = defaultdict(list)
    by_webhook = defaultdict(list)
    all_api_calls = defaultdict(list)

    for wf in workflows:
        name = wf.get("name", "Unknown")
        wf_id = wf.get("id", "")
        category, icon = get_category(name)
        created = wf.get("createdAt", "")
        updated = wf.get("updatedAt", "")
        active = wf.get("active", False)

        # Extract endpoints
        webhooks = extract_webhook_endpoints(wf)
        api_calls = extract_api_endpoints(wf)

        wf_info = {
            "id": wf_id,
            "name": name,
            "category": category,
            "icon": icon,
            "active": active,
            "created_at": created,
            "updated_at": updated,
            "webhooks": webhooks,
            "api_calls": api_calls,
        }

        by_category[category].append(wf_info)
        by_name[name].append(wf_info)

        for ep in webhooks:
            by_webhook[ep["path"]].append({**wf_info, "webhook_method": ep["method"]})

        for api in api_calls:
            all_api_calls[api["domain"]].append({
                "workflow": name,
                "workflow_id": wf_id,
                "url": api["url"],
                "method": api["method"],
                "node": api["node_name"],
            })

    # Find duplicates
    duplicates = {name: wfs for name, wfs in by_name.items() if len(wfs) > 1}

    # Find webhook conflicts
    webhook_conflicts = {
        path: wfs for path, wfs in by_webhook.items()
        if len(set(w["id"] for w in wfs)) > 1
    }

    return {
        "by_category": dict(by_category),
        "by_name": dict(by_name),
        "by_webhook": dict(by_webhook),
        "api_calls": dict(all_api_calls),
        "duplicates": duplicates,
        "webhook_conflicts": webhook_conflicts,
        "total": len(workflows),
        "total_active": len([w for w in workflows if w.get("active")]),
    }


def print_table_rich(analysis: dict, show_all: bool = False):
    """Print workflows using rich tables."""
    console.print()
    console.print(Panel.fit(
        f"[bold cyan]WORKFLOWS {'(ALL)' if show_all else 'ACTIFS'}[/bold cyan] - {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        border_style="cyan"
    ))
    console.print()

    # Summary table
    summary = Table(title="Résumé par Catégorie", box=box.ROUNDED, show_header=True)
    summary.add_column("Catégorie", style="bold")
    summary.add_column("Total", justify="right")
    summary.add_column("Uniques", justify="right")
    summary.add_column("Doublons", justify="right", style="yellow")

    category_order = ["MCP", "TORAH", "DISCORD", "RECIPES", "BOOKS", "STRIPE", "VIDEO", "TRANSCRI", "AUTRES"]

    for category in category_order:
        workflows = analysis["by_category"].get(category, [])
        if not workflows:
            continue

        icon = workflows[0]["icon"] if workflows else "📁"
        unique_names = len(set(w["name"] for w in workflows))
        duplicates = len(workflows) - unique_names

        dup_style = "red bold" if duplicates > 0 else "green"
        summary.add_row(
            f"{icon} {category}",
            str(len(workflows)),
            str(unique_names),
            Text(str(duplicates), style=dup_style)
        )

    console.print(summary)
    console.print()

    # Detailed tree view per category
    for category in category_order:
        workflows = analysis["by_category"].get(category, [])
        if not workflows:
            continue

        icon = workflows[0]["icon"] if workflows else "📁"
        unique_count = len(set(w["name"] for w in workflows))

        tree = Tree(f"[bold]{icon} {category}[/bold] ({len(workflows)} workflows, {unique_count} uniques)")

        # Group by name
        by_name = defaultdict(list)
        for wf in workflows:
            by_name[wf["name"]].append(wf)

        for name in sorted(by_name.keys()):
            wfs = by_name[name]
            status = "[green]✅[/green]" if wfs[0]["active"] else "[red]❌[/red]"

            if len(wfs) > 1:
                branch = tree.add(f"{status} {name} [yellow]⚠️ x{len(wfs)} DOUBLONS[/yellow]")
                for wf in wfs:
                    updated = wf['updated_at'][:10] if wf['updated_at'] else 'N/A'
                    branch.add(f"[dim]ID: {wf['id'][:12]}... (updated: {updated})[/dim]")
            else:
                tree.add(f"{status} {name}")

        console.print(tree)
        console.print()

    # Final stats
    stats = Table(box=box.SIMPLE, show_header=False)
    stats.add_column("Metric", style="bold")
    stats.add_column("Value", justify="right")

    dup_count = len(analysis["duplicates"])
    conflict_count = len(analysis["webhook_conflicts"])

    stats.add_row("Total workflows", str(analysis["total"]))
    stats.add_row("Doublons", Text(str(dup_count), style="red" if dup_count > 0 else "green"))
    stats.add_row("Conflits webhooks", Text(str(conflict_count), style="red" if conflict_count > 0 else "green"))

    console.print(Panel(stats, title="Statistiques", border_style="blue"))


def print_endpoints_rich(analysis: dict):
    """Print webhook endpoints using rich, grouped by category."""
    console.print()
    console.print(Panel.fit("[bold cyan]MAPPING WEBHOOKS → WORKFLOWS[/bold cyan]", border_style="cyan"))
    console.print()

    # Group endpoints by category
    endpoints_by_category = defaultdict(list)

    for path, wfs in analysis["by_webhook"].items():
        category = wfs[0]["category"] if wfs else "AUTRES"
        icon = wfs[0]["icon"] if wfs else "🔧"
        methods = set(w.get("webhook_method", "POST") for w in wfs)

        if len(set(w["id"] for w in wfs)) > 1:
            status = "[yellow]⚠️[/yellow]"
            workflow_text = f"[yellow]{len(wfs)} workflows (conflit!)[/yellow]"
            has_conflict = True
        else:
            status = "[green]✅[/green]"
            workflow_text = wfs[0]["name"]
            has_conflict = False

        endpoints_by_category[category].append({
            "path": path,
            "methods": ", ".join(methods),
            "status": status,
            "workflow": workflow_text,
            "has_conflict": has_conflict,
            "icon": icon,
        })

    # Category order
    category_order = ["MCP", "TORAH", "DISCORD", "RECIPES", "BOOKS", "STRIPE", "VIDEO", "TRANSCRI", "AUTRES"]
    category_icons = {
        "MCP": "📦", "TORAH": "📜", "DISCORD": "💬", "RECIPES": "🍳",
        "BOOKS": "📚", "STRIPE": "💳", "VIDEO": "🎬", "TRANSCRI": "📝", "AUTRES": "🔧"
    }

    total_endpoints = 0
    total_conflicts = 0

    for category in category_order:
        endpoints = endpoints_by_category.get(category, [])
        if not endpoints:
            continue

        icon = category_icons.get(category, "📁")

        table = Table(
            box=box.ROUNDED,
            show_header=True,
            title=f"{icon} {category} ({len(endpoints)} endpoints)"
        )
        table.add_column("", width=2)
        table.add_column("Method", style="cyan", width=6)
        table.add_column("Path", style="bold")
        table.add_column("Workflow")

        # Sort endpoints by path within category
        for ep in sorted(endpoints, key=lambda x: x["path"]):
            table.add_row(
                ep["status"],
                ep["methods"],
                f"/webhook/{ep['path']}",
                ep["workflow"]
            )
            total_endpoints += 1
            if ep["has_conflict"]:
                total_conflicts += 1

        console.print(table)
        console.print()

    # Summary
    console.print(Panel(
        f"[bold]Total:[/bold] {total_endpoints} endpoints | [bold]Conflits:[/bold] {total_conflicts}",
        border_style="blue"
    ))


def print_api_endpoints_rich(analysis: dict):
    """Print API endpoints called by workflows, grouped by workflow category."""
    console.print()
    console.print(Panel.fit("[bold cyan]ENDPOINTS API APPELÉS[/bold cyan]", border_style="cyan"))
    console.print()

    # Reorganize by workflow category, then by domain
    api_by_category = defaultdict(lambda: defaultdict(list))

    for domain, calls in analysis["api_calls"].items():
        for call in calls:
            # Get category from workflow name
            wf_name = call["workflow"]
            category, icon = get_category(wf_name)
            api_by_category[category][domain].append(call)

    # Category order
    category_order = ["MCP", "TORAH", "DISCORD", "RECIPES", "BOOKS", "STRIPE", "VIDEO", "TRANSCRI", "AUTRES"]
    category_icons = {
        "MCP": "📦", "TORAH": "📜", "DISCORD": "💬", "RECIPES": "🍳",
        "BOOKS": "📚", "STRIPE": "💳", "VIDEO": "🎬", "TRANSCRI": "📝", "AUTRES": "🔧"
    }

    total_domains = set()
    total_calls = 0

    for category in category_order:
        domains_data = api_by_category.get(category, {})
        if not domains_data:
            continue

        icon = category_icons.get(category, "📁")
        domain_count = len(domains_data)

        console.print(f"[bold]{icon} {category}[/bold] ({domain_count} services)")
        console.print()

        for domain in sorted(domains_data.keys()):
            calls = domains_data[domain]
            total_domains.add(domain)

            table = Table(box=box.SIMPLE, show_header=True, padding=(0, 1))
            table.add_column("Workflow", style="dim", width=25)
            table.add_column("Method", style="cyan", width=8)
            table.add_column("Endpoint", width=45)
            table.add_column("Node", style="dim", width=20)

            # Deduplicate
            seen = set()
            for call in calls:
                key = (call["workflow"], call["url"])
                if key in seen:
                    continue
                seen.add(key)
                total_calls += 1

                table.add_row(
                    call["workflow"][:25],
                    call["method"],
                    call["url"][:45],
                    call["node"][:20]
                )

            console.print(f"  🌐 [cyan]{domain}[/cyan]")
            console.print(table)
            console.print()

    # Summary
    console.print(Panel(
        f"[bold]Domaines:[/bold] {len(total_domains)} | [bold]Total appels:[/bold] {total_calls}",
        border_style="blue"
    ))


def print_duplicates_rich(analysis: dict):
    """Print duplicates using rich."""
    console.print()
    console.print(Panel.fit("[bold yellow]DOUBLONS DÉTECTÉS[/bold yellow]", border_style="yellow"))
    console.print()

    if not analysis["duplicates"]:
        console.print("[green]Aucun doublon détecté![/green]")
        return

    table = Table(box=box.ROUNDED, show_header=True)
    table.add_column("Workflow", style="bold")
    table.add_column("Instances", justify="center")
    table.add_column("IDs (du + récent au + ancien)")

    for name, wfs in sorted(analysis["duplicates"].items()):
        sorted_wfs = sorted(wfs, key=lambda x: x.get("updated_at", ""), reverse=True)
        ids_text = "\n".join([
            f"{'🆕' if i == 0 else '🗑️'} {wf['id'][:16]}... ({wf['updated_at'][:10] if wf['updated_at'] else 'N/A'})"
            for i, wf in enumerate(sorted_wfs)
        ])
        table.add_row(name, str(len(wfs)), ids_text)

    console.print(table)
    console.print()
    console.print("[dim]Pour nettoyer: python3 scripts/n8n/list_active_workflows.py --cleanup --execute[/dim]")


def cleanup_duplicates(analysis: dict, dry_run: bool = True):
    """Remove duplicate workflows (keep most recent)."""
    headers = {"X-N8N-API-KEY": N8N_API_KEY}

    if RICH_AVAILABLE:
        console.print()
        title = f"[bold]NETTOYAGE DES DOUBLONS {'(DRY RUN)' if dry_run else '(EXÉCUTION)'}[/bold]"
        console.print(Panel.fit(title, border_style="yellow" if dry_run else "red"))
        console.print()

    to_delete = []

    for name, wfs in analysis["duplicates"].items():
        sorted_wfs = sorted(wfs, key=lambda x: x.get("updated_at", ""), reverse=True)
        for wf in sorted_wfs[1:]:
            to_delete.append(wf)
            if RICH_AVAILABLE:
                console.print(f"[red]🗑️[/red] {wf['name']} ({wf['id'][:16]}...)")
            else:
                print(f"🗑️ {wf['name']} ({wf['id']})")

    print(f"\nTotal à supprimer: {len(to_delete)} workflows")

    if dry_run:
        print("\nPour exécuter: python3 scripts/n8n/list_active_workflows.py --cleanup --execute")
        return

    deleted = 0
    errors = 0

    for wf in to_delete:
        try:
            url = f"{N8N_API_URL}/workflows/{wf['id']}"
            response = requests.delete(url, headers=headers, timeout=30)
            response.raise_for_status()
            if RICH_AVAILABLE:
                console.print(f"[green]✅[/green] Supprimé: {wf['name']}")
            else:
                print(f"✅ Supprimé: {wf['name']}")
            deleted += 1
        except requests.RequestException as e:
            if RICH_AVAILABLE:
                console.print(f"[red]❌[/red] Erreur: {wf['name']}: {e}")
            else:
                print(f"❌ Erreur: {wf['name']}: {e}")
            errors += 1

    print(f"\nSupprimés: {deleted}, Erreurs: {errors}")


# Fallback functions for when rich is not available
def print_table_fallback(analysis: dict, show_all: bool = False):
    """Fallback table printer without rich."""
    print("=" * 80)
    print(f"   WORKFLOWS {'(ALL)' if show_all else 'ACTIFS'} - {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 80)

    category_order = ["MCP", "TORAH", "DISCORD", "RECIPES", "BOOKS", "STRIPE", "VIDEO", "TRANSCRI", "AUTRES"]

    for category in category_order:
        workflows = analysis["by_category"].get(category, [])
        if not workflows:
            continue

        icon = workflows[0]["icon"] if workflows else "📁"
        unique_count = len(set(w["name"] for w in workflows))

        print(f"\n{icon} {category} ({len(workflows)} workflows, {unique_count} uniques)")

        by_name = defaultdict(list)
        for wf in workflows:
            by_name[wf["name"]].append(wf)

        for name in sorted(by_name.keys()):
            wfs = by_name[name]
            status = "✅" if wfs[0]["active"] else "❌"

            if len(wfs) > 1:
                print(f"   {status} {name} ⚠️ x{len(wfs)} DOUBLONS")
            else:
                print(f"   {status} {name}")

    print("\n" + "=" * 80)
    print(f"   TOTAL: {analysis['total']} | DOUBLONS: {len(analysis['duplicates'])} | CONFLITS: {len(analysis['webhook_conflicts'])}")
    print("=" * 80)


def main():
    parser = argparse.ArgumentParser(description="n8n Workflow Analyzer")
    parser.add_argument("--all", action="store_true", help="Include inactive workflows")
    parser.add_argument("--duplicates", action="store_true", help="Show only duplicates")
    parser.add_argument("--endpoints", action="store_true", help="Show webhook endpoints")
    parser.add_argument("--api", action="store_true", help="Show API endpoints called")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--cleanup", action="store_true", help="Show cleanup plan")
    parser.add_argument("--execute", action="store_true", help="Execute cleanup")

    args = parser.parse_args()

    # Fetch workflows
    if RICH_AVAILABLE:
        console.print("[dim]Fetching workflows from n8n...[/dim]")
    else:
        print("Fetching workflows...", file=sys.stderr)
    workflows = get_all_workflows(active_only=not args.all)
    if RICH_AVAILABLE:
        console.print(f"[dim]Found {len(workflows)} workflows[/dim]")
    else:
        print(f"Found {len(workflows)} workflows", file=sys.stderr)

    # Analyze
    analysis = analyze_workflows(workflows)

    # Output
    if args.json:
        output = {
            "timestamp": datetime.now().isoformat(),
            "total": analysis["total"],
            "duplicates": {k: [{"id": w["id"], "name": w["name"]} for w in v] for k, v in analysis["duplicates"].items()},
            "webhook_conflicts": list(analysis["webhook_conflicts"].keys()),
            "api_domains": list(analysis["api_calls"].keys()),
            "by_category": {k: [{"id": w["id"], "name": w["name"], "active": w["active"]} for w in v] for k, v in analysis["by_category"].items()},
        }
        print(json.dumps(output, indent=2))
    elif args.cleanup:
        cleanup_duplicates(analysis, dry_run=not args.execute)
    elif args.duplicates:
        if RICH_AVAILABLE:
            print_duplicates_rich(analysis)
        else:
            print("Duplicates:", list(analysis["duplicates"].keys()))
    elif args.endpoints:
        if RICH_AVAILABLE:
            print_endpoints_rich(analysis)
        else:
            for path, wfs in sorted(analysis["by_webhook"].items()):
                print(f"/webhook/{path} -> {wfs[0]['name']}")
    elif args.api:
        if RICH_AVAILABLE:
            print_api_endpoints_rich(analysis)
        else:
            for domain, calls in analysis["api_calls"].items():
                print(f"\n{domain}:")
                for call in calls[:5]:
                    print(f"  - {call['workflow']}: {call['url']}")
    else:
        if RICH_AVAILABLE:
            print_table_rich(analysis, show_all=args.all)
        else:
            print_table_fallback(analysis, show_all=args.all)


if __name__ == "__main__":
    main()
