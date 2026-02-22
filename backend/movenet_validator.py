import cv2
import numpy as np
import onnxruntime as ort
from pathlib import Path
import urllib.request

# Load MoveNet Thunder ONNX model
MODEL_URL = "https://raw.githubusercontent.com/onnx/models/main/vision/body_analysis/movenet/model/movenet_thunder.onnx"
MODEL_PATH = Path.home() / "models" / "movenet_thunder.onnx"

def download_model():
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    print(f"[Squat] Downloading MoveNet model from {MODEL_URL} to {MODEL_PATH}")
    urllib.request.urlretrieve(MODEL_URL, MODEL_PATH.as_posix())

if not MODEL_PATH.exists():
    download_model()

try:
    _ort_sess = ort.InferenceSession(
        MODEL_PATH.as_posix(),
        providers=["CUDAExecutionProvider", "CPUExecutionProvider"]
    )
except Exception as e:
    if "INVALID_PROTOBUF" in str(e):
        print(f"[Squat] Invalid protobuf model at {MODEL_PATH}, re-downloading...")
        MODEL_PATH.unlink(missing_ok=True)
        download_model()
        _ort_sess = ort.InferenceSession(
            MODEL_PATH.as_posix(),
            providers=["CUDAExecutionProvider", "CPUExecutionProvider"]
        )
    else:
        raise

_INP  = _ort_sess.get_inputs()[0].name
_OUT  = _ort_sess.get_outputs()[0].name

# MoveNet index → MediaPipe-aligned order (17 body points)
# MoveNet native order: 0=nose, 1=L_eye, 2=R_eye, 3=L_ear, 4=R_ear,
#   5=L_shoulder, 6=R_shoulder, 7=L_elbow, 8=R_elbow,
#   9=L_wrist, 10=R_wrist, 11=L_hip, 12=R_hip,
#   13=L_knee, 14=R_knee, 15=L_ankle, 16=R_ankle
# MediaPipe body order (indices 11+): 11=L_shoulder, 12=R_shoulder,
#   13=L_elbow, 14=R_elbow, 15=L_wrist, 16=R_wrist,
#   23=L_hip, 24=R_hip, 25=L_knee, 26=R_knee, 27=L_ankle, 28=R_ankle
# We keep MoveNet's native 0-16 order since cross-validation compares
# starting at index 5, which aligns correctly without reordering.
_MP_ORDER = [
     0, 1, 2, 3, 4,      # nose, L_eye, R_eye, L_ear, R_ear
     5, 6, 7, 8,          # L_shoulder, R_shoulder, L_elbow, R_elbow
     9, 10, 11, 12,       # L_wrist, R_wrist, L_hip, R_hip
    13, 14, 15, 16        # L_knee, R_knee, L_ankle, R_ankle
]

def infer_pose_bgr(frame_bgr: np.ndarray) -> np.ndarray:
    """Return (17,3) array of x,y,score in original-image coords."""
    h, w = frame_bgr.shape[:2]
    size = min(h, w)
    y0   = (h - size) // 2
    x0   = (w - size) // 2
    crop = frame_bgr[y0:y0+size, x0:x0+size]

    inp  = cv2.resize(crop, (256, 256))[None].astype(np.uint8)
    out  = _ort_sess.run([_OUT], {_INP: inp})[0][0]   # 17×3

    # x,y back to absolute pixels
    out[:, 0] = out[:, 0] * size + x0
    out[:, 1] = out[:, 1] * size + y0
    return out[_MP_ORDER]
