#!/usr/bin/env python3
"""
Import n8n workflows from JSON catalog into SQLite database.

Usage:
    python import_data.py [--json PATH] [--db PATH]

Arguments:
    --json PATH  Path to workflows-catalog.json (default: ../workflows-catalog.json)
    --db PATH    Path to SQLite database (default: ./workflows.db)

This script:
1. Creates the database schema if it doesn't exist
2. Imports all workflows from the JSON catalog
3. Creates the FTS5 index for full-text search
"""

import argparse
import json
import sqlite3
from pathlib import Path


def create_schema(cursor: sqlite3.Cursor) -> None:
    """Create database schema if it doesn't exist."""
    cursor.executescript('''
        -- Table des catégories
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            workflows_count INTEGER DEFAULT 0
        );

        -- Table des workflows
        CREATE TABLE IF NOT EXISTS workflows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            name TEXT,
            description TEXT,
            nodes_count INTEGER DEFAULT 0,
            category_id INTEGER,
            meta_category TEXT,
            meta_status TEXT,
            meta_created_at TEXT,
            FOREIGN KEY (category_id) REFERENCES categories(id)
        );

        -- Table des tags
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        );

        -- Table de liaison workflow <-> tags
        CREATE TABLE IF NOT EXISTS workflow_tags (
            workflow_id INTEGER,
            tag_id INTEGER,
            PRIMARY KEY (workflow_id, tag_id),
            FOREIGN KEY (workflow_id) REFERENCES workflows(id),
            FOREIGN KEY (tag_id) REFERENCES tags(id)
        );

        -- Table des types de nodes
        CREATE TABLE IF NOT EXISTS node_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        );

        -- Table de liaison workflow <-> node_types
        CREATE TABLE IF NOT EXISTS workflow_node_types (
            workflow_id INTEGER,
            node_type_id INTEGER,
            PRIMARY KEY (workflow_id, node_type_id),
            FOREIGN KEY (workflow_id) REFERENCES workflows(id),
            FOREIGN KEY (node_type_id) REFERENCES node_types(id)
        );

        -- Index pour optimiser les recherches
        CREATE INDEX IF NOT EXISTS idx_workflows_category ON workflows(category_id);
        CREATE INDEX IF NOT EXISTS idx_workflows_name ON workflows(name);
        CREATE INDEX IF NOT EXISTS idx_workflows_nodes_count ON workflows(nodes_count);
        CREATE INDEX IF NOT EXISTS idx_workflow_tags_workflow ON workflow_tags(workflow_id);
        CREATE INDEX IF NOT EXISTS idx_workflow_tags_tag ON workflow_tags(tag_id);
        CREATE INDEX IF NOT EXISTS idx_workflow_node_types_workflow ON workflow_node_types(workflow_id);
        CREATE INDEX IF NOT EXISTS idx_workflow_node_types_node ON workflow_node_types(node_type_id);
    ''')


def create_fts_table(cursor: sqlite3.Cursor) -> None:
    """Create FTS5 table for full-text search."""
    cursor.executescript('''
        -- Table FTS5 pour la recherche full-text
        CREATE VIRTUAL TABLE IF NOT EXISTS workflows_fts USING fts5(
            name,
            description,
            content='workflows',
            content_rowid='id'
        );

        -- Triggers pour maintenir la table FTS synchronisée
        CREATE TRIGGER IF NOT EXISTS workflows_ai AFTER INSERT ON workflows BEGIN
            INSERT INTO workflows_fts(rowid, name, description)
            VALUES (new.id, new.name, new.description);
        END;

        CREATE TRIGGER IF NOT EXISTS workflows_ad AFTER DELETE ON workflows BEGIN
            INSERT INTO workflows_fts(workflows_fts, rowid, name, description)
            VALUES ('delete', old.id, old.name, old.description);
        END;

        CREATE TRIGGER IF NOT EXISTS workflows_au AFTER UPDATE ON workflows BEGIN
            INSERT INTO workflows_fts(workflows_fts, rowid, name, description)
            VALUES ('delete', old.id, old.name, old.description);
            INSERT INTO workflows_fts(rowid, name, description)
            VALUES (new.id, new.name, new.description);
        END;
    ''')


def import_data(cursor: sqlite3.Cursor, data: dict) -> dict:
    """Import workflows from JSON data into the database."""
    stats = {
        'categories': 0,
        'workflows': 0,
        'tags': 0,
        'node_types': 0
    }

    # Cache pour éviter les doublons
    tags_cache = {}
    node_types_cache = {}

    def get_or_create_tag(tag_name: str) -> int:
        if tag_name in tags_cache:
            return tags_cache[tag_name]
        cursor.execute('INSERT OR IGNORE INTO tags (name) VALUES (?)', (tag_name,))
        cursor.execute('SELECT id FROM tags WHERE name = ?', (tag_name,))
        tag_id = cursor.fetchone()[0]
        tags_cache[tag_name] = tag_id
        return tag_id

    def get_or_create_node_type(node_type_name: str) -> int:
        if node_type_name in node_types_cache:
            return node_types_cache[node_type_name]
        cursor.execute('INSERT OR IGNORE INTO node_types (name) VALUES (?)', (node_type_name,))
        cursor.execute('SELECT id FROM node_types WHERE name = ?', (node_type_name,))
        node_type_id = cursor.fetchone()[0]
        node_types_cache[node_type_name] = node_type_id
        return node_type_id

    # Importer les catégories et workflows
    for category_name, category_data in data['categories'].items():
        # Insérer la catégorie
        cursor.execute(
            'INSERT INTO categories (name, workflows_count) VALUES (?, ?)',
            (category_name, category_data['count'])
        )
        category_id = cursor.lastrowid
        stats['categories'] += 1

        # Insérer les workflows
        for workflow in category_data['workflows']:
            meta = workflow.get('meta', {})

            cursor.execute('''
                INSERT INTO workflows (
                    filename, name, description, nodes_count, category_id,
                    meta_category, meta_status, meta_created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                workflow.get('filename', ''),
                workflow.get('name', ''),
                workflow.get('description', ''),
                workflow.get('nodes_count', 0),
                category_id,
                meta.get('category', ''),
                meta.get('status', ''),
                meta.get('created_at', '')
            ))
            workflow_id = cursor.lastrowid
            stats['workflows'] += 1

            # Insérer les tags
            for tag in workflow.get('tags', []):
                tag_id = get_or_create_tag(tag)
                cursor.execute(
                    'INSERT OR IGNORE INTO workflow_tags (workflow_id, tag_id) VALUES (?, ?)',
                    (workflow_id, tag_id)
                )

            # Insérer les types de nodes
            for node_type in workflow.get('node_types', []):
                node_type_id = get_or_create_node_type(node_type)
                cursor.execute(
                    'INSERT OR IGNORE INTO workflow_node_types (workflow_id, node_type_id) VALUES (?, ?)',
                    (workflow_id, node_type_id)
                )

    stats['tags'] = len(tags_cache)
    stats['node_types'] = len(node_types_cache)

    return stats


def rebuild_fts_index(cursor: sqlite3.Cursor) -> None:
    """Rebuild the FTS index from existing data."""
    cursor.execute('DELETE FROM workflows_fts')
    cursor.execute('''
        INSERT INTO workflows_fts(rowid, name, description)
        SELECT id, name, description FROM workflows
    ''')


def main():
    parser = argparse.ArgumentParser(
        description='Import n8n workflows from JSON catalog into SQLite database'
    )
    parser.add_argument(
        '--json',
        type=Path,
        default=Path(__file__).parent.parent / 'workflows-catalog.json',
        help='Path to workflows-catalog.json'
    )
    parser.add_argument(
        '--db',
        type=Path,
        default=Path(__file__).parent / 'workflows.db',
        help='Path to SQLite database'
    )
    args = parser.parse_args()

    # Vérifier que le fichier JSON existe
    if not args.json.exists():
        print(f"Error: JSON file not found: {args.json}")
        return 1

    # Charger les données JSON
    print(f"Loading JSON from: {args.json}")
    with open(args.json, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Supprimer la base existante si elle existe
    if args.db.exists():
        print(f"Removing existing database: {args.db}")
        args.db.unlink()

    # Créer la connexion
    print(f"Creating database: {args.db}")
    conn = sqlite3.connect(args.db)
    cursor = conn.cursor()

    try:
        # Créer le schéma
        print("Creating schema...")
        create_schema(cursor)
        create_fts_table(cursor)

        # Importer les données
        print("Importing data...")
        stats = import_data(cursor, data)

        # Reconstruire l'index FTS (les triggers ne fonctionnent pas pour l'import initial)
        print("Building FTS index...")
        rebuild_fts_index(cursor)

        conn.commit()

        # Afficher les statistiques
        print("\n" + "=" * 50)
        print("Import completed successfully!")
        print("=" * 50)
        print(f"  Categories:  {stats['categories']}")
        print(f"  Workflows:   {stats['workflows']}")
        print(f"  Tags:        {stats['tags']}")
        print(f"  Node types:  {stats['node_types']}")
        print(f"  Database:    {args.db} ({args.db.stat().st_size / 1024 / 1024:.2f} MB)")

        # Test rapide
        print("\n--- Quick test ---")
        cursor.execute('SELECT COUNT(*) FROM workflows')
        print(f"Workflows in DB: {cursor.fetchone()[0]}")

        cursor.execute("SELECT * FROM workflows_fts WHERE workflows_fts MATCH 'google' LIMIT 3")
        results = cursor.fetchall()
        print(f"FTS search 'google': {len(results)} results")

    except Exception as e:
        conn.rollback()
        print(f"Error: {e}")
        return 1

    finally:
        conn.close()

    return 0


if __name__ == '__main__':
    exit(main())
