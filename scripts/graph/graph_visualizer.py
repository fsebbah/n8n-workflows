#!/usr/bin/env python3
"""
Knowledge Graph Visualizer
Transforms JSON output from Knowledge Graph workflow into interactive HTML or PDF.

Usage:
    python graph_visualizer.py <input.json> [--output output.html] [--format html|pdf]

Examples:
    python graph_visualizer.py graph.json
    python graph_visualizer.py graph.json --output my_graph.html
    python graph_visualizer.py graph.json --format pdf --output my_graph.pdf
"""

import argparse
import json
import sys
from pathlib import Path

try:
    from pyvis.network import Network
except ImportError:
    print("PyVis not installed. Run: pip install pyvis")
    sys.exit(1)


# Color palette for entity types
ENTITY_COLORS = {
    "person": "#4CAF50",        # Green
    "organization": "#2196F3",   # Blue
    "location": "#FF9800",       # Orange
    "event": "#9C27B0",          # Purple
    "concept": "#00BCD4",        # Cyan
    "metric": "#F44336",         # Red
    "risk": "#E91E63",           # Pink
    "product": "#8BC34A",        # Light Green
    "technology": "#3F51B5",     # Indigo
    "character": "#4CAF50",      # Green (alias for person)
    "industry": "#795548",       # Brown
    "region": "#FF5722",         # Deep Orange
    "default": "#9E9E9E",        # Grey
}


def load_graph_json(filepath: str) -> dict:
    """Load and parse the knowledge graph JSON file."""
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Handle different JSON structures
    if "graph" in data:
        return data["graph"]
    elif "nodes" in data and "edges" in data:
        return data
    else:
        raise ValueError("Invalid JSON structure. Expected 'graph' or 'nodes'/'edges' keys.")


def get_node_color(node_type: str) -> str:
    """Get color for a node based on its type."""
    return ENTITY_COLORS.get(node_type.lower(), ENTITY_COLORS["default"])


def create_pyvis_network(graph_data: dict, title: str = "Knowledge Graph") -> Network:
    """Create a PyVis network from graph data."""
    # Configure network - cdn_resources='inline' embeds all JS/CSS in the HTML
    net = Network(
        height="900px",
        width="100%",
        bgcolor="#ffffff",
        font_color="#333333",
        directed=True,
        notebook=False,
        select_menu=False,  # Disable to avoid TomSelect dependency
        filter_menu=False,  # Disable to avoid TomSelect dependency
        cdn_resources='in_line',  # Embed all resources in HTML
    )

    # Physics configuration for better layout
    net.set_options("""
    {
        "nodes": {
            "font": {
                "size": 14,
                "face": "arial"
            },
            "scaling": {
                "min": 10,
                "max": 30
            }
        },
        "edges": {
            "arrows": {
                "to": {
                    "enabled": true,
                    "scaleFactor": 0.5
                }
            },
            "color": {
                "inherit": false,
                "color": "#848484",
                "highlight": "#000000"
            },
            "font": {
                "size": 10,
                "align": "middle"
            },
            "smooth": {
                "type": "continuous"
            }
        },
        "physics": {
            "enabled": true,
            "solver": "forceAtlas2Based",
            "forceAtlas2Based": {
                "gravitationalConstant": -50,
                "centralGravity": 0.01,
                "springLength": 100,
                "springConstant": 0.08,
                "damping": 0.4
            },
            "stabilization": {
                "enabled": true,
                "iterations": 200,
                "updateInterval": 25
            }
        },
        "interaction": {
            "hover": true,
            "tooltipDelay": 100,
            "navigationButtons": true,
            "keyboard": {
                "enabled": true
            }
        }
    }
    """)

    nodes = graph_data.get("nodes", [])
    edges = graph_data.get("edges", [])

    # Build node ID to name mapping
    node_map = {}
    for node in nodes:
        node_id = node.get("id")
        node_name = node.get("name", f"Node {node_id}")
        node_type = node.get("type", "default")
        node_map[node_id] = node_name

        color = get_node_color(node_type)

        net.add_node(
            node_id,
            label=node_name,
            title=f"{node_name}\nType: {node_type}",
            color=color,
            size=20,
            shape="dot",
        )

    # Add edges
    for edge in edges:
        source = edge.get("source")
        target = edge.get("target")
        edge_type = edge.get("type", "related_to")

        if source is not None and target is not None:
            net.add_edge(
                source,
                target,
                title=edge_type,
                label=edge_type,
            )

    return net


def generate_html(graph_data: dict, output_path: str, title: str = "Knowledge Graph"):
    """Generate interactive HTML visualization."""
    net = create_pyvis_network(graph_data, title)

    # Add custom HTML header with stats
    nodes_count = len(graph_data.get("nodes", []))
    edges_count = len(graph_data.get("edges", []))

    net.save_graph(output_path)

    # Inject custom header and filter panel into HTML
    with open(output_path, 'r', encoding='utf-8') as f:
        html_content = f.read()

    # Get unique entity types for filter
    entity_types = set()
    for node in graph_data.get("nodes", []):
        entity_types.add(node.get("type", "default").lower())

    # Build filter checkboxes
    filter_checkboxes = ""
    for etype in sorted(entity_types):
        color = ENTITY_COLORS.get(etype, ENTITY_COLORS["default"])
        filter_checkboxes += f'''
            <label style="display: block; margin: 3px 0; cursor: pointer;">
                <input type="checkbox" class="type-filter" value="{etype}" checked
                       style="margin-right: 5px;">
                <span style="color: {color};">●</span> {etype.capitalize()}
            </label>'''

    stats_header = f"""
    <div id="control-panel" style="position: fixed; top: 10px; left: 10px; background: white; padding: 15px;
                border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.2); z-index: 1000; max-width: 250px;">
        <h3 style="margin: 0 0 10px 0; border-bottom: 1px solid #eee; padding-bottom: 8px;">{title}</h3>
        <p style="margin: 0 0 10px 0; font-size: 12px; color: #666;">
            <strong>Nodes:</strong> {nodes_count} | <strong>Edges:</strong> {edges_count}
        </p>

        <div style="margin-bottom: 10px;">
            <input type="text" id="search-input" placeholder="Search nodes..."
                   style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
        </div>

        <details open style="margin-bottom: 10px;">
            <summary style="cursor: pointer; font-weight: bold; font-size: 12px; margin-bottom: 5px;">
                Filter by Type
            </summary>
            <div style="font-size: 11px; max-height: 200px; overflow-y: auto;">
                <label style="display: block; margin: 3px 0; cursor: pointer;">
                    <input type="checkbox" id="select-all" checked style="margin-right: 5px;">
                    <strong>Select All</strong>
                </label>
                <hr style="margin: 5px 0; border: none; border-top: 1px solid #eee;">
                {filter_checkboxes}
            </div>
        </details>

        <button id="reset-view" style="width: 100%; padding: 6px; background: #2196F3; color: white;
                border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
            Reset View
        </button>
    </div>

    <script>
    document.addEventListener('DOMContentLoaded', function() {{
        // Store original nodes and edges data
        var allNodes = network.body.data.nodes.get();
        var allEdges = network.body.data.edges.get();
        var nodeTypes = {{}};
        allNodes.forEach(function(node) {{
            var type = (node.title || '').toLowerCase().includes('type:') ?
                       node.title.split('Type:')[1].trim().toLowerCase() : 'default';
            nodeTypes[node.id] = type;
        }});

        // Search functionality
        document.getElementById('search-input').addEventListener('input', function(e) {{
            var searchTerm = e.target.value.toLowerCase();
            if (searchTerm.length > 0) {{
                var matchingNodes = allNodes.filter(function(node) {{
                    return node.label.toLowerCase().includes(searchTerm);
                }});
                if (matchingNodes.length > 0) {{
                    network.selectNodes(matchingNodes.map(function(n) {{ return n.id; }}));
                    if (matchingNodes.length === 1) {{
                        network.focus(matchingNodes[0].id, {{scale: 1.5, animation: true}});
                    }}
                }}
            }} else {{
                network.unselectAll();
            }}
        }});

        // Filter functionality
        function applyFilters() {{
            var checkedTypes = Array.from(document.querySelectorAll('.type-filter:checked'))
                                    .map(function(cb) {{ return cb.value; }});

            var visibleNodes = allNodes.filter(function(node) {{
                var nodeType = nodeTypes[node.id] || 'default';
                return checkedTypes.includes(nodeType);
            }});
            var visibleNodeIds = visibleNodes.map(function(n) {{ return n.id; }});

            var visibleEdges = allEdges.filter(function(edge) {{
                return visibleNodeIds.includes(edge.from) && visibleNodeIds.includes(edge.to);
            }});

            network.body.data.nodes.clear();
            network.body.data.nodes.add(visibleNodes);
            network.body.data.edges.clear();
            network.body.data.edges.add(visibleEdges);
        }}

        document.querySelectorAll('.type-filter').forEach(function(cb) {{
            cb.addEventListener('change', applyFilters);
        }});

        // Select All functionality
        document.getElementById('select-all').addEventListener('change', function(e) {{
            document.querySelectorAll('.type-filter').forEach(function(cb) {{
                cb.checked = e.target.checked;
            }});
            applyFilters();
        }});

        // Reset view
        document.getElementById('reset-view').addEventListener('click', function() {{
            document.querySelectorAll('.type-filter').forEach(function(cb) {{
                cb.checked = true;
            }});
            document.getElementById('select-all').checked = true;
            document.getElementById('search-input').value = '';
            network.body.data.nodes.clear();
            network.body.data.nodes.add(allNodes);
            network.body.data.edges.clear();
            network.body.data.edges.add(allEdges);
            network.fit();
        }});
    }});
    </script>
    """

    html_content = html_content.replace('<body>', f'<body>{stats_header}')

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html_content)

    print(f"HTML generated: {output_path}")
    return output_path


def generate_pdf(graph_data: dict, output_path: str, title: str = "Knowledge Graph"):
    """Generate PDF from HTML using browser automation or static image."""
    try:
        import matplotlib.pyplot as plt
        import networkx as nx
    except ImportError:
        print("For PDF export, install: pip install matplotlib networkx")
        sys.exit(1)

    # Create NetworkX graph
    G = nx.DiGraph()

    nodes = graph_data.get("nodes", [])
    edges = graph_data.get("edges", [])

    # Add nodes with attributes
    node_colors = []
    node_labels = {}
    for node in nodes:
        node_id = node.get("id")
        node_name = node.get("name", f"Node {node_id}")
        node_type = node.get("type", "default")
        G.add_node(node_id, name=node_name, type=node_type)
        node_labels[node_id] = node_name[:20] + "..." if len(node_name) > 20 else node_name
        node_colors.append(get_node_color(node_type))

    # Add edges
    edge_labels = {}
    for edge in edges:
        source = edge.get("source")
        target = edge.get("target")
        edge_type = edge.get("type", "")
        if source is not None and target is not None:
            G.add_edge(source, target, type=edge_type)
            edge_labels[(source, target)] = edge_type

    # Create figure
    plt.figure(figsize=(24, 18))
    plt.title(f"{title}\nNodes: {len(nodes)} | Edges: {len(edges)}", fontsize=16)

    # Layout - use spring layout (doesn't require scipy)
    pos = nx.spring_layout(G, k=2, iterations=100, seed=42)

    # Draw
    nx.draw_networkx_nodes(G, pos, node_color=node_colors, node_size=300, alpha=0.9)
    nx.draw_networkx_labels(G, pos, node_labels, font_size=6)
    nx.draw_networkx_edges(G, pos, edge_color='gray', arrows=True,
                           arrowsize=10, alpha=0.5, connectionstyle="arc3,rad=0.1")

    # Edge labels (only for small graphs)
    if len(edges) < 50:
        nx.draw_networkx_edge_labels(G, pos, edge_labels, font_size=5)

    plt.axis('off')
    plt.tight_layout()
    plt.savefig(output_path, format='pdf', dpi=150, bbox_inches='tight')
    plt.close()

    print(f"PDF generated: {output_path}")
    return output_path


def main():
    parser = argparse.ArgumentParser(
        description="Visualize Knowledge Graph from JSON",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument("input", help="Input JSON file from Knowledge Graph workflow")
    parser.add_argument("-o", "--output", help="Output file path")
    parser.add_argument("-f", "--format", choices=["html", "pdf"], default="html",
                        help="Output format (default: html)")
    parser.add_argument("-t", "--title", default="Knowledge Graph",
                        help="Graph title")

    args = parser.parse_args()

    # Validate input
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: Input file not found: {args.input}")
        sys.exit(1)

    # Determine output path
    if args.output:
        output_path = args.output
    else:
        suffix = ".html" if args.format == "html" else ".pdf"
        output_path = str(input_path.with_suffix(suffix))

    # Load graph data
    print(f"Loading graph from: {args.input}")
    graph_data = load_graph_json(args.input)

    nodes_count = len(graph_data.get("nodes", []))
    edges_count = len(graph_data.get("edges", []))
    print(f"Found {nodes_count} nodes and {edges_count} edges")

    # Generate output
    if args.format == "html":
        generate_html(graph_data, output_path, args.title)
    else:
        generate_pdf(graph_data, output_path, args.title)

    print("Done!")


if __name__ == "__main__":
    main()
