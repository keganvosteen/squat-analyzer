// src/components/ExerciseRecorder.jsx
import React, { useState, useRef, useEffect } from 'react';

const ExerciseRecorder = ({ onRecordingComplete }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState([]);
  const [currentStream, setCurrentStream] = useState(null);
  const [facingMode, setFacingMode] = useState("user"); // "user" for front, "environment" for back
  const [blinking, setBlinking] = useState(false);
  const [feedbackLog, setFeedbackLog] = useState([]);

  // Function to set up the video stream based on the selected facing mode
  const setupVideoStream = async () => {
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
    }
    const constraints = { video: { facingMode } };
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      videoRef.current.srcObject = stream;
      setCurrentStream(stream);
    } catch (error) {
      console.error("Error accessing camera:", error);
    }
  };

  useEffect(() => {
    setupVideoStream();
    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [facingMode]);

  // Blinking red indicator for recording
  useEffect(() => {
    let intervalId;
    if (recording) {
      intervalId = setInterval(() => {
        setBlinking(prev => !prev);
      }, 500);
    } else {
      setBlinking(false);
    }
    return () => clearInterval(intervalId);
  }, [recording]);

  // While recording, capture a frame every 500ms for feedback analysis
  useEffect(() => {
    let feedbackInterval;
    if (recording) {
      feedbackInterval = setInterval(() => {
        if (!videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        // Set canvas size to video frame size
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpeg');

        // Send captured frame to backend for analysis
        fetch('https://squat-analyzer-backend.onrender.com/analyze-squat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: imageData })
        })
          .then(response => response.json())
          .then(data => {
            const timestamp = video.currentTime;
            setFeedbackLog(prev => [...prev, { timestamp, feedback: data }]);
            console.log("Feedback logged at", timestamp, ":", data);
          })
          .catch(err => console.error("Error sending frame for feedback:", err));
      }, 500);
    }
    return () => {
      if (feedbackInterval) clearInterval(feedbackInterval);
    };
  }, [recording]);

  // Start recording: reset chunks and feedback, then start MediaRecorder
  const startRecording = () => {
    if (!currentStream) return;
    setRecordedChunks([]);
    setFeedbackLog([]);
    // Use default MIME type; you can adjust if needed
    mediaRecorderRef.current = new MediaRecorder(currentStream, { mimeType: 'video/webm' });
    mediaRecorderRef.current.ondataavailable = event => {
      if (event.data.size > 0) {
        setRecordedChunks(prev => [...prev, event.data]);
      }
    };
    // Finalize recording in onstop event
    mediaRecorderRef.current.onstop = () => {
      console.log("Final recordedChunks:", recordedChunks);
      // Delay slightly to ensure all chunks have been processed
      setTimeout(() => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const videoUrl = URL.createObjectURL(blob);
        if (onRecordingComplete) {
          onRecordingComplete({ videoUrl, feedbackLog });
        }
      }, 300); // 300ms delay
    };
    mediaRecorderRef.current.start(500);
    setRecording(true);
  };

  // Stop recording: call the stop method
  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  // Toggle the camera between front and back
  const toggleCamera = () => {
    setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
  };

  return (
    <div>
      <div style={{ position: 'relative', width: '100%' }}>
        <video ref={videoRef} autoPlay playsInline style={{ width: '100%' }} />
        {recording && (
          <div style={{
            position: 'absolute',
            top: 10,
            left: 10,
            width: 20,
            height: 20,
            borderRadius: '50%',
            backgroundColor: blinking ? 'red' : 'transparent'
          }} />
        )}
      </div>
      {/* Hidden canvas for feedback capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <div style={{ marginTop: '10px' }}>
        {!recording ? (
          <button onClick={startRecording}>Start Recording</button>
        ) : (
          <button onClick={stopRecording} style={{ backgroundColor: 'grey', color: 'white' }}>
            Stop Recording
          </button>
        )}
        <button onClick={toggleCamera} style={{ marginLeft: '10px' }}>
          Toggle Camera (Current: {facingMode === 'user' ? 'Front' : 'Back'})
        </button>
      </div>
    </div>
  );
};

export default ExerciseRecorder;
