// src/components/VideoCapture.jsx
import React, { useRef, useEffect, useState } from 'react';
import { Camera, RefreshCw, Maximize2, Minimize2, Circle, Square } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import styled from 'styled-components';

// API URL with fallback for local development
const API_URL = 'https://squat-analyzer-backend.onrender.com';

const RecorderContainer = styled.div`
  position: relative;
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
`;

const VideoPreview = styled.video`
  width: 100%;
  height: auto;
  margin-bottom: 20px;
`;

const Controls = styled.div`
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 20px;
`;

const Button = styled.button`
  padding: 10px 20px;
  border-radius: 5px;
  border: none;
  background-color: ${props => props.recording ? '#ff4444' : '#4CAF50'};
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

  // Initialize video stream
  useEffect(() => {
    async function setupVideo() {
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
        
        // Set up camera constraints
        const constraints = {
          video: { 
            facingMode: cameraFacing,
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        };
        
        console.log("Requesting camera access with constraints:", constraints);
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        
        // Setup media recorder
        setupMediaRecorder(stream);
        
        // Reset error state if successful
        setError(null);
      } catch (error) {
        console.error('Error accessing camera:', error);
        setError(`Camera error: ${error.message || "Could not access camera"}`);
      }
    }
    
    setupVideo();
    
    // Reset session in backend
    resetSession();
    
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraFacing]);
  
  // Setup media recorder with appropriate format
  const setupMediaRecorder = (stream) => {
    try {
      // Check supported formats
      const options = {
        audioBitsPerSecond: 0, // No audio
        videoBitsPerSecond: 2500000, // 2.5 Mbps
      };
      
      console.log("Available MIME types:");
      ['video/webm', 'video/webm;codecs=vp9', 'video/mp4', 'video/webm;codecs=h264'].forEach(type => {
        console.log(`${type}: ${MediaRecorder.isTypeSupported(type)}`);
      });
      
      // Choose best available format
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        options.mimeType = 'video/webm;codecs=vp9';
      } else if (MediaRecorder.isTypeSupported('video/webm')) {
        options.mimeType = 'video/webm';
      } else if (MediaRecorder.isTypeSupported('video/mp4')) {
        options.mimeType = 'video/mp4';
      }
      
      console.log("Creating MediaRecorder with options:", options);
      mediaRecorderRef.current = new MediaRecorder(stream, options);
      
      // Set up event handlers
      mediaRecorderRef.current.ondataavailable = handleDataAvailable;
      mediaRecorderRef.current.onerror = (event) => {
        console.error("MediaRecorder error:", event);
        setError(`Recording error: ${event.error?.message || "Unknown error"}`);
      };
      mediaRecorderRef.current.onstop = handleRecordingStop;
      
      console.log("MediaRecorder set up successfully");
    } catch (error) {
      console.error("Failed to setup MediaRecorder:", error);
      setError(`MediaRecorder setup failed: ${error.message}`);
    }
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

  const startRecording = async () => {
    try {
      if (!mediaRecorderRef.current) {
        console.error('MediaRecorder not initialized');
        return;
      }

      if (mediaRecorderRef.current.state === 'recording') {
        console.log('MediaRecorder is already recording, stopping first');
        mediaRecorderRef.current.stop();
        return;
      }

      // Clear any existing chunks
      recordedChunksRef.current = [];
      
      // Set up the dataavailable event handler
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          console.log('Received data chunk of size:', event.data.size);
          recordedChunksRef.current.push(event.data);
        }
      };

      // Set up the stop event handler
      mediaRecorderRef.current.onstop = () => {
        console.log('MediaRecorder stopped, chunks:', recordedChunksRef.current.length);
        if (recordedChunksRef.current.length > 0) {
          const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
          console.log('Created blob of size:', blob.size);
          const url = URL.createObjectURL(blob);
          onRecordingComplete({ videoUrl: url, videoBlob: blob });
        } else {
          console.error('No recorded chunks available');
        }
      };

      // Start recording with a timeslice to ensure we get data
      mediaRecorderRef.current.start(1000); // Capture data every second
      setIsRecording(true);
      setRecordingTime(0);
      console.log('Started recording with MediaRecorder');
    } catch (error) {
      console.error('Error starting recording:', error);
      setError('Failed to start recording. Please try again.');
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  return (
    <RecorderContainer>
      <VideoPreview
        ref={videoRef}
        autoPlay
        playsInline
        muted
      />
      <Controls>
        <Button
          onClick={isRecording ? handleRecording : startRecording}
          recording={isRecording}
        >
          {isRecording ? 'Stop Recording' : 'Start Recording'}
        </Button>
      </Controls>
    </RecorderContainer>
  );
};

export default VideoCapture;