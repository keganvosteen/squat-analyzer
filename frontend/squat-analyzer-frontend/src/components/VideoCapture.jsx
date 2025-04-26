// src/components/VideoCapture.jsx
import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import fixWebmDuration from 'webm-duration-fix';
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
  // Set a timeout promise to detect hanging initialization
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('TensorFlow initialization timeout')), 10000);
  });
  
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
    
    // Try WebGL first with timeout protection
    const initPromise = (async () => {
      // Test actual GPU capability before committing to WebGL
      const gpuSupported = await testWebGLCapability();
      
      if (gpuSupported) {
        await tf.setBackend('webgl');
      } else {
        console.warn('WebGL capability test failed, falling back to CPU');
        await tf.setBackend('cpu');
      }
      
      await tf.ready();
      
      // Verify backend is actually working by running a simple operation
      const testTensor = tf.tensor([1, 2, 3]);
      const result = testTensor.square();
      await result.data(); // Force execution to check for runtime errors
      testTensor.dispose();
      result.dispose();
      
      const currentBackend = tf.getBackend();
      console.log(`Using ${currentBackend} backend for TensorFlow.js`);
      
      if (currentBackend === 'webgl') {
        console.log('WebGL version:', tf.env().get('WEBGL_VERSION'));
        console.log('WebGL flags:', {
          'WEBGL_FORCE_F16_TEXTURES': tf.env().get('WEBGL_FORCE_F16_TEXTURES'),
          'WEBGL_PACK': tf.env().get('WEBGL_PACK'),
          'WEBGL_CPU_FORWARD': tf.env().get('WEBGL_CPU_FORWARD'),
          'WEBGL_FLUSH_THRESHOLD': tf.env().get('WEBGL_FLUSH_THRESHOLD')
        });
      }
      
      return true;
    })();
    
    // Race between initialization and timeout
    return await Promise.race([initPromise, timeoutPromise]);
  } catch (error) {
    console.warn('WebGL backend failed, trying CPU:', error);
    
    try {
      // Try CPU backend as fallback
      await tf.setBackend('cpu');
      await tf.ready();
      
      // Verify backend is working
      const testTensor = tf.tensor([1, 2, 3]);
      const result = testTensor.square();
      await result.data();
      testTensor.dispose();
      result.dispose();
      
      console.log('Using CPU backend for TensorFlow.js');
      return true;
    } catch (cpuError) {
      console.error('Failed to initialize TensorFlow backend:', cpuError);
      return false;
    }
  }
};

// Function to test if WebGL is functioning properly
const testWebGLCapability = async () => {
  try {
    // Create a test canvas and get WebGL context
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    if (!gl) {
      console.warn('WebGL not supported');
      return false;
    }
    
    // Try to get extension support
    const extensions = [
      'OES_texture_float',
      'WEBGL_color_buffer_float',
      'EXT_color_buffer_float'
    ];
    
    const supportedExtensions = extensions.filter(ext => gl.getExtension(ext));
    
    // Check if sufficient extensions are supported
    if (supportedExtensions.length < 1) {
      console.warn('Insufficient WebGL extensions for TensorFlow.js');
      return false;
    }
    
    // Check max texture size (need at least 4096 for good performance)
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (maxTextureSize < 2048) {
      console.warn(`WebGL max texture size too small: ${maxTextureSize}`);
      return false;
    }
    
    // Create and run a simple WebGL program to ensure shader compilation works
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `);
    gl.compileShader(vertexShader);
    
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, `
      precision mediump float;
      void main() {
        gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
      }
    `);
    gl.compileShader(fragmentShader);
    
    // Check if shaders compiled successfully
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS) ||
        !gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      console.warn('WebGL shader compilation failed');
      return false;
    }
    
    // Create and link program
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('WebGL program linking failed');
      return false;
    }
    
    // Success - WebGL appears to be functioning properly
    return true;
  } catch (e) {
    console.error('Error testing WebGL capability:', e);
    return false;
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
  max-width: 640px; /* Keep max-width for landscape/desktop */
  margin: 0 auto;
  background-color: #000;
  border-radius: 8px;
  overflow: hidden;
  /* Add aspect-ratio for default landscape */
  aspect-ratio: 16 / 9;

  /* Adjust for portrait screens */
  @media (orientation: portrait) {
    /* Use viewport height for portrait, allow width to adjust */
    height: 75vh; 
    width: auto;
    max-width: 100%; /* Allow full width in portrait */
    aspect-ratio: unset; /* Remove fixed aspect ratio */
  }
`;

const Video = styled.video`
  display: block;
  width: 100%;
  height: 100%; /* Make video fill the container height */
  object-fit: cover; /* Cover the container, cropping if needed */
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
  // Handle invalid input gracefully
  if (typeof totalSeconds !== 'number' || !isFinite(totalSeconds) || totalSeconds < 0) {
    return '00:00';
  }
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
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

// Create specialized frame capture utilities outside of component scope
// to avoid initialization errors
const createFrameCapture = (videoRef, isRecording, frameArray, options = {}) => {
  // Return an object with methods for starting, stopping, and managing frame capture
  return {
    // Start capturing frames from video
    start: function(shouldRecord = true) {
      if (!shouldRecord || !videoRef.current) {
        return;
      }
      
      const captureTimeout = { current: null };
      // Get max frames from options (default to 5)
      const maxFrames = options.maxFrames || 5;
      const captureInterval = options.captureInterval || 300; // ms between captures
      
      const captureOneFrame = () => {
        if (!videoRef.current) return;
        
        try {
          // Create a temporary canvas to capture the video frame
          const tempCanvas = document.createElement('canvas');
          const tempCtx = tempCanvas.getContext('2d');
          
          // Render current video frame
          tempCanvas.width = videoRef.current.videoWidth || 640;
          tempCanvas.height = videoRef.current.videoHeight || 480;
          tempCtx.drawImage(videoRef.current, 0, 0, tempCanvas.width, tempCanvas.height);
          
          // Convert to blob with timestamp
          tempCanvas.toBlob((blob) => {
            if (blob) {
              frameArray.push({
                timestamp: Date.now(),
                blob: blob
              });
              
              // Keep only the recent frames based on maxFrames config
              if (frameArray.length > maxFrames) {
                // Dispose of old blobs properly to prevent memory leaks
                const removed = frameArray.shift();
                if (removed && removed.blob) {
                  // Release the blob reference for garbage collection
                  URL.revokeObjectURL(URL.createObjectURL(removed.blob));
                }
              }
            }
          }, 'image/jpeg', 0.85);
        } catch (frameError) {
          console.warn('[Squat] Frame capture error:', frameError);
        }
        
        // Continue capturing at the configured interval (if still recording)
        if (shouldRecord) {
          captureTimeout.current = setTimeout(captureOneFrame, captureInterval);
        }
      };
      
      // Start the capture process
      captureOneFrame();
      
      return captureTimeout;
    },
    
    // Stop frame capture
    stop: function(timeoutRef) {
      if (timeoutRef && timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        console.debug('[Squat] Frame capture stopped');
      }
    }
  };
};

// Centralized error handling function to standardize error messages and actions
const handleError = (error, context, fallbackAction = null) => {
  const errorPrefix = '[Squat]';
  const errorMessage = error?.message || 'Unknown error occurred';
  const fullMessage = `${errorPrefix} ${context}: ${errorMessage}`;
  
  // Log to console with appropriate level
  console.error(fullMessage, error);
  
  // Perform fallback action if provided
  if (typeof fallbackAction === 'function') {
    fallbackAction();
  }
  
  return fullMessage;
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
  const lastLandmarksRef = useRef(null); // store previous landmarks for smoothing
  const lostTrackingFramesRef = useRef(0); // consecutive low‑confidence frames
  const resettingDetectorRef = useRef(false); // Flag to prevent reset loops

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
      // Add initialization status tracking
      let initAttempts = 0;
      const maxAttempts = 2;
      let success = false;
      
      while (!success && initAttempts < maxAttempts && mounted) {
        try {
          addDebugLog(`TensorFlow initialization attempt ${initAttempts + 1}/${maxAttempts}`);
          success = await initializeTensorFlow();
          
          if (mounted) {
            setTfInitialized(success);
            if (success) {
              setShowTFWarning(false);
              addDebugLog(`TensorFlow initialization succeeded`);
            } else {
              addDebugLog(`TensorFlow initialization failed`);
              if (initAttempts + 1 >= maxAttempts) {
                console.warn("TensorFlow initialization failed after multiple attempts");
                setEnableLivePose(false);
                setError("Pose tracking disabled: your device may not support it.");
              }
            }
          }
        } catch (err) {
          console.error("Failed to initialize TensorFlow:", err);
          addDebugLog(`TensorFlow initialization error: ${err.message}`);
          
          if (mounted) {
            // Only show error on final attempt
            if (initAttempts + 1 >= maxAttempts) {
              setEnableLivePose(false);
              setError("Failed to initialize pose detection. The live tracking feature will be disabled.");
            }
          }
        }
        
        initAttempts++;
        
        // If not successful and not at max attempts, wait before retry
        if (!success && initAttempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Ensure we proceed with camera initialization regardless of TF status
      if (mounted && isInitializing) {
        initializeCamera();
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
          const message = "Could not initialize TensorFlow";
          addDebugLog("TensorFlow initialization failed");
          setError("Could not initialize pose detection. Please try again or check if your device supports it.");
          return;
        }
        
        setTfInitialized(true);
        addDebugLog("TensorFlow initialization succeeded");
      } catch (err) {
        const errorMessage = handleError(err, "TensorFlow initialization failed");
        setError("Failed to initialize pose tracking. This feature will be disabled.");
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
      
      // Track frame processing time to adjust frequency
      let lastFrameTime = 0;
      let frameInterval = isMobile ? 100 : 0; // ms between frames, 0 = every frame
      
      // Function to detect poses and draw with adaptive rate limiting
      const detectAndDraw = async (timestamp) => {
        // Skip if video or canvas is not ready
        if (!videoRef.current || !canvasRef.current || videoRef.current.paused || videoRef.current.ended || resettingDetectorRef.current) {
          poseDetectionIdRef.current = requestAnimationFrame(detectAndDraw);
          return;
        }
        
        // Check if enough time has passed since last frame
        const elapsed = timestamp - lastFrameTime;
        if (frameInterval > 0 && elapsed < frameInterval) {
          poseDetectionIdRef.current = requestAnimationFrame(detectAndDraw);
          return;
        }
        
        // Update last frame time
        lastFrameTime = timestamp;
        
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
        
        try {
          // If detector becomes null (e.g., after re-init request) skip until reinitialized
          if (!detectorRef.current) {
            addDebugLog('Detector not ready, skipping frame');
            poseDetectionIdRef.current = requestAnimationFrame(detectAndDraw);
            return;
          }
          
          // Get video dimensions
          const videoWidth = video.videoWidth;
          const videoHeight = video.videoHeight;
          
          // Performance measurement
          const startTime = performance.now();
          
          // Detect poses
          const poses = await detectorRef.current.estimatePoses(video, {
            flipHorizontal: isFrontFacing // Flip detection results if using front camera
          });
          
          // Measure performance and adjust frameInterval if needed
          const endTime = performance.now();
          const detectionTime = endTime - startTime;
          
          // Dynamically adjust frame rate based on performance
          // If detection is taking too long, reduce frequency
          if (detectionTime > 33) { // More than 30fps
            frameInterval = Math.min(frameInterval + 5, isMobile ? 150 : 100);
          } else if (detectionTime < 16) { // Less than 60fps
            frameInterval = Math.max(frameInterval - 5, isMobile ? 50 : 0);
          }
          
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
            
            // --- Pose tracking constants ---
            const MIN_CONFIDENCE = 0.25;     // relaxed further for robustness
            const SMOOTHING_ALPHA = 0.7;    // EMA factor for landmark smoothing
            const CRITICAL_JOINTS = [ // focus on torso joints that remain visible
              'left_shoulder', 'right_shoulder',
              'left_hip', 'right_hip'
            ];
            
            // refs
            // lastLandmarksRef and lostTrackingFramesRef moved to component scope
            
            // --- Landmark smoothing ---
            if (
              lastLandmarksRef.current &&
              lastLandmarksRef.current.length === pose.keypoints.length
            ) {
              pose.keypoints = pose.keypoints.map((kp, idx) => {
                const prev = lastLandmarksRef.current[idx];
                return {
                  ...kp,
                  x: SMOOTHING_ALPHA * kp.x + (1 - SMOOTHING_ALPHA) * prev.x,
                  y: SMOOTHING_ALPHA * kp.y + (1 - SMOOTHING_ALPHA) * prev.y,
                  score: kp.score,
                  visibility: kp.visibility ?? kp.score,
                };
              });
            }
            lastLandmarksRef.current = pose.keypoints;
            
            // --- Lost‑tracking detection ---
            const goodCritical = pose.keypoints.filter(
              (kp) => CRITICAL_JOINTS.includes(kp.part || kp.name) && (kp.score ?? 0) >= MIN_CONFIDENCE
            ).length;
            if (goodCritical < CRITICAL_JOINTS.length * 0.75) { // allow 1 joint to drop
              lostTrackingFramesRef.current += 1;
            } else {
              lostTrackingFramesRef.current = 0;
            }
            if (lostTrackingFramesRef.current > 60) { // require ~2s of lost tracking
              if (detectorRef.current) {
                console.warn('Tracking lost – resetting detector');
                addDebugLog('Tracking lost – resetting detector');
                if (typeof detectorRef.current.dispose === 'function') {
                  detectorRef.current.dispose();
                }
                detectorRef.current = null;
                lostTrackingFramesRef.current = 0;
                resettingDetectorRef.current = true;
                // Restart after a short backoff to avoid thrashing
                setTimeout(() => {
                  if (!detectorRef.current && videoRef.current && canvasRef.current) {
                    startPoseDetection();
                  }
                }, 2000);
                // continue animation loop while waiting
                poseDetectionIdRef.current = requestAnimationFrame(detectAndDraw);
              }
              return;
            }
            
            drawPose(pose, canvas, ctx);
          }
        } catch (error) {
          // Use centralized error handling
          handleError(error, 'Pose detection error');
          
          // Increase frame interval on error to reduce CPU load
          frameInterval = Math.min(frameInterval + 10, isMobile ? 200 : 150);
        }
        
        // Schedule next frame using the ref
        poseDetectionIdRef.current = requestAnimationFrame(detectAndDraw);
      };
      
      // Start detection loop using the ref
      if (!poseDetectionIdRef.current) {
        poseDetectionIdRef.current = requestAnimationFrame(detectAndDraw);
        setIsPoseTracking(true);
        resettingDetectorRef.current = false; // Clear resetting flag so detector resumes processing after reinit
      }
    } catch (err) {
      const errorMsg = handleError(err, "Error initializing pose detector", () => {
        detectorRef.current = null;
        setEnableLivePose(false);
      });
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
    // Handle invalid input gracefully
    if (typeof seconds !== 'number' || !isFinite(seconds) || seconds < 0) {
      return '00:00';
    }
    const totalSeconds = Math.floor(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Create a ref to hold captured frames
  const captureFramesRef = useRef([]);
  const frameTimeoutRef = useRef({ current: null });
  
  // Configure frame capture options based on device capabilities
  const frameCaptureOptions = useMemo(() => ({
    maxFrames: isMobile ? 3 : 5, // Store fewer frames on mobile
    captureInterval: isMobile ? 500 : 300, // Longer interval on mobile
    quality: isMobile ? 0.75 : 0.85 // Lower quality on mobile
  }), [isMobile]);
  
  // Initialize frame capture utility with the updated options
  const frameCaptureUtil = useMemo(() => 
    createFrameCapture(videoRef, isRecording, captureFramesRef.current, frameCaptureOptions),
  [videoRef, isRecording, frameCaptureOptions]);
  
  // Define all utility functions first
  const startTimer = useCallback(() => {
    // Initialize recording time and start interval
    const formattedTime = '00:00';
    setRecordingTime(formattedTime); // Update UI with formatted time
    
    recordingTimerRef.current = {
      startTime: Date.now(),
      duration: 0,
      formattedTime
    };
    
    setRecordingDuration(0); // Keep state synced for compatibility
    
    // Clear any existing interval first
    if (recordingInterval.current) {
      clearInterval(recordingInterval.current);
      recordingInterval.current = null;
    }
    
    // Create new interval that increments seconds and updates display
    recordingInterval.current = setInterval(() => {
      // Calculate duration based on actual elapsed time
      const elapsed = Math.floor((Date.now() - recordingTimerRef.current.startTime) / 1000);
      
      // Format time for display
      const formatted = formatRecordingTime(elapsed);
      
      // Update ref values
      recordingTimerRef.current.duration = elapsed;
      recordingTimerRef.current.formattedTime = formatted;
      
      // Update UI with formatted time
      setRecordingTime(formatted);
      
      // Keep duration state synced for compatibility
      setRecordingDuration(elapsed);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    // Clear the interval
    if (recordingInterval.current) {
      clearInterval(recordingInterval.current);
      recordingInterval.current = null;
    }
    
    // Reset recording time display
    const formattedTime = '00:00';
    setRecordingTime(formattedTime);
    
    // Reset refs
    recordingTimerRef.current = {
      startTime: 0,
      duration: 0,
      formattedTime
    };
    
    // Reset state for compatibility
    setRecordingDuration(0);
  }, []);

  const startSnapshottingFrames = useCallback(() => {
    // Create or clear our array of canvas snapshots
    mediaRecorderRef.current = mediaRecorderRef.current || {};
    mediaRecorderRef.current.canvasSnapshots = [];
    
    // Create a function to snapshot the current video frame
    const captureVideoSnapshot = () => {
      if (!isRecording || !videoRef.current) {
        return;
      }
      
      try {
        // Only keep up to 5 snapshots to avoid memory issues
        if (mediaRecorderRef.current.canvasSnapshots.length >= 5) {
          mediaRecorderRef.current.canvasSnapshots.shift(); // Remove oldest
        }
        
        const snapshotCanvas = document.createElement('canvas');
        const ctx = snapshotCanvas.getContext('2d');
        
        // Set canvas dimensions to match video
        snapshotCanvas.width = videoRef.current.videoWidth || 640;
        snapshotCanvas.height = videoRef.current.videoHeight || 480;
        
        // Draw video frame to canvas
        ctx.drawImage(videoRef.current, 0, 0, snapshotCanvas.width, snapshotCanvas.height);
        
        // Store the timestamp and canvas (not the blob yet, to save memory)
        mediaRecorderRef.current.canvasSnapshots.push({
          timestamp: Date.now(),
          canvas: snapshotCanvas
        });
        
        console.debug(`[Squat] Captured video snapshot #${mediaRecorderRef.current.canvasSnapshots.length}`);
        
        // Schedule next snapshot if still recording
        if (isRecording) {
          mediaRecorderRef.current.snapshotTimeoutId = setTimeout(captureVideoSnapshot, 1000); // Every second
        }
      } catch (error) {
        console.warn('[Squat] Error capturing video snapshot:', error);
      }
    };
    
    // Start capturing snapshots
    captureVideoSnapshot();
  }, [isRecording, videoRef, mediaRecorderRef]);
  
  const stopSnapshottingFrames = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.snapshotTimeoutId) {
      clearTimeout(mediaRecorderRef.current.snapshotTimeoutId);
      mediaRecorderRef.current.snapshotTimeoutId = null;
      console.debug('[Squat] Stopped video snapshots');
    }
  }, [mediaRecorderRef]);

  const createFallbackRecording = useCallback(async () => {
    try {
      console.debug('[Squat] Creating fallback recording');
      
      // Check if we have valid references to work with
      const hasValidVideoRef = videoRef.current && videoRef.current.videoWidth && videoRef.current.videoHeight;
      
      // Use stored dimensions or fallbacks
      let validWidth = 640;
      let validHeight = 480;
      
      if (hasValidVideoRef) {
        validWidth = videoRef.current.videoWidth;
        validHeight = videoRef.current.videoHeight;
        console.debug(`[Squat] Using video dimensions: ${validWidth}x${validHeight}`);
      } else if (mediaRecorderRef.current && mediaRecorderRef.current.videoMetadata) {
        validWidth = mediaRecorderRef.current.videoMetadata.width || validWidth;
        validHeight = mediaRecorderRef.current.videoMetadata.height || validHeight;
        console.debug(`[Squat] Using stored metadata dimensions: ${validWidth}x${validHeight}`);
      } else {
        console.warn('[Squat] No valid video dimensions available, using defaults');
      }

      // Check if video ref is completely invalid
      if (!hasValidVideoRef) {
        console.warn('[Squat] Cannot create visual fallback - no valid video ref');
        
        // Create a solid color fallback - still better than nothing
        const fallbackCanvas = document.createElement('canvas');
        const fallbackCtx = fallbackCanvas.getContext('2d');
        
        fallbackCanvas.width = validWidth;
        fallbackCanvas.height = validHeight;
        
        // Fill with a blue color to indicate fallback
        fallbackCtx.fillStyle = 'blue';
        fallbackCtx.fillRect(0, 0, fallbackCanvas.width, fallbackCanvas.height);
        
        // Add text to indicate this is a fallback
        fallbackCtx.fillStyle = 'white';
        fallbackCtx.font = '20px Arial';
        fallbackCtx.textAlign = 'center';
        fallbackCtx.fillText('Recording Failed - Fallback Image', fallbackCanvas.width/2, fallbackCanvas.height/2);
        
        // Convert to blob
        return new Promise((resolve) => {
          fallbackCanvas.toBlob((blob) => {
            if (blob) {
              console.debug('[Squat] Created solid color fallback blob');
              const fallbackBlob = blob;
              fallbackBlob._originalType = blob.type;
              // Explicitly mark this as an image for analysis detection
              fallbackBlob._recordingType = 'image';
              fallbackBlob._isFallback = true;
              
              resolve(fallbackBlob);
            } else {
              console.warn('[Squat] Failed to create even a solid color fallback');
              const minimalBlob = new Blob(['fallback_data'], { type: 'text/plain' });
              minimalBlob._recordingType = 'image';
              minimalBlob._isEmptyFallback = true;
              resolve(minimalBlob);
            }
          }, 'image/png', 0.95);
        });
      }

      const fallbackCanvas = document.createElement('canvas');
      const fallbackCtx = fallbackCanvas.getContext('2d');
      
      // Set dimensions to match the video or use fallback dimensions
      fallbackCanvas.width = validWidth;
      fallbackCanvas.height = validHeight;
      
      // Try to draw the current video frame if available
      try {
        if (hasValidVideoRef) {
          fallbackCtx.drawImage(videoRef.current, 0, 0, fallbackCanvas.width, fallbackCanvas.height);
        }
        else {
          // If video ref is not valid, just create a colored rectangle
          fallbackCtx.fillStyle = 'green';
          fallbackCtx.fillRect(0, 0, fallbackCanvas.width, fallbackCanvas.height);
          fallbackCtx.fillStyle = 'white';
          fallbackCtx.font = '20px Arial';
          fallbackCtx.textAlign = 'center';
          fallbackCtx.fillText('Video Snapshot Not Available', fallbackCanvas.width/2, fallbackCanvas.height/2);
        }
      } catch (drawError) {
        console.warn('[Squat] Error drawing video to canvas:', drawError);
        // Fill with a color to indicate failure but still provide something
        fallbackCtx.fillStyle = 'red';
        fallbackCtx.fillRect(0, 0, fallbackCanvas.width, fallbackCanvas.height);
        fallbackCtx.fillStyle = 'white';
        fallbackCtx.font = '20px Arial';
        fallbackCtx.textAlign = 'center';
        fallbackCtx.fillText('Error Creating Video Snapshot', fallbackCanvas.width/2, fallbackCanvas.height/2);
      }
      
      // If we have pose data, try to draw it on the canvas too
      if (canvasRef.current) {
        try {
          fallbackCtx.drawImage(canvasRef.current, 0, 0, fallbackCanvas.width, fallbackCanvas.height);
        } catch (canvasError) {
          console.warn('[Squat] Could not copy pose canvas:', canvasError);
        }
      }
      
      // Convert the canvas to a Blob using toBlob - use PNG format instead of JPEG
      // PNG is more widely supported for analysis
      return new Promise((resolve) => {
        fallbackCanvas.toBlob((blob) => {
          if (blob) {
            console.debug(`[Squat] Created fallback image blob: ${blob.size} bytes with type ${blob.type}`);
            
            try {
              // For analysis purposes, just keep the PNG data
              const analysisBlob = blob;
              
              // Store the original type in case we need it later
              analysisBlob._originalType = blob.type;
              // Explicitly mark this as an image for analysis detection
              analysisBlob._recordingType = 'image';
              analysisBlob._isFallback = true;
              
              resolve(analysisBlob);
            } catch (blobError) {
              console.warn('[Squat] Error creating video blob:', blobError);
              resolve(blob); // Return original blob as fallback
            }
          } else {
            console.warn('[Squat] Failed to create fallback image blob');
            
            // Create a minimal fallback blob so we don't return null
            try {
              const minimalBlob = new Blob(['fallback_data'], { type: 'text/plain' });
              minimalBlob._recordingType = 'image';
              minimalBlob._isEmptyFallback = true;
              resolve(minimalBlob);
            } catch (e) {
              resolve(null);
            }
          }
        }, 'image/png', 0.95);
      });
    } catch (error) {
      console.error('[Squat] Error creating fallback recording:', error);
      
      // Create a minimal fallback blob as a last resort
      try {
        const minimalBlob = new Blob(['error_fallback'], { type: 'text/plain' });
        minimalBlob._recordingType = 'image';
        minimalBlob._isEmptyFallback = true;
        return Promise.resolve(minimalBlob);
      } catch (e) {
        return Promise.resolve(null);
      }
    }
  }, [videoRef, canvasRef, mediaRecorderRef]);

  const createSnapshotFallback = useCallback(async () => {
    if (!mediaRecorderRef.current || !mediaRecorderRef.current.canvasSnapshots || 
        mediaRecorderRef.current.canvasSnapshots.length === 0) {
      console.warn('[Squat] No canvas snapshots available for fallback');
      return null;
    }
    
    // Get the latest snapshot
    const latestSnapshot = mediaRecorderRef.current.canvasSnapshots[mediaRecorderRef.current.canvasSnapshots.length - 1];
    const snapshotCanvas = latestSnapshot.canvas;
    
    console.debug('[Squat] Creating fallback from stored canvas snapshot');
    
    return new Promise((resolve) => {
      snapshotCanvas.toBlob((blob) => {
        if (blob) {
          console.debug(`[Squat] Created snapshot fallback blob: ${blob.size} bytes`);
          const fallbackBlob = blob;
          fallbackBlob._originalType = blob.type;
          fallbackBlob._recordingType = 'image';
          fallbackBlob._isFallback = true;
          fallbackBlob._isSnapshot = true;
          resolve(fallbackBlob);
        } else {
          console.warn('[Squat] Failed to create snapshot blob');
          resolve(null);
        }
      }, 'image/png', 0.95);
    });
  }, [mediaRecorderRef]);

  const processRecordingForAnalysis = useCallback((blob) => {
    if (!blob) return null;
    
    // Clone the blob's metadata if it exists
    const processedBlob = blob;
    
    // Mark the blob type for analysis
    if (!processedBlob._recordingType) {
      processedBlob._recordingType = blob.type.includes('image') ? 'image' : 'video';
    }
    
    // Store the original type in case we need it later
    if (!processedBlob._originalType) {
      processedBlob._originalType = blob.type;
    }
    
    console.debug(`[Squat] Processed blob for analysis: type=${processedBlob.type}, recordingType=${processedBlob._recordingType}`);
    return processedBlob;
  }, []);

  // Define cleanup and stop functions
  const manualCleanup = useCallback(async () => {
    console.warn('[Squat] Performing manual cleanup');

    // Single function to clear all timeouts for better organization
    const clearAllTimeouts = () => {
      // Clear the associated cleanup timeout
      if (mediaRecorderRef.current?.cleanupTimeoutId) {
        clearTimeout(mediaRecorderRef.current.cleanupTimeoutId);
        mediaRecorderRef.current.cleanupTimeoutId = null;
      }
      
      // Clear snapshot timeout
      if (mediaRecorderRef.current?.snapshotTimeoutId) {
        clearTimeout(mediaRecorderRef.current.snapshotTimeoutId);
        mediaRecorderRef.current.snapshotTimeoutId = null;
      }
      
      // Stop frame capture if running
      frameCaptureUtil.stop(frameTimeoutRef.current);
    };
    
    // Clear all timeouts at the beginning
    clearAllTimeouts();

    // Only proceed if we are still in recording state
    if (!isRecording) {
      console.warn('[Squat] Manual cleanup called but already stopped');
      return;
    }
    
    // Ordered fallback strategy with early returns to avoid nested chains
    let finalBlob = null;
    
    // Try using the recorded chunks first (highest quality)
    if (recordedChunksRef.current.length > 0) {
      try {
        const mimeType = mediaRecorderRef.current?.mimeType || 'video/webm';
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        console.debug(`[Squat] Created blob manually: ${blob.size} bytes`);
        finalBlob = processRecordingForAnalysis(blob);
      } catch (blobError) {
        console.error('[Squat] Error creating blob from chunks:', blobError);
        // Continue to next fallback
      }
    }
    
    // If no blob from chunks, try captured frames
    if (!finalBlob && captureFramesRef.current.length > 0) {
      try {
        console.debug(`[Squat] Using ${captureFramesRef.current.length} backup frames in manual cleanup`);
        const lastFrame = captureFramesRef.current[captureFramesRef.current.length - 1];
        if (lastFrame?.blob) {
          console.debug('[Squat] Using last captured frame in manual cleanup');
          finalBlob = processRecordingForAnalysis(lastFrame.blob);
        }
      } catch (frameError) {
        console.error('[Squat] Error using frame capture:', frameError);
        // Continue to next fallback
      }
    }
    
    // If no blob from frames, try canvas snapshots
    if (!finalBlob && mediaRecorderRef.current?.canvasSnapshots?.length > 0) {
      try {
        console.debug(`[Squat] Using canvas snapshots in manual cleanup`);
        const snapshotBlob = await createSnapshotFallback();
        if (snapshotBlob) {
          console.debug('[Squat] Using canvas snapshot in manual cleanup');
          finalBlob = processRecordingForAnalysis(snapshotBlob);
        }
      } catch (snapshotError) {
        console.error('[Squat] Error creating snapshot fallback:', snapshotError);
        // Continue to last fallback
      }
    }
    
    // Last resort: create an emergency fallback image
    if (!finalBlob) {
      try {
        console.warn('[Squat] No reliable recording data, creating emergency fallback');
        const fallbackBlob = await createFallbackRecording();
        if (fallbackBlob && !fallbackBlob._isEmptyFallback) {
          console.debug('[Squat] Using emergency fallback image');
          finalBlob = processRecordingForAnalysis(fallbackBlob);
        }
      } catch (fallbackError) {
        console.error('[Squat] Error creating fallback recording:', fallbackError);
        // No more fallbacks available
        setError('Recording failed completely. Please try again with a supported browser.');
      }
    }
    
    // If we have a blob, send it to the callback
    if (finalBlob && typeof onRecordingComplete === 'function') {
      onRecordingComplete(finalBlob);
    } else if (!finalBlob) {
      setError('Failed to create any usable recording data.');
    }

    // Reset recording state regardless of outcome
    setIsRecording(false);
    stopTimer();
    
    // Clear memory
    recordedChunksRef.current = [];
    if (mediaRecorderRef.current?.canvasSnapshots) {
      mediaRecorderRef.current.canvasSnapshots = [];
    }
  }, [
    isRecording, 
    frameCaptureUtil, 
    frameTimeoutRef,
    recordedChunksRef, 
    captureFramesRef, 
    mediaRecorderRef,
    onRecordingComplete, 
    setError, 
    setIsRecording, 
    stopTimer, // Defined above
    createSnapshotFallback, // Defined above
    createFallbackRecording, // Defined above
    processRecordingForAnalysis // Defined above
  ]);

  const stopFrameCapture = useCallback(async () => {
    console.debug('[Squat] Stopping frame-based recording');
    
    // Stop the frame capture
    frameCaptureUtil.stop(frameTimeoutRef.current);
    
    if (captureFramesRef.current.length === 0) {
      console.warn('[Squat] No frames were captured during recording');
      // Try one last capture
      const lastFrameBlob = await createFallbackRecording();
      
      if (lastFrameBlob && typeof onRecordingComplete === 'function') {
        console.debug('[Squat] Using emergency last frame capture');
        onRecordingComplete(lastFrameBlob);
      } else {
        setError('Recording failed: No frames were captured.');
        // Ensure we stop the timer and reset state even on failure
        setIsRecording(false);
        stopTimer();
      }
    } else {
      console.debug(`[Squat] Collected ${captureFramesRef.current.length} frames during recording`);
      
      // Use the last frame as the recording output
      const lastFrame = captureFramesRef.current[captureFramesRef.current.length - 1];
      
      if (lastFrame && lastFrame.blob && typeof onRecordingComplete === 'function') {
        console.debug('[Squat] Using last captured frame as recording output');
        onRecordingComplete(lastFrame.blob);
      } else {
        setError('Failed to process captured frames.');
        // Ensure we stop the timer and reset state even on failure
        setIsRecording(false);
        stopTimer();
      }
    }
    
    // Reset UI state
    setIsRecording(false);
    stopTimer();
    
    // Clean up stored frames to prevent memory leaks
    while (captureFramesRef.current.length > 0) {
      const frame = captureFramesRef.current.pop();
      if (frame && frame.blob) {
        URL.revokeObjectURL(URL.createObjectURL(frame.blob));
      }
    }
  }, [
    createFallbackRecording, // Defined above
    frameCaptureUtil, 
    onRecordingComplete, 
    setError, 
    setIsRecording, 
    stopTimer, // Defined above
    frameTimeoutRef, 
    captureFramesRef
  ]);

  const handleStopRecording = useCallback(() => {
    try {
      console.debug('[Squat] In handleStopRecording');
      
      // First, stop any frame capture that might be running
      frameCaptureUtil.stop(frameTimeoutRef.current);
      
      // If we have a mediaRecorder in recording or paused state, try to stop it
      if (mediaRecorderRef.current && (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused')) {
        console.debug(`[Squat] MediaRecorder state before stop: ${mediaRecorderRef.current.state}`);
        
        try {
          mediaRecorderRef.current.stop();
          console.debug('[Squat] MediaRecorder.stop() called successfully');
        } catch (stopError) {
          console.error('[Squat] Error stopping MediaRecorder:', stopError);
          
          // If stop fails, manually clean up
          manualCleanup();
        }
      } else {
        console.warn('[Squat] No active MediaRecorder or not in recording state');
        
        // If we have recorded chunks but no active recorder, manually process them
        if (recordedChunksRef.current.length > 0) {
          console.debug('[Squat] Processing recorded chunks without MediaRecorder');
          
          try {
            const mimeType = mediaRecorderRef.current?.mimeType || 'video/webm';
            const recordedBlob = new Blob(recordedChunksRef.current, { type: mimeType });
            
            if (typeof onRecordingComplete === 'function') {
              const processedBlob = processRecordingForAnalysis(recordedBlob);
              onRecordingComplete(processedBlob);
            }
            
            // Reset state
            setIsRecording(false);
            stopTimer();
          } catch (blobError) {
            console.error('[Squat] Error creating blob from chunks:', blobError);
            
            // Try fallback cleanup
            manualCleanup();
          }
        } else {
          // No chunks, try manual cleanup
          manualCleanup();
        }
      }
    } catch (error) {
      console.error('[Squat] Failed to stop recording:', error);
      setError(`Failed to stop recording: ${error.message}`);
      
      // Make sure we reset the recording state
      setIsRecording(false);
      stopTimer();
    }
  }, [
    frameCaptureUtil, 
    frameTimeoutRef, 
    mediaRecorderRef, 
    manualCleanup, // Defined above
    recordedChunksRef, 
    onRecordingComplete, 
    processRecordingForAnalysis, // Defined above
    setIsRecording, 
    stopTimer, // Defined above
    createSnapshotFallback, // Defined above
    createFallbackRecording, // Defined above
    setError
  ]);

  // Define start function after all its dependencies
  const handleStartRecording = useCallback(async () => {
    try {
      console.debug('[Squat] Starting recording...');
      // Check if camera is ready
      if (!isCameraReady || !videoRef.current || !videoRef.current.srcObject) {
        throw new Error('Camera is not ready');
      }
      
      // Store video dimensions early for potential fallback use later
      const videoWidth = videoRef.current.videoWidth || 640;
      const videoHeight = videoRef.current.videoHeight || 480;
      mediaRecorderRef.current = mediaRecorderRef.current || {};
      mediaRecorderRef.current.videoMetadata = {
        width: videoWidth,
        height: videoHeight,
        time: Date.now()
      };
      
      // Get video tracks to confirm we have an active stream
      const videoTracks = videoRef.current.srcObject.getVideoTracks();
      if (!videoTracks || videoTracks.length === 0) {
        throw new Error('No video stream available');
      }
      
      // Check track settings
      const trackSettings = videoTracks[0].getSettings();
      console.debug(`[Squat] Video track settings:`, trackSettings);
      
      // Reset recorded chunks
      recordedChunksRef.current = [];
      
      // Determine supported MIME types
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=h264,opus',
        'video/webm',
        'video/mp4;codecs=h264,aac',
        'video/mp4'
      ];
      
      // Find the first supported MIME type
      let selectedMimeType = '';
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          selectedMimeType = type;
          break;
        }
      }
      
      if (!selectedMimeType) {
        console.warn('[Squat] No supported MIME types found, using default');
        selectedMimeType = 'video/webm';
      }
      
      console.debug(`[Squat] Using MIME type: ${selectedMimeType}`);
      
      // Configure MediaRecorder
      const mediaRecorderOptions = {
        mimeType: selectedMimeType,
        videoBitsPerSecond: isMobile ? 1000000 : 2500000, // Lower bitrate for mobile
      };
      
      // Create MediaRecorder
      mediaRecorderRef.current = new MediaRecorder(videoRef.current.srcObject, mediaRecorderOptions);
      
      // Set up data available handler to save chunks
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          console.debug(`[Squat] Received chunk: ${event.data.size} bytes`);
          recordedChunksRef.current.push(event.data);
        } else {
          console.warn('[Squat] Empty data received from recorder');
        }
      };
      
      // ***** ADDED: Set up onstop handler *****
      mediaRecorderRef.current.onstop = () => {
        console.debug('[Squat] MediaRecorder.onstop event fired.');
        
        // Clear the cleanup timeout if it exists
        if (mediaRecorderRef.current?.cleanupTimeoutId) {
          clearTimeout(mediaRecorderRef.current.cleanupTimeoutId);
          mediaRecorderRef.current.cleanupTimeoutId = null;
          console.debug('[Squat] Cleared manual cleanup timeout.');
        }
        
        // Check if we have chunks
        if (recordedChunksRef.current.length > 0) {
          try {
            // Create the final Blob
            const recordedBlob = new Blob(recordedChunksRef.current, { type: mediaRecorderRef.current.mimeType });
            console.debug(`[Squat] Created final blob: ${recordedBlob.size} bytes, type: ${recordedBlob.type}`);

            // Fix WebM duration metadata before analysis and playback
            if (recordedBlob && recordedBlob.type && recordedBlob.type.startsWith('video/webm')) {
              // Always call onRecordingComplete with a Promise for WebM so parent can await
const fixedBlobPromise = fixWebmDuration(recordedBlob, recordingDuration * 1000)
  .then((fixedBlob) => {
    fixedBlob._originalType = recordedBlob.type;
    fixedBlob._recordingType = 'video';
    console.debug('[Squat] WebM duration fixed. Patched blob size:', fixedBlob.size, 'type:', fixedBlob.type);
    return processRecordingForAnalysis(fixedBlob);
  })
  .catch((err) => {
    console.warn('[Squat] Failed to fix WebM duration, using original blob:', err);
    return processRecordingForAnalysis(recordedBlob);
  });
if (typeof onRecordingComplete === 'function') {
  onRecordingComplete(fixedBlobPromise); // Always a Promise for WebM
}
            } else {
              // Not a WebM video, process as usual
              const processedBlob = processRecordingForAnalysis(recordedBlob);
              if (typeof onRecordingComplete === 'function') {
                onRecordingComplete(processedBlob);
              }
            }
          } catch (blobError) {
            console.error('[Squat] Error creating blob in onstop:', blobError);
            setError('Failed to process recorded video.');
            // Attempt manual cleanup as a fallback if blob creation fails
            manualCleanup();
          }
        } else {
          console.warn('[Squat] MediaRecorder stopped but no recorded chunks found. Triggering manual cleanup.');
          // If no chunks were recorded (e.g., very short recording or error), attempt manual cleanup.
          manualCleanup();
        }
        
        // Reset state after handling stop
        setIsRecording(false);
        stopTimer();
        recordedChunksRef.current = []; // Clear chunks after processing
      };
      
      // ***** ADDED: Set up onerror handler *****
      mediaRecorderRef.current.onerror = (event) => {
        console.error('[Squat] MediaRecorder error:', event.error);
        setError(`Recording error: ${event.error.name} - ${event.error.message}`);
        
        // Clear the cleanup timeout if it exists
        if (mediaRecorderRef.current?.cleanupTimeoutId) {
          clearTimeout(mediaRecorderRef.current.cleanupTimeoutId);
          mediaRecorderRef.current.cleanupTimeoutId = null;
        }
        
        // Attempt manual cleanup on error
        manualCleanup();
        
        // Reset state
        setIsRecording(false);
        stopTimer();
        recordedChunksRef.current = [];
      };
      
      // ***** MOVED/CORRECTED PLACEMENT *****
      // Prepare the arrays for frame capture
      captureFramesRef.current = [];
      
      // Start frame capture using our utility
      frameTimeoutRef.current = frameCaptureUtil.start(true);
      
      // Store the frame capture in the recorder for cleanup later
      mediaRecorderRef.current.captureFrames = captureFramesRef.current;
      mediaRecorderRef.current.frameCapture = frameTimeoutRef.current;
      
      // Start the state updates and timers
      setIsRecording(true);
      startTimer();
      startSnapshottingFrames(); // Start snapshot backup
      // ***** END MOVED SECTION *****
      
      // Set a timeout to ensure we eventually clean up if onstop never fires (use a longer timeout)
      const cleanupTimeout = setTimeout(() => {
        // Check if the recorder is still potentially recording or paused
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
           console.warn('[Squat] MediaRecorder.onstop did not fire after 5 seconds, forcing cleanup'); // Increased timeout
           manualCleanup(); // Call the async cleanup function
         } else {
          // If onstop didn't fire, force cleanup
          console.warn('[Squat] MediaRecorder.onstop did not fire, forcing cleanup');
          manualCleanup();
        }
      }, 5000);  // Increased timeout from 3000 to 5000 ms
      
      // Keep track of this timeout so we can clear it if onstop works
      mediaRecorderRef.current.cleanupTimeoutId = cleanupTimeout;
      
      try {
        // Try starting the recorder normally
        mediaRecorderRef.current.start();
        console.debug('[Squat] MediaRecorder.start() called successfully');
        
        // Request data periodically (important for some browsers)
        setTimeout(() => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.requestData();
          }
        }, 1000);
        
        // Add a check after a short delay to confirm it actually started
        setTimeout(() => {
          if (mediaRecorderRef.current) {
            console.debug(`[Squat] MediaRecorder state after start: ${mediaRecorderRef.current.state}`);
            
            // If not recording, force stop/cleanup
            if (mediaRecorderRef.current.state !== 'recording') {
              console.warn('[Squat] MediaRecorder not in recording state, forcing cleanup');
              
              // Clear the timeout if it's still active
              if (mediaRecorderRef.current.cleanupTimeoutId) {
                clearTimeout(mediaRecorderRef.current.cleanupTimeoutId);
              }
              
              manualCleanup();
            }
          }
        }, 1000);
      } catch (startError) {
        console.error('[Squat] Error starting MediaRecorder:', startError);
        // Clear the timeout and manually clean up
        clearTimeout(cleanupTimeout);
        manualCleanup();
      }
    } catch (error) {
      console.error('[Squat] Error in handleStartRecording:', error);
      setError(`Recording error: ${error.message}`);
      setIsRecording(false);
      stopTimer();
    }
  }, [
    isCameraReady, 
    videoRef, 
    mediaRecorderRef, 
    recordedChunksRef, 
    isMobile, 
    captureFramesRef, 
    frameCaptureUtil, 
    frameTimeoutRef,
    setIsRecording, 
    startTimer, // Defined above
    stopTimer,  // Defined above
    startSnapshottingFrames, // Defined above
    onRecordingComplete, 
    setError, 
    stopTimer,  // Defined above
    createSnapshotFallback, // Defined above
    createFallbackRecording, // Defined above
    processRecordingForAnalysis, // Defined above
    manualCleanup // Defined above
  ]);

  // Define toggle function last as it depends on start/stop
  const toggleRecording = useCallback(() => {
    try {
      console.debug('[Squat] Toggle recording. Current state:', isRecording);
      
      if (isRecording) {
        // If we're using MediaRecorder
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          handleStopRecording();
        } 
        // If we're using frame capture only
        else if (mediaRecorderRef.current && mediaRecorderRef.current.frameCapture) {
          stopFrameCapture(); // Use the dedicated stop function
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
  }, [
    isRecording, 
    mediaRecorderRef, 
    handleStopRecording, // Defined above
    stopFrameCapture, // Defined above
    setIsRecording, 
    stopTimer, // Defined above
    isPoseTracking, 
    startPoseDetection, // Assumed defined earlier 
    setIsPoseTracking, 
    handleStartRecording, // Defined above
    setError
  ]);

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
        if ((keypoint.score ?? 0) > 0.3) { // Only draw keypoints with confidence above threshold
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
        if (
          keypoints &&
          keypoints.length === 2 &&
          (keypoints[0].score ?? 0) > 0.3 &&
          (keypoints[1].score ?? 0) > 0.3
        ) {
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
      
      if (keyPointA && keyPointB && (keyPointA.score ?? 0) > 0.3 && (keyPointB.score ?? 0) > 0.3) {
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
      'right_eye': 'yellow',
      'left_ear': 'yellow',
      'right_ear': 'yellow',
      
      // Upper body
      'left_shoulder': 'green',
      'right_shoulder': 'green',
      'left_elbow': 'green',
      'right_elbow': 'green',
      'left_wrist': 'green',
      'right_wrist': 'green',
      
      // Lower body
      'left_hip': 'blue',
      'right_hip': 'blue',
      'left_knee': 'blue',
      'right_knee': 'blue',
      'left_ankle': 'blue',
      'right_ankle': 'blue'
    };
    
    // Handle formats without underscores (like "lefteye" instead of "left_eye")
    const withoutUnderscore = standardizedPart.replace(/_/g, '');
    const withUnderscore = withoutUnderscore.replace(/(?<=[a-z])[a-z]/g, '_$&');
    
    // Return the color for the standardized part name or white as default
    return colors[standardizedPart] || colors[withoutUnderscore] || colors[withUnderscore] || 'white';
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
            {/* Use the formatted recordingTime state directly */}
            Recording {recordingTime}
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
}

export default VideoCapture;