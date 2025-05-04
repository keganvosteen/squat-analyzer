# app.py
#
# Render.com deployment troubleshooting:
# - Ensure your Render service allows large POST bodies (check 'Body Size Limit' in settings).
# - Gunicorn: Use --timeout 120 and multiple workers (e.g., --workers 2). For low-memory hosts, consider --worker-class=gthread.
# - If uploads work locally but not on Render, the proxy may be stripping or truncating uploads.
# - For debugging, log raw request data length if file upload fails (see below).
#
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS, cross_origin
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
from mediapipe.tasks.python.components import processors
from mediapipe.framework.formats import landmark_pb2
import base64
import io
from PIL import Image
import time
import os
import math
import requests
import gc
import psutil
from werkzeug.utils import secure_filename
import multiprocessing
from concurrent.futures import ThreadPoolExecutor
import traceback
import uuid
import tempfile
import logging
from movenet_validator import infer_pose_bgr, _ort_sess
import subprocess
import json

app = Flask(__name__)
import logging
# Only show warnings and above in Flask logs
app.logger.setLevel(logging.WARNING)
# Suppress Werkzeug request logs
logging.getLogger('werkzeug').setLevel(logging.ERROR)
class MemoryFilter(logging.Filter):
    def filter(self, record):
        # Suppress logs containing memory diagnostics tag
        return "[MEM_DIAG]" not in record.getMessage()
app.logger.addFilter(MemoryFilter())
CORS(app, resources={
    r"/*": {
        "origins": ["https://squat-analyzer-frontend.onrender.com", "http://localhost:5173"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "supports_credentials": True
    }
})

# Initialize MediaPipe Pose
BaseOptions = mp.tasks.BaseOptions
PoseLandmarker = mp.tasks.vision.PoseLandmarker
PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
PoseLandmarkerResult = mp.tasks.vision.PoseLandmarkerResult
VisionRunningMode = mp.tasks.vision.RunningMode

# Define pose landmarks indices
class POSE_LANDMARKS:
    NOSE = 0
    LEFT_EYE_INNER = 1
    LEFT_EYE = 2
    LEFT_EYE_OUTER = 3
    RIGHT_EYE_INNER = 4
    RIGHT_EYE = 5
    RIGHT_EYE_OUTER = 6
    LEFT_EAR = 7
    RIGHT_EAR = 8
    MOUTH_LEFT = 9
    MOUTH_RIGHT = 10
    LEFT_SHOULDER = 11
    RIGHT_SHOULDER = 12
    LEFT_ELBOW = 13
    RIGHT_ELBOW = 14
    LEFT_WRIST = 15
    RIGHT_WRIST = 16
    LEFT_PINKY = 17
    RIGHT_PINKY = 18
    LEFT_INDEX = 19
    RIGHT_INDEX = 20
    LEFT_THUMB = 21
    RIGHT_THUMB = 22
    LEFT_HIP = 23
    RIGHT_HIP = 24
    LEFT_KNEE = 25
    RIGHT_KNEE = 26
    LEFT_ANKLE = 27
    RIGHT_ANKLE = 28
    LEFT_HEEL = 29
    RIGHT_HEEL = 30
    LEFT_FOOT_INDEX = 31
    RIGHT_FOOT_INDEX = 32

# Function to download and cache the model
def download_model(url, model_path):
    if not os.path.exists(model_path):
        print(f"Downloading model from {url} to {model_path}")
        os.makedirs(os.path.dirname(model_path), exist_ok=True)
        response = requests.get(url)
        with open(model_path, 'wb') as f:
            f.write(response.content)
    return model_path

# Set up model paths (variant configurable to save memory on low-resource hosts like Render)
MODEL_VARIANT = os.environ.get('POSE_MODEL_VARIANT', 'full')  # heavy|full|lite
assert MODEL_VARIANT in ('heavy', 'full', 'lite'), "POSE_MODEL_VARIANT must be heavy, full, or lite"
MODEL_URL = f'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_{MODEL_VARIANT}/float16/1/pose_landmarker_{MODEL_VARIANT}.task'
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'models', f'pose_landmarker_{MODEL_VARIANT}.task')

# Download and get the model path
model_path = download_model(MODEL_URL, MODEL_PATH)

# Initialize a global pose landmarker to reuse across requests and frames (helps memory)
pose_landmarker_global = PoseLandmarker.create_from_options(
    PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=model_path),
        running_mode=VisionRunningMode.IMAGE,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5
    )
)

# Global variables for squat state tracking
previous_states = {}
squat_timings = {}
squat_counts = {}
# Global dictionary to store session start times
session_start_times = {}

# Allowed video file extensions
ALLOWED_EXTENSIONS = {'mp4', 'webm', 'avi', 'mkv'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def calculate_angle(a, b, c):
    """Calculate the angle between three points with stability checks."""
    try:
        # Get coordinates with fallbacks for all possible data formats
        try:
            # Try dictionary access first with proper conditional expressions
            a_x = a.get('x', 0) if isinstance(a, dict) else (a.x if hasattr(a, 'x') else 0)
            a_y = a.get('y', 0) if isinstance(a, dict) else (a.y if hasattr(a, 'y') else 0)
            
            b_x = b.get('x', 0) if isinstance(b, dict) else (b.x if hasattr(b, 'x') else 0)
            b_y = b.get('y', 0) if isinstance(b, dict) else (b.y if hasattr(b, 'y') else 0)
            
            c_x = c.get('x', 0) if isinstance(c, dict) else (c.x if hasattr(c, 'x') else 0)
            c_y = c.get('y', 0) if isinstance(c, dict) else (c.y if hasattr(c, 'y') else 0)
        except Exception:
            # More explicit approach if the above fails
            if isinstance(a, dict):
                a_x, a_y = a.get('x', 0), a.get('y', 0)
            elif hasattr(a, 'x') and hasattr(a, 'y'):
                a_x, a_y = a.x, a.y
            else:
                a_x, a_y = 0, 0
                
            if isinstance(b, dict):
                b_x, b_y = b.get('x', 0), b.get('y', 0)
            elif hasattr(b, 'x') and hasattr(b, 'y'):
                b_x, b_y = b.x, b.y
            else:
                b_x, b_y = 0, 0
                
            if isinstance(c, dict):
                c_x, c_y = c.get('x', 0), c.get('y', 0)
            elif hasattr(c, 'x') and hasattr(c, 'y'):
                c_x, c_y = c.x, c.y
            else:
                c_x, c_y = 0, 0
            
        # Calculate vectors
        ba_x, ba_y = a_x - b_x, a_y - b_y
        bc_x, bc_y = c_x - b_x, c_y - b_y
        
        # Calculate dot product
        dot_product = (ba_x * bc_x + ba_y * bc_y)
        
        # Calculate magnitudes
        magnitude_ba = math.sqrt(ba_x**2 + ba_y**2)
        magnitude_bc = math.sqrt(bc_x**2 + bc_y**2)
        
        # Handle division by zero
        if magnitude_ba < 1e-6 or magnitude_bc < 1e-6:
            return 0
            
        # Calculate cosine of angle
        cosine_angle = dot_product / (magnitude_ba * magnitude_bc)
        
        # Clamp to valid range to handle floating point errors
        cosine_angle = max(-1, min(1, cosine_angle))
        
        # Calculate angle in degrees
        angle_rad = math.acos(cosine_angle)
        angle_deg = math.degrees(angle_rad)
        
        return angle_deg
    except Exception as e:
        app.logger.error(f"Error calculating angle: {str(e)}")
        return 0  # Default fallback value

def calculate_depth_ratio(hip, knee, ankle):
    """Calculate the depth ratio based on hip, knee, and ankle positions."""
    try:
        # Get coordinates safely, handling all possible data formats
        hip_y = 0
        knee_y = 0
        ankle_y = 0
        
        # Get hip y-coordinate
        if isinstance(hip, dict):
            hip_y = hip.get('y', 0)
        elif hasattr(hip, 'y'):
            hip_y = hip.y
        
        # Get knee y-coordinate
        if isinstance(knee, dict):
            knee_y = knee.get('y', 0)
        elif hasattr(knee, 'y'):
            knee_y = knee.y
            
        # Get ankle y-coordinate
        if isinstance(ankle, dict):
            ankle_y = ankle.get('y', 0)
        elif hasattr(ankle, 'y'):
            ankle_y = ankle.y
            
        # Calculate distances
        hip_to_knee = abs(hip_y - knee_y)
        knee_to_ankle = abs(knee_y - ankle_y)
        hip_to_ankle = abs(hip_y - ankle_y)
        
        if hip_to_ankle < 1e-6:
            return 0
            
        # Calculate ratio
        depth_ratio = knee_y / hip_to_ankle
        
        return depth_ratio * 100  # Scale for readability
    except Exception as e:
        app.logger.error(f"Error calculating depth ratio: {str(e)}")
        return 0  # Default fallback value

def calculate_shoulder_midfoot_diff(shoulder, hip, knee, ankle):
    """Calculate the horizontal difference between shoulder and midfoot position."""
    try:
        # Get coordinates safely, handling all possible data formats
        shoulder_x = 0
        midfoot_x = 0
        
        # Get shoulder x-coordinate
        if isinstance(shoulder, dict):
            shoulder_x = shoulder.get('x', 0)
        elif hasattr(shoulder, 'x'):
            shoulder_x = shoulder.x
        
        # Get ankle x-coordinate
        if isinstance(ankle, dict):
            midfoot_x = ankle.get('x', 0)
        elif hasattr(ankle, 'x'):
            midfoot_x = ankle.x
            
        return abs(shoulder_x - midfoot_x) * 100  # Convert to pixels
    except Exception as e:
        app.logger.error(f"Error calculating shoulder-midfoot difference: {str(e)}")
        return 0  # Default fallback value

# --- Utility Functions (Refactored) ---
def extract_landmarks(pose_landmarks):
    """Convert MediaPipe pose landmarks to a list of dicts."""
    return [
        {'x': lm.x, 'y': lm.y, 'z': lm.z, 'visibility': getattr(lm, 'presence', getattr(lm, 'visibility', 0))}
        for lm in pose_landmarks
    ]

def detect_squat_state(session_id, avg_knee_y):
    """Update and return squat state based on knee position."""
    if previous_states[session_id] == "standing" and avg_knee_y > 0.6:
        previous_states[session_id] = "squatting"
        squat_timings[session_id].append(time.time() - session_start_times[session_id])
    elif previous_states[session_id] == "squatting" and avg_knee_y < 0.4:
        previous_states[session_id] = "standing"
        squat_counts[session_id] += 1
    return previous_states[session_id]

def generate_feedback(landmarks_list, session_id):
    """Generate feedback annotations for squat form."""
    feedback_list = []
    # Knee alignment
    knee_hip_alignment = abs((landmarks_list[POSE_LANDMARKS.LEFT_KNEE]['x'] + landmarks_list[POSE_LANDMARKS.RIGHT_KNEE]['x'])/2 -
                             (landmarks_list[POSE_LANDMARKS.LEFT_HIP]['x'] + landmarks_list[POSE_LANDMARKS.RIGHT_HIP]['x'])/2)
    if knee_hip_alignment > 0.1:
        feedback_list.append({
            'type': 'annotation',
            'message': 'Keep knees aligned with hips',
            'position': {'start': POSE_LANDMARKS.LEFT_HIP, 'end': POSE_LANDMARKS.LEFT_KNEE, 'textX': 0.1, 'textY': 0.1}
        })
    # Back angle
    left_shoulder = landmarks_list[POSE_LANDMARKS.LEFT_SHOULDER]
    right_shoulder = landmarks_list[POSE_LANDMARKS.RIGHT_SHOULDER]
    left_hip = landmarks_list[POSE_LANDMARKS.LEFT_HIP]
    right_hip = landmarks_list[POSE_LANDMARKS.RIGHT_HIP]
    left_knee = landmarks_list[POSE_LANDMARKS.LEFT_KNEE]
    right_knee = landmarks_list[POSE_LANDMARKS.RIGHT_KNEE]
    shoulder_midpoint = [(left_shoulder['x'] + right_shoulder['x'])/2, (left_shoulder['y'] + right_shoulder['y'])/2]
    hip_midpoint = [(left_hip['x'] + right_hip['x'])/2, (left_hip['y'] + right_hip['y'])/2]
    knee_midpoint = [(left_knee['x'] + right_knee['x'])/2, (left_knee['y'] + right_knee['y'])/2]
    back_angle = calculate_angle(shoulder_midpoint, hip_midpoint, knee_midpoint)
    if back_angle < 45:
        feedback_list.append({
            'type': 'annotation',
            'message': 'Keep back straight',
            'position': {'start': POSE_LANDMARKS.LEFT_SHOULDER, 'end': POSE_LANDMARKS.LEFT_HIP, 'textX': 0.7, 'textY': 0.2}
        })
    return feedback_list

# --- Refactored analyze_frame ---
def analyze_frame(frame, session_id=None):
    """
    Analyze a single video frame for squat form and return feedback.
    Args:
        frame: The video frame (BGR, OpenCV).
        session_id: Optional session identifier.
    Returns:
        feedback: Dict with landmarks, feedback, squat state, timestamp, etc.
    """
    try:
        if session_id is None:
            session_id = "default"
        if session_id not in previous_states:
            previous_states[session_id] = "standing"
            squat_counts[session_id] = 0
            squat_timings[session_id] = []
            session_start_times[session_id] = time.time()
        image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=image_rgb)
        detection_result = pose_landmarker_global.detect(mp_image)
        feedback = {
            "landmarks": None,
            "feedback": [],
            "skeletonImage": None,
            "squatState": previous_states[session_id],
            "timestamp": time.time() - session_start_times[session_id]
        }
        if not detection_result.pose_landmarks:
            return feedback
        pose_landmarks = detection_result.pose_landmarks[0]
        # ---------- MoveNet cross-check ----------
        try:
            mv_kp = infer_pose_bgr(frame)
            mp_kp = np.array([[lm.x*frame.shape[1],
                               lm.y*frame.shape[0],
                               getattr(lm,'visibility',lm.presence)]
                              for lm in pose_landmarks])
            diff_px = np.linalg.norm(mp_kp[5:, :2] - mv_kp[5:, :2], axis=1).mean()
            if diff_px > 20:
                feedback["feedback"].append({
                    "type": "warning",
                    "message": f"MoveNet and MediaPipe differ (~{diff_px:.1f}px)"
                })
        except Exception as e:
            app.logger.warning(f"MoveNet validator error: {e}")
        # ------------------------------------------
        landmarks_list = extract_landmarks(pose_landmarks)
        feedback["landmarks"] = landmarks_list
        # Key points
        left_knee = landmarks_list[POSE_LANDMARKS.LEFT_KNEE]
        right_knee = landmarks_list[POSE_LANDMARKS.RIGHT_KNEE]
        left_hip = landmarks_list[POSE_LANDMARKS.LEFT_HIP]
        right_hip = landmarks_list[POSE_LANDMARKS.RIGHT_HIP]
        avg_knee_y = (left_knee['y'] + right_knee['y']) / 2
        feedback["squatState"] = detect_squat_state(session_id, avg_knee_y)
        feedback["feedback"] = generate_feedback(landmarks_list, session_id)
        feedback["providers"] = _ort_sess.get_providers()
        return feedback
    except Exception as e:
        return {"error": f"Frame analysis failed: {str(e)}"}, 500

# --- Refactored analyze_video helpers ---
def validate_video_metadata(cap, video_file):
    """Validate and correct video metadata (fps, frame count, duration)."""
    fps = int(cap.get(cv2.CAP_PROP_FPS))
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    # Detect if video is rotated (mobile portrait mode)
    is_portrait_video = height > width
    app.logger.info(f"Video dimensions: {width}x{height}, orientation: {'portrait' if is_portrait_video else 'landscape'}")

    # --- Improved Metadata Validation ---
    duration_msec = cap.get(cv2.CAP_PROP_POS_MSEC) # Get duration in milliseconds
    if duration_msec <= 0:
       cap.set(cv2.CAP_PROP_POS_AVI_RATIO, 1) # Seek to end if needed
       duration_msec = cap.get(cv2.CAP_PROP_POS_MSEC)
       cap.set(cv2.CAP_PROP_POS_AVI_RATIO, 0) # Reset to beginning
    
    duration_sec = duration_msec / 1000.0 if duration_msec > 0 else 0.0
    app.logger.info(f"Raw metadata: FPS={fps}, FrameCount={frame_count}, Duration={duration_sec:.2f}s")

    # Validate FPS
    if fps <= 0 or fps > 120 or fps == 1000: # 1000 is an invalid value often seen
        app.logger.warning(f"Invalid FPS: {fps}. Attempting recalculation or using default.")
        if duration_sec > 0 and frame_count > 0 and frame_count < 100000:
            calculated_fps = frame_count / duration_sec
            if calculated_fps > 0 and calculated_fps <= 120:
                fps = round(calculated_fps)
                app.logger.warning(f"Recalculated FPS based on duration/frameCount: {fps}")
            else:
               fps = 30 # Default FPS
               app.logger.warning(f"Recalculation failed, defaulting FPS to {fps}")
        else:
            fps = 30 # Default FPS
            app.logger.warning(f"Cannot recalculate, defaulting FPS to {fps}")
    
    # Validate Frame Count - recalculate if invalid or inconsistent with duration
    expected_frame_count = int(duration_sec * fps) if duration_sec > 0 and fps > 0 else 0
    # Check for large negative numbers or zero/small counts if duration is reasonable
    is_frame_count_invalid = frame_count < 0 or (duration_sec > 0.5 and frame_count <= 1)
    # Check for significant mismatch with duration
    is_frame_count_mismatch = expected_frame_count > 0 and abs(frame_count - expected_frame_count) > (expected_frame_count * 0.5)
    if is_frame_count_invalid or is_frame_count_mismatch:
        app.logger.warning(f"Invalid/mismatched frame count: {frame_count}. Expected based on duration: ~{expected_frame_count}")
        if expected_frame_count > 0:
            frame_count = expected_frame_count
            app.logger.warning(f"Using frame count calculated from duration: {frame_count}")
        else:
             # If duration is also zero, estimate based on file size (rough)
             file_size_mb = video_file.content_length / (1024 * 1024)
             estimated_duration = max(1, file_size_mb * 8) # Assume ~8s per MB, min 1s
             frame_count = int(estimated_duration * fps)
             app.logger.warning(f"Estimating frame count based on file size: {frame_count}")

    # Ensure frame_count is reasonable after all calculations
    frame_count = max(10, min(frame_count, 1500)) # Allow slightly more frames, up to 1500
    # --- End Improved Metadata Validation ---

    app.logger.info(f"Validated video properties: FPS={fps}, frame_count={frame_count}, duration={duration_sec:.2f}s")
    
    return fps, frame_count, width, height, is_portrait_video, duration_sec

def extract_frames(cap, frame_skip, frame_count, is_portrait_video):
    """Extract frames sequentially with skipping to improve reliability on codecs where random seeks fail."""
    frames_to_process = []
    current_idx = 0
    success, frame = cap.read()
    while success and current_idx < frame_count:
        if current_idx % frame_skip == 0:
            # Rotate portrait videos so landmarks are upright
            if is_portrait_video:
                frame = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)

            # Downscale very large frames to save memory / speed
            if frame.shape[0] > 720 or frame.shape[1] > 1280:
                frame = cv2.resize(frame, (0, 0), fx=0.5, fy=0.5)

            frames_to_process.append((current_idx, frame))

        # Read next frame
        success, frame = cap.read()
        current_idx += 1

    return frames_to_process

def aggregate_results(processed_frames):
    """Aggregate results from processed frames and add status information (spine / knee)."""
    
    # Thresholds (degrees for spine, ratio for depth). DepthRatio coming from measurements is scaled *100 – normalize first.
    SPINE_GOOD = 45
    SPINE_WARN = 55
    DEPTH_GOOD = 0.85
    DEPTH_WARN = 0.6

    pose = POSE_LANDMARKS  # alias for readability

    for f in processed_frames:
        # Default statuses
        spine_status = knee_status = 'warn'

        try:
            # Retrieve landmarks & measurements
            lm = f.get('landmarks') or []
            meas = f.get('measurements') or {}

            # ---- Spine status (torso/back angle)
            back_angle = None
            if len(lm) > pose.RIGHT_KNEE:
                # Prefer right side for consistency, fallback to left
                rs, rh, rk = pose.RIGHT_SHOULDER, pose.RIGHT_HIP, pose.RIGHT_KNEE
                ls, lh, lk = pose.LEFT_SHOULDER, pose.LEFT_HIP, pose.LEFT_KNEE

                def ok(idx):
                    return idx < len(lm) and lm[idx]['visibility'] >= 0.5

                if ok(rs) and ok(rh) and ok(rk):
                    back_angle = calculate_angle(lm[rs], lm[rh], lm[rk])
                elif ok(ls) and ok(lh) and ok(lk):
                    back_angle = calculate_angle(lm[ls], lm[lh], lm[lk])

            if back_angle is not None:
                if back_angle <= SPINE_GOOD:
                    spine_status = 'good'
                elif back_angle <= SPINE_WARN:
                    spine_status = 'warn'
                else:
                    spine_status = 'bad'
            else:
                spine_status = 'warn'  # Unknown – treat as warn

            # ---- Knee / depth status
            depth_raw = meas.get('depthRatio')
            if depth_raw is not None:
                # Un-scale if necessary (>1 implies percentage *100)
                depth_ratio = depth_raw / 100 if depth_raw > 1.5 else depth_raw
                if depth_ratio >= DEPTH_GOOD:
                    knee_status = 'good'
                elif depth_ratio >= DEPTH_WARN:
                    knee_status = 'warn'
                else:
                    knee_status = 'bad'
            else:
                knee_status = 'warn'

        except Exception as e:
            app.logger.error(f"aggregate_results status calc error: {str(e)}")
            spine_status = knee_status = 'warn'

        # Attach status object
        f['status'] = {
            'spine': spine_status,
            'knee': knee_status
        }

    return processed_frames

def get_video_properties(video_path):
    """Uses ffprobe to get video duration and frame count."""
    cmd = [
        'ffprobe',
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=duration,nb_frames,r_frame_rate',
        '-of', 'json',
        video_path
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)
        stream_data = data.get('streams', [{}])[0]
        
        duration_str = stream_data.get('duration')
        duration = float(duration_str) if duration_str else None
        
        nb_frames_str = stream_data.get('nb_frames')
        # nb_frames can be 'N/A' for some formats/streams
        try:
            nb_frames = int(nb_frames_str) if nb_frames_str and nb_frames_str != 'N/A' else None
        except (ValueError, TypeError):
            nb_frames = None
            
        # Calculate FPS from r_frame_rate (e.g., "30000/1001")
        fps = None
        r_frame_rate = stream_data.get('r_frame_rate')
        if r_frame_rate and '/' in r_frame_rate:
            num, den = map(int, r_frame_rate.split('/'))
            if den > 0:
                fps = num / den

        # If nb_frames is missing but duration and fps are available, estimate nb_frames
        if nb_frames is None and duration is not None and fps is not None and fps > 0:
             nb_frames = int(duration * fps)
             app.logger.warning(f"ffprobe missing nb_frames, estimated as {nb_frames} from duration/fps")

        # If duration is missing but nb_frames and fps are available, estimate duration
        elif duration is None and nb_frames is not None and fps is not None and fps > 0:
            duration = nb_frames / fps
            app.logger.warning(f"ffprobe missing duration, estimated as {duration:.2f}s from nb_frames/fps")
            
        app.logger.info(f"ffprobe results: duration={duration}, nb_frames={nb_frames}, fps={fps}")
        return duration, nb_frames, fps
        
    except subprocess.CalledProcessError as e:
        app.logger.error(f"ffprobe error: {e.stderr}")
        return None, None, None
    except Exception as e:
        app.logger.error(f"Error parsing ffprobe output: {e}")
        return None, None, None

@app.route('/', methods=['GET'])
def home():
    return "Flask server is running!"

@app.route('/ping', methods=['GET'])
def ping():
    """Simple ping endpoint to verify the server is running."""
    # Simplified response with no timestamp to reduce log noise
    response = {
        'status': 'alive',
        'message': 'Server is running'
    }
    return jsonify(response)

@app.route('/analyze-squat', methods=['POST'])
def analyze_squat():
    data = request.get_json()
    if not data or 'image' not in data:
        return jsonify({"error": "No image data provided"}), 400

    # Extract session ID if provided, otherwise use default
    session_id = data.get('sessionId', 'default')

    try:
        # Remove header if present and decode base64 image data.
        image_data = data['image'].split(",")[-1]
        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes))
        frame = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    except Exception as e:
        return jsonify({"error": f"Error processing image: {str(e)}"}), 500

    feedback = analyze_frame(frame, session_id)
    return jsonify(feedback)

@app.route('/reset-session', methods=['POST'])
def reset_session():
    data = request.get_json()
    session_id = data.get('sessionId', 'default')
    
    # Reset session data and record the start time for alignment
    previous_states[session_id] = "standing"
    squat_counts[session_id] = 0
    squat_timings[session_id] = []
    session_start_times[session_id] = time.time()
    
    return jsonify({"success": True, "message": f"Session {session_id} reset successfully"})

@app.route('/get-session-data', methods=['GET'])
def get_session_data():
    session_id = request.args.get('sessionId', 'default')
    
    if session_id not in previous_states:
        return jsonify({"error": "Session not found"}), 404
    
    session_data = {
        "squatCount": squat_counts.get(session_id, 0),
        "squatTimings": squat_timings.get(session_id, []),
        "currentState": previous_states.get(session_id, "standing")
    }
    
    return jsonify(session_data)

# Set a high max upload size (100MB)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB

@app.route('/analyze', methods=['POST', 'OPTIONS'])
@cross_origin()
def analyze_video():
    import psutil, os, time
    process = psutil.Process(os.getpid())
    rss_mb = process.memory_info().rss / 1024 / 1024
    app.logger.warning(f"[MEM_DIAG] ENTRY: RSS={rss_mb:.1f} MB, PID={os.getpid()}, time={time.time()}")
    t_start = time.time()
    # Minimize debug logging - log only critical info
    app.logger.info(f"Received /analyze request: method={request.method}, size={request.content_length or 0}")

    # Reduced logging
    
    if 'video' not in request.files:
        app.logger.warning("'video' file part not found in request")
        return jsonify({"error": "No video file part"}), 400

    file = request.files['video']
    # Simplified logging
    app.logger.info(f"Processing video: {file.filename}, size: {getattr(file, 'content_length', request.content_length)}")
    # If server thinks file is empty, abort early
    if request.content_length is not None and request.content_length == 0:
        return jsonify({"error": "Uploaded file is empty"}), 400

    # Validate video file format
    filename = getattr(file, 'filename', None)
    if not filename or not isinstance(filename, str):
        app.logger.error("Missing or invalid filename in uploaded file")
        return jsonify({'error': 'No file uploaded'}), 400
    filename = filename.lower()
    # Allow mp4, webm, avi, and mkv for debugging
    allowed_exts = ['.mp4', '.webm', '.avi', '.mkv']
    if not any(filename.endswith(ext) for ext in allowed_exts):
        return jsonify({'error': 'Unsupported video format. Please upload an MP4, WEBM, AVI, or MKV file.'}), 400

    # Save the uploaded video temporarily
    # Use the same extension as the uploaded file to avoid codec issues
    orig_ext = os.path.splitext(filename)[1]
    temp_dir = tempfile.gettempdir()
    temp_filename = f"temp_{uuid.uuid4().hex}{orig_ext}"
    temp_path = os.path.join(temp_dir, temp_filename)
    # Ensure pointer at start before saving
    file.seek(0)
    file.save(temp_path)
    rss_mb = process.memory_info().rss / 1024 / 1024
    app.logger.warning(f"[MEM_DIAG] AFTER FILE SAVE: RSS={rss_mb:.1f} MB, time={time.time() - t_start:.2f}s")

    # --- Re-encode to constant FPS MP4 if needed (e.g., variable-FPS WebM) ---
    need_transcode = orig_ext in ('.webm', '.mkv', '.avi')
    if need_transcode:
        mp4_temp = os.path.join(temp_dir, f"temp_{uuid.uuid4().hex}.mp4")
        ffmpeg_cmd = [
            'ffmpeg', '-y', '-i', temp_path,
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
            '-r', '30', '-movflags', '+faststart', mp4_temp
        ]
        try:
            subprocess.run(ffmpeg_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            app.logger.info(f"Transcoded video to constant-FPS MP4: {mp4_temp}")
            # Replace original path with transcoded path for further processing
            os.remove(temp_path)
            temp_path = mp4_temp
            orig_ext = '.mp4'
        except Exception as ff_err:
            app.logger.warning(f"FFmpeg transcode failed, continuing with original file. Error: {ff_err}")
    # ------------------------------------------------------

    # --- Get Original Video Properties using ffprobe --- 
    original_duration, original_frame_count, original_fps = get_video_properties(temp_path)
    if original_duration is None or original_frame_count is None or original_frame_count <= 0:
        app.logger.warning("Could not get reliable duration/frame count via ffprobe. Timestamps might be inaccurate.")
        # Use OpenCV as fallback? For now, proceed but warn.
        # Let's try to get *something* from OpenCV if ffprobe failed completely
        cap_check = cv2.VideoCapture(temp_path)
        if cap_check.isOpened():
            if original_frame_count is None or original_frame_count <= 0:
                 ocv_frames = int(cap_check.get(cv2.CAP_PROP_FRAME_COUNT))
                 if ocv_frames > 0:
                      original_frame_count = ocv_frames
                      app.logger.warning(f"Using OpenCV frame count as fallback: {original_frame_count}")
            if original_duration is None:
                ocv_fps = cap_check.get(cv2.CAP_PROP_FPS)
                if ocv_fps is not None and ocv_fps > 0 and original_frame_count is not None and original_frame_count > 0:
                    original_duration = original_frame_count / ocv_fps
                    app.logger.warning(f"Using OpenCV duration as fallback: {original_duration:.2f}s")        
            cap_check.release()
        # If still no valid duration/frame count, we have a problem for timestamping
        if original_duration is None or original_frame_count is None or original_frame_count <= 0:
             app.logger.error("FATAL: Cannot determine video duration or frame count for accurate timestamping.")
             # Perhaps default duration to avoid crashing? Set to arbitrary 10s?
             original_duration = 10.0 # Arbitrary default
             original_frame_count = 300 # Arbitrary default (assumes 30fps for 10s)
             app.logger.error(f"Defaulting to arbitrary duration={original_duration}s, frame_count={original_frame_count}")
             # Fallback failed, maybe return error?
             # return jsonify({'error': 'Could not determine video properties for analysis.'}), 500
    # ------------------------------------------------------

    try:
        app.logger.info(f"Processing video at {temp_path}")
        # Log memory usage before processing
        process = psutil.Process(os.getpid())
        mem_mb = process.memory_info().rss / 1024 / 1024
        app.logger.info(f"[MEMORY] Before extraction: {mem_mb:.2f} MB")
        # Initialize video capture (explicitly request FFMPEG backend for better codec support)
        # Try multiple video backends if first one fails
        cap = cv2.VideoCapture(temp_path, cv2.CAP_FFMPEG)
        if not cap.isOpened():
            app.logger.error(f"OpenCV could not open video file with FFMPEG backend: {temp_path}")
            # Try again with default backend
            cap = cv2.VideoCapture(temp_path)
            if not cap.isOpened():
                app.logger.error(f"OpenCV could not open video file with any backend: {temp_path}")
                
                # Try to read as a static image instead (fallback for corrupted videos)
                try:
                    # Try to use PIL to open the file (more lenient)
                    from PIL import Image
                    try:
                        img = Image.open(temp_path)
                        img_array = np.array(img)
                        if img_array is not None and img_array.size > 0:
                            # Convert PIL image to OpenCV BGR format if needed
                            if len(img_array.shape) == 3 and img_array.shape[2] == 3:
                                frame = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
                            else:
                                frame = img_array
                                
                            app.logger.warning(f"Processed file as static image instead of video: {temp_path}")
                            # Create an array with just this one frame
                            frames_to_process = [(0, frame)]
                            # Skip regular video processing
                            goto_processing = True
                        else:
                            raise ValueError("Empty image array")
                    except Exception as img_err:
                        app.logger.error(f"Failed to open as image too: {str(img_err)}")
                        return jsonify({'error': 'Could not open video file or image – file may be corrupted'}), 400
                except Exception as fallback_err:
                    app.logger.error(f"All fallback attempts failed: {str(fallback_err)}")
                    return jsonify({'error': 'Could not open video file – file may be corrupted or in an unsupported format'}), 400
            else:
                app.logger.warning(f"Opened with default backend instead of FFMPEG: {temp_path}")
        
        # Store flag to skip video processing if we used the image fallback
        goto_processing = False
        
        # Get video properties
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        # Detect if video is rotated (mobile portrait mode)
        is_portrait_video = height > width
        app.logger.info(f"Video dimensions: {width}x{height}, orientation: {'portrait' if is_portrait_video else 'landscape'}")

        # --- Improved Metadata Validation ---
        duration_msec = cap.get(cv2.CAP_PROP_POS_MSEC) # Get duration in milliseconds
        if duration_msec <= 0:
           cap.set(cv2.CAP_PROP_POS_AVI_RATIO, 1) # Seek to end if needed
           duration_msec = cap.get(cv2.CAP_PROP_POS_MSEC)
           cap.set(cv2.CAP_PROP_POS_AVI_RATIO, 0) # Reset to beginning
        
        duration_sec = duration_msec / 1000.0 if duration_msec > 0 else 0.0
        app.logger.info(f"Raw metadata: FPS={fps}, FrameCount={frame_count}, Duration={duration_sec:.2f}s")

        # Validate FPS
        if fps <= 0 or fps > 120 or fps == 1000: # 1000 is an invalid value often seen
            app.logger.warning(f"Invalid FPS: {fps}. Attempting recalculation or using default.")
            if duration_sec > 0 and frame_count > 0 and frame_count < 100000:
                calculated_fps = frame_count / duration_sec
                if calculated_fps > 0 and calculated_fps <= 120:
                    fps = round(calculated_fps)
                    app.logger.warning(f"Recalculated FPS based on duration/frameCount: {fps}")
                else:
                   fps = 30 # Default FPS
                   app.logger.warning(f"Recalculation failed, defaulting FPS to {fps}")
            else:
                fps = 30 # Default FPS
                app.logger.warning(f"Cannot recalculate, defaulting FPS to {fps}")
        
        # Validate Frame Count - recalculate if invalid or inconsistent with duration
        expected_frame_count = int(duration_sec * fps) if duration_sec > 0 and fps > 0 else 0
        # Check for large negative numbers or zero/small counts if duration is reasonable
        is_frame_count_invalid = frame_count < 0 or (duration_sec > 0.5 and frame_count <= 1)
        # Check for significant mismatch with duration
        is_frame_count_mismatch = expected_frame_count > 0 and abs(frame_count - expected_frame_count) > (expected_frame_count * 0.5)
        if is_frame_count_invalid or is_frame_count_mismatch:
            app.logger.warning(f"Invalid/mismatched frame count: {frame_count}. Expected based on duration: ~{expected_frame_count}")
            if expected_frame_count > 0:
                frame_count = expected_frame_count
                app.logger.warning(f"Using frame count calculated from duration: {frame_count}")
            else:
                 # If duration is also zero, estimate based on file size (rough)
                 file_size_mb = file.content_length / (1024 * 1024)
                 estimated_duration = max(1, file_size_mb * 8) # Assume ~8s per MB, min 1s
                 frame_count = int(estimated_duration * fps)
                 app.logger.warning(f"Estimating frame count based on file size: {frame_count}")

        # Ensure frame_count is reasonable after all calculations
        frame_count = max(10, min(frame_count, 1500)) # Allow slightly more frames, up to 1500
        # --- End Improved Metadata Validation ---

        app.logger.info(f"Validated video properties: FPS={fps}, frame_count={frame_count}, duration={duration_sec:.2f}s")
        
        # Force dense frame processing for smoother overlay – process every frame
        frame_skip = 1  # Always analyse every frame
        app.logger.info(f"Frame skip forced to {frame_skip} for dense analysis")

        # Pre-calculate target frame indices (all frames)
        target_frames = list(range(0, frame_count, frame_skip))
        
        # Skip if we already have frames from image fallback
        if not goto_processing:
            # Extract frames to process with robust multi-method approach
            frames_to_process = []
            
            # Try multiple methods for frame extraction in order of reliability
            # Choose extraction strategies based on video length
            if frame_count < 120:  # ~4 seconds at 30 fps – keep things simple
                extraction_methods = [
                    "sequential_reading",
                    "ffmpeg_frames"
                ]
            else:
                extraction_methods = [
                    "keyframe_extraction",
                    "sequential_reading",
                    "ffmpeg_frames"
                ]
            
            # Pre-calculate target frames as a set for faster lookup
            target_frame_set = set(target_frames)
            
            # First method: Keyframe extraction - often works better with certain codecs
            if "keyframe_extraction" in extraction_methods:
                app.logger.info("Trying keyframe extraction method first")
                keyframe_frames = []
                
                # Release and reopen the capture to ensure clean state
                cap.release()
                cap = cv2.VideoCapture(temp_path)
                
                # Get video properties again
                fps = cap.get(cv2.CAP_PROP_FPS)
                frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                
                # Calculate interval between keyframes (aim for up to 180 frames)
                max_keyframes = min(180, len(target_frames))
                keyframe_interval = max(1, frame_count // max_keyframes)
                
                # Extract keyframes at regular intervals
                for frame_idx in range(0, frame_count, keyframe_interval):
                    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
                    ret, frame = cap.read()
                    if ret:
                        # Handle rotated video from mobile devices
                        if is_portrait_video:
                            frame = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
                        keyframe_frames.append((frame_idx, frame))
                    if len(keyframe_frames) >= max_keyframes:
                        break
                        
                app.logger.info(f"Keyframe extraction method yielded {len(keyframe_frames)} frames")
                if len(keyframe_frames) >= min(60, len(target_frames) // 2):
                    frames_to_process = keyframe_frames
                    app.logger.info("Using keyframe extraction results")
            
            # Second method: Sequential reading if first method didn't yield enough frames
            if len(frames_to_process) < min(60, len(target_frames) // 2) and "sequential_reading" in extraction_methods:
                app.logger.info("Trying sequential reading method")
                
                # Release and reopen the capture to ensure clean state
                cap.release()
                cap = cv2.VideoCapture(temp_path)
                
                # Reset to beginning of video for sequential reading
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                
                sequential_frames = []
                consecutive_failures = 0
                max_consecutive_failures = 30  # Increased threshold
                frames_read = 0
                current_idx = 0
                sample_interval = max(1, frame_count // min(200, len(target_frames)))
                
                # Read frames sequentially, sampling at regular intervals
                while frames_read < frame_count:
                    # Only process frames at our sampling interval
                    if current_idx % sample_interval == 0:
                        ret, frame = cap.read()
                        if ret:
                            if is_portrait_video:
                                frame = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
                            sequential_frames.append((current_idx, frame))
                            consecutive_failures = 0
                        else:
                            consecutive_failures += 1
                            if consecutive_failures >= max_consecutive_failures:
                                app.logger.warning(f"Too many consecutive failures in sequential reading at frame {current_idx}")
                                break
                    else:
                        # Skip frames we're not interested in
                        ret = cap.grab()
                        if not ret:
                            consecutive_failures += 1
                            if consecutive_failures >= max_consecutive_failures:
                                break
                    
                    current_idx += 1
                    frames_read += 1
                    
                    # Exit if we have enough frames
                    if len(sequential_frames) >= min(200, len(target_frames)):
                        break
                
                app.logger.info(f"Sequential reading method yielded {len(sequential_frames)} frames")
                if len(sequential_frames) > len(frames_to_process):
                    frames_to_process = sequential_frames
                    app.logger.info("Using sequential reading results")
            
            # Third method: Try using FFmpeg directly as a last resort
            if len(frames_to_process) < min(20, len(target_frames) // 4) and "ffmpeg_frames" in extraction_methods:
                try:
                    app.logger.info("Trying FFmpeg direct extraction as last resort")
                    # Create a temp directory for extracted frames
                    with tempfile.TemporaryDirectory() as tmpdirname:
                        # Use FFmpeg to extract frames
                        extract_count = min(50, frame_count)
                        extraction_interval = max(1, frame_count // extract_count)
                        # Use a simpler approach with -r to avoid filter syntax issues
                        target_fps = max(1, min(30, int(fps / extraction_interval)))
                        ffmpeg_cmd = f"ffmpeg -i {temp_path} -r {target_fps} -q:v 1 {tmpdirname}/frame_%04d.jpg"
                        os.system(ffmpeg_cmd)
                        
                        # Load the extracted frames
                        ffmpeg_frames = []
                        frame_files = sorted([f for f in os.listdir(tmpdirname) if f.startswith('frame_')])
                        for i, frame_file in enumerate(frame_files):
                            frame_path = os.path.join(tmpdirname, frame_file)
                            frame = cv2.imread(frame_path)
                            if frame is not None:
                                frame_idx = i * extraction_interval
                                if is_portrait_video:
                                    frame = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
                                ffmpeg_frames.append((frame_idx, frame))
                        
                        app.logger.info(f"FFmpeg extraction method yielded {len(ffmpeg_frames)} frames")
                        if len(ffmpeg_frames) > len(frames_to_process):
                            frames_to_process = ffmpeg_frames
                            app.logger.info("Using FFmpeg extraction results")
                except Exception as e:
                    app.logger.error(f"FFmpeg extraction failed: {str(e)}")
            
            # Fourth method: imageio fallback when ffmpeg binary not available
            if len(frames_to_process) < min(10, len(target_frames) // 4):
                try:
                    import imageio.v2 as iio
                    app.logger.info("Trying imageio reader fallback extraction")
                    reader = iio.get_reader(temp_path, format='ffmpeg')  # type: ignore
                    imgio_frames = []
                    for idx, frame in enumerate(reader.iter_data()):
                        if idx >= frame_count:
                            break
                        if idx % frame_skip != 0:
                            continue
                        # imageio returns RGB numpy array
                        frame_bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
                        if is_portrait_video:
                            frame_bgr = cv2.rotate(frame_bgr, cv2.ROTATE_90_CLOCKWISE)
                        imgio_frames.append((idx, frame_bgr))
                        if len(imgio_frames) >= len(target_frames):
                            break
                    app.logger.info(f"imageio extraction yielded {len(imgio_frames)} frames")
                    if len(imgio_frames) > len(frames_to_process):
                        frames_to_process = imgio_frames
                        app.logger.info("Using imageio extraction results")
                except Exception as e:
                    app.logger.error(f"imageio extraction failed: {str(e)}")
 
            # Final assessment of frame extraction results
            app.logger.info(f"Final frame extraction yielded {len(frames_to_process)} frames out of target {len(target_frames)}")
            
            # If we got fewer than expected frames but still have some to work with
            if len(frames_to_process) < len(target_frame_set) / 2:
                app.logger.warning(f"Extracted only {len(frames_to_process)} frames out of {len(target_frame_set)} target frames, but continuing with available frames")
                
            # Fallback: if coverage <80%, do a simple sequential read of all frames
            coverage = len(frames_to_process) / max(1, len(target_frame_set))
            if coverage < 0.8:
                app.logger.warning(
                    f"Frame coverage {coverage:.1%} below 80%. Falling back to sequential extraction of all frames."
                )
                # Reopen capture
                cap.release()
                cap = cv2.VideoCapture(temp_path)
                frames_to_process = extract_frames(cap, 1, frame_count, is_portrait_video)
                app.logger.info(f"Sequential fallback extracted {len(frames_to_process)} frames")
            
            # Sort frames by index to ensure chronological order
            frames_to_process.sort(key=lambda x: x[0])
            
            # Resize frames to reduce memory usage if they're large
            for i, (idx, frame) in enumerate(frames_to_process):
                if frame.shape[0] > 720 or frame.shape[1] > 1280:
                    frames_to_process[i] = (idx, cv2.resize(frame, (0, 0), fx=0.5, fy=0.5))
        
        # Release the capture as soon as we've extracted frames
        cap.release()
        
        app.logger.info(f"Extracted {len(frames_to_process)} frames for processing")
        # Log memory usage after frame extraction
        mem_mb = process.memory_info().rss / 1024 / 1024
        app.logger.info(f"[MEMORY] After extraction: {mem_mb:.2f} MB")
        rss_mb = process.memory_info().rss / 1024 / 1024
        app.logger.warning(f"[MEM_DIAG] AFTER FRAME EXTRACTION: RSS={rss_mb:.1f} MB, time={time.time() - t_start:.2f}s")
        
        # Define function to process a single frame
        def process_frame(frame_data):
            frame_idx, frame = frame_data
            
            # Convert BGR to RGB
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

            # Ensure the array is C-contiguous, which can sometimes help with external libraries
            frame_rgb_contiguous = np.ascontiguousarray(frame_rgb)

            # Log before pose inference
            rss_mb = process.memory_info().rss / 1024 / 1024
            app.logger.warning(f"[MEM_DIAG] BEFORE POSE INFERENCE: RSS={rss_mb:.1f} MB, frame={frame_idx}, time={time.time() - t_start:.2f}s")
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb_contiguous) # Use contiguous array
            # Use the global landmarker (reduces per‑frame memory usage)
            detection_result = pose_landmarker_global.detect(mp_image)
            rss_mb = process.memory_info().rss / 1024 / 1024
            app.logger.warning(f"[MEM_DIAG] AFTER POSE INFERENCE: RSS={rss_mb:.1f} MB, frame={frame_idx}, time={time.time() - t_start:.2f}s")
            if not detection_result.pose_landmarks:
                return None
                
            pose_landmarks = detection_result.pose_landmarks[0]
            
            # Define the relevant landmarks for squat analysis
            # Only include shoulders, arms, torso, hips, legs - exclude facial features
            relevant_landmark_indices = [
                POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.RIGHT_SHOULDER,
                POSE_LANDMARKS.LEFT_ELBOW, POSE_LANDMARKS.RIGHT_ELBOW,
                POSE_LANDMARKS.LEFT_WRIST, POSE_LANDMARKS.RIGHT_WRIST,
                POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.RIGHT_HIP,
                POSE_LANDMARKS.LEFT_KNEE, POSE_LANDMARKS.RIGHT_KNEE,
                POSE_LANDMARKS.LEFT_ANKLE, POSE_LANDMARKS.RIGHT_ANKLE,
                POSE_LANDMARKS.LEFT_HEEL, POSE_LANDMARKS.RIGHT_HEEL,
                POSE_LANDMARKS.LEFT_FOOT_INDEX, POSE_LANDMARKS.RIGHT_FOOT_INDEX
            ]
            
            # Convert only relevant landmarks to list
            landmarks = []
            for i, landmark in enumerate(pose_landmarks):
                # Skip facial landmarks (0-10) to streamline processing
                if i in relevant_landmark_indices:
                    landmarks.append({
                        'x': landmark.x,
                        'y': landmark.y,
                        'z': landmark.z,
                        'visibility': landmark.visibility
                    })
                # Include null placeholders for skipped landmarks to maintain array index structure
                else:
                    landmarks.append({
                        'x': 0,
                        'y': 0,
                        'z': 0,
                        'visibility': 0
                    })
            
            VIS_THR = 0.5
            def joints_visible(ids, lm):
                return all(lm[i]['visibility'] >= VIS_THR for i in ids)

            # Prepare indices for left/right and for each measurement
            pose = POSE_LANDMARKS
            lm = landmarks
            # Indices for left and right
            LHIP, LKNEE, LANKLE = pose.LEFT_HIP, pose.LEFT_KNEE, pose.LEFT_ANKLE
            RHIP, RKNEE, RANKLE = pose.RIGHT_HIP, pose.RIGHT_KNEE, pose.RIGHT_ANKLE
            LSHOULDER, RSHOULDER = pose.LEFT_SHOULDER, pose.RIGHT_SHOULDER

            # Compute knee visibility for D
            knees_visible = (lm[LKNEE]['visibility'] >= VIS_THR) and (lm[RKNEE]['visibility'] >= VIS_THR)

            # A. Only compute measurements when all required joints are visible
            knee_angle = None
            depth_ratio = None
            shoulder_midfoot_diff = None
            # Right knee metrics
            if joints_visible([RHIP, RKNEE, RANKLE], lm):
                hip = lm[RHIP]
                knee = lm[RKNEE]
                ankle = lm[RANKLE]
                knee_angle = calculate_angle(hip, knee, ankle)
                depth_ratio = calculate_depth_ratio(hip, knee, ankle)
            # Shoulder-midfoot diff (right side)
            if joints_visible([RSHOULDER, RHIP, RKNEE, RANKLE], lm):
                shoulder = lm[RSHOULDER]
                hip = lm[RHIP]
                knee = lm[RKNEE]
                ankle = lm[RANKLE]
                shoulder_midfoot_diff = calculate_shoulder_midfoot_diff(shoulder, hip, knee, ankle)

            # B. Return None for missing values (will be serialized as null in JSON)
            # This ensures all consumers (e.g., React) can use a neutral style for missing data.
            # Do NOT use 'N/A' or string sentinel values, only float or null.

            # C. Generate arrows only when metric is valid and breaches threshold
            arrows = []
            try:
                # Depth (knee angle) - Corrected condition: angle > 90 means not deep enough
                if (
                    knee_angle is not None and
                    90 < knee_angle < 150 and   # between standing (~180) and too low (<90)
                    joints_visible([RKNEE], lm)
                ):
                    arrows.append({
                        'start': {'x': lm[RKNEE]['x'], 'y': lm[RKNEE]['y']},
                        'end': {'x': lm[RKNEE]['x'], 'y': lm[RKNEE]['y'] + 0.1}, # Point down for 'deeper'
                        'color': 'yellow',
                        'message': 'Squat deeper – knees not at 90°'
                    })

                # Back lean (angle between shoulder‑hip‑knee)
                if joints_visible([RSHOULDER, RHIP, RKNEE], lm):
                    try:
                        # Only show back lean feedback when actually squatting (knee angle < 150)
                        if knee_angle is not None and knee_angle < 150:
                            back_angle = calculate_angle(lm[RSHOULDER], lm[RHIP], lm[RKNEE])
                            # Check if back angle indicates excessive forward lean (larger angle means more lean relative to vertical?)
                            if back_angle > 45: # Keep original threshold for now
                                arrows.append({
                                    'start': {'x': lm[RHIP]['x'], 'y': lm[RHIP]['y']},           # Starts at Hip
                                    'end': {'x': lm[RSHOULDER]['x'], 'y': lm[RSHOULDER]['y']},   # Points to Shoulder
                                    'color': 'orange',
                                    'message': 'Chest up – reduce forward lean'
                                })
                    except Exception as e:
                        app.logger.error(f"Error calculating back angle or generating arrow: {e}")

                # *** NEW: Knee forward over ankle ***
                if joints_visible([RKNEE, RANKLE], lm):
                    knee_x = lm[RKNEE]['x']
                    ankle_x = lm[RANKLE]['x']
                    # Check if knee is significantly forward of the ankle horizontally
                    # Only trigger when squatting (e.g., knee angle < 150)
                    if knee_angle is not None and knee_angle < 150 and knee_x > ankle_x + 0.05: # Threshold of 0.05 normalized coord diff
                        arrows.append({
                            'start': {'x': lm[RKNEE]['x'], 'y': lm[RKNEE]['y']},   # Starts at knee
                            'end': {'x': lm[RKNEE]['x'] - 0.1, 'y': lm[RKNEE]['y']}, # Points backward horizontally
                            'color': 'cyan', # Use a distinct color
                            'message': 'Knee too far forward'
                        })
                # *** END NEW CHECK ***

            except Exception as e:
                app.logger.error(f"Error generating arrows: {e}")

            # D. Status indicators for coloring segments (simplified logic)
            status = {
                'spine': 'ok' if not any(a['message'] == 'Chest up – reduce forward lean' for a in arrows) else 'warn',
                # Updated knee status to include the new check
                'knee': 'ok' if not any(a['message'] == 'Squat deeper – knees not at 90°' or a['message'] == 'Knee too far forward' for a in arrows) else 'warn',
            }
        
            # E. Add kneesVisible boolean to frame payload
            return {
                'frame': frame_idx,
                'timestamp': frame_idx / fps,
                'landmarks': landmarks,
                'measurements': {
                    'kneeAngle': knee_angle,
                    'depthRatio': depth_ratio,
                    'shoulderMidfootDiff': shoulder_midfoot_diff
                },
                'arrows': arrows,
                'kneesVisible': knees_visible,
                'status': status
            }
        
        # Sequentially process frames while periodically freeing memory
        batch_size = 4  # how many frames before an explicit GC & memory log
        results = []
        for i, frame_data in enumerate(frames_to_process):
            result = process_frame(frame_data)
            if result is not None:
                results.append(result)

            # Every `batch_size` frames (or at the end) run GC & log memory
            if (i + 1) % batch_size == 0 or i == len(frames_to_process) - 1:
                gc.collect()
                mem_mb = process.memory_info().rss / 1024 / 1024
                app.logger.info(f"[MEMORY] After processing {i+1} frames: {mem_mb:.2f} MB")
                rss_mb = process.memory_info().rss / 1024 / 1024
                app.logger.warning(f"[MEM_DIAG] AFTER {i+1} FRAMES: RSS={rss_mb:.1f} MB, time={time.time() - t_start:.2f}s")
        
        # Clean up
        if os.path.exists(temp_path):
            os.remove(temp_path)
        
        # Force garbage collection and log memory usage
        gc.collect()
        mem_mb = process.memory_info().rss / 1024 / 1024
        app.logger.info(f"[MEMORY] After analysis: {mem_mb:.2f} MB")
        
        app.logger.info(f"Analysis complete. Processed {len(results)} frames.")
        rss_mb = process.memory_info().rss / 1024 / 1024
        app.logger.warning(f"[MEM_DIAG] BEFORE RETURN: RSS={rss_mb:.1f} MB, time={time.time() - t_start:.2f}s")
        # Sort results by frame number
        results.sort(key=lambda x: x['frame'])
        
        # --- Timestamp scaling ---
        if original_duration and original_duration > 0 and len(results) > 1:
            # Use the timestamp of the last processed frame
            last_ts = results[-1]['timestamp']
            if last_ts > 0:
                diff_ratio = abs(last_ts - original_duration) / original_duration
                # Scale when mismatch ≥1%
                if diff_ratio >= 0.01:
                    scale_factor = original_duration / last_ts
                    for r in results:
                        r['timestamp'] *= scale_factor
                    app.logger.info(
                        f"Timestamp scaled by factor {scale_factor:.3f} (orig_dur={original_duration:.2f}s, last_ts={last_ts:.2f}s, diff={diff_ratio:.2%})"
                    )
        
        # Sort frames by timestamp in case processing order wasn't perfect (should already be sorted)
        results.sort(key=lambda x: x.get('timestamp', 0))
        
        # --- Assemble Final Result ---
        analysis_result = {
            # Use original FPS if available, else the backend default (30)
            'fps': original_fps if original_fps is not None and original_fps > 0 else 30,
            'frames': aggregate_results(results),
            'analysisDuration': time.time() - t_start,
            'totalFramesProcessed': len(results),
            'originalDuration': original_duration, # Add original duration info
            'originalFrameCount': original_frame_count # Add original frame count info
        }

        # Memory logging after processing
        return jsonify(analysis_result)
        
    except Exception as e:
        rss_mb = process.memory_info().rss / 1024 / 1024
        app.logger.error(f"[MEM_DIAG] EXCEPTION: RSS={rss_mb:.1f} MB, time={time.time() - t_start:.2f}s, error={str(e)}")
        app.logger.error(f"Error processing video: {str(e)}")
        # Clean up on error
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return jsonify({'error': str(e)}), 500

def print_server_ready_message(port):
    """
    Print a clear message showing the server is ready with formatted URLs
    """
    local_url = f"http://127.0.0.1:{port}"
    network_url = f"http://0.0.0.0:{port}"
    
    message = """
    ✅ Squat Analyzer Server is LIVE and ready to use!
    
    Running on:
      - Local:   {local}
      - Network: {network}
    
    Press CTRL+C to quit
    """.format(local=local_url, network=network_url)
    
    print("\n" + "=" * 60)
    print(message)
    print("=" * 60 + "\n")

class ServerStartupHandler(logging.StreamHandler):
    """Custom handler to detect and print the server ready message"""
    def __init__(self, ready_callback):
        super().__init__()
        self.ready_callback = ready_callback
        self.ready_detected = False
        
    def emit(self, record):
        msg = self.format(record)
        # Look for the startup message Flask emits
        if not self.ready_detected and 'Running on' in msg:
            self.ready_callback()
            self.ready_detected = True
        super().emit(record)

if __name__ == '__main__':
    debug_mode = os.environ.get('FLASK_ENV') == 'development'
    port = int(os.environ.get('PORT', 5000))
    
    # Add our custom handler to detect when server is ready
    if not debug_mode:  # Only use custom handler in production mode
        werkzeug_logger = logging.getLogger('werkzeug')
        # Save the current log level and restore it after adding our handler
        current_level = werkzeug_logger.level
        werkzeug_logger.setLevel(logging.INFO)
        handler = ServerStartupHandler(lambda: print_server_ready_message(port))
        werkzeug_logger.addHandler(handler)
        
        try:
            app.run(host='0.0.0.0', port=port, debug=debug_mode)
        finally:
            # Clean up and restore previous settings
            werkzeug_logger.removeHandler(handler)
            werkzeug_logger.setLevel(current_level)
    else:
        # In debug mode, print the message upfront since Flask will restart after detected changes
        print_server_ready_message(port)
        app.run(host='0.0.0.0', port=port, debug=debug_mode)
