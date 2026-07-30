"""
Session analysis — reads a JSONL session file and produces a focus report.

Methods (with academic references):
  Gaze Fixation Ratio  — Rayner (1998), Holmqvist et al. (2011)
  Head Pose Variance   — Gupta et al., DAiSEE (2016); LightNet (2025)
  Distraction Density  — ACM ICMI Multimodal Engagement (2024)
  Composite Score      — Useche & El-Sheikh, PyTtention (2016)

Usage:
  python analyze.py sessions/session_20260729_164025.jsonl
  python analyze.py sessions/session_20260729_164025.jsonl --window 10
"""

import argparse
import json
import math
import os
import sys
from collections import defaultdict


def load_session(path):
    frames = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                frames.append(json.loads(line))
    return frames


def safe_mean(values):
    values = [v for v in values if v is not None]
    return sum(values) / len(values) if values else None


def safe_std(values):
    values = [v for v in values if v is not None]
    if len(values) < 2:
        return None
    mean = sum(values) / len(values)
    return math.sqrt(sum((v - mean) ** 2 for v in values) / len(values))


def analyze(frames, window_sec=30):
    if not frames:
        return None

    duration = frames[-1]["timestamp"] - frames[0]["timestamp"]
    n = len(frames)

    # ── 1. Gaze Fixation Ratio ───────────────────────────────────
    # Rayner (1998): % of time eyes fixate on the target area.
    gaze_frames = sum(1 for f in frames if f["labels"]["gaze_center"])
    gaze_ratio = gaze_frames / n if n > 0 else 0.0

    # ── 2. Head Pose Variance ────────────────────────────────────
    # DAiSEE (Gupta et al., 2016): yaw/pitch variance → engagement.
    yaws = [f.get("metrics", {}).get("yaw") for f in frames]
    pitches = [f.get("metrics", {}).get("pitch") for f in frames]
    yaw_std = safe_std(yaws)
    pitch_std = safe_std(pitches)

    # ── 3. Distraction Event Density ─────────────────────────────
    # ACM ICMI (2024): distraction events/min → negative engagement.
    events = defaultdict(int)
    distractor_labels = ["playing_phone", "head_down", "drinking", "chatting"]
    for f in frames:
        for label in distractor_labels:
            if f["labels"].get(label):
                events[label] += 1

    # Count distinct distraction episodes (consecutive true → one episode)
    episodes = defaultdict(int)
    for label in distractor_labels:
        in_episode = False
        for f in frames:
            if f["labels"].get(label):
                if not in_episode:
                    episodes[label] += 1
                    in_episode = True
            else:
                in_episode = False

    total_distract_frames = sum(
        1 for f in frames
        if any(f["labels"].get(l) for l in distractor_labels)
    )
    distract_ratio = total_distract_frames / n if n > 0 else 0.0
    events_per_min = sum(episodes.values()) / (duration / 60) if duration > 0 else 0.0

    # ── 4. Engagement State (DAiSEE ONNX) ───────────────────────
    eng_scores = {
        "boredom": safe_mean([f.get("metrics", {}).get("eng_boredom")
                              for f in frames]),
        "confusion": safe_mean([f.get("metrics", {}).get("eng_confusion")
                                for f in frames]),
        "engagement": safe_mean([f.get("metrics", {}).get("eng_engagement")
                                 for f in frames]),
        "frustration": safe_mean([f.get("metrics", {}).get("eng_frustration")
                                  for f in frames]),
    }
    eng_available = any(v is not None for v in eng_scores.values())
    if eng_available:
        eng_states = [f["labels"].get("engagement") for f in frames
                      if f["labels"].get("engagement") is not None]
        eng_dist = {}
        for s in ["engaged", "boredom", "confusion", "frustration"]:
            cnt = eng_states.count(s)
            if cnt > 0:
                eng_dist[s] = cnt / len(eng_states) * 100
        eng_dominant = max(eng_dist, key=eng_dist.get) if eng_dist else None
        eng_engaged_pct = eng_dist.get("engaged", 0)
    else:
        eng_scores = None
        eng_dist = None
        eng_dominant = None
        eng_engaged_pct = None

    # ── 5. Composite Focus Score ─────────────────────────────────
    # PyTtention-style weighted fusion (Useche & El-Sheikh, 2016;
    # Hossen & Uddin, Comp. & Educ.: AI, 2023).
    face_detected = gaze_frames > 0 or yaw_std is not None

    if face_detected:
        gaze_score = gaze_ratio * 100
        if yaw_std is not None:
            yaw_norm = max(0.0, 1.0 - yaw_std / 25.0)
            pitch_norm = max(0.0, 1.0 - (pitch_std or 0) / 20.0)
            pose_score = (0.5 * yaw_norm + 0.5 * pitch_norm) * 100
            w_gaze, w_pose, w_eng = 0.40, 0.25, 0.15
        else:
            pose_score = 50
            w_gaze, w_pose, w_eng = 0.55, 0.15, 0.10

        # Engagement bonus: % time in "engaged" state × weight
        eng_bonus = (eng_engaged_pct or 0) * w_eng
        distract_penalty = min(30, sum(episodes.values()) * 5)
        focus_score = int(
            w_gaze * gaze_score
            + w_pose * pose_score
            + eng_bonus
            - distract_penalty * 0.20
        )
    else:
        focus_score = None

    focus_score = max(0, min(100, focus_score)) if focus_score is not None else None
    # ── 6. Timeline ──────────────────────────────────────────────
    timeline = []
    distractor_labels = ["playing_phone", "head_down", "drinking", "chatting"]
    frame_step = max(1, n // 40)
    for i in range(0, n, frame_step):
        chunk = frames[i : i + frame_step]
        ts = chunk[0]["timestamp"] - frames[0]["timestamp"]
        active = set()
        for f in chunk:
            for label in distractor_labels:
                if f["labels"].get(label):
                    active.add(label)
        if not active:
            timeline.append((ts, "FOCUSED"))
        elif len(active) == 1:
            timeline.append((ts, list(active)[0]))
        else:
            timeline.append((ts, "mixed"))

    return {
        "path": None,
        "duration": duration,
        "frames": n,
        "fps": n / duration if duration > 0 else 0,
        "gaze_ratio": gaze_ratio,
        "yaw_std": yaw_std,
        "pitch_std": pitch_std,
        "events": dict(events),
        "episodes": dict(episodes),
        "distract_ratio": distract_ratio,
        "events_per_min": events_per_min,
        "eng_scores": eng_scores,
        "eng_distribution": eng_dist,
        "eng_dominant": eng_dominant,
        "focus_score": focus_score,
        "timeline": timeline,
    }


def report(result):
    if result is None:
        print("No data to analyse.")
        return

    BAR_WIDTH = 40

    print()
    print(f"  Session: {os.path.basename(result['path'])}" if result["path"] else "  Session Analysis")
    print(f"  Duration: {result['duration']:.1f}s  |  {result['frames']} frames  |  {result['fps']:.1f} fps")
    print()

    # Gaze Fixation Ratio
    g = result["gaze_ratio"]
    bar_fill = int(g * BAR_WIDTH)
    bar = "█" * bar_fill + "░" * (BAR_WIDTH - bar_fill)
    print("  ── Gaze Fixation Ratio (Rayner 1998) ──")
    print(f"  {bar}  {g*100:.1f}%")
    print(f"  {result['gaze_ratio']*result['frames']:.0f}/{result['frames']} frames looking at screen centre")
    print()

    # Head Pose Variance
    print("  ── Head Pose Stability (DAiSEE 2016) ──")
    yaw_s = result["yaw_std"]
    pitch_s = result["pitch_std"]
    print(f"  Yaw   σ = {yaw_s:.1f}°" if yaw_s is not None else "  Yaw   σ = N/A")
    print(f"  Pitch σ = {pitch_s:.1f}°" if pitch_s is not None else "  Pitch σ = N/A")
    face_seen = result["gaze_ratio"] > 0 or yaw_s is not None
    if yaw_s is not None:
        rating = "stable" if yaw_s < 10 else ("moderate" if yaw_s < 20 else "unstable")
    elif face_seen:
        rating = "N/A (old session format — re-record for pose data)"
    else:
        rating = "N/A (no face detected)"
    print(f"  Rating: {rating}")
    print()

    # Distraction
    print("  ── Distraction Events (ICMI 2024) ──")
    eps = result["episodes"]
    total_eps = sum(eps.values())
    if total_eps == 0:
        print("  No distraction episodes detected.")
    else:
        for label in ["playing_phone", "head_down", "drinking", "chatting"]:
            if eps.get(label, 0) > 0:
                print(f"  {label:>16s}: {eps[label]} episodes")
        print(f"  {'Total':>16s}: {total_eps} episodes ({result['events_per_min']:.1f}/min)")
        print(f"  Distracted frames: {result['distract_ratio']*100:.1f}%")
    print()

    # Engagement (DAiSEE)
    if result.get("eng_scores"):
        es = result["eng_scores"]
        print("  ── Engagement State (DAiSEE 2016) ──")
        print(f"  {'Boredom':>12s}: {es['boredom']:.3f}" if es["boredom"] is not None else f"  {'Boredom':>12s}: N/A")
        print(f"  {'Confusion':>12s}: {es['confusion']:.3f}" if es["confusion"] is not None else f"  {'Confusion':>12s}: N/A")
        print(f"  {'Engaged':>12s}: {es['engagement']:.3f}" if es["engagement"] is not None else f"  {'Engaged':>12s}: N/A")
        print(f"  {'Frustration':>12s}: {es['frustration']:.3f}" if es["frustration"] is not None else f"  {'Frustration':>12s}: N/A")
        if result.get("eng_distribution"):
            ed = result["eng_distribution"]
            for s, pct in ed.items():
                bar_fill = int(pct / 100 * 30)
                bar_s = "█" * bar_fill + "░" * (30 - bar_fill)
                print(f"  {s:>12s}: {bar_s} {pct:.1f}%")
        if result.get("eng_dominant"):
            print(f"  Dominant state: {result['eng_dominant']}")
        print()
    else:
        print("  ── Engagement State (DAiSEE 2016) ──")
        print("  N/A — engagement model not loaded or no face detected")
        print()

    # Composite Score
    print("  ── Composite Focus Score (PyTtention 2016) ──")
    fs = result["focus_score"]
    if fs is not None:
        bar_fill = int(fs / 100 * BAR_WIDTH)
        bar = "█" * bar_fill + "░" * (BAR_WIDTH - bar_fill)
        grade = "A" if fs >= 85 else ("B" if fs >= 70 else ("C" if fs >= 50 else "D"))
        print(f"  {bar}  {fs}/100  Grade: {grade}")
    else:
        print("  N/A — no face detected in session")
    print(f"  Formula: 0.40×Gaze + 0.25×Pose + 0.15×Engaged% − DistractPenalty")
    print()

    # Timeline
    print("  ── Timeline ──")
    for ts, label in result["timeline"]:
        mins = int(ts // 60)
        secs = int(ts % 60)
        marker = "·" if label == "FOCUSED" else "!"
        print(f"  [{mins:2d}:{secs:02d}] {marker} {label}")
    print()


def main():
    parser = argparse.ArgumentParser(description="Analyse a reading-monitor session.")
    parser.add_argument("path", help="Path to session .jsonl file")
    parser.add_argument("--window", type=int, default=30,
                        help="Sliding window in seconds (default: 30)")
    args = parser.parse_args()

    if not os.path.exists(args.path):
        sys.exit(f"File not found: {args.path}")

    frames = load_session(args.path)
    result = analyze(frames, args.window)
    result["path"] = args.path
    report(result)


if __name__ == "__main__":
    main()
