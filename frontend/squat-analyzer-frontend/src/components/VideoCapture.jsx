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
  top: 10px;
  left: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  background-color: rgba(0, 0, 0, 0.7);
  padding: 8px 15px;
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
  
  /* Improve visibility on mobile */
  @media (max-width: 768px) {
    top: 15px;
    left: 15px;
    padding: 10px 18px;
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
  
  /* Larger on mobile for better visibility */
  @media (max-width: 768px) {
    width: 14px;
    height: 14px;
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
  -webkit-tap-highlight-color: transparent; /* Remove tap highlight on mobile */
  
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
  
  /* Improve mobile touch targets */
  @media (max-width: 768px) {
    min-width: 130px;
    padding: 12px 15px;
    font-size: 16px;
    border-radius: 10px;
    
    i {
      font-size: 18px;
      margin-right: 6px;
    }
    
    /* Add a touch effect for mobile */
    &:active:not(:disabled) {
      opacity: 0.8;
    }
  }
`;

const RecordButtonContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-top: 20px;
  position: relative;
  z-index: 30;
  
  @media (max-width: 768px) {
    margin-top: 15px;
    transform: scale(1.1); /* Make slightly larger on mobile */
  }
`;

const RecordButton = styled.button`
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background-color: ${props => props.$isRecording ? '#f44336' : '#ffffff'};
  border: 3px solid ${props => props.$isRecording ? '#d32f2f' : '#e0e0e0'};
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease-in-out;
  box-shadow: ${props => props.$isRecording ? '0 0 15px rgba(255, 0, 0, 0.7)' : '0 2px 5px rgba(0, 0, 0, 0.2)'};
  position: relative;
  overflow: hidden;
  z-index: 20;
  -webkit-tap-highlight-color: transparent; /* Remove tap highlight on mobile */
  
  &:hover {
    transform: scale(1.05);
    box-shadow: ${props => props.$isRecording ? '0 0 20px rgba(255, 0, 0, 0.8)' : '0 4px 8px rgba(0, 0, 0, 0.3)'};
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
    width: ${props => props.$isRecording ? '20px' : '30px'};
    height: ${props => props.$isRecording ? '20px' : '30px'};
    background-color: ${props => props.$isRecording ? 'white' : '#f44336'};
    border-radius: ${props => props.$isRecording ? '4px' : '50%'};
    transition: all 0.2s ease;
  }

  /* Add a pulsing animation when recording */
  animation: ${props => props.$isRecording ? 'recordPulse 2s infinite' : 'none'};
  
  @keyframes recordPulse {
    0% {
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.7);
    }
    70% {
      transform: scale(1.05);
      box-shadow: 0 0 0 10px rgba(255, 0, 0, 0);
    }
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(255, 0, 0, 0);
    }
  }
  
  /* Larger touch target for mobile */
  @media (max-width: 768px) {
    width: 70px;
    height: 70px;
    
    &::before {
      width: ${props => props.$isRecording ? '24px' : '35px'};
      height: ${props => props.$isRecording ? '24px' : '35px'};
    }
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

const ControlsContainer = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 15px;
  margin: 20px auto;
  max-width: 640px;
  flex-wrap: wrap;
  
  @media (max-width: 640px) {
    justify-content: center;
    gap: 20px; /* Increase spacing between buttons on mobile */
  }
`;

const LoadingOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
  z-index: 20;
`;

const LoadingSpinner = styled.div`
  width: 40px;
  height: 40px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 1s ease-in-out infinite;
  margin-bottom: 10px;
  
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const WarningMessage = styled.div`
  margin: 15px auto;
  padding: 10px;
  background-color: #fff3cd;
  border: 1px solid #ffeeba;
  border-radius: 5px;
  color: #856404;
  max-width: 640px;
  display: flex;
  flex-direction: column;
  align-items: center;
  
  p {
    margin-bottom: 10px;
  }
  
  button {
    padding: 5px 10px;
    background-color: #ffdb58;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    
    &:hover {
      background-color: #ffd700;
    }
  }
`;

const DebugPanel = styled.div`
  margin: 15px auto;
  padding: 10px;
  background-color: #e9ecef;
  border: 1px solid #ced4da;
  border-radius: 5px;
  max-width: 640px;
  color: #212529;
  
  h3 {
    margin-bottom: 10px;
    text-align: center;
  }
  
  p {
    margin: 5px 0;
  }
  
  button {
    margin-top: 10px;
    padding: 5px 10px;
    background-color: #6c757d;
    color: white;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    
    &:hover {
      background-color: #5a6268;
    }
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
  const [darkMode, setDarkMode] = useState(false);
  const [showTFWarning, setShowTFWarning] = useState(true);
  const [recordedVideo, setRecordedVideo] = useState(null);
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
          if (success) {
            setShowTFWarning(false);
          }
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
      
      // Add mobile-specific adjustments
      if (isMobile) {
        constraints.video = {
          ...constraints.video,
          frameRate: { ideal: 24, max: 30 }, // Lower framerate for mobile
        };
      }
      
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
      
      try {
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
      } catch (error) {
        addDebugLog(`Primary camera access failed: ${error.message}, trying fallback`);
        
        // Fallback to simpler constraints
        const fallbackConstraints = {
          audio: false,
          video: {
            facingMode: isFrontFacing ? 'user' : 'environment'
          }
        };
        
        // Try again with simplified constraints
        try {
          addDebugLog("Trying with simplified constraints");
          const fallbackStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
          streamRef.current = fallbackStream;
          
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream;
            await videoRef.current.play();
          }
        } catch (secondError) {
          // As a last resort, try with just { video: true }
          addDebugLog("Fallback constraints failed. Trying basic video access.");
          const basicStream = await navigator.mediaDevices.getUserMedia({ video: true });
          streamRef.current = basicStream;
          
          if (videoRef.current) {
            videoRef.current.srcObject = basicStream;
            await videoRef.current.play();
          }
        }
      }
      
      // Get actual stream info for debugging
      if (streamRef.current) {
        const videoTrack = streamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          const settings = videoTrack.getSettings();
          addDebugLog(`Active camera: ${videoTrack.label}`);
          addDebugLog(`Active resolution: ${settings.width}x${settings.height}`);
          addDebugLog(`Actual facing mode: ${settings.facingMode || 'unknown'}`);
        }
      }
      
      // Update UI state
      setIsCameraReady(true);
      setIsLoading(false);
      setStreamReady(true);
      
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
          
          // Detect poses
          const poses = await detectorRef.current.estimatePoses(video);
          
          if (poses.length > 0) {
            const pose = poses[0]; // MoveNet detects a single pose
            drawPose(pose, canvas, ctx);
          }
        } catch (error) {
          console.error('Error in pose detection:', error);
          addDebugLog(`Pose detection error: ${error.message}`);
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
      addDebugLog(`Pose detector initialization error: ${err.message}`);
      detectorRef.current = null;
      setEnableLivePose(false);
      setError("Failed to initialize pose tracking. This feature will be disabled.");
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
          addDebugLog(`Stopping track: ${track.kind}`);
          track.stop();
        });
        streamRef.current = null;
      }
      
      // Reset camera state and reinitialize
      setIsCameraReady(false);
      
      // Delay reinitialization to ensure everything is cleaned up
      setTimeout(() => {
        addDebugLog('Reinitializing camera after toggle');
        initializeCamera();
      }, 800);
    } catch (error) {
      console.error('Camera toggle error:', error);
      addDebugLog(`Camera toggle error: ${error.message}`);
      setError('Failed to toggle camera. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle pose tracking function
  const togglePoseTracking = async () => {
    addDebugLog(`Toggling pose tracking: current state ${isPoseTracking ? 'on' : 'off'}`);
    
    if (!tfInitialized) {
      addDebugLog("TensorFlow not initialized, attempting to initialize");
      await initializeTensorFlow();
    }
    
    if (isPoseTracking) {
      // Stop pose tracking
      stopPoseDetection();
      addDebugLog("Pose tracking stopped");
    } else {
      // Start pose tracking
      addDebugLog("Starting pose tracking");
      await startPoseDetection();
    }
  };

  // Function to format recording time
  const formatRecordingTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Unified function to toggle recording
  const toggleRecording = () => {
    if (isRecording) {
      handleStopRecording();
    } else {
      handleStartRecording();
    }
  };

  // Handle start recording function
  const handleStartRecording = async () => {
    try {
      // Check if camera is ready and stream exists
      if (!isCameraReady || !streamRef.current) {
        addDebugLog("Cannot start recording: camera not ready");
        setError("Camera not ready. Please ensure camera access is granted.");
        return;
      }
      
      // Save the current camera state to preserve it after recording completes
      const currentFacingMode = isFrontFacing;
      addDebugLog(`Current camera facing mode before recording: ${currentFacingMode ? 'front' : 'back'}`);
      
      // Get the video stream tracks
      const videoTracks = streamRef.current.getVideoTracks();
      if (!videoTracks || videoTracks.length === 0) {
        addDebugLog("Cannot start recording: no video tracks available");
        setError("No video stream available for recording.");
        return;
      }
      
      // Reset the recorded chunks array
      chunksRef.current = [];
      
      // Mobile device specific handling
      if (isMobile) {
        addDebugLog("Mobile device detected, using optimized recording settings");
      }
      
      // Determine supported MIME types first
      const supportedMimeTypes = [
        'video/webm',
        'video/webm;codecs=vp8',
        'video/webm;codecs=h264',
        'video/mp4'
      ].filter(mimeType => {
        try {
          return MediaRecorder.isTypeSupported(mimeType);
        } catch (e) {
          addDebugLog(`Error checking MIME type support for ${mimeType}: ${e.message}`);
          return false;
        }
      });
      
      addDebugLog(`Supported MIME types: ${supportedMimeTypes.join(', ') || 'None found!'}`);
      
      // Try to create MediaRecorder with appropriate options based on device
      try {
        if (supportedMimeTypes.length > 0) {
          // Use the first supported mimetype
          const options = { 
            mimeType: supportedMimeTypes[0],
            videoBitsPerSecond: isMobile ? 1000000 : 2500000 // Lower bitrate for mobile
          };
          addDebugLog(`Using mimetype: ${options.mimeType} with bitrate: ${options.videoBitsPerSecond}`);
          mediaRecorderRef.current = new MediaRecorder(streamRef.current, options);
        } else {
          // Fallback to default options
          addDebugLog("No supported MIME types found, using default MediaRecorder options");
          mediaRecorderRef.current = new MediaRecorder(streamRef.current);
        }
      } catch (e) {
        addDebugLog(`MediaRecorder initialization failed: ${e.message}, trying with minimal options`);
        // Last resort attempt with minimal options
        mediaRecorderRef.current = new MediaRecorder(streamRef.current);
      }

      // Setup event handlers and continue with recording
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
          addDebugLog(`Received data chunk: ${event.data.size} bytes`);
        }
      };
      
      mediaRecorderRef.current.onstop = async () => {
        addDebugLog("MediaRecorder stopped, processing recording...");
        
        if (chunksRef.current.length === 0) {
          addDebugLog("No data chunks recorded");
          setError("No video data was recorded. Please try again.");
          setIsRecording(false);
          stopTimer();
          return;
        }
        
        try {
          // Create a blob from the chunks
          let recordingMimeType = 'video/webm';
          
          // On iOS Safari, we may need to use a different mime type
          if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
            recordingMimeType = 'video/mp4';
          }
          
          const blob = new Blob(chunksRef.current, { type: recordingMimeType });
          addDebugLog(`Recording complete: ${blob.size} bytes, mime type: ${recordingMimeType}`);
          
          // Create a URL for the blob
          const url = URL.createObjectURL(blob);
          setRecordedVideo({
            url,
            blob,
            mimeType: recordingMimeType,
            timestamp: new Date().toISOString()
          });
          
          // Call the callback with the recorded blob if provided
          if (onRecordingComplete) {
            // Create a metadata object with information about the recording
            const metadata = {
              cameraFacing: currentFacingMode ? 'front' : 'back',
              recordingTime: recordingTimerRef.current,
              deviceType: isMobile ? 'mobile' : 'desktop'
            };
            
            // Pass both the blob and metadata
            onRecordingComplete(blob, metadata);
          }
        } catch (error) {
          console.error("Error processing recording:", error);
          addDebugLog(`Error processing recording: ${error.message}`);
          setError(`Recording processing failed: ${error.message}`);
        } finally {
          setIsRecording(false);
          stopTimer();
        }
      };
      
      // Add error handlers for MediaRecorder
      mediaRecorderRef.current.onerror = (event) => {
        console.error("MediaRecorder error:", event);
        addDebugLog(`MediaRecorder error: ${event.error ? (event.error.name + ' - ' + event.error.message) : 'Unknown error'}`);
        setError(`Recording error: ${event.error ? event.error.message : 'Unknown error'}`);
        
        // Try to recover by stopping the recording
        try {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
        } catch (e) {
          addDebugLog(`Error while trying to recover from MediaRecorder error: ${e.message}`);
        }
        
        setIsRecording(false);
        stopTimer();
      };
      
      // Start the recording with a smaller timeslice for more frequent chunks
      // Use a larger timeslice for mobile to reduce processing overhead
      const timeslice = isMobile ? 1000 : 500;
      mediaRecorderRef.current.start(timeslice);
      addDebugLog(`MediaRecorder started with timeslice: ${timeslice}ms`);
      
      // Update state
      setIsRecording(true);
      setRecordingStartTime(Date.now());
      
      // Start the timer
      startTimer();
      
      // Ensure pose tracking is active during recording
      if (!isPoseTracking && tfInitialized) {
        addDebugLog("Starting pose tracking for recording");
        await startPoseDetection();
      } else if (isPoseTracking) {
        addDebugLog("Keeping pose tracking active during recording");
      }
      
      addDebugLog("Recording started successfully");
      
    } catch (error) {
      console.error("Error starting recording:", error);
      addDebugLog(`Recording start error: ${error.message}`);
      setError(`Failed to start recording: ${error.message}`);
      setIsRecording(false);
    }
  };

  // Handle stop recording
  const handleStopRecording = () => {
    addDebugLog("Stopping recording...");
    
    if (!mediaRecorderRef.current) {
      addDebugLog("No MediaRecorder instance exists");
      setIsRecording(false);
      stopTimer();
      return;
    }
    
    if (mediaRecorderRef.current.state === 'recording') {
      try {
        addDebugLog("Attempting to stop MediaRecorder");
        mediaRecorderRef.current.stop();
        addDebugLog("MediaRecorder stopped successfully");
      } catch (error) {
        console.error("Error stopping MediaRecorder:", error);
        addDebugLog(`Error stopping MediaRecorder: ${error.message}`);
        setError(`Failed to stop recording properly: ${error.message}`);
        
        // Reset recording state anyway
        setIsRecording(false);
        stopTimer();
      }
    } else {
      addDebugLog(`MediaRecorder not in recording state: ${mediaRecorderRef.current.state}`);
      setIsRecording(false);
      stopTimer();
    }
  };

  // Timer utility functions
  const startTimer = () => {
    // Initialize recording time and start interval
    setRecordingTime('00:00');
    let seconds = 0;
    recordingTimerRef.current = 0;
    
    // Clear any existing interval first
    if (recordingInterval.current) {
      clearInterval(recordingInterval.current);
    }
    
    // Create new interval that increments seconds and updates display
    recordingInterval.current = setInterval(() => {
      seconds++;
      recordingTimerRef.current = seconds;
      setRecordingTime(formatRecordingTime(seconds));
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

  // Function to draw pose landmarks on canvas with proper scaling
  const drawPose = (pose, canvas, ctx) => {
    if (!canvas || !ctx || !videoRef.current) return;
    
    // Get the current video dimensions
    const videoWidth = videoRef.current.videoWidth;
    const videoHeight = videoRef.current.videoHeight;
    
    // Get the displayed video dimensions (scaled in the browser)
    const displayWidth = videoRef.current.clientWidth;
    const displayHeight = videoRef.current.clientHeight;
    
    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Ensure canvas dimensions match the display size
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
      addDebugLog(`Canvas resized to ${displayWidth}x${displayHeight}`);
    }
    
    // Set canvas styles
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    
    // Scale factors to map from video coordinates to display coordinates
    const scaleX = displayWidth / videoWidth;
    const scaleY = displayHeight / videoHeight;
    
    // Draw landmarks
    if (pose && pose.keypoints) {
      // Draw the keypoints
      pose.keypoints.forEach(keypoint => {
        if (keypoint.score > 0.3) { // Only draw keypoints with confidence above threshold
          const { x, y } = keypoint.position;
          
          // Scale coordinates to match display size
          const scaledX = x * scaleX;
          const scaledY = y * scaleY;
          
          // Draw landmark
          ctx.beginPath();
          ctx.arc(scaledX, scaledY, 5, 0, 2 * Math.PI);
          ctx.fillStyle = getKeypointColor(keypoint.part);
          ctx.fill();
          
          // Optionally draw keypoint name for debugging
          if (debugMode) {
            ctx.fillStyle = 'white';
            ctx.font = '12px Arial';
            ctx.fillText(`${keypoint.part} (${Math.round(keypoint.score * 100)}%)`, scaledX + 7, scaledY);
          }
        }
      });
      
      // Draw the skeleton
      const adjacentKeyPoints = getAdjacentKeyPoints(pose.keypoints);
      adjacentKeyPoints.forEach(keypoints => {
        drawSegment(keypoints[0].position, keypoints[1].position, ctx, scaleX, scaleY);
      });
    }
  };

  // Draw a line segment between keypoints
  const drawSegment = (start, end, ctx, scaleX, scaleY) => {
    if (!start || !end) return;
    
    // Scale coordinates
    const scaledStartX = start.x * scaleX;
    const scaledStartY = start.y * scaleY;
    const scaledEndX = end.x * scaleX;
    const scaledEndY = end.y * scaleY;
    
    ctx.beginPath();
    ctx.moveTo(scaledStartX, scaledStartY);
    ctx.lineTo(scaledEndX, scaledEndY);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'white';
    ctx.stroke();
  };

  // Get adjacent keypoints for skeleton drawing
  const getAdjacentKeyPoints = (keypoints) => {
    return poseConnections.map(([a, b]) => {
      const keyPointA = keypoints.find(kp => kp.part === a);
      const keyPointB = keypoints.find(kp => kp.part === b);
      
      if (keyPointA && keyPointB && keyPointA.score > 0.3 && keyPointB.score > 0.3) {
        return [keyPointA, keyPointB];
      }
      return null;
    }).filter(pair => pair !== null);
  };

  // Define connections between keypoints for drawing skeleton
  const poseConnections = [
    ['nose', 'leftEye'], ['leftEye', 'leftEar'], ['nose', 'rightEye'],
    ['rightEye', 'rightEar'], ['leftShoulder', 'rightShoulder'],
    ['leftShoulder', 'leftElbow'], ['leftElbow', 'leftWrist'],
    ['rightShoulder', 'rightElbow'], ['rightElbow', 'rightWrist'],
    ['leftShoulder', 'leftHip'], ['rightShoulder', 'rightHip'],
    ['leftHip', 'rightHip'], ['leftHip', 'leftKnee'],
    ['leftKnee', 'leftAnkle'], ['rightHip', 'rightKnee'],
    ['rightKnee', 'rightAnkle']
  ];

  // Get color based on keypoint type
  const getKeypointColor = (part) => {
    const colors = {
      nose: 'red',
      leftEye: 'yellow',
      rightEye: 'yellow',
      leftEar: 'yellow',
      rightEar: 'yellow',
      leftShoulder: 'green',
      rightShoulder: 'green',
      leftElbow: 'green',
      rightElbow: 'green',
      leftWrist: 'green',
      rightWrist: 'green',
      leftHip: 'blue',
      rightHip: 'blue',
      leftKnee: 'blue',
      rightKnee: 'blue',
      leftAnkle: 'blue',
      rightAnkle: 'blue'
    };
    
    return colors[part] || 'white';
  };

  // Add a useEffect cleanup to ensure proper camera reset when component mounts/unmounts
  useEffect(() => {
    // No need to initialize here as it's already done in the other useEffect
    
    // Save current camera facing mode to persist between component mounts
    const savedFacingMode = localStorage.getItem('preferredCameraFacing');
    if (savedFacingMode !== null) {
      setIsFrontFacing(savedFacingMode === 'front');
      addDebugLog(`Restored camera preference: ${savedFacingMode}`);
    }
    
    // Cleanup on unmount
    return () => {
      addDebugLog('Component unmounting, cleaning up camera resources');
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
        });
      }
      
      // Save current camera facing mode preference
      localStorage.setItem('preferredCameraFacing', isFrontFacing ? 'front' : 'back');
      addDebugLog(`Saved camera preference: ${isFrontFacing ? 'front' : 'back'}`);
      
      // Cancel any pose detection
      if (poseDetectionIdRef.current) {
        cancelAnimationFrame(poseDetectionIdRef.current);
      }
    };
  }, []);

  // Update saved preference whenever camera is toggled
  useEffect(() => {
    localStorage.setItem('preferredCameraFacing', isFrontFacing ? 'front' : 'back');
  }, [isFrontFacing]);

  return (
    <div className={`video-container ${darkMode ? 'dark-mode' : ''}`} ref={containerRef}>
      {error && (
        <ErrorMessage>
          <span>Error: {error}</span>
          <button onClick={() => window.location.reload()}>Reload</button>
        </ErrorMessage>
      )}
      
      {isInitializing && (
        <LoadingOverlay>
          <LoadingSpinner />
          <p>Initializing camera... Please wait.</p>
        </LoadingOverlay>
      )}
      
      <CameraContainer>
        <Video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ display: streamReady ? 'block' : 'none' }}
        />
        <PoseCanvas 
          ref={canvasRef}
          style={{ display: isPoseTracking ? 'block' : 'none' }}
        />
        
        {isRecording && (
          <RecordingIndicator>
            <RecordingDot />
            <span style={{ color: 'white', fontWeight: '500' }}>Recording {recordingTime}</span>
          </RecordingIndicator>
        )}
      </CameraContainer>
      
      <ControlsContainer>
        <ControlButton
          onClick={toggleCamera}
          disabled={isRecording || !isCameraReady}
          style={{
            backgroundColor: isFrontFacing ? '#4caf50' : '#2196f3'
          }}
        >
          <i className="fas fa-camera-rotate"></i>
          {isMobile ? (isFrontFacing ? 'Front' : 'Back') : (isFrontFacing ? 'Front Camera' : 'Back Camera')}
        </ControlButton>
        
        <ControlButton
          onClick={togglePoseTracking}
          disabled={!streamReady || !tfInitialized}
          style={{
            backgroundColor: isPoseTracking ? '#ff9800' : '#9c27b0'
          }}
        >
          <i className={`fas fa-${isPoseTracking ? 'stop' : 'play'}`}></i>
          {isPoseTracking ? 'Tracking On' : 'Start Track'}
        </ControlButton>
      </ControlsContainer>
      
      <RecordButtonContainer>
        <RecordButton
          $isRecording={isRecording}
          onClick={toggleRecording}
          disabled={!streamReady || isLoading}
          aria-label={isRecording ? 'Stop Recording' : 'Start Recording'}
          style={{ 
            touchAction: 'manipulation',
            userSelect: 'none'
          }}
          onTouchStart={(e) => {
            // Prevent double-tap zoom on mobile
            e.preventDefault();
          }}
        />
        {isMobile && <div style={{ marginTop: '8px', fontSize: '14px', textAlign: 'center' }}>
          {isRecording ? 'Tap to Stop' : 'Tap to Record'}
        </div>}
      </RecordButtonContainer>
      
      {!tfInitialized && showTFWarning && (
        <WarningMessage>
          <p>TensorFlow.js is still initializing. Pose tracking will be available shortly.</p>
          <button onClick={() => setShowTFWarning(false)}>Dismiss</button>
        </WarningMessage>
      )}
      
      {debugMode && (
        <DebugPanel>
          <h3>Debug Information</h3>
          <p>Mobile Device: {isMobile ? 'Yes' : 'No'}</p>
          <p>Camera Ready: {isCameraReady ? 'Yes' : 'No'}</p>
          <p>TensorFlow Initialized: {tfInitialized ? 'Yes' : 'No'}</p>
          <p>Pose Tracking: {isPoseTracking ? 'Active' : 'Inactive'}</p>
          <p>Recording: {isRecording ? 'Yes' : 'No'}</p>
          <p>Camera: {isFrontFacing ? 'Front' : 'Back'}</p>
          <button onClick={() => setDebugMode(false)}>Close Debug</button>
        </DebugPanel>
      )}
    </div>
  );
};

export default VideoCapture;