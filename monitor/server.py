"""
Monitor HTTP API — Flask server wrapping ReadingMonitor.

Endpoints:
  POST /api/detect/start   { fileId?: str }  → { sessionId, status }
  POST /api/detect/stop                      → { sessionId, path, frameCount }
  GET  /api/detect/status                    → { running, sessionId?, frameCount? }
  GET  /api/sessions                         → [{ id, startedAt, ... }]
  GET  /api/sessions/<id>                    → { frames: [...] }
  GET  /api/sessions/<id>/analyze            → { focusScore, ... }

Usage:
  python monitor/server.py          # default port 8765
  python monitor/server.py --port 9876
"""

import argparse
import json
import os
import sys

from flask import Flask, jsonify, request
from flask_cors import CORS  # type: ignore

# Ensure monitor/ is on path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from main import ReadingMonitor
from analyze import load_session, analyze as analyze_session

app = Flask(__name__)
CORS(app)


# ── Request logging ────────────────────────────────────────────────
@app.before_request
def log_request():
    from datetime import datetime
    ua = request.headers.get("User-Agent", "?")
    ref = request.headers.get("Referer", "?")
    origin = request.headers.get("Origin", "?")
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {request.method} {request.path} "
          f"UA={ua[:60]} Ref={ref[:40]} Orig={origin}")
_monitor: ReadingMonitor | None = None
_current_file_id: str | None = None
_sessions_dir: str = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sessions")


# ── Detection control ──────────────────────────────────────────────

@app.route("/api/detect/start", methods=["POST"])
def start_detection():
    global _monitor, _current_file_id

    if _monitor is not None and _monitor.is_running:
        return jsonify({
            "status": "already_running",
            "sessionId": os.path.basename(_monitor.session_path).replace(".jsonl", ""),
            "frameCount": _monitor.frame_count,
        })

    body = request.get_json(silent=True) or {}
    _current_file_id = body.get("fileId")
    if not _current_file_id:
        return jsonify({"status": "error", "message": "fileId is required"}), 400

    try:
      _monitor = ReadingMonitor(headless=True)
      _monitor.start()
      return jsonify({
        "status": "started",
        "sessionId": os.path.basename(_monitor.session_path).replace(".jsonl", ""),
        "fileId": _current_file_id,
      })
    except Exception as exc:
        _monitor = None
        return jsonify({"status": "error", "message": str(exc)}), 500


@app.route("/api/detect/stop", methods=["POST"])
def stop_detection():
    global _monitor, _current_file_id

    if _monitor is None or not _monitor.is_running:
        return jsonify({"status": "not_running"})

    body = request.get_json(silent=True) or {}
    requested_file_id = body.get("fileId")
    if requested_file_id and requested_file_id != _current_file_id:
        return jsonify({
            "status": "not_owner",
            "fileId": _current_file_id,
        }), 409

    file_id = _current_file_id
    session_path = _monitor.stop()
    frame_count = _monitor.frame_count
    session_id = os.path.basename(session_path).replace(".jsonl", "")
    _monitor = None
    _current_file_id = None

    return jsonify({
        "status": "stopped",
        "sessionId": session_id,
        "path": session_path,
        "frameCount": frame_count,
        "fileId": file_id,
    })


@app.route("/api/detect/status", methods=["GET"])
def detection_status():
    if _monitor is None or not _monitor.is_running:
        return jsonify({"running": False})

    return jsonify({
        "running": True,
        "sessionId": os.path.basename(_monitor.session_path).replace(".jsonl", ""),
        "frameCount": _monitor.frame_count,
        "fileId": _current_file_id,
    })


# ── Session data ───────────────────────────────────────────────────

def _list_session_files():
    if not os.path.isdir(_sessions_dir):
        return []
    files = [
        f for f in os.listdir(_sessions_dir)
        if f.endswith(".jsonl") and os.path.getsize(os.path.join(_sessions_dir, f)) > 0
    ]
    files.sort(reverse=True)
    return files


@app.route("/api/sessions", methods=["GET"])
def list_sessions():
    sessions = []
    for filename in _list_session_files():
        path = os.path.join(_sessions_dir, filename)
        try:
            frames = load_session(path)
        except Exception:
            frames = []
        sid = filename.replace(".jsonl", "")
        if frames:
            first = frames[0]
            last = frames[-1]
            started_at = first.get("timestamp")
            ended_at = last.get("timestamp")
            duration_sec = round(ended_at - started_at, 1) if (started_at and ended_at) else 0
            sessions.append({
                "id": sid,
                "startedAt": _ts_to_iso(started_at),
                "endedAt": _ts_to_iso(ended_at),
                "durationSec": duration_sec,
                "frameCount": len(frames),
            })
        else:
            sessions.append({
                "id": sid,
                "startedAt": None,
                "endedAt": None,
                "durationSec": 0,
                "frameCount": 0,
            })
    return jsonify(sessions)


@app.route("/api/sessions/<session_id>", methods=["GET"])
def get_session_frames(session_id: str):
    path = os.path.join(_sessions_dir, f"{session_id}.jsonl")
    if not os.path.exists(path):
        return jsonify({"error": "not found"}), 404
    try:
        frames = load_session(path)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    return jsonify({"sessionId": session_id, "frames": frames})


@app.route("/api/sessions/<session_id>/analyze", methods=["GET"])
def get_session_analysis(session_id: str):
    path = os.path.join(_sessions_dir, f"{session_id}.jsonl")
    if not os.path.exists(path):
        return jsonify({"error": "not found"}), 404
    try:
        frames = load_session(path)
        result = analyze_session(frames)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    # Serialize: convert non-JSON-safe values
    return jsonify({
        "sessionId": session_id,
        "duration": result.get("duration"),
        "frames": result.get("frames"),
        "fps": result.get("fps"),
        "gazeRatio": result.get("gaze_ratio"),
        "yawStd": result.get("yaw_std"),
        "pitchStd": result.get("pitch_std"),
        "events": result.get("events"),
        "episodes": result.get("episodes"),
        "distractRatio": result.get("distract_ratio"),
        "eventsPerMin": result.get("events_per_min"),
        "engDistribution": result.get("eng_distribution"),
        "engDominant": result.get("eng_dominant"),
        "focusScore": result.get("focus_score"),
    })


# ── Health ─────────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


def _ts_to_iso(ts):
    if ts is None:
        return None
    from datetime import datetime, timezone
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Monitor HTTP API")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--host", type=str, default="127.0.0.1")
    args = parser.parse_args()
    print(f"Monitor API listening on http://{args.host}:{args.port}")
    app.run(host=args.host, port=args.port, debug=False)
