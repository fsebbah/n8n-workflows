import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

// Types for graph data
interface GraphNode {
	id: number;
	name: string;
	type: string;
	[key: string]: any;
}

interface GraphEdge {
	source: number;
	target: number;
	type: string;
	[key: string]: any;
}

interface GraphData {
	nodes: GraphNode[];
	edges: GraphEdge[];
}

function parseGraphJson(jsonInput: string | object): GraphData {
	let data: any;
	if (typeof jsonInput === 'string') {
		data = JSON.parse(jsonInput);
	} else {
		data = jsonInput;
	}

	if (data.graph) {
		return data.graph as GraphData;
	}
	if (data.nodes && data.edges) {
		return data as GraphData;
	}
	throw new Error('Invalid graph JSON structure. Expected "graph" or "nodes"/"edges" keys.');
}

function sanitizeUri(name: string): string {
	let sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '_');
	sanitized = sanitized.replace(/_+/g, '_');
	sanitized = sanitized.replace(/^_|_$/g, '');
	return sanitized || 'unknown';
}

function sanitizeCypherString(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

export class GraphExporter implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Graph Exporter',
		name: 'graphExporter',
		icon: 'file:graph-exporter.svg',
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["format"]}}',
		description: 'Export knowledge graphs to RDF, Cypher, GraphML, GEXF, and JSON-LD formats',
		defaults: {
			name: 'Graph Exporter',
		},
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName: 'Graph JSON',
				name: 'graphJson',
				type: 'json',
				default: '',
				required: true,
				description: 'The knowledge graph JSON to export',
			},
			{
				displayName: 'Export Format',
				name: 'format',
				type: 'options',
				options: [
					{
						name: 'RDF (Turtle)',
						value: 'rdf',
						description: 'Export as RDF Turtle format (.ttl)',
					},
					{
						name: 'Cypher (Neo4j)',
						value: 'cypher',
						description: 'Export as Cypher statements for Neo4j',
					},
					{
						name: 'Cypher Batch (Neo4j)',
						value: 'cypherBatch',
						description: 'Export as optimized batch Cypher using UNWIND',
					},
					{
						name: 'GraphML',
						value: 'graphml',
						description: 'Export as GraphML format (Gephi, yEd compatible)',
					},
					{
						name: 'GEXF',
						value: 'gexf',
						description: 'Export as GEXF format (Gephi native)',
					},
					{
						name: 'JSON-LD',
						value: 'jsonld',
						description: 'Export as JSON-LD linked data format',
					},
					{
						name: 'CSV (Nodes + Edges)',
						value: 'csv',
						description: 'Export as two CSV strings (nodes and edges)',
					},
					{
						name: 'DOT (Graphviz)',
						value: 'dot',
						description: 'Export as DOT format for Graphviz',
					},
				],
				default: 'cypher',
			},
			{
				displayName: 'Base URI',
				name: 'baseUri',
				type: 'string',
				default: 'http://example.org/kg/',
				description: 'Base URI for RDF and JSON-LD exports',
				displayOptions: {
					show: {
						format: ['rdf', 'jsonld'],
					},
				},
			},
			{
				displayName: 'Include Comments',
				name: 'includeComments',
				type: 'boolean',
				default: true,
				description: 'Whether to include comments and metadata in the output',
			},
			{
				displayName: 'Output As',
				name: 'outputAs',
				type: 'options',
				options: [
					{
						name: 'String',
						value: 'string',
						description: 'Return the export as a string in JSON',
					},
					{
						name: 'Binary File',
						value: 'binary',
						description: 'Return as a downloadable binary file',
					},
				],
				default: 'string',
			},
			{
				displayName: 'File Name',
				name: 'fileName',
				type: 'string',
				default: 'graph_export',
				description: 'Name of the output file (without extension)',
				displayOptions: {
					show: {
						outputAs: ['binary'],
					},
				},
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const graphJson = this.getNodeParameter('graphJson', i) as string | object;
				const format = this.getNodeParameter('format', i) as string;
				const includeComments = this.getNodeParameter('includeComments', i) as boolean;
				const outputAs = this.getNodeParameter('outputAs', i) as string;

				const graph = parseGraphJson(graphJson);

				let exportedContent: string;
				let fileExtension: string;
				let mimeType: string;

				switch (format) {
					case 'rdf': {
						const baseUri = this.getNodeParameter('baseUri', i) as string;
						exportedContent = exportToRdf(graph, baseUri, includeComments);
						fileExtension = '.ttl';
						mimeType = 'text/turtle';
						break;
					}
					case 'cypher': {
						exportedContent = exportToCypher(graph, includeComments);
						fileExtension = '.cypher';
						mimeType = 'application/x-cypher-query';
						break;
					}
					case 'cypherBatch': {
						exportedContent = exportToCypherBatch(graph, includeComments);
						fileExtension = '.cypher';
						mimeType = 'application/x-cypher-query';
						break;
					}
					case 'graphml': {
						exportedContent = exportToGraphML(graph);
						fileExtension = '.graphml';
						mimeType = 'application/graphml+xml';
						break;
					}
					case 'gexf': {
						exportedContent = exportToGexf(graph);
						fileExtension = '.gexf';
						mimeType = 'application/gexf+xml';
						break;
					}
					case 'jsonld': {
						const baseUri = this.getNodeParameter('baseUri', i) as string;
						exportedContent = exportToJsonLd(graph, baseUri);
						fileExtension = '.jsonld';
						mimeType = 'application/ld+json';
						break;
					}
					case 'csv': {
						exportedContent = exportToCsv(graph);
						fileExtension = '.csv';
						mimeType = 'text/csv';
						break;
					}
					case 'dot': {
						exportedContent = exportToDot(graph, includeComments);
						fileExtension = '.dot';
						mimeType = 'text/vnd.graphviz';
						break;
					}
					default:
						throw new NodeOperationError(this.getNode(), `Unknown format: ${format}`);
				}

				if (outputAs === 'binary') {
					const fileName = this.getNodeParameter('fileName', i) as string;
					const binaryData = await this.helpers.prepareBinaryData(
						Buffer.from(exportedContent, 'utf-8'),
						`${fileName}${fileExtension}`,
						mimeType
					);

					returnData.push({
						json: {
							format,
							nodeCount: graph.nodes.length,
							edgeCount: graph.edges.length,
							fileName: `${fileName}${fileExtension}`,
						},
						binary: {
							data: binaryData,
						},
						pairedItem: { item: i },
					});
				} else {
					returnData.push({
						json: {
							format,
							nodeCount: graph.nodes.length,
							edgeCount: graph.edges.length,
							content: exportedContent,
						},
						pairedItem: { item: i },
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
				} else {
					throw error;
				}
			}
		}

		return [returnData];
	}
}

// Export functions

function exportToRdf(graph: GraphData, baseUri: string, includeComments: boolean): string {
	const lines: string[] = [];
	const nodeMap: Map<number, { name: string; type: string; uriName: string }> = new Map();

	// Build node map
	for (const node of graph.nodes) {
		nodeMap.set(node.id, {
			name: node.name,
			type: node.type,
			uriName: sanitizeUri(node.name),
		});
	}

	// Collect unique types
	const entityTypes = new Set<string>();
	const relationTypes = new Set<string>();
	for (const node of graph.nodes) entityTypes.add(node.type);
	for (const edge of graph.edges) relationTypes.add(edge.type);

	// Prefixes
	lines.push('@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .');
	lines.push('@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .');
	lines.push('@prefix owl: <http://www.w3.org/2002/07/owl#> .');
	lines.push('@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .');
	lines.push(`@prefix kg: <${baseUri}> .`);
	lines.push(`@prefix entity: <${baseUri}entity/> .`);
	lines.push(`@prefix rel: <${baseUri}relation/> .`);
	lines.push('');

	if (includeComments) {
		lines.push(`<${baseUri}> a owl:Ontology ;`);
		lines.push('    rdfs:label "Knowledge Graph Export" ;');
		lines.push(`    rdfs:comment "Exported from n8n Graph Exporter" .`);
		lines.push('');
	}

	// Entity classes
	if (includeComments) lines.push('# Entity Classes');
	for (const etype of Array.from(entityTypes).sort()) {
		const classUri = sanitizeUri(etype.charAt(0).toUpperCase() + etype.slice(1));
		lines.push(`kg:${classUri} a owl:Class ;`);
		lines.push(`    rdfs:label "${etype}" .`);
	}
	lines.push('');

	// Relation properties
	if (includeComments) lines.push('# Relation Properties');
	for (const rtype of Array.from(relationTypes).sort()) {
		const propUri = sanitizeUri(rtype);
		lines.push(`rel:${propUri} a owl:ObjectProperty ;`);
		lines.push(`    rdfs:label "${rtype}" .`);
	}
	lines.push('');

	// Entities
	if (includeComments) lines.push('# Entity Instances');
	for (const node of graph.nodes) {
		const info = nodeMap.get(node.id)!;
		const entityUri = info.uriName;
		const entityType = sanitizeUri(info.type.charAt(0).toUpperCase() + info.type.slice(1));
		const entityName = info.name.replace(/"/g, '\\"');

		lines.push(`entity:${entityUri} a kg:${entityType} ;`);
		lines.push(`    rdfs:label "${entityName}" ;`);
		lines.push(`    kg:nodeId ${node.id} .`);
	}
	lines.push('');

	// Relationships
	if (includeComments) lines.push('# Relationships');
	for (const edge of graph.edges) {
		const sourceInfo = nodeMap.get(edge.source);
		const targetInfo = nodeMap.get(edge.target);
		if (sourceInfo && targetInfo) {
			const relProp = sanitizeUri(edge.type);
			lines.push(`entity:${sourceInfo.uriName} rel:${relProp} entity:${targetInfo.uriName} .`);
		}
	}

	return lines.join('\n');
}

function exportToCypher(graph: GraphData, includeComments: boolean): string {
	const lines: string[] = [];

	if (includeComments) {
		lines.push('// Knowledge Graph Import Script');
		lines.push(`// Nodes: ${graph.nodes.length}, Edges: ${graph.edges.length}`);
		lines.push('');
	}

	// Create constraints
	const entityTypes = new Set(graph.nodes.map(n => n.type));
	if (includeComments) lines.push('// Create constraints for better performance');
	for (const etype of Array.from(entityTypes).sort()) {
		const label = sanitizeUri(etype.charAt(0).toUpperCase() + etype.slice(1));
		lines.push(`CREATE CONSTRAINT IF NOT EXISTS FOR (n:${label}) REQUIRE n.id IS UNIQUE;`);
	}
	lines.push('');

	// Create nodes
	if (includeComments) lines.push('// Create nodes');
	for (const node of graph.nodes) {
		const nodeName = sanitizeCypherString(node.name);
		const nodeType = node.type;
		const label = sanitizeUri(nodeType.charAt(0).toUpperCase() + nodeType.slice(1));
		lines.push(`CREATE (n${node.id}:${label} {id: ${node.id}, name: '${nodeName}', type: '${nodeType}'});`);
	}
	lines.push('');

	// Create relationships
	if (includeComments) lines.push('// Create relationships');
	for (const edge of graph.edges) {
		const relLabel = sanitizeUri(edge.type).toUpperCase();
		lines.push(`MATCH (a {id: ${edge.source}}), (b {id: ${edge.target}}) CREATE (a)-[:${relLabel}]->(b);`);
	}

	return lines.join('\n');
}

function exportToCypherBatch(graph: GraphData, includeComments: boolean): string {
	const lines: string[] = [];

	if (includeComments) {
		lines.push('// Knowledge Graph Batch Import Script');
		lines.push(`// Nodes: ${graph.nodes.length}, Edges: ${graph.edges.length}`);
		lines.push('');
	}

	// Group nodes by type
	const nodesByType: Map<string, any[]> = new Map();
	for (const node of graph.nodes) {
		if (!nodesByType.has(node.type)) {
			nodesByType.set(node.type, []);
		}
		nodesByType.get(node.type)!.push({
			id: node.id,
			name: node.name,
			type: node.type,
		});
	}

	// Create constraints
	if (includeComments) lines.push('// Create constraints');
	for (const nodeType of Array.from(nodesByType.keys()).sort()) {
		const label = sanitizeUri(nodeType.charAt(0).toUpperCase() + nodeType.slice(1));
		lines.push(`CREATE CONSTRAINT IF NOT EXISTS FOR (n:${label}) REQUIRE n.id IS UNIQUE;`);
	}
	lines.push('');

	// Batch create nodes
	if (includeComments) lines.push('// Batch create nodes');
	for (const [nodeType, typeNodes] of nodesByType) {
		const label = sanitizeUri(nodeType.charAt(0).toUpperCase() + nodeType.slice(1));
		const nodesJson = JSON.stringify(typeNodes);
		lines.push(`UNWIND ${nodesJson} AS node`);
		lines.push(`CREATE (n:${label} {id: node.id, name: node.name, type: node.type});`);
		lines.push('');
	}

	// Group edges by type
	const edgesByType: Map<string, any[]> = new Map();
	for (const edge of graph.edges) {
		if (!edgesByType.has(edge.type)) {
			edgesByType.set(edge.type, []);
		}
		edgesByType.get(edge.type)!.push({
			source: edge.source,
			target: edge.target,
		});
	}

	// Batch create relationships
	if (includeComments) lines.push('// Batch create relationships');
	for (const [relType, typeEdges] of edgesByType) {
		const relLabel = sanitizeUri(relType).toUpperCase();
		const edgesJson = JSON.stringify(typeEdges);
		lines.push(`UNWIND ${edgesJson} AS rel`);
		lines.push(`MATCH (a {id: rel.source}), (b {id: rel.target})`);
		lines.push(`CREATE (a)-[:${relLabel}]->(b);`);
		lines.push('');
	}

	return lines.join('\n');
}

function exportToGraphML(graph: GraphData): string {
	const lines: string[] = [];

	lines.push('<?xml version="1.0" encoding="UTF-8"?>');
	lines.push('<graphml xmlns="http://graphml.graphdrawing.org/xmlns"');
	lines.push('         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
	lines.push('         xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns');
	lines.push('         http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">');
	lines.push('');
	lines.push('  <!-- Node attributes -->');
	lines.push('  <key id="name" for="node" attr.name="name" attr.type="string"/>');
	lines.push('  <key id="type" for="node" attr.name="type" attr.type="string"/>');
	lines.push('  <!-- Edge attributes -->');
	lines.push('  <key id="rel_type" for="edge" attr.name="type" attr.type="string"/>');
	lines.push('');
	lines.push('  <graph id="KnowledgeGraph" edgedefault="directed">');
	lines.push('');

	// Nodes
	lines.push('    <!-- Nodes -->');
	for (const node of graph.nodes) {
		const nodeName = escapeXml(node.name);
		lines.push(`    <node id="n${node.id}">`);
		lines.push(`      <data key="name">${nodeName}</data>`);
		lines.push(`      <data key="type">${node.type}</data>`);
		lines.push('    </node>');
	}
	lines.push('');

	// Edges
	lines.push('    <!-- Edges -->');
	for (let i = 0; i < graph.edges.length; i++) {
		const edge = graph.edges[i];
		lines.push(`    <edge id="e${i}" source="n${edge.source}" target="n${edge.target}">`);
		lines.push(`      <data key="rel_type">${edge.type}</data>`);
		lines.push('    </edge>');
	}

	lines.push('');
	lines.push('  </graph>');
	lines.push('</graphml>');

	return lines.join('\n');
}

function exportToGexf(graph: GraphData): string {
	const lines: string[] = [];
	const today = new Date().toISOString().split('T')[0];

	lines.push('<?xml version="1.0" encoding="UTF-8"?>');
	lines.push('<gexf xmlns="http://www.gexf.net/1.3"');
	lines.push('      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
	lines.push('      xsi:schemaLocation="http://www.gexf.net/1.3 http://www.gexf.net/1.3/gexf.xsd"');
	lines.push('      version="1.3">');
	lines.push('');
	lines.push(`  <meta lastmodifieddate="${today}">`);
	lines.push('    <creator>n8n Graph Exporter</creator>');
	lines.push('    <description>Knowledge Graph Export</description>');
	lines.push('  </meta>');
	lines.push('');
	lines.push('  <graph defaultedgetype="directed">');
	lines.push('');
	lines.push('    <attributes class="node">');
	lines.push('      <attribute id="0" title="type" type="string"/>');
	lines.push('    </attributes>');
	lines.push('');
	lines.push('    <attributes class="edge">');
	lines.push('      <attribute id="0" title="type" type="string"/>');
	lines.push('    </attributes>');
	lines.push('');

	// Nodes
	lines.push('    <nodes>');
	for (const node of graph.nodes) {
		const nodeName = escapeXml(node.name);
		lines.push(`      <node id="${node.id}" label="${nodeName}">`);
		lines.push('        <attvalues>');
		lines.push(`          <attvalue for="0" value="${node.type}"/>`);
		lines.push('        </attvalues>');
		lines.push('      </node>');
	}
	lines.push('    </nodes>');
	lines.push('');

	// Edges
	lines.push('    <edges>');
	for (let i = 0; i < graph.edges.length; i++) {
		const edge = graph.edges[i];
		lines.push(`      <edge id="${i}" source="${edge.source}" target="${edge.target}" label="${edge.type}">`);
		lines.push('        <attvalues>');
		lines.push(`          <attvalue for="0" value="${edge.type}"/>`);
		lines.push('        </attvalues>');
		lines.push('      </edge>');
	}
	lines.push('    </edges>');
	lines.push('');

	lines.push('  </graph>');
	lines.push('</gexf>');

	return lines.join('\n');
}

function exportToJsonLd(graph: GraphData, baseUri: string): string {
	const nodeMap = new Map<number, GraphNode>();
	for (const node of graph.nodes) {
		nodeMap.set(node.id, node);
	}

	const jsonld: any = {
		'@context': {
			'@base': baseUri,
			kg: baseUri,
			name: 'kg:name',
			type: '@type',
			id: '@id',
		},
		'@graph': [],
	};

	// Add nodes
	for (const node of graph.nodes) {
		const nodeObj: any = {
			'@id': `entity/${sanitizeUri(node.name)}`,
			'@type': `kg:${sanitizeUri(node.type.charAt(0).toUpperCase() + node.type.slice(1))}`,
			'kg:nodeId': node.id,
			name: node.name,
		};
		jsonld['@graph'].push(nodeObj);
	}

	// Add relationships to nodes
	for (const edge of graph.edges) {
		const sourceNode = nodeMap.get(edge.source);
		const targetNode = nodeMap.get(edge.target);

		if (sourceNode && targetNode) {
			for (const nodeObj of jsonld['@graph']) {
				if (nodeObj['kg:nodeId'] === edge.source) {
					const relKey = `kg:${sanitizeUri(edge.type)}`;
					if (!nodeObj[relKey]) {
						nodeObj[relKey] = [];
					}
					nodeObj[relKey].push({
						'@id': `entity/${sanitizeUri(targetNode.name)}`,
					});
					break;
				}
			}
		}
	}

	return JSON.stringify(jsonld, null, 2);
}

function exportToCsv(graph: GraphData): string {
	const lines: string[] = [];

	// Nodes CSV
	lines.push('=== NODES ===');
	lines.push('id,name,type');
	for (const node of graph.nodes) {
		const name = node.name.includes(',') || node.name.includes('"')
			? `"${node.name.replace(/"/g, '""')}"`
			: node.name;
		lines.push(`${node.id},${name},${node.type}`);
	}

	lines.push('');
	lines.push('=== EDGES ===');
	lines.push('source,target,type');
	for (const edge of graph.edges) {
		lines.push(`${edge.source},${edge.target},${edge.type}`);
	}

	return lines.join('\n');
}

function exportToDot(graph: GraphData, includeComments: boolean): string {
	const lines: string[] = [];

	lines.push('digraph KnowledgeGraph {');
	lines.push('  rankdir=LR;');
	lines.push('  node [shape=box, style=filled];');

	if (includeComments) {
		lines.push('');
		lines.push(`  // Nodes: ${graph.nodes.length}`);
		lines.push(`  // Edges: ${graph.edges.length}`);
	}
	lines.push('');

	// Define node colors by type
	const typeColors: Record<string, string> = {
		person: '#4CAF50',
		organization: '#2196F3',
		location: '#FF9800',
		event: '#9C27B0',
		concept: '#00BCD4',
		metric: '#F44336',
		default: '#9E9E9E',
	};

	// Nodes
	for (const node of graph.nodes) {
		const color = typeColors[node.type.toLowerCase()] || typeColors.default;
		const label = node.name.replace(/"/g, '\\"');
		lines.push(`  n${node.id} [label="${label}", fillcolor="${color}"];`);
	}
	lines.push('');

	// Edges
	for (const edge of graph.edges) {
		const label = edge.type.replace(/_/g, ' ');
		lines.push(`  n${edge.source} -> n${edge.target} [label="${label}"];`);
	}

	lines.push('}');

	return lines.join('\n');
}
