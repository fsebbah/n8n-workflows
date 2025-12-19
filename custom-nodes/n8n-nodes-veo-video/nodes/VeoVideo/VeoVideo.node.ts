import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IDataObject,
  NodeOperationError,
} from 'n8n-workflow';

import { VeoVideoClient, VeoVideoOptions, VeoExtendOptions, VeoLongVideoOptions } from '../../shared/VeoVideoClient';
import * as presets from '../../shared/presets/veo-presets.json';

// Type for preset config
interface PresetConfig {
  name: string;
  description: string;
  style: string;
  camera_movement: string;
  lighting: string;
  prompt_prefix: string;
  prompt_suffix: string;
  defaults: {
    aspectRatio?: string;
    resolution?: string;
    durationSeconds?: number;
    generateAudio?: boolean;
    enhancePrompt?: boolean;
  };
}

export class VeoVideo implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Veo Video',
    name: 'veoVideo',
    icon: 'file:veo-video.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: 'Generate videos using Veo 3 with presets and long video support',
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
          {
            name: 'Generate Long Video',
            value: 'generateLongVideo',
            description: 'Generate a video longer than 8 seconds by chaining clips',
            action: 'Generate long video by chaining clips',
          },
          {
            name: 'Extend Video',
            value: 'extendVideo',
            description: 'Extend an existing video with additional footage',
            action: 'Extend existing video',
          },
          {
            name: 'Optimize Prompt',
            value: 'optimizePrompt',
            description: 'Enhance a prompt using AI for better video generation',
            action: 'Optimize prompt with AI',
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
        displayOptions: {
          hide: {
            operation: ['extendVideo'],
          },
        },
      },
      // Extension Prompt (for extendVideo)
      {
        displayName: 'Extension Prompt',
        name: 'extensionPrompt',
        type: 'string',
        typeOptions: {
          rows: 2,
        },
        default: '',
        placeholder: 'Continue the scene with...',
        description: 'Optional prompt to guide how the video should be extended',
        displayOptions: {
          show: {
            operation: ['extendVideo'],
          },
        },
      },
      // Source Video (for extendVideo)
      {
        displayName: 'Source Video',
        name: 'sourceVideo',
        type: 'string',
        required: true,
        default: '',
        placeholder: 'Base64 encoded video data',
        description: 'Video to extend (base64 encoded)',
        displayOptions: {
          show: {
            operation: ['extendVideo'],
          },
        },
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
      // Preset Selection
      {
        displayName: 'Preset',
        name: 'preset',
        type: 'options',
        options: [
          { name: 'None (Custom)', value: 'none' },
          { name: 'Corporate / Professional', value: 'corporate' },
          { name: 'Social Media Short', value: 'social_short' },
          { name: 'Product Demo', value: 'product_demo' },
          { name: 'Cinematic', value: 'cinematic' },
          { name: 'Explainer / Tutorial', value: 'explainer' },
          { name: 'Artistic / Creative', value: 'artistic' },
        ],
        default: 'none',
        description: 'Apply a preset style to the video generation',
        displayOptions: {
          show: {
            operation: ['generateFromText', 'generateFromImage', 'generateLongVideo', 'optimizePrompt'],
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
        displayOptions: {
          hide: {
            operation: ['optimizePrompt'],
          },
        },
      },
      // Target Duration (for generateLongVideo)
      {
        displayName: 'Target Duration (Seconds)',
        name: 'targetDuration',
        type: 'number',
        typeOptions: {
          minValue: 4,
          maxValue: 120,
        },
        default: 30,
        description: 'Total desired video duration. Videos longer than 8s are created by chaining multiple clips.',
        displayOptions: {
          show: {
            operation: ['generateLongVideo'],
          },
        },
      },
      // Duration (for single clips)
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
        displayOptions: {
          show: {
            operation: ['generateFromText', 'generateFromImage', 'extendVideo'],
          },
        },
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
        displayOptions: {
          hide: {
            operation: ['optimizePrompt'],
          },
        },
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
        displayOptions: {
          hide: {
            operation: ['optimizePrompt'],
          },
        },
      },
      // Generate Audio
      {
        displayName: 'Generate Audio',
        name: 'generateAudio',
        type: 'boolean',
        default: true,
        description: 'Whether to generate dialogue and sound effects',
        displayOptions: {
          hide: {
            operation: ['optimizePrompt'],
          },
        },
      },
      // Enhance Prompt
      {
        displayName: 'Enhance Prompt',
        name: 'enhancePrompt',
        type: 'boolean',
        default: true,
        description: 'Whether to use AI to enhance the prompt before generation',
        displayOptions: {
          show: {
            operation: ['generateFromText', 'generateFromImage', 'generateLongVideo'],
          },
        },
      },
      // Advanced Options
      {
        displayName: 'Options',
        name: 'options',
        type: 'collection',
        placeholder: 'Add Option',
        default: {},
        displayOptions: {
          hide: {
            operation: ['optimizePrompt'],
          },
        },
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

        // Get credentials
        const credentials = await this.getCredentials('googleVertexAiApi');

        // Create client
        const client = new VeoVideoClient({
          projectId: credentials.projectId as string,
          location: (credentials.location as string) || 'us-central1',
          serviceAccountKey: credentials.serviceAccountKey as string | undefined,
        });

        let result;
        let jsonOutput: IDataObject;

        // Get preset if selected
        const presetName = operation !== 'extendVideo'
          ? this.getNodeParameter('preset', i, 'none') as string
          : 'none';
        const presetConfig = presetName !== 'none'
          ? (presets.presets as Record<string, PresetConfig>)[presetName]
          : null;

        switch (operation) {
          case 'generateFromText': {
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

            // Apply preset to prompt if selected
            let finalPrompt = prompt;
            if (presetConfig) {
              finalPrompt = `${presetConfig.prompt_prefix}${prompt}${presetConfig.prompt_suffix}`;
            }

            const videoOptions: VeoVideoOptions = {
              model: model as VeoVideoOptions['model'],
              aspectRatio: (presetConfig?.defaults.aspectRatio || aspectRatio) as VeoVideoOptions['aspectRatio'],
              durationSeconds: durationSeconds as VeoVideoOptions['durationSeconds'],
              resolution: (presetConfig?.defaults.resolution || resolution) as VeoVideoOptions['resolution'],
              generateAudio: presetConfig?.defaults.generateAudio ?? generateAudio,
              enhancePrompt: presetConfig?.defaults.enhancePrompt ?? enhancePrompt,
              personGeneration: (advancedOptions.personGeneration || 'allow_adult') as VeoVideoOptions['personGeneration'],
            };

            result = await client.generateFromText(finalPrompt, videoOptions);

            jsonOutput = {
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
              preset: presetName !== 'none' ? presetName : undefined,
              metadata: {
                processedAt: new Date().toISOString(),
              },
              videoBase64: result.videoData.toString('base64'),
            };
            break;
          }

          case 'generateFromImage': {
            const prompt = this.getNodeParameter('prompt', i) as string;
            const sourceImage = this.getNodeParameter('sourceImage', i) as string;
            const sourceImageMimeType = this.getNodeParameter('sourceImageMimeType', i) as string;
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
            if (!sourceImage) {
              throw new NodeOperationError(this.getNode(), 'Source image is required', { itemIndex: i });
            }

            let finalPrompt = prompt;
            if (presetConfig) {
              finalPrompt = `${presetConfig.prompt_prefix}${prompt}${presetConfig.prompt_suffix}`;
            }

            const videoOptions: VeoVideoOptions = {
              model: model as VeoVideoOptions['model'],
              aspectRatio: (presetConfig?.defaults.aspectRatio || aspectRatio) as VeoVideoOptions['aspectRatio'],
              durationSeconds: durationSeconds as VeoVideoOptions['durationSeconds'],
              resolution: (presetConfig?.defaults.resolution || resolution) as VeoVideoOptions['resolution'],
              generateAudio: presetConfig?.defaults.generateAudio ?? generateAudio,
              enhancePrompt: presetConfig?.defaults.enhancePrompt ?? enhancePrompt,
              personGeneration: (advancedOptions.personGeneration || 'allow_adult') as VeoVideoOptions['personGeneration'],
            };

            const imageBuffer = Buffer.from(sourceImage, 'base64');
            result = await client.generateFromImage(imageBuffer, sourceImageMimeType, finalPrompt, videoOptions);

            jsonOutput = {
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
              preset: presetName !== 'none' ? presetName : undefined,
              metadata: {
                processedAt: new Date().toISOString(),
              },
              videoBase64: result.videoData.toString('base64'),
            };
            break;
          }

          case 'generateLongVideo': {
            const prompt = this.getNodeParameter('prompt', i) as string;
            const targetDuration = this.getNodeParameter('targetDuration', i) as number;
            const model = this.getNodeParameter('model', i) as string;
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

            let finalPrompt = prompt;
            if (presetConfig) {
              finalPrompt = `${presetConfig.prompt_prefix}${prompt}${presetConfig.prompt_suffix}`;
            }

            const longVideoOptions: VeoLongVideoOptions = {
              targetDuration,
              model: model as VeoVideoOptions['model'],
              aspectRatio: (presetConfig?.defaults.aspectRatio || aspectRatio) as VeoVideoOptions['aspectRatio'],
              resolution: (presetConfig?.defaults.resolution || resolution) as VeoVideoOptions['resolution'],
              generateAudio: presetConfig?.defaults.generateAudio ?? generateAudio,
              enhancePrompt: presetConfig?.defaults.enhancePrompt ?? enhancePrompt,
              personGeneration: (advancedOptions.personGeneration || 'allow_adult') as VeoVideoOptions['personGeneration'],
            };

            result = await client.generateLongVideo(finalPrompt, longVideoOptions);

            jsonOutput = {
              operation,
              video: {
                format: 'mp4',
                durationSeconds: result.durationSeconds,
                resolution: result.resolution,
                aspectRatio: result.aspectRatio,
                hasAudio: result.hasAudio,
                clipCount: result.clipCount,
                clipDurations: result.clipDurations,
              },
              model: result.model,
              generationTimeSeconds: result.generationTimeSeconds,
              preset: presetName !== 'none' ? presetName : undefined,
              metadata: {
                processedAt: new Date().toISOString(),
                targetDuration,
                actualDuration: result.durationSeconds,
              },
              videoBase64: result.videoData.toString('base64'),
            };
            break;
          }

          case 'extendVideo': {
            const sourceVideo = this.getNodeParameter('sourceVideo', i) as string;
            const extensionPrompt = this.getNodeParameter('extensionPrompt', i, '') as string;
            const model = this.getNodeParameter('model', i) as string;
            const durationSeconds = this.getNodeParameter('durationSeconds', i) as number;
            const aspectRatio = this.getNodeParameter('aspectRatio', i) as string;
            const resolution = this.getNodeParameter('resolution', i) as string;
            const generateAudio = this.getNodeParameter('generateAudio', i) as boolean;
            const advancedOptions = this.getNodeParameter('options', i, {}) as {
              personGeneration?: string;
            };

            if (!sourceVideo) {
              throw new NodeOperationError(this.getNode(), 'Source video is required', { itemIndex: i });
            }

            const extendOptions: VeoExtendOptions = {
              model: model as VeoVideoOptions['model'],
              aspectRatio: aspectRatio as VeoVideoOptions['aspectRatio'],
              resolution: resolution as VeoVideoOptions['resolution'],
              generateAudio,
              extensionPrompt: extensionPrompt || undefined,
              personGeneration: (advancedOptions.personGeneration || 'allow_adult') as VeoVideoOptions['personGeneration'],
            };

            const videoBuffer = Buffer.from(sourceVideo, 'base64');
            result = await client.extendVideo(videoBuffer, durationSeconds as 4 | 6 | 8, extendOptions);

            jsonOutput = {
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
                extensionDuration: durationSeconds,
              },
              videoBase64: result.videoData.toString('base64'),
            };
            break;
          }

          case 'optimizePrompt': {
            const prompt = this.getNodeParameter('prompt', i) as string;

            if (!prompt) {
              throw new NodeOperationError(this.getNode(), 'Prompt is required', { itemIndex: i });
            }

            const optimizationResult = await client.optimizePrompt(
              prompt,
              presetName !== 'none' ? presetName : undefined,
              presetConfig ? presetConfig as unknown as Record<string, unknown> : undefined
            );

            jsonOutput = {
              operation,
              originalPrompt: optimizationResult.originalPrompt,
              optimizedPrompt: optimizationResult.optimizedPrompt,
              keywordsAdded: optimizationResult.keywordsAdded,
              preset: optimizationResult.preset,
              metadata: {
                processedAt: new Date().toISOString(),
              },
            };

            returnData.push({ json: jsonOutput });
            continue; // Skip binary data for this operation
          }

          default:
            throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, { itemIndex: i });
        }

        // Prepare output with binary data for video operations
        const outputData: INodeExecutionData = {
          json: jsonOutput!,
          binary: {
            data: await this.helpers.prepareBinaryData(
              result!.videoData,
              'generated-video.mp4',
              result!.mimeType
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
