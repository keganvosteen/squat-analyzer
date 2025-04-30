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

# MoveNet index → MediaPipe index (17 body points)
_MP_ORDER = [
     0, 1, 2, 3, 4,      # nose, eyes, ears
     5, 7, 6, 8,         # shoulders L,R  – elbows L,R
     9, 11, 10, 12,      # wrists   L,R  – hips   L,R
    13, 15, 14, 16       # knees    L,R  – ankles L,R
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
