import React, { useRef, useEffect, useState } from 'react';

const ExerciseRecorder = ({ onRecordingComplete }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [feedbackLog, setFeedbackLog] = useState([]);
  const [stream, setStream] = useState(null);

  useEffect(() => {
    const setupStream = async () => {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
        }
        setStream(newStream);
      } catch (err) {
        console.error('Camera access error:', err);
      }
    };

    setupStream();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    let feedbackInterval;
    const recordingStart = Date.now();

    if (recording) {
      feedbackInterval = setInterval(() => {
        if (!videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpeg');

        fetch('https://squat-analyzer-backend.onrender.com/analyze-squat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: imageData })
        })
        .then(response => response.json())
        .then(data => {
          const timestamp = (Date.now() - recordingStart) / 1000;
          setFeedbackLog(prev => [...prev, { timestamp, feedback: data }]);
        })
        .catch(err => console.error(err));
      }, 500);
    }

    return () => clearInterval(feedbackInterval);
  }, [recording]);

  const handleStopRecording = () => {
    setRecording(false);
    if (onRecordingComplete) {
      onRecordingComplete({
        videoUrl: videoRef.current?.srcObject,
        feedbackLog
      });
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-white text-lg mb-4">Exercise Recorder</h2>

      <video ref={videoRef} autoPlay playsInline className="w-full h-auto rounded-lg bg-black" />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div className="mt-4 flex gap-4">
        {!recording ? (
          <button onClick={() => setRecording(true)} className="bg-green-500 text-white px-4 py-2 rounded">
            Start Recording
          </button>
        ) : (
          <button onClick={handleStopRecording} className="bg-red-500 text-white px-4 py-2 rounded">
            Stop Recording
          </button>
        )}
      </div>
    </div>
  );
};

export default ExerciseRecorder;
