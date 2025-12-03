#!/usr/bin/env python3
"""
Search Chat - Recherche intelligente de workflows par conversation

Ce module fournit:
- Recherche de workflows par mots-clés
- Recherche par catégorie
- Recherche par services/intégrations
- Réponses en langage naturel avec GPT-4 (optionnel)
"""

import json
import os
import re
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from openai import OpenAI


class WorkflowSearchEngine:
    """Moteur de recherche pour les workflows n8n."""

    def __init__(self, catalog: dict):
        """
        Initialise le moteur de recherche.

        Args:
            catalog: Le catalogue des workflows chargé depuis JSON
        """
        self.catalog = catalog
        self.categories = catalog.get("categories", {})
        self._build_index()

    def _build_index(self):
        """Construit un index pour la recherche rapide."""
        self.all_workflows = []
        self.service_index = {}  # service -> [workflows]
        self.keyword_index = {}  # keyword -> [workflows]

        for category, data in self.categories.items():
            for workflow in data.get("workflows", []):
                wf_entry = {
                    "category": category,
                    "filename": workflow.get("filename", ""),
                    "name": workflow.get("name", ""),
                    "description": workflow.get("description", ""),
                    "nodes_count": workflow.get("nodes_count", 0),
                    "node_types": workflow.get("node_types", []),
                    "tags": workflow.get("tags", []),
                }
                self.all_workflows.append(wf_entry)

                # Indexer par service (depuis les node_types)
                for node_type in wf_entry["node_types"]:
                    service = self._extract_service(node_type)
                    if service:
                        if service not in self.service_index:
                            self.service_index[service] = []
                        self.service_index[service].append(wf_entry)

    def _extract_service(self, node_type: str) -> Optional[str]:
        """Extrait le nom du service depuis un type de node."""
        # Mapping des services courants
        service_patterns = {
            "gmail": "gmail",
            "google": "google",
            "slack": "slack",
            "telegram": "telegram",
            "discord": "discord",
            "notion": "notion",
            "airtable": "airtable",
            "salesforce": "salesforce",
            "hubspot": "hubspot",
            "stripe": "stripe",
            "shopify": "shopify",
            "github": "github",
            "gitlab": "gitlab",
            "jira": "jira",
            "trello": "trello",
            "asana": "asana",
            "monday": "monday",
            "excel": "excel",
            "microsoft": "microsoft",
            "outlook": "outlook",
            "teams": "teams",
            "dropbox": "dropbox",
            "drive": "google drive",
            "sheets": "google sheets",
            "calendar": "calendar",
            "mailchimp": "mailchimp",
            "sendgrid": "sendgrid",
            "twilio": "twilio",
            "openai": "openai",
            "http": "http/api",
            "webhook": "webhook",
            "postgres": "postgresql",
            "mysql": "mysql",
            "mongodb": "mongodb",
            "redis": "redis",
            "ssh": "ssh",
            "ftp": "ftp",
            "aws": "aws",
            "s3": "aws s3",
            "lambda": "aws lambda",
        }

        node_lower = node_type.lower()
        for pattern, service in service_patterns.items():
            if pattern in node_lower:
                return service
        return None

    def search(self, query: str, limit: int = 20) -> List[Dict]:
        """
        Recherche des workflows correspondant à la requête.

        Args:
            query: La requête de recherche
            limit: Nombre maximum de résultats

        Returns:
            Liste des workflows correspondants avec score de pertinence
        """
        query_lower = query.lower()
        query_words = set(query_lower.split())

        results = []

        for wf in self.all_workflows:
            score = 0
            matches = []

            # Recherche dans le nom (score élevé)
            name_lower = wf["name"].lower()
            if query_lower in name_lower:
                score += 10
                matches.append("nom")
            elif any(word in name_lower for word in query_words):
                score += 5
                matches.append("nom (partiel)")

            # Recherche dans la catégorie
            cat_lower = wf["category"].lower()
            if query_lower in cat_lower:
                score += 8
                matches.append("catégorie")
            elif any(word in cat_lower for word in query_words):
                score += 4
                matches.append("catégorie (partiel)")

            # Recherche dans la description
            desc_lower = wf["description"].lower()
            if query_lower in desc_lower:
                score += 6
                matches.append("description")
            elif any(word in desc_lower for word in query_words):
                score += 3
                matches.append("description (partiel)")

            # Recherche dans les types de nodes
            node_types_str = " ".join(wf["node_types"]).lower()
            if query_lower in node_types_str:
                score += 7
                matches.append("services")
            elif any(word in node_types_str for word in query_words):
                score += 3
                matches.append("services (partiel)")

            # Recherche dans les tags
            tags_str = " ".join(wf["tags"]).lower()
            if query_lower in tags_str:
                score += 5
                matches.append("tags")

            if score > 0:
                results.append({
                    **wf,
                    "score": score,
                    "matches": matches
                })

        # Trier par score décroissant
        results.sort(key=lambda x: x["score"], reverse=True)

        return results[:limit]

    def search_by_service(self, service: str, limit: int = 20) -> List[Dict]:
        """Recherche par service spécifique."""
        service_lower = service.lower()

        # Chercher dans l'index des services
        matching_services = [
            s for s in self.service_index.keys()
            if service_lower in s.lower()
        ]

        results = []
        seen = set()

        for svc in matching_services:
            for wf in self.service_index[svc]:
                wf_key = f"{wf['category']}/{wf['filename']}"
                if wf_key not in seen:
                    seen.add(wf_key)
                    results.append({**wf, "matched_service": svc})

        return results[:limit]

    def get_services_list(self) -> List[Tuple[str, int]]:
        """Retourne la liste des services avec le nombre de workflows."""
        return sorted(
            [(service, len(workflows)) for service, workflows in self.service_index.items()],
            key=lambda x: x[1],
            reverse=True
        )

    def get_stats(self) -> Dict:
        """Retourne des statistiques sur le catalogue."""
        return {
            "total_workflows": len(self.all_workflows),
            "total_categories": len(self.categories),
            "total_services": len(self.service_index),
            "top_services": self.get_services_list()[:10]
        }


class SearchChatBot:
    """Chatbot de recherche avec support GPT-4 optionnel."""

    SYSTEM_PROMPT = """Tu es un assistant spécialisé dans la recherche de workflows n8n.
Tu aides les utilisateurs à trouver des workflows d'automatisation adaptés à leurs besoins.

Tu as accès à un catalogue de {total_workflows} workflows répartis en {total_categories} catégories.

Quand l'utilisateur pose une question, tu dois:
1. Identifier les services/intégrations mentionnés (Gmail, Slack, Notion, etc.)
2. Comprendre le cas d'usage recherché
3. Suggérer les workflows les plus pertinents

Réponds toujours en français de manière concise et utile.
Présente les workflows trouvés avec:
- Nom du workflow
- Catégorie
- Brève description
- Services utilisés

Si aucun workflow ne correspond, suggère des alternatives ou des catégories à explorer."""

    def __init__(self, search_engine: WorkflowSearchEngine, api_key: Optional[str] = None):
        """
        Initialise le chatbot.

        Args:
            search_engine: Le moteur de recherche
            api_key: Clé API OpenAI (optionnel)
        """
        self.search_engine = search_engine
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.client = None

        if self.api_key:
            self.client = OpenAI(api_key=self.api_key)

    def is_ai_enabled(self) -> bool:
        """Vérifie si l'IA est disponible."""
        return self.client is not None

    def chat(self, user_message: str, use_ai: bool = True) -> Dict:
        """
        Traite une requête de recherche.

        Args:
            user_message: La question de l'utilisateur
            use_ai: Utiliser GPT-4 pour améliorer la réponse

        Returns:
            Dict avec les résultats et la réponse
        """
        # Recherche basique
        results = self.search_engine.search(user_message, limit=10)

        # Construire la réponse
        if use_ai and self.is_ai_enabled():
            response = self._generate_ai_response(user_message, results)
        else:
            response = self._generate_basic_response(user_message, results)

        return {
            "query": user_message,
            "results": results,
            "response": response,
            "ai_used": use_ai and self.is_ai_enabled()
        }

    def _generate_basic_response(self, query: str, results: List[Dict]) -> str:
        """Génère une réponse basique sans IA."""
        if not results:
            return f"❌ Aucun workflow trouvé pour '{query}'.\n\n💡 Essayez d'autres mots-clés comme: gmail, slack, notion, api, webhook..."

        response_lines = [f"🔍 **{len(results)} workflow(s) trouvé(s) pour '{query}':**\n"]

        for i, wf in enumerate(results[:10], 1):
            services = ", ".join(wf["node_types"][:5]) if wf["node_types"] else "N/A"
            response_lines.append(
                f"**{i}. {wf['name']}**\n"
                f"   📁 Catégorie: `{wf['category']}`\n"
                f"   📝 {wf['description'][:100]}{'...' if len(wf['description']) > 100 else ''}\n"
                f"   🔧 Services: {services}\n"
            )

        return "\n".join(response_lines)

    def _generate_ai_response(self, query: str, results: List[Dict]) -> str:
        """Génère une réponse enrichie avec GPT-4."""
        stats = self.search_engine.get_stats()

        # Préparer le contexte des résultats
        results_context = "\n".join([
            f"- {wf['name']} (catégorie: {wf['category']}, services: {', '.join(wf['node_types'][:5])}): {wf['description'][:150]}"
            for wf in results[:10]
        ])

        if not results_context:
            results_context = "Aucun résultat trouvé."

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": self.SYSTEM_PROMPT.format(
                            total_workflows=stats["total_workflows"],
                            total_categories=stats["total_categories"]
                        )
                    },
                    {
                        "role": "user",
                        "content": f"""Question de l'utilisateur: {query}

Résultats de recherche trouvés:
{results_context}

Réponds à l'utilisateur en présentant les workflows les plus pertinents.
Si les résultats ne correspondent pas bien, dis-le et suggère des alternatives."""
                    }
                ],
                temperature=0.7,
                max_tokens=1000
            )

            return response.choices[0].message.content

        except Exception as e:
            # Fallback sur la réponse basique en cas d'erreur
            return self._generate_basic_response(query, results) + f"\n\n⚠️ Mode IA indisponible: {str(e)}"

    def get_suggestions(self) -> List[str]:
        """Retourne des suggestions de recherche."""
        return [
            "Quels workflows utilisent Gmail ?",
            "Workflows pour synchroniser Google Sheets",
            "Automatisations avec Slack et Notion",
            "Workflows de webhook",
            "Intégrations Salesforce",
            "Workflows pour envoyer des emails",
            "Automatisations avec OpenAI",
            "Workflows de backup",
        ]
