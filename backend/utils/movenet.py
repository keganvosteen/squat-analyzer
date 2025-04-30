import os, numpy as np, cv2, onnxruntime as ort

MODEL_PATH = os.environ.get(
    "MOVENET_PATH",
    os.path.expanduser("~/models/movenet_thunder.onnx")
)
options = ort.SessionOptions()
options.log_severity_level = 2  # Only warnings and errors
sess = ort.InferenceSession(
    MODEL_PATH,
    sess_options=options,
    providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
)

def infer(frame_bgr):
    # Convert BGR to RGB and resize
    img = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    img = cv2.resize(img, (256, 256), interpolation=cv2.INTER_LINEAR)
    # Normalize and add batch dimension
    img = img.astype(np.float32)[np.newaxis, ...] / 255.0
    # Run inference (output shape: 1,1,17,3)
    outputs = sess.run(None, {"input": img})[0]
    kp = outputs[0, 0, :, :]  # (17,3): [y, x, score]
    # Convert to list of landmark dicts
    landmarks = [
        {
            "x": float(k[1]),
            "y": float(k[0]),
            "z": 0.0,
            "visibility": float(k[2]),
        }
        for k in kp
    ]
    return landmarks
