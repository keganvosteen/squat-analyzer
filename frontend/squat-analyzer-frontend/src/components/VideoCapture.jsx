// src/components/VideoCapture.jsx
import React, { useRef, useEffect, useState } from 'react';
import { Camera, RefreshCw, Maximize2, Minimize2, Square, AlertTriangle, Circle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import styled from 'styled-components';

// API URL with fallback for local development
const API_URL = 'https://squat-analyzer-backend.onrender.com';

const Container = styled.div`
  position: relative;
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
`;

const Heading = styled.h1`
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 20px;
`;

const ErrorMessage = styled.div`
  background-color: #ff4444;
  color: white;
  padding: 10px;
  border-radius: 5px;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
`;

const CameraContainer = styled.div`
  position: relative;
  width: 100%;
  max-width: 800px;
  margin-bottom: 20px;
`;

const Video = styled.video`
  width: 100%;
  height: auto;
  margin-bottom: 20px;
`;

const CameraPermissionMessage = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: white;
  padding: 20px;
`;

const RecordingIndicator = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  background-color: ${props => props.isRecording ? '#ff4136' : '#4CAF50'};
  color: white;
  padding: 5px 10px;
  border-radius: 5px;
  margin: 10px;
`;

const RecordingTimer = styled.div`
  position: absolute;
  bottom: 0;
  right: 0;
  background-color: rgba(0, 0, 0, 0.5);
  color: white;
  padding: 5px 10px;
  border-radius: 5px;
  margin: 10px;
`;

const ControlsContainer = styled.div`
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 20px;
`;

const RecordButton = styled.button`
  padding: 10px 20px;
  border-radius: 5px;
  border: none;
  background-color: ${props => props.disabled ? '#cccccc' : '#ff4136'};
  color: white;
  cursor: pointer;
  font-size: 16px;
  
  &:hover {
    opacity: 0.9;
  }
  
  &:disabled {
    background-color: #cccccc;
    cursor: not-allowed;
  }
`;

const StopButton = styled.button`
  padding: 10px 20px;
  border-radius: 5px;
  border: none;
  background-color: #ff4136;
  color: white;
  cursor: pointer;
  font-size: 16px;
  
  &:hover {
    opacity: 0.9;
  }
`;

const InstructionsContainer = styled.div`
  margin-top: 20px;
  padding: 20px;
  background-color: #f0f0f0;
  border-radius: 5px;
`;

const VideoCapture = ({ onFrameCapture, onRecordingComplete }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const sessionIdRef = useRef(uuidv4());
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);
  const [streamReady, setStreamReady] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize video stream
  useEffect(() => {
    // Check camera status on component mount
    initializeCamera().then(stream => {
      if (stream && stream.active) {
        setStreamReady(true);
        setIsInitialized(true);
      }
    });
    
    return () => {
      stopRecording();
      cleanupStream();
      stopTimer();
    };
  }, []);

  const initializeCamera = async () => {
    try {
      setError(null);
      console.log("Initializing camera...");
      
      // Check if we're in a secure context (needed for camera access)
      if (!window.isSecureContext) {
        throw new Error("Camera access requires a secure context (HTTPS)");
      }
      
      // Clean up any existing stream
      cleanupStream();
      
      // Check for camera permissions
      try {
        const permissionStatus = await navigator.permissions.query({ name: 'camera' });
        if (permissionStatus.state === 'denied') {
          throw new Error("Camera access permission denied by browser");
        }
      } catch (permErr) {
        console.log("Permission API not supported, continuing with getUserMedia");
      }
      
      // Set constraints
      const constraints = {
        audio: true,
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          facingMode: 'user'
        }
      };
      
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (!stream || !stream.active) {
        throw new Error("Failed to get an active media stream");
      }
      
      // Store the stream reference
      streamRef.current = stream;
      
      // Connect stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true; // Prevent feedback
        
        // Wait for video to be ready
        await new Promise((resolve) => {
          videoRef.current.onloadedmetadata = () => {
            resolve();
          };
          // If metadata is already loaded, resolve immediately
          if (videoRef.current.readyState >= 2) {
            resolve();
          }
        });
        
        await videoRef.current.play();
      }
      
      console.log("Camera initialized successfully");
      setStreamReady(true);
      setIsInitialized(true);
      return streamRef.current;
    } catch (error) {
      console.error("Camera initialization error:", error);
      setError(`Camera error: ${error.message || 'Could not access camera'}`);
      setStreamReady(false);
      setIsInitialized(false);
      return null;
    }
  };

  // Function to get the supported MIME type for video recording
  const getSupportedMimeType = () => {
    const possibleTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
      'video/webm',
      'video/mp4'
    ];
    
    return possibleTypes.find(type => MediaRecorder.isTypeSupported(type));
  };

  // Format recording time as mm:ss
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setRecordingTime(0);
    timerRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecordingTime(0);
  };

  const startRecording = async () => {
    console.log("Starting MediaRecorder");
    try {
      // Make sure camera is initialized
      if (!streamRef.current || !streamRef.current.active) {
        await initializeCamera();
      }
      
      if (!streamRef.current || !streamRef.current.active) {
        console.error("Could not get an active stream for recording");
        setError("Camera not available. Please check permissions and reload the page.");
        return;
      }
      
      // If MediaRecorder is already recording, stop it first
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        console.log("MediaRecorder is already recording, stopping first");
        mediaRecorderRef.current.stop();
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to ensure recorder has stopped
      }
      
      // Clear previous chunks
      recordedChunksRef.current = [];
      
      // Check for supported MIME types
      const mimeType = getSupportedMimeType();
      if (!mimeType) {
        setError("Your browser doesn't support video recording. Please try a different browser.");
        return;
      }
      
      // Create a new MediaRecorder instance
      mediaRecorderRef.current = new MediaRecorder(streamRef.current, { 
        mimeType,
        videoBitsPerSecond: 2500000 // 2.5 Mbps for better quality
      });
      
      // Setup data available handler
      mediaRecorderRef.current.ondataavailable = (event) => {
        console.log("Data available event, size:", event.data.size);
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      
      // Setup stop handler
      mediaRecorderRef.current.onstop = () => {
        console.log("MediaRecorder stopped, chunks:", recordedChunksRef.current.length);
        
        if (recordedChunksRef.current.length === 0) {
          console.error("No data chunks were recorded");
          setError("No video data was recorded. Please try again.");
          stopTimer();
          setIsRecording(false);
          return;
        }
        
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        console.log("Recording stopped, created blob: ", blob, "size:", blob.size);
        stopTimer();
        setIsRecording(false);
        
        if (blob.size > 0) {
          onRecordingComplete(blob);
        } else {
          setError("Recording failed - no data captured");
        }
      };
      
      // Start recording with timeslice of 200ms to ensure frequent ondataavailable events
      mediaRecorderRef.current.start(200);
      console.log("MediaRecorder started successfully");
      
      // Start the timer for UI
      startTimer();
      setIsRecording(true);
      
    } catch (error) {
      console.error("Error starting recording:", error);
      stopTimer();
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const cleanupStream = () => {
    // Stop all tracks on the current stream
    if (streamRef.current) {
      console.log("Cleaning up stream tracks");
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      streamRef.current = null;
    }
    
    // Clear video element
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    // Cleanup MediaRecorder
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      } catch (e) {
        console.error("Error stopping MediaRecorder during cleanup:", e);
      }
      mediaRecorderRef.current = null;
    }
    
    // Clear chunks
    recordedChunksRef.current = [];
    setStreamReady(false);
    setIsInitialized(false);
  };

  return (
    <Container>
      <Heading>Record Your Squat</Heading>
      
      {error && (
        <ErrorMessage>
          <AlertTriangle size={18} />
          {error}
        </ErrorMessage>
      )}
      
      <CameraContainer>
        <Video 
          ref={videoRef}
          autoPlay 
          playsInline
          muted
        />
        
        {!streamReady && !isRecording && (
          <CameraPermissionMessage>
            <Camera size={32} />
            <p>Camera access is required</p>
            <button onClick={initializeCamera} className="bg-blue-500 text-white px-4 py-2 rounded mt-2">
              Enable Camera
            </button>
          </CameraPermissionMessage>
        )}
        
        <RecordingIndicator isRecording={isRecording}>
          <Circle size={12} fill="#ff4136" />
          {isRecording ? 'Recording' : ''}
        </RecordingIndicator>
        
        {isRecording && (
          <RecordingTimer>
            {formatTime(recordingTime)}
          </RecordingTimer>
        )}
      </CameraContainer>
      
      <ControlsContainer>
        {!isRecording ? (
          <RecordButton 
            onClick={startRecording}
            disabled={!streamReady}
          >
            <Circle size={16} fill="#ff4136" />
            Start Recording
          </RecordButton>
        ) : (
          <StopButton onClick={stopRecording}>
            <Square size={16} fill="#fff" />
            Stop Recording
          </StopButton>
        )}
      </ControlsContainer>
      
      <InstructionsContainer>
        <h3>How to Record a Proper Squat</h3>
        <ol>
          <li>Position your device so your entire body is visible from the side.</li>
          <li>Stand about 6-8 feet from the camera.</li>
          <li>Perform a squat with proper form.</li>
          <li>Record a single squat repetition (down and up).</li>
        </ol>
      </InstructionsContainer>
    </Container>
  );
};

export default VideoCapture;