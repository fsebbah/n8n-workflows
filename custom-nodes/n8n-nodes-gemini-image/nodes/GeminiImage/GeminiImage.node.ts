import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IDataObject,
  NodeOperationError,
} from 'n8n-workflow';

import {
  GeminiImageClient,
  GeminiImageOptions,
  ReferenceImage,
} from '../../shared/GeminiImageClient';
import { GcsUploader } from '../../shared/GcsUploader';

export class GeminiImage implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Gemini Image',
    name: 'geminiImage',
    icon: 'file:gemini-image.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: 'Generate and manipulate images using Gemini 2.5 Flash Image (Nano Banana)',
    defaults: {
      name: 'Gemini Image',
    },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      {
        name: 'googleVertexAiApi',
        required: false,
        displayOptions: {
          show: {
            credentialType: ['vertexai'],
          },
        },
      },
      {
        name: 'googleAiStudioApi',
        required: false,
        displayOptions: {
          show: {
            credentialType: ['aistudio'],
          },
        },
      },
    ],
    properties: [
      // Credential Type
      {
        displayName: 'Credential Type',
        name: 'credentialType',
        type: 'options',
        options: [
          {
            name: 'Google Vertex AI',
            value: 'vertexai',
          },
          {
            name: 'Google AI Studio',
            value: 'aistudio',
          },
        ],
        default: 'vertexai',
        description: 'Which API to use for Gemini',
      },
      // Operation
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Generate Image',
            value: 'generate',
            description: 'Generate an image from a text prompt',
            action: 'Generate image from prompt',
          },
          {
            name: 'Extract Character',
            value: 'extractCharacter',
            description: 'Extract a character from an image with transparent background',
            action: 'Extract character from image',
          },
          {
            name: 'Create Character Sheet',
            value: 'createCharacterSheet',
            description: 'Generate multiple views of a character (front, back, side)',
            action: 'Create character sheet',
          },
          {
            name: 'Compose Scene',
            value: 'composeScene',
            description: 'Compose a scene using reference images',
            action: 'Compose scene with references',
          },
        ],
        default: 'generate',
      },
      // Prompt (for generate)
      {
        displayName: 'Prompt',
        name: 'prompt',
        type: 'string',
        typeOptions: {
          rows: 4,
        },
        default: '',
        placeholder: 'A cute robot made of felt, studio lighting...',
        description: 'Text description of the image to generate',
        displayOptions: {
          show: {
            operation: ['generate'],
          },
        },
      },
      // Source Image (for extract, sheet)
      {
        displayName: 'Source Image',
        name: 'sourceImage',
        type: 'string',
        default: '',
        description: 'Base64 encoded image or URL',
        displayOptions: {
          show: {
            operation: ['extractCharacter', 'createCharacterSheet'],
          },
        },
      },
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
            operation: ['extractCharacter', 'createCharacterSheet'],
          },
        },
      },
      // Character Description (for extract)
      {
        displayName: 'Character Description',
        name: 'characterDescription',
        type: 'string',
        default: 'the main character',
        placeholder: 'the blue robot',
        description: 'Description of the character to extract',
        displayOptions: {
          show: {
            operation: ['extractCharacter'],
          },
        },
      },
      // Background Type (for extract)
      {
        displayName: 'Background Type',
        name: 'backgroundType',
        type: 'options',
        options: [
          { name: 'White', value: 'white' },
          { name: 'Transparent', value: 'transparent' },
          { name: 'Solid Color', value: 'solid' },
        ],
        default: 'white',
        description: 'Background type for the extracted character',
        displayOptions: {
          show: {
            operation: ['extractCharacter'],
          },
        },
      },
      // Background Color (for extract with solid)
      {
        displayName: 'Background Color',
        name: 'backgroundColor',
        type: 'string',
        default: '',
        placeholder: 'blue, #FF0000, light gray',
        description: 'Background color when using solid background',
        displayOptions: {
          show: {
            operation: ['extractCharacter'],
            backgroundType: ['solid'],
          },
        },
      },
      // Views (for character sheet)
      {
        displayName: 'Views',
        name: 'views',
        type: 'multiOptions',
        options: [
          { name: 'Front', value: 'front' },
          { name: 'Back', value: 'back' },
          { name: 'Left Side', value: 'left side' },
          { name: 'Right Side', value: 'right side' },
          { name: '3/4 View', value: '3/4' },
        ],
        default: ['front', 'back'],
        description: 'Views to generate in the character sheet',
        displayOptions: {
          show: {
            operation: ['createCharacterSheet'],
          },
        },
      },
      // Character Name (for sheet)
      {
        displayName: 'Character Name',
        name: 'characterName',
        type: 'string',
        default: '',
        placeholder: 'Robot, Hero, Monster',
        description: 'Optional name to display in the character sheet title',
        displayOptions: {
          show: {
            operation: ['createCharacterSheet'],
          },
        },
      },
      // Include Labels (for sheet)
      {
        displayName: 'Include Labels',
        name: 'includeLabels',
        type: 'boolean',
        default: true,
        description: 'Include text labels for each view (e.g., "FRONT VIEW")',
        displayOptions: {
          show: {
            operation: ['createCharacterSheet'],
          },
        },
      },
      // Reference Images (for compose)
      {
        displayName: 'Reference Images',
        name: 'referenceImages',
        type: 'fixedCollection',
        typeOptions: {
          multipleValues: true,
        },
        default: {},
        description: 'Images to use as references for scene composition',
        displayOptions: {
          show: {
            operation: ['composeScene'],
          },
        },
        options: [
          {
            name: 'images',
            displayName: 'Images',
            values: [
              {
                displayName: 'Image Data',
                name: 'data',
                type: 'string',
                default: '',
                description: 'Base64 encoded image data',
              },
              {
                displayName: 'MIME Type',
                name: 'mimeType',
                type: 'options',
                options: [
                  { name: 'PNG', value: 'image/png' },
                  { name: 'JPEG', value: 'image/jpeg' },
                  { name: 'WebP', value: 'image/webp' },
                ],
                default: 'image/png',
              },
              {
                displayName: 'Role',
                name: 'role',
                type: 'string',
                default: '',
                placeholder: 'character sheet, background, previous scene',
                description: 'Role of this image in the composition',
              },
            ],
          },
        ],
      },
      // Scene Prompt (for compose)
      {
        displayName: 'Scene Prompt',
        name: 'scenePrompt',
        type: 'string',
        typeOptions: {
          rows: 4,
        },
        default: '',
        placeholder: 'The robot walks through a felt forest...',
        description: 'Description of the scene to compose',
        displayOptions: {
          show: {
            operation: ['composeScene'],
          },
        },
      },
      // Prompt Style (for compose)
      {
        displayName: 'Prompt Style',
        name: 'promptStyle',
        type: 'options',
        options: [
          { name: 'Descriptive', value: 'descriptive', description: 'Describe the final state of the scene' },
          { name: 'Imperative', value: 'imperative', description: 'Describe actions to perform (move, remove, add)' },
        ],
        default: 'descriptive',
        description: 'Style of prompt: descriptive (final state) or imperative (actions)',
        displayOptions: {
          show: {
            operation: ['composeScene'],
          },
        },
      },
      // Lighting (for compose)
      {
        displayName: 'Lighting',
        name: 'lighting',
        type: 'string',
        default: '',
        placeholder: 'Golden hour, studio lighting, soft diffused',
        description: 'Lighting style for the scene',
        displayOptions: {
          show: {
            operation: ['composeScene'],
          },
        },
      },
      // Camera Angle (for compose)
      {
        displayName: 'Camera Angle',
        name: 'cameraAngle',
        type: 'string',
        default: '',
        placeholder: '3/4 back angle, front view, close-up',
        description: 'Camera angle or viewpoint for the scene',
        displayOptions: {
          show: {
            operation: ['composeScene'],
          },
        },
      },
      // Aspect Ratio
      {
        displayName: 'Aspect Ratio',
        name: 'aspectRatio',
        type: 'options',
        options: [
          { name: '1:1 (Square)', value: '1:1' },
          { name: '16:9 (Landscape)', value: '16:9' },
          { name: '9:16 (Portrait)', value: '9:16' },
          { name: '2:3 (Portrait Photo)', value: '2:3' },
          { name: '3:2 (Landscape Photo)', value: '3:2' },
          { name: '4:3 (Presentation)', value: '4:3' },
          { name: '21:9 (Cinematic)', value: '21:9' },
        ],
        default: '16:9',
        description: 'Aspect ratio of the generated image',
        displayOptions: {
          show: {
            operation: ['generate', 'composeScene'],
          },
        },
      },
      // Output Format
      {
        displayName: 'Output Format',
        name: 'outputFormat',
        type: 'options',
        options: [
          { name: 'PNG', value: 'png' },
          { name: 'WebP', value: 'webp' },
          { name: 'JPEG', value: 'jpeg' },
        ],
        default: 'png',
        description: 'Format of the output image',
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
            displayName: 'Model',
            name: 'model',
            type: 'string',
            default: 'gemini-2.5-flash-preview-native-audio-dialog',
            description: 'Gemini model to use (default: Nano Banana)',
          },
          {
            displayName: 'Include Text Feedback',
            name: 'includeTextFeedback',
            type: 'boolean',
            default: false,
            description: 'Include textual feedback from the model',
          },
          {
            displayName: 'Upload to GCS',
            name: 'uploadToGcs',
            type: 'boolean',
            default: false,
            description: 'Upload generated image to Google Cloud Storage and return signed URL',
          },
          {
            displayName: 'GCS Bucket',
            name: 'gcsBucket',
            type: 'string',
            default: '',
            placeholder: 'my-bucket-name',
            description: 'Google Cloud Storage bucket name (required if uploadToGcs is true)',
            displayOptions: {
              show: {
                uploadToGcs: [true],
              },
            },
          },
          {
            displayName: 'GCS Path Prefix',
            name: 'gcsPathPrefix',
            type: 'string',
            default: 'gemini-images',
            description: 'Path prefix for uploaded images in the bucket',
            displayOptions: {
              show: {
                uploadToGcs: [true],
              },
            },
          },
          {
            displayName: 'Signed URL Expiration (Hours)',
            name: 'signedUrlExpirationHours',
            type: 'number',
            default: 24,
            description: 'How many hours the signed URL should be valid',
            displayOptions: {
              show: {
                uploadToGcs: [true],
              },
            },
          },
          {
            displayName: 'User ID',
            name: 'userId',
            type: 'string',
            default: '',
            placeholder: 'user-123',
            description: 'Optional user ID to organize files in GCS',
            displayOptions: {
              show: {
                uploadToGcs: [true],
              },
            },
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
        const credentialType = this.getNodeParameter('credentialType', i) as string;
        const outputFormat = this.getNodeParameter('outputFormat', i) as string;
        const advancedOptions = this.getNodeParameter('options', i, {}) as {
          model?: string;
          includeTextFeedback?: boolean;
          uploadToGcs?: boolean;
          gcsBucket?: string;
          gcsPathPrefix?: string;
          signedUrlExpirationHours?: number;
          userId?: string;
        };

        // Get credentials
        const credentials = await this.getCredentials(
          credentialType === 'vertexai' ? 'googleVertexAiApi' : 'googleAiStudioApi'
        );

        // Create client
        const client = credentialType === 'vertexai'
          ? new GeminiImageClient({
              projectId: credentials.projectId as string,
              location: (credentials.location as string) || 'global',
              serviceAccountKey: credentials.serviceAccountKey as string | undefined,
            })
          : new GeminiImageClient({
              apiKey: credentials.apiKey as string,
            });

        const imageOptions: GeminiImageOptions = {
          model: advancedOptions.model,
          outputFormat: outputFormat as 'png' | 'webp' | 'jpeg',
          includeTextFeedback: advancedOptions.includeTextFeedback,
        };

        let result;

        switch (operation) {
          case 'generate': {
            const prompt = this.getNodeParameter('prompt', i) as string;
            const aspectRatio = this.getNodeParameter('aspectRatio', i) as string;

            if (!prompt) {
              throw new NodeOperationError(this.getNode(), 'Prompt is required', { itemIndex: i });
            }

            imageOptions.aspectRatio = aspectRatio as GeminiImageOptions['aspectRatio'];
            result = await client.generate(prompt, imageOptions);
            break;
          }

          case 'extractCharacter': {
            const sourceImage = this.getNodeParameter('sourceImage', i) as string;
            const sourceImageMimeType = this.getNodeParameter('sourceImageMimeType', i) as string;
            const characterDescription = this.getNodeParameter('characterDescription', i) as string;
            const backgroundType = this.getNodeParameter('backgroundType', i, 'white') as 'transparent' | 'white' | 'solid';
            const backgroundColor = this.getNodeParameter('backgroundColor', i, '') as string;

            if (!sourceImage) {
              throw new NodeOperationError(this.getNode(), 'Source image is required', { itemIndex: i });
            }

            const refImage: ReferenceImage = {
              data: sourceImage,
              mimeType: sourceImageMimeType,
            };

            result = await client.extractCharacter(refImage, characterDescription, {
              ...imageOptions,
              backgroundType,
              backgroundColor: backgroundColor || undefined,
            });
            break;
          }

          case 'createCharacterSheet': {
            const sourceImage = this.getNodeParameter('sourceImage', i) as string;
            const sourceImageMimeType = this.getNodeParameter('sourceImageMimeType', i) as string;
            const views = this.getNodeParameter('views', i) as string[];
            const characterName = this.getNodeParameter('characterName', i, '') as string;
            const includeLabels = this.getNodeParameter('includeLabels', i, true) as boolean;

            if (!sourceImage) {
              throw new NodeOperationError(this.getNode(), 'Source image is required', { itemIndex: i });
            }

            if (views.length === 0) {
              throw new NodeOperationError(this.getNode(), 'At least one view must be selected', { itemIndex: i });
            }

            const refImage: ReferenceImage = {
              data: sourceImage,
              mimeType: sourceImageMimeType,
            };

            result = await client.createCharacterSheet(refImage, views, {
              ...imageOptions,
              characterName: characterName || undefined,
              includeLabels,
            });
            break;
          }

          case 'composeScene': {
            const referenceImagesData = this.getNodeParameter('referenceImages', i) as {
              images?: Array<{ data: string; mimeType: string; role: string }>;
            };
            const scenePrompt = this.getNodeParameter('scenePrompt', i) as string;
            const aspectRatio = this.getNodeParameter('aspectRatio', i) as string;
            const promptStyle = this.getNodeParameter('promptStyle', i, 'descriptive') as 'descriptive' | 'imperative';
            const lighting = this.getNodeParameter('lighting', i, '') as string;
            const cameraAngle = this.getNodeParameter('cameraAngle', i, '') as string;

            if (!scenePrompt) {
              throw new NodeOperationError(this.getNode(), 'Scene prompt is required', { itemIndex: i });
            }

            const referenceImages: ReferenceImage[] = (referenceImagesData.images || []).map(img => ({
              data: img.data,
              mimeType: img.mimeType,
              role: img.role,
            }));

            if (referenceImages.length === 0) {
              throw new NodeOperationError(this.getNode(), 'At least one reference image is required for scene composition', { itemIndex: i });
            }

            imageOptions.aspectRatio = aspectRatio as GeminiImageOptions['aspectRatio'];
            result = await client.composeScene(referenceImages, scenePrompt, {
              ...imageOptions,
              promptStyle,
              lighting: lighting || undefined,
              cameraAngle: cameraAngle || undefined,
            });
            break;
          }

          default:
            throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, { itemIndex: i });
        }

        // Prepare output
        const jsonOutput: IDataObject = {
          operation,
          mimeType: result.mimeType,
          model: result.model,
          textFeedback: result.textFeedback,
          metadata: {
            processedAt: new Date().toISOString(),
          },
        };

        const outputData: INodeExecutionData = {
          json: jsonOutput,
          binary: {
            data: await this.helpers.prepareBinaryData(
              result.imageData,
              `generated-image.${outputFormat}`,
              result.mimeType
            ),
          },
        };

        // Also include base64 in JSON for easy use
        jsonOutput.imageBase64 = result.imageData.toString('base64');

        // Upload to GCS if requested
        if (advancedOptions.uploadToGcs) {
          if (!advancedOptions.gcsBucket) {
            throw new NodeOperationError(this.getNode(), 'GCS Bucket is required when uploadToGcs is enabled', { itemIndex: i });
          }

          const gcsUploader = new GcsUploader(
            {
              bucketName: advancedOptions.gcsBucket,
              pathPrefix: advancedOptions.gcsPathPrefix || 'gemini-images',
              signedUrlExpirationHours: advancedOptions.signedUrlExpirationHours || 24,
            },
            credentialType === 'vertexai' ? credentials.serviceAccountKey as string | undefined : undefined
          );

          const gcsResult = await gcsUploader.upload(
            result.imageData,
            `${operation}-${outputFormat}.${outputFormat}`,
            result.mimeType,
            advancedOptions.userId
          );

          jsonOutput.gcs = {
            bucket: gcsResult.bucket,
            path: gcsResult.path,
            gcsUrl: gcsResult.gcsUrl,
            signedUrl: gcsResult.signedUrl,
            expiresAt: gcsResult.expiresAt.toISOString(),
          };
        }

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
