import React, { useRef, useEffect, useState } from 'react';

const ExerciseRecorder = ({ onRecordingComplete }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const feedbackIntervalRef = useRef(null);
  const recordingStartRef = useRef(null);
  const recordedChunks = useRef([]);

  const [recording, setRecording] = useState(false);
  const [feedbackLog, setFeedbackLog] = useState([]);
  const [stream, setStream] = useState(null);

  // Set up video stream
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

  // Live feedback loop (every 500ms)
  const startFeedbackLoop = () => {
    recordingStartRef.current = Date.now();

    feedbackIntervalRef.current = setInterval(() => {
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
        .then(res => res.json())
        .then(data => {
          const timestamp = (Date.now() - recordingStartRef.current) / 1000;
          setFeedbackLog(prev => [...prev, { timestamp, feedback: data }]);
        })
        .catch(console.error);
    }, 500);
  };

  const startRecording = () => {
    if (!stream) return;

    recordedChunks.current = [];
    setFeedbackLog([]);
    startFeedbackLoop();

    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });

    recorder.ondataavailable = event => {
      if (event.data.size > 0) {
        recordedChunks.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      clearInterval(feedbackIntervalRef.current);

      const blob = new Blob(recordedChunks.current, { type: 'video/webm' });
      const videoUrl = URL.createObjectURL(blob);

      if (onRecordingComplete) {
        onRecordingComplete({
          videoUrl,
          feedbackLog
        });
      }
    };

    mediaRecorderRef.current = recorder;
    recorder.start(500);
    setRecording(true);
  };

  const stopRecording = () => {
    setRecording(false);
    mediaRecorderRef.current?.stop();
  };

  return (
    <div className="p-4">
      <h2 className="text-white text-lg mb-4">Exercise Recorder</h2>

      <video ref={videoRef} autoPlay playsInline className="w-full h-auto rounded-lg bg-black" />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div className="mt-4 flex gap-4">
        {!recording ? (
          <button onClick={startRecording} className="bg-green-500 text-white px-4 py-2 rounded">
            Start Recording
          </button>
        ) : (
          <button onClick={stopRecording} className="bg-red-500 text-white px-4 py-2 rounded">
            Stop Recording
          </button>
        )}
      </div>
    </div>
  );
};

export default ExerciseRecorder;
