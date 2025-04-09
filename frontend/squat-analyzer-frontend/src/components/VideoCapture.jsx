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
  padding: 15px;
  border-radius: 5px;
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  
  .error-header {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: bold;
  }
  
  .error-actions {
    display: flex;
    gap: 10px;
    margin-top: 5px;
  }
  
  button {
    background-color: white;
    color: #ff4444;
    border: none;
    padding: 5px 10px;
    border-radius: 3px;
    cursor: pointer;
    font-weight: bold;
    
    &:hover {
      background-color: #f0f0f0;
    }
  }
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
  display: ${props => props.isRecording ? 'flex' : 'none'};
  align-items: center;
  gap: 5px;
  animation: ${props => props.isRecording ? 'blink 1.5s ease-in-out infinite' : 'none'};
  
  @keyframes blink {
    0% { opacity: 1; }
    50% { opacity: 0.4; }
    100% { opacity: 1; }
  }
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
  text-align: left;

  h3 {
    margin-bottom: 10px;
  }

  ol, ul {
    padding-left: 20px;
    margin-bottom: 15px;
  }

  li {
    margin-bottom: 5px;
  }

  .tips-section {
    margin-top: 15px;
    border-top: 1px solid #ddd;
    padding-top: 15px;
  }
`;

// Add a blinking circle component for the recording indicator
const RecordingDot = styled.div`
  width: 12px;
  height: 12px;
  background-color: #ff4136;
  border-radius: 50%;
  display: inline-block;
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
      
      // Clean up any existing stream first to prevent conflicts
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
      
      // Try multiple constraint configurations if the default fails
      let stream = null;
      let error = null;
      
      // First try with standard constraints
      try {
        const standardConstraints = {
          audio: false, // Disabled to reduce file size and improve processing time
          video: {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            facingMode: 'user'
          }
        };
        
        console.log("Trying standard constraints:", standardConstraints);
        stream = await navigator.mediaDevices.getUserMedia(standardConstraints);
      } catch (err) {
        console.warn("Standard constraints failed:", err.message);
        error = err;
      }
      
      // If standard constraints failed, try fallback with minimal constraints
      if (!stream) {
        try {
          const fallbackConstraints = {
            audio: false,
            video: true // Just request any video
          };
          
          console.log("Trying fallback constraints:", fallbackConstraints);
          stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
        } catch (err) {
          console.error("Fallback constraints also failed:", err.message);
          error = err;
        }
      }
      
      // If we still don't have a stream, throw the last error
      if (!stream) {
        throw error || new Error("Could not access camera with any configuration");
      }
      
      if (!stream.active) {
        throw new Error("Stream was created but is not active");
      }
      
      console.log("Stream successfully created with tracks:", 
        stream.getTracks().map(t => `${t.kind}:${t.label} (${t.readyState})`).join(', '));
      
      // Store the stream reference
      streamRef.current = stream;
      
      // Connect stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true; // Prevent feedback
        
        // Wait for video to be ready with timeout
        await Promise.race([
          new Promise((resolve) => {
            videoRef.current.onloadedmetadata = () => {
              console.log("Video metadata loaded");
              resolve();
            };
            // If metadata is already loaded, resolve immediately
            if (videoRef.current.readyState >= 2) {
              console.log("Video already ready");
              resolve();
            }
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Video metadata loading timeout")), 5000)
          )
        ]);
        
        try {
          await videoRef.current.play();
          console.log("Video playback started");
        } catch (playErr) {
          console.error("Error playing video:", playErr);
          // Continue anyway - the stream is initialized
        }
      }
      
      console.log("Camera initialized successfully");
      setStreamReady(true);
      setIsInitialized(true);
      return streamRef.current;
    } catch (error) {
      console.error("Camera initialization error:", error);
      
      // Provide more helpful error messages based on the error
      let errorMessage = "Could not access camera";
      
      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        errorMessage = "Camera access denied. Please check your browser permissions and try again.";
      } else if (error.name === "NotFoundError") {
        errorMessage = "No camera found. Please connect a camera and reload the page.";
      } else if (error.name === "NotReadableError" || error.name === "TrackStartError") {
        errorMessage = "Camera is already in use by another application. Please close other applications using your camera.";
      } else if (error.name === "OverconstrainedError") {
        errorMessage = "Camera cannot meet the requested quality requirements. Try a different camera.";
      } else if (error.name === "TypeError") {
        errorMessage = "Invalid camera constraints. Please reload the page and try again.";
      } else if (error.message) {
        errorMessage = `Camera error: ${error.message}`;
      }
      
      setError(errorMessage);
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
    console.log("Start recording button clicked");
    try {
      // Reset error state
      setError(null);
      
      // Always reinitialize camera to ensure fresh stream
      await initializeCamera();
      
      // Verify stream is active
      if (!streamRef.current || !streamRef.current.active) {
        console.error("Could not get an active stream for recording");
        setError("Camera not available. Please check permissions and reload the page.");
        return;
      }
      
      console.log("Stream active, initializing recorder");
      
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
        videoBitsPerSecond: 2000000, // 2 Mbps - optimized for squat analysis
        audioBitsPerSecond: 0 // No audio
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
        console.log("MediaRecorder onstop event fired, chunks:", recordedChunksRef.current.length);
        
        try {
          // Stop UI timer
          stopTimer();
          
          // Update recording state
          setIsRecording(false);
          
          if (recordedChunksRef.current.length === 0) {
            console.error("No data chunks were recorded");
            setError("No video data was recorded. Please try again.");
            return;
          }
          
          // Create blob from chunks
          const blob = new Blob(recordedChunksRef.current, { type: mimeType });
          console.log("Created video blob:", blob.type, "size:", Math.round(blob.size / 1024), "KB");
          
          if (blob.size > 0) {
            // Process the recording - ensure this callback is called
            console.log("Processing recorded video");
            // Add small timeout to ensure UI updates before heavy processing begins
            setTimeout(() => {
              // Compress video if it's larger than 3MB for better backend processing
              if (blob.size > 3 * 1024 * 1024) {
                console.log("Large video detected, compressing before sending to backend");
                compressVideo(blob).then(compressedBlob => {
                  console.log(`Compressed video from ${Math.round(blob.size/1024)}KB to ${Math.round(compressedBlob.size/1024)}KB`);
                  onRecordingComplete(compressedBlob);
                }).catch(error => {
                  console.error("Video compression failed, using original:", error);
                  onRecordingComplete(blob);
                });
              } else {
                onRecordingComplete(blob);
              }
            }, 100);
          } else {
            setError("Recording failed - no data captured");
          }
        } catch (error) {
          console.error("Error in onstop handler:", error);
          setError(`Recording error: ${error.message || 'Unknown error processing recording'}`);
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
    console.log("Stop recording button clicked");
    try {
      if (mediaRecorderRef.current) {
        console.log("MediaRecorder current state:", mediaRecorderRef.current.state);
        if (mediaRecorderRef.current.state === "recording") {
          console.log("Stopping media recorder");
          mediaRecorderRef.current.stop();
          // Force UI update in case the onstop event doesn't fire immediately
          setTimeout(() => {
            if (isRecording) {
              console.log("Forcing recording state update");
              setIsRecording(false);
              stopTimer();
            }
          }, 500);
        } else {
          console.warn("MediaRecorder is not in recording state:", mediaRecorderRef.current.state);
          // Still update UI state if it's inconsistent
          if (isRecording) {
            setIsRecording(false);
            stopTimer();
          }
        }
      } else {
        console.error("MediaRecorder is not initialized");
        // Still update UI state if it's inconsistent
        if (isRecording) {
          setIsRecording(false);
          stopTimer();
        }
      }
    } catch (error) {
      console.error("Error stopping recording:", error);
      // Make sure UI is updated regardless of error
      setIsRecording(false);
      stopTimer();
    }
  };

  const cleanupStream = () => {
    console.log("Cleaning up media resources");
    
    // Clear timer first
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    // Cleanup MediaRecorder
    if (mediaRecorderRef.current) {
      try {
        console.log("Cleaning up MediaRecorder in state:", mediaRecorderRef.current.state);
        if (mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      } catch (e) {
        console.error("Error stopping MediaRecorder during cleanup:", e);
      }
      mediaRecorderRef.current = null;
    }
    
    // Stop all tracks on the current stream
    if (streamRef.current) {
      try {
        console.log("Cleaning up stream tracks");
        const tracks = streamRef.current.getTracks();
        tracks.forEach(track => {
          try {
            console.log(`Stopping track: ${track.kind}:${track.label}`);
            track.stop();
          } catch (trackErr) {
            console.error(`Error stopping track ${track.kind}:${track.label}:`, trackErr);
          }
        });
      } catch (streamErr) {
        console.error("Error cleaning up stream:", streamErr);
      } finally {
        streamRef.current = null;
      }
    }
    
    // Clear video element srcObject
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
        console.log("Cleared video source");
      } catch (videoErr) {
        console.error("Error clearing video element:", videoErr);
      }
    }
    
    // Clear chunks
    if (recordedChunksRef.current) {
      recordedChunksRef.current = [];
    }
    
    // Reset UI state
    setStreamReady(false);
    setIsInitialized(false);
    setIsRecording(false);
    setRecordingTime(0);
    
    console.log("Media resources cleanup complete");
  };

  // Add video compression function
  const compressVideo = async (videoBlob) => {
    return new Promise((resolve, reject) => {
      try {
        console.log("Starting video compression");
        
        // Create a video element to process the blob
        const video = document.createElement('video');
        video.muted = true;
        video.autoplay = false;
        video.preload = "auto";
        
        // Create canvas for processing
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Create temporary URL for the video blob
        const videoUrl = URL.createObjectURL(videoBlob);
        video.src = videoUrl;
        
        // Handle video errors
        video.onerror = (err) => {
          URL.revokeObjectURL(videoUrl);
          reject(new Error(`Video loading failed during compression: ${err}`));
        };
        
        // Once metadata is loaded, we can start processing
        video.onloadedmetadata = () => {
          // Set target size (640x480 is good for ML processing while reducing size)
          const targetWidth = 640;
          const targetHeight = 480;
          
          // If the video is already smaller, just return the original
          if (video.videoWidth <= targetWidth && video.videoHeight <= targetHeight) {
            URL.revokeObjectURL(videoUrl);
            console.log("Video already small enough, skipping compression");
            resolve(videoBlob);
            return;
          }
          
          // Set canvas dimensions
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          
          // Create a MediaRecorder for the canvas
          const canvasStream = canvas.captureStream(30); // 30fps
          const recorder = new MediaRecorder(canvasStream, {
            mimeType: getSupportedMimeType(),
            videoBitsPerSecond: 1500000 // 1.5 Mbps - good balance for squat analysis
          });
          
          const chunks = [];
          recorder.ondataavailable = e => {
            if (e.data.size > 0) {
              chunks.push(e.data);
            }
          };
          
          recorder.onstop = () => {
            const compressedBlob = new Blob(chunks, { type: getSupportedMimeType() });
            URL.revokeObjectURL(videoUrl);
            resolve(compressedBlob);
          };
          
          // Start recording from the canvas
          recorder.start();
          
          // Set video to start from the beginning when we start processing
          video.currentTime = 0;
          
          // Play and process the video frames
          video.onplay = () => {
            const processFrame = () => {
              if (video.ended || video.paused) {
                recorder.stop();
                return;
              }
              
              // Draw the current frame at the reduced resolution
              ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
              
              // Continue with the next frame
              requestAnimationFrame(processFrame);
            };
            
            // Start processing
            processFrame();
          };
          
          // Play the video to start processing
          video.play().catch(playErr => {
            URL.revokeObjectURL(videoUrl);
            reject(new Error(`Couldn't play video for compression: ${playErr}`));
          });
        };
      } catch (err) {
        reject(err);
      }
    });
  };

  return (
    <Container>
      <Heading>Record Your Squat</Heading>
      
      {error && (
        <ErrorMessage>
          <div className="error-header">
            <AlertTriangle size={18} />
            Camera Error
          </div>
          <div>{error}</div>
          <div className="error-actions">
            <button onClick={() => initializeCamera()}>
              <RefreshCw size={14} className="mr-1" /> Retry Camera
            </button>
            <button onClick={() => window.location.reload()}>
              Reload Page
            </button>
          </div>
          <div className="text-sm">
            Tips: Try closing other applications using your camera, checking your browser permissions, or using a different browser.
          </div>
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
          <RecordingDot />
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
        
        <div className="tips-section">
          <h3>Recording Limits</h3>
          <ul>
            <li><strong>Recommended:</strong> Record 1 squat at a time for the best analysis.</li>
            <li><strong>Maximum:</strong> 10-15 seconds of video (about 1-2 squats) to avoid Render's free tier timeout.</li>
            <li><strong>File Size:</strong> Keeping videos under 10MB helps with faster uploads and processing.</li>
            <li><strong>No Audio:</strong> Audio is disabled to reduce file size and improve processing time.</li>
          </ul>
        </div>
      </InstructionsContainer>
    </Container>
  );
};

export default VideoCapture;