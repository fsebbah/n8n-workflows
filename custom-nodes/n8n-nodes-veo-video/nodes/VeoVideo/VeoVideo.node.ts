import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IDataObject,
  NodeOperationError,
} from 'n8n-workflow';

import { VeoVideoClient, VeoVideoOptions } from '../../shared/VeoVideoClient';

export class VeoVideo implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Veo Video',
    name: 'veoVideo',
    icon: 'file:veo-video.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: 'Generate videos using Veo 3',
    defaults: {
      name: 'Veo Video',
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
      // Operation
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Generate from Text',
            value: 'generateFromText',
            description: 'Generate a video from a text prompt',
            action: 'Generate video from text prompt',
          },
          {
            name: 'Generate from Image',
            value: 'generateFromImage',
            description: 'Animate an image into a video',
            action: 'Generate video from image',
          },
        ],
        default: 'generateFromText',
      },
      // Prompt
      {
        displayName: 'Prompt',
        name: 'prompt',
        type: 'string',
        typeOptions: {
          rows: 4,
        },
        required: true,
        default: '',
        placeholder: 'A robot walking through a futuristic city...',
        description: 'Description of the video to generate',
      },
      // Source Image (for generateFromImage)
      {
        displayName: 'Source Image',
        name: 'sourceImage',
        type: 'string',
        required: true,
        default: '',
        placeholder: 'Base64 encoded image data',
        description: 'Image to animate (base64 encoded)',
        displayOptions: {
          show: {
            operation: ['generateFromImage'],
          },
        },
      },
      // Source Image MIME Type
      {
        displayName: 'Source Image MIME Type',
        name: 'sourceImageMimeType',
        type: 'options',
        options: [
          { name: 'PNG', value: 'image/png' },
          { name: 'JPEG', value: 'image/jpeg' },
          { name: 'WebP', value: 'image/webp' },
        ],
        default: 'image/png',
        displayOptions: {
          show: {
            operation: ['generateFromImage'],
          },
        },
      },
      // Model
      {
        displayName: 'Model',
        name: 'model',
        type: 'options',
        options: [
          {
            name: 'Veo 3.1 (Quality)',
            value: 'veo-3.1-generate-001',
            description: 'Higher quality, slower generation',
          },
          {
            name: 'Veo 3.1 Fast',
            value: 'veo-3.1-fast-generate-001',
            description: 'Faster generation, slightly lower quality',
          },
        ],
        default: 'veo-3.1-generate-001',
      },
      // Duration
      {
        displayName: 'Duration (Seconds)',
        name: 'durationSeconds',
        type: 'options',
        options: [
          { name: '4 seconds', value: 4 },
          { name: '6 seconds', value: 6 },
          { name: '8 seconds', value: 8 },
        ],
        default: 6,
      },
      // Aspect Ratio
      {
        displayName: 'Aspect Ratio',
        name: 'aspectRatio',
        type: 'options',
        options: [
          { name: '16:9 (Landscape)', value: '16:9' },
          { name: '9:16 (Portrait/Mobile)', value: '9:16' },
        ],
        default: '16:9',
      },
      // Resolution
      {
        displayName: 'Resolution',
        name: 'resolution',
        type: 'options',
        options: [
          { name: '1080p (Full HD)', value: '1080p' },
          { name: '720p (HD)', value: '720p' },
        ],
        default: '1080p',
      },
      // Generate Audio
      {
        displayName: 'Generate Audio',
        name: 'generateAudio',
        type: 'boolean',
        default: true,
        description: 'Whether to generate dialogue and sound effects',
      },
      // Enhance Prompt
      {
        displayName: 'Enhance Prompt',
        name: 'enhancePrompt',
        type: 'boolean',
        default: true,
        description: 'Whether to use AI to enhance the prompt before generation',
      },
      // Advanced Options
      {
        displayName: 'Options',
        name: 'options',
        type: 'collection',
        placeholder: 'Add Option',
        default: {},
        options: [
          {
            displayName: 'Person Generation',
            name: 'personGeneration',
            type: 'options',
            options: [
              { name: 'Allow Adults', value: 'allow_adult' },
              { name: "Don't Allow", value: 'dont_allow' },
            ],
            default: 'allow_adult',
            description: 'Whether to allow generation of people in videos',
          },
        ],
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const operation = this.getNodeParameter('operation', i) as string;
        const prompt = this.getNodeParameter('prompt', i) as string;
        const model = this.getNodeParameter('model', i) as string;
        const durationSeconds = this.getNodeParameter('durationSeconds', i) as number;
        const aspectRatio = this.getNodeParameter('aspectRatio', i) as string;
        const resolution = this.getNodeParameter('resolution', i) as string;
        const generateAudio = this.getNodeParameter('generateAudio', i) as boolean;
        const enhancePrompt = this.getNodeParameter('enhancePrompt', i) as boolean;
        const advancedOptions = this.getNodeParameter('options', i, {}) as {
          personGeneration?: string;
        };

        if (!prompt) {
          throw new NodeOperationError(this.getNode(), 'Prompt is required', { itemIndex: i });
        }

        // Get credentials
        const credentials = await this.getCredentials('googleVertexAiApi');

        // Create client
        const client = new VeoVideoClient({
          projectId: credentials.projectId as string,
          location: (credentials.location as string) || 'us-central1',
          serviceAccountKey: credentials.serviceAccountKey as string | undefined,
        });

        const videoOptions: VeoVideoOptions = {
          model: model as VeoVideoOptions['model'],
          aspectRatio: aspectRatio as VeoVideoOptions['aspectRatio'],
          durationSeconds: durationSeconds as VeoVideoOptions['durationSeconds'],
          resolution: resolution as VeoVideoOptions['resolution'],
          generateAudio,
          enhancePrompt,
          personGeneration: (advancedOptions.personGeneration || 'allow_adult') as VeoVideoOptions['personGeneration'],
        };

        let result;

        switch (operation) {
          case 'generateFromText': {
            result = await client.generateFromText(prompt, videoOptions);
            break;
          }

          case 'generateFromImage': {
            const sourceImage = this.getNodeParameter('sourceImage', i) as string;
            const sourceImageMimeType = this.getNodeParameter('sourceImageMimeType', i) as string;

            if (!sourceImage) {
              throw new NodeOperationError(this.getNode(), 'Source image is required', { itemIndex: i });
            }

            const imageBuffer = Buffer.from(sourceImage, 'base64');
            result = await client.generateFromImage(imageBuffer, sourceImageMimeType, prompt, videoOptions);
            break;
          }

          default:
            throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, { itemIndex: i });
        }

        // Prepare output
        const jsonOutput: IDataObject = {
          operation,
          video: {
            format: 'mp4',
            durationSeconds: result.durationSeconds,
            resolution: result.resolution,
            aspectRatio: result.aspectRatio,
            hasAudio: result.hasAudio,
          },
          model: result.model,
          generationTimeSeconds: result.generationTimeSeconds,
          metadata: {
            processedAt: new Date().toISOString(),
          },
        };

        // Include base64 in JSON
        jsonOutput.videoBase64 = result.videoData.toString('base64');

        const outputData: INodeExecutionData = {
          json: jsonOutput,
          binary: {
            data: await this.helpers.prepareBinaryData(
              result.videoData,
              'generated-video.mp4',
              result.mimeType
            ),
          },
        };

        returnData.push(outputData);
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: {
              error: error instanceof Error ? error.message : 'Unknown error',
            },
          });
          continue;
        }
        throw error;
      }
    }

    return [returnData];
  }
}
