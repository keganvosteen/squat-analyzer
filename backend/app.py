# app.py
from flask import Flask, request, jsonify
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
from werkzeug.utils import secure_filename

app = Flask(__name__)
# Configure CORS
CORS(app, resources={
    r"/*": {
        "origins": [
            "https://squat-analyzer-frontend.onrender.com",
            "http://localhost:5173"
        ],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "supports_credentials": True,
        "expose_headers": ["Content-Type", "Authorization"]
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
    """Calculate the angle between three points."""
    ba = np.array([a.x - b.x, a.y - b.y])
    bc = np.array([c.x - b.x, c.y - b.y])
    
    cosine_angle = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc))
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
    
    feedback["feedback"] = feedback_list
    feedback["squatState"] = previous_states[session_id]
    
    return feedback

# Simple GET route to verify the server is running
@app.route('/', methods=['GET'])
def home():
    return "Flask server is running!"

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

@app.route('/analyze', methods=['POST'])
def analyze_video():
    if 'video' not in request.files:
        return jsonify({'error': 'No video file provided'}), 400
    
    video_file = request.files['video']
    if not video_file:
        return jsonify({'error': 'Empty video file'}), 400
    
    # Save the uploaded video temporarily
    temp_path = 'temp_video.webm'
    video_file.save(temp_path)
    
    try:
        # Initialize video capture
        cap = cv2.VideoCapture(temp_path)
        
        # Get video properties
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        # Process frames
        results = []
        frame_number = 0
        
        while cap.isOpened():
            success, frame = cap.read()
            if not success:
                break
                
            # Convert BGR to RGB
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # Process the frame with MediaPipe
            pose_results = pose_landmarker.process(frame_rgb)
            
            if pose_results.pose_landmarks:
                landmarks = pose_results.pose_landmarks.landmark
                
                # Calculate measurements
                # Right side measurements (you can add left side if needed)
                knee_angle = calculate_angle(
                    landmarks[23],  # Right hip
                    landmarks[25],  # Right knee
                    landmarks[27]   # Right ankle
                )
                
                depth_ratio = calculate_depth_ratio(
                    landmarks[23],  # Right hip
                    landmarks[25],  # Right knee
                    landmarks[27]   # Right ankle
                )
                
                shoulder_midfoot_diff = calculate_shoulder_midfoot_diff(
                    landmarks[11],  # Right shoulder
                    landmarks[23],  # Right hip
                    landmarks[25],  # Right knee
                    landmarks[27]   # Right ankle
                )
                
                # Prepare feedback based on measurements
                feedback = {
                    'frame': frame_number,
                    'timestamp': frame_number / fps,
                    'landmarks': [
                        {'x': landmark.x, 'y': landmark.y, 'visibility': landmark.visibility}
                        for landmark in landmarks
                    ],
                    'measurements': {
                        'kneeAngle': knee_angle,
                        'depthRatio': depth_ratio,
                        'shoulderMidfootDiff': shoulder_midfoot_diff
                    },
                    'arrows': []
                }
                
                # Add feedback arrows based on analysis
                if knee_angle < 90:
                    feedback['arrows'].append({
                        'start': {'x': landmarks[25].x, 'y': landmarks[25].y},  # Knee
                        'end': {'x': landmarks[25].x, 'y': landmarks[25].y - 0.1},  # Above knee
                        'color': 'yellow',
                        'message': 'Knees too bent'
                    })
                
                if shoulder_midfoot_diff > 10:  # Threshold in pixels
                    feedback['arrows'].append({
                        'start': {'x': landmarks[11].x, 'y': landmarks[11].y},  # Shoulder
                        'end': {'x': landmarks[27].x, 'y': landmarks[11].y},    # Horizontal line to ankle
                        'color': 'red',
                        'message': 'Keep shoulders over midfoot'
                    })
                
                results.append(feedback)
            
            frame_number += 1
        
        cap.release()
        
        # Clean up
        if os.path.exists(temp_path):
            os.remove(temp_path)
        
        return jsonify({
            'success': True,
            'frames': results,
            'fps': fps,
            'frame_count': frame_count
        })
        
    except Exception as e:
        # Clean up on error
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
