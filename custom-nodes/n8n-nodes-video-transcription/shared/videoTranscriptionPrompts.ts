/**
 * Video Transcription Prompts
 * Based on Google's multimodal_video_transcription.ipynb patterns
 */

export const NOT_FOUND = 'NOT_FOUND';

/**
 * Basic transcription prompt - transcribes audio with timestamps
 */
export const TRANSCRIPTION_PROMPT = `**Task - Transcription**

- Watch the video and listen carefully to the audio.
- Transcribe the video's audio verbatim.
- Include the start timecode (MM:SS) for each speech segment.
- If there are pauses or gaps in speech, start a new segment.

**Output Format:**
Return a JSON object with this structure:
{
  "transcripts": [
    {"start": "00:00", "text": "transcribed text here"},
    {"start": "00:15", "text": "next segment text"}
  ],
  "language": "detected language code (en, fr, es, etc.)",
  "duration": "total video duration in MM:SS format"
}`;

/**
 * Transcription with speaker diarization prompt
 */
export const SPEAKER_DIARIZATION_PROMPT = `**Task 1 - Transcripts**

- Watch the video and listen carefully to the audio.
- Identify the distinct voices using a voice ID (1, 2, 3, etc.).
- Transcribe the video's audio verbatim with voice diarization.
- Include the start timecode (MM:SS) for each speech segment.

**Task 2 - Speakers**

- For each voice ID from Task 1, extract information about the corresponding speaker.
- Use visual and audio cues to identify speakers.
- If a piece of information cannot be found, use "${NOT_FOUND}" as the value.

**Output Format:**
Return a JSON object with this structure:
{
  "task1_transcripts": [
    {"start": "00:00", "text": "transcribed text here", "voice": 1},
    {"start": "00:15", "text": "response from another person", "voice": 2}
  ],
  "task2_speakers": [
    {
      "voice": 1,
      "name": "Speaker name or ${NOT_FOUND}",
      "company": "Company name or ${NOT_FOUND}",
      "position": "Job title or ${NOT_FOUND}",
      "role_in_video": "host/guest/interviewer/interviewee/presenter/etc."
    }
  ],
  "language": "detected language code",
  "duration": "total video duration in MM:SS format"
}`;

/**
 * OCR extraction prompt - extracts visible text from video frames
 */
export const OCR_EXTRACTION_PROMPT = `**Task - Visual Text Extraction (OCR)**

- Watch the video carefully and identify all visible text on screen.
- This includes: titles, captions, subtitles, on-screen graphics, slides, documents, signs, labels, etc.
- Note the timestamp when each text appears.
- Group text that appears together (e.g., on the same slide or graphic).

**Output Format:**
Return a JSON object with this structure:
{
  "text_occurrences": [
    {
      "start": "00:00",
      "end": "00:30",
      "type": "title/slide/caption/graphic/document/sign/other",
      "text": "The visible text content",
      "position": "top/center/bottom/left/right/full-screen"
    }
  ],
  "summary": {
    "total_text_elements": 10,
    "types_found": ["title", "slide", "caption"]
  }
}`;

/**
 * Full scene analysis prompt - combines transcription, speaker identification, and visual analysis
 */
export const SCENE_ANALYSIS_PROMPT = `**Comprehensive Video Analysis**

Perform a complete analysis of this video including:

**Task 1 - Transcription with Speaker Diarization**
- Transcribe all spoken content with timestamps (MM:SS format).
- Identify distinct speakers using voice IDs (1, 2, 3, etc.).
- For each speaker, extract: name, company, position, and role in video.
- Use "${NOT_FOUND}" if information cannot be determined.

**Task 2 - Visual Text Extraction (OCR)**
- Extract all visible text: titles, slides, captions, graphics, documents.
- Note timestamps and positions.

**Task 3 - Scene Description**
- Describe key visual elements and scene changes.
- Identify the setting/environment.
- Note any significant visual events or transitions.

**Task 4 - Content Summary**
- Provide a concise summary of the video content.
- List main topics discussed.
- Identify key takeaways or conclusions.

**Output Format:**
Return a JSON object with this structure:
{
  "transcription": {
    "segments": [
      {"start": "00:00", "text": "transcribed text", "voice": 1}
    ],
    "speakers": [
      {
        "voice": 1,
        "name": "Name or ${NOT_FOUND}",
        "company": "Company or ${NOT_FOUND}",
        "position": "Position or ${NOT_FOUND}",
        "role_in_video": "role description"
      }
    ]
  },
  "visual_text": [
    {
      "start": "00:00",
      "end": "00:30",
      "type": "slide",
      "text": "visible text content",
      "position": "center"
    }
  ],
  "scenes": [
    {
      "start": "00:00",
      "end": "02:30",
      "description": "Scene description",
      "setting": "office/studio/outdoor/etc.",
      "key_elements": ["element1", "element2"]
    }
  ],
  "summary": {
    "overview": "Brief video summary",
    "topics": ["topic1", "topic2"],
    "key_takeaways": ["takeaway1", "takeaway2"],
    "duration": "MM:SS",
    "language": "en"
  }
}`;

/**
 * Chunking instructions - appended when processing long videos
 */
export const CHUNKING_INSTRUCTIONS = (chunkIndex: number, totalChunks: number, startTime: string) => `
**IMPORTANT: This is chunk ${chunkIndex + 1} of ${totalChunks} from a longer video.**
- This segment starts at ${startTime} in the original video.
- Adjust all timestamps relative to ${startTime}.
- If a speaker or topic continues from a previous chunk, maintain consistency.
- Provide complete analysis for this segment only.
`;

/**
 * Time range instructions - appended when processing a specific time range
 */
export const TIME_RANGE_INSTRUCTIONS = (startTime?: string, endTime?: string) => {
  if (!startTime && !endTime) return '';

  let instructions = '\n**TIME RANGE CONSTRAINT:**\n';

  if (startTime && endTime) {
    instructions += `- ONLY transcribe/analyze content between ${startTime} and ${endTime}.\n`;
    instructions += `- Ignore any content before ${startTime} or after ${endTime}.\n`;
    instructions += `- Timestamps in the output should be relative to the video start (not the segment).\n`;
  } else if (startTime) {
    instructions += `- Start transcription/analysis from ${startTime}.\n`;
    instructions += `- Ignore any content before ${startTime}.\n`;
  } else if (endTime) {
    instructions += `- Stop transcription/analysis at ${endTime}.\n`;
    instructions += `- Ignore any content after ${endTime}.\n`;
  }

  return instructions;
};

/**
 * Language-specific prompts
 */
export const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  en: 'Provide all analysis output in English.',
  fr: 'Fournissez toute l\'analyse en français.',
  es: 'Proporcione todo el análisis en español.',
  de: 'Geben Sie die gesamte Analyse auf Deutsch aus.',
  it: 'Fornire tutta l\'analisi in italiano.',
  pt: 'Forneça toda a análise em português.',
  auto: 'Detect the primary language of the video and provide output in that language.'
};

/**
 * Get the appropriate prompt for an operation
 */
export function getPromptForOperation(
  operation: 'transcribe' | 'identifySpeakers' | 'extractOcr' | 'analyzeScene',
  options: {
    language?: string;
    chunkIndex?: number;
    totalChunks?: number;
    chunkStartTime?: string;
    customInstructions?: string;
    startTime?: string;
    endTime?: string;
  } = {}
): string {
  let basePrompt: string;

  switch (operation) {
    case 'transcribe':
      basePrompt = TRANSCRIPTION_PROMPT;
      break;
    case 'identifySpeakers':
      basePrompt = SPEAKER_DIARIZATION_PROMPT;
      break;
    case 'extractOcr':
      basePrompt = OCR_EXTRACTION_PROMPT;
      break;
    case 'analyzeScene':
      basePrompt = SCENE_ANALYSIS_PROMPT;
      break;
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }

  // Add language instructions if specified
  const langKey = options.language || 'auto';
  const langInstructions = LANGUAGE_INSTRUCTIONS[langKey] || LANGUAGE_INSTRUCTIONS.auto;
  basePrompt = `${langInstructions}\n\n${basePrompt}`;

  // Add time range instructions if specified
  if (options.startTime || options.endTime) {
    basePrompt = `${basePrompt}\n${TIME_RANGE_INSTRUCTIONS(options.startTime, options.endTime)}`;
  }

  // Add chunking instructions if processing a chunk
  if (options.chunkIndex !== undefined && options.totalChunks !== undefined && options.chunkStartTime) {
    basePrompt = `${basePrompt}\n${CHUNKING_INSTRUCTIONS(options.chunkIndex, options.totalChunks, options.chunkStartTime)}`;
  }

  // Add custom instructions if provided
  if (options.customInstructions) {
    basePrompt = `${basePrompt}\n\n**Additional Instructions:**\n${options.customInstructions}`;
  }

  return basePrompt;
}
