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

// Detect if device is mobile (for optimizations)
const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

// Initialize TensorFlow backend explicitly with improved mobile handling
const initializeTensorFlow = async () => {
  // Try WebGL first, fallback to CPU if needed
  try {
    console.log("Starting TensorFlow initialization...");
    
    // Set flags for better performance on mobile
    const mobile = isMobileDevice();
    
    if (mobile) {
      console.log("Mobile device detected, optimizing TensorFlow settings");
      tf.env().set('WEBGL_FORCE_F16_TEXTURES', true);
      tf.env().set('WEBGL_PACK', false);
      tf.env().set('WEBGL_CPU_FORWARD', false);
      tf.env().set('WEBGL_FLUSH_THRESHOLD', 1);
    } else {
      console.log("Desktop device detected, using standard TensorFlow settings");
    }
    
    // Try WebGL first
    await tf.setBackend('webgl');
    await tf.ready();
    console.log('Using WebGL backend for TensorFlow.js');
    console.log('WebGL version:', tf.env().get('WEBGL_VERSION'));
    console.log('WebGL flags:', {
      'WEBGL_FORCE_F16_TEXTURES': tf.env().get('WEBGL_FORCE_F16_TEXTURES'),
      'WEBGL_PACK': tf.env().get('WEBGL_PACK'),
      'WEBGL_CPU_FORWARD': tf.env().get('WEBGL_CPU_FORWARD'),
      'WEBGL_FLUSH_THRESHOLD': tf.env().get('WEBGL_FLUSH_THRESHOLD')
    });
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
  top: 16px;
  right: 16px;
  background-color: rgba(0, 0, 0, 0.6);
  color: white;
  padding: 8px 16px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 10;
`;

const RecordingDot = styled.div`
  width: 12px;
  height: 12px;
  background-color: #ff0000;
  border-radius: 50%;
  animation: blink 1s infinite ease-in-out;
  
  @keyframes blink {
    0% { opacity: 1; }
    50% { opacity: 0.3; }
    100% { opacity: 1; }
  }
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

const ControlButton = styled.button`
  min-width: 120px;
  padding: 10px 12px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-weight: 500;
  transition: all 0.2s ease;
  color: white;
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const RecordButtonContainer = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 20px;
`;

const RecordButton = styled.button`
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background-color: ${props => props.isRecording ? '#666' : '#ff0000'};
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(0,0,0,0.2);
  transition: all 0.2s ease;
  position: relative;
  -webkit-tap-highlight-color: transparent; /* Remove tap highlight on mobile */
  touch-action: manipulation; /* Optimize for touch */
  
  &:hover {
    transform: scale(1.05);
  }
  
  &:active {
    transform: scale(0.95); /* Provide feedback when pressed */
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  &::after {
    content: '';
    display: block;
    width: ${props => props.isRecording ? '20px' : '30px'};
    height: ${props => props.isRecording ? '20px' : '30px'};
    border-radius: ${props => props.isRecording ? '4px' : '50%'};
    background-color: ${props => props.isRecording ? 'white' : '#ff0000'};
    transition: all 0.2s ease;
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
  const debugLogRef = useRef([]);
  const chunksRef = useRef([]);
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingStartTime, setRecordingStartTime] = useState(null);
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
  const [isMobile, setIsMobile] = useState(isMobileDevice());
  const [debugMode, setDebugMode] = useState(false);
  
  // Debug logging function
  const addDebugLog = (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp}: ${message}`;
    console.log(`DEBUG: ${logMessage}`);
    debugLogRef.current = [...debugLogRef.current, logMessage].slice(-50); // Keep last 50 logs
  };

  // Initialize the component with browser detection
  useEffect(() => {
    // Set mobile device detection
    const mobile = isMobileDevice();
    setIsMobile(mobile);
    
    // Detect browser for specific handling
    const browser = detectBrowser();
    addDebugLog(`Browser detected: ${browser}`);
    
    // Initialize app
    initializeTensorFlow();
    
    // Add window resize handler
    const handleResize = () => {
      if (videoRef.current && canvasRef.current) {
        // Update canvas dimensions to match video element
        const video = videoRef.current;
        const canvas = canvasRef.current;
        
        // Get the computed dimensions of the video
        const videoRect = video.getBoundingClientRect();
        
        canvas.width = videoRect.width;
        canvas.height = videoRect.height;
        
        addDebugLog(`Window resized: Canvas resized to ${canvas.width}x${canvas.height}`);
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    // Clean up
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  
  // Function to detect browser type
  const detectBrowser = () => {
    const userAgent = navigator.userAgent;
    let browserName = "Unknown";
    
    if (userAgent.match(/firefox|fxios/i)) {
      browserName = "Firefox";
    } else if (userAgent.match(/chrome|chromium|crios/i)) {
      browserName = "Chrome";
    } else if (userAgent.match(/safari/i)) {
      browserName = "Safari";
    } else if (userAgent.match(/opr\//i)) {
      browserName = "Opera";
    } else if (userAgent.match(/edg/i)) {
      browserName = "Edge";
    }
    
    console.log(`Browser detected: ${browserName}`);
    return browserName;
  };

  // Initialize TensorFlow on component mount with better mobile handling
  useEffect(() => {
    let mounted = true;
    
    const initTF = async () => {
      try {
        addDebugLog(`Starting TensorFlow initialization on ${isMobile ? 'mobile' : 'desktop'} device`);
        const success = await initializeTensorFlow();
        if (mounted) {
          setTfInitialized(success);
          addDebugLog(`TensorFlow initialization ${success ? 'succeeded' : 'failed'}`);
          
          if (!success) {
            console.warn("TensorFlow initialization failed, disabling pose tracking");
            setEnableLivePose(false);
            setError("Pose tracking disabled: your device may not support it.");
          }
        }
      } catch (err) {
        console.error("Failed to initialize TensorFlow:", err);
        addDebugLog(`TensorFlow initialization error: ${err.message}`);
        
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
          videoRef.current.onloadedmetadata = async () => {
            if (canvasRef.current && videoRef.current) {
              canvasRef.current.width = videoRef.current.clientWidth;
              canvasRef.current.height = videoRef.current.clientHeight;
              setStreamReady(true);
              setIsInitialized(true);
              setIsInitializing(false);
              setIsCameraReady(true);
              
              addDebugLog("Video metadata loaded, video ready");
              console.log("Video metadata loaded, dimensions:", 
                videoRef.current.videoWidth, "x", videoRef.current.videoHeight);
              
              // Try to ensure TensorFlow is initialized
              if (!tfInitialized) {
                addDebugLog("Attempting to initialize TensorFlow...");
                const success = await initializeTensorFlow();
                if (success) {
                  setTfInitialized(true);
                  addDebugLog("TensorFlow initialized successfully");
                } else {
                  addDebugLog("TensorFlow initialization failed");
                }
              }
              
              // Now start pose detection if it should be on
              if (enableLivePose && tfInitialized) {
                addDebugLog("Starting pose detection after camera ready");
                await startPoseDetection();
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
      console.warn("TensorFlow not initialized, attempting to initialize now");
      addDebugLog("TensorFlow not initialized, attempting initialization");
      
      try {
        const success = await initializeTensorFlow();
        if (!success) {
          console.error("Could not initialize TensorFlow");
          addDebugLog("TensorFlow initialization failed");
          setError("Could not initialize pose detection. Please try again or check if your device supports it.");
          return;
        }
        
        setTfInitialized(true);
        addDebugLog("TensorFlow initialization succeeded");
      } catch (err) {
        console.error("TensorFlow initialization error:", err);
        addDebugLog(`TensorFlow initialization error: ${err.message}`);
        setError(`Pose detection initialization failed: ${err.message}`);
        return;
      }
    }
    
    // Clear previous pose detection if any
    if (poseDetectionIdRef.current) {
      cancelAnimationFrame(poseDetectionIdRef.current);
      poseDetectionIdRef.current = null;
    }
    
    // Check for an existing detector
    if (detectorRef.current) {
      console.log("Pose detector already initialized, reusing it");
      addDebugLog("Reusing existing pose detector");
    }
    
    if (!videoRef.current || !canvasRef.current) {
      console.warn("Video or canvas refs not ready, can't start pose detection");
      addDebugLog("Video or canvas refs not ready for pose detection");
      return;
    }
    
    try {
      console.log("Initializing pose detector...");
      addDebugLog("Initializing pose detector");
      
      // Make sure TensorFlow is ready
      await tf.ready();
      
      // Only create a new detector if we don't have one
      if (!detectorRef.current) {
        // Load the MoveNet model with more explicit error handling
        const model = poseDetection.SupportedModels.MoveNet;
        const detectorConfig = {
          modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
          enableSmoothing: true
        };
        
        addDebugLog("Creating new pose detector with MoveNet model");
        detectorRef.current = await poseDetection.createDetector(model, detectorConfig);
        console.log("Pose detector initialized successfully");
        addDebugLog("Pose detector created successfully");
      }
      
      // Store canvas context for drawing
      const ctx = canvasRef.current.getContext('2d');
      
      // Helper function to map normalized coordinates to canvas
      const mapToCanvas = (x, y, videoWidth, videoHeight, canvasWidth, canvasHeight) => {
        // Get the actual dimensions of the video element as displayed on screen
        const videoElement = videoRef.current;
        if (!videoElement) return { x, y }; // Fallback if video element not available
        
        // Get the actual display dimensions of the video element
        const videoRect = videoElement.getBoundingClientRect();
        const displayedVideoWidth = videoRect.width;
        const displayedVideoHeight = videoRect.height;
        
        // Calculate scaling factors between original video dimensions and how it's displayed
        const scaleX = displayedVideoWidth / videoWidth;
        const scaleY = displayedVideoHeight / videoHeight;
        
        // Apply scaling to coordinates
        const scaledX = x * scaleX;
        const scaledY = y * scaleY;
        
        // Return transformed coordinates
        return { 
          x: scaledX, 
          y: scaledY 
        };
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
        const videoRect = video.getBoundingClientRect();
        if (canvas.width !== videoRect.width || canvas.height !== videoRect.height) {
          canvas.width = videoRect.width;
          canvas.height = videoRect.height;
          addDebugLog(`Canvas resized to match video: ${canvas.width}x${canvas.height}`);
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
            ctx.strokeStyle = '#22ff00'; // Bright green color
            ctx.lineWidth = 4; // Thicker lines
            
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
              
              if (startPoint && endPoint && startPoint.score > 0.3 && endPoint.score > 0.3) { // Lower threshold for better visibility
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
            ctx.fillStyle = '#ff2200'; // Bright red color
            pose.keypoints.forEach(keypoint => {
              if (relevantKeypoints.includes(keypoint.name) && keypoint.score > 0.3) { // Lower threshold for better visibility
                const pos = mapToCanvas(
                  keypoint.x / videoWidth, 
                  keypoint.y / videoHeight,
                  videoWidth, videoHeight, 
                  canvas.width, canvas.height
                );
                
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, 7, 0, 2 * Math.PI); // Larger circles
                ctx.fill();
                
                // Add white outline to the points for better visibility
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                ctx.stroke();
              }
            });

            // Draw real-time feedback for squat analysis - keep the knee angle measurement
            const rightHip = keypointMap['right_hip'];
            const rightKnee = keypointMap['right_knee'];
            const rightAnkle = keypointMap['right_ankle'];
            const leftHip = keypointMap['left_hip'];
            const leftKnee = keypointMap['left_knee']; 
            const leftAnkle = keypointMap['left_ankle'];

            // Helper function for drawing angle text
            const drawAngleText = (hip, knee, ankle, side) => {
              if (hip && knee && ankle && 
                  hip.score > 0.3 && knee.score > 0.3 && ankle.score > 0.3) {
                // Calculate angle
                const hipPos = { x: hip.x, y: hip.y };
                const kneePos = { x: knee.x, y: knee.y };
                const anklePos = { x: ankle.x, y: ankle.y };
                
                const angle = calculateAngle(hipPos, kneePos, anklePos);
                
                // Map knee position to canvas
                const kneePosCanvas = mapToCanvas(
                  knee.x / videoWidth, 
                  knee.y / videoHeight,
                  videoWidth, videoHeight, 
                  canvas.width, canvas.height
                );
                
                // Draw angle with white text with black outline for better visibility
                ctx.font = 'bold 18px Arial';
                
                // Text shadow for better visibility
                ctx.lineWidth = 4;
                ctx.strokeStyle = 'black';
                ctx.strokeText(`${side} Knee: ${angle.toFixed(0)}°`, kneePosCanvas.x + 15, kneePosCanvas.y);
                
                // Angle color based on range (red if problematic, green if good)
                if (angle < 70 || angle > 170) {
                  ctx.fillStyle = '#ff3333'; // Red for bad angle
                } else if (angle >= 90 && angle <= 110) {
                  ctx.fillStyle = '#33ff33'; // Green for good 90° angle
                } else {
                  ctx.fillStyle = '#ffff33'; // Yellow for okay angle
                }
                
                ctx.fillText(`${side} Knee: ${angle.toFixed(0)}°`, kneePosCanvas.x + 15, kneePosCanvas.y);
                
                // Add form feedback if needed
                if (angle < 70) {
                  ctx.fillStyle = '#ff3333';
                  ctx.strokeText("Too bent", kneePosCanvas.x + 15, kneePosCanvas.y + 25);
                  ctx.fillText("Too bent", kneePosCanvas.x + 15, kneePosCanvas.y + 25);
                } else if (angle > 170) {
                  ctx.fillStyle = '#ff3333';
                  ctx.strokeText("Straighten more", kneePosCanvas.x + 15, kneePosCanvas.y + 25);
                  ctx.fillText("Straighten more", kneePosCanvas.x + 15, kneePosCanvas.y + 25);
                }
              }
            };
            
            // Draw both knee angles
            drawAngleText(rightHip, rightKnee, rightAnkle, "R");
            drawAngleText(leftHip, leftKnee, leftAnkle, "L");
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

  // Modified initializeCamera for better handling of camera errors
  const initializeCamera = async () => {
    setError('');
    setIsCameraReady(false);
    setIsLoading(true);
    
    // Clear any existing safety timeouts to prevent multiple timeouts
    if (window.safetyTimeoutId) {
      clearTimeout(window.safetyTimeoutId);
      window.safetyTimeoutId = null;
    }
    
    try {
      // Stop any existing stream first
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
      }
      
      // Get current orientation
      const orientation = getDeviceOrientation();
      console.log(`Initializing camera with orientation: ${orientation}`);
      addDebugLog(`Initializing camera with orientation: ${orientation}`);
      
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
        setTimeout(() => reject(new Error('Camera access timed out')), 15000); // Increased from 10000
      });
      
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia(videoConstraints),
        timeoutPromise
      ]);
      
      // Store the stream reference
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Multiple event handlers to catch video loading across different browsers
        const videoLoadHandler = () => {
          if (!isCameraReady) {
            // Clear the safety timeout
            if (window.safetyTimeoutId) {
              clearTimeout(window.safetyTimeoutId);
              window.safetyTimeoutId = null;
              console.log("Safety timeout cleared - video loaded successfully");
              addDebugLog("Safety timeout cleared - video loaded successfully");
            }
            
            console.log(`Video metadata loaded, dimensions: ${videoRef.current.videoWidth} x ${videoRef.current.videoHeight}`);
            addDebugLog(`Video metadata loaded, video ready`);
            
            // Make sure canvas is properly sized
            if (canvasRef.current) {
              canvasRef.current.width = videoRef.current.clientWidth;
              canvasRef.current.height = videoRef.current.clientHeight;
            }
            
            setIsCameraReady(true);
            setIsLoading(false);
            setIsInitialized(true);
            setIsInitializing(false);
            
            // Start pose detection if it should be on
            if (enableLivePose && tfInitialized) {
              addDebugLog("Starting pose detection after camera ready");
              startPoseDetection();
            }
          }
        };
        
        // Wait for the video to be loaded - try multiple events for better browser compatibility
        videoRef.current.onloadedmetadata = videoLoadHandler;
        videoRef.current.onloadeddata = videoLoadHandler;
        videoRef.current.oncanplay = videoLoadHandler;
        
        // Ensure loading state is reset even if metadata event doesn't fire
        videoRef.current.onerror = (err) => {
          console.error("Video element error");
          addDebugLog(`Video element error: ${err}`);
          setIsLoading(false);
          setIsInitializing(false);
          setError("Video initialization failed. Please refresh the page and try again.");
        };
        
        // Additional safety timeout to ensure loading state is reset
        window.safetyTimeoutId = setTimeout(() => {
          if (isLoading) {
            console.warn("Safety timeout triggered - resetting loading state");
            addDebugLog("Safety timeout triggered - resetting loading state");
            
            // If video has dimensions but events didn't fire, consider it ready
            if (videoRef.current && videoRef.current.videoWidth > 0) {
              addDebugLog(`Video appears ready despite timeout. Dimensions: ${videoRef.current.videoWidth}x${videoRef.current.videoHeight}`);
              
              // Size canvas to match video
              if (canvasRef.current) {
                canvasRef.current.width = videoRef.current.clientWidth;
                canvasRef.current.height = videoRef.current.clientHeight;
              }
              
              // Try to ensure video is playing
              videoRef.current.play().catch(e => {
                console.warn("Could not autoplay video after timeout:", e);
                addDebugLog(`Post-timeout play attempt failed: ${e.message}`);
              });
              
              setIsCameraReady(true);
              setIsInitialized(true);
            }
            
            setIsLoading(false);
            setIsInitializing(false);
          }
        }, 7000);
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      addDebugLog(`Camera access error: ${err.message}`);
      setError(`Camera access error: ${err.message}. Please ensure you've granted camera permissions.`);
      setIsLoading(false);
      setIsInitializing(false);
      setIsCameraReady(false);
    }
  };

  // Start recording button handler
  const handleRecordButtonClick = async () => {
    console.log('Start recording button clicked');
    addDebugLog('Starting recording process');
    
    // Prevent double clicks/taps
    if (isRecording) {
      addDebugLog('Already recording, ignoring click');
      return;
    }
    
    // Prevent clicks while loading
    if (isLoading) {
      addDebugLog('Camera loading, ignoring click');
      return;
    }
    
    // Only proceed if we have a camera stream
    if (!isCameraReady || !streamRef.current) {
      console.error('Cannot start recording: camera not ready or no stream available');
      addDebugLog('Recording failed: Camera not ready or no stream');
      setError('Cannot start recording: camera not ready. Please refresh the page.');
      return;
    }
    
    addDebugLog('Camera ready, creating MediaRecorder');
    
    try {
      // Verify the stream is still active
      if (!streamRef.current.active) {
        throw new Error('Camera stream is not active');
      }
      
      console.log('Stream active, initializing recorder');
      
      // Check if MediaRecorder is supported
      if (typeof MediaRecorder === 'undefined') {
        throw new Error('MediaRecorder is not supported in this browser');
      }
      
      // Clear previous recording state
      setIsRecording(false);
      stopTimer();
      recordedChunksRef.current = [];
      
      // Detect browser type for special handling
      const userAgent = navigator.userAgent;
      const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent);
      const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
      
      if (isSafari || isIOS) {
        addDebugLog(`Safari/iOS detected: ${isIOS ? 'iOS' : 'Safari'}`);
      }
      
      // Try to find a supported MIME type
      // Safari and iOS need special handling
      let mimeType = '';
      
      if (isIOS) {
        // iOS Safari is very picky - check both MP4 and WebM
        addDebugLog('iOS device detected, checking supported formats');
        
        const iOSMimeTypes = ['video/mp4', 'video/webm'];
        for (const type of iOSMimeTypes) {
          if (MediaRecorder.isTypeSupported(type)) {
            mimeType = type;
            console.log(`iOS supported MIME type: ${mimeType}`);
            addDebugLog(`iOS supported MIME type: ${mimeType}`);
            break;
          }
        }
        
        // If nothing works on iOS, we'll need to use screen recording as a fallback
        if (!mimeType) {
          addDebugLog('No supported MIME types found on iOS, using fallback');
          setError('Recording may not work on this iOS device. Please try using Safari or Chrome on desktop.');
        }
      } else {
        // For other browsers
        const mimeTypes = [
          'video/webm;codecs=vp8,opus',
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=h264,opus',
          'video/webm',
          'video/mp4'
        ];
        
        for (const type of mimeTypes) {
          if (MediaRecorder.isTypeSupported(type)) {
            mimeType = type;
            console.log(`Found supported MIME type: ${mimeType}`);
            addDebugLog(`Using MIME type: ${mimeType}`);
            break;
          }
        }
      }
      
      if (!mimeType) {
        console.warn('No supported MIME types found, using default');
        addDebugLog('No supported MIME types found, using default');
      }
      
      // Set MediaRecorder options with mobile-optimized settings
      const options = mimeType ? 
        { 
          mimeType,
          videoBitsPerSecond: isMobile ? 1000000 : 2000000 // Lower bitrate for mobile
        } : {};
      
      // Stop any existing recorder
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        addDebugLog('Stopping existing MediaRecorder');
        mediaRecorderRef.current.stop();
      }
      
      // Create new MediaRecorder instance
      mediaRecorderRef.current = new MediaRecorder(streamRef.current, options);
      addDebugLog(`MediaRecorder created with options: ${JSON.stringify(options)}`);
      
      // Handle data available event
      mediaRecorderRef.current.ondataavailable = (e) => {
        console.log(`Data available event, size: ${e.data ? e.data.size : 0}`);
        
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
          addDebugLog(`Chunk added, total chunks: ${recordedChunksRef.current.length}, size: ${e.data.size}`);
        } else {
          addDebugLog(`Empty data received in ondataavailable`);
        }
      };
      
      // Handle recording stop event
      mediaRecorderRef.current.onstop = () => {
        const chunks = recordedChunksRef.current;
        addDebugLog(`MediaRecorder stopped, chunks: ${chunks.length}`);
        console.log(`MediaRecorder onstop event fired, chunks: ${chunks.length}`);
        
        if (chunks.length === 0) {
          console.log('No data chunks were recorded');
          addDebugLog('No data chunks were recorded');
          
          // Safari sometimes fails silently, so try using a manual frame capture as fallback
          if (isSafari || isIOS) {
            try {
              addDebugLog('Attempting Safari fallback with canvas capture');
              
              // Create a canvas with the current video frame
              const canvas = document.createElement('canvas');
              const video = videoRef.current;
              
              if (video) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                
                // Draw the current video frame
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                
                // Convert to image/png
                canvas.toBlob((blob) => {
                  if (blob) {
                    addDebugLog(`Created image/png fallback: ${blob.size} bytes`);
                    onRecordingComplete(blob);
                  } else {
                    setError('Recording failed: No video data captured. Please try a different browser.');
                  }
                }, 'image/png');
              } else {
                setError('Recording failed: No video data captured. Please try a different browser.');
              }
            } catch (fallbackError) {
              addDebugLog(`Safari fallback failed: ${fallbackError.message}`);
              setError('Recording failed on this device. Please try a different browser or device.');
            }
          } else {
            setError('No video data was captured. Please try again or use a different browser.');
          }
          
          setIsRecording(false);
          return;
        }
        
        // Create a blob from the recorded chunks
        const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
        
        if (blob.size === 0) {
          console.error('Recorded blob has size 0');
          addDebugLog('Recording failed: blob size is 0');
          setError('Recording failed: no data captured. Please try a different browser.');
          setIsRecording(false);
          return;
        }
        
        console.log(`Recording completed, blob size: ${blob.size} bytes`);
        addDebugLog(`Recording completed, blob size: ${blob.size} bytes`);
        
        // Process the recording
        onRecordingComplete(blob);
        
        // Update UI state
        setIsRecording(false);
        stopTimer();
        
        // Resume pose detection if it was previously enabled
        if (enableLivePose && tfInitialized) {
          addDebugLog('Resuming pose detection after recording');
          startPoseDetection();
        }
      };
      
      // Add error handler
      mediaRecorderRef.current.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        addDebugLog(`MediaRecorder error: ${event.name}: ${event.message}`);
        setError(`Recording error: ${event.name}. Please try a different browser.`);
        setIsRecording(false);
        stopTimer();
      };
      
      // Disable pose detection during recording to improve performance
      if (detectorRef.current) {
        addDebugLog('Stopping pose detection during recording');
        stopPoseDetection();
      }
      
      // First update the UI state
      setIsRecording(true);
      
      // Set recording start time - use Date.now() directly rather than state variable
      // This fixes the Chrome Mobile error with setRecordingStartTime
      const recordingStartTime = Date.now();
      addDebugLog(`Recording started at timestamp: ${recordingStartTime}`);
      
      // Generate a recording ID using the existing sessionIdRef
      addDebugLog(`Using session ID for recording: ${sessionIdRef.current}`);
      
      // Start the timer
      startTimer();
      
      // IMPORTANT: Start MediaRecorder AFTER attaching all event handlers
      // Special handling for Safari/iOS
      let timeslice = isMobile ? 2000 : 1000; // Longer slices on mobile
      
      if (isSafari || isIOS) {
        // Safari needs even larger chunks
        timeslice = 3000; 
        addDebugLog(`Safari/iOS detected, using ${timeslice}ms timeslice`);
        
        // Safari sometimes needs a manual data request
        const safariInterval = setInterval(() => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.requestData();
            addDebugLog('Safari: manually requested data');
          } else {
            clearInterval(safariInterval);
          }
        }, timeslice);
        
        // Clean up interval after 30 seconds max
        setTimeout(() => {
          clearInterval(safariInterval);
        }, 30000);
      }
      
      // Start the recording
      mediaRecorderRef.current.start(timeslice);
      addDebugLog(`MediaRecorder started with ${timeslice}ms timeslice`);
      
      console.log('MediaRecorder started successfully');
    } catch (error) {
      console.error('Error starting recording:', error);
      addDebugLog(`Recording error: ${error.message}`);
      setError(`Error starting recording: ${error.message}. Please try a different browser.`);
      setIsRecording(false);
      stopTimer();
    }
  };

  // Stop recording handler with improved mobile handling
  const handleStopRecording = () => {
    console.log('Stop recording button clicked');
    addDebugLog('Stopping recording');
    
    // Prevent multiple stop attempts
    if (!isRecording) {
      console.warn('Not currently recording, ignoring stop request');
      addDebugLog('Not recording, ignoring stop attempt');
      return;
    }
    
    if (!mediaRecorderRef.current) {
      console.warn('Cannot stop recording: no MediaRecorder instance');
      addDebugLog('Stop recording failed: no MediaRecorder instance');
      // Force UI reset
      setIsRecording(false);
      stopTimer();
      return;
    }
    
    try {
      // Update UI state first for immediate feedback
      setIsRecording(false);
      
      // Explicitly request a final dataavailable event with all recorded data
      if (mediaRecorderRef.current.state === 'recording') {
        addDebugLog('Requesting final data before stopping MediaRecorder');
        mediaRecorderRef.current.requestData();
        
        // Mobile browsers sometimes need a bit more time to process the data
        const delay = isMobile ? 300 : 100;
        
        // Small delay to ensure data is processed
        setTimeout(() => {
          // Stop the MediaRecorder (this will trigger the onstop event)
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            try {
              mediaRecorderRef.current.stop();
              addDebugLog('MediaRecorder stopped successfully');
            } catch (innerError) {
              console.error('Error during MediaRecorder.stop():', innerError);
              addDebugLog(`MediaRecorder.stop() error: ${innerError.message}`);
              
              // Since recording is technically over and UI is updated, handle manually
              if (recordedChunksRef.current.length > 0) {
                const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
                if (blob.size > 0) {
                  addDebugLog(`Manually creating blob with ${recordedChunksRef.current.length} chunks`);
                  onRecordingComplete(blob);
                }
              }
            }
          } else {
            addDebugLog(`Cannot stop MediaRecorder: state is ${mediaRecorderRef.current ? mediaRecorderRef.current.state : 'undefined'}`);
          }
        }, delay);
      } else {
        addDebugLog(`Cannot stop MediaRecorder: state is ${mediaRecorderRef.current.state}`);
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
      addDebugLog(`Stop recording error: ${error.message}`);
      setError(`Error stopping recording: ${error.message}`);
      
      // Force reset recording state
      setIsRecording(false);
      stopTimer();
    }
  };

  // Properly define stopPoseDetection function to use the ref
  const stopPoseDetection = () => {
    addDebugLog("Stopping pose detection");
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

  // Toggle camera between front and back
  const switchCamera = async () => {
    addDebugLog(`Switching camera from ${isFrontFacing ? 'front' : 'back'} to ${isFrontFacing ? 'back' : 'front'}`);
    console.log(`Switching camera from ${isFrontFacing ? 'front' : 'back'}`);
    
    // Don't allow switching during recording
    if (isRecording) {
      addDebugLog("Cannot switch camera while recording");
      return;
    }
    
    // Show loading state
    setIsLoading(true);
    
    // Stop current stream and detection first
    stopPoseDetection();
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        addDebugLog(`Stopping track: ${track.kind}`);
        track.stop();
      });
      streamRef.current = null;
    }
    
    // Toggle camera facing mode
    setIsFrontFacing(!isFrontFacing);
    
    // Short timeout to ensure state is updated before reinitializing
    setTimeout(async () => {
      try {
        await initializeCamera();
        addDebugLog("Camera switched successfully");
      } catch (error) {
        console.error("Error switching camera:", error);
        addDebugLog(`Error switching camera: ${error.message}`);
        setError(`Could not switch camera: ${error.message}`);
        setIsLoading(false);
      }
    }, 300);
  };

  // Toggle pose tracking
  const togglePoseTracking = async () => {
    addDebugLog(`Toggling pose tracking from ${enableLivePose ? 'on' : 'off'} to ${enableLivePose ? 'off' : 'on'}`);
    console.log(`Toggling pose tracking: current state = ${enableLivePose ? 'on' : 'off'}`);
    
    // Start by updating the UI immediately for responsive feel
    setEnableLivePose(!enableLivePose);
    
    if (enableLivePose) {
      // Turning tracking off
      addDebugLog("Disabling pose tracking");
      stopPoseDetection();
    } else {
      // Turning tracking on
      addDebugLog("Enabling pose tracking");
      
      // If TensorFlow isn't initialized, try to initialize it
      if (!tfInitialized) {
        addDebugLog("TensorFlow not initialized, attempting initialization");
        const success = await initializeTensorFlow();
        setTfInitialized(success);
        
        if (!success) {
          setError("Could not initialize pose detection. Please try again.");
          addDebugLog("TensorFlow initialization failed");
          return;
        }
        
        addDebugLog("TensorFlow initialized successfully");
      }
      
      // Make sure detector is initialized and start pose detection
      if (!detectorRef.current) {
        console.log("Starting pose detection");
        addDebugLog("Creating new pose detector");
        await startPoseDetection();
      } else {
        console.log("Pose detector already initialized");
        addDebugLog("Reusing existing pose detector");
      }
    }
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
        {/* Camera controls */}
        <div className="flex items-center justify-between p-2 bg-gray-900">
          <div className="flex gap-2">
            <ControlButton
              onClick={switchCamera}
              className={`bg-gray-700 hover:bg-gray-600`}
              title="Switch between front and rear cameras"
              disabled={isLoading || isRecording}
            >
              <RefreshCw size={18} />
              Swap Camera
            </ControlButton>
            
            <ControlButton
              onClick={togglePoseTracking}
              className={`${enableLivePose ? 'bg-blue-600 hover:bg-blue-500' : 'bg-gray-700 hover:bg-gray-600'}`}
              title={enableLivePose ? "Disable pose tracking" : "Enable pose tracking"}
              disabled={isLoading || isRecording}
            >
              {/* Stick figure icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="5" r="3" stroke="currentColor" strokeWidth="2"/>
                <line x1="12" y1="8" x2="12" y2="14" stroke="currentColor" strokeWidth="2"/>
                <line x1="8" y1="10" x2="16" y2="10" stroke="currentColor" strokeWidth="2"/>
                <line x1="12" y1="14" x2="9" y2="20" stroke="currentColor" strokeWidth="2"/>
                <line x1="12" y1="14" x2="15" y2="20" stroke="currentColor" strokeWidth="2"/>
              </svg>
              Live Tracking
            </ControlButton>
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
          <PoseCanvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
          />
          
          {/* Recording indicator - flashing red dot */}
          {isRecording && (
            <RecordingIndicator>
              <RecordingDot />
              <span>Recording</span>
            </RecordingIndicator>
          )}
        </div>
      </div>
      
      {/* Record button below video */}
      <RecordButtonContainer>
        <RecordButton 
          onClick={isRecording ? handleStopRecording : handleRecordButtonClick}
          onTouchEnd={(e) => {
            e.preventDefault(); // Prevent ghost clicks
            if (isRecording) {
              handleStopRecording();
            } else {
              handleRecordButtonClick();
            }
          }}
          disabled={isLoading}
          isRecording={isRecording}
          title={isRecording ? "Stop recording" : "Start recording"}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
        />
      </RecordButtonContainer>

      {/* Error message */}
      {error && (
        <div className="mt-4 p-3 bg-red-500 text-white rounded-md">
          {error}
          <div className="mt-2 text-sm">
            <button 
              onClick={() => setDebugMode(!debugMode)} 
              className="underline"
            >
              {debugMode ? "Hide debug info" : "Show debug info"}
            </button>
          </div>
        </div>
      )}
      
      {/* Always show debug button even when no errors */}
      {!error && (
        <div className="mt-4 text-center">
          <button 
            onClick={() => setDebugMode(!debugMode)} 
            className="text-sm text-gray-600 underline"
          >
            {debugMode ? "Hide debug info" : "Show debug info"}
          </button>
        </div>
      )}
      
      {/* Debug info */}
      {debugMode && (
        <div className="mt-4 p-3 bg-gray-800 text-white rounded-md text-xs overflow-auto max-h-60">
          <div className="font-bold mb-1">Debug Log:</div>
          {debugLogRef.current.map((log, i) => (
            <div key={i} className="mb-1">{log}</div>
          ))}
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