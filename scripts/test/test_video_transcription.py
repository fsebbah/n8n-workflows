#!/usr/bin/env python3
"""
Test script for Video Transcription n8n workflow.

Usage:
    python scripts/test/test_video_transcription.py <youtube_url> [options]

Examples:
    # Basic transcription
    python scripts/test/test_video_transcription.py "https://www.youtube.com/watch?v=VIDEO_ID"

    # With speaker identification
    python scripts/test/test_video_transcription.py "https://youtu.be/VIDEO_ID" -o identifySpeakers

    # Full analysis in French
    python scripts/test/test_video_transcription.py "https://www.youtube.com/watch?v=VIDEO_ID" -o analyzeScene -l fr

    # With output file
    python scripts/test/test_video_transcription.py "https://youtu.be/VIDEO_ID" -f output.json

    # Transcribe only from 1:30 to 5:00
    python scripts/test/test_video_transcription.py "https://youtu.be/VIDEO_ID" --start 1:30 --end 5:00

    # Start at 2 minutes
    python scripts/test/test_video_transcription.py "https://youtu.be/VIDEO_ID" --start 2:00
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
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


def is_local_file(path: str) -> bool:
    """Check if path is a local file."""
    return os.path.isfile(path)


def is_valid_video_source(source: str) -> bool:
    """Check if source is a valid video URL or local file."""
    # Check if it's a local file
    if is_local_file(source):
        return True

    # Check if it's a valid URL
    parsed = urlparse(source)
    if parsed.scheme in ('http', 'https') and parsed.netloc:
        return True

    return False


def get_video_identifier(source: str) -> str:
    """Get a short identifier for the video (YouTube ID, domain+path, or filename)."""
    # Check if it's a local file
    if is_local_file(source):
        return Path(source).stem[:40]

    # Try YouTube first
    video_id = extract_video_id(source)
    if video_id:
        return video_id

    # For direct URLs, use domain + sanitized path
    parsed = urlparse(source)
    domain = parsed.netloc.replace('www.', '').split('.')[0]
    path = parsed.path.strip('/').replace('/', '_')[:30]
    return f"{domain}_{path}" if path else domain


def parse_time(time_str: str) -> int:
    """Parse time string (MM:SS or HH:MM:SS) to seconds."""
    if not time_str:
        return 0

    parts = time_str.split(':')
    if len(parts) == 2:
        return int(parts[0]) * 60 + int(parts[1])
    elif len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    else:
        return int(time_str)


def format_time(seconds: int) -> str:
    """Format seconds to MM:SS or HH:MM:SS."""
    if seconds >= 3600:
        h = seconds // 3600
        m = (seconds % 3600) // 60
        s = seconds % 60
        return f"{h}:{m:02d}:{s:02d}"
    else:
        m = seconds // 60
        s = seconds % 60
        return f"{m}:{s:02d}"


def load_video_as_base64(file_path: str) -> tuple[str, str]:
    """Load a local video file and return base64 data with mime type."""
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    # Determine mime type from extension
    mime_types = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.avi': 'video/avi',
        '.mov': 'video/quicktime',
        '.mkv': 'video/x-matroska',
        '.m4v': 'video/x-m4v',
    }

    mime_type = mime_types.get(path.suffix.lower(), 'video/mp4')

    with open(path, 'rb') as f:
        import base64
        data = base64.b64encode(f.read()).decode('utf-8')

    return data, mime_type


def call_transcription_api(
    video_source: str,
    operation: str = 'transcribe',
    language: str = 'auto',
    webhook_url: str = 'http://localhost:5678/webhook/video-transcription',
    enable_chunking: bool = False,
    chunk_duration: int = 10,
    video_duration: int = 0,
    model: str = 'gemini-2.5-flash',
    custom_instructions: str = '',
    start_time: str = '',
    end_time: str = ''
) -> dict:
    """Call the video transcription n8n webhook."""

    payload = {
        'operation': operation,
        'language': language,
        'model': model
    }

    # Handle local file vs URL
    if is_local_file(video_source):
        print(f"Loading local file: {video_source}")
        video_data, mime_type = load_video_as_base64(video_source)
        file_size_mb = len(video_data) * 3 / 4 / 1024 / 1024  # Approximate original size
        print(f"File size: {file_size_mb:.1f} MB, MIME type: {mime_type}")
        payload['videoBase64'] = video_data
        payload['videoMimeType'] = mime_type
    else:
        payload['videoUrl'] = video_source

    if enable_chunking:
        payload['enableChunking'] = True
        payload['chunkDuration'] = chunk_duration
        payload['videoDuration'] = video_duration

    if start_time:
        payload['startTime'] = start_time

    if end_time:
        payload['endTime'] = end_time

    if custom_instructions:
        payload['customInstructions'] = custom_instructions

    print(f"Calling {webhook_url}...")
    # Don't print base64 data
    payload_display = {k: v for k, v in payload.items() if k != 'videoBase64'}
    if 'videoBase64' in payload:
        payload_display['videoBase64'] = f"<{len(payload['videoBase64'])} chars>"
    print(f"Payload: {json.dumps(payload_display, indent=2)}")

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
        '--start',
        dest='start_time',
        default='',
        help='Start time (MM:SS or HH:MM:SS format, e.g., 1:30 or 0:01:30)'
    )

    parser.add_argument(
        '--end',
        dest='end_time',
        default='',
        help='End time (MM:SS or HH:MM:SS format, e.g., 5:00 or 0:05:00)'
    )

    parser.add_argument(
        '-q', '--quiet',
        action='store_true',
        help='Only output JSON, no formatting'
    )

    args = parser.parse_args()

    # Validate video source (YouTube, direct URL, or local file)
    if not is_valid_video_source(args.youtube_url):
        print(f"Error: Invalid video source: {args.youtube_url}", file=sys.stderr)
        print("Accepted formats: YouTube URL, direct video URL, or local file path", file=sys.stderr)
        sys.exit(1)

    # Get video identifier for output filename
    video_id = get_video_identifier(args.youtube_url)
    is_local = is_local_file(args.youtube_url)

    # Validate time range
    if args.start_time and args.end_time:
        start_sec = parse_time(args.start_time)
        end_sec = parse_time(args.end_time)
        if start_sec >= end_sec:
            print(f"Error: Start time ({args.start_time}) must be before end time ({args.end_time})", file=sys.stderr)
            sys.exit(1)

    print(f"Video: {video_id}" + (" (local file)" if is_local else ""))
    print(f"Operation: {args.operation}")
    print(f"Language: {args.language}")
    print(f"Model: {args.model}")
    if args.start_time or args.end_time:
        time_range = f"{args.start_time or '0:00'} -> {args.end_time or 'end'}"
        print(f"Time range: {time_range}")
    print()

    # Validate chunking options
    if args.chunking and args.video_duration <= 0:
        print("Error: --video-duration is required when --chunking is enabled", file=sys.stderr)
        sys.exit(1)

    try:
        # Call the API with timing
        api_start_time = time.time()
        result = call_transcription_api(
            video_source=args.youtube_url,
            operation=args.operation,
            language=args.language,
            webhook_url=args.webhook,
            enable_chunking=args.chunking,
            chunk_duration=args.chunk_duration,
            video_duration=args.video_duration,
            model=args.model,
            custom_instructions=args.instructions,
            start_time=args.start_time,
            end_time=args.end_time
        )
        elapsed_time = time.time() - api_start_time

        # Add execution time to result
        result['_execution'] = {
            'elapsed_seconds': round(elapsed_time, 2),
            'elapsed_formatted': f"{int(elapsed_time // 60)}m {int(elapsed_time % 60)}s",
            'timestamp': datetime.now().isoformat(),
            'time_range': {
                'start': args.start_time or None,
                'end': args.end_time or None
            } if (args.start_time or args.end_time) else None
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
