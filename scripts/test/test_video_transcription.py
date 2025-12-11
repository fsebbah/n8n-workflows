#!/usr/bin/env python3
"""
Test script for Video Transcription n8n workflow.

Usage:
    python scripts/test_video_transcription.py <youtube_url> [options]

Examples:
    # Basic transcription
    python scripts/test_video_transcription.py "https://www.youtube.com/watch?v=VIDEO_ID"

    # With speaker identification
    python scripts/test_video_transcription.py "https://youtu.be/VIDEO_ID" -o identifySpeakers

    # Full analysis in French
    python scripts/test_video_transcription.py "https://www.youtube.com/watch?v=VIDEO_ID" -o analyzeScene -l fr

    # With output file
    python scripts/test_video_transcription.py "https://youtu.be/VIDEO_ID" -f output.json
"""

import argparse
import json
import os
import sys
from datetime import datetime
import time
from urllib.parse import urlparse, parse_qs
import requests


def extract_video_id(url: str) -> str | None:
    """Extract YouTube video ID from various URL formats."""
    parsed = urlparse(url)

    # youtu.be/VIDEO_ID
    if parsed.netloc == 'youtu.be':
        return parsed.path.lstrip('/')

    # youtube.com/watch?v=VIDEO_ID
    if parsed.netloc in ('www.youtube.com', 'youtube.com'):
        if parsed.path == '/watch':
            query = parse_qs(parsed.query)
            return query.get('v', [None])[0]
        # youtube.com/embed/VIDEO_ID or /v/VIDEO_ID
        if parsed.path.startswith(('/embed/', '/v/')):
            return parsed.path.split('/')[2]
        # youtube.com/shorts/VIDEO_ID
        if parsed.path.startswith('/shorts/'):
            return parsed.path.split('/')[2]

    return None


def call_transcription_api(
    video_url: str,
    operation: str = 'transcribe',
    language: str = 'auto',
    webhook_url: str = 'http://localhost:5678/webhook/video-transcription',
    enable_chunking: bool = False,
    chunk_duration: int = 10,
    video_duration: int = 0,
    model: str = 'gemini-2.5-flash',
    custom_instructions: str = ''
) -> dict:
    """Call the video transcription n8n webhook."""

    payload = {
        'videoUrl': video_url,
        'operation': operation,
        'language': language,
        'model': model
    }

    if enable_chunking:
        payload['enableChunking'] = True
        payload['chunkDuration'] = chunk_duration
        payload['videoDuration'] = video_duration

    if custom_instructions:
        payload['customInstructions'] = custom_instructions

    print(f"Calling {webhook_url}...")
    print(f"Payload: {json.dumps(payload, indent=2)}")

    response = requests.post(
        webhook_url,
        json=payload,
        headers={'Content-Type': 'application/json'},
        timeout=600  # 10 minutes timeout for video processing
    )

    response.raise_for_status()
    return response.json()


def save_result(result: dict, output_file: str):
    """Save result to JSON file."""
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(f"Result saved to: {output_file}")


def format_transcription(result: dict) -> str:
    """Format transcription result for display."""
    lines = []

    # Simple transcription format
    if 'transcripts' in result:
        lines.append("=== TRANSCRIPTION ===\n")
        for segment in result['transcripts']:
            lines.append(f"[{segment['start']}] {segment['text']}")
        if result.get('language'):
            lines.append(f"\nLanguage: {result['language']}")
        if result.get('duration'):
            lines.append(f"Duration: {result['duration']}")

    # Speaker diarization format
    elif 'task1_transcripts' in result:
        lines.append("=== TRANSCRIPTION WITH SPEAKERS ===\n")
        for segment in result['task1_transcripts']:
            voice = segment.get('voice', '?')
            lines.append(f"[{segment['start']}] Voice {voice}: {segment['text']}")

        if 'task2_speakers' in result:
            lines.append("\n=== SPEAKERS ===\n")
            for speaker in result['task2_speakers']:
                lines.append(f"Voice {speaker['voice']}:")
                lines.append(f"  Name: {speaker.get('name', 'NOT_FOUND')}")
                lines.append(f"  Company: {speaker.get('company', 'NOT_FOUND')}")
                lines.append(f"  Position: {speaker.get('position', 'NOT_FOUND')}")
                lines.append(f"  Role: {speaker.get('role_in_video', 'NOT_FOUND')}")
                lines.append("")

    # Full analysis format
    elif 'transcription' in result:
        lines.append("=== FULL ANALYSIS ===\n")

        # Transcription
        if result['transcription'].get('segments'):
            lines.append("--- Transcription ---")
            for segment in result['transcription']['segments']:
                voice = segment.get('voice', '?')
                lines.append(f"[{segment['start']}] Voice {voice}: {segment['text']}")

        # Speakers
        if result['transcription'].get('speakers'):
            lines.append("\n--- Speakers ---")
            for speaker in result['transcription']['speakers']:
                lines.append(f"Voice {speaker['voice']}: {speaker.get('name', 'NOT_FOUND')} ({speaker.get('role_in_video', 'NOT_FOUND')})")

        # Visual text
        if result.get('visual_text'):
            lines.append("\n--- Visual Text (OCR) ---")
            for vt in result['visual_text']:
                lines.append(f"[{vt['start']}-{vt.get('end', vt['start'])}] ({vt['type']}): {vt['text'][:100]}...")

        # Scenes
        if result.get('scenes'):
            lines.append("\n--- Scenes ---")
            for scene in result['scenes']:
                lines.append(f"[{scene['start']}-{scene.get('end', scene['start'])}] {scene['description']}")

        # Summary
        if result.get('summary'):
            lines.append("\n--- Summary ---")
            lines.append(f"Overview: {result['summary'].get('overview', 'N/A')}")
            if result['summary'].get('topics'):
                lines.append(f"Topics: {', '.join(result['summary']['topics'])}")
            if result['summary'].get('key_takeaways'):
                lines.append("Key Takeaways:")
                for takeaway in result['summary']['key_takeaways']:
                    lines.append(f"  - {takeaway}")

    # OCR format
    elif 'text_occurrences' in result:
        lines.append("=== OCR EXTRACTION ===\n")
        for occ in result['text_occurrences']:
            lines.append(f"[{occ['start']}-{occ.get('end', occ['start'])}] ({occ['type']}, {occ.get('position', 'N/A')})")
            lines.append(f"  {occ['text']}")
            lines.append("")

    # Metadata
    if result.get('metadata'):
        lines.append("\n=== METADATA ===")
        for key, value in result['metadata'].items():
            lines.append(f"{key}: {value}")

    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(
        description='Test Video Transcription n8n workflow',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )

    parser.add_argument(
        'youtube_url',
        help='YouTube video URL to transcribe'
    )

    parser.add_argument(
        '-o', '--operation',
        choices=['transcribe', 'identifySpeakers', 'extractOcr', 'analyzeScene'],
        default='transcribe',
        help='Operation to perform (default: transcribe)'
    )

    parser.add_argument(
        '-l', '--language',
        choices=['auto', 'en', 'fr', 'es', 'de', 'it', 'pt'],
        default='auto',
        help='Output language (default: auto)'
    )

    parser.add_argument(
        '-f', '--file',
        dest='output_file',
        help='Output file path (default: auto-generated)'
    )

    parser.add_argument(
        '-w', '--webhook',
        default='http://localhost:5678/webhook/video-transcription',
        help='Webhook URL (default: http://localhost:5678/webhook/video-transcription)'
    )

    parser.add_argument(
        '-m', '--model',
        default='gemini-2.5-flash',
        help='Gemini model to use (default: gemini-2.5-flash)'
    )

    parser.add_argument(
        '--chunking',
        action='store_true',
        help='Enable video chunking for long videos'
    )

    parser.add_argument(
        '--chunk-duration',
        type=int,
        default=10,
        help='Chunk duration in minutes (default: 10)'
    )

    parser.add_argument(
        '--video-duration',
        type=int,
        default=0,
        help='Video duration in minutes (required if chunking enabled)'
    )

    parser.add_argument(
        '-i', '--instructions',
        default='',
        help='Custom instructions to add to the prompt'
    )

    parser.add_argument(
        '-q', '--quiet',
        action='store_true',
        help='Only output JSON, no formatting'
    )

    args = parser.parse_args()

    # Validate YouTube URL
    video_id = extract_video_id(args.youtube_url)
    if not video_id:
        print(f"Error: Invalid YouTube URL: {args.youtube_url}", file=sys.stderr)
        sys.exit(1)

    print(f"Video ID: {video_id}")
    print(f"Operation: {args.operation}")
    print(f"Language: {args.language}")
    print(f"Model: {args.model}")
    print()

    # Validate chunking options
    if args.chunking and args.video_duration <= 0:
        print("Error: --video-duration is required when --chunking is enabled", file=sys.stderr)
        sys.exit(1)

    try:
        # Call the API with timing
        start_time = time.time()
        result = call_transcription_api(
            video_url=args.youtube_url,
            operation=args.operation,
            language=args.language,
            webhook_url=args.webhook,
            enable_chunking=args.chunking,
            chunk_duration=args.chunk_duration,
            video_duration=args.video_duration,
            model=args.model,
            custom_instructions=args.instructions
        )
        elapsed_time = time.time() - start_time

        # Add execution time to result
        result['_execution'] = {
            'elapsed_seconds': round(elapsed_time, 2),
            'elapsed_formatted': f"{int(elapsed_time // 60)}m {int(elapsed_time % 60)}s",
            'timestamp': datetime.now().isoformat()
        }

        # Generate output filename if not provided
        if not args.output_file:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            args.output_file = f"transcription_{video_id}_{args.operation}_{timestamp}.json"

        # Save result
        save_result(result, args.output_file)

        # Display formatted result
        if not args.quiet:
            print()
            print(format_transcription(result))
        else:
            print(json.dumps(result, indent=2, ensure_ascii=False))

        print(f"\n⏱️  Execution time: {result['_execution']['elapsed_formatted']} ({elapsed_time:.2f}s)")
        print(f"Success! Result saved to: {args.output_file}")

    except requests.exceptions.ConnectionError:
        print("Error: Cannot connect to n8n webhook. Is the server running?", file=sys.stderr)
        print(f"Webhook URL: {args.webhook}", file=sys.stderr)
        sys.exit(1)
    except requests.exceptions.Timeout:
        print("Error: Request timeout. Video processing may take longer.", file=sys.stderr)
        sys.exit(1)
    except requests.exceptions.HTTPError as e:
        print(f"Error: HTTP {e.response.status_code}", file=sys.stderr)
        try:
            error_detail = e.response.json()
            print(json.dumps(error_detail, indent=2), file=sys.stderr)
        except:
            print(e.response.text, file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
