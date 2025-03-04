# app.py
from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import mediapipe as mp
import base64
import io
from PIL import Image


app = Flask(__name__)
CORS(app)

# Initialize MediaPipe Pose.
mp_pose = mp.solutions.pose
pose = mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5)

def calculate_angle(a, b, c):
    a = np.array(a)
    b = np.array(b)
    c = np.array(c)
    radians = np.arctan2(c[1] - b[1], c[0] - b[0]) - np.arctan2(a[1] - b[1], a[0] - b[0])
    angle = np.abs(radians * 180.0 / np.pi)
    if angle > 180:
        angle = 360 - angle
    return angle

def analyze_frame(frame):
    # Convert BGR image (OpenCV) to RGB
    image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = pose.process(image_rgb)
    feedback = {"squatCount": 0, "warnings": []}

    if results.pose_landmarks:
        landmarks = results.pose_landmarks.landmark

        # Example: Analyze left leg (you can add similar logic for the right leg)
        left_hip = [
            landmarks[mp_pose.PoseLandmark.LEFT_HIP.value].x,
            landmarks[mp_pose.PoseLandmark.LEFT_HIP.value].y
        ]
        left_knee = [
            landmarks[mp_pose.PoseLandmark.LEFT_KNEE.value].x,
            landmarks[mp_pose.PoseLandmark.LEFT_KNEE.value].y
        ]
        left_ankle = [
            landmarks[mp_pose.PoseLandmark.LEFT_ANKLE.value].x,
            landmarks[mp_pose.PoseLandmark.LEFT_ANKLE.value].y
        ]

        knee_angle = calculate_angle(left_hip, left_knee, left_ankle)
        # Use thresholds from your guidelines (sample values):
        if knee_angle > 160:
            feedback["warnings"].append("Leg not bent enough; try squatting deeper.")
        if knee_angle < 70:
            feedback["warnings"].append("Squat too deep; maintain safe form.")

        # Placeholder for squat count logic (update as needed)
        if knee_angle < 70:
            feedback["squatCount"] = 1

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

    try:
        # Remove header if present and decode base64 image data.
        image_data = data['image'].split(",")[-1]
        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes))
        frame = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    except Exception as e:
        return jsonify({"error": f"Error processing image: {str(e)}"}), 500

    feedback = analyze_frame(frame)
    return jsonify(feedback)

import os

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
