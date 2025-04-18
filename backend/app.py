# app.py
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
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
from werkzeug.utils import secure_filename
import multiprocessing
from concurrent.futures import ThreadPoolExecutor

app = Flask(__name__)
# Configure CORS correctly
CORS(app, 
     resources={r"/*": {
         "origins": ["https://squat-analyzer-frontend.onrender.com", "http://localhost:5173", "*"],
         "supports_credentials": True,
         "allow_headers": ["Content-Type", "Authorization"],
         "methods": ["GET", "POST", "OPTIONS"]
     }}
)

# Add CORS headers to all responses manually as well
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    response.headers.add('Access-Control-Allow-Credentials', 'true')
    return response

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

# Set up model paths
MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task'
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'models', 'pose_landmarker_heavy.task')

# Download and get the model path
model_path = download_model(MODEL_URL, MODEL_PATH)

# Create pose landmarker instance
options = PoseLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=model_path),
    running_mode=VisionRunningMode.IMAGE,
    min_pose_detection_confidence=0.5,
    min_pose_presence_confidence=0.5,
    min_tracking_confidence=0.5
)

# Global variables for squat state tracking
previous_states = {}
squat_timings = {}
squat_counts = {}
# Global dictionary to store session start times
session_start_times = {}

# Allowed video file extensions
ALLOWED_EXTENSIONS = {'mp4', 'webm', 'avi'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def calculate_angle(a, b, c):
    """Calculate the angle between three points with stability checks."""
    ba = np.array([a.x - b.x, a.y - b.y])
    bc = np.array([c.x - b.x, c.y - b.y])

    norm_ba = np.linalg.norm(ba)
    norm_bc = np.linalg.norm(bc)

    if norm_ba == 0 or norm_bc == 0:
        return 0

    cosine_angle = np.clip(np.dot(ba, bc) / (norm_ba * norm_bc), -1.0, 1.0)
    angle = np.arccos(cosine_angle)

    return np.degrees(angle)

def calculate_depth_ratio(hip, knee, ankle):
    """Calculate the depth ratio based on hip, knee, and ankle positions."""
    hip_height = hip.y
    knee_height = knee.y
    ankle_height = ankle.y
    
    total_leg_length = abs(hip_height - ankle_height)
    if total_leg_length == 0:
        return 0
    
    squat_depth = abs(knee_height - ankle_height)
    return squat_depth / total_leg_length

def calculate_shoulder_midfoot_diff(shoulder, hip, knee, ankle):
    """Calculate the horizontal difference between shoulder and midfoot position."""
    midfoot_x = ankle.x
    shoulder_x = shoulder.x
    return abs(shoulder_x - midfoot_x) * 100  # Convert to pixels

# Create pose landmarker instance
pose_landmarker = PoseLandmarker.create_from_options(options)

def analyze_frame(frame, session_id=None):
    if session_id is None:
        session_id = "default"
    
    # Initialize state tracking for new sessions
    if session_id not in previous_states:
        previous_states[session_id] = "standing"
        squat_counts[session_id] = 0
        squat_timings[session_id] = []
        session_start_times[session_id] = time.time()
    
    # Convert BGR image (OpenCV) to RGB
    image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=image_rgb)
    
    # Detect pose landmarks
    detection_result = pose_landmarker.detect(mp_image)
    
    # Prepare feedback data with a relative timestamp from session start
    feedback = {
        "landmarks": None,
        "feedback": [],
        "skeletonImage": None,
        "squatState": previous_states[session_id],
        "timestamp": time.time() - session_start_times[session_id]
    }
    
    if not detection_result.pose_landmarks:
        return feedback
    
    # Get the first detected pose's landmarks
    pose_landmarks = detection_result.pose_landmarks[0]
    
    # Convert landmarks to list of dictionaries
    landmarks_list = []
    for landmark in pose_landmarks:
        landmarks_list.append({
            'x': landmark.x,
            'y': landmark.y,
            'z': landmark.z,
            'visibility': landmark.presence
        })
    
    feedback["landmarks"] = landmarks_list
    
    # Get key points for analysis
    left_knee = landmarks_list[POSE_LANDMARKS.LEFT_KNEE]
    right_knee = landmarks_list[POSE_LANDMARKS.RIGHT_KNEE]
    left_hip = landmarks_list[POSE_LANDMARKS.LEFT_HIP]
    right_hip = landmarks_list[POSE_LANDMARKS.RIGHT_HIP]
    left_ankle = landmarks_list[POSE_LANDMARKS.LEFT_ANKLE]
    right_ankle = landmarks_list[POSE_LANDMARKS.RIGHT_ANKLE]
    left_shoulder = landmarks_list[POSE_LANDMARKS.LEFT_SHOULDER]
    right_shoulder = landmarks_list[POSE_LANDMARKS.RIGHT_SHOULDER]
    
    # Calculate average knee position for squat detection
    avg_knee_y = (left_knee['y'] + right_knee['y']) / 2
    
    # Detect squat state
    if previous_states[session_id] == "standing" and avg_knee_y > 0.6:  # Knees lowered
        previous_states[session_id] = "squatting"
        squat_timings[session_id].append(time.time() - session_start_times[session_id])
    elif previous_states[session_id] == "squatting" and avg_knee_y < 0.4:  # Standing back up
        previous_states[session_id] = "standing"
        squat_counts[session_id] += 1
    
    # Generate feedback
    feedback_list = []
    
    # Check knee alignment
    knee_hip_alignment = abs((left_knee['x'] + right_knee['x'])/2 - (left_hip['x'] + right_hip['x'])/2)
    if knee_hip_alignment > 0.1:
        feedback_list.append({
            'type': 'annotation',
            'message': 'Keep knees aligned with hips',
            'position': {
                'start': POSE_LANDMARKS.LEFT_HIP,
                'end': POSE_LANDMARKS.LEFT_KNEE,
                'textX': 0.1,
                'textY': 0.1
            }
        })
    
    # Calculate back angle
    shoulder_midpoint = [(left_shoulder['x'] + right_shoulder['x'])/2, (left_shoulder['y'] + right_shoulder['y'])/2]
    hip_midpoint = [(left_hip['x'] + right_hip['x'])/2, (left_hip['y'] + right_hip['y'])/2]
    knee_midpoint = [(left_knee['x'] + right_knee['x'])/2, (left_knee['y'] + right_knee['y'])/2]
    
    back_angle = calculate_angle(shoulder_midpoint, hip_midpoint, knee_midpoint)
    if back_angle < 45:
        feedback_list.append({
            'type': 'annotation',
            'message': 'Keep back straight',
            'position': {
                'start': POSE_LANDMARKS.LEFT_SHOULDER,
                'end': POSE_LANDMARKS.LEFT_HIP,
                'textX': 0.7,
                'textY': 0.2
            }
        })
    
    # Initialize feedback batching outside the function
    feedback_batch = []

    # Inside analyze_frame function, replace feedback generation logic
    feedback_batch.append(feedback_list)

    if len(feedback_batch) >= 5:
        feedback["feedback"] = feedback_batch.copy()
        feedback_batch.clear()
    else:
        feedback["feedback"] = []

    feedback["squatState"] = previous_states[session_id]
    
    return feedback

# Simple GET route to verify the server is running
@app.route('/', methods=['GET'])
def home():
    return "Flask server is running!"

@app.route('/ping', methods=['GET'])
def ping():
    """Simple endpoint to keep the server warm"""
    # Add a timestamp to the response
    return jsonify({
        "status": "alive",
        "timestamp": time.time(),
        "message": "Server is awake and ready for processing"
    })

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

@app.route('/analyze', methods=['POST', 'OPTIONS'])
def analyze_video():
    print(f"--- Received request for /analyze (Method: {request.method}) ---") 
    app.logger.info(f"Received request for /analyze (Method: {request.method})")

    # Handle preflight OPTIONS request
    if request.method == 'OPTIONS':
        print("--- Responding to OPTIONS preflight request ---")
        app.logger.info("Responding to OPTIONS preflight request for /analyze")
        response = make_response()
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response

    print("--- Processing POST request for /analyze... ---")
    app.logger.info("Processing POST request for /analyze...")
    
    if 'video' not in request.files:
        print("--- 'video' file part not found in request ---")
        app.logger.warning("'video' file part not found in request")
        return jsonify({"error": "No video file part"}), 400
    
    file = request.files['video']
    if not file:
        app.logger.error("Empty video file")
        return jsonify({'error': 'Empty video file'}), 400
    
    app.logger.info(f"Received video: {file.filename}, size: {file.content_length}, type: {file.content_type}")
    
    # Save the uploaded video temporarily
    temp_path = os.path.join(os.path.dirname(__file__), 'temp_video.webm')
    file.save(temp_path)
    
    try:
        app.logger.info(f"Processing video at {temp_path}")
        # Initialize video capture
        cap = cv2.VideoCapture(temp_path)
        
        if not cap.isOpened():
            app.logger.error(f"Could not open video file: {temp_path}")
            return jsonify({'error': 'Could not open video file'}), 500
        
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
        is_frame_count_mismatch = expected_frame_count > 0 and abs(frame_count - expected_frame_count) > (expected_frame_count * 0.5) # Allow 50% diff
        
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
        
        # Calculate frame skip rate based on video length to reduce processing time
        # Process fewer frames for longer videos to stay within timeout limits
        max_frames_to_process = 20  # Reduced from 30 to 20 for faster processing
        target_processing_time = 30  # Target to complete within 30 seconds (15s buffer for 45s timeout)
        
        # Calculate optimal frame skip based on video length and target processing time
        estimated_time_per_frame = 0.5  # Estimated processing time per frame in seconds
        total_frames_possible = target_processing_time / estimated_time_per_frame
        frame_skip = max(1, int(frame_count / total_frames_possible))
        
        # Ensure we don't skip too many frames for short videos
        frame_skip = min(frame_skip, 10)  # Never skip more than 10 frames
            
        app.logger.info(f"Processing every {frame_skip}th frame, targeting {total_frames_possible} frames")
        
        # Pre-calculate target frame indices to process
        target_frames = list(range(0, frame_count, frame_skip))[:max_frames_to_process]
        
        # Extract frames to process in parallel
        frames_to_process = []
        for idx in target_frames:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            success, frame = cap.read()
            if success:
                # Handle rotated video from mobile devices
                if is_portrait_video:
                    # Rotate 90 degrees counterclockwise if video is in portrait mode
                    # This is common for mobile recordings
                    frame = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
                    app.logger.info(f"Rotated frame from {height}x{width} to {frame.shape[1]}x{frame.shape[0]}")
                
                # Resize frame to reduce memory usage
                if frame.shape[0] > 720 or frame.shape[1] > 1280:
                    frame = cv2.resize(frame, (0, 0), fx=0.5, fy=0.5)
                frames_to_process.append((idx, frame))
        
        # Release the capture as soon as we've extracted frames
        cap.release()
        
        app.logger.info(f"Extracted {len(frames_to_process)} frames for processing")
        
        # Define function to process a single frame
        def process_frame(frame_data):
            frame_idx, frame = frame_data
            
            # Convert BGR to RGB
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # Create MediaPipe image and detect pose
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
            
            # Create a new pose landmarker for thread safety
            thread_options = PoseLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=model_path),
                running_mode=VisionRunningMode.IMAGE,
                min_pose_detection_confidence=0.5,
                min_pose_presence_confidence=0.5,
                min_tracking_confidence=0.5
            )
            thread_pose_landmarker = PoseLandmarker.create_from_options(thread_options)
            
            detection_result = thread_pose_landmarker.detect(mp_image)
            
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
            
            # Get key points for measurements
            hip = pose_landmarks[POSE_LANDMARKS.RIGHT_HIP]
            knee = pose_landmarks[POSE_LANDMARKS.RIGHT_KNEE]
            ankle = pose_landmarks[POSE_LANDMARKS.RIGHT_ANKLE]
            shoulder = pose_landmarks[POSE_LANDMARKS.RIGHT_SHOULDER]
            
            # Calculate all measurements at once
            knee_angle = calculate_angle(hip, knee, ankle)
            depth_ratio = calculate_depth_ratio(hip, knee, ankle)
            shoulder_midfoot_diff = calculate_shoulder_midfoot_diff(shoulder, hip, knee, ankle)
            
            # Generate feedback arrows
            arrows = []
            
            if knee_angle < 90:
                arrows.append({
                    'start': {'x': knee.x, 'y': knee.y},
                    'end': {'x': knee.x, 'y': knee.y - 0.1},
                    'color': 'yellow',
                    'message': 'Knees too bent'
                })
            
            if shoulder_midfoot_diff > 0.1:
                arrows.append({
                    'start': {'x': shoulder.x, 'y': shoulder.y},
                    'end': {'x': ankle.x, 'y': shoulder.y},
                    'color': 'red',
                    'message': 'Keep shoulders over midfoot'
                })
            
            # Return processed frame data
            return {
                'frame': frame_idx,
                'timestamp': frame_idx / fps,
                'landmarks': landmarks,
                'measurements': {
                    'kneeAngle': float(knee_angle),
                    'depthRatio': float(depth_ratio),
                    'shoulderMidfootDiff': float(shoulder_midfoot_diff)
                },
                'arrows': arrows
            }
        
        # Enhance concurrency handling
        executor = ThreadPoolExecutor(max_workers=multiprocessing.cpu_count())

        futures = [executor.submit(process_frame, frame) for frame in frames_to_process]
        results = [future.result() for future in futures]
        
        # Filter out None results before sorting
        results = [result for result in results if result is not None]
        
        # Clean up
        if os.path.exists(temp_path):
            os.remove(temp_path)
        
        # Force garbage collection
        gc.collect()
        
        app.logger.info(f"Analysis complete. Processed {len(results)} frames.")
        
        # Sort results by frame number
        results.sort(key=lambda x: x['frame'])
        
        return jsonify({
            'success': True,
            'frames': results,
            'fps': fps,
            'frame_count': frame_count
        })
        
    except Exception as e:
        app.logger.error(f"Error processing video: {str(e)}")
        # Clean up on error
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    debug_mode = os.environ.get('FLASK_ENV') == 'development'
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), debug=debug_mode)
