/**
 * Prompts pour l'extraction de graphes de connaissances
 * Basé sur le Colab knowledge_graph_generation.ipynb
 *
 * Supports multiple presets and custom configurations
 */

// ============================================================================
// PRESET CONFIGURATIONS
// ============================================================================

export interface PresetConfig {
	entityTypes: string[];
	relationTypes: string[];
	entityDefinition: string;
	relationDefinition: string;
}

export const PRESETS: Record<string, PresetConfig> = {
	narrative: {
		entityTypes: ['character', 'location', 'event', 'object'],
		relationTypes: ['friend_of', 'enemy_of', 'family_of', 'lives_in', 'works_at', 'travels_to', 'owns', 'participates_in'],
		entityDefinition: 'A "key entity" is a named individual (person, animal), place, significant event, or important object that is central to the story.',
		relationDefinition: 'A "key relationship" is an explicitly stated or directly implied relationship between two entities that affects the plot or understanding.',
	},
	business: {
		entityTypes: ['organization', 'person', 'metric', 'concept', 'risk', 'event', 'region', 'industry'],
		relationTypes: ['works_at', 'manages', 'owns', 'influences', 'measures', 'concerns', 'operates_in', 'competes_with', 'partners_with', 'invests_in', 'authored_by', 'conducted_in'],
		entityDefinition: 'A "key entity" is an organization, person, financial metric (e.g., EBITDA, ROIC), business concept, risk factor, event, geographic region, or industry sector mentioned in the document.',
		relationDefinition: 'A "key relationship" describes how entities interact: employment, ownership, measurement, influence, concern, competition, partnership, or investment relationships.',
	},
	technical: {
		entityTypes: ['service', 'api', 'database', 'component', 'protocol', 'technology', 'pattern', 'configuration'],
		relationTypes: ['depends_on', 'calls', 'implements', 'extends', 'contains', 'configures', 'stores_in', 'communicates_with', 'inherits_from', 'uses'],
		entityDefinition: 'A "key entity" is a technical component: service, API endpoint, database, software component, protocol, technology, design pattern, or configuration element.',
		relationDefinition: 'A "key relationship" describes technical interactions: dependencies, API calls, implementations, inheritance, data storage, or communication patterns.',
	},
	scientific: {
		entityTypes: ['researcher', 'theory', 'study', 'finding', 'method', 'dataset', 'institution', 'publication'],
		relationTypes: ['authored_by', 'cites', 'supports', 'contradicts', 'uses_method', 'affiliated_with', 'published_in', 'discovers', 'proposes', 'validates'],
		entityDefinition: 'A "key entity" is a researcher, scientific theory, study, finding, methodology, dataset, research institution, or publication.',
		relationDefinition: 'A "key relationship" describes academic interactions: authorship, citations, support or contradiction of theories, methodological choices, affiliations, or discoveries.',
	},
	legal: {
		entityTypes: ['law', 'regulation', 'party', 'obligation', 'right', 'court', 'contract', 'clause'],
		relationTypes: ['governs', 'obligates', 'grants_right', 'party_to', 'references', 'amends', 'enforces', 'violates', 'complies_with', 'interprets'],
		entityDefinition: 'A "key entity" is a law, regulation, legal party, obligation, right, court, contract, or contract clause.',
		relationDefinition: 'A "key relationship" describes legal interactions: governance, obligations, rights, references between laws, amendments, enforcement, or compliance.',
	},
};

// ============================================================================
// BASE PROMPTS
// ============================================================================

export const ENTITY_EXTRACTION_PROMPT = `
Using only the provided text, complete the following task.

**Task - Extract Entities**

- Definition: {{ENTITY_DEFINITION}}
- Entity types to extract: {{ENTITY_TYPES}}
- Task:
  - Extract the distinct key entities found in the provided text.
  - For each one:
    - Assign a unique integer identifier (\`id\`=0, 1, 2...).
    - Determine their most complete \`name\` from the text, spelled in title case.
    - Determine their \`type\` from the allowed types above.

{{CUSTOM_INSTRUCTIONS}}

Output a JSON object with the following structure:
{
  "entities": [
    {"id": 0, "name": "Entity Name", "type": "entity_type"},
    ...
  ],
  "metadata": {
    "source_length": <number of characters in source>,
    "language_detected": "<detected language code>",
    "entity_count": <number of entities>
  }
}
`;

export const RELATIONSHIP_EXTRACTION_PROMPT = `
Using only the provided text, complete the following task.

**Task - Extract Relationships**

- Definition: {{RELATION_DEFINITION}}
- Relation types to use: {{RELATION_TYPES}}
- Task:
  - Extract the distinct key relationships between entity pairs.
  - Use the relation types provided, or infer appropriate types in snake_case if not listed.
  - For symmetrical relationships (e.g., "friend_of"), create two entries to represent the relationship in both directions.
  - For asymmetrical relationships (e.g., "manages"), create entries for both directions (e.g., "manages" and "managed_by").

If entities are provided, use them. Otherwise, first extract entities then find relationships.

{{CUSTOM_INSTRUCTIONS}}

Output a JSON object with the following structure:
{
  "relationships": [
    {"source": 0, "target": 1, "links": ["relationship_type_1", "relationship_type_2"]},
    ...
  ],
  "metadata": {
    "relationship_count": <number of relationship pairs>
  }
}
`;

export const FULL_GRAPH_EXTRACTION_PROMPT = `
Using only the provided text, complete the following tasks.

**Task 1 - Extract Entities**

- Definition: {{ENTITY_DEFINITION}}
- Entity types to extract: {{ENTITY_TYPES}}
- Task:
  - Extract the distinct key entities found in the provided text.
  - For each one:
    - Assign a unique integer identifier (\`id\`=0, 1, 2...).
    - Determine their most complete \`name\` from the text, spelled in title case.
    - Determine their \`type\` from the allowed types above.

**Task 2 - Extract Relationships**

- Definition: {{RELATION_DEFINITION}}
- Relation types to use: {{RELATION_TYPES}}
- Task:
  - Extract the distinct key relationships between the entity pairs from Task 1.
  - Use the relation types provided, or infer appropriate types in snake_case if not listed.
  - For symmetrical relationships, create two entries to represent both directions.
  - For asymmetrical relationships, create entries for both directions.

{{CUSTOM_INSTRUCTIONS}}

Output a JSON object with the following structure:
{
  "graph": {
    "nodes": [
      {"id": 0, "name": "Entity Name", "type": "entity_type"},
      ...
    ],
    "edges": [
      {"source": 0, "target": 1, "type": "relationship_type"},
      ...
    ]
  },
  "metadata": {
    "node_count": <number of nodes>,
    "edge_count": <number of edges>,
    "language_detected": "<detected language code>"
  }
}
`;

// ============================================================================
// CONFIGURATION INTERFACE
// ============================================================================

export interface ExtractionConfig {
	entityTypes: string[];
	relationTypes: string[];
	customInstructions?: string;
}

// ============================================================================
// PROMPT BUILDERS
// ============================================================================

/**
 * Get configuration from preset name
 */
export function getPresetConfig(presetName: string): PresetConfig {
	return PRESETS[presetName] || PRESETS.narrative;
}

/**
 * Build extraction config from various sources
 */
export function buildExtractionConfig(
	configMode: 'preset' | 'custom' | 'jsonConfig',
	preset?: string,
	entityTypes?: string[],
	relationTypes?: string,
	customInstructions?: string,
	configJson?: string
): ExtractionConfig {
	if (configMode === 'jsonConfig' && configJson) {
		try {
			const parsed = JSON.parse(configJson);
			return {
				entityTypes: parsed.entityTypes || ['character'],
				relationTypes: parsed.relationTypes || [],
				customInstructions: parsed.customInstructions || '',
			};
		} catch {
			// Fall back to narrative preset
			const presetConfig = getPresetConfig('narrative');
			return {
				entityTypes: presetConfig.entityTypes,
				relationTypes: presetConfig.relationTypes,
			};
		}
	}

	if (configMode === 'preset' && preset) {
		const presetConfig = getPresetConfig(preset);
		return {
			entityTypes: presetConfig.entityTypes,
			relationTypes: presetConfig.relationTypes,
		};
	}

	// Custom mode
	return {
		entityTypes: entityTypes || ['character'],
		relationTypes: relationTypes ? relationTypes.split(',').map(s => s.trim()).filter(Boolean) : [],
		customInstructions: customInstructions || '',
	};
}

/**
 * Build the complete prompt with configuration
 */
export function buildPromptWithConfig(
	basePrompt: string,
	text: string,
	config: ExtractionConfig,
	presetName?: string
): string {
	const preset = presetName ? getPresetConfig(presetName) : null;

	// Replace placeholders
	let prompt = basePrompt
		.replace('{{ENTITY_DEFINITION}}', preset?.entityDefinition || 'A key entity is a significant named item in the text.')
		.replace('{{ENTITY_TYPES}}', config.entityTypes.join(', '))
		.replace('{{RELATION_DEFINITION}}', preset?.relationDefinition || 'A key relationship describes how entities interact.')
		.replace('{{RELATION_TYPES}}', config.relationTypes.length > 0 ? config.relationTypes.join(', ') : 'Infer appropriate relation types in snake_case');

	// Add custom instructions
	if (config.customInstructions) {
		prompt = prompt.replace('{{CUSTOM_INSTRUCTIONS}}', `\n**Additional Instructions:**\n${config.customInstructions}\n`);
	} else {
		prompt = prompt.replace('{{CUSTOM_INSTRUCTIONS}}', '');
	}

	// Wrap with text
	return '<TEXT>\n' + text + '\n</TEXT>\n\n<INSTRUCTIONS>\n' + prompt.trim() + '\n</INSTRUCTIONS>';
}

/**
 * Legacy function for backward compatibility
 */
export function buildPrompt(basePrompt: string, text: string, entityTypes?: string[]): string {
	// Use narrative preset as default for legacy calls
	const config: ExtractionConfig = {
		entityTypes: entityTypes || ['character'],
		relationTypes: [],
	};
	return buildPromptWithConfig(basePrompt, text, config, 'narrative');
}

/**
 * Construit le prompt pour l'extraction de relations avec des entités pré-définies
 */
export function buildRelationshipPromptWithEntities(
	text: string,
	entities: Array<{ id: number; name: string; type: string }>,
	config?: ExtractionConfig
): string {
	const effectiveConfig = config || {
		entityTypes: [],
		relationTypes: [],
	};

	let prompt = '<TEXT>\n' + text + '\n</TEXT>\n\n';
	prompt += '<ENTITIES>\n' + JSON.stringify(entities, null, 2) + '\n</ENTITIES>\n\n';

	let instructions = RELATIONSHIP_EXTRACTION_PROMPT
		.replace('{{RELATION_DEFINITION}}', 'A key relationship describes how entities interact.')
		.replace('{{RELATION_TYPES}}', effectiveConfig.relationTypes.length > 0 ? effectiveConfig.relationTypes.join(', ') : 'Infer appropriate relation types in snake_case')
		.replace('{{CUSTOM_INSTRUCTIONS}}', effectiveConfig.customInstructions ? `\n**Additional Instructions:**\n${effectiveConfig.customInstructions}\n` : '');

	prompt += '<INSTRUCTIONS>\n' + instructions.trim();
	prompt += '\n\nUse the provided entities list above. Find relationships between these entities only.';
	prompt += '\n</INSTRUCTIONS>';

	return prompt;
}
