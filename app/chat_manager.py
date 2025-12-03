#!/usr/bin/env python3
"""
Chat Manager - Gestion des conversations sur les workflows n8n

Ce module fournit:
- Chat interactif avec GPT-4 pour poser des questions sur un workflow
- Sauvegarde des conversations en base SQLite
- Historique des analyses par workflow
"""

import json
import sqlite3
import os
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict
from openai import OpenAI


# Chemin de la base de données
DB_PATH = Path(__file__).parent / "conversations.db"


class ConversationDB:
    """Gestionnaire de la base de données des conversations."""

    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        """Initialise la base de données si elle n'existe pas."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.executescript('''
            -- Table des conversations
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workflow_filename TEXT NOT NULL,
                workflow_category TEXT NOT NULL,
                workflow_name TEXT,
                is_favorite BOOLEAN DEFAULT 0,
                total_tokens INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Table des messages
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER NOT NULL,
                role TEXT NOT NULL,  -- 'user', 'assistant', 'system'
                content TEXT NOT NULL,
                tokens_used INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id)
            );

            -- Table des analyses sauvegardées
            CREATE TABLE IF NOT EXISTS analyses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workflow_filename TEXT NOT NULL,
                workflow_category TEXT NOT NULL,
                analysis_text TEXT,
                mermaid_diagram TEXT,
                model_used TEXT,
                tokens_used INTEGER,
                is_favorite BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Table des tags pour catégoriser les conversations
            CREATE TABLE IF NOT EXISTS conversation_tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER NOT NULL,
                tag TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id),
                UNIQUE(conversation_id, tag)
            );

            -- Index pour recherche rapide
            CREATE INDEX IF NOT EXISTS idx_conversations_workflow
                ON conversations(workflow_filename, workflow_category);
            CREATE INDEX IF NOT EXISTS idx_conversations_favorite
                ON conversations(is_favorite);
            CREATE INDEX IF NOT EXISTS idx_messages_conversation
                ON messages(conversation_id);
            CREATE INDEX IF NOT EXISTS idx_analyses_workflow
                ON analyses(workflow_filename, workflow_category);
            CREATE INDEX IF NOT EXISTS idx_analyses_favorite
                ON analyses(is_favorite);
            CREATE INDEX IF NOT EXISTS idx_tags_conversation
                ON conversation_tags(conversation_id);
            CREATE INDEX IF NOT EXISTS idx_tags_tag
                ON conversation_tags(tag);
        ''')

        conn.commit()
        conn.close()

    def create_conversation(self, workflow_filename: str, workflow_category: str,
                          workflow_name: str = "") -> int:
        """Crée une nouvelle conversation et retourne son ID."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            INSERT INTO conversations (workflow_filename, workflow_category, workflow_name)
            VALUES (?, ?, ?)
        ''', (workflow_filename, workflow_category, workflow_name))

        conversation_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return conversation_id

    def add_message(self, conversation_id: int, role: str, content: str, tokens_used: int = 0):
        """Ajoute un message à une conversation."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            INSERT INTO messages (conversation_id, role, content, tokens_used)
            VALUES (?, ?, ?, ?)
        ''', (conversation_id, role, content, tokens_used))

        # Mettre à jour la date de modification et les tokens totaux
        cursor.execute('''
            UPDATE conversations
            SET updated_at = CURRENT_TIMESTAMP,
                total_tokens = total_tokens + ?
            WHERE id = ?
        ''', (tokens_used, conversation_id))

        conn.commit()
        conn.close()

    def get_conversation_messages(self, conversation_id: int) -> List[Dict]:
        """Récupère tous les messages d'une conversation."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            SELECT role, content, created_at
            FROM messages
            WHERE conversation_id = ?
            ORDER BY created_at ASC
        ''', (conversation_id,))

        messages = [
            {"role": row[0], "content": row[1], "created_at": row[2]}
            for row in cursor.fetchall()
        ]

        conn.close()
        return messages

    def get_workflow_conversations(self, workflow_filename: str,
                                   workflow_category: str) -> List[Dict]:
        """Récupère toutes les conversations pour un workflow."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            SELECT id, workflow_name, created_at, updated_at
            FROM conversations
            WHERE workflow_filename = ? AND workflow_category = ?
            ORDER BY updated_at DESC
        ''', (workflow_filename, workflow_category))

        conversations = [
            {
                "id": row[0],
                "workflow_name": row[1],
                "created_at": row[2],
                "updated_at": row[3]
            }
            for row in cursor.fetchall()
        ]

        conn.close()
        return conversations

    def save_analysis(self, workflow_filename: str, workflow_category: str,
                     analysis_text: str, mermaid_diagram: str = "",
                     model_used: str = "", tokens_used: int = 0):
        """Sauvegarde une analyse de workflow."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            INSERT INTO analyses (workflow_filename, workflow_category,
                                 analysis_text, mermaid_diagram, model_used, tokens_used)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (workflow_filename, workflow_category, analysis_text,
              mermaid_diagram, model_used, tokens_used))

        conn.commit()
        conn.close()

    def get_workflow_analyses(self, workflow_filename: str,
                             workflow_category: str) -> List[Dict]:
        """Récupère toutes les analyses pour un workflow."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            SELECT id, analysis_text, mermaid_diagram, model_used, tokens_used, created_at
            FROM analyses
            WHERE workflow_filename = ? AND workflow_category = ?
            ORDER BY created_at DESC
        ''', (workflow_filename, workflow_category))

        analyses = [
            {
                "id": row[0],
                "analysis_text": row[1],
                "mermaid_diagram": row[2],
                "model_used": row[3],
                "tokens_used": row[4],
                "created_at": row[5]
            }
            for row in cursor.fetchall()
        ]

        conn.close()
        return analyses

    def get_all_conversations(self, limit: int = 50) -> List[Dict]:
        """Récupère les conversations récentes."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            SELECT c.id, c.workflow_filename, c.workflow_category, c.workflow_name,
                   c.created_at, c.updated_at, COUNT(m.id) as message_count
            FROM conversations c
            LEFT JOIN messages m ON c.id = m.conversation_id
            GROUP BY c.id
            ORDER BY c.updated_at DESC
            LIMIT ?
        ''', (limit,))

        conversations = [
            {
                "id": row[0],
                "workflow_filename": row[1],
                "workflow_category": row[2],
                "workflow_name": row[3],
                "created_at": row[4],
                "updated_at": row[5],
                "message_count": row[6]
            }
            for row in cursor.fetchall()
        ]

        conn.close()
        return conversations

    def delete_conversation(self, conversation_id: int):
        """Supprime une conversation et ses messages."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('DELETE FROM conversation_tags WHERE conversation_id = ?', (conversation_id,))
        cursor.execute('DELETE FROM messages WHERE conversation_id = ?', (conversation_id,))
        cursor.execute('DELETE FROM conversations WHERE id = ?', (conversation_id,))

        conn.commit()
        conn.close()

    def toggle_conversation_favorite(self, conversation_id: int) -> bool:
        """Bascule le statut favori d'une conversation. Retourne le nouveau statut."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            UPDATE conversations
            SET is_favorite = NOT is_favorite
            WHERE id = ?
        ''', (conversation_id,))

        cursor.execute('SELECT is_favorite FROM conversations WHERE id = ?', (conversation_id,))
        result = cursor.fetchone()

        conn.commit()
        conn.close()

        return bool(result[0]) if result else False

    def toggle_analysis_favorite(self, analysis_id: int) -> bool:
        """Bascule le statut favori d'une analyse. Retourne le nouveau statut."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            UPDATE analyses
            SET is_favorite = NOT is_favorite
            WHERE id = ?
        ''', (analysis_id,))

        cursor.execute('SELECT is_favorite FROM analyses WHERE id = ?', (analysis_id,))
        result = cursor.fetchone()

        conn.commit()
        conn.close()

        return bool(result[0]) if result else False

    def add_conversation_tag(self, conversation_id: int, tag: str):
        """Ajoute un tag à une conversation."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        try:
            cursor.execute('''
                INSERT INTO conversation_tags (conversation_id, tag)
                VALUES (?, ?)
            ''', (conversation_id, tag.strip().lower()))
            conn.commit()
        except sqlite3.IntegrityError:
            pass  # Tag déjà existant

        conn.close()

    def remove_conversation_tag(self, conversation_id: int, tag: str):
        """Supprime un tag d'une conversation."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            DELETE FROM conversation_tags
            WHERE conversation_id = ? AND tag = ?
        ''', (conversation_id, tag.strip().lower()))

        conn.commit()
        conn.close()

    def get_conversation_tags(self, conversation_id: int) -> List[str]:
        """Récupère les tags d'une conversation."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            SELECT tag FROM conversation_tags
            WHERE conversation_id = ?
            ORDER BY tag
        ''', (conversation_id,))

        tags = [row[0] for row in cursor.fetchall()]

        conn.close()
        return tags

    def get_all_tags(self) -> List[Dict]:
        """Récupère tous les tags avec leur nombre d'utilisations."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            SELECT tag, COUNT(*) as count
            FROM conversation_tags
            GROUP BY tag
            ORDER BY count DESC, tag
        ''')

        tags = [{"tag": row[0], "count": row[1]} for row in cursor.fetchall()]

        conn.close()
        return tags

    def search_conversations_by_tag(self, tag: str) -> List[Dict]:
        """Recherche les conversations par tag."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            SELECT c.id, c.workflow_filename, c.workflow_category, c.workflow_name,
                   c.is_favorite, c.total_tokens, c.created_at, c.updated_at
            FROM conversations c
            INNER JOIN conversation_tags t ON c.id = t.conversation_id
            WHERE t.tag = ?
            ORDER BY c.updated_at DESC
        ''', (tag.strip().lower(),))

        conversations = [
            {
                "id": row[0],
                "workflow_filename": row[1],
                "workflow_category": row[2],
                "workflow_name": row[3],
                "is_favorite": bool(row[4]),
                "total_tokens": row[5],
                "created_at": row[6],
                "updated_at": row[7]
            }
            for row in cursor.fetchall()
        ]

        conn.close()
        return conversations

    def get_favorite_conversations(self) -> List[Dict]:
        """Récupère les conversations favorites."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            SELECT c.id, c.workflow_filename, c.workflow_category, c.workflow_name,
                   c.total_tokens, c.created_at, c.updated_at, COUNT(m.id) as message_count
            FROM conversations c
            LEFT JOIN messages m ON c.id = m.conversation_id
            WHERE c.is_favorite = 1
            GROUP BY c.id
            ORDER BY c.updated_at DESC
        ''')

        conversations = [
            {
                "id": row[0],
                "workflow_filename": row[1],
                "workflow_category": row[2],
                "workflow_name": row[3],
                "total_tokens": row[4],
                "created_at": row[5],
                "updated_at": row[6],
                "message_count": row[7]
            }
            for row in cursor.fetchall()
        ]

        conn.close()
        return conversations

    def get_token_stats(self) -> Dict:
        """Récupère les statistiques d'utilisation des tokens."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            SELECT
                COUNT(*) as total_conversations,
                SUM(total_tokens) as total_tokens,
                AVG(total_tokens) as avg_tokens_per_conversation
            FROM conversations
        ''')
        conv_stats = cursor.fetchone()

        cursor.execute('''
            SELECT COUNT(*) as total_messages
            FROM messages
            WHERE role != 'system'
        ''')
        msg_stats = cursor.fetchone()

        conn.close()

        return {
            "total_conversations": conv_stats[0] or 0,
            "total_tokens": conv_stats[1] or 0,
            "avg_tokens_per_conversation": round(conv_stats[2] or 0, 2),
            "total_messages": msg_stats[0] or 0
        }

    def export_conversation_markdown(self, conversation_id: int) -> str:
        """Exporte une conversation au format Markdown."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Récupérer les infos de la conversation
        cursor.execute('''
            SELECT workflow_filename, workflow_category, workflow_name, created_at, total_tokens
            FROM conversations
            WHERE id = ?
        ''', (conversation_id,))
        conv = cursor.fetchone()

        if not conv:
            conn.close()
            return ""

        # Récupérer les messages
        cursor.execute('''
            SELECT role, content, created_at
            FROM messages
            WHERE conversation_id = ?
            ORDER BY created_at ASC
        ''', (conversation_id,))
        messages = cursor.fetchall()

        # Récupérer les tags
        cursor.execute('''
            SELECT tag FROM conversation_tags
            WHERE conversation_id = ?
        ''', (conversation_id,))
        tags = [row[0] for row in cursor.fetchall()]

        conn.close()

        # Générer le Markdown
        md_lines = [
            f"# Conversation - {conv[2] or conv[0]}",
            "",
            f"**Workflow:** {conv[0]}",
            f"**Catégorie:** {conv[1]}",
            f"**Date:** {conv[3]}",
            f"**Tokens utilisés:** {conv[4]}",
        ]

        if tags:
            md_lines.append(f"**Tags:** {', '.join(tags)}")

        md_lines.extend(["", "---", ""])

        for role, content, created_at in messages:
            if role == "system":
                continue
            elif role == "user":
                md_lines.append(f"## 👤 Utilisateur")
                md_lines.append(f"*{created_at}*")
                md_lines.append("")
                md_lines.append(content)
                md_lines.append("")
            elif role == "assistant":
                md_lines.append(f"## 🤖 Assistant")
                md_lines.append(f"*{created_at}*")
                md_lines.append("")
                md_lines.append(content)
                md_lines.append("")

            md_lines.append("---")
            md_lines.append("")

        md_lines.extend([
            "",
            "---",
            f"*Exporté depuis n8n Workflows Explorer*"
        ])

        return "\n".join(md_lines)


class WorkflowChat:
    """Chat interactif pour discuter d'un workflow avec GPT-4."""

    SYSTEM_PROMPT = """Tu es un expert en automatisation n8n avec une expérience approfondie en intégration de systèmes, debugging et optimisation de workflows.

Tu aides l'utilisateur à comprendre, adapter et améliorer un workflow n8n spécifique.

## Tes capacités

### Explication et compréhension
- Expliquer chaque étape en détail avec le contexte métier
- Clarifier le rôle de chaque node et ses paramètres
- Décrire le flux de données entre les nodes

### Adaptation et modification
- Proposer des adaptations pour d'autres cas d'usage
- Générer des variantes du workflow
- Fournir le JSON modifié quand demandé

### Debugging et résolution de problèmes
- Identifier pourquoi un workflow échoue
- Diagnostiquer les erreurs courantes (authentification, format de données, timeouts)
- Proposer des solutions concrètes avec les modifications à apporter

### Performance et optimisation
- Analyser les goulots d'étranglement potentiels
- Suggérer des optimisations pour de gros volumes de données
- Recommander le batch processing quand approprié

### Sécurité et bonnes pratiques
- Identifier les risques de sécurité (données sensibles, injections)
- Recommander les bonnes pratiques n8n
- Conseiller sur la gestion des credentials et secrets

### Test et mise en production
- Proposer des stratégies de test
- Suggérer des données de test réalistes
- Recommander des étapes de validation avant production

## Contexte du workflow
{workflow_context}

## Instructions
- Réponds toujours en français de manière claire et structurée
- Si on te demande de modifier le workflow, fournis le JSON modifié complet ou partiel
- Si on te demande un exemple, génère des données concrètes et réalistes
- Pour le debugging, demande des précisions sur l'erreur si nécessaire
- Utilise des blocs de code pour le JSON et les exemples"""

    def __init__(self, api_key: Optional[str] = None):
        """Initialise le chat."""
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.client = None
        self.db = ConversationDB()
        self.current_conversation_id = None
        self.workflow_json = None
        self.messages_history = []

        if self.api_key:
            self.client = OpenAI(api_key=self.api_key)

    def is_configured(self) -> bool:
        """Vérifie si l'API est configurée."""
        return self.client is not None

    def start_conversation(self, workflow_json: dict, workflow_filename: str,
                          workflow_category: str) -> int:
        """Démarre une nouvelle conversation sur un workflow."""
        self.workflow_json = workflow_json
        workflow_name = workflow_json.get("name", "")

        # Créer la conversation en base
        self.current_conversation_id = self.db.create_conversation(
            workflow_filename, workflow_category, workflow_name
        )

        # Préparer le contexte du workflow
        workflow_context = self._prepare_workflow_context(workflow_json)

        # Initialiser l'historique avec le message système
        system_message = self.SYSTEM_PROMPT.format(workflow_context=workflow_context)
        self.messages_history = [{"role": "system", "content": system_message}]

        # Sauvegarder le message système
        self.db.add_message(self.current_conversation_id, "system", system_message)

        return self.current_conversation_id

    def load_conversation(self, conversation_id: int, workflow_json: dict):
        """Charge une conversation existante."""
        self.current_conversation_id = conversation_id
        self.workflow_json = workflow_json

        # Charger les messages depuis la base
        messages = self.db.get_conversation_messages(conversation_id)
        self.messages_history = [
            {"role": m["role"], "content": m["content"]}
            for m in messages
        ]

    def chat(self, user_message: str, model: str = "gpt-4o-mini") -> str:
        """Envoie un message et récupère la réponse."""
        if not self.is_configured():
            return "❌ API OpenAI non configurée."

        if not self.current_conversation_id:
            return "❌ Aucune conversation active. Démarrez une conversation d'abord."

        # Ajouter le message utilisateur
        self.messages_history.append({"role": "user", "content": user_message})
        self.db.add_message(self.current_conversation_id, "user", user_message)

        try:
            # Appeler l'API
            response = self.client.chat.completions.create(
                model=model,
                messages=self.messages_history,
                temperature=0.7,
                max_tokens=2000
            )

            assistant_message = response.choices[0].message.content

            # Sauvegarder la réponse
            self.messages_history.append({"role": "assistant", "content": assistant_message})
            self.db.add_message(self.current_conversation_id, "assistant", assistant_message)

            return assistant_message

        except Exception as e:
            error_msg = f"❌ Erreur: {str(e)}"
            return error_msg

    def _prepare_workflow_context(self, workflow: dict) -> str:
        """Prépare un résumé du workflow pour le contexte."""
        nodes = workflow.get("nodes", [])

        # Extraire les infos importantes
        node_summaries = []
        for node in nodes:
            node_type = node.get("type", "").replace("n8n-nodes-base.", "")
            node_name = node.get("name", "")
            params = node.get("parameters", {})

            summary = f"- {node_name} ({node_type})"
            if params:
                # Ajouter quelques paramètres clés
                key_params = {k: v for k, v in list(params.items())[:3] if v}
                if key_params:
                    summary += f": {key_params}"
            node_summaries.append(summary)

        context = f"""
Nom: {workflow.get('name', 'Sans nom')}
Description: {workflow.get('description', 'Pas de description')}

Nodes ({len(nodes)}):
{chr(10).join(node_summaries)}

JSON complet disponible pour référence.
"""
        return context

    def get_suggestions(self) -> List[str]:
        """Retourne des suggestions de questions pour l'utilisateur."""
        return [
            # Compréhension
            "Peux-tu m'expliquer chaque étape de ce workflow ?",
            "Quels sont les prérequis pour utiliser ce workflow ?",
            # Adaptation
            "Comment adapter ce workflow pour un autre cas d'usage ?",
            "Peux-tu me donner un exemple concret de données ?",
            # Amélioration
            "Quelles améliorations suggères-tu ?",
            "Comment ajouter une gestion d'erreurs plus robuste ?",
            # Debugging
            "Quels sont les points de défaillance possibles ?",
            "Comment débugger si le workflow échoue ?",
            # Performance
            "Comment optimiser ce workflow pour de gros volumes ?",
            # Sécurité
            "Y a-t-il des risques de sécurité à surveiller ?",
            # Test et production
            "Comment tester ce workflow avant mise en production ?",
            "Peux-tu générer des données de test réalistes ?",
        ]

    def get_suggestions_by_category(self) -> Dict[str, List[str]]:
        """Retourne des suggestions organisées par catégorie."""
        return {
            "🔍 Compréhension": [
                "Peux-tu m'expliquer chaque étape de ce workflow ?",
                "Quels sont les prérequis pour utiliser ce workflow ?",
                "Quel est le flux de données entre les nodes ?",
            ],
            "🔧 Adaptation": [
                "Comment adapter ce workflow pour un autre cas d'usage ?",
                "Peux-tu me donner un exemple concret de données ?",
                "Peux-tu générer une variante de ce workflow ?",
            ],
            "⚡ Amélioration": [
                "Quelles améliorations suggères-tu ?",
                "Comment ajouter une gestion d'erreurs plus robuste ?",
                "Comment optimiser ce workflow pour de gros volumes ?",
            ],
            "🐛 Debugging": [
                "Quels sont les points de défaillance possibles ?",
                "Comment débugger si le workflow échoue ?",
                "Quelles erreurs courantes dois-je anticiper ?",
            ],
            "🔒 Sécurité": [
                "Y a-t-il des risques de sécurité à surveiller ?",
                "Comment gérer les credentials de manière sécurisée ?",
                "Quelles données sensibles sont manipulées ?",
            ],
            "🚀 Production": [
                "Comment tester ce workflow avant mise en production ?",
                "Peux-tu générer des données de test réalistes ?",
                "Quelles métriques surveiller en production ?",
            ],
        }


# Instance globale de la base de données
conversation_db = ConversationDB()
