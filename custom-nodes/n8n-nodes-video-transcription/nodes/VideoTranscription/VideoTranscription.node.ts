import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
} from 'n8n-workflow';

import {
  downloadVideoFromUrl,
  isYouTubeUrl,
  extractYouTubeVideoId,
  fetchYouTubeVideo,
  prepareVideoContent,
  callGeminiWithVideo,
  calculateChunks,
  mergeTranscriptionResults,
  timeToSeconds,
  createVideoCache,
  queryVideoCache,
  deleteVideoCache,
  listVideoCaches,
  GeminiCredentials,
  VideoInfo,
  CacheInfo,
  CreateCacheResult,
} from '../../shared/VideoClient';

import { getPromptForOperation } from '../../shared/videoTranscriptionPrompts';

export class VideoTranscription implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Video Transcription',
    name: 'videoTranscription',
    icon: 'file:video-transcription.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: 'Transcribe and analyze videos using Google Gemini multimodal AI',
    defaults: {
      name: 'Video Transcription',
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
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Transcribe',
            value: 'transcribe',
            description: 'Transcribe video audio with timestamps',
            action: 'Transcribe video audio',
          },
          {
            name: 'Identify Speakers',
            value: 'identifySpeakers',
            description: 'Transcribe with speaker diarization and identification',
            action: 'Transcribe with speaker identification',
          },
          {
            name: 'Extract OCR',
            value: 'extractOcr',
            description: 'Extract visible text from video frames',
            action: 'Extract text from video frames',
          },
          {
            name: 'Analyze Scene',
            value: 'analyzeScene',
            description: 'Full video analysis: transcription, speakers, OCR, and scene description',
            action: 'Analyze video scene completely',
          },
          {
            name: 'Extract Slides',
            value: 'extractSlides',
            description: 'Detect and extract slide/presentation metadata with timestamps',
            action: 'Extract slides from video',
          },
          {
            name: 'Create Cache',
            value: 'createCache',
            description: 'Upload video and create cache for multiple queries (saves ~70% on costs)',
            action: 'Create video cache',
          },
          {
            name: 'Query Cache',
            value: 'queryCache',
            description: 'Query an existing cached video with a custom prompt',
            action: 'Query cached video',
          },
          {
            name: 'Delete Cache',
            value: 'deleteCache',
            description: 'Delete a video cache to stop billing',
            action: 'Delete video cache',
          },
          {
            name: 'List Caches',
            value: 'listCaches',
            description: 'List all active video caches',
            action: 'List video caches',
          },
        ],
        default: 'transcribe',
      },
      // Cache ID for cache operations
      {
        displayName: 'Cache ID',
        name: 'cacheId',
        type: 'string',
        default: '',
        placeholder: 'projects/.../locations/.../cachedContents/...',
        description: 'The cache ID returned from Create Cache operation',
        displayOptions: {
          show: {
            operation: ['queryCache', 'deleteCache'],
          },
        },
      },
      // Cache display name
      {
        displayName: 'Cache Name',
        name: 'cacheName',
        type: 'string',
        default: '',
        placeholder: 'my-video-cache',
        description: 'A friendly name for the cache (for identification)',
        displayOptions: {
          show: {
            operation: ['createCache'],
          },
        },
      },
      // Cache TTL
      {
        displayName: 'Cache TTL (minutes)',
        name: 'cacheTtl',
        type: 'number',
        default: 60,
        description: 'How long to keep the cache (billing applies). Minimum 1 minute.',
        displayOptions: {
          show: {
            operation: ['createCache'],
          },
        },
      },
      // Custom prompt for queryCache
      {
        displayName: 'Prompt',
        name: 'cachePrompt',
        type: 'string',
        typeOptions: {
          rows: 4,
        },
        default: '',
        placeholder: 'Summarize this video in 3 bullet points...',
        description: 'The prompt to send to the cached video',
        displayOptions: {
          show: {
            operation: ['queryCache'],
          },
        },
      },
      // Video source options
      {
        displayName: 'Video Source',
        name: 'videoSource',
        type: 'options',
        options: [
          {
            name: 'URL',
            value: 'url',
            description: 'Video from direct URL or YouTube',
          },
          {
            name: 'Binary Data',
            value: 'binary',
            description: 'Video from binary input',
          },
          {
            name: 'Base64',
            value: 'base64',
            description: 'Video from base64 encoded data',
          },
        ],
        default: 'url',
        description: 'Source of the video to process',
        displayOptions: {
          show: {
            operation: ['transcribe', 'identifySpeakers', 'extractOcr', 'analyzeScene', 'extractSlides', 'createCache'],
          },
        },
      },
      {
        displayName: 'Video URL',
        name: 'videoUrl',
        type: 'string',
        default: '',
        placeholder: 'https://www.youtube.com/watch?v=... or https://example.com/video.mp4',
        description: 'URL of the video (YouTube or direct link)',
        displayOptions: {
          show: {
            videoSource: ['url'],
          },
        },
      },
      {
        displayName: 'Video Base64',
        name: 'videoBase64',
        type: 'string',
        default: '',
        description: 'Base64 encoded video data',
        displayOptions: {
          show: {
            videoSource: ['base64'],
          },
        },
      },
      {
        displayName: 'Video MIME Type',
        name: 'videoMimeType',
        type: 'string',
        default: 'video/mp4',
        description: 'MIME type of the video (e.g., video/mp4, video/webm)',
        displayOptions: {
          show: {
            videoSource: ['base64'],
          },
        },
      },
      {
        displayName: 'Input Binary Field',
        name: 'binaryPropertyName',
        type: 'string',
        default: 'data',
        description: 'Name of the binary property containing the video',
        displayOptions: {
          show: {
            videoSource: ['binary'],
          },
        },
      },
      // Output language
      {
        displayName: 'Output Language',
        name: 'outputLanguage',
        type: 'options',
        options: [
          { name: 'Auto-Detect', value: 'auto' },
          { name: 'English', value: 'en' },
          { name: 'French', value: 'fr' },
          { name: 'Spanish', value: 'es' },
          { name: 'German', value: 'de' },
          { name: 'Italian', value: 'it' },
          { name: 'Portuguese', value: 'pt' },
        ],
        default: 'auto',
        description: 'Language for the transcription output',
      },
      // Cache options for standard operations
      {
        displayName: 'Use Cache',
        name: 'useCache',
        type: 'boolean',
        default: false,
        description: 'Use context caching for ~70% cost savings on repeated queries. Creates a cache, processes the video, then optionally keeps the cache.',
        displayOptions: {
          show: {
            operation: ['transcribe', 'identifySpeakers', 'extractOcr', 'analyzeScene', 'extractSlides'],
          },
        },
      },
      {
        displayName: 'Cache TTL (Minutes)',
        name: 'useCacheTtl',
        type: 'number',
        default: 60,
        description: 'How long to keep the cache after processing',
        displayOptions: {
          show: {
            useCache: [true],
            operation: ['transcribe', 'identifySpeakers', 'extractOcr', 'analyzeScene', 'extractSlides'],
          },
        },
      },
      {
        displayName: 'Keep Cache After Processing',
        name: 'keepCache',
        type: 'boolean',
        default: false,
        description: 'Keep the cache for future queries. If true, returns cacheId in metadata for reuse.',
        displayOptions: {
          show: {
            useCache: [true],
            operation: ['transcribe', 'identifySpeakers', 'extractOcr', 'analyzeScene', 'extractSlides'],
          },
        },
      },
      // Chunking options
      {
        displayName: 'Enable Chunking',
        name: 'enableChunking',
        type: 'boolean',
        default: false,
        description: 'Whether to split long videos into chunks for processing',
      },
      {
        displayName: 'Chunk Duration (Minutes)',
        name: 'chunkDuration',
        type: 'number',
        default: 10,
        description: 'Duration of each chunk in minutes',
        displayOptions: {
          show: {
            enableChunking: [true],
          },
        },
      },
      {
        displayName: 'Video Duration (Minutes)',
        name: 'videoDuration',
        type: 'number',
        default: 0,
        description: 'Total video duration in minutes (required for chunking if not auto-detected)',
        displayOptions: {
          show: {
            enableChunking: [true],
          },
        },
      },
      // Time range options
      {
        displayName: 'Start Time',
        name: 'startTime',
        type: 'string',
        default: '',
        placeholder: '1:30 or 0:01:30',
        description: 'Start transcription from this time (MM:SS or HH:MM:SS format)',
      },
      {
        displayName: 'End Time',
        name: 'endTime',
        type: 'string',
        default: '',
        placeholder: '5:00 or 0:05:00',
        description: 'Stop transcription at this time (MM:SS or HH:MM:SS format)',
      },
      // Advanced options
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
              { name: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
              { name: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
              { name: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' },
              { name: 'Gemini 1.5 Pro', value: 'gemini-1.5-pro' },
              { name: 'Gemini 1.5 Flash', value: 'gemini-1.5-flash' },
            ],
            default: 'gemini-2.5-flash',
            description: 'Gemini model to use for video analysis',
          },
          {
            displayName: 'Max Output Tokens',
            name: 'maxOutputTokens',
            type: 'number',
            default: 8192,
            description: 'Maximum tokens in the response',
          },
          {
            displayName: 'Custom Instructions',
            name: 'customInstructions',
            type: 'string',
            typeOptions: {
              rows: 4,
            },
            default: '',
            description: 'Additional instructions to append to the prompt',
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
        const options = this.getNodeParameter('options', i, {}) as {
          model?: string;
          maxOutputTokens?: number;
          customInstructions?: string;
        };

        // Get credentials
        const credentials = await this.getCredentials(
          credentialType === 'vertexai' ? 'googleVertexAiApi' : 'googleAiStudioApi'
        );

        const geminiCredentials: GeminiCredentials = credentialType === 'vertexai'
          ? {
              type: 'vertexai',
              projectId: credentials.projectId as string,
              location: credentials.location as string || 'us-central1',
              serviceAccountKey: credentials.serviceAccountKey as string | undefined,
              authMethod: credentials.authMethod as string || 'adc',
            }
          : {
              type: 'aistudio',
              apiKey: credentials.apiKey as string,
            };

        // Handle cache operations that don't require video input
        if (operation === 'listCaches') {
          const caches = await listVideoCaches(geminiCredentials);
          returnData.push({
            json: {
              caches,
              count: caches.length,
              metadata: {
                operation,
                processedAt: new Date().toISOString(),
              },
            },
          });
          continue;
        }

        if (operation === 'deleteCache') {
          const cacheId = this.getNodeParameter('cacheId', i) as string;
          if (!cacheId) {
            throw new NodeOperationError(this.getNode(), 'Cache ID is required', { itemIndex: i });
          }
          const deleteResult = await deleteVideoCache(geminiCredentials, cacheId);
          returnData.push({
            json: {
              ...deleteResult,
              cacheId,
              metadata: {
                operation,
                processedAt: new Date().toISOString(),
              },
            },
          });
          continue;
        }

        if (operation === 'queryCache') {
          const cacheId = this.getNodeParameter('cacheId', i) as string;
          const cachePrompt = this.getNodeParameter('cachePrompt', i) as string;

          if (!cacheId) {
            throw new NodeOperationError(this.getNode(), 'Cache ID is required', { itemIndex: i });
          }
          if (!cachePrompt) {
            throw new NodeOperationError(this.getNode(), 'Prompt is required for cache query', { itemIndex: i });
          }

          const queryResult = await queryVideoCache(
            geminiCredentials,
            cacheId,
            cachePrompt,
            {
              model: options.model,
              maxOutputTokens: options.maxOutputTokens,
            }
          );

          returnData.push({
            json: {
              ...queryResult,
              metadata: {
                operation,
                cacheId,
                prompt: cachePrompt,
                model: options.model || 'gemini-2.5-flash',
                processedAt: new Date().toISOString(),
              },
            },
          });
          continue;
        }

        // For video-based operations, get video content
        const videoSource = this.getNodeParameter('videoSource', i) as string;
        const outputLanguage = this.getNodeParameter('outputLanguage', i) as string;
        const enableChunking = this.getNodeParameter('enableChunking', i) as boolean;
        const startTime = this.getNodeParameter('startTime', i, '') as string;
        const endTime = this.getNodeParameter('endTime', i, '') as string;

        let videoInfo: VideoInfo;

        if (videoSource === 'url') {
          const videoUrl = this.getNodeParameter('videoUrl', i) as string;

          if (!videoUrl) {
            throw new NodeOperationError(this.getNode(), 'Video URL is required', { itemIndex: i });
          }

          if (isYouTubeUrl(videoUrl)) {
            const videoId = extractYouTubeVideoId(videoUrl);
            if (!videoId) {
              throw new NodeOperationError(this.getNode(), 'Invalid YouTube URL', { itemIndex: i });
            }
            videoInfo = await fetchYouTubeVideo(videoId);
          } else {
            videoInfo = await downloadVideoFromUrl(videoUrl);
          }
        } else if (videoSource === 'base64') {
          // Base64 encoded data
          const videoBase64 = this.getNodeParameter('videoBase64', i) as string;
          const videoMimeType = this.getNodeParameter('videoMimeType', i, 'video/mp4') as string;

          if (!videoBase64) {
            throw new NodeOperationError(
              this.getNode(),
              'Video Base64 data is required',
              { itemIndex: i }
            );
          }

          videoInfo = {
            mimeType: videoMimeType,
            data: videoBase64,
            source: 'base64',
          };
        } else {
          // Binary data
          const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
          const binaryData = items[i].binary?.[binaryPropertyName];

          if (!binaryData) {
            throw new NodeOperationError(
              this.getNode(),
              `No binary data found in property "${binaryPropertyName}"`,
              { itemIndex: i }
            );
          }

          videoInfo = {
            mimeType: binaryData.mimeType || 'video/mp4',
            data: binaryData.data,
            source: 'base64',
          };
        }

        // Handle createCache operation
        if (operation === 'createCache') {
          const cacheName = this.getNodeParameter('cacheName', i, '') as string;
          const cacheTtl = this.getNodeParameter('cacheTtl', i, 60) as number;

          const videoContent = prepareVideoContent(videoInfo);
          const cacheResult = await createVideoCache(
            geminiCredentials,
            videoContent,
            {
              displayName: cacheName || `video-cache-${Date.now()}`,
              ttlMinutes: cacheTtl,
              model: options.model,
            }
          );

          returnData.push({
            json: {
              ...cacheResult,
              metadata: {
                operation,
                source: videoInfo.source,
                title: videoInfo.title,
                model: options.model || 'gemini-2.5-flash',
                processedAt: new Date().toISOString(),
              },
            },
          });
          continue;
        }

        // Check if useCache is enabled for standard operations
        const useCache = this.getNodeParameter('useCache', i, false) as boolean;

        // Standard video processing operations
        let result: any;
        let cacheId: string | null = null;

        if (useCache) {
          // Use context caching for cost savings
          const useCacheTtl = this.getNodeParameter('useCacheTtl', i, 60) as number;
          const keepCache = this.getNodeParameter('keepCache', i, false) as boolean;

          // Step 1: Create cache for the video
          const videoContent = prepareVideoContent(videoInfo);
          const cacheResult = await createVideoCache(
            geminiCredentials,
            videoContent,
            {
              displayName: `auto-cache-${operation}-${Date.now()}`,
              ttlMinutes: useCacheTtl,
              model: options.model,
            }
          );
          cacheId = cacheResult.cacheId;

          // Step 2: Query the cache with the operation prompt
          const prompt = getPromptForOperation(
            operation as 'transcribe' | 'identifySpeakers' | 'extractOcr' | 'analyzeScene' | 'extractSlides',
            {
              language: outputLanguage,
              customInstructions: options.customInstructions,
              startTime,
              endTime,
            }
          );

          result = await queryVideoCache(
            geminiCredentials,
            cacheId,
            prompt,
            {
              model: options.model,
              maxOutputTokens: options.maxOutputTokens,
            }
          );

          // Step 3: Delete cache if not keeping it
          if (!keepCache) {
            try {
              await deleteVideoCache(geminiCredentials, cacheId);
              cacheId = null;
            } catch {
              // Ignore deletion errors, cache will expire anyway
            }
          }
        } else if (enableChunking && videoInfo.data) {
          // Chunked processing for long videos
          const chunkDuration = this.getNodeParameter('chunkDuration', i) as number;
          const videoDuration = this.getNodeParameter('videoDuration', i) as number;

          if (!videoDuration) {
            throw new NodeOperationError(
              this.getNode(),
              'Video duration is required for chunked processing',
              { itemIndex: i }
            );
          }

          const chunks = calculateChunks(videoDuration * 60, chunkDuration);
          const chunkResults: Array<{ index: number; startSeconds: number; result: any }> = [];

          for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
            const chunk = chunks[chunkIndex];

            // Build prompt with chunking instructions
            const prompt = getPromptForOperation(
              operation as 'transcribe' | 'identifySpeakers' | 'extractOcr' | 'analyzeScene' | 'extractSlides',
              {
                language: outputLanguage,
                chunkIndex,
                totalChunks: chunks.length,
                chunkStartTime: chunk.startTime,
                customInstructions: options.customInstructions,
                startTime,
                endTime,
              }
            );

            // Note: For real chunking, you'd need to split the video file
            // This simplified version processes the whole video with chunk context
            const videoContent = prepareVideoContent(videoInfo);
            const chunkResult = await callGeminiWithVideo(
              geminiCredentials,
              videoContent,
              prompt,
              {
                model: options.model,
                maxOutputTokens: options.maxOutputTokens,
              }
            );

            chunkResults.push({
              index: chunkIndex,
              startSeconds: chunk.startSeconds,
              result: chunkResult,
            });
          }

          // Merge chunk results
          result = mergeTranscriptionResults(chunkResults);
        } else {
          // Single video processing (direct, no cache)
          const prompt = getPromptForOperation(
            operation as 'transcribe' | 'identifySpeakers' | 'extractOcr' | 'analyzeScene' | 'extractSlides',
            {
              language: outputLanguage,
              customInstructions: options.customInstructions,
              startTime,
              endTime,
            }
          );

          const videoContent = prepareVideoContent(videoInfo);
          result = await callGeminiWithVideo(
            geminiCredentials,
            videoContent,
            prompt,
            {
              model: options.model,
              maxOutputTokens: options.maxOutputTokens,
            }
          );
        }

        // Add metadata
        const outputData = {
          ...result,
          metadata: {
            operation,
            source: videoInfo.source,
            title: videoInfo.title,
            model: options.model || 'gemini-2.5-flash',
            processedAt: new Date().toISOString(),
            timeRange: (startTime || endTime) ? {
              start: startTime || null,
              end: endTime || null,
            } : null,
            useCache,
            cacheId: cacheId || undefined,
          },
        };

        returnData.push({ json: outputData });
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
