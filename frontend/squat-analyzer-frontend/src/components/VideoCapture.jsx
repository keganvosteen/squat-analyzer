// src/components/VideoCapture.jsx
import React, { useRef, useEffect, useState, useCallback } from 'react';
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
  top: 70px;
  left: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  background-color: rgba(0, 0, 0, 0.6);
  padding: 6px 12px;
  border-radius: 20px;
  z-index: 10;
  animation: fadeInOut 2s infinite;
  
  @keyframes fadeInOut {
    0% {
      opacity: 0.7;
    }
    50% {
      opacity: 1;
    }
    100% {
      opacity: 0.7;
    }
  }
`;

const RecordingDot = styled.div`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: #ff0000;
  animation: pulse 1.5s infinite;
  
  @keyframes pulse {
    0% {
      transform: scale(0.8);
      opacity: 0.7;
    }
    50% {
      transform: scale(1.2);
      opacity: 1;
    }
    100% {
      transform: scale(0.8);
      opacity: 0.7;
    }
  }
`;

const RecordingText = styled.span`
  color: white;
  font-weight: 500;
  font-size: 14px;
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
  border: none;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  
  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
  }
  
  &:active:not(:disabled) {
    transform: translateY(1px);
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  }
  
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
  background-color: ${props => props.isRecording ? '#f44336' : '#ffffff'};
  border: 3px solid ${props => props.isRecording ? '#d32f2f' : '#e0e0e0'};
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease-in-out;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
  position: relative;
  overflow: hidden;
  
  &:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
  }
  
  &:active {
    transform: scale(0.95);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  &::before {
    content: '';
    position: absolute;
    width: ${props => props.isRecording ? '20px' : '30px'};
    height: ${props => props.isRecording ? '20px' : '30px'};
    background-color: ${props => props.isRecording ? 'white' : '#f44336'};
    border-radius: ${props => props.isRecording ? '4px' : '50%'};
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

// Add formatTime function before the component definition
const formatTime = (totalSeconds) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

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
  const [recordingTime, setRecordingTime] = useState('00:00');
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
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimerRef = useRef(null);
  const recordingInterval = useRef(null);
  
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

  // Timer utility functions
  const startTimer = () => {
    // Initialize recording time and start interval
    setRecordingTime('00:00');
    let seconds = 0;
    
    // Clear any existing interval first
    if (recordingInterval.current) {
      clearInterval(recordingInterval.current);
    }
    
    // Create new interval that increments seconds and updates display
    recordingInterval.current = setInterval(() => {
      seconds++;
      setRecordingTime(formatTime(seconds));
    }, 1000);
  };

  const stopTimer = () => {
    // Clear the interval
    if (recordingInterval.current) {
      clearInterval(recordingInterval.current);
      recordingInterval.current = null;
    }
    
    // Reset recording time display
    setRecordingTime('00:00');
  };

  // Initialize camera function with improved mobile support
  const initializeCamera = async () => {
    setError(null);
    setIsLoading(true);
    addDebugLog('Initializing camera...');
    
    try {
      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          addDebugLog(`Stopping existing track: ${track.kind}`);
          track.stop();
        });
        streamRef.current = null;
      }
      
      // Clear video element source
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      
      // Determine optimal constraints based on device
      const facingMode = isFrontFacing ? "user" : "environment";
      
      // Start with basic constraints
      let constraints = {
        audio: false,
        video: {
          facingMode,
          width: { ideal: isMobile ? 720 : 1280 },
          height: { ideal: isMobile ? 1280 : 720 }
        }
      };
      
      // Check for current device orientation
      if (isMobile && window.screen && window.screen.orientation) {
        const orientation = window.screen.orientation.type;
        addDebugLog(`Current device orientation: ${orientation}`);
        
        // Adjust constraints based on orientation
        if (orientation.includes('landscape')) {
          constraints.video.width = { ideal: 1280 };
          constraints.video.height = { ideal: 720 };
        } else {
          // Portrait mode
          constraints.video.width = { ideal: 720 };
          constraints.video.height = { ideal: 1280 };
        }
      }
      
      addDebugLog(`Requesting media with constraints: ${JSON.stringify(constraints)}`);
      
      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Store the stream reference
      streamRef.current = stream;
      
      // Attach the stream to the video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Wait for video to be ready
        await new Promise((resolve) => {
          videoRef.current.onloadedmetadata = () => {
            addDebugLog(`Video loaded: ${videoRef.current.videoWidth}x${videoRef.current.videoHeight}`);
            resolve();
          };
          
          // Safety timeout in case the event never fires
          setTimeout(resolve, 2000);
        });
        
        // Make sure video is actually playing
        try {
          await videoRef.current.play();
          addDebugLog('Video playback started successfully');
        } catch (playError) {
          console.error('Error playing video:', playError);
          addDebugLog(`Video play error: ${playError.message}`);
          throw new Error(`Camera stream obtained but video playback failed: ${playError.message}`);
        }
      }
      
      // Get actual stream info for debugging
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        addDebugLog(`Active camera: ${videoTrack.label}`);
        addDebugLog(`Active resolution: ${settings.width}x${settings.height}`);
        addDebugLog(`Actual facing mode: ${settings.facingMode || 'unknown'}`);
      }
      
      // Update UI state
      setIsCameraReady(true);
      setIsLoading(false);
      
      // Initialize pose detection if enabled
      if (enableLivePose && tfInitialized) {
        addDebugLog('Starting pose detection after camera initialization');
        startPoseDetection();
      }
      
      return true;
    } catch (error) {
      console.error('Camera initialization error:', error);
      addDebugLog(`Camera initialization failed: ${error.message}`);
      
      // Handle specific error types
      if (error.name === 'NotAllowedError') {
        setError('Camera access denied. Please allow camera access and reload the page.');
      } else if (error.name === 'NotFoundError') {
        setError('No camera found. Please connect a camera and reload the page.');
      } else if (error.name === 'NotReadableError') {
        setError('Camera is already in use by another application. Please close other camera apps.');
      } else if (error.name === 'OverconstrainedError') {
        // Try again with less constraints
        addDebugLog('Constraints too strict, trying with minimal constraints');
        try {
          const minimalStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
          
          streamRef.current = minimalStream;
          if (videoRef.current) {
            videoRef.current.srcObject = minimalStream;
            await videoRef.current.play();
          }
          
          setIsCameraReady(true);
          setIsLoading(false);
          addDebugLog('Camera initialized with minimal constraints');
          return true;
        } catch (fallbackError) {
          addDebugLog(`Fallback camera initialization failed: ${fallbackError.message}`);
          setError('Camera not available with required capabilities. Please try a different device.');
        }
      } else {
        setError(`Camera error: ${error.message}`);
      }
      
      setIsCameraReady(false);
      setIsLoading(false);
      return false;
    }
  };

  // Function to reset and reinitialize the camera stream
  const resetCameraStream = () => {
    addDebugLog('Resetting camera stream');
    
    // Stop all tracks in the current stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        addDebugLog(`Stopping track: ${track.kind}`);
        track.stop();
      });
      streamRef.current = null;
    }
    
    // Clear video source
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject = null;
    }
    
    // Reset camera state and reinitialize
    setIsCameraReady(false);
    
    // Delay reinitialization to ensure everything is cleaned up
    setTimeout(() => {
      addDebugLog('Reinitializing camera after reset');
      initializeCamera();
    }, 800);
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

  // Improved camera toggle function with better error handling
  const toggleCamera = async () => {
    setIsLoading(true);
    addDebugLog('Toggling camera...');
    
    // Set the camera preference state before initializing
    setIsFrontFacing(!isFrontFacing);
    
    try {
      // First stop tracking if it's running
      if (isPoseTracking) {
        stopPoseDetection();
        addDebugLog('Stopped pose detection before camera toggle');
      }
      
      // Stop current stream if it exists
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          addDebugLog(`Stopping track: ${track.kind} (${track.label})`);
          track.stop();
        });
        streamRef.current = null;
      }
      
      // Brief delay to ensure cameras properly reset
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Initialize the new camera
      const success = await initializeCamera();
      
      if (!success) {
        // If failed to switch, try to revert to previous camera
        addDebugLog('Failed to switch camera, reverting to previous camera');
        setIsFrontFacing(isFrontFacing);
        await initializeCamera();
      } else {
        addDebugLog(`Camera switched to ${!isFrontFacing ? 'back' : 'front'} successfully`);
      }
      
      // Re-enable pose tracking if it was on
      if (isPoseTracking && tfInitialized) {
        addDebugLog('Restarting pose detection after camera toggle');
        startPoseDetection();
      }
    } catch (error) {
      console.error('Error toggling camera:', error);
      addDebugLog(`Camera toggle error: ${error.message}`);
      setError(`Failed to switch camera: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle pose tracking on and off
  const togglePoseTracking = async () => {
    addDebugLog(`Toggling pose tracking. Current state: ${isPoseTracking}`);
    
    if (!tfInitialized) {
      addDebugLog("TensorFlow not initialized, initializing now...");
      const success = await initializeTensorFlow();
      if (!success) {
        addDebugLog("Failed to initialize TensorFlow, cannot start pose tracking");
        return;
      }
    }
    
    if (isPoseTracking) {
      stopPoseDetection();
      addDebugLog("Pose tracking stopped");
      setIsPoseTracking(false);
    } else {
      // Make sure camera is initialized before starting detection
      if (!streamRef.current) {
        addDebugLog("No camera stream available, initializing camera first");
        const cameraSuccess = await initializeCamera();
        if (!cameraSuccess) {
          addDebugLog("Failed to initialize camera, cannot start pose tracking");
          return;
        }
      }
      
      try {
        if (!detectorRef.current && videoRef.current) {
          addDebugLog("Creating new pose detector...");
          detectorRef.current = await poseDetection.createDetector(poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING);
          if (!detectorRef.current) {
            addDebugLog("Failed to create pose detector");
            setError("Failed to create pose detector. Please try again.");
            return;
          }
        }
        
        startPoseDetection();
        setIsPoseTracking(true);
        addDebugLog("Pose tracking started");
      } catch (error) {
        console.error("Error toggling pose tracking:", error);
        addDebugLog(`Pose tracking error: ${error.message}`);
        setError(`Failed to start pose tracking: ${error.message}`);
        setIsPoseTracking(false);
      }
    }
  };

  // Add a function to format recording time
  const formatRecordingTime = (milliseconds) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Enhanced function to handle start recording with better mobile support
  const handleStartRecording = async () => {
    console.log("Start recording requested");
    
    // Clear any previous errors
    setError("");
    
    if (!isCameraReady) {
      setError("Camera is not ready. Please wait or check camera permissions.");
      return;
    }
    
    if (!videoRef.current || !videoRef.current.srcObject) {
      setError("No video stream available. Please check camera access.");
      return;
    }
    
    try {
      // Get the video stream from the video element
      const stream = videoRef.current.srcObject;
      
      if (!stream || !stream.active) {
        setError("Video stream is not active. Try toggling the camera.");
        return;
      }
      
      // Set up media recorder with appropriate settings for mobile
      const options = { 
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: isMobile ? 2500000 : 5000000 // Lower bitrate for mobile
      };
      
      // Try to use the specified MIME type, fallback to others if not supported
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.log("vp9 is not supported, trying vp8");
        options.mimeType = 'video/webm;codecs=vp8';
        
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          console.log("vp8 is not supported, trying basic webm");
          options.mimeType = 'video/webm';
          
          if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            console.log("webm is not supported, using default format");
            delete options.mimeType;
          }
        }
      }
      
      console.log(`Using MIME type: ${options.mimeType || 'browser default'}`);
      
      // Create media recorder
      mediaRecorderRef.current = new MediaRecorder(stream, options);
      
      // Set up recorder event handlers
      const chunks = [];
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };
      
      mediaRecorderRef.current.onstop = () => {
        console.log("Recording stopped, processing video...");
        
        try {
          // Create a blob from the recorded chunks
          const blob = new Blob(chunks, { type: 'video/webm' });
          
          // Generate a URL for the blob
          const url = URL.createObjectURL(blob);
          
          // Create a filename with UUID to prevent conflicts
          const fileName = `squat-analysis-${uuidv4()}.webm`;
          
          // Set the recording data in state
          setRecordedVideo({
            url,
            blob,
            fileName,
            recordedAt: new Date().toISOString()
          });
          
          console.log("Recording processed successfully");
        } catch (error) {
          console.error("Error processing recording:", error);
          setError(`Error processing recording: ${error.message}`);
        }
      };
      
      // Add error handler
      mediaRecorderRef.current.onerror = (event) => {
        console.error("MediaRecorder error:", event);
        setError(`Recording error: ${event.error.name}`);
        setIsRecording(false);
      };
      
      // Start recording
      mediaRecorderRef.current.start();
      console.log("Recording started");
      
      // Update state
      setIsRecording(true);
      
      // Reset and start timer
      recordingTimerRef.current = 0;
      recordingTimerRef.current = setInterval(() => {
        recordingTimerRef.current += 1;
        setRecordingTime(formatRecordingTime(recordingTimerRef.current));
      }, 1000);
    } catch (error) {
      console.error("Error starting recording:", error);
      setError(`Could not start recording: ${error.message}`);
    }
  };

  // Enhanced function to handle stop recording with better error handling
  const handleStopRecording = () => {
    console.log("Stop recording requested");
    
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
      console.log("No active recording to stop");
      setError("No active recording to stop");
      setIsRecording(false);
      return;
    }
    
    try {
      // Stop the recorder
      mediaRecorderRef.current.stop();
      console.log("MediaRecorder stopped");
      
      // Clear the timer
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      
      // Update state
      setIsRecording(false);
    } catch (error) {
      console.error("Error stopping recording:", error);
      setError(`Error stopping recording: ${error.message}`);
      setIsRecording(false);
    }
  };
  
  // Unified function to toggle recording
  const toggleRecording = () => {
    if (isRecording) {
      handleStopRecording();
    } else {
      handleStartRecording();
    }
  };

  return (
    <div className={`video-container ${dark ? 'dark-mode' : ''}`}>
      <div style={{ position: 'relative', width: '100%' }}>
        {isRecording && (
          <div className="recording-indicator" style={{ position: 'absolute', top: '15px', right: '15px', zIndex: 10 }}>
            <div className="recording-dot"></div>
            <span className="recording-text">Recording {recordingTime}</span>
          </div>
        )}
        <video
          ref={videoRef}
          className="video-element"
          autoPlay
          playsInline
          muted
          style={{ width: '100%', maxHeight: '75vh', backgroundColor: dark ? '#1a1a1a' : '#000', borderRadius: '8px' }}
        />
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        />
      </div>
      
      <div className="video-controls">
        <div className="control-row">
          <button 
            className={`control-button ${isFrontFacing ? 'active' : ''}`}
            onClick={toggleCamera}
            disabled={!isCameraReady || isLoading || (showTFWarning && !tfInitialized) || isRecording}
            aria-label="Toggle camera"
          >
            <Camera style={{ marginRight: '5px' }} size={18} />
            {isFrontFacing ? 'Back' : 'Front'}
          </button>
          
          <button 
            className={`control-button ${isPoseTracking ? 'active' : ''}`}
            onClick={togglePoseTracking}
            disabled={!isCameraReady || isLoading || (showTFWarning && !tfInitialized) || isRecording}
            aria-label="Toggle pose tracking"
          >
            <RefreshCw style={{ marginRight: '5px' }} size={18} />
            {isPoseTracking ? 'Tracking On' : 'Start Tracking'}
          </button>
        </div>
        
        <div className="record-container">
          <button 
            className={`record-button ${isRecording ? 'recording' : ''}`}
            onClick={toggleRecording}
            onTouchStart={(e) => {
              e.preventDefault(); // Prevent default touch behavior
              toggleRecording();
            }}
            disabled={!isCameraReady || isLoading || (showTFWarning && !tfInitialized)}
            aria-label={isRecording ? 'Stop recording' : 'Start recording'}
            style={{
              touchAction: 'manipulation', // Improve touch responsiveness
              WebkitTapHighlightColor: 'transparent', // Remove tap highlight on iOS
            }}
          >
            {isRecording ? (
              <Square size={24} />
            ) : (
              <Circle size={24} fill="#ffffff" />
            )}
          </button>
          <span style={{ fontSize: '14px', marginTop: '5px' }}>
            {isRecording ? 'Stop' : 'Record'}
          </span>
        </div>
      </div>
      
      {error && (
        <div className="error-message">
          <AlertTriangle size={18} style={{ marginRight: '5px' }} />
          {error}
          <button 
            onClick={() => setError(null)} 
            style={{ marginLeft: '10px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}
      
      {showTFWarning && !tfInitialized && (
        <div className="error-message">
          <AlertTriangle size={18} style={{ marginRight: '5px' }} />
          Loading pose detection model... This may take a moment.
        </div>
      )}
    </div>
  );
};

export default VideoCapture;