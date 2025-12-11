#!/usr/bin/env python3
"""
Test script for Knowledge Graph n8n workflow.

Usage:
    python scripts/test/test_knowledge_graph.py <document_path_or_url> [options]

Examples:
    # Basic extraction with local file
    python scripts/test/test_knowledge_graph.py /path/to/document.pdf

    # From URL with business preset
    python scripts/test/test_knowledge_graph.py "https://example.com/report.pdf" -p business

    # With simplification and analysis
    python scripts/test/test_knowledge_graph.py document.pdf --simplify --analyze -l fr

    # Custom configuration
    python scripts/test/test_knowledge_graph.py document.pdf --config-mode jsonConfig --config '{"entityTypes": ["product", "feature"]}'
"""

import argparse
import base64
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
import requests


def load_document_as_base64(file_path: str) -> tuple[str, str]:
    """Load a local document and return base64 data with mime type."""
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    # Determine mime type from extension
    mime_types = {
        '.pdf': 'application/pdf',
        '.txt': 'text/plain',
        '.html': 'text/html',
        '.htm': 'text/html',
        '.csv': 'text/csv',
        '.md': 'text/markdown',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.doc': 'application/msword',
    }

    mime_type = mime_types.get(path.suffix.lower(), 'application/octet-stream')

    with open(path, 'rb') as f:
        data = base64.b64encode(f.read()).decode('utf-8')

    return data, mime_type


def is_url(path: str) -> bool:
    """Check if the path is a URL."""
    return path.startswith('http://') or path.startswith('https://')


def call_knowledge_graph_api(
    document_path: str = None,
    document_url: str = None,
    document_base64: str = None,
    document_mime_type: str = None,
    config_mode: str = 'preset',
    preset: str = 'business',
    config_json: dict = None,
    simplify: bool = False,
    analyze: bool = False,
    max_nodes: int = 30,
    analysis_language: str = 'en',
    webhook_url: str = 'http://localhost:5678/webhook/knowledge-graph'
) -> dict:
    """Call the knowledge graph n8n webhook."""

    payload = {
        'configMode': config_mode,
        'preset': preset,
        'simplify': simplify,
        'analyze': analyze,
        'maxNodes': max_nodes,
        'analysisLanguage': analysis_language
    }

    # Add document source
    if document_path:
        payload['documentPath'] = document_path
    elif document_url:
        payload['documentUrl'] = document_url
    elif document_base64:
        payload['document'] = {
            'data': document_base64,
            'mimeType': document_mime_type or 'application/pdf'
        }

    # Add custom config if provided
    if config_json:
        payload['configJson'] = config_json

    print(f"Calling {webhook_url}...")
    print(f"Config mode: {config_mode}")
    print(f"Preset: {preset}")
    print(f"Simplify: {simplify}, Analyze: {analyze}")
    if simplify:
        print(f"Max nodes: {max_nodes}")
    if analyze:
        print(f"Analysis language: {analysis_language}")
    print()

    response = requests.post(
        webhook_url,
        json=payload,
        headers={'Content-Type': 'application/json'},
        timeout=600  # 10 minutes timeout
    )

    response.raise_for_status()
    return response.json()


def save_result(result: dict, output_file: str):
    """Save result to JSON file."""
    # Create directory if needed
    output_path = Path(output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(f"Result saved to: {output_file}")


def format_graph_summary(result: dict) -> str:
    """Format graph result for display."""
    lines = []

    # Main graph stats
    if 'graph' in result:
        graph = result['graph']
        nodes = graph.get('nodes', [])
        edges = graph.get('edges', [])

        lines.append("=== KNOWLEDGE GRAPH ===\n")
        lines.append(f"Nodes: {len(nodes)}")
        lines.append(f"Edges: {len(edges)}")

        # Count by type
        if nodes:
            type_counts = {}
            for node in nodes:
                node_type = node.get('type', 'unknown')
                type_counts[node_type] = type_counts.get(node_type, 0) + 1

            lines.append("\nEntity types:")
            for t, count in sorted(type_counts.items(), key=lambda x: -x[1]):
                lines.append(f"  {t}: {count}")

        # Sample nodes
        if nodes:
            lines.append("\nSample entities (first 10):")
            for node in nodes[:10]:
                lines.append(f"  - {node.get('name', 'N/A')} ({node.get('type', 'N/A')})")

    # Metadata
    if 'metadata' in result:
        meta = result['metadata']
        lines.append(f"\nLanguage detected: {meta.get('language_detected', 'N/A')}")

    # Simplified graph
    if 'simplified' in result:
        simp = result['simplified']
        simp_graph = simp.get('graph', {})
        simp_meta = simp.get('metadata', {})

        lines.append("\n=== SIMPLIFIED GRAPH ===\n")
        lines.append(f"Original: {simp_meta.get('original_node_count', 'N/A')} nodes, {simp_meta.get('original_edge_count', 'N/A')} edges")
        lines.append(f"Simplified: {simp_meta.get('simplified_node_count', 'N/A')} nodes, {simp_meta.get('simplified_edge_count', 'N/A')} edges")

        # Key entities
        if 'key_entities' in simp:
            lines.append("\nKey entities:")
            for entity in simp['key_entities'][:10]:
                lines.append(f"  - {entity.get('name', 'N/A')}: {entity.get('importance', 'N/A')}")

    # Analysis
    if 'analysis' in result:
        analysis = result['analysis']

        lines.append("\n=== ANALYSIS ===\n")

        if 'summary' in analysis:
            lines.append(f"Summary: {analysis['summary'][:500]}...")

        if 'key_findings' in analysis:
            lines.append("\nKey findings:")
            for finding in analysis['key_findings'][:5]:
                lines.append(f"  - {finding}")

        if 'clusters' in analysis:
            lines.append(f"\nClusters identified: {len(analysis['clusters'])}")
            for cluster in analysis['clusters'][:3]:
                lines.append(f"  - {cluster.get('name', 'N/A')}: {cluster.get('description', 'N/A')[:100]}")

        if 'insights' in analysis:
            lines.append("\nInsights:")
            for insight in analysis['insights'][:3]:
                lines.append(f"  - {insight}")

    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(
        description='Test Knowledge Graph n8n workflow',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )

    parser.add_argument(
        'document',
        help='Document path (local file) or URL'
    )

    # Configuration mode
    parser.add_argument(
        '-m', '--config-mode',
        choices=['preset', 'custom', 'jsonConfig'],
        default='preset',
        help='Configuration mode (default: preset)'
    )

    parser.add_argument(
        '-p', '--preset',
        choices=['narrative', 'business', 'technical', 'scientific', 'legal'],
        default='business',
        help='Preset to use (default: business)'
    )

    parser.add_argument(
        '--config',
        dest='config_json',
        help='Custom JSON config (for jsonConfig mode)'
    )

    # Processing options
    parser.add_argument(
        '-s', '--simplify',
        action='store_true',
        help='Simplify the graph to key entities'
    )

    parser.add_argument(
        '-a', '--analyze',
        action='store_true',
        help='Generate detailed analysis of the graph'
    )

    parser.add_argument(
        '--max-nodes',
        type=int,
        default=30,
        help='Maximum nodes for simplification (default: 30)'
    )

    parser.add_argument(
        '-l', '--language',
        choices=['en', 'fr', 'es', 'de'],
        default='en',
        help='Analysis language (default: en)'
    )

    # Output options
    parser.add_argument(
        '-f', '--file',
        dest='output_file',
        help='Output file path (default: auto-generated)'
    )

    parser.add_argument(
        '-w', '--webhook',
        default='http://localhost:5678/webhook/knowledge-graph',
        help='Webhook URL (default: http://localhost:5678/webhook/knowledge-graph)'
    )

    parser.add_argument(
        '-q', '--quiet',
        action='store_true',
        help='Only output JSON, no formatting'
    )

    parser.add_argument(
        '--base64',
        action='store_true',
        help='Send document as base64 instead of path/URL'
    )

    args = parser.parse_args()

    # Determine document source
    document_path = None
    document_url = None
    document_base64 = None
    document_mime_type = None
    doc_name = 'document'

    if is_url(args.document):
        if args.base64:
            print("Error: --base64 cannot be used with URLs", file=sys.stderr)
            sys.exit(1)
        document_url = args.document
        doc_name = args.document.split('/')[-1].split('?')[0]
        print(f"Document URL: {args.document}")
    else:
        # Local file
        if not os.path.exists(args.document):
            print(f"Error: File not found: {args.document}", file=sys.stderr)
            sys.exit(1)

        doc_name = Path(args.document).stem

        if args.base64:
            print(f"Loading document as base64: {args.document}")
            document_base64, document_mime_type = load_document_as_base64(args.document)
            print(f"Mime type: {document_mime_type}")
            print(f"Size: {len(document_base64)} bytes (base64)")
        else:
            document_path = os.path.abspath(args.document)
            print(f"Document path: {document_path}")

    print(f"Preset: {args.preset}")
    print()

    # Parse custom config if provided
    config_json = None
    if args.config_json:
        try:
            config_json = json.loads(args.config_json)
        except json.JSONDecodeError as e:
            print(f"Error: Invalid JSON config: {e}", file=sys.stderr)
            sys.exit(1)

    try:
        # Call the API with timing
        start_time = time.time()
        result = call_knowledge_graph_api(
            document_path=document_path,
            document_url=document_url,
            document_base64=document_base64,
            document_mime_type=document_mime_type,
            config_mode=args.config_mode,
            preset=args.preset,
            config_json=config_json,
            simplify=args.simplify,
            analyze=args.analyze,
            max_nodes=args.max_nodes,
            analysis_language=args.language,
            webhook_url=args.webhook
        )
        elapsed_time = time.time() - start_time

        # Add execution time to result
        result['_execution'] = {
            'elapsed_seconds': round(elapsed_time, 2),
            'elapsed_formatted': f"{int(elapsed_time // 60)}m {int(elapsed_time % 60)}s",
            'timestamp': datetime.now().isoformat(),
            'preset': args.preset,
            'simplify': args.simplify,
            'analyze': args.analyze
        }

        # Generate output filename if not provided
        if not args.output_file:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            suffix = f"_{args.preset}"
            if args.simplify:
                suffix += "_simplified"
            if args.analyze:
                suffix += "_analyzed"
            args.output_file = f"graph_{doc_name}{suffix}_{timestamp}.json"

        # Save result
        save_result(result, args.output_file)

        # Display formatted result
        if not args.quiet:
            print()
            print(format_graph_summary(result))
        else:
            print(json.dumps(result, indent=2, ensure_ascii=False))

        print(f"\n⏱️  Execution time: {result['_execution']['elapsed_formatted']} ({elapsed_time:.2f}s)")
        print(f"Success! Result saved to: {args.output_file}")

    except requests.exceptions.ConnectionError:
        print("Error: Cannot connect to n8n webhook. Is the server running?", file=sys.stderr)
        print(f"Webhook URL: {args.webhook}", file=sys.stderr)
        sys.exit(1)
    except requests.exceptions.Timeout:
        print("Error: Request timeout. Document processing may take longer.", file=sys.stderr)
        sys.exit(1)
    except requests.exceptions.HTTPError as e:
        print(f"Error: HTTP {e.response.status_code}", file=sys.stderr)
        try:
            error_detail = e.response.json()
            print(json.dumps(error_detail, indent=2), file=sys.stderr)
        except:
            print(e.response.text, file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
