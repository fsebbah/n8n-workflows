#!/usr/bin/env python3
"""
n8n Workflows Explorer - Streamlit Application

A user-friendly interface to explore 2061 n8n workflows across 188 categories.
"""

import json
import os
import streamlit as st
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

from workflow_analyzer import WorkflowAnalyzer, generate_simple_mermaid

# Déterminer le répertoire racine du projet
APP_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = APP_DIR.parent

# Charger les variables d'environnement depuis .env.local
load_dotenv(APP_DIR / ".env.local")

# Initialiser l'analyseur
analyzer = WorkflowAnalyzer()

# Configuration de la page
st.set_page_config(
    page_title="n8n Workflows Explorer",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# CSS personnalisé
st.markdown("""
<style>
    /* Style général */
    .main-header {
        font-size: 2.5rem;
        font-weight: bold;
        margin-bottom: 0.5rem;
    }
    .sub-header {
        font-size: 1.2rem;
        color: #666;
        margin-bottom: 2rem;
    }

    /* Badges de catégories */
    .category-badge {
        display: inline-block;
        padding: 0.3rem 0.8rem;
        margin: 0.2rem;
        background-color: #f0f2f6;
        border-radius: 20px;
        font-size: 0.9rem;
        cursor: pointer;
        transition: all 0.2s;
    }
    .category-badge:hover {
        background-color: #e0e2e6;
    }
    .category-badge-selected {
        background-color: #ff4b4b;
        color: white;
    }

    /* Liste des workflows */
    .workflow-item {
        padding: 1rem;
        margin: 0.5rem 0;
        background-color: #f8f9fa;
        border-radius: 8px;
        border-left: 4px solid #ff4b4b;
    }
    .workflow-name {
        font-weight: bold;
        font-size: 1.1rem;
    }
    .workflow-meta {
        color: #666;
        font-size: 0.9rem;
    }

    /* Détails du workflow */
    .detail-section {
        background-color: #f8f9fa;
        padding: 1.5rem;
        border-radius: 10px;
        margin-top: 1rem;
    }
    .node-type-tag {
        display: inline-block;
        padding: 0.2rem 0.5rem;
        margin: 0.1rem;
        background-color: #e7f3ff;
        border-radius: 4px;
        font-size: 0.8rem;
        color: #0066cc;
    }
    .tag-badge {
        display: inline-block;
        padding: 0.2rem 0.5rem;
        margin: 0.1rem;
        background-color: #e8f5e9;
        border-radius: 4px;
        font-size: 0.8rem;
        color: #2e7d32;
    }

    /* Stats cards */
    .stat-card {
        text-align: center;
        padding: 1rem;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 10px;
        color: white;
    }
    .stat-number {
        font-size: 2rem;
        font-weight: bold;
    }
    .stat-label {
        font-size: 0.9rem;
        opacity: 0.9;
    }
</style>
""", unsafe_allow_html=True)


@st.cache_data
def load_catalog() -> dict:
    """Charge le catalogue des workflows depuis le fichier JSON."""
    catalog_path = PROJECT_ROOT / "docs" / "n8n" / "workflows-catalog.json"

    if not catalog_path.exists():
        st.error(f"Fichier catalogue non trouvé: {catalog_path}")
        st.info(f"Répertoire app: {APP_DIR}")
        st.info(f"Répertoire projet: {PROJECT_ROOT}")
        return {"metadata": {}, "categories": {}}

    with open(catalog_path, 'r', encoding='utf-8') as f:
        return json.load(f)


@st.cache_data
def get_workflow_json(category: str, filename: str) -> Optional[dict]:
    """Charge le fichier JSON original d'un workflow."""
    workflow_path = PROJECT_ROOT / "workflows" / category / filename

    if not workflow_path.exists():
        return None

    try:
        with open(workflow_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None


def render_header(catalog: dict):
    """Affiche l'en-tête avec les statistiques."""
    metadata = catalog.get("metadata", {})

    st.markdown('<p class="main-header">⚡ n8n Workflows Explorer</p>', unsafe_allow_html=True)
    st.markdown('<p class="sub-header">Explorez plus de 2000 workflows d\'automatisation n8n</p>', unsafe_allow_html=True)

    # Statistiques
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        st.metric("Workflows", metadata.get("total_workflows", 0))
    with col2:
        st.metric("Catégories", metadata.get("total_categories", 0))
    with col3:
        # Calculer le nombre total de types de nodes uniques
        all_node_types = set()
        for cat_data in catalog.get("categories", {}).values():
            for wf in cat_data.get("workflows", []):
                all_node_types.update(wf.get("node_types", []))
        st.metric("Types de Nodes", len(all_node_types))
    with col4:
        st.metric("Généré le", metadata.get("generated_at", "N/A"))

    st.divider()


def render_category_selector(catalog: dict) -> Optional[str]:
    """Affiche le sélecteur de catégories avec recherche et autocomplétion."""
    categories = catalog.get("categories", {})

    # Préparer la liste des catégories avec leur nombre de workflows
    category_options = {
        name: f"{name} ({data['count']} workflows)"
        for name, data in sorted(categories.items(), key=lambda x: x[0].lower())
    }

    st.subheader("📁 Sélectionner une catégorie")

    col1, col2 = st.columns([3, 1])

    with col1:
        # Recherche avec autocomplétion
        search_query = st.text_input(
            "🔍 Rechercher une catégorie",
            placeholder="Tapez pour filtrer (ex: google, telegram, slack...)",
            key="category_search"
        )

    with col2:
        # Bouton "Toutes les catégories"
        show_all = st.button("📋 Toutes les catégories", use_container_width=True)

    # Filtrer les catégories selon la recherche
    if search_query:
        filtered_categories = {
            k: v for k, v in category_options.items()
            if search_query.lower() in k.lower()
        }
    else:
        filtered_categories = category_options

    # Modal pour afficher toutes les catégories
    if show_all:
        st.session_state.show_all_categories = True

    # Afficher la modal avec toutes les catégories
    if st.session_state.get("show_all_categories", False):
        with st.expander("📋 Toutes les catégories (cliquez pour fermer)", expanded=True):
            # Recherche dans la modal
            modal_search = st.text_input(
                "Filtrer",
                placeholder="Rechercher...",
                key="modal_search"
            )

            # Filtrer selon la recherche dans la modal
            if modal_search:
                display_categories = {
                    k: v for k, v in category_options.items()
                    if modal_search.lower() in k.lower()
                }
            else:
                display_categories = category_options

            # Afficher les catégories en colonnes
            cols = st.columns(4)
            for idx, (cat_name, cat_display) in enumerate(display_categories.items()):
                col_idx = idx % 4
                with cols[col_idx]:
                    if st.button(cat_display, key=f"modal_cat_{cat_name}", use_container_width=True):
                        st.session_state.selected_category = cat_name
                        st.session_state.show_all_categories = False
                        st.rerun()

            if st.button("❌ Fermer", use_container_width=True):
                st.session_state.show_all_categories = False
                st.rerun()

    # Afficher les catégories filtrées (si recherche active ou par défaut les 20 premières)
    if search_query:
        display_cats = filtered_categories
        st.write(f"**{len(display_cats)} catégorie(s) trouvée(s):**")
    else:
        # Sans recherche, afficher un message d'aide
        st.caption("💡 Tapez les premières lettres pour filtrer (ex: 'goo' pour Google, 'tel' pour Telegram...)")
        display_cats = {}  # N'afficher que si recherche active

    if display_cats:
        cols = st.columns(4)
        for idx, (cat_name, cat_display) in enumerate(display_cats.items()):
            col_idx = idx % 4
            with cols[col_idx]:
                if st.button(cat_display, key=f"filtered_cat_{cat_name}", use_container_width=True):
                    st.session_state.selected_category = cat_name
                    st.rerun()

    # Afficher la catégorie actuellement sélectionnée
    current_selection = st.session_state.get("selected_category")
    if current_selection:
        st.success(f"✅ Catégorie sélectionnée: **{current_selection}** ({categories[current_selection]['count']} workflows)")

        # Bouton pour changer de catégorie
        if st.button("🔄 Changer de catégorie"):
            st.session_state.selected_category = None
            st.session_state.selected_workflow = None
            st.rerun()

    return st.session_state.get("selected_category")


def render_workflow_list(catalog: dict, category: str) -> Optional[dict]:
    """Affiche la liste des workflows d'une catégorie."""
    categories = catalog.get("categories", {})

    if category not in categories:
        st.warning(f"Catégorie '{category}' non trouvée.")
        return None

    category_data = categories[category]
    workflows = category_data.get("workflows", [])

    st.divider()
    st.subheader(f"📄 Workflows dans '{category}' ({len(workflows)})")

    # Recherche dans les workflows
    workflow_search = st.text_input(
        "🔍 Rechercher un workflow",
        placeholder="Filtrer par nom ou description...",
        key="workflow_search"
    )

    # Tri
    sort_option = st.selectbox(
        "Trier par",
        ["Nom (A-Z)", "Nom (Z-A)", "Nodes (croissant)", "Nodes (décroissant)"],
        key="workflow_sort"
    )

    # Filtrer les workflows
    if workflow_search:
        filtered_workflows = [
            wf for wf in workflows
            if workflow_search.lower() in wf.get("name", "").lower()
            or workflow_search.lower() in wf.get("description", "").lower()
        ]
    else:
        filtered_workflows = workflows

    # Trier les workflows
    if sort_option == "Nom (A-Z)":
        filtered_workflows = sorted(filtered_workflows, key=lambda x: x.get("name", "").lower())
    elif sort_option == "Nom (Z-A)":
        filtered_workflows = sorted(filtered_workflows, key=lambda x: x.get("name", "").lower(), reverse=True)
    elif sort_option == "Nodes (croissant)":
        filtered_workflows = sorted(filtered_workflows, key=lambda x: x.get("nodes_count", 0))
    elif sort_option == "Nodes (décroissant)":
        filtered_workflows = sorted(filtered_workflows, key=lambda x: x.get("nodes_count", 0), reverse=True)

    st.write(f"**{len(filtered_workflows)} workflow(s) affiché(s)**")

    # Afficher les workflows
    for idx, workflow in enumerate(filtered_workflows):
        with st.container():
            col1, col2 = st.columns([4, 1])

            with col1:
                workflow_name = workflow.get("name", "Sans nom")
                nodes_count = workflow.get("nodes_count", 0)

                # Bouton pour sélectionner le workflow
                if st.button(
                    f"**{workflow_name}**",
                    key=f"wf_{category}_{idx}",
                    use_container_width=True,
                    help=f"{nodes_count} nodes - Cliquez pour voir les détails"
                ):
                    st.session_state.selected_workflow = workflow
                    st.session_state.selected_workflow_category = category

            with col2:
                st.caption(f"🔗 {nodes_count} nodes")

    return st.session_state.get("selected_workflow")


def render_workflow_details(workflow: dict, category: str):
    """Affiche les détails complets d'un workflow."""
    st.divider()
    st.subheader("📋 Détails du Workflow")

    # Informations principales
    col1, col2, col3 = st.columns(3)

    with col1:
        st.metric("Nom", workflow.get("name", "Sans nom")[:50])
    with col2:
        st.metric("Nombre de Nodes", workflow.get("nodes_count", 0))
    with col3:
        st.metric("Catégorie", category)

    # Description
    st.markdown("### Description")
    description = workflow.get("description", "Aucune description disponible.")
    st.info(description)

    # Métadonnées
    meta = workflow.get("meta", {})
    if meta:
        st.markdown("### Métadonnées")
        col1, col2, col3 = st.columns(3)
        with col1:
            st.write(f"**Statut:** {meta.get('status', 'N/A')}")
        with col2:
            st.write(f"**Catégorie meta:** {meta.get('category', 'N/A')}")
        with col3:
            created = meta.get('created_at', 'N/A')
            if created != 'N/A':
                created = created.split('T')[0]  # Garder juste la date
            st.write(f"**Créé le:** {created}")

    # Tags
    tags = workflow.get("tags", [])
    if tags:
        st.markdown("### Tags")
        tags_html = " ".join([f'<span class="tag-badge">{tag}</span>' for tag in tags])
        st.markdown(tags_html, unsafe_allow_html=True)

    # Types de nodes utilisés
    node_types = workflow.get("node_types", [])
    if node_types:
        st.markdown("### Types de Nodes Utilisés")

        # Afficher en colonnes
        cols = st.columns(4)
        for idx, node_type in enumerate(sorted(node_types)):
            col_idx = idx % 4
            with cols[col_idx]:
                st.code(node_type, language=None)

    # Fichier JSON original
    st.markdown("### Fichier JSON Original")

    filename = workflow.get("filename", "")
    st.write(f"**Fichier:** `{filename}`")

    # Charger et afficher le JSON
    json_data = get_workflow_json(category, filename)

    if json_data:
        col1, col2 = st.columns([1, 1])

        with col1:
            # Bouton de téléchargement
            json_str = json.dumps(json_data, indent=2, ensure_ascii=False)
            st.download_button(
                label="⬇️ Télécharger le JSON",
                data=json_str,
                file_name=filename,
                mime="application/json"
            )

        with col2:
            # Copier le chemin
            workflow_path = f"workflows/{category}/{filename}"
            st.code(workflow_path, language=None)

        # Afficher le JSON dans un expander
        with st.expander("👁️ Voir le contenu JSON", expanded=False):
            st.json(json_data)

        # Section d'analyse IA
        st.markdown("---")
        render_ai_analysis(json_data, filename)

    else:
        st.warning("Impossible de charger le fichier JSON original.")

    # Bouton pour fermer les détails
    if st.button("❌ Fermer les détails", use_container_width=True):
        st.session_state.selected_workflow = None
        st.session_state.pop("ai_analysis", None)
        st.rerun()


def render_ai_analysis(workflow_json: dict, filename: str):
    """Affiche la section d'analyse IA du workflow."""
    st.markdown("### 🤖 Analyse IA du Workflow")

    # Vérifier si l'API est configurée
    if not analyzer.is_configured():
        st.warning("⚠️ Clé API OpenAI non configurée.")
        st.info("""
        Pour activer l'analyse IA, créez un fichier `.env.local` dans le dossier `app/` avec:
        ```
        OPENAI_API_KEY=votre_clé_api
        ```
        Ou définissez la variable d'environnement `OPENAI_API_KEY`.
        """)

        # Afficher quand même le diagramme simple
        st.markdown("#### 📊 Diagramme du Workflow (simplifié)")
        simple_mermaid = generate_simple_mermaid(workflow_json)
        st.code(simple_mermaid, language="mermaid")

        # Afficher les infos extraites sans IA
        st.markdown("#### 📋 Informations extraites")
        info = analyzer.extract_workflow_info(workflow_json)

        col1, col2 = st.columns(2)
        with col1:
            st.write(f"**Triggers:** {', '.join(info['triggers']) if info['triggers'] else 'Aucun'}")
            st.write(f"**Services:** {', '.join(info['services']) if info['services'] else 'Aucun détecté'}")
        with col2:
            st.write(f"**Conditions:** {'Oui' if info['has_conditions'] else 'Non'}")
            st.write(f"**Boucles:** {'Oui' if info['has_loops'] else 'Non'}")

        return

    # Clé unique pour le cache de l'analyse
    analysis_key = f"analysis_{filename}"

    # Bouton pour lancer l'analyse
    col1, col2 = st.columns([1, 3])

    with col1:
        analyze_button = st.button("🔍 Analyser avec GPT-4", use_container_width=True)

    with col2:
        model = st.selectbox(
            "Modèle",
            ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"],
            index=0,
            help="gpt-4o-mini est plus rapide et moins cher"
        )

    # Lancer l'analyse si demandé
    if analyze_button:
        with st.spinner("🔄 Analyse en cours... (peut prendre 10-30 secondes)"):
            result = analyzer.analyze(workflow_json, model=model)
            st.session_state[analysis_key] = result

    # Afficher les résultats si disponibles
    if analysis_key in st.session_state:
        result = st.session_state[analysis_key]

        if result.get("success"):
            # Afficher les tokens utilisés
            st.caption(f"✅ Analysé avec {result.get('model', 'GPT-4')} - {result.get('tokens_used', 0)} tokens utilisés")

            # Afficher le diagramme Mermaid
            mermaid_diagram = result.get("mermaid_diagram", "")
            if mermaid_diagram:
                st.markdown("#### 📊 Diagramme du Workflow")

                # Afficher le code Mermaid
                with st.expander("📝 Code Mermaid (copier pour utiliser ailleurs)", expanded=False):
                    st.code(mermaid_diagram, language="mermaid")

                # Afficher le rendu via iframe mermaid.live
                mermaid_url = generate_mermaid_live_url(mermaid_diagram)
                if mermaid_url:
                    st.markdown(f"[🔗 Voir sur Mermaid Live]({mermaid_url})")

                # Afficher directement avec st.code (Streamlit supporte Mermaid)
                st.code(mermaid_diagram, language="mermaid")

            # Afficher l'analyse complète
            st.markdown("#### 📝 Analyse Complète")
            st.markdown(result.get("raw_response", "Pas de réponse"))

        else:
            st.error(f"❌ Erreur: {result.get('error', 'Erreur inconnue')}")

    else:
        # Afficher les infos de base en attendant l'analyse
        st.info("💡 Cliquez sur 'Analyser avec GPT-4' pour obtenir une explication détaillée du workflow et un diagramme.")

        # Afficher le diagramme simple en attendant
        with st.expander("📊 Aperçu du flux (simplifié)", expanded=False):
            simple_mermaid = generate_simple_mermaid(workflow_json)
            st.code(simple_mermaid, language="mermaid")


def generate_mermaid_live_url(mermaid_code: str) -> str:
    """Génère une URL vers Mermaid Live Editor."""
    import base64
    import zlib

    try:
        # Encoder pour Mermaid Live
        json_str = json.dumps({"code": mermaid_code, "mermaid": {"theme": "default"}})
        compressed = zlib.compress(json_str.encode('utf-8'), 9)
        encoded = base64.urlsafe_b64encode(compressed).decode('utf-8')
        return f"https://mermaid.live/edit#pako:{encoded}"
    except Exception:
        return ""


def main():
    """Point d'entrée principal de l'application."""
    # Initialiser le state
    if "selected_category" not in st.session_state:
        st.session_state.selected_category = None
    if "selected_workflow" not in st.session_state:
        st.session_state.selected_workflow = None
    if "show_all_categories" not in st.session_state:
        st.session_state.show_all_categories = False

    # Charger le catalogue
    catalog = load_catalog()

    if not catalog.get("categories"):
        st.error("Impossible de charger le catalogue des workflows.")
        return

    # Afficher l'en-tête
    render_header(catalog)

    # Sélecteur de catégories
    selected_category = render_category_selector(catalog)

    # Afficher les workflows si une catégorie est sélectionnée
    if selected_category:
        selected_workflow = render_workflow_list(catalog, selected_category)

        # Afficher les détails si un workflow est sélectionné
        if st.session_state.get("selected_workflow"):
            render_workflow_details(
                st.session_state.selected_workflow,
                st.session_state.get("selected_workflow_category", selected_category)
            )


if __name__ == "__main__":
    main()
