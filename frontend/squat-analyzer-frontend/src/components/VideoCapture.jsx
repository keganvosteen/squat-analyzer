// VideoCapture.jsx
import React, { useRef, useEffect, useState } from 'react';
import { Camera, RefreshCw, Square } from 'lucide-react';

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

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraFacing]);

  useEffect(() => {
    let interval;

    if (isRecording) {
      interval = setInterval(() => {
        if (!videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = canvas.toDataURL('image/jpeg');

        fetch('https://squat-analyzer-backend.onrender.com/analyze-squat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: imageData }),
        })
          .then(response => response.json())
          .then(data => {
            console.log('Backend feedback:', data);
            if (onFrameCapture) {
              onFrameCapture(data);
            }
          })
          .catch(err => console.error('Error sending frame data:', err));
      }, 500);
    }

    return () => clearInterval(interval);
  }, [isRecording, onFrameCapture]);

  const toggleCamera = () => {
    setCameraFacing(prev => (prev === 'user' ? 'environment' : 'user'));
  };

  const handleRecording = () => {
    setIsRecording(prev => !prev);
  };

  return (
    <div className={`relative ${isRecording ? 'fixed inset-0 z-50 bg-black' : 'w-full h-[60vh]'} transition-all duration-300 overflow-hidden`}>
      <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />

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
        <div className="absolute top-6 left-6 flex gap-2 items-center bg-black bg-opacity-40 px-3 py-1 rounded-full text-white">
          <span className="h-2 w-2 bg-red-500 rounded-full animate-pulse"></span>
          <span className="text-sm">Recording...</span>
        </div>
      )}
    </div>
  );
};

export default VideoCapture;
