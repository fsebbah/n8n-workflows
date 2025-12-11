#!/usr/bin/env python3
"""
Knowledge Graph Exporter
Exports knowledge graph JSON to RDF (Turtle), Cypher (Neo4j), and other formats.

Usage:
    python graph_exporter.py <input.json> --format rdf|cypher|graphml|gexf [--output output_file]

Examples:
    python graph_exporter.py graph.json --format rdf
    python graph_exporter.py graph.json --format cypher --output import.cypher
    python graph_exporter.py graph.json --format graphml --output graph.graphml
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, List, Any
from datetime import datetime
import re


def sanitize_uri(name: str) -> str:
    """Sanitize a string to be used as a URI component."""
    # Replace spaces and special characters
    sanitized = re.sub(r'[^a-zA-Z0-9_-]', '_', name)
    # Remove consecutive underscores
    sanitized = re.sub(r'_+', '_', sanitized)
    # Remove leading/trailing underscores
    sanitized = sanitized.strip('_')
    return sanitized or 'unknown'


def sanitize_cypher_string(value: str) -> str:
    """Escape special characters for Cypher strings."""
    return value.replace('\\', '\\\\').replace("'", "\\'").replace('"', '\\"')


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


def export_to_rdf(graph_data: dict, output_path: str, base_uri: str = "http://example.org/kg/"):
    """
    Export graph to RDF Turtle format.

    Args:
        graph_data: Dictionary with 'nodes' and 'edges'
        output_path: Path to output .ttl file
        base_uri: Base URI for the ontology
    """
    nodes = graph_data.get("nodes", [])
    edges = graph_data.get("edges", [])

    # Build node ID to info mapping
    node_map = {}
    for node in nodes:
        node_map[node.get("id")] = {
            "name": node.get("name", f"Node_{node.get('id')}"),
            "type": node.get("type", "Entity"),
            "uri_name": sanitize_uri(node.get("name", f"Node_{node.get('id')}"))
        }

    # Collect unique types for ontology
    entity_types = set()
    relation_types = set()

    for node in nodes:
        entity_types.add(node.get("type", "Entity"))
    for edge in edges:
        relation_types.add(edge.get("type", "related_to"))

    lines = []

    # Prefixes
    lines.append("@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .")
    lines.append("@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .")
    lines.append("@prefix owl: <http://www.w3.org/2002/07/owl#> .")
    lines.append("@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .")
    lines.append(f"@prefix kg: <{base_uri}> .")
    lines.append(f"@prefix entity: <{base_uri}entity/> .")
    lines.append(f"@prefix rel: <{base_uri}relation/> .")
    lines.append("")

    # Ontology header
    lines.append(f"<{base_uri}> a owl:Ontology ;")
    lines.append(f'    rdfs:label "Knowledge Graph Export" ;')
    lines.append(f'    rdfs:comment "Exported from n8n Knowledge Graph node on {datetime.now().isoformat()}" .')
    lines.append("")

    # Define entity classes
    lines.append("# Entity Classes")
    for etype in sorted(entity_types):
        class_uri = sanitize_uri(etype.capitalize())
        lines.append(f"kg:{class_uri} a owl:Class ;")
        lines.append(f'    rdfs:label "{etype}" .')
    lines.append("")

    # Define relation properties
    lines.append("# Relation Properties")
    for rtype in sorted(relation_types):
        prop_uri = sanitize_uri(rtype)
        lines.append(f"rel:{prop_uri} a owl:ObjectProperty ;")
        lines.append(f'    rdfs:label "{rtype}" .')
    lines.append("")

    # Entity instances
    lines.append("# Entity Instances")
    for node in nodes:
        node_id = node.get("id")
        info = node_map[node_id]
        entity_uri = info["uri_name"]
        entity_type = sanitize_uri(info["type"].capitalize())
        entity_name = info["name"].replace('"', '\\"')

        lines.append(f"entity:{entity_uri} a kg:{entity_type} ;")
        lines.append(f'    rdfs:label "{entity_name}" ;')
        lines.append(f'    kg:nodeId {node_id} .')
    lines.append("")

    # Relationships
    lines.append("# Relationships")
    for edge in edges:
        source_id = edge.get("source")
        target_id = edge.get("target")
        rel_type = edge.get("type", "related_to")

        if source_id in node_map and target_id in node_map:
            source_uri = node_map[source_id]["uri_name"]
            target_uri = node_map[target_id]["uri_name"]
            rel_prop = sanitize_uri(rel_type)

            lines.append(f"entity:{source_uri} rel:{rel_prop} entity:{target_uri} .")

    # Write output
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print(f"RDF (Turtle) exported: {output_path}")
    print(f"  - {len(nodes)} entities")
    print(f"  - {len(edges)} relationships")
    print(f"  - {len(entity_types)} entity types")
    print(f"  - {len(relation_types)} relation types")
    return output_path


def export_to_cypher(graph_data: dict, output_path: str):
    """
    Export graph to Cypher format for Neo4j import.

    Args:
        graph_data: Dictionary with 'nodes' and 'edges'
        output_path: Path to output .cypher file
    """
    nodes = graph_data.get("nodes", [])
    edges = graph_data.get("edges", [])

    lines = []

    # Header
    lines.append("// Knowledge Graph Import Script")
    lines.append(f"// Generated on {datetime.now().isoformat()}")
    lines.append(f"// Nodes: {len(nodes)}, Edges: {len(edges)}")
    lines.append("")

    # Create constraints (optional, for performance)
    lines.append("// Create constraints for better performance")
    entity_types = set(node.get("type", "Entity") for node in nodes)
    for etype in sorted(entity_types):
        label = sanitize_uri(etype.capitalize())
        lines.append(f"CREATE CONSTRAINT IF NOT EXISTS FOR (n:{label}) REQUIRE n.id IS UNIQUE;")
    lines.append("")

    # Create nodes
    lines.append("// Create nodes")
    for node in nodes:
        node_id = node.get("id")
        node_name = sanitize_cypher_string(node.get("name", f"Node_{node_id}"))
        node_type = node.get("type", "Entity")
        label = sanitize_uri(node_type.capitalize())

        lines.append(f"CREATE (n{node_id}:{label} {{id: {node_id}, name: '{node_name}', type: '{node_type}'}});")
    lines.append("")

    # Create relationships
    lines.append("// Create relationships")
    for i, edge in enumerate(edges):
        source_id = edge.get("source")
        target_id = edge.get("target")
        rel_type = edge.get("type", "RELATED_TO")

        # Convert relation type to Neo4j format (uppercase, underscores)
        rel_label = sanitize_uri(rel_type).upper()

        lines.append(f"MATCH (a {{id: {source_id}}}), (b {{id: {target_id}}}) CREATE (a)-[:{rel_label}]->(b);")

    # Write output
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print(f"Cypher exported: {output_path}")
    print(f"  - {len(nodes)} CREATE node statements")
    print(f"  - {len(edges)} CREATE relationship statements")
    return output_path


def export_to_cypher_batch(graph_data: dict, output_path: str):
    """
    Export graph to optimized Cypher format using UNWIND for batch import.
    Better for large graphs in Neo4j.
    """
    nodes = graph_data.get("nodes", [])
    edges = graph_data.get("edges", [])

    lines = []

    # Header
    lines.append("// Knowledge Graph Batch Import Script")
    lines.append(f"// Generated on {datetime.now().isoformat()}")
    lines.append(f"// Nodes: {len(nodes)}, Edges: {len(edges)}")
    lines.append("")

    # Create constraints
    lines.append("// Create constraints")
    entity_types = set(node.get("type", "Entity") for node in nodes)
    for etype in sorted(entity_types):
        label = sanitize_uri(etype.capitalize())
        lines.append(f"CREATE CONSTRAINT IF NOT EXISTS FOR (n:{label}) REQUIRE n.id IS UNIQUE;")
    lines.append("")

    # Batch create nodes by type
    lines.append("// Batch create nodes")
    nodes_by_type: Dict[str, List[dict]] = {}
    for node in nodes:
        node_type = node.get("type", "Entity")
        if node_type not in nodes_by_type:
            nodes_by_type[node_type] = []
        nodes_by_type[node_type].append({
            "id": node.get("id"),
            "name": node.get("name", f"Node_{node.get('id')}"),
            "type": node_type
        })

    for node_type, type_nodes in nodes_by_type.items():
        label = sanitize_uri(node_type.capitalize())
        nodes_json = json.dumps(type_nodes, ensure_ascii=False)
        lines.append(f"UNWIND {nodes_json} AS node")
        lines.append(f"CREATE (n:{label} {{id: node.id, name: node.name, type: node.type}});")
        lines.append("")

    # Batch create relationships by type
    lines.append("// Batch create relationships")
    edges_by_type: Dict[str, List[dict]] = {}
    for edge in edges:
        rel_type = edge.get("type", "related_to")
        if rel_type not in edges_by_type:
            edges_by_type[rel_type] = []
        edges_by_type[rel_type].append({
            "source": edge.get("source"),
            "target": edge.get("target")
        })

    for rel_type, type_edges in edges_by_type.items():
        rel_label = sanitize_uri(rel_type).upper()
        edges_json = json.dumps(type_edges, ensure_ascii=False)
        lines.append(f"UNWIND {edges_json} AS rel")
        lines.append(f"MATCH (a {{id: rel.source}}), (b {{id: rel.target}})")
        lines.append(f"CREATE (a)-[:{rel_label}]->(b);")
        lines.append("")

    # Write output
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print(f"Cypher (batch) exported: {output_path}")
    print(f"  - {len(nodes)} nodes in {len(nodes_by_type)} type batches")
    print(f"  - {len(edges)} relationships in {len(edges_by_type)} type batches")
    return output_path


def export_to_graphml(graph_data: dict, output_path: str):
    """
    Export graph to GraphML format.
    GraphML is supported by many graph tools including Gephi, yEd, NetworkX.
    """
    nodes = graph_data.get("nodes", [])
    edges = graph_data.get("edges", [])

    lines = []

    # XML header
    lines.append('<?xml version="1.0" encoding="UTF-8"?>')
    lines.append('<graphml xmlns="http://graphml.graphdrawing.org/xmlns"')
    lines.append('         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"')
    lines.append('         xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns')
    lines.append('         http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">')
    lines.append('')

    # Define attributes
    lines.append('  <!-- Node attributes -->')
    lines.append('  <key id="name" for="node" attr.name="name" attr.type="string"/>')
    lines.append('  <key id="type" for="node" attr.name="type" attr.type="string"/>')
    lines.append('  <!-- Edge attributes -->')
    lines.append('  <key id="rel_type" for="edge" attr.name="type" attr.type="string"/>')
    lines.append('')

    # Graph
    lines.append('  <graph id="KnowledgeGraph" edgedefault="directed">')
    lines.append('')

    # Nodes
    lines.append('    <!-- Nodes -->')
    for node in nodes:
        node_id = node.get("id")
        node_name = node.get("name", f"Node_{node_id}").replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')
        node_type = node.get("type", "Entity")

        lines.append(f'    <node id="n{node_id}">')
        lines.append(f'      <data key="name">{node_name}</data>')
        lines.append(f'      <data key="type">{node_type}</data>')
        lines.append('    </node>')
    lines.append('')

    # Edges
    lines.append('    <!-- Edges -->')
    for i, edge in enumerate(edges):
        source_id = edge.get("source")
        target_id = edge.get("target")
        rel_type = edge.get("type", "related_to")

        lines.append(f'    <edge id="e{i}" source="n{source_id}" target="n{target_id}">')
        lines.append(f'      <data key="rel_type">{rel_type}</data>')
        lines.append('    </edge>')

    lines.append('')
    lines.append('  </graph>')
    lines.append('</graphml>')

    # Write output
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print(f"GraphML exported: {output_path}")
    print(f"  - {len(nodes)} nodes")
    print(f"  - {len(edges)} edges")
    return output_path


def export_to_gexf(graph_data: dict, output_path: str):
    """
    Export graph to GEXF format (Gephi Exchange Format).
    Native format for Gephi with support for dynamic graphs.
    """
    nodes = graph_data.get("nodes", [])
    edges = graph_data.get("edges", [])

    lines = []

    # XML header
    lines.append('<?xml version="1.0" encoding="UTF-8"?>')
    lines.append('<gexf xmlns="http://www.gexf.net/1.3"')
    lines.append('      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"')
    lines.append('      xsi:schemaLocation="http://www.gexf.net/1.3 http://www.gexf.net/1.3/gexf.xsd"')
    lines.append('      version="1.3">')
    lines.append('')

    # Meta
    lines.append('  <meta lastmodifieddate="' + datetime.now().strftime('%Y-%m-%d') + '">')
    lines.append('    <creator>n8n Knowledge Graph Exporter</creator>')
    lines.append('    <description>Knowledge Graph Export</description>')
    lines.append('  </meta>')
    lines.append('')

    # Graph
    lines.append('  <graph defaultedgetype="directed">')
    lines.append('')

    # Node attributes
    lines.append('    <attributes class="node">')
    lines.append('      <attribute id="0" title="type" type="string"/>')
    lines.append('    </attributes>')
    lines.append('')

    # Edge attributes
    lines.append('    <attributes class="edge">')
    lines.append('      <attribute id="0" title="type" type="string"/>')
    lines.append('    </attributes>')
    lines.append('')

    # Nodes
    lines.append('    <nodes>')
    for node in nodes:
        node_id = node.get("id")
        node_name = node.get("name", f"Node_{node_id}").replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')
        node_type = node.get("type", "Entity")

        lines.append(f'      <node id="{node_id}" label="{node_name}">')
        lines.append('        <attvalues>')
        lines.append(f'          <attvalue for="0" value="{node_type}"/>')
        lines.append('        </attvalues>')
        lines.append('      </node>')
    lines.append('    </nodes>')
    lines.append('')

    # Edges
    lines.append('    <edges>')
    for i, edge in enumerate(edges):
        source_id = edge.get("source")
        target_id = edge.get("target")
        rel_type = edge.get("type", "related_to")

        lines.append(f'      <edge id="{i}" source="{source_id}" target="{target_id}" label="{rel_type}">')
        lines.append('        <attvalues>')
        lines.append(f'          <attvalue for="0" value="{rel_type}"/>')
        lines.append('        </attvalues>')
        lines.append('      </edge>')
    lines.append('    </edges>')
    lines.append('')

    lines.append('  </graph>')
    lines.append('</gexf>')

    # Write output
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print(f"GEXF exported: {output_path}")
    print(f"  - {len(nodes)} nodes")
    print(f"  - {len(edges)} edges")
    return output_path


def export_to_json_ld(graph_data: dict, output_path: str, base_uri: str = "http://example.org/kg/"):
    """
    Export graph to JSON-LD format.
    JSON-LD is a JSON-based format for linked data.
    """
    nodes = graph_data.get("nodes", [])
    edges = graph_data.get("edges", [])

    # Build node map
    node_map = {node.get("id"): node for node in nodes}

    # Create JSON-LD document
    jsonld = {
        "@context": {
            "@base": base_uri,
            "kg": base_uri,
            "name": "kg:name",
            "type": "@type",
            "id": "@id"
        },
        "@graph": []
    }

    # Add nodes
    for node in nodes:
        node_id = node.get("id")
        node_name = node.get("name", f"Node_{node_id}")
        node_type = node.get("type", "Entity")

        node_obj = {
            "@id": f"entity/{sanitize_uri(node_name)}",
            "@type": f"kg:{sanitize_uri(node_type.capitalize())}",
            "kg:nodeId": node_id,
            "name": node_name
        }
        jsonld["@graph"].append(node_obj)

    # Add relationships to nodes
    for edge in edges:
        source_id = edge.get("source")
        target_id = edge.get("target")
        rel_type = edge.get("type", "related_to")

        if source_id in node_map and target_id in node_map:
            source_name = node_map[source_id].get("name", f"Node_{source_id}")
            target_name = node_map[target_id].get("name", f"Node_{target_id}")

            # Find source node and add relationship
            for node_obj in jsonld["@graph"]:
                if node_obj.get("kg:nodeId") == source_id:
                    rel_key = f"kg:{sanitize_uri(rel_type)}"
                    if rel_key not in node_obj:
                        node_obj[rel_key] = []
                    node_obj[rel_key].append({
                        "@id": f"entity/{sanitize_uri(target_name)}"
                    })
                    break

    # Write output
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(jsonld, f, indent=2, ensure_ascii=False)

    print(f"JSON-LD exported: {output_path}")
    print(f"  - {len(nodes)} entities")
    print(f"  - {len(edges)} relationships")
    return output_path


def main():
    parser = argparse.ArgumentParser(
        description="Export Knowledge Graph to various formats",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument("input", help="Input JSON file from Knowledge Graph workflow")
    parser.add_argument("-f", "--format",
                        choices=["rdf", "cypher", "cypher-batch", "graphml", "gexf", "jsonld"],
                        default="cypher",
                        help="Output format (default: cypher)")
    parser.add_argument("-o", "--output", help="Output file path")
    parser.add_argument("--base-uri", default="http://example.org/kg/",
                        help="Base URI for RDF/JSON-LD export (default: http://example.org/kg/)")

    args = parser.parse_args()

    # Validate input
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: Input file not found: {args.input}")
        sys.exit(1)

    # Determine output path and extension
    format_extensions = {
        "rdf": ".ttl",
        "cypher": ".cypher",
        "cypher-batch": ".cypher",
        "graphml": ".graphml",
        "gexf": ".gexf",
        "jsonld": ".jsonld"
    }

    if args.output:
        output_path = args.output
    else:
        output_path = str(input_path.with_suffix(format_extensions[args.format]))

    # Load graph data
    print(f"Loading graph from: {args.input}")
    graph_data = load_graph_json(args.input)

    nodes_count = len(graph_data.get("nodes", []))
    edges_count = len(graph_data.get("edges", []))
    print(f"Found {nodes_count} nodes and {edges_count} edges")
    print("")

    # Export based on format
    if args.format == "rdf":
        export_to_rdf(graph_data, output_path, args.base_uri)
    elif args.format == "cypher":
        export_to_cypher(graph_data, output_path)
    elif args.format == "cypher-batch":
        export_to_cypher_batch(graph_data, output_path)
    elif args.format == "graphml":
        export_to_graphml(graph_data, output_path)
    elif args.format == "gexf":
        export_to_gexf(graph_data, output_path)
    elif args.format == "jsonld":
        export_to_json_ld(graph_data, output_path, args.base_uri)

    print("\nDone!")


if __name__ == "__main__":
    main()
