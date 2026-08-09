# Reading Monitor（Congnoscope · 行为检测）

单人学习行为监测：摄像头 → 五路检测 → JSONL 事件流 → 离线专注分析。  
作为 **Congnoscope** 子模块位于仓库 `monitor/`；浏览器经 HTTP API 启停检测。

> 前端进度与待办见根目录 [`PROGRESS.md`](../PROGRESS.md)。  
> TypeScript 客户端：`src/utils/monitorApi.ts`；会话转换雏形：`src/utils/monitorAdapter.ts`。

---

## 与 Congnoscope 的集成

```
Browser (Congnoscope)                Python (monitor/)
─────────────────                    ─────────────────
ReaderPage ──POST /api/detect/start──→ server.py → ReadingMonitor
         ←── sessionId / status ─────
… 阅读中 …
ReaderPage ──POST /api/detect/stop───→ 写 sessions/*.jsonl
Dashboard ← sessionStore / IndexedDB   （结束时合并已落地；实时推流仍待办）
```

阅读页结束边界会先停止检测，再读取完整 JSONL，并把专注、疲劳和分心字段
原子合并到同一条 `ReadingSession`；monitor 不可用时只保留本地阅读会话，不
补造任何指标。小于 5 秒的 monitor 片段不会进入统计。

| 步骤 | 命令 |
|---|---|
| 终端 1 | `pip install -r monitor/requirements.txt` → `python monitor/server.py`（默认 **8765**） |
| 终端 2 | 仓库根目录 `npm run dev` |

阅读页打开论文时会尝试 `startDetection(fileId)`；服务未启动时前端不阻断阅读。

### HTTP API

| Method | Path | 说明 |
|---|---|---|
| `POST` | `/api/detect/start` | Body 可选 `{ fileId }`；开始检测 |
| `POST` | `/api/detect/stop` | 停止并返回 session 路径 / 帧数 |
| `GET` | `/api/detect/status` | `running`、`sessionId`、`frameCount`、`fileId` |
| `GET` | `/api/sessions` | 列出 JSONL 会话元数据 |
| `GET` | `/api/sessions/<id>` | 全帧数据 |
| `GET` | `/api/sessions/<id>/analyze` | 专注分析报告 |
| `GET` | `/api/health` | 健康检查 |

CORS 已开，供 `http://localhost:5173` 调用。

### 标签 → Congnoscope `DistractionKind`

| Monitor label | DistractionKind | 说明 |
|---|---|---|
| `playing_phone` | `phone` | 直接 |
| `drinking` | `drink` | 直接 |
| `chatting` | `talk` | 直接 |
| `head_down` | `away` | 低头 ≈ 未专注 |
| `gaze_center: false` | `gaze_off` | 优先级最低 |
| — | `yawn` | Congnoscope 类型有，monitor 暂未检 |

### 当前缺口（与 PROGRESS P1/P2 对齐）

- [ ] 实时推流（现为 start→stop→analyze 批处理）  
- [ ] 浏览器前台可见性与 monitor 暂停/恢复仍需独立接入，当前不从缺失字段推断前台状态
- [ ] **窗口是否在最上方**：非前台不计/降权专注（前端或系统钩子）  
- [ ] **临近专注时段自动合并**  
- [x] **阅读 &lt; 5s 的会话不算专注**

---

## Detection Capabilities

| Behaviour | Method | Technology |
|---|---|---|
| Playing phone | YOLOv8 object detection (COCO class 67) | `ultralytics` |
| Head down | Nose-below-shoulders via pose landmarks | MediaPipe PoseLandmarker |
| Gaze at screen | Head-pose yaw/pitch + iris gaze ratios | MediaPipe FaceLandmarker |
| Drinking | Cup/bottle YOLO + wrist-to-mouth | YOLO + MediaPipe Pose |
| Chatting | MAR oscillation + head yaw | MediaPipe FaceLandmarker |
| Engagement | DAiSEE ONNX（boredom / confusion / engaged / frustration） | `onnxruntime`（可选） |

## Paper References

| Paper | Method | Application |
|---|---|---|
| Wierwille et al. (1994). NHTSA DOT HS 808 247 | PERCLOS | Drowsiness indicator |
| Rayner, K. (1998). *Psychological Bulletin* | Gaze fixation ratio | Reading attention |
| Gupta et al. (2016). DAiSEE [arXiv:1609.01885](https://arxiv.org/abs/1609.01885) | Engagement 4-class | Bored / confused / engaged / frustrated |
| Useche & El-Sheikh (2016). PyTtention | Weighted multimodal fusion | Composite focus score |
| Hossen & Uddin (2023). *CAEAI* 5, 100191 | Multimodal + XGBoost | Multi-signal attention |
| ACM ICMI (2024) | Distraction event density | Phone/chat/drink counting |

### Focus Score Formula

```
FocusScore = w1×GazeRatio + w2×(1−PERCLOS) + w3×(1−HeadVar_norm)
           + w4×(1−DistractDensity_norm) + w5×EngagedRatio
```

| Weight | Term | Value | Status |
|---|---|---|---|
| w₁ | Gaze fixation ratio | 0.40 (0.55 w/o pose) | active |
| w₂ | 1 − PERCLOS | 0 (deferred) | pending eye-aperture |
| w₃ | 1 − HeadPoseVariance_norm | 0.25 (0.15 w/o pose) | active |
| w₄ | Distraction penalty | 0.20 | active（上限 −30） |
| w₅ | % time “engaged” (DAiSEE) | 0.15 (0.10 w/o pose) | active（需 ONNX） |

当前有效：`0.40×Gaze + 0.25×Pose + 0.15×Engaged% − 0.20×DistractPenalty`

---

## Project Structure

```
monitor/
├── main.py              # ReadingMonitor + CLI
├── server.py            # Flask HTTP API（Congnoscope对接入口）
├── analyze.py           # 会话分析 + 终端报告
├── requirements.txt
├── README.md
├── vision/              # 自包含视觉模块
│   ├── focus.py
│   ├── pose.py
│   └── behavior.py
├── models/              # 需自行放置（见下）
│   ├── yolov8n.pt
│   ├── pose_landmarker.task
│   └── face_landmarker.task
├── model.onnx           # 可选 DAiSEE
└── sessions/            # JSONL 输出（自动创建）
```

安装依赖：

```bash
cd monitor   # 或在仓库根对 requirements 指定路径
pip install -r requirements.txt
```

必需：`ultralytics`、`mediapipe`、`opencv-contrib-python`、`numpy`、`torch`、`torchvision`、`flask`、`flask-cors`。  
可选：`onnxruntime`（DAiSEE）。

模型文件放入 `monitor/models/`（勿提交大二进制时可本地拷贝）。

---

## Usage

### 1. HTTP 服务（推荐，对接Congnoscope）

```bash
python monitor/server.py              # :8765
python monitor/server.py --port 9876
```

### 2. CLI 实时监测

```bash
python monitor/main.py                # 带预览窗
python monitor/main.py --headless     # 无窗后台
```

预览模式按 `Q` 结束；无窗模式 `Ctrl+C`。事件写入 `sessions/session_YYYYMMDD_HHMMSS.jsonl`。

**Python start/stop API：**

```python
from main import ReadingMonitor

m = ReadingMonitor(headless=True)
m.start()
path = m.stop()
print(m.frame_count, path)
```

### 3. 离线分析

```bash
python monitor/analyze.py sessions/session_20260730_115945.jsonl
```

```python
from analyze import load_session, analyze, report

frames = load_session("sessions/session_….jsonl")
result = analyze(frames)
report(result)
```

`result` 主要字段：`duration`、`frames`、`fps`、`gaze_ratio`、`yaw_std`、`pitch_std`、`events`、`episodes`、`distract_ratio`、`events_per_min`、`eng_distribution`、`eng_dominant`、`focus_score`、`timeline`。

### 4. JSONL 行格式

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

| Field | Type | Description |
|---|---|---|
| `timestamp` | float | Unix 秒 |
| `frame` | int | 帧序号 |
| `labels.*` | bool / string | 行为与 engagement 主导态 |
| `metrics.focus_score` | int\|null | 头姿专注分 0–100 |
| `metrics.yaw` / `pitch` | float\|null | 头姿角（度） |
| `metrics.gaze_h` / `gaze_v` | float\|null | 虹膜位置 0–1 |
| `metrics.mar` | float\|null | 嘴部纵横比 |
| `metrics.eng_*` | float\|null | DAiSEE 四类概率 |

---

## Implementation Notes

- `vision/` 已自包含，不依赖仓库外 ClassroomAI-Monitor 路径（模型文件仍需本地放置）。  
- Pose 在人脸推导的上半身 crop 上跑；手腕坐标映射回全图用于饮水距离。  
- 饮水 / 聊天用 12–15 帧滑窗。  
- CPU 约 ~6 fps（YOLO + 双 MediaPipe）；CUDA 明显更快。  
- 仅用 `python monitor/server.py` 即可对接前端；**不要**与 `main.py` 同时抢同一摄像头。

---

## Changelog（文档）

| 日期 | 说明 |
|---|---|
| 2026-07-30 | 对齐Congnoscope仓库：Flask `server.py`、前端 API、集成图与 P1 待办；修正目录结构描述 |
