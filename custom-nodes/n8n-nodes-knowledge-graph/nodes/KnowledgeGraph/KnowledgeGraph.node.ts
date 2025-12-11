import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	IBinaryData,
} from 'n8n-workflow';

import {
	createVertexAiClientWithAdc,
	createVertexAiClient,
	GenAiClient,
} from 'n8n-nodes-google-genai-core';

import {
	ENTITY_EXTRACTION_PROMPT,
	RELATIONSHIP_EXTRACTION_PROMPT,
	FULL_GRAPH_EXTRACTION_PROMPT,
	buildPromptWithConfig,
	buildRelationshipPromptWithEntities,
	buildExtractionConfig,
	ExtractionConfig,
} from '../../prompts/knowledgeGraphPrompts';

// Types pour les résultats
interface Entity {
	id: number;
	name: string;
	type: string;
}

interface Relationship {
	source: number;
	target: number;
	links: string[];
}

interface EntityExtractionResult {
	entities: Entity[];
	metadata: {
		source_length: number;
		language_detected: string;
		entity_count: number;
	};
}

interface RelationshipExtractionResult {
	relationships: Relationship[];
	metadata: {
		relationship_count: number;
	};
}

interface GraphResult {
	graph: {
		nodes: Entity[];
		edges: Array<{ source: number; target: number; type: string }>;
	};
	metadata: {
		node_count: number;
		edge_count: number;
		language_detected: string;
	};
}

export class KnowledgeGraph implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Knowledge Graph',
		name: 'knowledgeGraph',
		icon: 'file:knowledge-graph.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Extract knowledge graphs from text using Google Gemini',
		defaults: {
			name: 'Knowledge Graph',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'googleVertexAiApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Build Graph',
						value: 'buildGraph',
						description: 'Extract entities and relationships to build a complete graph',
						action: 'Build a complete knowledge graph',
					},
					{
						name: 'Extract Entities',
						value: 'extractEntities',
						description: 'Extract entities (characters, locations, organizations) from text',
						action: 'Extract entities from text',
					},
					{
						name: 'Extract Relationships',
						value: 'extractRelationships',
						description: 'Extract relationships between entities',
						action: 'Extract relationships between entities',
					},
				],
				default: 'buildGraph',
			},
			{
				displayName: 'Input Type',
				name: 'inputType',
				type: 'options',
				options: [
					{
						name: 'Text',
						value: 'text',
						description: 'Analyze text directly',
					},
					{
						name: 'Document',
						value: 'document',
						description: 'Analyze a document file (PDF, TXT, DOCX, etc.)',
					},
				],
				default: 'text',
				description: 'Choose whether to analyze text or a document file',
			},
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				typeOptions: {
					rows: 10,
				},
				default: '',
				required: true,
				description: 'The text to analyze for knowledge extraction',
				displayOptions: {
					show: {
						inputType: ['text'],
					},
				},
			},
			{
				displayName: 'Binary Property',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				description: 'Name of the binary property containing the document to analyze',
				displayOptions: {
					show: {
						inputType: ['document'],
					},
				},
			},
			{
				displayName: 'Configuration Mode',
				name: 'configMode',
				type: 'options',
				options: [
					{
						name: 'Preset',
						value: 'preset',
						description: 'Use a predefined configuration for common document types',
					},
					{
						name: 'Custom',
						value: 'custom',
						description: 'Define your own entity types and relation types',
					},
					{
						name: 'JSON Config',
						value: 'jsonConfig',
						description: 'Pass a complete configuration as JSON',
					},
				],
				default: 'preset',
				description: 'How to configure the extraction parameters',
			},
			{
				displayName: 'Preset',
				name: 'preset',
				type: 'options',
				options: [
					{
						name: 'Narrative (Stories, Books)',
						value: 'narrative',
						description: 'Characters, locations, events, relationships',
					},
					{
						name: 'Business / Market Research',
						value: 'business',
						description: 'Organizations, people, metrics, strategies, risks',
					},
					{
						name: 'Technical Documentation',
						value: 'technical',
						description: 'APIs, services, components, dependencies',
					},
					{
						name: 'Scientific / Academic',
						value: 'scientific',
						description: 'Researchers, theories, studies, findings',
					},
					{
						name: 'Legal / Compliance',
						value: 'legal',
						description: 'Laws, regulations, parties, obligations',
					},
				],
				default: 'narrative',
				description: 'Predefined configuration for common document types',
				displayOptions: {
					show: {
						configMode: ['preset'],
						operation: ['extractEntities', 'buildGraph'],
					},
				},
			},
			{
				displayName: 'Entity Types',
				name: 'entityTypes',
				type: 'multiOptions',
				options: [
					{
						name: 'Characters/People',
						value: 'characters',
					},
					{
						name: 'Concepts',
						value: 'concepts',
					},
					{
						name: 'Events',
						value: 'events',
					},
					{
						name: 'Locations',
						value: 'locations',
					},
					{
						name: 'Metrics/KPIs',
						value: 'metrics',
					},
					{
						name: 'Organizations',
						value: 'organizations',
					},
					{
						name: 'Products/Services',
						value: 'products',
					},
					{
						name: 'Risks/Concerns',
						value: 'risks',
					},
					{
						name: 'Technologies',
						value: 'technologies',
					},
				],
				default: ['characters'],
				description: 'Types of entities to extract',
				displayOptions: {
					show: {
						configMode: ['custom'],
						operation: ['extractEntities', 'buildGraph'],
					},
				},
			},
			{
				displayName: 'Relation Types',
				name: 'relationTypes',
				type: 'string',
				default: '',
				placeholder: 'e.g., works_at, manages, influences, measures',
				description: 'Comma-separated list of relation types to extract. Leave empty for automatic detection.',
				displayOptions: {
					show: {
						configMode: ['custom'],
						operation: ['extractRelationships', 'buildGraph'],
					},
				},
			},
			{
				displayName: 'Configuration JSON',
				name: 'configJson',
				type: 'json',
				default: '{}',
				description: 'Complete configuration as JSON. Expected format: { "entityTypes": [...], "relationTypes": [...], "customInstructions": "..." }',
				displayOptions: {
					show: {
						configMode: ['jsonConfig'],
					},
				},
			},
			{
				displayName: 'Custom Instructions',
				name: 'customInstructions',
				type: 'string',
				typeOptions: {
					rows: 3,
				},
				default: '',
				placeholder: 'e.g., Focus on financial metrics and their relationships to company performance',
				description: 'Additional instructions to guide the extraction',
				displayOptions: {
					show: {
						configMode: ['custom'],
					},
				},
			},
			{
				displayName: 'Entities JSON',
				name: 'entitiesJson',
				type: 'string',
				typeOptions: {
					rows: 5,
				},
				default: '',
				description: 'Optional: Pre-defined entities JSON array. If empty, entities will be extracted automatically.',
				displayOptions: {
					show: {
						operation: ['extractRelationships'],
					},
				},
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Model',
						name: 'model',
						type: 'options',
						options: [
							{
								name: 'Gemini 2.5 Flash (Fast)',
								value: 'gemini-2.5-flash',
							},
							{
								name: 'Gemini 2.5 Pro (Accurate)',
								value: 'gemini-2.5-pro',
							},
						],
						default: 'gemini-2.5-flash',
						description: 'The Gemini model to use',
					},
					{
						displayName: 'Temperature',
						name: 'temperature',
						type: 'number',
						typeOptions: {
							minValue: 0,
							maxValue: 1,
							numberStepSize: 0.1,
						},
						default: 0,
						description: 'Controls randomness. 0 = deterministic, 1 = creative.',
					},
					{
						displayName: 'Max Output Tokens',
						name: 'maxOutputTokens',
						type: 'number',
						typeOptions: {
							minValue: 100,
							maxValue: 65536,
						},
						default: 8192,
						description: 'Maximum number of tokens in the response',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		// Get credentials
		const credentials = await this.getCredentials('googleVertexAiApi');
		const projectId = credentials.projectId as string;
		const location = credentials.location as string;
		const authMethod = credentials.authMethod as string;
		const serviceAccountKey = credentials.serviceAccountKey as string | undefined;

		// Create GenAI client
		let client: GenAiClient;
		if (authMethod === 'adc' || !serviceAccountKey) {
			client = createVertexAiClientWithAdc(projectId, location);
		} else {
			client = createVertexAiClient(projectId, serviceAccountKey, location);
		}

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;
				const inputType = this.getNodeParameter('inputType', i, 'text') as string;
				const options = this.getNodeParameter('options', i, {}) as {
					model?: string;
					temperature?: number;
					maxOutputTokens?: number;
				};

				let text: string;
				let documentData: { mimeType: string; data: string } | undefined;

				if (inputType === 'document') {
					// Handle document input
					const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i, 'data') as string;
					const binaryData = items[i].binary?.[binaryPropertyName] as IBinaryData | undefined;

					if (!binaryData) {
						throw new NodeOperationError(
							this.getNode(),
							`No binary data found in property "${binaryPropertyName}"`,
							{ itemIndex: i }
						);
					}

					const mimeType = binaryData.mimeType;
					const supportedMimeTypes = [
						'application/pdf',
						'text/plain',
						'text/html',
						'text/csv',
						'text/markdown',
						'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
						'application/msword',
					];

					// For text-based documents, extract text content
					if (mimeType.startsWith('text/')) {
						const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);
						text = buffer.toString('utf-8');
					} else if (supportedMimeTypes.includes(mimeType)) {
						// For PDF and other binary documents, send as base64 to Gemini
						const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);
						documentData = {
							mimeType: mimeType,
							data: buffer.toString('base64'),
						};
						text = ''; // Will use document instead
					} else {
						throw new NodeOperationError(
							this.getNode(),
							`Unsupported document type: ${mimeType}. Supported types: PDF, TXT, HTML, CSV, Markdown, DOCX`,
							{ itemIndex: i }
						);
					}
				} else {
					// Handle text input
					text = this.getNodeParameter('text', i) as string;
				}

				if (!documentData && (!text || text.trim().length === 0)) {
					throw new NodeOperationError(this.getNode(), 'Text or document input is required', { itemIndex: i });
				}

				const genOptions = {
					model: (options.model || 'gemini-2.5-flash') as any,
					temperature: options.temperature ?? 0,
					maxOutputTokens: options.maxOutputTokens ?? 8192,
				};

				let result: EntityExtractionResult | RelationshipExtractionResult | GraphResult;

				// Helper function to call the appropriate API method
				const callGemini = async <T>(prompt: string): Promise<T> => {
					if (documentData) {
						return client.generateJsonFromDocument<T>(prompt, documentData, genOptions);
					} else {
						return client.generateJson<T>(prompt, genOptions);
					}
				};

				// Build extraction configuration
				const configMode = this.getNodeParameter('configMode', i, 'preset') as 'preset' | 'custom' | 'jsonConfig';
				const preset = this.getNodeParameter('preset', i, 'narrative') as string;
				const entityTypes = this.getNodeParameter('entityTypes', i, ['characters']) as string[];
				const relationTypes = this.getNodeParameter('relationTypes', i, '') as string;
				const customInstructions = this.getNodeParameter('customInstructions', i, '') as string;
				const configJson = this.getNodeParameter('configJson', i, '{}') as string;

				const extractionConfig: ExtractionConfig = buildExtractionConfig(
					configMode,
					preset,
					entityTypes,
					relationTypes,
					customInstructions,
					configJson
				);

				const presetName = configMode === 'preset' ? preset : undefined;
				const textContent = text || 'Analyze the provided document.';

				switch (operation) {
					case 'extractEntities': {
						const prompt = buildPromptWithConfig(ENTITY_EXTRACTION_PROMPT, textContent, extractionConfig, presetName);
						result = await callGemini<EntityExtractionResult>(prompt);
						break;
					}

					case 'extractRelationships': {
						const entitiesJson = this.getNodeParameter('entitiesJson', i, '') as string;
						let prompt: string;

						if (entitiesJson && entitiesJson.trim()) {
							// Use provided entities
							const entities = JSON.parse(entitiesJson) as Entity[];
							prompt = buildRelationshipPromptWithEntities(textContent, entities, extractionConfig);
						} else {
							// Extract entities first, then relationships
							prompt = buildPromptWithConfig(RELATIONSHIP_EXTRACTION_PROMPT, textContent, extractionConfig, presetName);
						}

						result = await callGemini<RelationshipExtractionResult>(prompt);
						break;
					}

					case 'buildGraph': {
						const prompt = buildPromptWithConfig(FULL_GRAPH_EXTRACTION_PROMPT, textContent, extractionConfig, presetName);
						result = await callGemini<GraphResult>(prompt);
						break;
					}

					default:
						throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, { itemIndex: i });
				}

				returnData.push({
					json: result as any,
					pairedItem: { item: i },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: (error as Error).message,
						},
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
