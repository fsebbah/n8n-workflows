import {
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

/**
 * Credentials pour Google AI Studio (Gemini API)
 * Utilise une API Key pour l'authentification
 * Alternative plus simple à Vertex AI pour le développement
 */
export class GoogleAiStudioApi implements ICredentialType {
	name = 'googleAiStudioApi';
	displayName = 'Google AI Studio API';
	documentationUrl = 'https://aistudio.google.com/app/apikey';
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'API Key from Google AI Studio (aistudio.google.com)',
		},
	];
}
