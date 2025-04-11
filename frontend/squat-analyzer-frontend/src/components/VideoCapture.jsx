// src/components/VideoCapture.jsx
import React, { useRef, useEffect, useState } from 'react';
import { Camera, RefreshCw, Maximize2, Minimize2, Square, AlertTriangle, Circle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import styled from 'styled-components';

// Import TensorFlow.js and pose detection
import * as tf from '@tensorflow/tfjs';
import * as poseDetection from '@tensorflow-models/pose-detection';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';

// API URL with fallback for local development
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://squat-analyzer-backend.onrender.com';

// Initialize TensorFlow backend explicitly
const initializeTensorFlow = async () => {
  // Try WebGL first, fallback to CPU if needed
  try {
    await tf.setBackend('webgl');
    await tf.ready();
    console.log('Using WebGL backend for TensorFlow.js');
    return true;
  } catch (error) {
    console.warn('WebGL backend failed, falling back to CPU:', error);
    try {
      await tf.setBackend('cpu');
      await tf.ready();
      console.log('Using CPU backend for TensorFlow.js');
      return true;
    } catch (cpuError) {
      console.error('Failed to initialize TensorFlow backend:', cpuError);
      return false;
    }
  }
};

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
  max-width: 640px;
  margin: 0 auto;
  background-color: #000;
  border-radius: 8px;
  overflow: hidden;
`;

const Video = styled.video`
  width: 100%;
  height: auto;
  display: block;
`;

const PoseCanvas = styled.canvas`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
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

const VideoPreview = styled.video`
  width: 100%;
  height: auto;
  border-radius: 8px;
  display: block;
  object-fit: contain;
  max-height: 70vh;
  background-color: #000;
`;

const VideoRecorder = styled.div`
  position: relative;
  max-width: 100%;
  max-height: 70vh;
  margin: 0 auto;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  overflow: hidden;
`;

const CanvasOverlay = styled.canvas`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
`;

const VideoCapture = ({ onFrameCapture, onRecordingComplete }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const sessionIdRef = useRef(uuidv4());
  const timerRef = useRef(null);
  const detectorRef = useRef(null);
  const animationRef = useRef(null);
  const poseDetectionIdRef = useRef(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState(null);
  const [streamReady, setStreamReady] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isPoseTracking, setIsPoseTracking] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [playbackRef, setPlaybackRef] = useState(null);
  const [enableLivePose, setEnableLivePose] = useState(true);
  const [isFrontFacing, setIsFrontFacing] = useState(true);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [tfInitialized, setTfInitialized] = useState(false);
  
  // Initialize TensorFlow on component mount - with better handling for mobile
  useEffect(() => {
    let mounted = true;
    
    const initTF = async () => {
      try {
        const success = await initializeTensorFlow();
        if (mounted) {
          setTfInitialized(success);
          if (!success) {
            console.warn("TensorFlow initialization failed, disabling pose tracking");
            setEnableLivePose(false);
            setError("Pose tracking disabled: your device may not support it.");
          }
        }
      } catch (err) {
        console.error("Failed to initialize TensorFlow:", err);
        if (mounted) {
          setEnableLivePose(false);
          setError("Could not initialize pose detection. The live tracking feature will be disabled.");
        }
      } finally {
        // Ensure we proceed with camera initialization regardless of TF status
        if (mounted && isInitializing) {
          initializeCamera();
        }
      }
    };
    
    initTF();
    
    return () => {
      mounted = false;
    };
  }, []);

  // Initialize video stream with less dependency on TensorFlow
  useEffect(() => {
    let mediaStream = null;

    const initCamera = async () => {
      try {
        setIsLoading(true);
        setError(null);

        if (isRecording || recordedBlob) {
          return;
        }

        // Get device orientation
        const orientation = getDeviceOrientation();
        console.log(`Current device orientation: ${orientation}`);

        // Configure constraints based on orientation
        const constraints = {
          audio: false,
          video: {
            width: { ideal: orientation === 'landscape' ? 1280 : 720 },
            height: { ideal: orientation === 'landscape' ? 720 : 1280 },
            facingMode: isFrontFacing ? 'user' : 'environment'
          }
        };

        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Camera access timed out')), 10000);
        });
        
        // Request camera access with appropriate constraints
        mediaStream = await Promise.race([
          navigator.mediaDevices.getUserMedia(constraints),
          timeoutPromise
        ]);
        
        streamRef.current = mediaStream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          
          // Set up canvas for pose detection overlay once video is ready
          videoRef.current.onloadedmetadata = () => {
            if (canvasRef.current && videoRef.current) {
              canvasRef.current.width = videoRef.current.clientWidth;
              canvasRef.current.height = videoRef.current.clientHeight;
              setStreamReady(true);
              setIsInitialized(true);
              setIsInitializing(false);
              setIsCameraReady(true);
              
              // Start pose detection if enabled and TensorFlow is initialized
              if (enableLivePose && tfInitialized) {
                startPoseDetection();
              }
            }
            setIsLoading(false);
          };
          
          // Ensure loading state is reset even if metadata event doesn't fire
          videoRef.current.onerror = () => {
            console.error("Video element error");
            setIsLoading(false);
            setIsInitializing(false);
            setError("Video initialization failed. Please refresh the page and try again.");
          };
          
          // Additional safety timeout to ensure loading state is reset
          setTimeout(() => {
            if (isLoading) {
              console.warn("Safety timeout triggered - resetting loading state");
              setIsLoading(false);
              setIsInitializing(false);
            }
          }, 15000);
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
        setError(`Camera access error: ${err.message}. Please ensure you've granted camera permissions.`);
        setIsLoading(false);
        setIsInitializing(false);
        setIsCameraReady(false);
      }
    };

    // Only run camera init if not already initialized
    if (isInitializing && !isCameraReady) {
      initCamera();
    }

    // Add orientation change listener
    const handleOrientationChange = () => {
      console.log("Orientation changed, reinitializing camera");
      // Clean up existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      // Reinitialize camera with new orientation
      initCamera();
    };

    // Listen for orientation changes
    if (window.screen && window.screen.orientation) {
      window.screen.orientation.addEventListener('change', handleOrientationChange);
    } else {
      window.addEventListener('orientationchange', handleOrientationChange);
    }

    // Clean up function
    return () => {
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
      }
      
      // Remove orientation change listeners
      if (window.screen && window.screen.orientation) {
        window.screen.orientation.removeEventListener('change', handleOrientationChange);
      } else {
        window.removeEventListener('orientationchange', handleOrientationChange);
      }
      
      // Clean up pose detection resources
      if (detectorRef.current) {
        stopPoseDetection();
      }
    };
  }, [isRecording, recordedBlob, enableLivePose, isFrontFacing, tfInitialized]);

  // Function to determine device orientation
  const getDeviceOrientation = () => {
    // Check screen orientation API first (most reliable)
    if (window.screen && window.screen.orientation) {
      const type = window.screen.orientation.type;
      console.log(`Screen orientation type: ${type}`);
      
      if (type.includes('landscape')) {
        return 'landscape';
      } else if (type.includes('portrait')) {
        return 'portrait';
      }
    }
    
    // Fallback to window dimensions
    const isLandscape = window.innerWidth > window.innerHeight;
    console.log(`Fallback orientation check: ${isLandscape ? 'landscape' : 'portrait'} (window dimensions: ${window.innerWidth}x${window.innerHeight})`);
    
    return isLandscape ? 'landscape' : 'portrait';
  };

  // Modified startPoseDetection to handle errors better and use ref instead of state
  const startPoseDetection = async () => {
    if (!tfInitialized) {
      console.warn("TensorFlow not initialized, skipping pose detection");
      return;
    }
    
    if (detectorRef.current) {
      console.log("Pose detector already initialized");
      return;
    }
    
    if (!videoRef.current || !canvasRef.current) {
      console.warn("Video or canvas refs not ready, can't start pose detection");
      return;
    }
    
    try {
      console.log("Initializing pose detector...");
      
      // Make sure TensorFlow is ready
      await tf.ready();
      
      // Load the MoveNet model with more explicit error handling
      const model = poseDetection.SupportedModels.MoveNet;
      const detectorConfig = {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
        enableSmoothing: true
      };
      
      detectorRef.current = await poseDetection.createDetector(model, detectorConfig);
      console.log("Pose detector initialized successfully");
      
      // Store canvas context for drawing
      const ctx = canvasRef.current.getContext('2d');
      
      // Helper function to map normalized coordinates to canvas
      const mapToCanvas = (x, y, videoWidth, videoHeight, canvasWidth, canvasHeight) => {
        // Check if video is in portrait orientation
        const isPortrait = videoHeight > videoWidth;
        const videoAspect = videoWidth / videoHeight;
        const canvasAspect = canvasWidth / canvasHeight;
        
        let displayWidth, displayHeight, offsetX, offsetY;
        
        if ((isPortrait && canvasAspect < videoAspect) || 
            (!isPortrait && canvasAspect > videoAspect)) {
          // Width constrained
          displayWidth = canvasWidth;
          displayHeight = displayWidth / videoAspect;
          offsetX = 0;
          offsetY = (canvasHeight - displayHeight) / 2;
        } else {
          // Height constrained
          displayHeight = canvasHeight;
          displayWidth = displayHeight * videoAspect;
          offsetX = (canvasWidth - displayWidth) / 2;
          offsetY = 0;
        }
        
        // Map coordinates based on video orientation
        const posX = isPortrait ? 
          offsetX + (y * displayWidth) : 
          offsetX + (x * displayWidth);
          
        const posY = isPortrait ?
          offsetY + ((1 - x) * displayHeight) :
          offsetY + (y * displayHeight);
          
        return { x: posX, y: posY };
      };

      // Function to detect poses and draw
      const detectAndDraw = async () => {
        if (!videoRef.current || !canvasRef.current || videoRef.current.paused || videoRef.current.ended) {
          return;
        }
        
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        
        // Make sure canvas matches current video display size
        if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
          canvas.width = video.clientWidth;
          canvas.height = video.clientHeight;
        }
        
        // Clear previous drawing
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        try {
          // Get video dimensions
          const videoWidth = video.videoWidth;
          const videoHeight = video.videoHeight;
          const isPortrait = videoHeight > videoWidth;
          
          // Detect poses
          const poses = await detectorRef.current.estimatePoses(video);
          
          if (poses.length > 0) {
            const pose = poses[0]; // MoveNet detects a single pose
            
            // Draw connections between keypoints
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 3;
            
            // Only include relevant connections for squat analysis (exclude facial features)
            const relevantConnections = [
              // Torso connections
              ['left_shoulder', 'right_shoulder'],
              ['left_shoulder', 'left_hip'],
              ['right_shoulder', 'right_hip'],
              ['left_hip', 'right_hip'],
              
              // Arm connections - useful for balance assessment
              ['left_shoulder', 'left_elbow'],
              ['left_elbow', 'left_wrist'],
              ['right_shoulder', 'right_elbow'],
              ['right_elbow', 'right_wrist'],
              
              // Leg connections - critical for squat form
              ['left_hip', 'left_knee'],
              ['left_knee', 'left_ankle'],
              ['right_hip', 'right_knee'],
              ['right_knee', 'right_ankle']
            ];
            
            // Create a keypoint map for easier access
            const keypointMap = {};
            pose.keypoints.forEach(keypoint => {
              keypointMap[keypoint.name] = keypoint;
            });
            
            // Draw only relevant connections
            relevantConnections.forEach(([start, end]) => {
              const startPoint = keypointMap[start];
              const endPoint = keypointMap[end];
              
              if (startPoint && endPoint && startPoint.score > 0.4 && endPoint.score > 0.4) {
                const startPos = mapToCanvas(
                  startPoint.x / videoWidth, 
                  startPoint.y / videoHeight,
                  videoWidth, videoHeight, 
                  canvas.width, canvas.height
                );
                
                const endPos = mapToCanvas(
                  endPoint.x / videoWidth, 
                  endPoint.y / videoHeight,
                  videoWidth, videoHeight, 
                  canvas.width, canvas.height
                );
                
                ctx.beginPath();
                ctx.moveTo(startPos.x, startPos.y);
                ctx.lineTo(endPos.x, endPos.y);
                ctx.stroke();
              }
            });
            
            // Define relevant keypoints for squat analysis
            const relevantKeypoints = [
              'left_shoulder', 'right_shoulder',
              'left_elbow', 'right_elbow',
              'left_wrist', 'right_wrist',
              'left_hip', 'right_hip',
              'left_knee', 'right_knee',
              'left_ankle', 'right_ankle'
            ];
            
            // Draw only relevant keypoints
            ctx.fillStyle = 'red';
            pose.keypoints.forEach(keypoint => {
              if (relevantKeypoints.includes(keypoint.name) && keypoint.score > 0.4) {
                const pos = mapToCanvas(
                  keypoint.x / videoWidth, 
                  keypoint.y / videoHeight,
                  videoWidth, videoHeight, 
                  canvas.width, canvas.height
                );
                
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, 5, 0, 2 * Math.PI);
                ctx.fill();
              }
            });

            // Draw real-time feedback for squat analysis - keep the knee angle measurement
            const rightHip = keypointMap['right_hip'];
            const rightKnee = keypointMap['right_knee'];
            const rightAnkle = keypointMap['right_ankle'];

            // Display knee angle since it's critical for squat form
            if (rightHip && rightKnee && rightAnkle && 
                rightHip.score > 0.4 && rightKnee.score > 0.4 && rightAnkle.score > 0.4) {
              // Calculate knee angle
              const hip = { x: rightHip.x, y: rightHip.y };
              const knee = { x: rightKnee.x, y: rightKnee.y };
              const ankle = { x: rightAnkle.x, y: rightAnkle.y };
              
              const angle = calculateAngle(hip, knee, ankle);
              
              // Display angle
              const kneePos = mapToCanvas(
                rightKnee.x / videoWidth, 
                rightKnee.y / videoHeight,
                videoWidth, videoHeight, 
                canvas.width, canvas.height
              );
              
              ctx.font = '16px Arial';
              ctx.fillStyle = 'white';
              ctx.strokeStyle = 'black';
              ctx.lineWidth = 3;
              const text = `Knee: ${angle.toFixed(1)}°`;
              ctx.strokeText(text, kneePos.x + 15, kneePos.y);
              ctx.fillText(text, kneePos.x + 15, kneePos.y);
              
              // Add additional squat form feedback
              if (angle < 90) {
                const warningText = "Knees too bent";
                ctx.fillStyle = 'yellow';
                ctx.strokeText(warningText, kneePos.x + 15, kneePos.y + 25);
                ctx.fillText(warningText, kneePos.x + 15, kneePos.y + 25);
              }
            }
          }
        } catch (error) {
          console.error('Error in pose detection:', error);
        }
        
        // Schedule next frame using the ref
        poseDetectionIdRef.current = requestAnimationFrame(detectAndDraw);
      };
      
      // Start detection loop using the ref
      if (!poseDetectionIdRef.current) {
        poseDetectionIdRef.current = requestAnimationFrame(detectAndDraw);
        setIsPoseTracking(true);
      }
    } catch (err) {
      console.error("Error initializing pose detector:", err);
      detectorRef.current = null;
      setEnableLivePose(false);
      setError("Failed to initialize pose tracking. This feature will be disabled.");
    }
  };

  const calculateAngle = (a, b, c) => {
    // Handle undefined points
    if (!a || !b || !c) {
        console.warn("Undefined points in angle calculation");
        return 0;
    }
    
    // Calculate vectors
    const ab = { x: b.x - a.x, y: b.y - a.y };
    const bc = { x: c.x - b.x, y: c.y - b.y };
    
    // Calculate dot product
    const dotProduct = ab.x * bc.x + ab.y * bc.y;
    
    // Calculate magnitudes
    const magAB = Math.sqrt(ab.x * ab.x + ab.y * ab.y);
    const magBC = Math.sqrt(bc.x * bc.x + bc.y * bc.y);
    
    // Prevent division by zero
    if (magAB === 0 || magBC === 0) {
        console.warn("Zero magnitude in angle calculation");
        return 0;
    }
    
    // Calculate angle in radians and convert to degrees
    const cosTheta = Math.max(-1, Math.min(1, dotProduct / (magAB * magBC)));
    const angleRad = Math.acos(cosTheta);
    return 180 - (angleRad * (180 / Math.PI));
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

  // Modified startRecording function to ensure it works even without pose detection
  const startRecording = async () => {
    console.log("Start recording button clicked");
    try {
      // Reset error state
      setError(null);
      
      // Check if camera is initialized, ensure camera is ready before proceeding
      if (!streamRef.current || !streamRef.current.active || !isCameraReady) {
        console.log("Camera not initialized or not ready, initializing now");
        await initializeCamera();
        
        // Double-check camera initialization after attempt
        if (!streamRef.current || !streamRef.current.active) {
          throw new Error("Failed to initialize camera. Please refresh and try again.");
        }
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
      
      // Create a new MediaRecorder instance with more robust error handling
      try {
        mediaRecorderRef.current = new MediaRecorder(streamRef.current, { 
          mimeType,
          videoBitsPerSecond: 2000000, // 2 Mbps - optimized for squat analysis
          audioBitsPerSecond: 0 // No audio
        });
      } catch (recorderError) {
        console.error("MediaRecorder creation failed:", recorderError);
        setError("Could not create video recorder. Please try a different browser.");
        return;
      }
      
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
      setError(`Recording error: ${error.message}`);
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
    
    // Stop pose detection loop
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    
    // Reset pose tracking state
    setIsPoseTracking(false);
    detectorRef.current = null;
    
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
    setIsInitializing(false); // Ensure we're not in initializing state
    
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

  // Properly define stopPoseDetection function to use the ref
  const stopPoseDetection = () => {
    if (poseDetectionIdRef.current) {
      cancelAnimationFrame(poseDetectionIdRef.current);
      poseDetectionIdRef.current = null;
      console.log("Pose detection stopped");
      setIsPoseTracking(false);
    }
    
    // Clean up the detector reference if needed
    if (detectorRef.current) {
      console.log("Cleaning up pose detector");
      // No explicit cleanup needed for MoveNet detector
      detectorRef.current = null;
    }
  };

  // Modified initializeCamera for better handling of camera errors
  const initializeCamera = async () => {
    setError('');
    setIsCameraReady(false);
    setIsLoading(true);
    
    try {
      // Stop any existing stream first
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
      }
      
      // Get current orientation
      const orientation = getDeviceOrientation();
      console.log(`Initializing camera with orientation: ${orientation}`);
      
      // Set video constraints based on orientation
      // Higher resolution for better pose detection but respect device capabilities
      const videoConstraints = {
        audio: false,
        video: {
          facingMode: isFrontFacing ? 'user' : 'environment',
          width: { ideal: orientation === 'landscape' ? 1280 : 720 },
          height: { ideal: orientation === 'landscape' ? 720 : 1280 }
        }
      };
      
      // Try to get the stream with a timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Camera access timed out')), 10000);
      });
      
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia(videoConstraints),
        timeoutPromise
      ]);
      
      // Store the stream reference
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Wait for the video to be loaded
        videoRef.current.onloadedmetadata = () => {
          console.log(`Video dimensions: ${videoRef.current.videoWidth}x${videoRef.current.videoHeight}`);
          
          // Make sure canvas is properly sized
          if (canvasRef.current) {
            canvasRef.current.width = videoRef.current.clientWidth;
            canvasRef.current.height = videoRef.current.clientHeight;
          }
          
          setIsCameraReady(true);
          setIsLoading(false);
          setIsInitialized(true);
          setIsInitializing(false);
          
          // Start pose detection if enabled and TensorFlow is initialized
          if (enableLivePose && tfInitialized) {
            startPoseDetection();
          }
        };
        
        // Add error handler to reset state
        videoRef.current.onerror = () => {
          console.error("Video element error during initialization");
          setIsCameraReady(false);
          setIsLoading(false);
          setIsInitializing(false);
          setError("Video initialization failed. Please refresh the page and try again.");
        };
        
        // Safety timeout in case metadata event never fires
        setTimeout(() => {
          if (isLoading) {
            console.warn("Camera initialization timeout - forcing state reset");
            setIsLoading(false);
            setIsCameraReady(true);
            setIsInitialized(true);
            setIsInitializing(false);
          }
        }, 5000);
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError(`Camera access error: ${err.message || 'Could not access camera'}. Please check permissions.`);
      setIsCameraReady(false);
      setIsLoading(false);
      setIsInitializing(false);
    }
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
        {/* Camera controls */}
        <div className="flex items-center justify-between p-2 bg-gray-900">
          <div className="flex gap-2">
            <button
              onClick={() => {
                setIsFrontFacing(!isFrontFacing);
                setTimeout(initializeCamera, 100);
              }}
              className="bg-gray-700 text-white px-3 py-1 rounded-md hover:bg-gray-600 transition flex items-center gap-1"
              title={isFrontFacing ? "Switch to back camera" : "Switch to front camera"}
              disabled={isLoading || isRecording}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              {isFrontFacing ? "Back" : "Front"}
            </button>
            <button
              onClick={() => {
                setEnableLivePose(!enableLivePose);
                if (!enableLivePose && tfInitialized) {
                  // Turning pose tracking on
                  startPoseDetection();
                } else if (enableLivePose) {
                  // Turning pose tracking off
                  stopPoseDetection();
                }
              }}
              className={`px-3 py-1 rounded-md hover:bg-gray-600 transition flex items-center gap-1
                ${enableLivePose ? 'bg-blue-600 text-white' : 'bg-gray-700 text-white'}`}
              title={enableLivePose ? "Disable pose tracking" : "Enable pose tracking"}
              disabled={!tfInitialized || isLoading || isRecording}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
              </svg>
              {enableLivePose ? "Tracking On" : "Tracking Off"}
            </button>
          </div>
          <div>
            {!isRecording ? (
              <button
                onClick={startRecording}
                disabled={isLoading}
                className={`px-4 py-2 rounded-md flex items-center gap-2 transition ${
                  isLoading 
                    ? 'bg-gray-500 cursor-not-allowed' 
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                <div className="w-3 h-3 rounded-full bg-white"></div>
                {isLoading ? 'Loading...' : 'Record'}
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md flex items-center gap-2 transition"
              >
                <div className="w-3 h-3 rounded bg-white"></div>
                Stop
              </button>
            )}
          </div>
        </div>

        {/* Video and canvas container */}
        <div className="relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full"
            style={{ display: 'block' }}
          ></video>
          
          {/* Pose overlay canvas */}
          {enableLivePose && (
            <PoseCanvas
              ref={canvasRef}
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
            />
          )}
          
          {/* Record indicator */}
          {isRecording && (
            <div className="absolute top-4 right-4 flex items-center gap-2 bg-black bg-opacity-50 px-3 py-1 rounded-full">
              <div className="w-3 h-3 rounded-full bg-red-600 animate-pulse"></div>
              <span className="text-white text-sm font-medium">Recording</span>
            </div>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-4 p-3 bg-red-500 text-white rounded-md">
          {error}
        </div>
      )}
      
      {/* Timer */}
      {isRecording && (
        <div className="mt-4 text-center">
          <span className="text-xl font-bold">
            {Math.floor(recordingTime / 60).toString().padStart(2, '0')}:
            {(recordingTime % 60).toString().padStart(2, '0')}
          </span>
        </div>
      )}
    </div>
  );
};

export default VideoCapture;