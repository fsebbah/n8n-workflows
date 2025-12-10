import {
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

/**
 * Credentials pour Google Vertex AI
 * Utilise un Service Account pour l'authentification
 */
export class GoogleVertexAiApi implements ICredentialType {
	name = 'googleVertexAiApi';
	displayName = 'Google Vertex AI API';
	documentationUrl = 'https://cloud.google.com/vertex-ai/docs/authentication';
	properties: INodeProperties[] = [
		{
			displayName: 'Project ID',
			name: 'projectId',
			type: 'string',
			default: '',
			required: true,
			description: 'Google Cloud Project ID (ex: my-project-123)',
		},
		{
			displayName: 'Location',
			name: 'location',
			type: 'options',
			default: 'us-central1',
			options: [
				{ name: 'US Central 1', value: 'us-central1' },
				{ name: 'US East 4', value: 'us-east4' },
				{ name: 'US West 1', value: 'us-west1' },
				{ name: 'Europe West 1', value: 'europe-west1' },
				{ name: 'Europe West 4', value: 'europe-west4' },
				{ name: 'Asia East 1', value: 'asia-east1' },
				{ name: 'Asia Northeast 1', value: 'asia-northeast1' },
			],
			description: 'Region for Vertex AI API calls',
		},
		{
			displayName: 'Service Account Key (JSON)',
			name: 'serviceAccountKey',
			type: 'string',
			typeOptions: {
				password: true,
				rows: 10,
			},
			default: '',
			required: true,
			description: 'Paste the entire JSON content of your Service Account key file',
		},
		{
			displayName: 'GCS Bucket Name',
			name: 'gcsBucketName',
			type: 'string',
			default: '',
			description: 'Google Cloud Storage bucket for storing generated media (optional)',
		},
	];
}
