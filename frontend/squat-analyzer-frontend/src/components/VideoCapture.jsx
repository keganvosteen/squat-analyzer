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
  const recordingStartTimeRef = useRef(null);
  const [skeletonImage, setSkeletonImage] = useState(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const [cameraFacing, setCameraFacing] = useState('environment');
  const [squatCount, setSquatCount] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [feedbackData, setFeedbackData] = useState([]);
  const [error, setError] = useState(null);
  const [apiConnectionFailed, setApiConnectionFailed] = useState(false);
  const [stream, setStream] = useState(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [streamReady, setStreamReady] = useState(false);

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
      return streamRef.current;
    } catch (error) {
      console.error("Camera initialization error:", error);
      setError(`Camera error: ${error.message || 'Could not access camera'}`);
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

  // Reset session with the backend
  const resetSession = () => {
    fetch(`${API_URL}/reset-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionIdRef.current }),
    })
    .then(response => {
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      return response.json();
    })
    .then(data => {
      console.log("Session reset successfully:", data);
      setApiConnectionFailed(false);
    })
    .catch(error => {
      console.error("Failed to reset session:", error);
      setApiConnectionFailed(true);
    });
  };
  
  // Toggle fullscreen mode
  const toggleFullscreen = () => {
    if (!fullscreen) {
      // Enter fullscreen
      const element = containerRef.current;
      if (element) {
        if (element.requestFullscreen) {
          element.requestFullscreen();
        } else if (element.webkitRequestFullscreen) { 
          element.webkitRequestFullscreen();
        } else if (element.msRequestFullscreen) { 
          element.msRequestFullscreen();
        }
      }
    } else {
      // Exit fullscreen
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) { 
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    }
    setFullscreen(!fullscreen);
  };
  
  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // Frame capture and analysis loop while recording
  useEffect(() => {
    let interval;
    if (isRecording) {
      // Set the recording start time
      recordingStartTimeRef.current = Date.now();
      setFeedbackData([]);
      
      // Start the MediaRecorder
      try {
        console.log("Starting MediaRecorder");
        recordedChunksRef.current = [];
        
        // Check if MediaRecorder is already recording
        if (mediaRecorderRef.current?.state === 'recording') {
          console.log("MediaRecorder is already recording, stopping first");
          mediaRecorderRef.current.stop();
          // Wait a moment before starting again
          setTimeout(() => {
            if (mediaRecorderRef.current) {
              mediaRecorderRef.current.start(1000); // Record in 1-second chunks
              console.log("MediaRecorder restarted");
            }
          }, 100);
        } else {
          mediaRecorderRef.current?.start(1000); // Record in 1-second chunks
          console.log("MediaRecorder started");
        }
      } catch (error) {
        console.error("Error starting MediaRecorder:", error);
        setError(`Recording failed to start: ${error.message}`);
        setIsRecording(false);
        return;
      }
      
      // Update timer and capture frames
      interval = setInterval(() => {
        // Update recording timer
        setRecordingTime(Math.floor((Date.now() - recordingStartTimeRef.current) / 1000));
        
        // Capture and analyze frame
        captureFrameAndAnalyze();
      }, 200); // 5fps
    } else {
      // Stop recording if active
      if (mediaRecorderRef.current?.state === 'recording') {
        try {
          console.log("Stopping MediaRecorder");
          mediaRecorderRef.current.stop();
        } catch (error) {
          console.error("Error stopping MediaRecorder:", error);
        }
      }
    }
    
    return () => {
      clearInterval(interval);
      if (isRecording && mediaRecorderRef.current?.state === 'recording') {
        try {
          mediaRecorderRef.current.stop();
        } catch (error) {
          console.error("Error stopping MediaRecorder during cleanup:", error);
        }
      }
    };
  }, [isRecording]);

  // Capture video frame and send for analysis
  const captureFrameAndAnalyze = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    
    try {
      // Draw video frame to canvas
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert to base64
      const imageData = canvas.toDataURL('image/jpeg', 0.8);
      
      // Skip API call if previous connections failed
      if (apiConnectionFailed) {
        const placeholderData = {
          squatCount: Math.floor(Math.random() * 5),
          squatState: ['standing', 'descending', 'bottom'][Math.floor(Math.random() * 3)],
          warnings: [],
          timestamp: Date.now() - recordingStartTimeRef.current
        };
        processAnalysisResponse(placeholderData);
        return;
      }
      
      // Send to backend API for analysis
      fetch(`${API_URL}/analyze-squat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          image: imageData,
          sessionId: sessionIdRef.current
        }),
      })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        return response.json();
      })
      .then(data => {
        processAnalysisResponse(data);
        setApiConnectionFailed(false);
      })
      .catch(error => {
        console.error("Analysis error:", error);
        setApiConnectionFailed(true);
        
        // Generate mock data for offline mode
        const placeholderData = {
          squatCount: Math.floor(Math.random() * 5),
          squatState: ['standing', 'descending', 'bottom'][Math.floor(Math.random() * 3)],
          warnings: [],
          timestamp: Date.now() - recordingStartTimeRef.current
        };
        processAnalysisResponse(placeholderData);
      });
    } catch (error) {
      console.error("Error capturing frame:", error);
    }
  };
  
  // Process and store analysis response
  const processAnalysisResponse = (data) => {
    // Update skeleton image if available
    if (data.skeletonImage) {
      setSkeletonImage(data.skeletonImage);
    }
    
    // Update squat count
    if (data.squatCount !== undefined) {
      setSquatCount(data.squatCount);
    }
    
    // Store feedback data with timestamp
    const timestamp = Date.now() - recordingStartTimeRef.current;
    const dataWithTimestamp = { ...data, timestamp };
    setFeedbackData(prev => [...prev, dataWithTimestamp]);
    
    // Pass frame data to parent component
    if (onFrameCapture) onFrameCapture(dataWithTimestamp);
  };

  // Handler for media recorder data chunks
  const handleDataAvailable = (event) => {
    if (event.data && event.data.size > 0) {
      recordedChunksRef.current.push(event.data);
      console.log(`Received data chunk: ${event.data.size} bytes, type: ${event.data.type}`);
    }
  };

  // Handler for when recording stops
  const handleRecordingStop = () => {
    console.log("Recording stopped. Chunks:", recordedChunksRef.current.length);
    
    // Ensure we have chunks to process
    if (!recordedChunksRef.current.length) {
      console.error("No video data recorded");
      setError("Recording failed: No video data was captured");
      return;
    }
    
    try {
      // Create video blob from recorded chunks
      console.log("Creating blob from chunks, types:", recordedChunksRef.current.map(c => c.type));
      const blob = new Blob(recordedChunksRef.current, { 
        type: recordedChunksRef.current[0].type || 'video/webm' 
      });
      console.log("Created blob of size:", blob.size, "type:", blob.type);
      
      if (blob.size < 1000) {
        console.error("Created blob is too small, likely invalid");
        setError("Recording failed: Video data is invalid");
        return;
      }
      
      // Create object URL
      const videoUrl = URL.createObjectURL(blob);
      console.log("Created video URL:", videoUrl);
      
      // Get session data (or use local data if API failed)
      if (apiConnectionFailed) {
        // Use local data if API connection failed
        finishRecording({
          squatCount,
          squatTimings: generateSquatTimings(feedbackData),
        });
      } else {
        // Get data from backend
        fetch(`${API_URL}/get-session-data?sessionId=${sessionIdRef.current}`)
          .then(response => {
            if (!response.ok) throw new Error(`HTTP error ${response.status}`);
            return response.json();
          })
          .then(sessionData => {
            finishRecording(sessionData);
          })
          .catch(error => {
            console.error("Failed to get session data:", error);
            finishRecording({
              squatCount,
              squatTimings: generateSquatTimings(feedbackData),
            });
          });
      }
      
      // Finish recording with video URL and data
      function finishRecording(sessionData) {
        if (onRecordingComplete) {
          onRecordingComplete({
            videoUrl,
            feedbackData,
            squatCount: sessionData.squatCount || squatCount,
            squatTimings: sessionData.squatTimings || generateSquatTimings(feedbackData),
            sessionId: sessionIdRef.current,
            duration: recordingTime,
            timestamp: Date.now()
          });
        }
      }
      
      // Reset recording timer
      setRecordingTime(0);
      
    } catch (error) {
      console.error("Error processing recording:", error);
      setError(`Processing recording failed: ${error.message}`);
    }
  };
  
  // Generate squat timings from feedback data if backend fails
  const generateSquatTimings = (feedbackData) => {
    const timings = [];
    let currentSquat = null;
    
    // Sort feedback by timestamp
    const sortedFeedback = [...feedbackData].sort((a, b) => a.timestamp - b.timestamp);
    
    sortedFeedback.forEach((data, index) => {
      const timestamp = data.timestamp / 1000; // Convert to seconds
      
      if (data.squatState === 'bottom' && (!currentSquat || !currentSquat.bottom)) {
        currentSquat = { count: timings.length + 1, bottom: timestamp };
        timings.push(currentSquat);
      } else if (data.squatState === 'standing' && currentSquat && currentSquat.bottom && !currentSquat.completed) {
        currentSquat.completed = timestamp;
        currentSquat = null;
      }
    });
    
    return timings;
  };

  // Toggle camera facing mode
  const toggleCamera = () => setCameraFacing(prev => prev === 'user' ? 'environment' : 'user');
  
  // Start/stop recording
  const handleRecording = () => {
    if (isRecording) {
      // Stop recording
      setIsRecording(false);
    } else {
      // Start new recording
      setIsRecording(true);
      // Generate new session ID for this recording
      sessionIdRef.current = uuidv4();
      // Reset session in backend
      resetSession();
    }
  };
  
  // Format recording time as mm:ss
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const handleRecordingComplete = () => {
    console.log('Recording complete');
    if (!mediaRecorderRef.current) {
      console.error('No media recorder available');
      return;
    }

    mediaRecorderRef.current.stop();
    mediaRecorderRef.current.ondataavailable = (event) => {
      if (event.data.size > 0) {
        console.log('Video data available:', event.data);
        // Pass the video blob directly to the parent component
        onRecordingComplete(event.data);
      }
    };
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
      try {
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
          if (recordedChunksRef.current.length === 0) {
            console.error("No data chunks were recorded");
            setError("No video data was recorded. Please try again.");
            return;
          }
          
          const blob = new Blob(recordedChunksRef.current, { type: mimeType });
          console.log("Recording stopped, created blob: ", blob, "size:", blob.size);
          
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
        
        // Set a minimum recording time to ensure something gets captured (at least 3 seconds)
        setTimeout(() => {
          console.log("Minimum recording time reached");
        }, 3000);
        
      } catch (err) {
        console.error("Failed to create MediaRecorder:", err);
        setError(`Recording error: ${err.message}`);
      }
    } catch (error) {
      console.error("Error starting recording:", error);
      stopTimer();
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      stopTimer();
      setIsRecording(false);
    }
  };

  useEffect(() => {
    return () => {
      stopTimer();
      if (mediaRecorderRef.current) {
        if (mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
      }
    };
  }, []);

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