import React, { useRef, useEffect, useState } from 'react';
import { Video, Square } from 'lucide-react';

const VideoCapture = ({ onFrameCapture }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [isRecording, setIsRecording] = useState(false);
  const [cameraFacing, setCameraFacing] = useState('user'); // 'user' is front camera, 'environment' is back camera

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
    <div className={`relative ${isRecording ? 'fixed inset-0' : 'w-full h-[60vh]'} transition-all bg-black overflow-hidden`}>
      <video ref={videoRef} autoPlay playsInline className="absolute inset-0 object-cover w-full h-full" />
      <canvas ref={canvasRef} className="hidden" />

      {/* Controls */}
      <div className="absolute bottom-8 w-full flex justify-center gap-6 items-center">
        {/* Toggle Camera Button */}
        <button
          onClick={toggleCamera}
          className="bg-white bg-opacity-70 p-4 rounded-full shadow-lg transition-transform hover:scale-110"
        >
          <RefreshCw className="text-gray-800" size={24} />
        </button>

        {/* Record / Stop Button */}
        <button
          onClick={handleRecording}
          className={`${
            isRecording ? 'bg-white' : 'bg-red-500'
          } p-6 rounded-full shadow-xl border-4 border-white transition-transform hover:scale-110`}
        >
          {isRecording ? (
            <Square className="text-red-500" size={24} />
          ) : (
            <Camera className="text-white" size={24} />
          )}
        </button>
      </div>

      {/* Recording Indicator */}
      {isRecording && (
        <div className="absolute top-4 left-4 flex items-center gap-2 bg-black bg-opacity-50 px-3 py-1 rounded-full text-white">
          <span className="animate-ping h-3 w-3 bg-red-500 rounded-full"></span>
          Recording
        </div>
      )}

      {squatCount > 0 && (
        <div className="absolute top-4 right-4 bg-white px-3 py-1 rounded shadow font-semibold">
          🏋️ Squats: {squatCount}
        </div>
      )}

      <button onClick={handleRecording} className={`absolute bottom-4 left-4 ${isRecording ? 'bg-gray-500' : 'bg-red-500'} text-white px-4 py-2 rounded-full`}>
        {isRecording ? 'Stop' : 'Record'}
      </button>

      <button onClick={toggleCamera} className="absolute bottom-4 right-4 bg-white bg-opacity-80 px-4 py-2 rounded-full flex gap-2">
        <RefreshCw size={20} /> Toggle Camera
      </button>
    </div>
  );
};

export default VideoCapture;
