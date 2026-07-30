# Reading Monitor

Single-person study behaviour monitor. Webcam → 5-way detection → real-time overlay + JSONL event stream → offline focus analysis.

## Detection Capabilities

| Behaviour | Method | Technology |
|---|---|---|
| Playing phone | YOLOv8 object detection (COCO class 67) | `ultralytics` |
| Head down | Nose-below-shoulders via pose landmarks | MediaPipe PoseLandmarker |
| Gaze at screen | Head-pose yaw/pitch via face landmarks + iris gaze ratios | MediaPipe FaceLandmarker |
| Drinking | Cup/bottle YOLO + wrist-to-mouth trajectory | YOLO + MediaPipe PoseLandmarker |
| Chatting | Mouth aspect ratio oscillation + head yaw | MediaPipe FaceLandmarker |
| Engagement state | DAiSEE ONNX classifier (boredom / confusion / engaged / frustration) | `onnxruntime` |

## Paper References

| Paper | Method | Application |
|---|---|---|
| Wierwille et al. (1994). *Research on Vehicle-Based Driver Status/Performance Monitoring.* NHTSA DOT HS 808 247. [rosap.ntl.bts.gov](https://rosap.ntl.bts.gov/view/dot/2575) | PERCLOS — percentage of eye closure time | Drowsiness / low-alertness indicator |
| Rayner, K. (1998). Eye Movements in Reading and Information Processing. *Psychological Bulletin*, 124(3), 372–422. [DOI: 10.1037/0033-2909.124.3.372](https://doi.org/10.1037/0033-2909.124.3.372) | Gaze fixation ratio — % time eyes fixate on target | Reading attention depth |
| Gupta, A. et al. (2016). DAiSEE: Towards User Engagement Recognition in the Wild. [arXiv:1609.01885](https://arxiv.org/abs/1609.01885) | Head-pose variance + facial expression → engagement (4-class) | Bored / confused / engaged / frustrated |
| Useche, O. & El-Sheikh, E. (2016). An Intelligent Web-Based System for Measuring Students' Attention Levels. [Semantic Scholar](https://www.semanticscholar.org/paper/An-Intelligent-Web-Based-System-for-Measuring-Useche-El-Sheikh/003777c8961885b6a3446578a009cd9bc0486905) | PyTtention — multimodal attention scoring with weighted fusion | Composite focus score architecture |
| Hossen, M. K. & Uddin, M. S. (2023). Attention monitoring of students during online classes using XGBoost classifier. *Computers and Education: Artificial Intelligence*, 5, 100191. [DOI: 10.1016/j.caeai.2023.100191](https://doi.org/10.1016/j.caeai.2023.100191) | Multimodal fusion (head pose + eye gaze + phone) via XGBoost | Validation of multi-signal attention assessment |
| ACM ICMI (2024). Multimodal Behavior Detection for Classroom Engagement Analysis and Learning Outcome Prediction. [DOI: 10.1145/3802607.3802654](https://doi.org/10.1145/3802607.3802654) | Distraction event density as negative engagement signal | Phone/chat/drink event counting |

### Focus Score Formula

```
FocusScore = w1 × GazeRatio + w2 × (1 − PERCLOS) + w3 × (1 − HeadVar_norm) + w4 × (1 − DistractDensity_norm) + w5 × EngagedRatio
```

| Weight | Term | Value | Status |
|---|---|---|---|
| w₁ | Gaze fixation ratio | 0.40 (0.55 w/o pose) | active |
| w₂ | 1 − PERCLOS | 0 (deferred) | pending eye-aperture data |
| w₃ | 1 − HeadPoseVariance_norm | 0.25 (0.15 w/o pose) | active |
| w₄ | Distraction penalty | 0.20 | active (capped at −30 pts) |
| w₅ | % time in "engaged" state (DAiSEE) | 0.15 (0.10 w/o pose) | active (ONNX model) |

Current effective formula: `0.40×Gaze + 0.25×Pose + 0.15×Engaged% − 0.20×DistractPenalty`
## Project Structure

```
reading-monitor-1/
├── main.py              # ReadingMonitor class + CLI entry
├── analyze.py           # Session analysis + focus report
├── requirements.txt     # Python dependencies
├── .gitignore
├── README.md
├── vision/              # Vendored from ClassroomAI-Monitor
│   ├── focus.py         #   Head-pose estimation
│   ├── pose.py          #   Pose landmark analysis
│   └── behavior.py      #   Gaze / drinking / talking trackers
├── models/              # Binary models (download separately)
│   ├── yolov8n.pt
│   ├── pose_landmarker.task
│   └── face_landmarker.task
├── model.onnx           # DAiSEE engagement classifier (optional)
└── sessions/            # JSONL output (auto-created)
```

Depends on [ClassroomAI-Monitor](../ClassroomAI-Monitor/) for vision modules. Required files in that project:

- `vision/focus.py`, `vision/pose.py`, `vision/behavior.py`
- `yolov8n.pt` (YOLO model)
- `pose_landmarker.task`, `face_landmarker.task` (MediaPipe models)

Install Python dependencies:

```bash
pip install -r requirements.txt
```

Required: `ultralytics`, `mediapipe`, `opencv-contrib-python`, `numpy`, `torch`, `torchvision`.

## API / Usage

### 1. Real-Time Monitoring

```bash
python main.py                # with display window
python main.py --headless     # background recording, no window
```

Opens webcam, writes per-frame events to `sessions/session_YYYYMMDD_HHMMSS.jsonl`.
With display: shows labelled feed, press `Q` to stop.
Headless: prints status every 30 frames, press `Ctrl+C` to stop.

**Python API (legacy blocking):**

```python
from main import run
run()                 # with display, blocks
run(headless=True)    # background, blocks until Ctrl+C
```

**Python API (start/stop):**

```python
from main import ReadingMonitor

m = ReadingMonitor(headless=True)
m.start()          # begins recording in background thread
# ... your code runs here while monitoring ...
path = m.stop()   # stops, returns session .jsonl path
print(m.frame_count, "frames recorded")
```

Properties: `m.is_running`, `m.session_path`, `m.frame_count`.

### 2. Session Analysis

```bash
python analyze.py sessions/session_20260729_164025.jsonl
```

Outputs a terminal report with:
- Gaze fixation ratio (Rayner 1998)
- Head-pose stability σ (DAiSEE 2016)
- Distraction episode count & density (ICMI 2024)
- Engagement state distribution (DAiSEE 2016)
- Composite focus score 0–100 (PyTtention 2016)
- Frame-level timeline

**Python API:**

```python
from analyze import load_session, analyze, report

frames = load_session("sessions/session_20260729_164025.jsonl")
result = analyze(frames)
report(result)
# result dict keys: duration, frames, fps, gaze_ratio,
#   yaw_std, pitch_std, events, episodes, distract_ratio,
#   events_per_min, eng_scores, eng_distribution, eng_dominant,
#   focus_score, timeline
```

### 3. JSONL Event Format

Each line is a standalone JSON object — streamable, append-only, dashboard-friendly.

```json
{
  "timestamp": 1785314363.252,
  "frame": 0,
  "labels": {
    "playing_phone": false,
    "head_down": false,
    "gaze_center": true,
    "drinking": false,
    "chatting": false,
    "engagement": "engaged"
  },
  "metrics": {
    "focus_score": 85,
    "yaw": 3.2,
    "pitch": -1.5,
    "gaze_h": 0.52,
    "gaze_v": 0.48,
    "mar": 0.012,
    "eng_boredom": 0.12,
    "eng_confusion": 0.08,
    "eng_engagement": 0.73,
    "eng_frustration": 0.07
  }
}
```

**Field reference:**

| Field | Type | Description |
|---|---|---|
| `timestamp` | float | Unix timestamp (seconds) |
| `frame` | int | Frame sequence number from session start |
| `labels.playing_phone` | bool | Phone visible in frame (YOLO class 67) |
| `labels.head_down` | bool | Nose below shoulder line (PoseLandmarker) |
| `labels.gaze_center` | bool | Iris centred + head frontal (FaceLandmarker) |
| `labels.drinking` | bool | Cup present + wrist near mouth |
| `labels.chatting` | bool | MAR oscillation + head turned aside |
| `labels.engagement` | string\|null | Dominant DAiSEE state |
| `metrics.focus_score` | int\|null | Head-pose focus 0–100 |
| `metrics.yaw` | float\|null | Head yaw angle in degrees |
| `metrics.pitch` | float\|null | Head pitch angle in degrees |
| `metrics.gaze_h` | float\|null | Horizontal iris position ratio 0–1 |
| `metrics.gaze_v` | float\|null | Vertical iris position ratio 0–1 |
| `metrics.mar` | float\|null | Mouth aspect ratio |
## Dependencies

Self-contained — all vision modules are vendored in `vision/`.
Model files (`models/*.pt`, `models/*.task`, `model.onnx`) must be
placed manually or copied from ClassroomAI-Monitor:

```bash
cp ../ClassroomAI-Monitor/yolov8n.pt models/
cp ../ClassroomAI-Monitor/pose_landmarker.task models/
cp ../ClassroomAI-Monitor/face_landmarker.task models/
```

Install Python dependencies:

```bash
pip install -r requirements.txt
```

Required: `ultralytics`, `mediapipe`, `opencv-contrib-python`, `numpy`, `torch`, `torchvision`.

Optional (for DAiSEE engagement): `onnxruntime`.  Place `model.onnx` in the project root.

## Implementation Notes

- Vision modules (`vision/`) vendored from ClassroomAI-Monitor. Pose detection runs on a face-derived upper-body crop.
- Wrist coordinates mapped from crop space to full-frame space for drinking distance calculation.
- Behaviour detection (drinking, chatting) uses temporal windows: 12–15 frame sliding windows.
- Qt font warning suppressed by installing DejaVu fonts to OpenCV's Qt font directory.
- ~6 fps on CPU (YOLO + 2× MediaPipe per frame). GPU (CUDA) significantly faster.
