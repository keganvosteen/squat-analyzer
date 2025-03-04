// VideoCapture.jsx
// src/components/VideoCapture.jsx
import React, { useRef, useEffect } from 'react';

const VideoCapture = ({ onFrameCapture }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    // Access the webcam
    async function setupVideo() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error("Error accessing webcam:", error);
      }
    }
    setupVideo();
  }, []);

  useEffect(() => {
    // Capture a frame every 500 milliseconds
    const interval = setInterval(() => {
      if (!videoRef.current || !canvasRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      // Update canvas dimensions to match the video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw current video frame onto the canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert canvas content to a base64-encoded JPEG image
      const imageData = canvas.toDataURL('image/jpeg');

      // Send the frame to the backend
      fetch('https://squat-analyzer-backend.onrender.com/analyze-squat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData })
      })
      .then(response => response.json())
      .then(data => {
        console.log("Backend feedback:", data);
        if (onFrameCapture) {
          onFrameCapture(data); // Pass backend feedback to the parent component
        }
      })
      .catch(err => console.error("Error sending frame data:", err));
    }, 500); // Capture every 500 ms

    return () => clearInterval(interval);
  }, [onFrameCapture]);

  return (
    <div>
      <video ref={videoRef} autoPlay playsInline style={{ width: '100%' }} />
      {/* Hidden canvas used for capturing video frames */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
};

export default VideoCapture;
https://squat-analyzer-backend.onrender.com
