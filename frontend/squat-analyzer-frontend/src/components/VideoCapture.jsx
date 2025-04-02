// src/components/VideoCapture.jsx
import React, { useRef, useEffect, useState } from 'react';
import { Camera, RefreshCw, Square } from 'lucide-react';

const VideoCapture = ({ onFrameCapture }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [isRecording, setIsRecording] = useState(false);
  const [cameraFacing, setCameraFacing] = useState('user');
  const [squatCount, setSquatCount] = useState(0);

  useEffect(() => {
    async function setupVideo() {
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: cameraFacing },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error('Error accessing webcam:', error);
      }
    }
    setupVideo();
    return () => streamRef.current?.getTracks().forEach(track => track.stop());
  }, [cameraFacing]);

  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpeg');
        fetch('https://squat-analyzer-backend.onrender.com/analyze-squat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: imageData }),
        })
        .then(response => response.json())
        .then(data => {
          if (onFrameCapture) onFrameCapture(data);
          if (data.squat_detected) setSquatCount(prev => prev + 1);
        })
        .catch(console.error);
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isRecording, onFrameCapture]);

  const toggleCamera = () => setCameraFacing(prev => prev === 'user' ? 'environment' : 'user');
  const handleRecording = () => setIsRecording(prev => !prev);

  return (
    <div className={`relative ${isRecording ? 'fixed inset-0 z-50' : 'w-full h-[60vh]'} transition-all duration-300 bg-black overflow-hidden`}>
      <video ref={videoRef} autoPlay playsInline className="absolute inset-0 object-cover w-full h-full" />
      <canvas ref={canvasRef} className="hidden" />

      {/* Recording Indicator */}
      {isRecording && (
        <div className="absolute top-4 left-4 flex items-center gap-2 bg-black bg-opacity-50 px-3 py-1 rounded-full text-white">
          <span className="animate-ping h-3 w-3 bg-red-500 rounded-full"></span>
          Recording
        </div>
      )}

      {/* Squat Counter */}
      {isRecording && (
        <div className="absolute top-4 right-4 bg-white px-3 py-1 rounded shadow font-semibold">
          🏋️ Squats: {squatCount}
        </div>
      )}

      {/* Record/Stop Button */}
      <button
        onClick={handleRecording}
        className={`absolute bottom-8 left-4 ${
          isRecording ? 'bg-gray-500' : 'bg-red-500'
        } text-white px-4 py-2 rounded-full flex items-center gap-2 shadow-lg transition-transform hover:scale-105`}
      >
        {isRecording ? <Square size={20} /> : <Camera size={20} />}
        {isRecording ? 'Stop' : 'Record'}
      </button>

      {/* Camera Toggle Button */}
      <button
        onClick={toggleCamera}
        className="absolute bottom-8 right-4 bg-white bg-opacity-80 px-4 py-2 rounded-full flex items-center gap-2 shadow-lg transition-transform hover:scale-105"
      >
        <RefreshCw size={20} />
        Toggle Camera
      </button>
    </div>
  );
};

export default VideoCapture;
