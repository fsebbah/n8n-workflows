#!/usr/bin/env python3
"""
Script d'import en masse des workflows n8n

Ce script importe tous les workflows JSON dans n8n via la CLI.
Il adapte les workflows au format requis par n8n moderne.

Usage:
    python3 import_workflows.py [--dry-run] [--limit N] [--category CATEGORY]

Options:
    --dry-run       Simule l'import sans exécuter
    --limit N       Limite le nombre de workflows à importer
    --category CAT  Importe uniquement une catégorie spécifique
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

# Configuration
WORKFLOWS_DIR = Path("/home/fsebb/n8n-workflows/workflows")
LOGS_DIR = Path("/home/fsebb/.n8n/logs")
REPORT_FILE = LOGS_DIR / f"import_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"


def get_all_workflows(category: str = None) -> List[Path]:
    """Récupère tous les fichiers workflow JSON."""
    workflows = []

    if category:
        category_path = WORKFLOWS_DIR / category
        if category_path.exists():
            workflows = list(category_path.glob("*.json"))
        else:
            print(f"❌ Catégorie '{category}' non trouvée")
            sys.exit(1)
    else:
        workflows = list(WORKFLOWS_DIR.rglob("*.json"))

    return sorted(workflows)


def prepare_workflow_for_import(workflow_data: dict) -> dict:
    """
    Prépare un workflow pour l'import dans n8n moderne.

    Modifications:
    - Supprime l'id existant (n8n en génère un nouveau)
    - Ajoute versionId si manquant
    - Nettoie les credentials vides
    - Désactive le workflow par défaut
    """
    # Copie pour ne pas modifier l'original
    wf = workflow_data.copy()

    # Supprimer l'ancien ID - n8n va en générer un nouveau
    if 'id' in wf:
        del wf['id']

    # Ajouter versionId si manquant
    if 'versionId' not in wf:
        wf['versionId'] = str(uuid.uuid4())

    # S'assurer que le workflow est inactif
    wf['active'] = False

    # Nettoyer les nodes
    if 'nodes' in wf:
        for node in wf['nodes']:
            # Supprimer les credentials vides
            if 'credentials' in node:
                creds = node['credentials']
                if isinstance(creds, dict):
                    # Garder seulement les credentials non-vides
                    node['credentials'] = {
                        k: v for k, v in creds.items()
                        if v and v != ""
                    }
                    # Si tout est vide, supprimer le champ
                    if not node['credentials']:
                        del node['credentials']

    # Supprimer les champs qui pourraient causer des problèmes
    # tags: n8n attend des IDs de tags, pas des noms
    # pinData: données de debug
    fields_to_remove = ['createdAt', 'updatedAt', 'meta', 'tags', 'pinData']
    for field in fields_to_remove:
        if field in wf:
            del wf[field]

    return wf


def validate_workflow(workflow_path: Path) -> Tuple[bool, str, dict]:
    """Valide qu'un fichier JSON est un workflow n8n valide."""
    try:
        with open(workflow_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # Vérifier les champs requis
        required_fields = ['nodes', 'connections']
        missing = [f for f in required_fields if f not in data]

        if missing:
            return False, f"Champs manquants: {missing}", {}

        # Vérifier que nodes est une liste
        if not isinstance(data.get('nodes'), list):
            return False, "Le champ 'nodes' doit être une liste", {}

        return True, "OK", data

    except json.JSONDecodeError as e:
        return False, f"JSON invalide: {e}", {}
    except Exception as e:
        return False, f"Erreur: {e}", {}


def import_workflow(workflow_data: dict, original_path: Path, dry_run: bool = False) -> Tuple[bool, str]:
    """Importe un workflow via la CLI n8n."""
    if dry_run:
        return True, "DRY-RUN: Import simulé"

    try:
        # Préparer le workflow
        prepared_wf = prepare_workflow_for_import(workflow_data)

        # Créer un fichier temporaire avec le workflow préparé
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False, encoding='utf-8') as tmp:
            json.dump(prepared_wf, tmp, ensure_ascii=False, indent=2)
            tmp_path = tmp.name

        try:
            # Utiliser n8n import:workflow
            result = subprocess.run(
                ["n8n", "import:workflow", f"--input={tmp_path}"],
                capture_output=True,
                text=True,
                timeout=60
            )

            if result.returncode == 0:
                return True, "Importé avec succès"
            else:
                error_msg = result.stderr.strip() or result.stdout.strip() or "Erreur inconnue"
                # Extraire le message d'erreur principal
                if "SQLITE_CONSTRAINT" in error_msg:
                    return False, "Contrainte SQLite violée (workflow peut-être déjà existant)"
                return False, error_msg[:200]  # Limiter la longueur

        finally:
            # Nettoyer le fichier temporaire
            os.unlink(tmp_path)

    except subprocess.TimeoutExpired:
        return False, "Timeout (60s)"
    except FileNotFoundError:
        return False, "Commande 'n8n' non trouvée. Vérifiez que n8n est installé."
    except Exception as e:
        return False, str(e)[:200]


def main():
    parser = argparse.ArgumentParser(description="Import en masse des workflows n8n")
    parser.add_argument("--dry-run", action="store_true", help="Simule l'import sans exécuter")
    parser.add_argument("--limit", type=int, help="Limite le nombre de workflows")
    parser.add_argument("--category", type=str, help="Importe uniquement une catégorie")
    parser.add_argument("--continue-on-error", action="store_true", default=True,
                        help="Continue même en cas d'erreur (par défaut: True)")
    args = parser.parse_args()

    print("=" * 60)
    print("🚀 Import en masse des workflows n8n")
    print("=" * 60)

    if args.dry_run:
        print("⚠️  Mode DRY-RUN activé - aucune modification ne sera faite")

    # Récupérer les workflows
    workflows = get_all_workflows(args.category)
    total = len(workflows)

    if args.limit:
        workflows = workflows[:args.limit]

    print(f"\n📁 Workflows trouvés: {total}")
    if args.limit:
        print(f"📊 Limite appliquée: {args.limit}")
    if args.category:
        print(f"📂 Catégorie: {args.category}")

    print(f"\n🔄 Démarrage de l'import de {len(workflows)} workflows...\n")

    # Statistiques
    results = {
        "started_at": datetime.now().isoformat(),
        "total": len(workflows),
        "success": 0,
        "failed": 0,
        "skipped": 0,
        "details": []
    }

    for i, wf_path in enumerate(workflows, 1):
        relative_path = wf_path.relative_to(WORKFLOWS_DIR)
        category = relative_path.parts[0] if len(relative_path.parts) > 1 else "root"

        # Valider d'abord
        is_valid, validation_msg, wf_data = validate_workflow(wf_path)

        if not is_valid:
            print(f"[{i}/{len(workflows)}] ⏭️  SKIP: {relative_path} - {validation_msg}")
            results["skipped"] += 1
            results["details"].append({
                "file": str(relative_path),
                "category": category,
                "status": "skipped",
                "message": validation_msg
            })
            continue

        # Importer
        success, message = import_workflow(wf_data, wf_path, args.dry_run)

        if success:
            print(f"[{i}/{len(workflows)}] ✅ OK: {relative_path}")
            results["success"] += 1
            status = "success"
        else:
            print(f"[{i}/{len(workflows)}] ❌ FAIL: {relative_path} - {message}")
            results["failed"] += 1
            status = "failed"

        results["details"].append({
            "file": str(relative_path),
            "category": category,
            "status": status,
            "message": message
        })

    # Résumé
    results["finished_at"] = datetime.now().isoformat()

    print("\n" + "=" * 60)
    print("📊 RÉSUMÉ DE L'IMPORT")
    print("=" * 60)
    print(f"✅ Succès:  {results['success']}")
    print(f"❌ Échecs:  {results['failed']}")
    print(f"⏭️  Ignorés: {results['skipped']}")
    print(f"📁 Total:   {results['total']}")

    # Sauvegarder le rapport
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    with open(REPORT_FILE, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\n📄 Rapport sauvegardé: {REPORT_FILE}")

    # Code de sortie
    if results["failed"] > 0 and results["success"] == 0:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
