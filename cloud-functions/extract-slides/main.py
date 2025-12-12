"""
GCP Cloud Function for extracting slide images from videos.

This function takes timestamps from the extractSlides operation and
extracts the corresponding frames from the video using OpenCV.

Supports:
- Direct video URLs (.mp4, .webm, etc.)
- YouTube URLs (via yt-dlp)

Usage:
    POST /extract-slides
    {
        "video_url": "https://www.youtube.com/watch?v=VIDEO_ID",
        "slides": [
            {"id": 1, "timestamp_ms": 15000, "title": "Introduction"},
            {"id": 2, "timestamp_ms": 145000, "title": "Results"}
        ],
        "output": {
            "type": "base64" | "gcs",
            "bucket": "my-bucket",  // required if type is "gcs"
            "prefix": "slides/"     // optional prefix for GCS
        }
    }
"""

import functions_framework
import cv2
import tempfile
import requests
import base64
import os
import re
import subprocess
from urllib.parse import urlparse
from flask import jsonify
from google.cloud import storage


def is_youtube_url(url: str) -> bool:
    """Check if URL is a YouTube video."""
    parsed = urlparse(url)
    youtube_domains = ['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com']
    return parsed.netloc in youtube_domains


def sanitize_filename(title: str, max_length: int = 50) -> str:
    """Convert title to a safe filename."""
    if not title:
        return "slide"
    # Remove non-alphanumeric characters except spaces and hyphens
    safe = re.sub(r'[^\w\s-]', '', title)
    # Replace spaces with underscores
    safe = re.sub(r'\s+', '_', safe)
    # Truncate if too long
    return safe[:max_length]


def download_youtube_video(url: str, tmp_path: str) -> None:
    """Download YouTube video using yt-dlp."""
    try:
        # Use yt-dlp to download video
        # -f: format selector (best quality up to 720p to save bandwidth)
        # -o: output path
        # --no-playlist: don't download playlists
        # --quiet: minimal output
        result = subprocess.run(
            [
                'yt-dlp',
                '-f', 'best[height<=720]/best',
                '-o', tmp_path,
                '--no-playlist',
                '--quiet',
                '--no-warnings',
                url
            ],
            capture_output=True,
            text=True,
            timeout=300  # 5 minutes timeout
        )

        if result.returncode != 0:
            raise RuntimeError(f"yt-dlp failed: {result.stderr}")

        if not os.path.exists(tmp_path):
            raise RuntimeError("yt-dlp did not create output file")

    except subprocess.TimeoutExpired:
        raise RuntimeError("YouTube download timed out")
    except FileNotFoundError:
        raise RuntimeError("yt-dlp not installed in Cloud Function")


def download_direct_video(url: str, tmp_path: str) -> None:
    """Download video from direct URL."""
    response = requests.get(url, stream=True, timeout=300)
    response.raise_for_status()

    with open(tmp_path, 'wb') as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)


def download_video(url: str, tmp_path: str) -> None:
    """Download video from URL (supports YouTube and direct URLs)."""
    if is_youtube_url(url):
        download_youtube_video(url, tmp_path)
    else:
        download_direct_video(url, tmp_path)


def extract_frame(video_path: str, timestamp_ms: int, bounding_box: list = None) -> bytes:
    """Extract a single frame from video at given timestamp."""
    cap = cv2.VideoCapture(video_path)

    try:
        # Seek to timestamp
        cap.set(cv2.CAP_PROP_POS_MSEC, timestamp_ms)
        success, frame = cap.read()

        if not success:
            raise ValueError(f"Failed to read frame at {timestamp_ms}ms")

        # Crop if bounding box provided
        if bounding_box and len(bounding_box) == 4:
            height, width = frame.shape[:2]
            # Convert from 0-1000 scale to actual pixels
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


def upload_to_gcs(bucket_name: str, blob_name: str, data: bytes, content_type: str = 'image/jpeg') -> str:
    """Upload data to Google Cloud Storage and return the public URL."""
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_name)

    blob.upload_from_string(data, content_type=content_type)

    # Return gs:// URL
    return f"gs://{bucket_name}/{blob_name}"


@functions_framework.http
def extract_slides(request):
    """
    HTTP Cloud Function to extract slide images from video.

    Args:
        request: Flask Request object

    Returns:
        JSON response with extracted images
    """
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '3600'
        }
        return ('', 204, headers)

    headers = {'Access-Control-Allow-Origin': '*'}

    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400, headers

        video_url = data.get('video_url')
        slides = data.get('slides', [])
        output_config = data.get('output', {'type': 'base64'})

        if not video_url:
            return jsonify({'error': 'video_url is required'}), 400, headers

        if not slides:
            return jsonify({'error': 'slides array is required'}), 400, headers

        output_type = output_config.get('type', 'base64')
        bucket_name = output_config.get('bucket')
        prefix = output_config.get('prefix', '')

        if output_type == 'gcs' and not bucket_name:
            return jsonify({'error': 'bucket is required for GCS output'}), 400, headers

        # Determine file extension based on source
        suffix = '.mp4'
        if is_youtube_url(video_url):
            # yt-dlp may download as different format
            suffix = '.%(ext)s'

        # Download video to temp file
        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as tmp:
            tmp_path = tmp.name

        try:
            # For YouTube, yt-dlp handles the extension
            if is_youtube_url(video_url):
                # Remove the .mp4 suffix and let yt-dlp add correct extension
                tmp_base = tmp_path.rsplit('.', 1)[0]
                download_video(video_url, tmp_base + '.%(ext)s')
                # Find the actual downloaded file
                import glob
                downloaded_files = glob.glob(tmp_base + '.*')
                if downloaded_files:
                    tmp_path = downloaded_files[0]
                else:
                    raise RuntimeError("YouTube video download failed - no file created")
            else:
                download_video(video_url, tmp_path)

            results = []
            for slide in slides:
                slide_id = slide.get('id', len(results) + 1)
                timestamp_ms = slide.get('timestamp_ms', 0)
                title = slide.get('title', f'slide_{slide_id}')
                bounding_box = slide.get('bounding_box')

                try:
                    # Extract frame
                    image_data = extract_frame(tmp_path, timestamp_ms, bounding_box)

                    if output_type == 'gcs':
                        # Upload to GCS
                        filename = f"{prefix}slide_{slide_id:03d}_{sanitize_filename(title)}.jpg"
                        url = upload_to_gcs(bucket_name, filename, image_data)
                        results.append({
                            'slide_id': slide_id,
                            'title': title,
                            'timestamp_ms': timestamp_ms,
                            'url': url,
                            'status': 'success'
                        })
                    else:
                        # Return base64
                        results.append({
                            'slide_id': slide_id,
                            'title': title,
                            'timestamp_ms': timestamp_ms,
                            'image_base64': base64.b64encode(image_data).decode('utf-8'),
                            'status': 'success'
                        })

                except Exception as e:
                    results.append({
                        'slide_id': slide_id,
                        'title': title,
                        'timestamp_ms': timestamp_ms,
                        'status': 'error',
                        'error': str(e)
                    })

            return jsonify({
                'success': True,
                'total_slides': len(slides),
                'extracted': sum(1 for r in results if r['status'] == 'success'),
                'failed': sum(1 for r in results if r['status'] == 'error'),
                'images': results
            }), 200, headers

        finally:
            # Clean up temp file(s)
            if is_youtube_url(video_url):
                import glob
                tmp_base = tmp_path.rsplit('.', 1)[0]
                for f in glob.glob(tmp_base + '.*'):
                    if os.path.exists(f):
                        os.unlink(f)
            elif os.path.exists(tmp_path):
                os.unlink(tmp_path)

    except requests.exceptions.RequestException as e:
        return jsonify({
            'success': False,
            'error': f'Failed to download video: {str(e)}'
        }), 500, headers

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500, headers
