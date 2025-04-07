# app.py
from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import mediapipe as mp
import base64
import io
from PIL import Image
import time
import os

app = Flask(__name__)
# Configure CORS to allow requests from your frontend domain
CORS(app, resources={r"/*": {"origins": ["https://squat-analyzer-frontend.onrender.com", "http://localhost:5173", "http://localhost:5174"]}}, supports_credentials=True)

# Initialize MediaPipe Pose.
mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles
pose = mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5)

# Global variables for squat state tracking
previous_states = {}
squat_timings = {}
squat_counts = {}
# Global dictionary to store session start times
session_start_times = {}

def calculate_angle(a, b, c):
    a = np.array(a)
    b = np.array(b)
    c = np.array(c)
    radians = np.arctan2(c[1] - b[1], c[0] - b[0]) - np.arctan2(a[1] - b[1], a[0] - b[0])
    angle = np.abs(radians * 180.0 / np.pi)
    if angle > 180:
        angle = 360 - angle
    return angle

def analyze_frame(frame, session_id=None):
    if session_id is None:
        session_id = "default"
    
    # Initialize state tracking for new sessions
    if session_id not in previous_states:
        previous_states[session_id] = "standing"
        squat_counts[session_id] = 0
        squat_timings[session_id] = []
    
    # Convert BGR image (OpenCV) to RGB
    image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    image_height, image_width, _ = frame.shape
    results = pose.process(image_rgb)
    
    # Set the start time for this session (if not already set)
    start_time = session_start_times.get(session_id, time.time())
    # Prepare feedback data with a relative timestamp from session start
    feedback = {
        "squatCount": squat_counts[session_id],
        "warnings": [],
        "keyPoints": [],
        "angles": {},
        "skeletonImage": None,
        "squatState": previous_states[session_id],
        "timestamp": time.time() - start_time
    }
    
    if results.pose_landmarks:
        landmarks = results.pose_landmarks.landmark
        
        # Extract key points
        left_hip = [landmarks[mp_pose.PoseLandmark.LEFT_HIP.value].x * image_width,
                   landmarks[mp_pose.PoseLandmark.LEFT_HIP.value].y * image_height]
        left_knee = [landmarks[mp_pose.PoseLandmark.LEFT_KNEE.value].x * image_width,
                    landmarks[mp_pose.PoseLandmark.LEFT_KNEE.value].y * image_height]
        left_ankle = [landmarks[mp_pose.PoseLandmark.LEFT_ANKLE.value].x * image_width,
                     landmarks[mp_pose.PoseLandmark.LEFT_ANKLE.value].y * image_height]
        
        right_hip = [landmarks[mp_pose.PoseLandmark.RIGHT_HIP.value].x * image_width,
                     landmarks[mp_pose.PoseLandmark.RIGHT_HIP.value].y * image_height]
        right_knee = [landmarks[mp_pose.PoseLandmark.RIGHT_KNEE.value].x * image_width,
                      landmarks[mp_pose.PoseLandmark.RIGHT_KNEE.value].y * image_height]
        right_ankle = [landmarks[mp_pose.PoseLandmark.RIGHT_ANKLE.value].x * image_width,
                       landmarks[mp_pose.PoseLandmark.RIGHT_ANKLE.value].y * image_height]
                      
        # Calculate joint angles
        left_knee_angle = calculate_angle(left_hip, left_knee, left_ankle)
        right_knee_angle = calculate_angle(right_hip, right_knee, right_ankle)
        
        # Calculate hip angles (trunk orientation)
        left_shoulder = [landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER.value].x * image_width,
                         landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER.value].y * image_height]
        right_shoulder = [landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER.value].x * image_width,
                          landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER.value].y * image_height]
        
        # Back angle (approximation from shoulders to hips)
        back_midpoint = [(left_shoulder[0] + right_shoulder[0]) / 2, (left_shoulder[1] + right_shoulder[1]) / 2]
        hip_midpoint = [(left_hip[0] + right_hip[0]) / 2, (left_hip[1] + right_hip[1]) / 2]
        ankle_midpoint = [(left_ankle[0] + right_ankle[0]) / 2, (left_ankle[1] + right_ankle[1]) / 2]
        
        back_angle = calculate_angle(back_midpoint, hip_midpoint, ankle_midpoint)
        
        # Store calculated angles in feedback
        feedback["angles"] = {
            "leftKnee": round(left_knee_angle, 1),
            "rightKnee": round(right_knee_angle, 1),
            "back": round(back_angle, 1)
        }
        
        # Squat form analysis
        knee_avg = (left_knee_angle + right_knee_angle) / 2
        
        # Detect squat state using a state machine
        current_state = previous_states[session_id]
        if knee_avg > 150 and current_state != "standing":
            current_state = "standing"
            if previous_states[session_id] == "bottom":
                # Completed a squat
                squat_counts[session_id] += 1
                squat_timings[session_id].append({
                    "completed": time.time(),
                    "count": squat_counts[session_id]
                })
                feedback["squatCount"] = squat_counts[session_id]
        elif knee_avg < 100 and knee_avg > 70 and current_state not in ["descending", "bottom"]:
            current_state = "descending"
        elif knee_avg <= 70 and current_state != "bottom":
            current_state = "bottom"
            squat_timings[session_id].append({
                "bottom": time.time(),
                "count": squat_counts[session_id] + 1
            })
        
        previous_states[session_id] = current_state
        feedback["squatState"] = current_state
        
        # Analyze form and collect warnings
        warnings = []
        if knee_avg > 160:
            warnings.append({
                "type": "depth",
                "message": "Not squatting deep enough",
                "severity": "warning",
                "location": "knees"
            })
        elif knee_avg < 60:
            warnings.append({
                "type": "depth",
                "message": "Squat too deep; maintain safe form",
                "severity": "warning",
                "location": "knees"
            })
            
        knee_forward_threshold = 0.05
        left_knee_x_normalized = landmarks[mp_pose.PoseLandmark.LEFT_KNEE.value].x
        left_ankle_x_normalized = landmarks[mp_pose.PoseLandmark.LEFT_ANKLE.value].x
        right_knee_x_normalized = landmarks[mp_pose.PoseLandmark.RIGHT_KNEE.value].x
        right_ankle_x_normalized = landmarks[mp_pose.PoseLandmark.RIGHT_ANKLE.value].x
        
        if ((left_knee_x_normalized - left_ankle_x_normalized > knee_forward_threshold) or 
            (right_knee_x_normalized - right_ankle_x_normalized > knee_forward_threshold)):
            warnings.append({
                "type": "knees-forward",
                "message": "Knees going too far forward over toes",
                "severity": "warning",
                "location": "knees"
            })
            
        if back_angle < 45 and current_state in ["descending", "bottom"]:
            warnings.append({
                "type": "back-angle",
                "message": "Leaning forward too much; keep chest up",
                "severity": "error",
                "location": "back"
            })
            
        left_hip_x = landmarks[mp_pose.PoseLandmark.LEFT_HIP.value].x
        left_knee_x = landmarks[mp_pose.PoseLandmark.LEFT_KNEE.value].x
        left_ankle_x = landmarks[mp_pose.PoseLandmark.LEFT_ANKLE.value].x
        right_hip_x = landmarks[mp_pose.PoseLandmark.RIGHT_HIP.value].x
        right_knee_x = landmarks[mp_pose.PoseLandmark.RIGHT_KNEE.value].x
        right_ankle_x = landmarks[mp_pose.PoseLandmark.RIGHT_ANKLE.value].x
        
        left_alignment = abs((left_knee_x - left_hip_x) - (left_ankle_x - left_knee_x))
        right_alignment = abs((right_knee_x - right_hip_x) - (right_ankle_x - right_knee_x))
        
        if (left_alignment > 0.1 or right_alignment > 0.1) and current_state in ["descending", "bottom"]:
            warnings.append({
                "type": "knee-alignment",
                "message": "Knees not aligned with feet; check stance",
                "severity": "warning",
                "location": "alignment"
            })
        
        feedback["warnings"] = warnings
        
        # Draw skeleton using MediaPipe's drawing utilities
        mp_drawing.draw_landmarks(
            overlay,
            results.pose_landmarks,
            mp_pose.POSE_CONNECTIONS,
            landmark_drawing_spec=mp_drawing_styles.get_default_pose_landmarks_style()
        )
        
        # Draw colored lines for warnings with enhanced visibility
        for warning in warnings:
            if warning["location"] == "knees":
                color = (255, 0, 0)  # Bright red for knee warnings
                cv2.line(overlay, (int(left_hip[0]), int(left_hip[1])), (int(left_knee[0]), int(left_knee[1])), color, 4)
                cv2.line(overlay, (int(left_knee[0]), int(left_knee[1])), (int(left_ankle[0]), int(left_ankle[1])), color, 4)
                cv2.line(overlay, (int(right_hip[0]), int(right_hip[1])), (int(right_knee[0]), int(right_knee[1])), color, 4)
                cv2.line(overlay, (int(right_knee[0]), int(right_knee[1])), (int(right_ankle[0]), int(right_ankle[1])), color, 4)
            elif warning["location"] == "back":
                color = (255, 0, 0)  # Bright red for back warnings
                cv2.line(overlay, (int(back_midpoint[0]), int(back_midpoint[1])), (int(hip_midpoint[0]), int(hip_midpoint[1])), color, 4)
        
        # Add angle measurements as text overlays with increased thickness for clarity
        cv2.putText(overlay, f"{round(left_knee_angle, 1)}°", 
                   (int(left_knee[0]) - 15, int(left_knee[1]) - 15), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 3, cv2.LINE_AA)
        cv2.putText(overlay, f"{round(right_knee_angle, 1)}°", 
                   (int(right_knee[0]) - 15, int(right_knee[1]) - 15), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 3, cv2.LINE_AA)
        cv2.putText(overlay, f"Back: {round(back_angle, 1)}°", 
                   (int(hip_midpoint[0]) - 60, int(hip_midpoint[1]) - 20), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 3, cv2.LINE_AA)
        
        # Add state label
        state_color = (255, 255, 255)  # Default white
        if current_state == "bottom":
            state_color = (0, 255, 0)  # Green for bottom state
        elif current_state == "descending":
            state_color = (0, 165, 255)  # Orange for descending
        cv2.putText(overlay, f"State: {current_state}", (10, 30), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, state_color, 2, cv2.LINE_AA)
        
        # Add squat counter overlay
        cv2.putText(overlay, f"Squat count: {squat_counts[session_id]}", (10, 60), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
        
        # Blend the overlay with the original frame
        alpha = 0.7
        frame = cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0)
        
        # Convert processed image to base64 for return
        _, buffer = cv2.imencode('.jpg', frame)
        img_str = base64.b64encode(buffer).decode('utf-8')
        feedback["skeletonImage"] = f"data:image/jpeg;base64,{img_str}"
        
        # Include key points for frontend visualization
        feedback["keyPoints"] = {
            "leftHip": left_hip,
            "leftKnee": left_knee,
            "leftAnkle": left_ankle,
            "rightHip": right_hip,
            "rightKnee": right_knee,
            "rightAnkle": right_ankle,
            "backMidpoint": back_midpoint,
            "hipMidpoint": hip_midpoint
        }
        
        # Include squat timings
        feedback["squatTimings"] = squat_timings[session_id]
    
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

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
