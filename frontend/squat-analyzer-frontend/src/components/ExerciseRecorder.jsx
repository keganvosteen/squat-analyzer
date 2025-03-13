// src/components/ExerciseRecorder.jsx
import React, { useState, useRef } from 'react';

const ExerciseRecorder = ({ onRecordingComplete, onFeedbackLog }) => {
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState([]);
  const [feedbackLog, setFeedbackLog] = useState([]);

  // This function will be called whenever you generate feedback during recording.
  // In your real app, you’d call this from your frame analysis logic.
  const logFeedback = (feedback) => {
    const timestamp = videoRef.current.currentTime;
    const entry = { timestamp, feedback };
    setFeedbackLog(prev => [...prev, entry]);
    if (onFeedbackLog) onFeedbackLog(entry);
  };

  const startRecording = async () => {
    // Request webcam access
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    videoRef.current.srcObject = stream;
    videoRef.current.play();

    // Create MediaRecorder instance
    mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'video/webm' });
    mediaRecorderRef.current.ondataavailable = event => {
      if (event.data.size > 0) {
        setRecordedChunks(prev => [...prev, event.data]);
      }
    };

    mediaRecorderRef.current.start(500); // collect data in 500ms chunks
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current.stop();
    videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    setRecording(false);
  };

  const saveRecording = () => {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const videoUrl = URL.createObjectURL(blob);
    if (onRecordingComplete) {
      onRecordingComplete({ videoUrl, feedbackLog });
    }
  };

  return (
    <div>
      <video ref={videoRef} style={{ width: '100%' }} controls />
      <div>
        {!recording && (
          <button onClick={startRecording}>Start Recording</button>
        )}
        {recording && (
          <button onClick={stopRecording}>Stop Recording</button>
        )}
        {!recording && recordedChunks.length > 0 && (
          <button onClick={saveRecording}>Save Recording</button>
        )}
      </div>
      {/* Temporary button to simulate feedback logging (for testing) */}
      <button onClick={() => logFeedback("Simulated feedback")}>Log Feedback</button>
    </div>
  );
};

export default ExerciseRecorder;
