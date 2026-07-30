"""
Behaviour analysis on a single face track.

Gaze direction — pupil-level (iris landmarks) + head-pose gate.
Drinking   — wrist trajectory approaching the mouth + nearby cup/bottle.
Talking    — mouth-aspect-ratio oscillation with a head-turn gate.
"""

import math
from collections import deque

# ── MediaPipe FaceLandmarker indices ──────────────────────────────
# Iris refinement gives landmarks 468-477 (10 points, 5 per iris).
IRIS_A = (468, 469, 470, 471, 472)
IRIS_B = (473, 474, 475, 476, 477)

# Eye corners and lids. Named A/B rather than left/right because
# MediaPipe's "left" is the subject's left, which lands on the image's
# right — pairing is resolved geometrically in _eye_gaze instead.
EYE_A_CORNERS = (33, 133)
EYE_A_LIDS = (159, 145)   # upper, lower
EYE_B_CORNERS = (362, 263)
EYE_B_LIDS = (386, 374)

LIP_TOP = 13              # inner lip, upper
LIP_BOT = 14              # inner lip, lower
MOUTH_L = 61
MOUTH_R = 291

MIN_LANDMARKS_FOR_IRIS = 478

# ── Gaze thresholds ───────────────────────────────────────────────
# Horizontal band lifted from GazeTracking (is_right <= 0.35,
# is_left >= 0.65) — same ratio orientation, so the numbers carry over:
# 0.0 = iris at image-left edge of the eye, 1.0 = image-right edge.
GAZE_RIGHT_MAX = 0.35
GAZE_LEFT_MIN = 0.65

# Vertical band is wider. Eyelid aperture is a few pixels at webcam
# resolution, so the ratio is far noisier than the horizontal one.
GAZE_UP_MAX = 0.28
GAZE_DOWN_MIN = 0.78

# Below this aperture-to-width ratio the eye is squinting or mid-blink
# and the vertical ratio is meaningless.
MIN_EYE_APERTURE = 0.10

# Head must be roughly frontal before "looking at screen centre" holds.
GAZE_HEAD_YAW_MAX = 20.0
GAZE_HEAD_PITCH_MAX = 15.0

# ── Drinking thresholds ───────────────────────────────────────────
# Distances are in multiples of mouth width, which scales with face
# size and so survives the person sitting closer to or further from
# the camera.
DRINK_NEAR_MOUTH = 2.0
DRINK_APPROACH_DELTA = 0.8     # mouth-widths of net approach
DRINK_WINDOW = 12              # frames of wrist history
DRINK_MIN_NEAR_FRAMES = 4      # of the last 8, when no approach seen

# ── Talking thresholds ────────────────────────────────────────────
MAR_WINDOW = 15
MAR_OPEN_MIN = 0.06            # mouth genuinely parts at some point
MAR_STD_MIN = 0.025            # aperture oscillates rather than holds
MAR_PEAKS_MIN = 2              # separates speech from a single yawn
TALK_YAW_MIN = 12.0            # head turned toward a neighbour

TRACK_TTL = 30.0               # seconds before a stale track is dropped


def _px(landmarks, idx, w, h):
    lm = landmarks[idx]
    return lm.x * w, lm.y * h


def _dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _centroid(landmarks, idxs, w, h):
    xs = 0.0
    ys = 0.0
    n = len(idxs)
    for i in idxs:
        x, y = _px(landmarks, i, w, h)
        xs += x
        ys += y
    return xs / n, ys / n


def _ratio(value, lo, hi):
    """Position of `value` inside [lo, hi], clamped to [0, 1]."""
    if hi == lo:
        return 0.5
    span = hi - lo
    return min(1.0, max(0.0, (value - lo) / span))


def _eye_ratios(landmarks, corners, lids, iris_c, w, h):
    """Horizontal and vertical iris position within one eye."""
    c_inner, c_outer = corners
    lid_top, lid_bot = lids
    inner = _px(landmarks, c_inner, w, h)
    outer = _px(landmarks, c_outer, w, h)
    top = _px(landmarks, lid_top, w, h)
    bot = _px(landmarks, lid_bot, w, h)

    iris = _centroid(landmarks, iris_c, w, h)

    h_ratio = _ratio(iris[0], inner[0], outer[0])
    eye_height = _dist(top, bot)
    eye_width = _dist(inner, outer)
    aperture = eye_height / eye_width if eye_width > 1e-6 else 0.0

    v_ratio = None
    if aperture >= MIN_EYE_APERTURE:
        v_ratio = _ratio(iris[1], top[1], bot[1])

    return h_ratio, v_ratio


def eye_gaze(landmarks, w, h):
    """
    Returns (h_ratio, v_ratio, direction) where direction is one of:
    'center', 'left', 'right', 'up', 'down', 'blink', None.
    Uses both eyes and averages the ratios.
    """
    if landmarks is None or len(landmarks) < MIN_LANDMARKS_FOR_IRIS:
        return None, None, None

    ha, va = _eye_ratios(landmarks, EYE_A_CORNERS, EYE_A_LIDS, IRIS_A, w, h)
    hb, vb = _eye_ratios(landmarks, EYE_B_CORNERS, EYE_B_LIDS, IRIS_B, w, h)

    if ha is None or hb is None:
        return None, None, None

    h_ratio = (ha + hb) / 2
    v_ratio = None
    if va is not None and vb is not None:
        v_ratio = (va + vb) / 2

    if v_ratio is None:
        direction = "blink"
    elif h_ratio <= GAZE_RIGHT_MAX:
        direction = "right"
    elif h_ratio >= GAZE_LEFT_MIN:
        direction = "left"
    elif v_ratio <= GAZE_UP_MAX:
        direction = "up"
    elif v_ratio >= GAZE_DOWN_MIN:
        direction = "down"
    else:
        direction = "center"

    return h_ratio, v_ratio, direction


def mouth_aspect_ratio(landmarks, w, h):
    """Inner-lip aperture divided by mouth width. None if unavailable."""
    if landmarks is None or len(landmarks) <= MOUTH_R:
        return None
    top = _px(landmarks, LIP_TOP, w, h)
    bot = _px(landmarks, LIP_BOT, w, h)
    left = _px(landmarks, MOUTH_L, w, h)
    right = _px(landmarks, MOUTH_R, w, h)
    width = _dist(left, right)
    if width < 1e-6:
        return None
    return _dist(top, bot) / width


def mouth_center(landmarks, w, h):
    if landmarks is None or len(landmarks) <= MOUTH_R:
        return None
    top = _px(landmarks, LIP_TOP, w, h)
    bot = _px(landmarks, LIP_BOT, w, h)
    return (top[0] + bot[0]) / 2, (top[1] + bot[1]) / 2


def mouth_width(landmarks, w, h):
    if landmarks is None or len(landmarks) <= MOUTH_R:
        return None
    left = _px(landmarks, MOUTH_L, w, h)
    right = _px(landmarks, MOUTH_R, w, h)
    width = _dist(left, right)
    return width if width > 1e-6 else None


def _std(values):
    n = len(values)
    if n < 2:
        return 0.0
    mean = sum(values) / n
    return math.sqrt(sum((v - mean) ** 2 for v in values) / n)


def _count_peaks(values, threshold):
    """Rises above `threshold` that come back down — speech syllables."""
    peaks = 0
    rising = False
    for v in values:
        if not rising and v > threshold:
            rising = True
            peaks += 1
        elif rising and v <= threshold:
            rising = False
    return peaks


class _TrackState:
    __slots__ = ("mar", "wrist_dist", "last_seen")

    def __init__(self):
        self.mar = deque(maxlen=MAR_WINDOW)
        self.wrist_dist = deque(maxlen=DRINK_WINDOW)
        self.last_seen = 0.0


class BehaviorTracker:
    """
    Per-track temporal state. Single-frame landmark readings are far too
    noisy for these behaviours: drinking needs a wrist trajectory and
    talking needs aperture oscillation, both of which only exist over a
    window of frames.
    """

    def __init__(self):
        self._tracks = {}

    def _state(self, track_id, now):
        state = self._tracks.get(track_id)
        if state is None:
            state = _TrackState()
            self._tracks[track_id] = state
        state.last_seen = now
        return state

    def prune(self, now):
        stale = [tid for tid, s in self._tracks.items()
                 if now - s.last_seen > TRACK_TTL]
        for tid in stale:
            del self._tracks[tid]

    def update(self, track_id, landmarks, crop_shape, pose,
               yaw, pitch, drink_object, now):
        """
        Fold one frame into a track's history and return current verdicts.

        landmarks    — MediaPipe face landmarks for this crop, or None
        crop_shape   — (h, w) of the crop the landmarks are normalised to
        pose         — dict from analyze_pose(), or None
        drink_object — a cup/bottle/glass box overlaps this person
        """
        h, w = crop_shape[0], crop_shape[1]
        state = self._state(track_id, now)

        h_ratio, v_ratio, gaze_dir = eye_gaze(landmarks, w, h)

        head_frontal = (
            yaw is not None and pitch is not None
            and abs(yaw) <= GAZE_HEAD_YAW_MAX
            and abs(pitch) <= GAZE_HEAD_PITCH_MAX
        )
        gaze_center = bool(gaze_dir == "center" and head_frontal)

        # ── Talking: aperture oscillation + head turned aside ──────
        mar = mouth_aspect_ratio(landmarks, w, h)
        if mar is not None:
            state.mar.append(mar)

        talking = False
        mar_oscillating = False
        if len(state.mar) >= MAR_WINDOW // 2:
            series = list(state.mar)
            baseline = min(series) + MAR_OPEN_MIN / 2
            mar_oscillating = (
                max(series) >= MAR_OPEN_MIN
                and _std(series) >= MAR_STD_MIN
                and _count_peaks(series, baseline) >= MAR_PEAKS_MIN
            )
            # The yaw gate is what separates chatting with a neighbour
            # from answering the teacher head-on.
            talking = bool(mar_oscillating
                           and yaw is not None
                           and abs(yaw) >= TALK_YAW_MIN)

        # ── Drinking: container present + wrist reaches the mouth ──
        drinking = False
        hand_near_mouth = False
        m_center = mouth_center(landmarks, w, h)
        m_width = mouth_width(landmarks, w, h)

        if m_center is not None and m_width is not None and pose is not None:
            wrists = [wr for wr in (pose.get("wrist_left"),
                                    pose.get("wrist_right")) if wr is not None]
            if wrists:
                nearest = min(_dist(wr, m_center) for wr in wrists) / m_width
                state.wrist_dist.append(nearest)
                hand_near_mouth = nearest <= DRINK_NEAR_MOUTH

        if drink_object and state.wrist_dist:
            series = list(state.wrist_dist)
            approaching = (len(series) >= 4
                           and series[0] - series[-1] >= DRINK_APPROACH_DELTA)
            recent = series[-8:]
            dwelling = sum(1 for d in recent
                           if d <= DRINK_NEAR_MOUTH) >= DRINK_MIN_NEAR_FRAMES
            drinking = bool(hand_near_mouth and (approaching or dwelling))

        return {
            "gaze_center": gaze_center,
            "gaze_dir": gaze_dir,
            "gaze_h": None if h_ratio is None else round(h_ratio, 3),
            "gaze_v": None if v_ratio is None else round(v_ratio, 3),
            "head_frontal": head_frontal,
            "talking": talking,
            "mar": None if mar is None else round(mar, 3),
            "mar_oscillating": mar_oscillating,
            "drinking": drinking,
            "hand_near_mouth": hand_near_mouth,
        }
