#!/usr/bin/env python3
"""
Workflow Analyzer - Analyse les workflows n8n avec OpenAI GPT-4

Ce module fournit:
- Analyse détaillée du workflow (but, étapes, cas d'usage)
- Génération de diagramme Mermaid
- Extraction des informations clés
"""

import json
import os
from typing import Optional
from openai import OpenAI

# Prompt système pour l'analyse
SYSTEM_PROMPT = """Tu es un expert en automatisation n8n. Tu analyses des workflows n8n au format JSON.

Pour chaque workflow, tu dois fournir:
1. **Résumé** : Une phrase décrivant le but du workflow
2. **Description détaillée** : Explication complète de ce que fait le workflow
3. **Étapes du flux** : Liste numérotée des étapes principales
4. **Cas d'usage** : Dans quel contexte utiliser ce workflow
5. **Services utilisés** : Liste des intégrations externes
6. **Diagramme Mermaid** : Un diagramme flowchart représentant le workflow

Pour le diagramme Mermaid:
- Utilise la syntaxe `flowchart TD` (top-down)
- Chaque node doit avoir un ID court et un label descriptif
- Utilise des formes appropriées: [] pour les actions, {} pour les conditions, () pour les triggers
- Relie les nodes avec des flèches -->
- Pour les branches conditionnelles, utilise -->|Oui| et -->|Non|

Exemple de diagramme Mermaid:
```mermaid
flowchart TD
    A((Trigger)) --> B[Lire données]
    B --> C{Condition?}
    C -->|Oui| D[Action 1]
    C -->|Non| E[Action 2]
    D --> F[Fin]
    E --> F
```

Analyse le workflow de manière professionnelle et concise."""

USER_PROMPT_TEMPLATE = """Analyse ce workflow n8n et fournis:
1. Un résumé en une phrase
2. Une description détaillée
3. Les étapes du flux (liste numérotée)
4. Les cas d'usage
5. Les services/intégrations utilisés
6. Un diagramme Mermaid représentant le flux

Workflow JSON:
```json
{json_content}
```

Réponds en français. Pour le diagramme Mermaid, assure-toi qu'il soit valide et lisible."""


class WorkflowAnalyzer:
    """Analyseur de workflows n8n utilisant OpenAI GPT-4."""

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialise l'analyseur.

        Args:
            api_key: Clé API OpenAI. Si None, utilise OPENAI_API_KEY env var.
        """
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.client = None

        if self.api_key:
            self.client = OpenAI(api_key=self.api_key)

    def is_configured(self) -> bool:
        """Vérifie si l'API est configurée."""
        return self.client is not None

    def analyze(self, workflow_json: dict, model: str = "gpt-4o-mini") -> dict:
        """
        Analyse un workflow n8n.

        Args:
            workflow_json: Le workflow au format JSON
            model: Le modèle OpenAI à utiliser

        Returns:
            dict avec les clés: summary, description, steps, use_cases, services, mermaid_diagram, raw_response
        """
        if not self.is_configured():
            return {
                "error": "API OpenAI non configurée. Définissez OPENAI_API_KEY.",
                "success": False
            }

        # Simplifier le JSON pour réduire les tokens
        simplified_json = self._simplify_workflow(workflow_json)
        json_content = json.dumps(simplified_json, indent=2, ensure_ascii=False)

        try:
            response = self.client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": USER_PROMPT_TEMPLATE.format(json_content=json_content)}
                ],
                temperature=0.3,
                max_tokens=2000
            )

            raw_response = response.choices[0].message.content
            parsed = self._parse_response(raw_response)
            parsed["raw_response"] = raw_response
            parsed["success"] = True
            parsed["model"] = model
            parsed["tokens_used"] = response.usage.total_tokens if response.usage else 0

            return parsed

        except Exception as e:
            return {
                "error": f"Erreur lors de l'analyse: {str(e)}",
                "success": False
            }

    def _simplify_workflow(self, workflow: dict) -> dict:
        """Simplifie le workflow pour réduire les tokens."""
        simplified = {
            "name": workflow.get("name", ""),
            "description": workflow.get("description", ""),
            "nodes": []
        }

        for node in workflow.get("nodes", []):
            simplified_node = {
                "name": node.get("name", ""),
                "type": node.get("type", "").replace("n8n-nodes-base.", ""),
                "position": node.get("position", [])
            }

            # Inclure les paramètres importants
            params = node.get("parameters", {})
            if params:
                # Filtrer les paramètres vides
                filtered_params = {k: v for k, v in params.items() if v}
                if filtered_params:
                    simplified_node["parameters"] = filtered_params

            simplified["nodes"].append(simplified_node)

        # Inclure les connexions si présentes
        connections = workflow.get("connections", {})
        if connections:
            simplified["connections"] = connections

        return simplified

    def _parse_response(self, response: str) -> dict:
        """Parse la réponse de l'API pour extraire les sections."""
        result = {
            "summary": "",
            "description": "",
            "steps": [],
            "use_cases": "",
            "services": [],
            "mermaid_diagram": ""
        }

        # Extraire le diagramme Mermaid
        if "```mermaid" in response:
            start = response.find("```mermaid") + 10
            end = response.find("```", start)
            if end > start:
                result["mermaid_diagram"] = response[start:end].strip()

        # Le reste est dans raw_response, l'interface peut l'afficher directement
        return result

    def extract_workflow_info(self, workflow_json: dict) -> dict:
        """
        Extrait les informations de base d'un workflow sans appeler l'API.

        Utile pour avoir un aperçu rapide avant l'analyse complète.
        """
        nodes = workflow_json.get("nodes", [])

        # Extraire les types de nodes uniques
        node_types = set()
        node_names = []
        triggers = []
        actions = []

        for node in nodes:
            node_type = node.get("type", "").replace("n8n-nodes-base.", "")
            node_name = node.get("name", "")

            node_types.add(node_type)
            node_names.append(node_name)

            if "trigger" in node_type.lower():
                triggers.append(node_name)
            elif node_type not in ["stickyNote", "noOp", "stopAndError"]:
                actions.append(node_name)

        # Détecter les services externes
        services = []
        service_keywords = {
            "salesforce": "Salesforce",
            "google": "Google",
            "microsoft": "Microsoft",
            "slack": "Slack",
            "telegram": "Telegram",
            "discord": "Discord",
            "notion": "Notion",
            "airtable": "Airtable",
            "shopify": "Shopify",
            "stripe": "Stripe",
            "github": "GitHub",
            "openai": "OpenAI"
        }

        for node_type in node_types:
            for keyword, service_name in service_keywords.items():
                if keyword in node_type.lower():
                    services.append(service_name)

        return {
            "name": workflow_json.get("name", "Sans nom"),
            "description": workflow_json.get("description", ""),
            "nodes_count": len(nodes),
            "node_types": sorted(list(node_types)),
            "node_names": node_names,
            "triggers": triggers,
            "actions": actions,
            "services": list(set(services)),
            "has_conditions": any("if" in t.lower() for t in node_types),
            "has_loops": any("loop" in t.lower() or "splitInBatches" in t for t in node_types)
        }


def generate_simple_mermaid(workflow_json: dict) -> str:
    """
    Génère un diagramme Mermaid simple basé sur les positions des nodes.

    Utile comme fallback si l'API n'est pas disponible.
    """
    nodes = workflow_json.get("nodes", [])

    if not nodes:
        return "flowchart TD\n    A[Workflow vide]"

    # Trier les nodes par position X (gauche à droite)
    sorted_nodes = sorted(nodes, key=lambda n: n.get("position", [0, 0])[0])

    # Filtrer les sticky notes
    sorted_nodes = [n for n in sorted_nodes if "stickyNote" not in n.get("type", "")]

    if not sorted_nodes:
        return "flowchart TD\n    A[Aucun node actif]"

    lines = ["flowchart TD"]

    # Créer les nodes
    for i, node in enumerate(sorted_nodes):
        node_id = f"N{i}"
        node_name = node.get("name", "Node")[:30]
        node_type = node.get("type", "").replace("n8n-nodes-base.", "")

        # Choisir la forme selon le type
        if "trigger" in node_type.lower():
            lines.append(f"    {node_id}(({node_name}))")
        elif "if" in node_type.lower() or "switch" in node_type.lower():
            lines.append(f"    {node_id}{{{node_name}}}")
        else:
            lines.append(f"    {node_id}[{node_name}]")

    # Créer les connexions (simplifié: linéaire)
    for i in range(len(sorted_nodes) - 1):
        lines.append(f"    N{i} --> N{i+1}")

    return "\n".join(lines)
