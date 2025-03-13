// src/components/ExerciseRecorder.jsx
import React, { useState, useRef, useEffect } from 'react';

const ExerciseRecorder = ({ onRecordingComplete }) => {
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState([]);
  const [currentStream, setCurrentStream] = useState(null);
  const [facingMode, setFacingMode] = useState("user"); // "user" for front, "environment" for back
  const [blinking, setBlinking] = useState(false);

  // Setup video stream based on the facing mode
  const setupVideoStream = async () => {
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
    }
    const constraints = {
      video: { facingMode } // "user" for front, "environment" for back
    };
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
  }, [facingMode]); // reinitialize stream when camera is toggled

  // Blinking red indicator effect when recording
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

  const startRecording = () => {
    if (!currentStream) return;
    setRecordedChunks([]); // Reset any previous recording
    mediaRecorderRef.current = new MediaRecorder(currentStream, { mimeType: 'video/webm' });
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
    setRecording(false);
  };

  const saveRecording = () => {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const videoUrl = URL.createObjectURL(blob);
    if (onRecordingComplete) {
      onRecordingComplete(videoUrl);
    }
  };

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
        {!recording && recordedChunks.length > 0 && (
          <button onClick={saveRecording} style={{ marginLeft: '10px' }}>
            Save Recording
          </button>
        )}
      </div>
    </div>
  );
};

export default ExerciseRecorder;
