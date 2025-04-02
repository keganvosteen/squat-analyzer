import React, { useRef, useEffect, useState } from 'react';

const ExerciseRecorder = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [feedbackLog, setFeedbackLog] = useState([]);

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

  return (
    <div>
      {/* Insert your JSX clearly here */}
    </div>
  );
};

export default ExerciseRecorder;
