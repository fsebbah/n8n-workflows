/**
 * VideoClient - Handles video processing for Gemini multimodal analysis
 * Supports YouTube URLs, direct URLs, and video chunking for long videos
 */

import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

export interface VideoInfo {
  mimeType: string;
  data?: string; // Base64 encoded
  uri?: string; // For File API or GCS
  duration?: number; // Duration in seconds
  title?: string;
  source: 'youtube' | 'url' | 'base64' | 'gcs';
}

export interface VideoChunk {
  index: number;
  startTime: string; // MM:SS format
  startSeconds: number;
  endSeconds: number;
  data: string; // Base64 encoded
  mimeType: string;
}

export interface GeminiCredentials {
  type: 'vertexai' | 'aistudio';
  projectId?: string;
  location?: string;
  apiKey?: string;
  accessToken?: string;
}

/**
 * Extract YouTube video ID from various URL formats
 */
export function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

/**
 * Check if URL is a YouTube URL
 */
export function isYouTubeUrl(url: string): boolean {
  return extractYouTubeVideoId(url) !== null;
}

/**
 * Get video MIME type from URL or content-type header
 */
export function getVideoMimeType(url: string, contentType?: string): string {
  if (contentType) {
    // Clean up content-type (remove charset, etc.)
    const mimeType = contentType.split(';')[0].trim();
    if (mimeType.startsWith('video/')) {
      return mimeType;
    }
  }

  // Guess from URL extension
  const extension = url.split('.').pop()?.toLowerCase().split('?')[0];
  const mimeTypes: Record<string, string> = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    avi: 'video/avi',
    mov: 'video/quicktime',
    mkv: 'video/x-matroska',
    flv: 'video/x-flv',
    wmv: 'video/x-ms-wmv',
    m4v: 'video/x-m4v',
    '3gp': 'video/3gpp',
  };

  return mimeTypes[extension || ''] || 'video/mp4';
}

/**
 * Download video from URL and return as base64
 */
export async function downloadVideoFromUrl(url: string): Promise<VideoInfo> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    const request = protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }, (response) => {
      // Handle redirects
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        downloadVideoFromUrl(response.headers.location).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download video: HTTP ${response.statusCode}`));
        return;
      }

      const chunks: Buffer[] = [];
      const contentType = response.headers['content-type'];
      const contentLength = parseInt(response.headers['content-length'] || '0', 10);

      // Check file size (Gemini has limits)
      const maxSize = 2 * 1024 * 1024 * 1024; // 2GB limit
      if (contentLength > maxSize) {
        reject(new Error(`Video file too large: ${contentLength} bytes (max: ${maxSize})`));
        return;
      }

      response.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const base64 = buffer.toString('base64');
        const mimeType = getVideoMimeType(url, contentType);

        resolve({
          mimeType,
          data: base64,
          source: 'url'
        });
      });

      response.on('error', reject);
    });

    request.on('error', reject);
    request.setTimeout(300000, () => { // 5 minute timeout
      request.destroy();
      reject(new Error('Video download timeout'));
    });
  });
}

/**
 * Fetch YouTube video using ytdl-core (requires separate installation)
 * This is a simplified implementation - in production, consider using
 * YouTube Data API or a dedicated service
 */
export async function fetchYouTubeVideo(videoId: string): Promise<VideoInfo> {
  // For YouTube, we'll use the YouTube iframe embed approach
  // Gemini can process YouTube videos via their URL directly in some contexts
  // But for the File API approach, we need to download the video

  // Option 1: Use YouTube's oEmbed to get video info
  const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;

  return new Promise((resolve, reject) => {
    https.get(oEmbedUrl, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try {
          const info = JSON.parse(data);
          // For YouTube, we'll return a URI reference that Gemini can handle
          // Note: Direct YouTube video download requires ytdl-core or similar
          resolve({
            mimeType: 'video/mp4',
            uri: `https://www.youtube.com/watch?v=${videoId}`,
            title: info.title,
            source: 'youtube'
          });
        } catch (e) {
          reject(new Error(`Failed to get YouTube video info: ${e}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Convert time string (MM:SS or HH:MM:SS) to seconds
 */
export function timeToSeconds(time: string): number {
  const parts = time.split(':').map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

/**
 * Convert seconds to MM:SS format
 */
export function secondsToTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Calculate chunk boundaries for a video
 * @param durationSeconds - Total video duration in seconds
 * @param chunkDurationMinutes - Target chunk duration in minutes (default: 10)
 */
export function calculateChunks(
  durationSeconds: number,
  chunkDurationMinutes: number = 10
): Array<{ startSeconds: number; endSeconds: number; startTime: string }> {
  const chunkDurationSeconds = chunkDurationMinutes * 60;
  const chunks: Array<{ startSeconds: number; endSeconds: number; startTime: string }> = [];

  let currentStart = 0;
  while (currentStart < durationSeconds) {
    const endSeconds = Math.min(currentStart + chunkDurationSeconds, durationSeconds);
    chunks.push({
      startSeconds: currentStart,
      endSeconds,
      startTime: secondsToTime(currentStart)
    });
    currentStart = endSeconds;
  }

  return chunks;
}

/**
 * Merge chunk results back into a single result
 */
export function mergeTranscriptionResults(
  chunkResults: Array<{
    index: number;
    startSeconds: number;
    result: any;
  }>
): any {
  // Sort by index
  const sorted = [...chunkResults].sort((a, b) => a.index - b.index);

  // Merge transcripts
  const mergedTranscripts: any[] = [];
  const speakersMap = new Map<number, any>();

  for (const chunk of sorted) {
    const result = chunk.result;

    // Handle different result formats
    if (result.transcripts) {
      // Simple transcription format
      for (const transcript of result.transcripts) {
        // Adjust timestamp based on chunk start
        const originalSeconds = timeToSeconds(transcript.start);
        const adjustedSeconds = originalSeconds + chunk.startSeconds;
        mergedTranscripts.push({
          ...transcript,
          start: secondsToTime(adjustedSeconds)
        });
      }
    } else if (result.task1_transcripts) {
      // Speaker diarization format
      for (const transcript of result.task1_transcripts) {
        const originalSeconds = timeToSeconds(transcript.start);
        const adjustedSeconds = originalSeconds + chunk.startSeconds;
        mergedTranscripts.push({
          ...transcript,
          start: secondsToTime(adjustedSeconds)
        });
      }

      // Merge speakers
      if (result.task2_speakers) {
        for (const speaker of result.task2_speakers) {
          // Keep the most complete speaker info
          const existing = speakersMap.get(speaker.voice);
          if (!existing || hasMoreInfo(speaker, existing)) {
            speakersMap.set(speaker.voice, speaker);
          }
        }
      }
    } else if (result.transcription?.segments) {
      // Full analysis format
      for (const segment of result.transcription.segments) {
        const originalSeconds = timeToSeconds(segment.start);
        const adjustedSeconds = originalSeconds + chunk.startSeconds;
        mergedTranscripts.push({
          ...segment,
          start: secondsToTime(adjustedSeconds)
        });
      }

      if (result.transcription.speakers) {
        for (const speaker of result.transcription.speakers) {
          const existing = speakersMap.get(speaker.voice);
          if (!existing || hasMoreInfo(speaker, existing)) {
            speakersMap.set(speaker.voice, speaker);
          }
        }
      }
    }
  }

  // Build merged result based on original format
  const firstResult = sorted[0]?.result;
  if (firstResult?.task1_transcripts) {
    return {
      task1_transcripts: mergedTranscripts,
      task2_speakers: Array.from(speakersMap.values()),
      language: firstResult.language,
      duration: secondsToTime(sorted[sorted.length - 1].startSeconds +
        timeToSeconds(firstResult.duration || '00:00'))
    };
  } else if (firstResult?.transcription) {
    // Merge full analysis results
    const visualText: any[] = [];
    const scenes: any[] = [];
    const topics = new Set<string>();
    const takeaways: string[] = [];

    for (const chunk of sorted) {
      const result = chunk.result;

      if (result.visual_text) {
        for (const vt of result.visual_text) {
          const startSeconds = timeToSeconds(vt.start) + chunk.startSeconds;
          const endSeconds = timeToSeconds(vt.end || vt.start) + chunk.startSeconds;
          visualText.push({
            ...vt,
            start: secondsToTime(startSeconds),
            end: secondsToTime(endSeconds)
          });
        }
      }

      if (result.scenes) {
        for (const scene of result.scenes) {
          const startSeconds = timeToSeconds(scene.start) + chunk.startSeconds;
          const endSeconds = timeToSeconds(scene.end || scene.start) + chunk.startSeconds;
          scenes.push({
            ...scene,
            start: secondsToTime(startSeconds),
            end: secondsToTime(endSeconds)
          });
        }
      }

      if (result.summary?.topics) {
        result.summary.topics.forEach((t: string) => topics.add(t));
      }

      if (result.summary?.key_takeaways) {
        takeaways.push(...result.summary.key_takeaways);
      }
    }

    return {
      transcription: {
        segments: mergedTranscripts,
        speakers: Array.from(speakersMap.values())
      },
      visual_text: visualText,
      scenes,
      summary: {
        overview: firstResult.summary?.overview || '',
        topics: Array.from(topics),
        key_takeaways: takeaways,
        duration: secondsToTime(sorted[sorted.length - 1].startSeconds +
          timeToSeconds(firstResult.summary?.duration || '00:00')),
        language: firstResult.summary?.language || 'en'
      }
    };
  }

  // Default: return simple transcription format
  return {
    transcripts: mergedTranscripts,
    language: firstResult?.language || 'en',
    duration: secondsToTime(sorted[sorted.length - 1].startSeconds +
      timeToSeconds(firstResult?.duration || '00:00'))
  };
}

/**
 * Check if speaker info has more non-NOT_FOUND values
 */
function hasMoreInfo(newSpeaker: any, existingSpeaker: any): boolean {
  const countInfo = (speaker: any) => {
    let count = 0;
    for (const key of ['name', 'company', 'position', 'role_in_video']) {
      if (speaker[key] && speaker[key] !== 'NOT_FOUND') {
        count++;
      }
    }
    return count;
  };

  return countInfo(newSpeaker) > countInfo(existingSpeaker);
}

/**
 * Prepare video content for Gemini API
 */
export function prepareVideoContent(videoInfo: VideoInfo): {
  inlineData?: { mimeType: string; data: string };
  fileData?: { mimeType: string; fileUri: string };
} {
  if (videoInfo.data) {
    return {
      inlineData: {
        mimeType: videoInfo.mimeType,
        data: videoInfo.data
      }
    };
  } else if (videoInfo.uri) {
    return {
      fileData: {
        mimeType: videoInfo.mimeType,
        fileUri: videoInfo.uri
      }
    };
  }

  throw new Error('Video must have either data or uri');
}

/**
 * Call Gemini API with video content
 */
export async function callGeminiWithVideo(
  credentials: GeminiCredentials,
  videoContent: ReturnType<typeof prepareVideoContent>,
  prompt: string,
  options: {
    model?: string;
    maxOutputTokens?: number;
  } = {}
): Promise<any> {
  const model = options.model || 'gemini-2.5-flash';
  const maxOutputTokens = options.maxOutputTokens || 8192;

  const requestBody = {
    contents: [{
      role: 'user',
      parts: [
        videoContent.inlineData
          ? { inlineData: videoContent.inlineData }
          : { fileData: videoContent.fileData },
        { text: prompt }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens,
      responseMimeType: 'application/json'
    }
  };

  let endpoint: string;
  let headers: Record<string, string>;

  if (credentials.type === 'vertexai') {
    endpoint = `https://${credentials.location}-aiplatform.googleapis.com/v1/projects/${credentials.projectId}/locations/${credentials.location}/publishers/google/models/${model}:generateContent`;
    headers = {
      'Authorization': `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json'
    };
  } else {
    endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${credentials.apiKey}`;
    headers = {
      'Content-Type': 'application/json'
    };
  }

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(endpoint);
    const requestOptions = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(JSON.stringify(requestBody))
      }
    };

    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);

          if (response.error) {
            reject(new Error(`Gemini API error: ${response.error.message}`));
            return;
          }

          // Extract the generated content
          const content = response.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!content) {
            reject(new Error('No content in Gemini response'));
            return;
          }

          // Parse JSON response
          try {
            resolve(JSON.parse(content));
          } catch {
            // If not valid JSON, return as-is
            resolve({ raw: content });
          }
        } catch (e) {
          reject(new Error(`Failed to parse Gemini response: ${e}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(600000, () => { // 10 minute timeout for video processing
      req.destroy();
      reject(new Error('Gemini API request timeout'));
    });

    req.write(JSON.stringify(requestBody));
    req.end();
  });
}
