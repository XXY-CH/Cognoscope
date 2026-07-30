"""
Reading Monitor — single-person study behavior monitor.

Detects five behaviors via ClassroomAI-Monitor vision modules:
  playing_phone  — YOLOv8 phone detection
  head_down      — MediaPipe PoseLandmarker nose-below-shoulders
  gaze_center    — MediaPipe FaceLandmarker head-pose yaw/pitch
  drinking       — YOLO drink-container + wrist-to-mouth trajectory
  chatting       — mouth aperture oscillation + head yaw

DAiSEE engagement classifier (Gupta et al., 2016):
  boredom, confusion, engagement, frustration — ONNX model on face crop.

Output: real-time OpenCV overlay + per-frame JSON Lines event stream.

API:
  from main import ReadingMonitor
  m = ReadingMonitor(headless=True)
  m.start()          # background recording
  ...
  path = m.stop()    # returns session file path
"""

import json
import os
import sys
import threading
import time
from datetime import datetime

import cv2
import numpy as np
from ultralytics import YOLO

# ── Optional: DAiSEE engagement ONNX model ─────────────────────────
try:
    import onnxruntime as ort
    _ONNX_AVAILABLE = True
except ImportError:
    _ONNX_AVAILABLE = False

ENGAGEMENT_MODEL = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "model.onnx"
)
MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")

# ── Local vision modules (vendored from ClassroomAI-Monitor) ──────
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vision.focus import get_focus_score
from vision.pose import analyze_pose
from vision.behavior import BehaviorTracker

# ── Constants ──────────────────────────────────────────────────────
PHONE_CLASS = 67
DRINK_CLASSES = {39, 40, 41}
DRINK_CLASS_NAMES = {39: "bottle", 40: "wine glass", 41: "cup"}

MODEL_PATH = os.path.join(MODELS_DIR, "yolov8n.pt")

WINDOW_NAME = "Reading Monitor — Q to quit"

GREEN  = (0, 220, 100)
RED    = (0, 0, 255)
ORANGE = (0, 165, 255)
YELLOW = (0, 255, 255)
WHITE  = (255, 255, 255)
GREY   = (150, 150, 150)


class ReadingMonitor:
    """Single-person study behaviour monitor.

    Usage:
        m = ReadingMonitor(headless=True)
        m.start()          # begins recording in background
        ...
        path = m.stop()    # stops, returns session .jsonl path
    """

    def __init__(self, headless=False):
        self._headless = headless
        self._running = False
        self._thread = None
        self._stop_event = threading.Event()
        self._session_path = None
        self._frame_num = 0

        # ── Load YOLO ──────────────────────────────────────────────
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(f"YOLO model not found: {MODEL_PATH}")
        self._model = YOLO(MODEL_PATH)

        # ── Load engagement ONNX (optional) ─────────────────────────
        self._eng_session = None
        if _ONNX_AVAILABLE and os.path.exists(ENGAGEMENT_MODEL):
            self._eng_session = ort.InferenceSession(ENGAGEMENT_MODEL)

        # ── Open camera ─────────────────────────────────────────────
        self._cap = cv2.VideoCapture(0)
        if not self._cap.isOpened():
            raise RuntimeError("Cannot open webcam.")

        # ── Internal state ──────────────────────────────────────────
        self._tracker = BehaviorTracker()
        self._eng_boredom = self._eng_confusion = None
        self._eng_engagement = self._eng_frustration = None
        self._eng_state = None

        # ── Output file ─────────────────────────────────────────────
        os.makedirs(os.path.join(os.path.dirname(__file__), "sessions"), exist_ok=True)
        self._session_path = os.path.join(
            os.path.dirname(__file__), "sessions",
            f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jsonl"
        )
        self._out = open(self._session_path, "w", buffering=1)

    # ── Public API ──────────────────────────────────────────────────

    @property
    def is_running(self):
        return self._running

    @property
    def session_path(self):
        return self._session_path

    @property
    def frame_count(self):
        return self._frame_num

    def start(self):
        """Begin monitoring.

        In headless mode, runs in a background thread — returns immediately.
        With display, blocks until window closed or stop() called from
        another thread.
        """
        if self._running:
            return
        self._stop_event.clear()
        self._running = True

        if self._headless:
            self._thread = threading.Thread(target=self._loop, daemon=False)
            self._thread.start()
        else:
            self._loop()

    def stop(self):
        """Stop monitoring. Returns path to the session JSONL file."""
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=10)
        return self._session_path

    # ── Internal loop ───────────────────────────────────────────────

    def _loop(self):
        if not self._headless:
            cv2.namedWindow(WINDOW_NAME, cv2.WINDOW_AUTOSIZE)
            cv2.waitKey(1)
            ret, init_frame = self._cap.read()
            if ret:
                cv2.putText(init_frame, "Initializing...", (10, 35),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.85, GREEN, 2)
                cv2.imshow(WINDOW_NAME, init_frame)
                cv2.waitKey(1)

        ENG_INTERVAL = 5

        try:
            while not self._stop_event.is_set():
                ret, frame = self._cap.read()
                if not ret:
                    break

                h, w = frame.shape[:2]
                now = time.time()
                phone_detected = False
                drink_detected = False

                # ── YOLO ────────────────────────────────────────────
                results = self._model(
                    frame, classes=[PHONE_CLASS] + list(DRINK_CLASSES),
                    conf=0.45, verbose=False)
                for box in results[0].boxes:
                    cls = int(box.cls[0])
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    if cls == PHONE_CLASS:
                        phone_detected = True
                        if not self._headless:
                            cv2.rectangle(frame, (x1, y1), (x2, y2), RED, 2)
                            cv2.putText(frame, "PHONE", (x1, y1 - 6),
                                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, RED, 2)
                    elif cls in DRINK_CLASSES:
                        drink_detected = True
                        if not self._headless:
                            name = DRINK_CLASS_NAMES.get(cls, "drink")
                            cv2.rectangle(frame, (x1, y1), (x2, y2), ORANGE, 2)
                            cv2.putText(frame, name.upper(), (x1, y1 - 6),
                                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, ORANGE, 2)

                # ── Focus ───────────────────────────────────────────
                raw = get_focus_score(frame, return_landmarks=True)
                if raw[0] is None and len(raw) == 4:
                    # solvePnP failed but face detected — keep landmarks
                    score = yaw = pitch = None
                    landmarks = raw[3]
                elif raw[0] is None:
                    score = yaw = pitch = landmarks = None
                elif len(raw) == 4:
                    score, yaw, pitch, landmarks = raw
                else:
                    score, yaw, pitch = raw
                    landmarks = None

                # ── Crop for pose ───────────────────────────────────
                pose = None
                if landmarks is not None:
                    xs = [lm.x * w for lm in landmarks]
                    ys = [lm.y * h for lm in landmarks]
                    fx1, fy1 = int(min(xs)), int(min(ys))
                    fx2, fy2 = int(max(xs)), int(max(ys))
                    face_w = fx2 - fx1
                    face_h = fy2 - fy1
                    cx1 = max(0, fx1 - face_w)
                    cx2 = min(w, fx2 + face_w)
                    cy1 = max(0, fy1 - face_h // 2)
                    cy2 = min(h, fy2 + face_h * 3)
                    crop = frame[cy1:cy2, cx1:cx2]
                    pose = analyze_pose(crop)
                    if pose:
                        pose["wrist_left"] = (
                            pose["wrist_left"][0] + cx1,
                            pose["wrist_left"][1] + cy1)
                        pose["wrist_right"] = (
                            pose["wrist_right"][0] + cx1,
                            pose["wrist_right"][1] + cy1)
                        pose["nose"] = (
                            pose["nose"][0] + cx1,
                            pose["nose"][1] + cy1)
                else:
                    pose = analyze_pose(frame)

                # ── Behavior ────────────────────────────────────────
                if landmarks is not None:
                    behavior = self._tracker.update(
                        track_id=0, landmarks=landmarks,
                        crop_shape=(h, w), pose=pose,
                        yaw=yaw, pitch=pitch,
                        drink_object=drink_detected, now=now)
                else:
                    # Face lost — clear tracker state to avoid stale results
                    self._tracker.prune(now + 999)
                    behavior = {}

                # ── Engagement (every ENG_INTERVAL frames) ──────────
                if landmarks is not None:
                    if (self._eng_session is not None
                            and self._frame_num % ENG_INTERVAL == 0):
                        face_crop = frame[fy1:fy2, fx1:fx2]
                        if face_crop.size > 0:
                            face_rgb = cv2.cvtColor(face_crop, cv2.COLOR_BGR2RGB)
                            face_resized = cv2.resize(face_rgb, (224, 224))
                            inp = (face_resized.transpose(2, 0, 1).astype(np.float32) / 255.0)
                            inp = np.expand_dims(inp, axis=0)
                            eng_out = self._eng_session.run(["output"], {"input": inp})
                            self._eng_boredom = float(eng_out[0][0][0])
                            self._eng_confusion = float(eng_out[0][0][1])
                            self._eng_engagement = float(eng_out[0][0][2])
                            self._eng_frustration = float(eng_out[0][0][3])
                            states = {"boredom": self._eng_boredom,
                                      "confusion": self._eng_confusion,
                                      "engaged": self._eng_engagement,
                                      "frustration": self._eng_frustration}
                            self._eng_state = max(states, key=states.get)
                else:
                    self._eng_state = None

                # ── Labels ──────────────────────────────────────────
                labels = {
                    "playing_phone": phone_detected,
                    "head_down": pose["sleeping"] if pose else False,
                    "gaze_center": behavior.get("gaze_center", False),
                    "drinking": behavior.get("drinking", False),
                    "chatting": behavior.get("talking", False),
                    "engagement": self._eng_state,
                }

                # ── JSON output ─────────────────────────────────────
                event = {
                    "timestamp": round(now, 3),
                    "frame": self._frame_num,
                    "labels": labels,
                    "metrics": {
                        "focus_score": score,
                        "yaw": yaw, "pitch": pitch,
                        "gaze_h": behavior.get("gaze_h"),
                        "gaze_v": behavior.get("gaze_v"),
                        "mar": behavior.get("mar"),
                        "eng_boredom": self._eng_boredom,
                        "eng_confusion": self._eng_confusion,
                        "eng_engagement": self._eng_engagement,
                        "eng_frustration": self._eng_frustration,
                    },
                }
                self._out.write(json.dumps(event) + "\n")

                # ── Overlay / status ────────────────────────────────
                if not self._headless:
                    distractor_labels = {"playing_phone", "head_down",
                                         "drinking", "chatting"}
                    active_distractions = [k for k, v in labels.items()
                                           if v and k in distractor_labels]
                    if not active_distractions and labels.get("gaze_center"):
                        status_line, status_color = "FOCUSED", GREEN
                    elif not active_distractions:
                        status_line, status_color = "NO FACE", GREY
                    else:
                        status_line = " | ".join(active_distractions)
                        status_color = RED
                    cv2.putText(frame, status_line, (10, 35),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.85, status_color, 2)
                    if self._eng_state is not None:
                        eng_colors = {"engaged": GREEN, "confusion": YELLOW,
                                      "frustration": ORANGE, "boredom": RED}
                        eng_color = eng_colors.get(self._eng_state, WHITE)
                        eng_text = (f"Engagement: {self._eng_state} "
                                    f"(b={self._eng_boredom:.2f} c={self._eng_confusion:.2f} "
                                    f"e={self._eng_engagement:.2f} f={self._eng_frustration:.2f})")
                        cv2.putText(frame, eng_text, (10, 65),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, eng_color, 1)
                elif self._frame_num % 30 == 0 and self._frame_num > 0:
                    active = [k for k, v in labels.items()
                              if v and k != "engagement"]
                    eng_info = f" [{self._eng_state}]" if self._eng_state else ""
                    status = " | ".join(active) if active else "FOCUSED"
                    print(f"  frame {self._frame_num}: {status}{eng_info}", flush=True)

                self._frame_num += 1

                if not self._headless:
                    cv2.imshow(WINDOW_NAME, frame)
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        break

        except KeyboardInterrupt:
            pass
        finally:
            self._running = False
            self._out.close()
            self._cap.release()
            if not self._headless:
                cv2.destroyAllWindows()


def run(headless=False):
    """Convenience: blocking run (legacy API)."""
    m = ReadingMonitor(headless=headless)
    m.start()
    if headless:
        try:
            while m.is_running:
                time.sleep(0.5)
        except KeyboardInterrupt:
            m.stop()
    return m.session_path


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Reading Monitor")
    parser.add_argument("--headless", action="store_true",
                        help="Record without display window")
    args = parser.parse_args()
    run(headless=args.headless)
