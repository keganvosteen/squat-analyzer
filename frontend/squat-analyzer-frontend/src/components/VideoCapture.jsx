// src/components/VideoCapture.jsx
import React, { useRef, useEffect, useState } from 'react';
import { Camera, RefreshCw, Maximize2, Minimize2, Circle, Square } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

const VideoCapture = ({ onFrameCapture, onRecordingComplete }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const sessionIdRef = useRef(uuidv4());
  const [skeletonImage, setSkeletonImage] = useState(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const [cameraFacing, setCameraFacing] = useState('environment');
  const [squatCount, setSquatCount] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingStartTime, setRecordingStartTime] = useState(null);
  const [feedbackData, setFeedbackData] = useState([]);
  
  // Initialize video stream
  useEffect(() => {
    async function setupVideo() {
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
        
        const constraints = {
          video: { 
            facingMode: cameraFacing,
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        
        // Setup media recorder for video capture with high quality settings
        const options = {
          audioBitsPerSecond: 0, // No audio
          videoBitsPerSecond: 2500000, // 2.5 Mbps
        };
        
        if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
          options.mimeType = 'video/webm;codecs=vp9';
        } else if (MediaRecorder.isTypeSupported('video/webm')) {
          options.mimeType = 'video/webm';
        }
        
        mediaRecorderRef.current = new MediaRecorder(stream, options);
        
        mediaRecorderRef.current.ondataavailable = handleDataAvailable;
        mediaRecorderRef.current.onstop = handleRecordingStop;
        
      } catch (error) {
        console.error('Error accessing camera:', error);
      }
    }
    
    setupVideo();
    
    // Reset session in backend
    fetch('https://squat-analyzer-backend.onrender.com/reset-session', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ sessionId: sessionIdRef.current }),
      mode: 'cors',
      credentials: 'omit'
    }).catch(error => {
      console.error('Failed to reset session on backend, continuing locally:', error);
      // If backend reset fails, initialize local state
      setSquatCount(0);
      setFeedbackData([]);
    });
    
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraFacing]);

  // Frame capture and analysis loop while recording
  useEffect(() => {
    let interval;
    if (isRecording) {
      setRecordingStartTime(Date.now());
      setFeedbackData([]);
      
      // Start video recording - one continuous recording until manually stopped
      recordedChunksRef.current = [];
      mediaRecorderRef.current?.start();
      
      interval = setInterval(() => {
        // Update recording timer
        setRecordingTime(Math.floor((Date.now() - recordingStartTime) / 1000));
        
        // Capture and analyze frame
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpeg');
        
        fetch('https://squat-analyzer-backend.onrender.com/analyze-squat', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ 
            image: imageData,
            sessionId: sessionIdRef.current
          }),
          mode: 'cors',
          credentials: 'omit'
        })
        .then(response => response.json())
        .then(data => {
          // Update skeleton image
          setSkeletonImage(data.skeletonImage);
          
          // Update squat count
          if (data.squatCount !== undefined) {
            setSquatCount(data.squatCount);
          }
          
          // Store feedback data with timestamp
          const timestamp = Date.now() - recordingStartTime;
          setFeedbackData(prev => [...prev, { ...data, timestamp }]);
          
          // Pass frame data to parent component if callback exists
          if (onFrameCapture) onFrameCapture(data);
        })
        .catch(console.error);
      }, 200); // Analyze frames at 5fps
    } else {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    }
    
    return () => {
      clearInterval(interval);
      if (isRecording && mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, [isRecording, onFrameCapture, recordingStartTime]);

  // Handler for media recorder data chunks
  const handleDataAvailable = (event) => {
    if (event.data.size > 0) {
      recordedChunksRef.current.push(event.data);
      console.log(`Received data chunk: ${event.data.size} bytes`);
    }
  };

  // Handler for when recording stops
  const handleRecordingStop = () => {
    // Create video blob from recorded chunks
    const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
    const videoUrl = URL.createObjectURL(blob);
    
    // Get final session data from backend
    fetch(`https://squat-analyzer-backend.onrender.com/get-session-data?sessionId=${sessionIdRef.current}`, {
      method: 'GET',
      headers: { 
        'Accept': 'application/json'
      },
      mode: 'cors',
      credentials: 'omit'
    })
      .then(response => response.json())
      .then(sessionData => {
        // Combine all data and pass to parent component
        if (onRecordingComplete) {
          onRecordingComplete({
            videoUrl,
            feedbackData,
            squatCount: sessionData.squatCount,
            squatTimings: sessionData.squatTimings,
            sessionId: sessionIdRef.current,
            duration: recordingTime
          });
        }
      })
      .catch(error => {
        console.error('Failed to get session data from backend, using local data:', error);
        // Use local data if backend fails
        if (onRecordingComplete) {
          onRecordingComplete({
            videoUrl,
            feedbackData,
            squatCount: squatCount,
            squatTimings: [],
            sessionId: sessionIdRef.current,
            duration: recordingTime
          });
        }
      });
      
    // Reset recording timer
    setRecordingTime(0);
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
      setRecordingStartTime(Date.now());
      // Generate new session ID for this recording
      sessionIdRef.current = uuidv4();
      // Reset backend session
      fetch('https://squat-analyzer-backend.onrender.com/reset-session', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
        mode: 'cors',
        credentials: 'omit'
      }).catch(error => {
        console.error('Failed to reset session on backend, continuing locally:', error);
        // Will continue with local tracking for this recording
      });
    }
  };
  
  // Toggle fullscreen mode
  const toggleFullscreen = () => setFullscreen(prev => !prev);
  
  // Format recording time as mm:ss
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  return (
    <div className={`relative ${fullscreen || isRecording ? 'fixed inset-0 z-50' : 'w-full h-full'} bg-black overflow-hidden`}>
      {/* Main video display */}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted
        className="absolute inset-0 object-cover w-full h-full z-0" 
      />
      
      {/* Canvas for frame capture (hidden) */}
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Overlay skeleton image when available */}
      {skeletonImage && (
        <img 
          src={skeletonImage} 
          alt="Pose skeleton" 
          className="absolute inset-0 object-cover w-full h-full z-10 pointer-events-none" 
        />
      )}

      {/* Recording duration */}
      {isRecording && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-50 px-4 py-1 rounded-full text-white z-20 font-mono">
          <span className="animate-pulse text-red-500 mr-2">●</span>
          {formatTime(recordingTime)}
        </div>
      )}

      {/* Recording indicator */}
      {isRecording && (
        <div className="absolute top-4 left-4 flex items-center gap-2 bg-black bg-opacity-50 px-3 py-1 rounded-full text-white z-20">
          <span className="animate-ping h-3 w-3 bg-red-500 rounded-full"></span>
          REC
        </div>
      )}

      {/* Squat counter */}
      {(isRecording || skeletonImage) && (
        <div className="absolute top-4 right-4 bg-black bg-opacity-50 px-3 py-1 rounded-full text-white z-20">
          🏋️ {squatCount}
        </div>
      )}

      {/* Controls container */}
      <div className="absolute bottom-6 left-0 w-full flex justify-center items-center gap-6 z-20">
        {/* Camera toggle button */}
        <button
          onClick={toggleCamera}
          className="bg-black bg-opacity-50 p-4 rounded-full text-white hover:bg-opacity-70 transition-all"
          aria-label="Toggle camera"
        >
          <RefreshCw size={28} />
        </button>
        
        {/* Record/stop button */}
        <button
          onClick={handleRecording}
          className={`p-5 rounded-full flex items-center justify-center transition-all ${
            isRecording ? 'bg-white' : 'bg-red-500'
          }`}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
        >
          {isRecording ? (
            <Square size={28} className="text-black" />
          ) : (
            <Circle size={28} className="text-white" />
          )}
        </button>
        
        {/* Fullscreen toggle button */}
        <button
          onClick={toggleFullscreen}
          className="bg-black bg-opacity-50 p-4 rounded-full text-white hover:bg-opacity-70 transition-all"
          aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {fullscreen ? <Minimize2 size={28} /> : <Maximize2 size={28} />}
        </button>
      </div>
    </div>
  );
};

export default VideoCapture;
