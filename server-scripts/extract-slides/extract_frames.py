#!/usr/bin/env python3
"""
Extract slide frames from YouTube videos.

Usage:
    # From metadata JSON file
    python extract_frames.py --metadata slides.json --video "https://youtube.com/..." -o output/

    # From direct timestamps
    python extract_frames.py --video "https://youtube.com/..." --timestamps 15000,45000,120000 -o output/

    # Keep downloaded video
    python extract_frames.py --metadata slides.json --video "https://youtube.com/..." -o output/ --keep-video
"""

import argparse
import json
import os
import sys
import subprocess
import tempfile
import base64
import cv2
from pathlib import Path
from urllib.parse import urlparse


def is_youtube_url(url: str) -> bool:
    """Check if URL is a YouTube video."""
    parsed = urlparse(url)
    youtube_domains = ['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com']
    return parsed.netloc in youtube_domains


def find_node_path() -> str:
    """Find node.js path (nvm doesn't load in non-interactive SSH)."""
    # Check nvm locations first
    nvm_base = os.path.expanduser('~/.nvm/versions/node')
    if os.path.exists(nvm_base):
        # Get latest version
        versions = sorted(os.listdir(nvm_base), reverse=True)
        for v in versions:
            node_path = os.path.join(nvm_base, v, 'bin', 'node')
            if os.path.exists(node_path):
                return node_path

    # Fallback to common locations
    for path in ['/usr/bin/node', '/usr/local/bin/node']:
        if os.path.exists(path):
            return path

    return 'node'  # Hope it's in PATH


def download_youtube_video(url: str, output_path: str, cookies_from_browser: str = None) -> str:
    """Download YouTube video using yt-dlp."""
    node_path = find_node_path()

    cmd = [
        'yt-dlp',
        '--js-runtimes', f'node:{node_path}',  # Use node with full path
        '--remote-components', 'ejs:github',   # Download JS challenge solver from GitHub
        '-f', 'bestvideo[height<=720]+bestaudio/best[height<=720]/best',  # Prefer video+audio
        '--merge-output-format', 'mp4',        # Force mp4 output after merge
        '-o', output_path,
        '--no-playlist',
        '--progress',
    ]

    # Use browser cookies if specified
    if cookies_from_browser:
        cmd.extend(['--cookies-from-browser', cookies_from_browser])

    cmd.append(url)

    print(f"Downloading video: {url}")
    result = subprocess.run(cmd, capture_output=False, text=True)

    if result.returncode != 0:
        raise RuntimeError(f"yt-dlp failed with code {result.returncode}")

    # Find the actual downloaded file (extension may vary)
    base = output_path.rsplit('.', 1)[0] if '.' in output_path else output_path
    for ext in ['.mp4', '.webm', '.mkv', '.m4v', '.avi']:
        candidate = base + ext
        if os.path.exists(candidate):
            return candidate

    # Check if file exists as-is
    if os.path.exists(output_path):
        return output_path

    # Try glob to find any matching file
    import glob
    pattern = base + '.*'
    matches = glob.glob(pattern)
    if matches:
        return matches[0]

    # List /tmp to help debug
    import glob
    tmp_files = glob.glob('/tmp/tmp*')
    print(f"DEBUG: Looking for {base}.*, found in /tmp: {tmp_files[-5:] if tmp_files else 'none'}")

    raise RuntimeError(f"Downloaded file not found at {output_path}")


def download_direct_video(url: str, output_path: str) -> str:
    """Download video from direct URL."""
    import requests

    print(f"Downloading video: {url}")
    response = requests.get(url, stream=True, timeout=300)
    response.raise_for_status()

    total_size = int(response.headers.get('content-length', 0))
    downloaded = 0

    with open(output_path, 'wb') as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
            downloaded += len(chunk)
            if total_size:
                pct = (downloaded / total_size) * 100
                print(f"\rProgress: {pct:.1f}%", end='', flush=True)

    print()  # newline
    return output_path


def get_video_duration_ms(video_path: str) -> int:
    """Get video duration in milliseconds."""
    cap = cv2.VideoCapture(video_path)
    try:
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        if fps > 0 and frame_count > 0:
            return int((frame_count / fps) * 1000)
        return 0
    finally:
        cap.release()


def extract_frame(video_path: str, timestamp_ms: int, bounding_box: list = None) -> bytes:
    """Extract a single frame from video at given timestamp."""
    cap = cv2.VideoCapture(video_path)

    try:
        # Seek to timestamp
        cap.set(cv2.CAP_PROP_POS_MSEC, timestamp_ms)
        success, frame = cap.read()

        if not success:
            raise ValueError(f"Failed to read frame at {timestamp_ms}ms")

        # Crop if bounding box provided [ymin, xmin, ymax, xmax] on 0-1000 scale
        if bounding_box and len(bounding_box) == 4:
            height, width = frame.shape[:2]
            ymin = int(bounding_box[0] * height / 1000)
            xmin = int(bounding_box[1] * width / 1000)
            ymax = int(bounding_box[2] * height / 1000)
            xmax = int(bounding_box[3] * width / 1000)
            frame = frame[ymin:ymax, xmin:xmax]

        # Encode as JPEG
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
        return buffer.tobytes()

    finally:
        cap.release()


def sanitize_filename(title: str, max_length: int = 50) -> str:
    """Convert title to a safe filename."""
    if not title:
        return "slide"
    import re
    safe = re.sub(r'[^\w\s-]', '', title)
    safe = re.sub(r'\s+', '_', safe)
    return safe[:max_length]


def main():
    parser = argparse.ArgumentParser(
        description='Extract slide frames from videos (supports YouTube)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )

    parser.add_argument(
        '--video', '-v',
        required=True,
        help='Video URL (YouTube or direct) or local file path'
    )

    parser.add_argument(
        '--metadata', '-m',
        help='Path to slides metadata JSON (from extractSlides operation)'
    )

    parser.add_argument(
        '--timestamps', '-t',
        help='Comma-separated timestamps in ms (e.g., 15000,45000,120000)'
    )

    parser.add_argument(
        '--output', '-o',
        default='./slides',
        help='Output directory for extracted frames (default: ./slides)'
    )

    parser.add_argument(
        '--cookies-from-browser', '-c',
        choices=['chrome', 'firefox', 'edge', 'safari', 'opera', 'brave'],
        help='Browser to get cookies from (for YouTube authentication)'
    )

    parser.add_argument(
        '--keep-video', '-k',
        action='store_true',
        help='Keep downloaded video file in temp location'
    )

    parser.add_argument(
        '--save-video', '-s',
        metavar='DIR',
        help='Save downloaded video to specified directory (created if not exists)'
    )

    parser.add_argument(
        '--base64',
        action='store_true',
        help='Output base64 JSON instead of files'
    )

    parser.add_argument(
        '--quiet', '-q',
        action='store_true',
        help='Minimal output'
    )

    args = parser.parse_args()

    # Load slides from metadata or timestamps
    slides = []
    if args.metadata:
        with open(args.metadata, 'r') as f:
            data = json.load(f)
            slides = data.get('slides', [])
    elif args.timestamps:
        for i, ts in enumerate(args.timestamps.split(','), 1):
            slides.append({
                'id': i,
                'timestamp_ms': int(ts.strip()),
                'title': f'slide_{i}'
            })
    else:
        print("Error: Either --metadata or --timestamps is required")
        return 1

    if not slides:
        print("Error: No slides found")
        return 1

    if not args.quiet:
        print(f"Slides to extract: {len(slides)}")

    # Download video if needed
    video_path = args.video
    temp_video = None

    if args.video.startswith('http://') or args.video.startswith('https://'):
        temp_video = tempfile.mktemp(suffix='.mp4')

        if is_youtube_url(args.video):
            video_path = download_youtube_video(
                args.video,
                temp_video,
                args.cookies_from_browser
            )
        else:
            video_path = download_direct_video(args.video, temp_video)

        if not args.quiet:
            print(f"Video downloaded: {video_path}")

    try:
        # Create output directory
        os.makedirs(args.output, exist_ok=True)

        # Get video duration for validation
        video_duration_ms = get_video_duration_ms(video_path)
        if not args.quiet and video_duration_ms > 0:
            duration_sec = video_duration_ms / 1000
            print(f"Video duration: {int(duration_sec // 60)}:{int(duration_sec % 60):02d} ({video_duration_ms}ms)")

        results = []

        for slide in slides:
            slide_id = slide.get('id', len(results) + 1)
            timestamp_ms = slide.get('timestamp_ms', 0)
            title = slide.get('title', f'slide_{slide_id}')
            bounding_box = slide.get('bounding_box')

            # Skip timestamps beyond video duration
            if video_duration_ms > 0 and timestamp_ms > video_duration_ms:
                if not args.quiet:
                    print(f"Skipping slide {slide_id} @ {timestamp_ms}ms: timestamp exceeds video duration ({video_duration_ms}ms)")
                results.append({
                    'slide_id': slide_id,
                    'title': title,
                    'timestamp_ms': timestamp_ms,
                    'status': 'skipped',
                    'reason': f'timestamp {timestamp_ms}ms exceeds video duration {video_duration_ms}ms'
                })
                continue

            if not args.quiet:
                print(f"Extracting slide {slide_id} @ {timestamp_ms}ms: {title}")

            try:
                image_data = extract_frame(video_path, timestamp_ms, bounding_box)

                if args.base64:
                    results.append({
                        'slide_id': slide_id,
                        'title': title,
                        'timestamp_ms': timestamp_ms,
                        'image_base64': base64.b64encode(image_data).decode('utf-8'),
                        'status': 'success'
                    })
                else:
                    filename = f"slide_{slide_id:03d}_{sanitize_filename(title)}.jpg"
                    filepath = os.path.join(args.output, filename)

                    with open(filepath, 'wb') as f:
                        f.write(image_data)

                    results.append({
                        'slide_id': slide_id,
                        'title': title,
                        'timestamp_ms': timestamp_ms,
                        'file': filepath,
                        'size_kb': len(image_data) / 1024,
                        'status': 'success'
                    })

                    if not args.quiet:
                        print(f"  -> Saved: {filename} ({len(image_data) / 1024:.1f} KB)")

            except Exception as e:
                results.append({
                    'slide_id': slide_id,
                    'title': title,
                    'timestamp_ms': timestamp_ms,
                    'status': 'error',
                    'error': str(e)
                })
                print(f"  -> Error: {e}")

        # Summary
        success_count = sum(1 for r in results if r['status'] == 'success')
        failed_count = sum(1 for r in results if r['status'] == 'error')
        skipped_count = sum(1 for r in results if r['status'] == 'skipped')

        if args.base64:
            output = {
                'success': True,
                'total_slides': len(slides),
                'extracted': success_count,
                'failed': failed_count,
                'skipped': skipped_count,
                'images': results
            }
            print(json.dumps(output, indent=2))
        else:
            if not args.quiet:
                print(f"\nExtracted: {success_count}/{len(slides)}")
                if skipped_count:
                    print(f"Skipped: {skipped_count} (timestamps beyond video duration)")
                if failed_count:
                    print(f"Failed: {failed_count}")
                print(f"Output: {args.output}/")

        return 0 if failed_count == 0 else 1

    finally:
        # Handle video file: save, keep, or cleanup
        if temp_video:
            if args.save_video:
                # Save video to specified directory
                import shutil
                os.makedirs(args.save_video, exist_ok=True)

                # Get video filename from URL or use default
                if is_youtube_url(args.video):
                    video_filename = f"video_{Path(args.video).name.split('=')[-1].split('&')[0]}"
                else:
                    video_filename = Path(args.video).stem or "video"

                # Get extension from downloaded file
                ext = Path(video_path).suffix or '.mp4'
                dest_path = os.path.join(args.save_video, f"{video_filename}{ext}")

                shutil.copy2(video_path, dest_path)
                if not args.quiet:
                    print(f"Video saved to: {dest_path}")

                # Cleanup temp
                base = temp_video.rsplit('.', 1)[0]
                import glob
                for f in glob.glob(base + '.*'):
                    if os.path.exists(f):
                        os.unlink(f)

            elif args.keep_video:
                if not args.quiet:
                    print(f"Video kept at: {video_path}")
            else:
                # Cleanup temp video
                base = temp_video.rsplit('.', 1)[0]
                import glob
                for f in glob.glob(base + '.*'):
                    if os.path.exists(f):
                        os.unlink(f)
                        if not args.quiet:
                            print(f"Cleaned up: {f}")


if __name__ == '__main__':
    sys.exit(main())
