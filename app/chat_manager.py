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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Table des messages
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER NOT NULL,
                role TEXT NOT NULL,  -- 'user', 'assistant', 'system'
                content TEXT NOT NULL,
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Index pour recherche rapide
            CREATE INDEX IF NOT EXISTS idx_conversations_workflow
                ON conversations(workflow_filename, workflow_category);
            CREATE INDEX IF NOT EXISTS idx_messages_conversation
                ON messages(conversation_id);
            CREATE INDEX IF NOT EXISTS idx_analyses_workflow
                ON analyses(workflow_filename, workflow_category);
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

    def add_message(self, conversation_id: int, role: str, content: str):
        """Ajoute un message à une conversation."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            INSERT INTO messages (conversation_id, role, content)
            VALUES (?, ?, ?)
        ''', (conversation_id, role, content))

        # Mettre à jour la date de modification de la conversation
        cursor.execute('''
            UPDATE conversations SET updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (conversation_id,))

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

        cursor.execute('DELETE FROM messages WHERE conversation_id = ?', (conversation_id,))
        cursor.execute('DELETE FROM conversations WHERE id = ?', (conversation_id,))

        conn.commit()
        conn.close()


class WorkflowChat:
    """Chat interactif pour discuter d'un workflow avec GPT-4."""

    SYSTEM_PROMPT = """Tu es un expert en automatisation n8n. Tu aides l'utilisateur à comprendre
et adapter un workflow n8n spécifique.

Tu as accès au JSON complet du workflow. Tu peux:
- Expliquer chaque étape en détail
- Proposer des adaptations (autres cas d'usage, autres données)
- Suggérer des améliorations
- Générer des exemples de données
- Créer des variantes du workflow

Contexte du workflow:
{workflow_context}

Réponds toujours en français de manière claire et structurée.
Si on te demande de modifier le workflow, fournis le JSON modifié.
Si on te demande un exemple, génère des données concrètes."""

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
            "Peux-tu m'expliquer chaque étape de ce workflow ?",
            "Comment adapter ce workflow pour un autre cas d'usage ?",
            "Peux-tu me donner un exemple concret de données ?",
            "Quelles améliorations suggères-tu ?",
            "Comment ajouter une gestion d'erreurs plus robuste ?",
            "Peux-tu générer une variante de ce workflow ?",
            "Quels sont les prérequis pour utiliser ce workflow ?",
        ]


# Instance globale de la base de données
conversation_db = ConversationDB()
