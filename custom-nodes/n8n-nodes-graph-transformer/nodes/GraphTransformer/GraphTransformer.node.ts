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

	// Handle nested graph structure
	if (data.graph) {
		return data.graph as GraphData;
	}
	if (data.nodes && data.edges) {
		return data as GraphData;
	}
	throw new Error('Invalid graph JSON structure. Expected "graph" or "nodes"/"edges" keys.');
}

export class GraphTransformer implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Graph Transformer',
		name: 'graphTransformer',
		icon: 'file:graph-transformer.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Transform, merge, filter and manipulate knowledge graphs',
		defaults: {
			name: 'Graph Transformer',
		},
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Merge Graphs',
						value: 'merge',
						description: 'Merge multiple graphs into one',
						action: 'Merge multiple graphs',
					},
					{
						name: 'Filter Nodes',
						value: 'filterNodes',
						description: 'Filter nodes by type or property',
						action: 'Filter nodes from graph',
					},
					{
						name: 'Filter Edges',
						value: 'filterEdges',
						description: 'Filter edges by type or property',
						action: 'Filter edges from graph',
					},
					{
						name: 'Rename Types',
						value: 'renameTypes',
						description: 'Rename node or edge types',
						action: 'Rename types in graph',
					},
					{
						name: 'Add Properties',
						value: 'addProperties',
						description: 'Add computed properties to nodes or edges',
						action: 'Add properties to graph elements',
					},
					{
						name: 'Remove Duplicates',
						value: 'deduplicate',
						description: 'Remove duplicate nodes and edges',
						action: 'Remove duplicates from graph',
					},
					{
						name: 'Extract Subgraph',
						value: 'extractSubgraph',
						description: 'Extract a subgraph around specific nodes',
						action: 'Extract subgraph',
					},
					{
						name: 'Compute Statistics',
						value: 'statistics',
						description: 'Compute graph statistics (degree, centrality, etc.)',
						action: 'Compute graph statistics',
					},
				],
				default: 'merge',
			},
			// Graph JSON input (for single graph operations)
			{
				displayName: 'Graph JSON',
				name: 'graphJson',
				type: 'json',
				default: '',
				description: 'The knowledge graph JSON to transform',
				displayOptions: {
					show: {
						operation: ['filterNodes', 'filterEdges', 'renameTypes', 'addProperties', 'deduplicate', 'extractSubgraph', 'statistics'],
					},
				},
			},
			// Merge operation parameters
			{
				displayName: 'Merge Mode',
				name: 'mergeMode',
				type: 'options',
				options: [
					{
						name: 'From Items',
						value: 'fromItems',
						description: 'Merge graphs from input items (each item has a graph)',
					},
					{
						name: 'Two Graphs',
						value: 'twoGraphs',
						description: 'Merge two specific graphs',
					},
				],
				default: 'fromItems',
				displayOptions: {
					show: {
						operation: ['merge'],
					},
				},
			},
			{
				displayName: 'Graph 1 JSON',
				name: 'graph1Json',
				type: 'json',
				default: '',
				description: 'First graph to merge',
				displayOptions: {
					show: {
						operation: ['merge'],
						mergeMode: ['twoGraphs'],
					},
				},
			},
			{
				displayName: 'Graph 2 JSON',
				name: 'graph2Json',
				type: 'json',
				default: '',
				description: 'Second graph to merge',
				displayOptions: {
					show: {
						operation: ['merge'],
						mergeMode: ['twoGraphs'],
					},
				},
			},
			{
				displayName: 'Graph Property Name',
				name: 'graphPropertyName',
				type: 'string',
				default: 'graph',
				description: 'Property name containing the graph in each input item',
				displayOptions: {
					show: {
						operation: ['merge'],
						mergeMode: ['fromItems'],
					},
				},
			},
			{
				displayName: 'Deduplication Strategy',
				name: 'deduplicationStrategy',
				type: 'options',
				options: [
					{
						name: 'By Name',
						value: 'byName',
						description: 'Merge nodes with the same name',
					},
					{
						name: 'By Name and Type',
						value: 'byNameAndType',
						description: 'Merge nodes with the same name and type',
					},
					{
						name: 'Keep All',
						value: 'keepAll',
						description: 'Keep all nodes (reassign IDs)',
					},
				],
				default: 'byNameAndType',
				displayOptions: {
					show: {
						operation: ['merge', 'deduplicate'],
					},
				},
			},
			// Filter parameters
			{
				displayName: 'Filter Mode',
				name: 'filterMode',
				type: 'options',
				options: [
					{
						name: 'Include',
						value: 'include',
						description: 'Keep only matching elements',
					},
					{
						name: 'Exclude',
						value: 'exclude',
						description: 'Remove matching elements',
					},
				],
				default: 'include',
				displayOptions: {
					show: {
						operation: ['filterNodes', 'filterEdges'],
					},
				},
			},
			{
				displayName: 'Filter By',
				name: 'filterBy',
				type: 'options',
				options: [
					{
						name: 'Type',
						value: 'type',
						description: 'Filter by element type',
					},
					{
						name: 'Property',
						value: 'property',
						description: 'Filter by property value',
					},
					{
						name: 'Expression',
						value: 'expression',
						description: 'Filter using a JavaScript expression',
					},
				],
				default: 'type',
				displayOptions: {
					show: {
						operation: ['filterNodes', 'filterEdges'],
					},
				},
			},
			{
				displayName: 'Types',
				name: 'filterTypes',
				type: 'string',
				default: '',
				placeholder: 'person, organization',
				description: 'Comma-separated list of types to filter',
				displayOptions: {
					show: {
						operation: ['filterNodes', 'filterEdges'],
						filterBy: ['type'],
					},
				},
			},
			{
				displayName: 'Property Name',
				name: 'filterPropertyName',
				type: 'string',
				default: '',
				placeholder: 'e.g., importance',
				displayOptions: {
					show: {
						operation: ['filterNodes', 'filterEdges'],
						filterBy: ['property'],
					},
				},
			},
			{
				displayName: 'Property Value',
				name: 'filterPropertyValue',
				type: 'string',
				default: '',
				placeholder: 'e.g., high',
				displayOptions: {
					show: {
						operation: ['filterNodes', 'filterEdges'],
						filterBy: ['property'],
					},
				},
			},
			{
				displayName: 'Filter Expression',
				name: 'filterExpression',
				type: 'string',
				default: '',
				placeholder: 'e.g., item.name.length > 10',
				description: 'JavaScript expression. Use "item" to reference the current node/edge.',
				displayOptions: {
					show: {
						operation: ['filterNodes', 'filterEdges'],
						filterBy: ['expression'],
					},
				},
			},
			// Rename types parameters
			{
				displayName: 'Rename Target',
				name: 'renameTarget',
				type: 'options',
				options: [
					{
						name: 'Node Types',
						value: 'nodes',
					},
					{
						name: 'Edge Types',
						value: 'edges',
					},
					{
						name: 'Both',
						value: 'both',
					},
				],
				default: 'nodes',
				displayOptions: {
					show: {
						operation: ['renameTypes'],
					},
				},
			},
			{
				displayName: 'Type Mappings',
				name: 'typeMappings',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				description: 'Mappings from old type to new type',
				displayOptions: {
					show: {
						operation: ['renameTypes'],
					},
				},
				options: [
					{
						name: 'mappings',
						displayName: 'Mappings',
						values: [
							{
								displayName: 'Old Type',
								name: 'oldType',
								type: 'string',
								default: '',
								placeholder: 'e.g., person',
							},
							{
								displayName: 'New Type',
								name: 'newType',
								type: 'string',
								default: '',
								placeholder: 'e.g., individual',
							},
						],
					},
				],
			},
			// Add properties parameters
			{
				displayName: 'Target',
				name: 'addPropertiesTarget',
				type: 'options',
				options: [
					{
						name: 'Nodes',
						value: 'nodes',
					},
					{
						name: 'Edges',
						value: 'edges',
					},
				],
				default: 'nodes',
				displayOptions: {
					show: {
						operation: ['addProperties'],
					},
				},
			},
			{
				displayName: 'Properties',
				name: 'propertiesToAdd',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				displayOptions: {
					show: {
						operation: ['addProperties'],
					},
				},
				options: [
					{
						name: 'properties',
						displayName: 'Properties',
						values: [
							{
								displayName: 'Property Name',
								name: 'name',
								type: 'string',
								default: '',
								placeholder: 'e.g., label',
							},
							{
								displayName: 'Value Expression',
								name: 'expression',
								type: 'string',
								default: '',
								placeholder: 'e.g., item.name.toUpperCase()',
								description: 'JavaScript expression. Use "item" for current element, "graph" for full graph.',
							},
						],
					},
				],
			},
			// Extract subgraph parameters
			{
				displayName: 'Center Nodes',
				name: 'centerNodes',
				type: 'string',
				default: '',
				placeholder: 'e.g., 0, 5, 10 or "John Doe", "Acme Corp"',
				description: 'Node IDs or names to center the subgraph on',
				displayOptions: {
					show: {
						operation: ['extractSubgraph'],
					},
				},
			},
			{
				displayName: 'Depth',
				name: 'subgraphDepth',
				type: 'number',
				default: 1,
				description: 'How many hops from center nodes to include',
				displayOptions: {
					show: {
						operation: ['extractSubgraph'],
					},
				},
			},
			// Statistics output
			{
				displayName: 'Include in Output',
				name: 'statisticsOutput',
				type: 'multiOptions',
				options: [
					{
						name: 'Basic Counts',
						value: 'basicCounts',
					},
					{
						name: 'Degree Statistics',
						value: 'degreeStats',
					},
					{
						name: 'Type Distribution',
						value: 'typeDistribution',
					},
					{
						name: 'Connected Components',
						value: 'connectedComponents',
					},
					{
						name: 'Top Nodes by Degree',
						value: 'topNodes',
					},
				],
				default: ['basicCounts', 'degreeStats', 'typeDistribution'],
				displayOptions: {
					show: {
						operation: ['statistics'],
					},
				},
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const operation = this.getNodeParameter('operation', 0) as string;

		try {
			switch (operation) {
				case 'merge': {
					const result = mergeGraphs(this, items);
					returnData.push({ json: result });
					break;
				}

				case 'filterNodes':
				case 'filterEdges': {
					for (let i = 0; i < items.length; i++) {
						const result = filterGraph(this, i, operation === 'filterNodes');
						returnData.push({ json: result, pairedItem: { item: i } });
					}
					break;
				}

				case 'renameTypes': {
					for (let i = 0; i < items.length; i++) {
						const result = renameTypes(this, i);
						returnData.push({ json: result, pairedItem: { item: i } });
					}
					break;
				}

				case 'addProperties': {
					for (let i = 0; i < items.length; i++) {
						const result = addProperties(this, i);
						returnData.push({ json: result, pairedItem: { item: i } });
					}
					break;
				}

				case 'deduplicate': {
					for (let i = 0; i < items.length; i++) {
						const result = deduplicateGraph(this, i);
						returnData.push({ json: result, pairedItem: { item: i } });
					}
					break;
				}

				case 'extractSubgraph': {
					for (let i = 0; i < items.length; i++) {
						const result = extractSubgraph(this, i);
						returnData.push({ json: result, pairedItem: { item: i } });
					}
					break;
				}

				case 'statistics': {
					for (let i = 0; i < items.length; i++) {
						const result = computeStatistics(this, i);
						returnData.push({ json: result, pairedItem: { item: i } });
					}
					break;
				}

				default:
					throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`);
			}
		} catch (error) {
			if (this.continueOnFail()) {
				returnData.push({
					json: { error: (error as Error).message },
				});
			} else {
				throw error;
			}
		}

		return [returnData];
	}
}

// Helper functions

function mergeGraphs(context: IExecuteFunctions, items: INodeExecutionData[]): any {
	const mergeMode = context.getNodeParameter('mergeMode', 0) as string;
	const deduplicationStrategy = context.getNodeParameter('deduplicationStrategy', 0) as string;

	let graphs: GraphData[] = [];

	if (mergeMode === 'twoGraphs') {
		const graph1Json = context.getNodeParameter('graph1Json', 0) as string | object;
		const graph2Json = context.getNodeParameter('graph2Json', 0) as string | object;
		graphs.push(parseGraphJson(graph1Json));
		graphs.push(parseGraphJson(graph2Json));
	} else {
		const graphPropertyName = context.getNodeParameter('graphPropertyName', 0) as string;
		for (const item of items) {
			const graphData = item.json[graphPropertyName];
			if (graphData) {
				graphs.push(parseGraphJson(graphData as string | object));
			}
		}
	}

	if (graphs.length === 0) {
		throw new NodeOperationError(context.getNode(), 'No graphs to merge');
	}

	// Merge nodes
	const mergedNodes: GraphNode[] = [];
	const nodeMapping: Map<string, number> = new Map(); // originalKey -> newId
	let nextId = 0;

	for (const graph of graphs) {
		for (const node of graph.nodes) {
			let key: string;
			if (deduplicationStrategy === 'byName') {
				key = node.name.toLowerCase();
			} else if (deduplicationStrategy === 'byNameAndType') {
				key = `${node.name.toLowerCase()}:${node.type.toLowerCase()}`;
			} else {
				// keepAll - each node gets unique key
				key = `graph${graphs.indexOf(graph)}_node${node.id}`;
			}

			if (!nodeMapping.has(key)) {
				nodeMapping.set(key, nextId);
				mergedNodes.push({
					...node,
					id: nextId,
				});
				nextId++;
			}

			// Store mapping for edge remapping
			const originalKey = `graph${graphs.indexOf(graph)}_${node.id}`;
			nodeMapping.set(originalKey, nodeMapping.get(key)!);
		}
	}

	// Merge edges
	const mergedEdges: GraphEdge[] = [];
	const edgeSet = new Set<string>();

	for (let graphIdx = 0; graphIdx < graphs.length; graphIdx++) {
		const graph = graphs[graphIdx];
		for (const edge of graph.edges) {
			const sourceKey = `graph${graphIdx}_${edge.source}`;
			const targetKey = `graph${graphIdx}_${edge.target}`;

			const newSource = nodeMapping.get(sourceKey);
			const newTarget = nodeMapping.get(targetKey);

			if (newSource !== undefined && newTarget !== undefined) {
				const edgeKey = `${newSource}-${newTarget}-${edge.type}`;
				if (!edgeSet.has(edgeKey)) {
					edgeSet.add(edgeKey);
					mergedEdges.push({
						...edge,
						source: newSource,
						target: newTarget,
					});
				}
			}
		}
	}

	return {
		graph: {
			nodes: mergedNodes,
			edges: mergedEdges,
		},
		metadata: {
			source_graphs: graphs.length,
			merged_node_count: mergedNodes.length,
			merged_edge_count: mergedEdges.length,
			deduplication_strategy: deduplicationStrategy,
		},
	};
}

function filterGraph(context: IExecuteFunctions, itemIndex: number, filterNodes: boolean): any {
	const graphJson = context.getNodeParameter('graphJson', itemIndex) as string | object;
	const filterMode = context.getNodeParameter('filterMode', itemIndex) as string;
	const filterBy = context.getNodeParameter('filterBy', itemIndex) as string;

	const graph = parseGraphJson(graphJson);
	const include = filterMode === 'include';

	let filterFn: (item: any) => boolean;

	if (filterBy === 'type') {
		const types = (context.getNodeParameter('filterTypes', itemIndex) as string)
			.split(',')
			.map(t => t.trim().toLowerCase())
			.filter(Boolean);

		filterFn = (item) => {
			const matches = types.includes((item.type || '').toLowerCase());
			return include ? matches : !matches;
		};
	} else if (filterBy === 'property') {
		const propName = context.getNodeParameter('filterPropertyName', itemIndex) as string;
		const propValue = context.getNodeParameter('filterPropertyValue', itemIndex) as string;

		filterFn = (item) => {
			const matches = String(item[propName]) === propValue;
			return include ? matches : !matches;
		};
	} else {
		// expression
		const expression = context.getNodeParameter('filterExpression', itemIndex) as string;
		filterFn = (item) => {
			try {
				const fn = new Function('item', 'graph', `return ${expression}`);
				const matches = fn(item, graph);
				return include ? matches : !matches;
			} catch {
				return false;
			}
		};
	}

	let filteredNodes: GraphNode[];
	let filteredEdges: GraphEdge[];

	if (filterNodes) {
		filteredNodes = graph.nodes.filter(filterFn);
		const nodeIds = new Set(filteredNodes.map(n => n.id));
		filteredEdges = graph.edges.filter(e =>
			nodeIds.has(e.source) && nodeIds.has(e.target)
		);
	} else {
		filteredEdges = graph.edges.filter(filterFn);
		const usedNodeIds = new Set<number>();
		filteredEdges.forEach(e => {
			usedNodeIds.add(e.source);
			usedNodeIds.add(e.target);
		});
		filteredNodes = graph.nodes.filter(n => usedNodeIds.has(n.id));
	}

	return {
		graph: {
			nodes: filteredNodes,
			edges: filteredEdges,
		},
		metadata: {
			original_node_count: graph.nodes.length,
			original_edge_count: graph.edges.length,
			filtered_node_count: filteredNodes.length,
			filtered_edge_count: filteredEdges.length,
			filter_mode: filterMode,
			filter_by: filterBy,
		},
	};
}

function renameTypes(context: IExecuteFunctions, itemIndex: number): any {
	const graphJson = context.getNodeParameter('graphJson', itemIndex) as string | object;
	const renameTarget = context.getNodeParameter('renameTarget', itemIndex) as string;
	const typeMappings = context.getNodeParameter('typeMappings', itemIndex) as {
		mappings?: Array<{ oldType: string; newType: string }>;
	};

	const graph = parseGraphJson(graphJson);
	const mappings = new Map<string, string>();

	if (typeMappings.mappings) {
		for (const mapping of typeMappings.mappings) {
			mappings.set(mapping.oldType.toLowerCase(), mapping.newType);
		}
	}

	const renameType = (type: string): string => {
		return mappings.get(type.toLowerCase()) || type;
	};

	const renamedNodes = graph.nodes.map(node => ({
		...node,
		type: (renameTarget === 'nodes' || renameTarget === 'both')
			? renameType(node.type)
			: node.type,
	}));

	const renamedEdges = graph.edges.map(edge => ({
		...edge,
		type: (renameTarget === 'edges' || renameTarget === 'both')
			? renameType(edge.type)
			: edge.type,
	}));

	return {
		graph: {
			nodes: renamedNodes,
			edges: renamedEdges,
		},
		metadata: {
			node_count: renamedNodes.length,
			edge_count: renamedEdges.length,
			rename_target: renameTarget,
			mappings_applied: mappings.size,
		},
	};
}

function addProperties(context: IExecuteFunctions, itemIndex: number): any {
	const graphJson = context.getNodeParameter('graphJson', itemIndex) as string | object;
	const target = context.getNodeParameter('addPropertiesTarget', itemIndex) as string;
	const propertiesToAdd = context.getNodeParameter('propertiesToAdd', itemIndex) as {
		properties?: Array<{ name: string; expression: string }>;
	};

	const graph = parseGraphJson(graphJson);

	const addPropsToItem = (item: any): any => {
		const newItem = { ...item };
		if (propertiesToAdd.properties) {
			for (const prop of propertiesToAdd.properties) {
				try {
					const fn = new Function('item', 'graph', `return ${prop.expression}`);
					newItem[prop.name] = fn(item, graph);
				} catch (e) {
					newItem[prop.name] = null;
				}
			}
		}
		return newItem;
	};

	const updatedNodes = target === 'nodes'
		? graph.nodes.map(addPropsToItem)
		: graph.nodes;

	const updatedEdges = target === 'edges'
		? graph.edges.map(addPropsToItem)
		: graph.edges;

	return {
		graph: {
			nodes: updatedNodes,
			edges: updatedEdges,
		},
		metadata: {
			node_count: updatedNodes.length,
			edge_count: updatedEdges.length,
			properties_added: propertiesToAdd.properties?.length || 0,
			target,
		},
	};
}

function deduplicateGraph(context: IExecuteFunctions, itemIndex: number): any {
	const graphJson = context.getNodeParameter('graphJson', itemIndex) as string | object;
	const strategy = context.getNodeParameter('deduplicationStrategy', itemIndex) as string;

	const graph = parseGraphJson(graphJson);
	const nodeMapping = new Map<number, number>(); // oldId -> newId
	const seenNodes = new Map<string, number>(); // key -> newId
	const dedupedNodes: GraphNode[] = [];
	let nextId = 0;

	for (const node of graph.nodes) {
		let key: string;
		if (strategy === 'byName') {
			key = node.name.toLowerCase();
		} else {
			key = `${node.name.toLowerCase()}:${node.type.toLowerCase()}`;
		}

		if (seenNodes.has(key)) {
			nodeMapping.set(node.id, seenNodes.get(key)!);
		} else {
			seenNodes.set(key, nextId);
			nodeMapping.set(node.id, nextId);
			dedupedNodes.push({ ...node, id: nextId });
			nextId++;
		}
	}

	const edgeSet = new Set<string>();
	const dedupedEdges: GraphEdge[] = [];

	for (const edge of graph.edges) {
		const newSource = nodeMapping.get(edge.source);
		const newTarget = nodeMapping.get(edge.target);

		if (newSource !== undefined && newTarget !== undefined) {
			const edgeKey = `${newSource}-${newTarget}-${edge.type}`;
			if (!edgeSet.has(edgeKey)) {
				edgeSet.add(edgeKey);
				dedupedEdges.push({
					...edge,
					source: newSource,
					target: newTarget,
				});
			}
		}
	}

	return {
		graph: {
			nodes: dedupedNodes,
			edges: dedupedEdges,
		},
		metadata: {
			original_node_count: graph.nodes.length,
			original_edge_count: graph.edges.length,
			deduplicated_node_count: dedupedNodes.length,
			deduplicated_edge_count: dedupedEdges.length,
			nodes_removed: graph.nodes.length - dedupedNodes.length,
			edges_removed: graph.edges.length - dedupedEdges.length,
			strategy,
		},
	};
}

function extractSubgraph(context: IExecuteFunctions, itemIndex: number): any {
	const graphJson = context.getNodeParameter('graphJson', itemIndex) as string | object;
	const centerNodesInput = context.getNodeParameter('centerNodes', itemIndex) as string;
	const depth = context.getNodeParameter('subgraphDepth', itemIndex) as number;

	const graph = parseGraphJson(graphJson);

	// Parse center nodes (can be IDs or names)
	const centerNodeIds = new Set<number>();
	const parts = centerNodesInput.split(',').map(s => s.trim()).filter(Boolean);

	for (const part of parts) {
		// Try as number first
		const numId = parseInt(part, 10);
		if (!isNaN(numId)) {
			centerNodeIds.add(numId);
		} else {
			// Try as name (remove quotes)
			const name = part.replace(/^["']|["']$/g, '').toLowerCase();
			const node = graph.nodes.find(n => n.name.toLowerCase() === name);
			if (node) {
				centerNodeIds.add(node.id);
			}
		}
	}

	if (centerNodeIds.size === 0) {
		throw new NodeOperationError(context.getNode(), 'No valid center nodes found');
	}

	// Build adjacency list
	const adjacency = new Map<number, Set<number>>();
	for (const node of graph.nodes) {
		adjacency.set(node.id, new Set());
	}
	for (const edge of graph.edges) {
		adjacency.get(edge.source)?.add(edge.target);
		adjacency.get(edge.target)?.add(edge.source);
	}

	// BFS to find nodes within depth
	const includedNodeIds = new Set<number>(centerNodeIds);
	let frontier = new Set<number>(centerNodeIds);

	for (let d = 0; d < depth; d++) {
		const newFrontier = new Set<number>();
		for (const nodeId of frontier) {
			const neighbors = adjacency.get(nodeId) || new Set();
			for (const neighbor of neighbors) {
				if (!includedNodeIds.has(neighbor)) {
					includedNodeIds.add(neighbor);
					newFrontier.add(neighbor);
				}
			}
		}
		frontier = newFrontier;
	}

	// Filter nodes and edges
	const subgraphNodes = graph.nodes.filter(n => includedNodeIds.has(n.id));
	const subgraphEdges = graph.edges.filter(e =>
		includedNodeIds.has(e.source) && includedNodeIds.has(e.target)
	);

	return {
		graph: {
			nodes: subgraphNodes,
			edges: subgraphEdges,
		},
		metadata: {
			original_node_count: graph.nodes.length,
			original_edge_count: graph.edges.length,
			subgraph_node_count: subgraphNodes.length,
			subgraph_edge_count: subgraphEdges.length,
			center_nodes: Array.from(centerNodeIds),
			depth,
		},
	};
}

function computeStatistics(context: IExecuteFunctions, itemIndex: number): any {
	const graphJson = context.getNodeParameter('graphJson', itemIndex) as string | object;
	const outputOptions = context.getNodeParameter('statisticsOutput', itemIndex) as string[];

	const graph = parseGraphJson(graphJson);
	const result: any = {};

	// Basic counts
	if (outputOptions.includes('basicCounts')) {
		result.basicCounts = {
			nodeCount: graph.nodes.length,
			edgeCount: graph.edges.length,
			density: graph.nodes.length > 1
				? (2 * graph.edges.length) / (graph.nodes.length * (graph.nodes.length - 1))
				: 0,
		};
	}

	// Degree statistics
	if (outputOptions.includes('degreeStats')) {
		const degrees = new Map<number, { in: number; out: number }>();
		for (const node of graph.nodes) {
			degrees.set(node.id, { in: 0, out: 0 });
		}
		for (const edge of graph.edges) {
			const source = degrees.get(edge.source);
			const target = degrees.get(edge.target);
			if (source) source.out++;
			if (target) target.in++;
		}

		const totalDegrees = Array.from(degrees.values()).map(d => d.in + d.out);
		const avgDegree = totalDegrees.length > 0
			? totalDegrees.reduce((a, b) => a + b, 0) / totalDegrees.length
			: 0;
		const maxDegree = totalDegrees.length > 0 ? Math.max(...totalDegrees) : 0;
		const minDegree = totalDegrees.length > 0 ? Math.min(...totalDegrees) : 0;

		result.degreeStats = {
			averageDegree: avgDegree,
			maxDegree,
			minDegree,
			isolatedNodes: totalDegrees.filter(d => d === 0).length,
		};
	}

	// Type distribution
	if (outputOptions.includes('typeDistribution')) {
		const nodeTypes: Record<string, number> = {};
		const edgeTypes: Record<string, number> = {};

		for (const node of graph.nodes) {
			nodeTypes[node.type] = (nodeTypes[node.type] || 0) + 1;
		}
		for (const edge of graph.edges) {
			edgeTypes[edge.type] = (edgeTypes[edge.type] || 0) + 1;
		}

		result.typeDistribution = {
			nodeTypes,
			edgeTypes,
			uniqueNodeTypes: Object.keys(nodeTypes).length,
			uniqueEdgeTypes: Object.keys(edgeTypes).length,
		};
	}

	// Connected components (simple BFS)
	if (outputOptions.includes('connectedComponents')) {
		const visited = new Set<number>();
		const components: number[][] = [];

		const adjacency = new Map<number, Set<number>>();
		for (const node of graph.nodes) {
			adjacency.set(node.id, new Set());
		}
		for (const edge of graph.edges) {
			adjacency.get(edge.source)?.add(edge.target);
			adjacency.get(edge.target)?.add(edge.source);
		}

		for (const node of graph.nodes) {
			if (!visited.has(node.id)) {
				const component: number[] = [];
				const queue = [node.id];
				while (queue.length > 0) {
					const current = queue.shift()!;
					if (!visited.has(current)) {
						visited.add(current);
						component.push(current);
						const neighbors = adjacency.get(current) || new Set();
						for (const neighbor of neighbors) {
							if (!visited.has(neighbor)) {
								queue.push(neighbor);
							}
						}
					}
				}
				components.push(component);
			}
		}

		result.connectedComponents = {
			count: components.length,
			sizes: components.map(c => c.length).sort((a, b) => b - a),
			largestComponent: components.length > 0 ? Math.max(...components.map(c => c.length)) : 0,
		};
	}

	// Top nodes by degree
	if (outputOptions.includes('topNodes')) {
		const degrees = new Map<number, number>();
		for (const node of graph.nodes) {
			degrees.set(node.id, 0);
		}
		for (const edge of graph.edges) {
			degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1);
			degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1);
		}

		const nodeDegreePairs = Array.from(degrees.entries())
			.map(([id, degree]) => ({
				id,
				name: graph.nodes.find(n => n.id === id)?.name || `Node ${id}`,
				type: graph.nodes.find(n => n.id === id)?.type || 'unknown',
				degree,
			}))
			.sort((a, b) => b.degree - a.degree)
			.slice(0, 10);

		result.topNodes = nodeDegreePairs;
	}

	return {
		statistics: result,
		metadata: {
			node_count: graph.nodes.length,
			edge_count: graph.edges.length,
			computed_statistics: outputOptions,
		},
	};
}
