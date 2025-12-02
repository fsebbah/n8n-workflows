"""Initial schema for n8n workflows database

Revision ID: 0001
Revises: None
Create Date: 2025-12-02

This migration creates the complete database schema for storing
n8n workflow metadata including:
- Categories
- Workflows
- Tags (many-to-many)
- Node types (many-to-many)
- Full-text search (FTS5)
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Table des catégories
    op.create_table(
        'categories',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.Text(), nullable=False, unique=True),
        sa.Column('workflows_count', sa.Integer(), default=0),
    )

    # Table des workflows
    op.create_table(
        'workflows',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('filename', sa.Text(), nullable=False),
        sa.Column('name', sa.Text()),
        sa.Column('description', sa.Text()),
        sa.Column('nodes_count', sa.Integer(), default=0),
        sa.Column('category_id', sa.Integer(), sa.ForeignKey('categories.id')),
        sa.Column('meta_category', sa.Text()),
        sa.Column('meta_status', sa.Text()),
        sa.Column('meta_created_at', sa.Text()),
    )

    # Table des tags
    op.create_table(
        'tags',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.Text(), nullable=False, unique=True),
    )

    # Table de liaison workflow <-> tags
    op.create_table(
        'workflow_tags',
        sa.Column('workflow_id', sa.Integer(), sa.ForeignKey('workflows.id'), primary_key=True),
        sa.Column('tag_id', sa.Integer(), sa.ForeignKey('tags.id'), primary_key=True),
    )

    # Table des types de nodes
    op.create_table(
        'node_types',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.Text(), nullable=False, unique=True),
    )

    # Table de liaison workflow <-> node_types
    op.create_table(
        'workflow_node_types',
        sa.Column('workflow_id', sa.Integer(), sa.ForeignKey('workflows.id'), primary_key=True),
        sa.Column('node_type_id', sa.Integer(), sa.ForeignKey('node_types.id'), primary_key=True),
    )

    # Index pour optimiser les recherches
    op.create_index('idx_workflows_category', 'workflows', ['category_id'])
    op.create_index('idx_workflows_name', 'workflows', ['name'])
    op.create_index('idx_workflows_nodes_count', 'workflows', ['nodes_count'])
    op.create_index('idx_workflow_tags_workflow', 'workflow_tags', ['workflow_id'])
    op.create_index('idx_workflow_tags_tag', 'workflow_tags', ['tag_id'])
    op.create_index('idx_workflow_node_types_workflow', 'workflow_node_types', ['workflow_id'])
    op.create_index('idx_workflow_node_types_node', 'workflow_node_types', ['node_type_id'])

    # Table FTS5 pour la recherche full-text (SQLite spécifique)
    op.execute('''
        CREATE VIRTUAL TABLE IF NOT EXISTS workflows_fts USING fts5(
            name,
            description,
            content='workflows',
            content_rowid='id'
        )
    ''')

    # Triggers pour maintenir la table FTS synchronisée
    op.execute('''
        CREATE TRIGGER workflows_ai AFTER INSERT ON workflows BEGIN
            INSERT INTO workflows_fts(rowid, name, description)
            VALUES (new.id, new.name, new.description);
        END
    ''')

    op.execute('''
        CREATE TRIGGER workflows_ad AFTER DELETE ON workflows BEGIN
            INSERT INTO workflows_fts(workflows_fts, rowid, name, description)
            VALUES ('delete', old.id, old.name, old.description);
        END
    ''')

    op.execute('''
        CREATE TRIGGER workflows_au AFTER UPDATE ON workflows BEGIN
            INSERT INTO workflows_fts(workflows_fts, rowid, name, description)
            VALUES ('delete', old.id, old.name, old.description);
            INSERT INTO workflows_fts(rowid, name, description)
            VALUES (new.id, new.name, new.description);
        END
    ''')


def downgrade() -> None:
    # Supprimer les triggers
    op.execute('DROP TRIGGER IF EXISTS workflows_au')
    op.execute('DROP TRIGGER IF EXISTS workflows_ad')
    op.execute('DROP TRIGGER IF EXISTS workflows_ai')

    # Supprimer la table FTS
    op.execute('DROP TABLE IF EXISTS workflows_fts')

    # Supprimer les index
    op.drop_index('idx_workflow_node_types_node')
    op.drop_index('idx_workflow_node_types_workflow')
    op.drop_index('idx_workflow_tags_tag')
    op.drop_index('idx_workflow_tags_workflow')
    op.drop_index('idx_workflows_nodes_count')
    op.drop_index('idx_workflows_name')
    op.drop_index('idx_workflows_category')

    # Supprimer les tables
    op.drop_table('workflow_node_types')
    op.drop_table('node_types')
    op.drop_table('workflow_tags')
    op.drop_table('tags')
    op.drop_table('workflows')
    op.drop_table('categories')
