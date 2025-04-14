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

// Detect if browser is Firefox
const isFirefox = () => navigator.userAgent.toLowerCase().indexOf('firefox') > -1;

// Detect if browser is Safari
const isSafari = () => {
  const ua = navigator.userAgent.toLowerCase();
  return ua.indexOf('safari') !== -1 && ua.indexOf('chrome') === -1;
};

// Utility function to detect mobile browsers
const isMobileDevice = () => {
  const userAgent = navigator.userAgent.toLowerCase();
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(userAgent);
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
  background-color: rgba(0, 0, 0, 0.5); /* Semi-transparent background */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
  z-index: 20;
  pointer-events: auto; /* Allow interaction with the overlay */
  
  button {
    margin-top: 15px;
    padding: 8px 16px;
    background-color: #2196f3;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    transition: background-color 0.2s;
    
    &:hover {
      background-color: #0d8bf2;
    }
  }
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

const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 15px;
  width: 100%;
  
  @media (max-width: 600px) {
    gap: 8px;
  }
  
  @media (max-width: 400px) {
    gap: 5px;
  }
`;

// Add Button styling component
const Button = styled.button`
  padding: 10px 15px;
  background-color: #0077cc;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  min-width: 120px;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  
  &:hover:not(:disabled) {
    background-color: #0055aa;
    transform: translateY(-2px);
  }
  
  &:disabled {
    background-color: #cccccc;
    color: #666666;
    cursor: not-allowed;
  }
  
  &.recording {
    background-color: #cc0000;
    box-shadow: 0 0 8px rgba(255, 0, 0, 0.5);
    animation: pulse 1.5s infinite;
  }
  
  @media (max-width: 600px) {
    font-size: 0.9rem;
    padding: 8px 12px;
    min-width: 100px;
  }
  
  @media (max-width: 400px) {
    font-size: 0.8rem;
    padding: 6px 10px;
    min-width: 80px;
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
              
              // Immediately update states here to ensure UI is updated
              setStreamReady(true);
              setIsInitialized(true);
              setIsInitializing(false);
              setIsCameraReady(true);
              setIsLoading(false);
              
              resolve();
            };
            
            // Safety timeout in case the event never fires
            setTimeout(() => {
              addDebugLog("Video metadata loading timeout - forcing state update");
              setStreamReady(true);
              setIsInitialized(true);
              setIsInitializing(false);
              setIsCameraReady(true);
              setIsLoading(false);
              resolve();
            }, 2000);
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
            
            // Update state first before playing to ensure UI updates
            setStreamReady(true);
            setIsInitialized(true);
            setIsInitializing(false);
            
            try {
              await videoRef.current.play();
              addDebugLog('Fallback video playback started successfully');
              setIsCameraReady(true);
              setIsLoading(false);
            } catch (playError) {
              addDebugLog(`Fallback video play error: ${playError.message}`);
              throw playError;
            }
          }
        } catch (secondError) {
          // As a last resort, try with just { video: true }
          addDebugLog("Fallback constraints failed. Trying basic video access.");
          try {
            const basicStream = await navigator.mediaDevices.getUserMedia({ video: true });
            streamRef.current = basicStream;
            
            if (videoRef.current) {
              videoRef.current.srcObject = basicStream;
              
              // Update state first before playing
              setStreamReady(true);
              setIsInitialized(true);
              setIsInitializing(false);
              
              try {
                await videoRef.current.play();
                addDebugLog('Basic video playback started successfully');
                setIsCameraReady(true);
                setIsLoading(false);
              } catch (playError) {
                addDebugLog(`Basic video play error: ${playError.message}`);
                throw playError;
              }
            }
          } catch (finalError) {
            addDebugLog(`All fallback attempts failed: ${finalError.message}`);
            throw finalError;
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
        
        // Use a mobile-optimized configuration
        const detectorConfig = {
          modelType: isMobile ? 
            poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING : 
            poseDetection.movenet.modelType.SINGLEPOSE_THUNDER,
          enableSmoothing: true,
          // Use reduced scoring threshold on mobile for better detection
          scoreThreshold: isMobile ? 0.25 : 0.3,
          // Mobile-specific optimization
          multiPoseMaxDimension: isMobile ? 256 : 320
        };
        
        addDebugLog(`Creating new pose detector with model type: ${isMobile ? 'LIGHTNING (mobile)' : 'THUNDER'}`);
        
        try {
          detectorRef.current = await poseDetection.createDetector(model, detectorConfig);
          console.log("Pose detector initialized successfully");
          addDebugLog("Pose detector created successfully");
        } catch (modelError) {
          // Fallback to lightning model if thunder fails
          console.warn("Thunder model failed, falling back to lightning:", modelError);
          addDebugLog("Falling back to lightning model");
          
          detectorConfig.modelType = poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING;
          detectorRef.current = await poseDetection.createDetector(model, detectorConfig);
        }
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
          const poses = await detectorRef.current.estimatePoses(video, {
            flipHorizontal: isFrontFacing // Flip detection results if using front camera
          });
          
          if (poses && poses.length > 0) {
            const pose = poses[0]; // MoveNet detects a single pose
            
            // Log pose format if in debug mode to help identify structure
            if (debugMode && pose && pose.keypoints && pose.keypoints.length > 0) {
              const sampleKeypoint = pose.keypoints[0];
              console.debug('Keypoint sample format:', sampleKeypoint);
            }
            
            // Standardize keypoint format if needed
            if (pose.keypoints) {
              // Normalize the keypoint format to ensure consistency
              pose.keypoints = pose.keypoints.map(kp => {
                // Add position object if only x,y are available directly
                if (kp.x !== undefined && kp.y !== undefined && !kp.position) {
                  kp.position = { x: kp.x, y: kp.y };
                }
                // Make sure we have part/name information
                if (!kp.part && kp.name) {
                  kp.part = kp.name;
                } else if (!kp.name && kp.part) {
                  kp.name = kp.part;
                }
                return kp;
              });
            }
            
            drawPose(pose, canvas, ctx);
          }
        } catch (error) {
          console.error('Error in pose detection:', error);
          addDebugLog(`Pose detection error: ${error.message}`);
          
          // Don't stop the loop on errors, just continue to next frame
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

  // Update togglePoseTracking function to match new variable names
  const togglePoseTracking = () => {
    if (isLoading || !isCameraReady) return;
    
    addDebugLog(`togglePoseTracking called, current state: isPoseTracking=${isPoseTracking}, tfInitialized=${tfInitialized}`);
    
    if (!tfInitialized) {
      addDebugLog("TensorFlow not initialized yet");
      initializeTensorFlow().then(success => {
        if (success) {
          setTfInitialized(true);
          // Try to start pose tracking after initialization
          setTimeout(() => startPoseDetection(), 500);
        }
      });
        return;
      }
      
    if (isPoseTracking) {
      addDebugLog("Stopping pose tracking");
      stopPoseDetection();
    } else {
      addDebugLog("Starting pose tracking");
      startPoseDetection();
    }
    
    setIsPoseTracking(!isPoseTracking);
  };

  // Function to format recording time
  const formatRecordingTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Separate function to handle stopping frame-based recording (when MediaRecorder is not available)
  const stopFrameCapture = async () => {
    console.debug('[Squat] Stopping frame-based recording');
    
    // Get a reference to the most recent capture timeout
    const frameCapture = mediaRecorderRef.current?.frameCapture;
    const captureFrames = mediaRecorderRef.current?.captureFrames || [];
    
    // Clear any running capture timeout
    if (frameCapture && frameCapture.current) {
      clearTimeout(frameCapture.current);
      console.debug('[Squat] Frame capture loop stopped');
    }
    
    if (captureFrames.length === 0) {
      console.warn('[Squat] No frames were captured during recording');
      // Try one last capture
      const lastFrameBlob = await createFallbackRecording();
      
      if (lastFrameBlob && typeof onRecordingComplete === 'function') {
        console.debug('[Squat] Using emergency last frame capture');
        onRecordingComplete(lastFrameBlob);
    } else {
        setError('Recording failed: No frames were captured.');
      }
    } else {
      console.debug(`[Squat] Collected ${captureFrames.length} frames during recording`);
      
      // Use the last frame as the recording output
      const lastFrame = captureFrames[captureFrames.length - 1];
      
      if (lastFrame && lastFrame.blob && typeof onRecordingComplete === 'function') {
        console.debug('[Squat] Using last captured frame as recording output');
        onRecordingComplete(lastFrame.blob);
      } else {
        setError('Failed to process captured frames.');
      }
    }
    
    // Reset UI state
    setIsRecording(false);
    stopTimer();
  };

  // Unified function to toggle recording
  const toggleRecording = () => {
    try {
      console.debug('[Squat] Toggle recording. Current state:', isRecording);
      
    if (isRecording) {
        // If we're using MediaRecorder
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          handleStopRecording();
        } 
        // If we're using frame capture only
        else if (mediaRecorderRef.current && mediaRecorderRef.current.frameCapture) {
          stopFrameCapture();
        }
        // Fallback case
        else {
          setIsRecording(false);
          stopTimer();
        }
      } else {
        // Check if tracking is enabled before recording
        if (!isPoseTracking) {
          // Auto-enable pose tracking when starting recording
          console.debug('[Squat] Auto-enabling pose tracking for recording');
          startPoseDetection();
          setIsPoseTracking(true);
          
          // Small delay to ensure pose tracking is initialized
          setTimeout(() => {
            handleStartRecording();
          }, 1000);
        } else {
          handleStartRecording();
        }
      }
    } catch (error) {
      console.error('[Squat] Error in toggleRecording:', error);
      setError(`Recording error: ${error.message}`);
    }
  };

  // Handle start recording function
  const handleStartRecording = () => {
    try {
      console.debug('[Squat] Starting recording...');
      
      // Check if we're in Firefox - Firefox often has issues with MediaRecorder
      if (isFirefox()) {
        console.debug('[Squat] Firefox detected - using frame capture with higher frequency as primary recording method');
      }
      
      // Check if camera is ready
      if (!videoRef.current || !videoRef.current.srcObject) {
        console.warn('[Squat] Camera not ready for recording');
        setError('Camera not ready. Please ensure camera access is enabled.');
        return;
      }
      
      // Get video tracks and verify they exist
      const videoTracks = videoRef.current.srcObject.getVideoTracks();
      if (!videoTracks || videoTracks.length === 0) {
        console.warn('[Squat] No video tracks available');
        setError('No video source available for recording.');
        return;
      }
      
      // Reset recording chunks and set up frame capture as backup
      recordedChunksRef.current = [];
      const captureStartTime = Date.now();
      
      // Start a manual frame capture as backup
      let frameCounter = 0;
      const manualFrameCaptureRef = { current: null };
      const captureFrames = [];
      
      // Create a function to manually capture frames as fallback
      const captureFrame = async () => {
        if (!isRecording || !videoRef.current) return;
        
        try {
          const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          
          // Draw video frame
          ctx.drawImage(videoRef.current, 0, 0);
          
          // Draw pose data if available
          if (canvasRef.current && isPoseTracking) {
            ctx.drawImage(canvasRef.current, 0, 0);
          }
          
          // Determine capture quality and frequency based on browser
          const quality = isFirefox() ? 0.9 : 0.8;  // Higher quality for Firefox
          const captureInterval = isFirefox() ? 100 : 200; // More frequent captures for Firefox (10fps vs 5fps)
          
          // Store the frame
          canvas.toBlob((blob) => {
            if (blob) {
              frameCounter++;
              if (frameCounter % 10 === 0) {
                console.debug(`[Squat] Backup frame capture: ${frameCounter} frames`);
              }
              captureFrames.push({
                blob,
                timestamp: Date.now() - captureStartTime
              });
            }
          }, 'image/jpeg', quality);
          
          // Continue capture if still recording
          if (isRecording) {
            manualFrameCaptureRef.current = setTimeout(captureFrame, captureInterval);
          }
        } catch (e) {
          console.warn('[Squat] Error in manual frame capture:', e);
        }
      };
      
      // Add debugging for data availability
      let chunkCount = 0;
      let lastChunkTime = Date.now();
      
      // Determine supported mime types - prioritize mobile-compatible formats
      const mobileDevice = isMobile || isMobileDevice();
      console.debug(`[Squat] Device type: ${mobileDevice ? 'Mobile' : 'Desktop'}, Browser: ${isFirefox() ? 'Firefox' : 'Other'}`);
      
      // Check if MediaRecorder is supported at all
      if (typeof MediaRecorder === 'undefined') {
        console.warn('[Squat] MediaRecorder not supported, using fallback capture');
        // Start fallback capture immediately
        setIsRecording(true);
        startTimer();
        captureFrame();
        return;
      }
      
      // Different mime type priorities based on platform and browser
      let mimeTypes = [];
      
      if (isFirefox()) {
        // Firefox-specific MIME types (Firefox has better support for these)
        mimeTypes = [
          'video/webm',
          'video/webm;codecs=vp8,opus',
          'video/mp4'
        ];
      } else if (mobileDevice) {
        mimeTypes = [
          'video/mp4',
          'video/mp4;codecs=h264,aac',
          'video/webm',
          'video/webm;codecs=vp8,opus',
          'video/webm;codecs=vp9,opus'
        ];
      } else {
        mimeTypes = [
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm;codecs=h264,opus',
          'video/mp4;codecs=h264,aac',
          'video/webm',
          'video/mp4'
        ];
      }
      
      let selectedMimeType = null;
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          selectedMimeType = type;
          console.debug(`[Squat] Using mime type: ${type}`);
          break;
        }
      }
      
      if (!selectedMimeType) {
        console.warn('[Squat] No supported mime types found, using fallback capture');
        // Start fallback capture
        setIsRecording(true);
        startTimer();
        captureFrame();
        return;
      }
      
      // Create options with appropriate bitrate for the browser/device
      const options = {
        mimeType: selectedMimeType,
        videoBitsPerSecond: isFirefox() ? 2000000 : (mobileDevice ? 1000000 : 2500000)
      };
      
      try {
        // Create and configure the MediaRecorder
        mediaRecorderRef.current = new MediaRecorder(videoRef.current.srcObject, options);
        console.debug('[Squat] MediaRecorder created with options:', options);
      } catch (recorderError) {
        console.warn('[Squat] Error creating MediaRecorder with options, trying without options:', recorderError);
        // Try again with no options as fallback
        try {
          mediaRecorderRef.current = new MediaRecorder(videoRef.current.srcObject);
        } catch (basicError) {
          console.error('[Squat] Failed to create MediaRecorder even without options:', basicError);
          // Use fallback frame capture
          setIsRecording(true);
          startTimer();
          captureFrame();
          return;
        }
      }
      
      // Store the frame capture reference for cleanup
      mediaRecorderRef.current.frameCapture = manualFrameCaptureRef;
      mediaRecorderRef.current.captureFrames = captureFrames;
      
      mediaRecorderRef.current.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
          const now = Date.now();
          const timeSinceLastChunk = now - lastChunkTime;
          lastChunkTime = now;
          
          chunkCount++;
          console.debug(`[Squat] Data chunk ${chunkCount} available: ${event.data.size} bytes (${timeSinceLastChunk}ms since last chunk)`);
      recordedChunksRef.current.push(event.data);
          
          // Add progress indicator update if recording for a while
          if (chunkCount % 5 === 0) {
            console.debug(`[Squat] Recording progress: ${recordedChunksRef.current.length} chunks collected`);
          }
        } else {
          console.warn('[Squat] Empty data received in ondataavailable event');
        }
      };
      
      mediaRecorderRef.current.onerror = (event) => {
        console.error('[Squat] MediaRecorder error:', event);
        setError('Recording error occurred. Please try again.');
        
        // If we have frame captures, we can still recover
        if (captureFrames.length > 0) {
          console.debug(`[Squat] Will try to recover using ${captureFrames.length} captured frames`);
        }
        
        // Stop the capture loop and clean up
        if (manualFrameCaptureRef.current) {
          clearTimeout(manualFrameCaptureRef.current);
        }
        
        setIsRecording(false);
        stopTimer();
      };
      
      mediaRecorderRef.current.onstop = () => {
        console.debug('[Squat] MediaRecorder stopped, processing recording...');
        
        // Stop the backup frame capture if running
        if (manualFrameCaptureRef.current) {
          clearTimeout(manualFrameCaptureRef.current);
        }
        
        if (recordedChunksRef.current.length === 0) {
          console.warn('[Squat] No recorded data available from MediaRecorder - this is a common issue in Firefox');
          
          // If we have backup frames, convert them to a video or still image
          if (captureFrames.length > 0) {
            console.debug(`[Squat] Using ${captureFrames.length} backup frames`);
            
            // For simplicity, just use the last frame as a fallback image
            const lastFrame = captureFrames[captureFrames.length - 1];
            
            if (lastFrame && lastFrame.blob) {
              console.debug('[Squat] Using last captured frame as fallback');
              if (typeof onRecordingComplete === 'function') {
                const processedBlob = processRecordingForAnalysis(lastFrame.blob);
                onRecordingComplete(processedBlob);
              }
            } else {
              setError('Recording failed to capture any usable data.');
            }
          } else {
            setError('No recorded data available.');
          }
          
          setIsRecording(false);
      return;
    }
    
        // Determine output format based on browser support
        const outputType = selectedMimeType.split(';')[0]; // Get base mime type without codecs
        console.debug(`[Squat] Using output type: ${outputType} with ${recordedChunksRef.current.length} chunks`);
        
        // Create blob from recorded chunks
        const blob = new Blob(recordedChunksRef.current, { type: outputType });
        console.debug(`[Squat] Created blob size: ${blob.size} bytes`);
        
        // Call the onRecordingComplete callback if available
        if (typeof onRecordingComplete === 'function') {
          console.debug('[Squat] Calling onRecordingComplete with blob');
          const processedBlob = processRecordingForAnalysis(blob);
          onRecordingComplete(processedBlob);
        } else {
          console.warn('[Squat] No onRecordingComplete handler available');
        }
        
        // Reset recording state
        setIsRecording(false);
        recordedChunksRef.current = [];
      };
      
      // Start recording with more frequent data callbacks for more reliable recording
      try {
        console.debug('[Squat] Starting MediaRecorder');
        // Use very frequent chunks on mobile for better reliability (every 100ms)
        mediaRecorderRef.current.start(mobileDevice ? 100 : 250);
        
        // Also start the fallback frame capture as a safety measure
        captureFrame();
      } catch (startError) {
        console.error('[Squat] Error starting MediaRecorder:', startError);
        setError(`Could not start recording: ${startError.message}`);
        setIsRecording(false);
        return;
      }
      
      // Update recording state and start timer
      setIsRecording(true);
      startTimer();
      
      // Set a safety timeout to ensure we get at least some data
      setTimeout(() => {
        if (isRecording && recordedChunksRef.current.length === 0) {
          console.warn('[Squat] No chunks recorded after 1 second, requesting data');
          try {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              mediaRecorderRef.current.requestData();
            }
          } catch (e) {
            console.warn('[Squat] Error requesting initial data:', e);
          }
        }
      }, 1000);
      
      console.debug('[Squat] Recording started successfully');
        } catch (error) {
      console.error('[Squat] Error starting recording:', error);
      setError(`Failed to start recording: ${error.message}`);
      setIsRecording(false);
    }
  };

  // Process recording blob for analysis, applying browser-specific fixes
  const processRecordingForAnalysis = (blob) => {
    if (!blob) return null;
    
    console.debug(`[Squat] Processing ${blob.type} blob (${blob.size} bytes) for analysis, Firefox: ${isFirefox()}`);
    
    try {
      // For Firefox, we need to ensure the blob has appropriate properties
      if (isFirefox()) {
        // If it's an image blob (from fallback), mark it as such
        if (blob.type.startsWith('image/')) {
          const processedBlob = blob;
          processedBlob._recordingType = 'image';
          console.debug('[Squat] Marked blob as image for Firefox');
          return processedBlob;
        }
      }
      
      // For image blobs from other browsers
      if (blob._originalType && blob._originalType.startsWith('image/')) {
        blob._recordingType = 'image';
      }
      
      return blob;
    } catch (error) {
      console.warn('[Squat] Error processing blob:', error);
      return blob; // Return original if processing fails
    }
  };

  // Create a fallback recording using canvas capture when MediaRecorder fails to collect chunks for recording
  const createFallbackRecording = () => {
    console.debug('[Squat] Creating fallback recording from canvas frames');
    if (!videoRef.current || !canvasRef.current) {
      console.warn('[Squat] Cannot create fallback - no video or canvas ref');
      return null;
    }
    
    try {
      // Create a temporary canvas to capture the current frame
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      
      // Set dimensions to match the video
      tempCanvas.width = videoRef.current.videoWidth || 640;
      tempCanvas.height = videoRef.current.videoHeight || 480;
      
      // Draw the current video frame
      tempCtx.drawImage(videoRef.current, 0, 0, tempCanvas.width, tempCanvas.height);
      
      // If we have pose data, draw it on the canvas too
      if (canvasRef.current) {
        tempCtx.drawImage(canvasRef.current, 0, 0, tempCanvas.width, tempCanvas.height);
      }
      
      // Convert the canvas to a Blob using toBlob - use PNG format instead of JPEG
      // PNG is more widely supported for analysis
      return new Promise((resolve) => {
        tempCanvas.toBlob((blob) => {
          if (blob) {
            console.debug(`[Squat] Created fallback image blob: ${blob.size} bytes with type ${blob.type}`);
            
            // Create a new blob with explicit video MIME type to avoid playback issues
            // This is necessary because the browser expects a video format, not an image
            try {
              // For analysis purposes, just keep the PNG data
              const analysisBlob = blob;
              
              // Store the original type in case we need it later
              analysisBlob._originalType = blob.type;
              // Explicitly mark this as an image for analysis detection
              analysisBlob._recordingType = 'image';
              
              resolve(analysisBlob);
            } catch (blobError) {
              console.warn('[Squat] Error creating video blob:', blobError);
              resolve(blob); // Return original blob as fallback
            }
          } else {
            console.warn('[Squat] Failed to create fallback image blob');
            resolve(null);
          }
        }, 'image/png', 0.95);
      });
    } catch (error) {
      console.error('[Squat] Error creating fallback recording:', error);
      return null;
    }
  };

  // Handle stop recording with better mobile support
  const handleStopRecording = () => {
    try {
      console.debug('[Squat] In handleStopRecording');
      
      // If no media recorder, check if we were using frame capture only
      if (!mediaRecorderRef.current) {
        console.warn('[Squat] No media recorder found to stop');
        setIsRecording(false);
        stopTimer();
        return;
      }
      
      // Capture any frames if they exist for potential fallback
      const captureFrames = mediaRecorderRef.current.captureFrames || [];
      const frameCapture = mediaRecorderRef.current.frameCapture;
      
      // Stop the frame capture if it's running
      if (frameCapture && frameCapture.current) {
        clearTimeout(frameCapture.current);
        console.debug('[Squat] Stopped backup frame capture');
      }
      
      // Check if recorder is already inactive
      if (mediaRecorderRef.current.state === 'inactive') {
        console.warn('[Squat] MediaRecorder already inactive');
        
        // If we have frame captures but no chunks, use the frame captures
        if (captureFrames && captureFrames.length > 0 && recordedChunksRef.current.length === 0) {
          console.debug(`[Squat] Using ${captureFrames.length} backup frames since recorder is inactive`);
          const lastFrame = captureFrames[captureFrames.length - 1];
          
          if (lastFrame && lastFrame.blob && typeof onRecordingComplete === 'function') {
            console.debug('[Squat] Using last captured frame for inactive recorder');
            const processedBlob = processRecordingForAnalysis(lastFrame.blob);
            onRecordingComplete(processedBlob);
          }
        }
        
        setIsRecording(false);
        stopTimer();
        return;
      }
      
      console.debug(`[Squat] Stopping MediaRecorder (current state: ${mediaRecorderRef.current.state})`);
      
      // Create a copy of the current chunks before stopping
      const currentChunks = [...recordedChunksRef.current];
      
      // Create a manual cleanup function that can be called if onstop doesn't fire
      const manualCleanup = async () => {
        console.warn('[Squat] Performing manual cleanup');
        
        // Only proceed if we are still in recording state
        if (isRecording) {
          console.debug(`[Squat] Manual cleanup with ${currentChunks.length} chunks`);
          
          try {
            // Try using the chunks we have
            if (currentChunks.length > 0) {
              // Determine mime type (use a common fallback)
              const mimeType = 'video/webm';
              
              // Create blob manually from the copy of chunks we made
              const blob = new Blob(currentChunks, { type: mimeType });
              console.debug(`[Squat] Created blob manually: ${blob.size} bytes`);
              
              // Call the callback
              if (typeof onRecordingComplete === 'function') {
                console.debug('[Squat] Calling onRecordingComplete with manually created blob');
                const processedBlob = processRecordingForAnalysis(blob);
                onRecordingComplete(processedBlob);
              }
            } 
            // Try using captured frames if available
            else if (captureFrames && captureFrames.length > 0) {
              console.debug(`[Squat] Using ${captureFrames.length} backup frames in manual cleanup`);
              const lastFrame = captureFrames[captureFrames.length - 1];
              
              if (lastFrame && lastFrame.blob && typeof onRecordingComplete === 'function') {
                console.debug('[Squat] Using last captured frame in manual cleanup');
                const processedBlob = processRecordingForAnalysis(lastFrame.blob);
                onRecordingComplete(processedBlob);
              }
            }
            // Last resort: try to create a fallback image from current video frame
            else {
              console.warn('[Squat] No chunks or frames available, attempting to create fallback image');
              
              // Try to create a fallback image as a last resort
              const fallbackBlob = await createFallbackRecording();
              
              if (fallbackBlob && typeof onRecordingComplete === 'function') {
                console.debug('[Squat] Calling onRecordingComplete with fallback image');
                const processedBlob = processRecordingForAnalysis(fallbackBlob);
                onRecordingComplete(processedBlob);
              } else {
                console.error('[Squat] Failed to create any recording data');
                setError('Recording failed. Please try again or check your browser compatibility.');
              }
            }
          } catch (blobError) {
            console.error('[Squat] Error creating blob manually:', blobError);
            setError('Failed to process recording. Please try again.');
          }
        } else {
          console.warn('[Squat] Already stopped');
        }
        
        // Reset recording state regardless
        setIsRecording(false);
        stopTimer();
      };
      
      // Ensure we have some data before stopping
      if (recordedChunksRef.current.length === 0) {
        console.debug('[Squat] No chunks recorded yet, triggering final ondataavailable');
        // Force a final data available event
        if (mediaRecorderRef.current.state === 'recording') {
          // Some mobile browsers need this extra request for data
          try {
            mediaRecorderRef.current.requestData();
            // Short delay to allow data to be processed
            setTimeout(() => {
              if (recordedChunksRef.current.length === 0) {
                console.warn('[Squat] Still no data after requestData()');
              }
            }, 100);
          } catch (e) {
            console.warn('[Squat] Error requesting final data chunk:', e);
          }
        }
      }
      
      // Replace original onstop handler with improved version that uses our current chunks
      const originalOnStop = mediaRecorderRef.current.onstop;
      mediaRecorderRef.current.onstop = (event) => {
        console.debug('[Squat] MediaRecorder.onstop fired');
        
        if (originalOnStop) {
          try {
            // Call the original handler first
            originalOnStop(event);
          } catch (e) {
            console.warn('[Squat] Error in original onstop handler:', e);
          }
        }
        
        // Check if the normal processing left us with no chunks
        if (recordedChunksRef.current.length === 0 && currentChunks.length > 0) {
          console.warn('[Squat] Original handler produced no chunks, using our backup');
          // Use our copy of the chunks
          recordedChunksRef.current = currentChunks;
          
          // Create blob from backup chunks
          try {
            const mimeType = 'video/webm';
            const blob = new Blob(currentChunks, { type: mimeType });
            console.debug(`[Squat] Created blob from backup: ${blob.size} bytes`);
            
            // Call the callback
            if (typeof onRecordingComplete === 'function') {
              console.debug('[Squat] Calling onRecordingComplete with backup blob');
              onRecordingComplete(blob);
            }
          } catch (blobError) {
            console.error('[Squat] Error creating backup blob:', blobError);
          }
        }
        
        // Always update the UI
        setIsRecording(false);
      };
      
      // Set a timeout to ensure we eventually clean up if onstop never fires
      const cleanupTimeout = setTimeout(() => {
        console.warn('[Squat] MediaRecorder.onstop did not fire, forcing cleanup');
        manualCleanup();
      }, 2000);  // Shorter timeout for better UX
      
      // Keep track of this timeout so we can clear it if onstop works
      mediaRecorderRef.current.cleanupTimeoutId = cleanupTimeout;
      
      // Wrap the stop in a try/catch as it sometimes fails on mobile
      try {
        mediaRecorderRef.current.stop();
        console.debug('[Squat] MediaRecorder.stop() called successfully');
        
        // Mobile Safari sometimes doesn't fire onstop event but does stop recording
        // Add a redundancy check after a short delay
        setTimeout(() => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'inactive') {
            console.debug('[Squat] MediaRecorder is now inactive, ensuring cleanup');
            // Clear the timeout if it's still active
            if (mediaRecorderRef.current.cleanupTimeoutId) {
              clearTimeout(mediaRecorderRef.current.cleanupTimeoutId);
            }
            // Check if we're still in recording state
    if (isRecording) {
              console.warn('[Squat] Still in recording state despite inactive recorder, forcing cleanup');
              manualCleanup();
            }
          }
        }, 500);
      } catch (stopError) {
        console.error('[Squat] Error stopping MediaRecorder:', stopError);
        // Clear the timeout and manually clean up
        clearTimeout(cleanupTimeout);
        manualCleanup();
      }
      
      // Stop the timer immediately for better UX
      stopTimer();
    } catch (error) {
      console.error('[Squat] Error in handleStopRecording:', error);
      setError(`Failed to stop recording: ${error.message}`);
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
          // Handle both position formats (direct x,y or nested in position object)
          let x, y;
          
          if (keypoint.position) {
            // Original format with position object
            x = keypoint.position.x;
            y = keypoint.position.y;
          } else if (keypoint.x !== undefined && keypoint.y !== undefined) {
            // Alternative format with direct x,y properties
            x = keypoint.x;
            y = keypoint.y;
    } else {
            // Skip this keypoint if no valid coordinates
            console.debug(`[Squat] Skipping keypoint with missing position: ${keypoint.part || 'unknown'}`);
        return;
      }
      
          // Scale coordinates to match display size
          const scaledX = x * scaleX;
          const scaledY = y * scaleY;
          
          // Draw landmark
          ctx.beginPath();
          ctx.arc(scaledX, scaledY, 5, 0, 2 * Math.PI);
          ctx.fillStyle = getKeypointColor(keypoint.part || keypoint.name);
          ctx.fill();
          
          // Optionally draw keypoint name for debugging
          if (debugMode) {
            ctx.fillStyle = 'white';
            ctx.font = '12px Arial';
            ctx.fillText(`${keypoint.part || keypoint.name} (${Math.round(keypoint.score * 100)}%)`, scaledX + 7, scaledY);
          }
        }
      });
      
      // Draw the skeleton
      const adjacentKeyPoints = getAdjacentKeyPoints(pose.keypoints);
      adjacentKeyPoints.forEach(keypoints => {
        if (keypoints && keypoints.length === 2) {
          drawSegment(
            keypoints[0], 
            keypoints[1], 
            ctx, scaleX, scaleY
          );
        }
      });
    }
  };

  // Draw a line segment between keypoints
  const drawSegment = (start, end, ctx, scaleX, scaleY) => {
    if (!start || !end) return;
    
    // Get coordinates, handling both position object and direct x,y properties
    let startX, startY, endX, endY;
    
    if (start.position) {
      startX = start.position.x;
      startY = start.position.y;
    } else {
      startX = start.x;
      startY = start.y;
    }
    
    if (end.position) {
      endX = end.position.x;
      endY = end.position.y;
    } else {
      endX = end.x;
      endY = end.y;
    }
    
    // Scale coordinates
    const scaledStartX = startX * scaleX;
    const scaledStartY = startY * scaleY;
    const scaledEndX = endX * scaleX;
    const scaledEndY = endY * scaleY;
    
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
      // Find keypoints by part name, handling both naming conventions
      const keyPointA = keypoints.find(kp => (kp.part === a) || (kp.name === a));
      const keyPointB = keypoints.find(kp => (kp.part === b) || (kp.name === b));
      
      if (keyPointA && keyPointB && keyPointA.score > 0.3 && keyPointB.score > 0.3) {
        return [keyPointA, keyPointB];
      }
      return null;
    }).filter(pair => pair !== null);
  };

  // Define connections between keypoints for drawing skeleton
  const poseConnections = [
    // Face connections
    ['nose', 'left_eye'], ['left_eye', 'left_ear'], ['nose', 'right_eye'],
    ['right_eye', 'right_ear'], 
    
    // Torso
    ['left_shoulder', 'right_shoulder'],
    ['left_shoulder', 'left_hip'], ['right_shoulder', 'right_hip'],
    ['left_hip', 'right_hip'],
    
    // Arms
    ['left_shoulder', 'left_elbow'], ['left_elbow', 'left_wrist'],
    ['right_shoulder', 'right_elbow'], ['right_elbow', 'right_wrist'],
    
    // Legs
    ['left_hip', 'left_knee'], ['left_knee', 'left_ankle'],
    ['right_hip', 'right_knee'], ['right_knee', 'right_ankle']
  ];

  // Get color based on keypoint type
  const getKeypointColor = (part) => {
    // Standardize the part name
    const standardizedPart = part ? part.toLowerCase() : '';
    
    // Map of keypoint names to colors (including potential alternative names)
    const colors = {
      // Face
      'nose': 'red',
      'left_eye': 'yellow',
      'lefteye': 'yellow',
      'right_eye': 'yellow',
      'righteye': 'yellow',
      'left_ear': 'yellow',
      'leftear': 'yellow',
      'right_ear': 'yellow',
      'rightear': 'yellow',
      
      // Upper body
      'left_shoulder': 'green',
      'leftshoulder': 'green',
      'right_shoulder': 'green',
      'rightshoulder': 'green',
      'left_elbow': 'green',
      'leftelbow': 'green',
      'right_elbow': 'green',
      'rightelbow': 'green',
      'left_wrist': 'green',
      'leftwrist': 'green',
      'right_wrist': 'green',
      'rightwrist': 'green',
      
      // Lower body
      'left_hip': 'blue',
      'lefthip': 'blue',
      'right_hip': 'blue',
      'righthip': 'blue',
      'left_knee': 'blue',
      'leftknee': 'blue',
      'right_knee': 'blue',
      'rightknee': 'blue',
      'left_ankle': 'blue',
      'leftankle': 'blue',
      'right_ankle': 'blue',
      'rightankle': 'blue',
      
      // Legacy format
      'lefteye': 'yellow',
      'righteye': 'yellow',
      'leftear': 'yellow',
      'rightear': 'yellow',
      'leftshoulder': 'green',
      'rightshoulder': 'green',
      'leftelbow': 'green',
      'rightelbow': 'green',
      'leftwrist': 'green',
      'rightwrist': 'green',
      'lefthip': 'blue',
      'righthip': 'blue',
      'leftknee': 'blue',
      'rightknee': 'blue',
      'leftankle': 'blue',
      'rightankle': 'blue'
    };
    
    // Return the color for the standardized part name or white as default
    return colors[standardizedPart] || 'white';
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

  // Add a setTimeout to ensure loading state is always cleared
  useEffect(() => {
    // Set a safety timeout to ensure loading state is cleared
    const safetyTimeout = setTimeout(() => {
      if (isInitializing) {
        console.log("Safety timeout triggered - forcing initialization completion");
        setIsInitializing(false);
        setIsLoading(false);
        
        // If the video element has content but UI is still loading, update streamReady state
        if (videoRef.current && videoRef.current.readyState >= 2) {
          setStreamReady(true);
          setIsCameraReady(true);
        }
      }
    }, 8000); // 8 seconds should be more than enough for camera initialization
    
    return () => clearTimeout(safetyTimeout);
  }, [isInitializing]);

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
          <button onClick={() => {
            // Force clear initialization state
            setIsInitializing(false);
            setIsLoading(false);
            if (videoRef.current && videoRef.current.srcObject) {
              setStreamReady(true);
              setIsCameraReady(true);
              // If video already has content, ensure it's marked as ready
              if (videoRef.current.readyState >= 2) {
                setIsInitialized(true);
              }
            }
          }}>
            Camera Looks Ready? Click Here
          </button>
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
            Recording {formatRecordingTime(recordingTime)}
          </RecordingIndicator>
        )}
      </CameraContainer>
      
      <Controls>
        <Button
          onClick={toggleCamera}
          disabled={isLoading || isRecording}
        >
          {window.innerWidth < 400 ? 'Camera' : 'Switch Camera'}
        </Button>
        
        <Button
          onClick={togglePoseTracking}
          disabled={isLoading || !isCameraReady}
        >
          {isPoseTracking ? 
            (window.innerWidth < 400 ? 'Stop' : 'Stop Tracking') : 
            (window.innerWidth < 400 ? 'Track' : 'Start Tracking')}
        </Button>
        
        <Button
          onClick={toggleRecording}
          disabled={isLoading || !isCameraReady}
          className={isRecording ? 'recording' : ''}
        >
          {isRecording ? 
            (window.innerWidth < 400 ? 'Stop' : 'Stop Recording') : 
            (window.innerWidth < 400 ? 'Record' : 'Start Recording')}
        </Button>
      </Controls>
      
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