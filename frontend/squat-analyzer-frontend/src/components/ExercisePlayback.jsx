// src/components/ExercisePlayback.jsx
import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Play, Pause, SkipForward, SkipBack, AlertTriangle, CheckCircle, Info, Maximize2, Minimize2, ArrowLeft, ArrowRight } from 'lucide-react';
import styled from 'styled-components';

// Thresholds for form status colours
import { SPINE_THRESH, DEPTH_THRESH } from '../thresholds.js';

// Map status → color (Tailwind palette refs)
const statusColour = (status) => {
  if (status === 'good') return '#22c55e'; // green-500
  if (status === 'warn') return '#facc15'; // yellow-400
  return '#ef4444'; // red-500
};

// Styled components
const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.5rem;
  gap: 0.5rem;
  max-width: 1200px;
  margin: 0 auto;
`;

const VideoContainer = styled.div`
  position: relative;
  max-width: 900px;
  max-height: 75vh;
  margin: 0 auto;
  overflow: hidden;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  ${(props) =>
    props.$isFullscreen &&
    `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1000;
  `}
`;

const Video = styled.video`
  width: 100%;
  height: auto;
  display: block;
  border-radius: 8px;
  
  /* Fix for mobile video rotation issues */
  object-fit: contain;
  max-height: 75vh;
`;

const CanvasOverlay = styled.canvas`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
`;

const Controls = styled.div`
  display: flex;
  gap: 0.5rem;
  margin: 0.25rem 0;
  align-items: center;
`;

const ControlsWrapper = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 0.35rem;
`;

const Button = styled.button`
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  background: #007bff;
  color: white;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #0056b3;
  }

  &:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
`;

const AnalysisPanel = styled.div`
  width: 100%;
  max-width: 900px;
  padding: 0.5rem;
  background: #f8f9fa;
  border-radius: 8px;
  margin-top: 0.5rem;
`;

const StatBox = styled.div`
  background: white;
  padding: 1rem;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  margin-bottom: 0.5rem;
`;

const StatTitle = styled.h3`
  margin: 0 0 0.5rem 0;
  color: #333;
`;

const StatValue = styled.div`
  font-size: 1.5rem;
  font-weight: bold;
  color: #007bff;
`;

const StatLabel = styled.div`
  font-size: 0.875rem;
  color: #666;
  margin-bottom: 0.25rem;
`;

const ErrorMessage = styled.div`
  color: #dc2626;
  padding: 0.5rem;
  background-color: #fee2e2;
  border-radius: 0.375rem;
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const FeedbackList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

const FeedbackItem = styled.li`
  padding: 0.5rem;
  margin-bottom: 0.5rem;
  background: white;
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
`;

const FeedbackSection = styled.div`
  margin-top: 0.5rem;
`;

const FeedbackTip = styled.div`
  padding: 0.75rem;
  margin: 0.5rem 0;
  background: white;
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
`;

const OverlayCanvas = styled.canvas`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
`;

const DebugInfo = styled.pre`
  margin-top: 0.5rem;
  padding: 10px;
  background-color: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 12px;
  max-height: 150px;
  overflow-y: auto;
  width: 100%;
  white-space: pre-wrap;
  display: ${props => props.$show ? 'block' : 'none'};
`;

const TimeLabel = styled.span`
  font-variant-numeric: tabular-nums;
  color: #111;
  min-width: 48px;
  text-align: center;
`;

const Scrubber = styled.input.attrs({ type: 'range' })`
  flex: 1;
  -webkit-appearance: none;
  height: 6px;
  border-radius: 3px;
  background: #e0e0e0;
  outline: none;
  cursor: pointer;
  position: relative;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #007bff;
    cursor: pointer;
    margin-top: -3px;
  }

  &::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #007bff;
    cursor: pointer;
    border: none;
  }
`;

const ExercisePlayback = ({ videoUrl, videoBlob, analysisData, isLoading = false, error: externalError = null, onBack }) => {
  console.log("ExercisePlayback Component");
  console.log("Video URL:", videoUrl);
  console.log("Video Blob type:", videoBlob?.type);
  console.log("Analysis data:", analysisData);
  
  const containerRef = useRef(null);
  const videoContainerRef = useRef(null);
  const videoRef = useRef(null);
  const timelineRef = useRef(null);
  const canvasRef = useRef(null);
  
  const [isPlaying, setIsPlaying] = useState(false);

  // Sync isPlaying state with the underlying video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.play().catch(err => {
        console.warn('Video play() failed from isPlaying effect:', err);
        setIsPlaying(false);
      });
    } else {
      if (!video.paused) video.pause();
    }
  }, [isPlaying]);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeFeedback, setActiveFeedback] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoverPosition, setHoverPosition] = useState(null);
  const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);
  const [error, setError] = useState(externalError);
  const debugInfoRef = useRef({}); // new ref to avoid re-renders
  const [showDebug, setShowDebug] = useState(false);
  const [videoOrientation, setVideoOrientation] = useState(null);
  
  // Track canvas dimensions for debugging
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 });
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
  
  // Track if we're using an image instead of a video for playback
  const [isImagePlayback, setIsImagePlayback] = useState(false);
  
  // States to track loading progress for analysis
  const [loadingStartTime, setLoadingStartTime] = useState(null);
  const [elapsedLoadingTime, setElapsedLoadingTime] = useState(0);
  
  // Precompute frame timestamps for fast lookup
  const frameTimestamps = useMemo(() => analysisData?.frames?.map(f => f.timestamp) || [], [analysisData]);

  // Optimized binary search helper with caching for better performance
  const frameIndexCache = useRef({});
  const findFrameIndex = useCallback((ts) => {
    // Round to 2 decimal places for caching
    const roundedTs = Math.round(ts * 100) / 100;
    
    // Check cache first
    if (frameIndexCache.current[roundedTs] !== undefined) {
      return frameIndexCache.current[roundedTs];
    }
    
    // If no frames or zero duration, default to first frame
    if (frameTimestamps.length === 0) return 0;
    
    // Binary search
    let lo = 0, hi = frameTimestamps.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (frameTimestamps[mid] === roundedTs) {
        frameIndexCache.current[roundedTs] = mid;
        return mid;
      }
      if (frameTimestamps[mid] < roundedTs) lo = mid + 1; else hi = mid - 1;
    }
    
    const lower = Math.max(0, lo - 1);
    const higher = Math.min(frameTimestamps.length - 1, lo);
    
    // Choose whichever timestamp is closer to the target
    let result;
    if (Math.abs(frameTimestamps[higher] - roundedTs) < Math.abs(roundedTs - frameTimestamps[lower])) {
      result = higher;
    } else {
      result = lower;
    }
    
    // Cache the result
    frameIndexCache.current[roundedTs] = result;
    return result;
  }, [frameTimestamps]);

  // --- Compute global score arrays and merged scores ---
  const kneeDepthScores = analysisData?.frames
    ?.map((f) => f.scores?.knee_depth)
    ?.filter((s) => s !== undefined);
  const shoulderScores = analysisData?.frames
    ?.map((f) => f.scores?.shoulder_align)
    ?.filter((s) => s !== undefined);
  const hipFlexionScores = analysisData?.frames
    ?.map((f) => f.scores?.hip_flexion)
    ?.filter((s) => s !== undefined);
  const pelvicTiltScores = analysisData?.frames
    ?.map((f) => f.scores?.pelvic_tilt)
    ?.filter((s) => s !== undefined);

  const mergedGlobalScores = useMemo(() => {
    return {
      kneeDepthScore: kneeDepthScores?.length
        ? Math.max(...kneeDepthScores)
        : undefined,
      shoulderAlignmentScore: shoulderScores?.length
        ? Math.min(...shoulderScores)
        : 100.0, // Default perfect when no data
      hipFlexionScore: hipFlexionScores?.length
        ? Math.max(...hipFlexionScores)
        : undefined,
      pelvicTiltScore: pelvicTiltScores?.length
        ? Math.min(...pelvicTiltScores)
        : 100.0,
      totalScore:
        kneeDepthScores?.length &&
        shoulderScores?.length &&
        hipFlexionScores?.length &&
        pelvicTiltScores?.length
          ? Math.max(...kneeDepthScores) * 0.4 +
            Math.min(...shoulderScores) * 0.3 +
            Math.max(...hipFlexionScores) * 0.2 +
            Math.min(...pelvicTiltScores) * 0.1
          : undefined,
    };
  }, [kneeDepthScores, shoulderScores, hipFlexionScores, pelvicTiltScores]);

  // Use effect to check blob type and set image/video playback mode
  useEffect(() => {
    // Reset image playback state initially
    setIsImagePlayback(false);
    
    if (videoBlob) {
      console.log(`[Playback Setup] Received blob. Type: ${videoBlob.type}, Size: ${videoBlob.size}, Custom Type: ${videoBlob._recordingType}`);
      if (videoBlob.type.startsWith('image/') || videoBlob._recordingType === 'image') {
        console.log("[Playback Setup] Setting mode to IMAGE playback.");
        setIsImagePlayback(true);
      } else {
        console.log("[Playback Setup] Setting mode to VIDEO playback.");
        setIsImagePlayback(false);
      }
    } else {
      console.log("[Playback Setup] No videoBlob present.");
    }

    // The logic to create a fallback URL if videoUrl is missing is removed.
    // App.jsx is now responsible for providing videoUrl.
    // If videoUrl is null/undefined here, something is wrong upstream.
    if (!videoUrl && videoBlob) {
        console.error("[Playback Setup] FATAL: videoBlob exists but videoUrl is missing from props! Playback cannot proceed.");
        setError("Internal error: Failed to prepare video for playback.");
    }
    
  }, [videoBlob, videoUrl, setError]); // Added setError dependency

  // Track loading progress for analysis
  useEffect(() => {
    if (isLoading) {
      const start = Date.now();
      setLoadingStartTime(start);
      setElapsedLoadingTime(0);
      const intervalId = setInterval(() => {
        setElapsedLoadingTime(Date.now() - start);
      }, 200);
      return () => clearInterval(intervalId);
    } else {
      setLoadingStartTime(null);
      setElapsedLoadingTime(0);
    }
  }, [isLoading]);

  // Toggle debug display with double-click
  const toggleDebug = () => {
    setShowDebug(prev => !prev);
  };
  
  // Check if we have valid analysis data
  const hasAnalysisData = analysisData && 
                        Array.isArray(analysisData.frames) && 
                        analysisData.frames.length > 0;
                        
  // Log hasAnalysisData state for debugging
  useEffect(() => {
    if (analysisData) {
      console.log('[Debug] hasAnalysisData set to:', hasAnalysisData);
      console.log('[Debug] Analysis frames count:', analysisData.frames?.length || 0);
    }
  }, [analysisData, hasAnalysisData]);

  // Define drawing and coordinate functions BEFORE the useEffect that uses them
  // Transform coordinates based on video orientation and apply scaling
  const transformCoordinates = useCallback((x, y, canvasWidth, canvasHeight, isPortrait = false, _landmarkIndex = -1) => {
    // Validate input
    if (typeof x !== 'number' || typeof y !== 'number') {
      console.warn('[Overlay] Invalid coordinates received:', x, y);
      return { x: 0.5, y: 0.5 }; // fallback to centre
    }

    // If coordinates are in pixel space (>1) convert to 0-1 range
    let normalizedX = x;
    let normalizedY = y;
    if (x > 1 || y > 1) {
      normalizedX = x / canvasWidth;
      normalizedY = y / canvasHeight;
    }

    // Improved normalization to handle various input ranges
    // Some pose estimators output values in [0,1], others in [0,width/height]
    if (normalizedX < 0 || normalizedX > 1 || normalizedY < 0 || normalizedY > 1) {
      console.log('[Overlay] Normalizing out-of-range coordinates:', normalizedX, normalizedY);
      normalizedX = normalizedX < 0 ? 0 : normalizedX > 1 ? normalizedX / canvasWidth : normalizedX;
      normalizedY = normalizedY < 0 ? 0 : normalizedY > 1 ? normalizedY / canvasHeight : normalizedY;
    }

    // Clamp to [0,1]
    normalizedX = Math.max(0, Math.min(1, normalizedX));
    normalizedY = Math.max(0, Math.min(1, normalizedY));

    // Apply rotation for portrait videos (90° clockwise)
    if (isPortrait) {
      const tmpX = normalizedX;
      normalizedX = normalizedY;
      normalizedY = 1 - tmpX;
    }

    return { x: normalizedX, y: normalizedY };
  }, []);

  // Draw overlays on canvas - MEMOIZED with useCallback and optimized for performance
  const drawOverlays = useCallback((ctx, time) => {
    if (!ctx || !ctx.canvas) {
      return; // Silent fail for better performance
    }
    
    if (!hasAnalysisData) {
      return; // Silent fail for better performance
    }

    // Properly clear the canvas before drawing
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // Only update debug info if in debug mode
    if (showDebug) {
      debugInfoRef.current = {
        currentTime: time.toFixed(2),
        canvasWidth: ctx.canvas.width,
        canvasHeight: ctx.canvas.height,
        videoWidth: videoRef.current?.videoWidth || 0,
        videoHeight: videoRef.current?.videoHeight || 0,
        frameCount: analysisData.frames.length,
        time,
      };
    }

    // Determine if video is in portrait (cached for performance)
    const isPortrait = videoOrientation === 'portrait';

    // Cache values we'll use repeatedly
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;
    const videoDuration = videoRef.current?.duration || 0;
    const lastAnalysisTs = analysisData.frames[analysisData.frames.length - 1].timestamp;
    
    // Find current frame index quickly with our optimized function
    let currentFrameIndex = findFrameIndex(time);

    // If analysis timestamps cover most of the video, use timestamp matching; otherwise use proportional mapping
    const analysisCoverage = lastAnalysisTs / (videoDuration || 1);
    if (videoDuration > 0 && analysisCoverage < 0.9) {
      // Proportional mapping fallback across whole video
      const ratio = Math.min(time / videoDuration, 1);
      currentFrameIndex = Math.floor(ratio * (analysisData.frames.length - 1));
    } else {
      // Timestamp search
      const adjustedTime = time;
      for (let i = 0; i < analysisData.frames.length; i++) {
        if (analysisData.frames[i].timestamp <= adjustedTime) {
          currentFrameIndex = i;
        } else {
          break;
        }
      }
      if (currentFrameIndex === -1) currentFrameIndex = 0;
      // If we've reached the last analysis frame but video keeps playing, fallback to proportional mapping to avoid freeze
      if (currentFrameIndex === analysisData.frames.length - 1 && adjustedTime - lastAnalysisTs > 0.05 && videoDuration > 0) {
        const ratio = Math.min(time / videoDuration, 1);
        currentFrameIndex = Math.floor(ratio * (analysisData.frames.length - 1));
      }
    }

    if (currentFrameIndex < 0 || currentFrameIndex >= analysisData.frames.length) return;

    const frameData = analysisData.frames[currentFrameIndex];

    // Interpolate with next frame if available for smoother motion
    let blendedKeypoints = frameData.keypoints || frameData.landmarks || [];
    if (currentFrameIndex < analysisData.frames.length - 1) {
      const nextFrame = analysisData.frames[currentFrameIndex + 1];
      const nextTs = nextFrame.timestamp;
      const currTs = frameData.timestamp;
      const span = nextTs - currTs;
      if (span > 0) {
        const ratio = Math.min(Math.max((time - currTs) / span, 0), 1);
        if (frameData.keypoints && nextFrame.keypoints && frameData.keypoints.length === nextFrame.keypoints.length) {
          blendedKeypoints = frameData.keypoints.map((kp, idx) => {
            const kp2 = nextFrame.keypoints[idx];
            const lerp = (a, b) => a + (b - a) * ratio;
            return {
              ...kp,
              x: lerp(kp.x, kp2.x),
              y: lerp(kp.y, kp2.y),
              visibility: lerp(kp.visibility ?? 1, kp2.visibility ?? 1),
            };
          });
        }
      }
    }

    // Check if landmarks exist and are in expected format
    if (!frameData.landmarks) {
      if (window && window.DEBUG_OVERLAY) console.error('[Debug] No landmarks in frame data!');
    } else {
      if (window && window.DEBUG_OVERLAY) {
        // console.log('[Debug] Landmarks count:', frameData.landmarks.length);
        // console.log('[Debug] First landmark sample:', frameData.landmarks[0]);
      }
    }
    
    // Debugging
    // if (window && window.DEBUG_OVERLAY) {
    //   console.log(`Using frame ${currentFrameIndex} at time ${adjustedTime}s, frame timestamp: ${frameData.timestamp}s`);
    // }

    const spineConnections = [
      // Torso (spine)
      [11, 12], // shoulders
      [11, 23], [12, 24], // shoulder→hip
      [23, 24], // hips
    ];

    const legConnections = [
      // Legs
      [23, 25], [25, 27], [27, 31], // left
      [24, 26], [26, 28], [28, 32], // right
    ];

    const armConnections = [
      // Arms (remain white)
      [11, 13], [13, 15], // left
      [12, 14], [14, 16], // right
    ];

    // DEBUG: Log expected data structure for connections
    // if (window && window.DEBUG_OVERLAY) {
    //   console.log('[Debug] Connection groups:', {
    //     spine: spineConnections,
    //     legs: legConnections,
    //     arms: armConnections
    //   });
    // }

    const drawConnGroup = (connectionsArr, stroke) => {
      // Set stroke style only once
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      
      // Check keypoints vs landmarks naming
      if (!frameData.keypoints && frameData.landmarks) {
        frameData.keypoints = frameData.landmarks;
      }
      
      // Bail early if no keypoints
      if (!frameData.keypoints || !Array.isArray(frameData.keypoints)) {
        return;
      }
      
      // Draw each connection as a separate stroke
      connectionsArr.forEach(([i, j]) => {
        // Skip invalid indices
        if (i >= frameData.keypoints.length || j >= frameData.keypoints.length) {
          return;
        }
        
        const l1 = blendedKeypoints[i];
        const l2 = blendedKeypoints[j];
        
        // Skip missing or low-confidence points
        if (!l1 || !l2 || 
            typeof l1.x !== 'number' || typeof l1.y !== 'number' ||
            typeof l2.x !== 'number' || typeof l2.y !== 'number') {
          return;
        }
        
        // Skip low visibility points
        const vis1 = l1.visibility ?? l1.score ?? 1;
        const vis2 = l2.visibility ?? l2.score ?? 1;
        if (vis1 < 0.5 || vis2 < 0.5) {
          return;
        }
        
        // Transform coordinates to canvas space
        const p1 = transformCoordinates(l1.x, l1.y, canvasWidth, canvasHeight, isPortrait);
        const p2 = transformCoordinates(l2.x, l2.y, canvasWidth, canvasHeight, isPortrait);
        
        // Skip invalid or edge points
        if (p1.x < 0.01 || p1.x > 0.99 || p1.y < 0.01 || p1.y > 0.99 ||
            p2.x < 0.01 || p2.x > 0.99 || p2.y < 0.01 || p2.y > 0.99) {
          return;
        }

        // Draw a single clear line
        const x1 = Math.round(p1.x * canvasWidth);
        const y1 = Math.round(p1.y * canvasHeight);
        const x2 = Math.round(p2.x * canvasWidth);
        const y2 = Math.round(p2.y * canvasHeight);
        
        // Use a clean path for each line
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      });
    };

    const spineColor = statusColour(frameData.status?.spine || 'warn');
    const kneeColor = statusColour(frameData.status?.knee || 'warn');

    drawConnGroup(spineConnections, spineColor);
    drawConnGroup(legConnections, kneeColor);
    drawConnGroup(armConnections, 'white');

    // Draw feedback arrows - NEW VERSION (from video sides to landmarks)
    if (frameData.arrows && Array.isArray(frameData.arrows)) {
      frameData.arrows.forEach((arrow) => {
        const { end, color = 'yellow', message = '' } = arrow || {};
        if (!end) return;

        // Transform target landmark coordinates
        const targetPoint = transformCoordinates(end.x, end.y, ctx.canvas.width, ctx.canvas.height, isPortrait);
        const targetX = targetPoint.x * ctx.canvas.width;
        const targetY = targetPoint.y * ctx.canvas.height;
        
        // Determine which side of the video to place the label and start the arrow
        const canvasWidth = ctx.canvas.width;
        const canvasHeight = ctx.canvas.height;
        let startX, startY;
        
        // Create column alignment points for overlay box (right edge)
        const overlayLabel = canvasWidth - 20;
        const overlayValue = canvasWidth - 20; // right edge for alignment

        // Calculate height needed for all rows with extra padding
        const rowCount = 9; // Total number of rows including scores and measurements
        const bgHeight = (rowCount * 25) + 15; // Add padding at bottom to ensure last row is fully visible
        
        // Draw semi-transparent background (sized to content)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(
          canvasWidth - 20,
          0,
          20,
          bgHeight // background box with exact height
        );

        // --- Total Squat Score ---
        ctx.fillStyle = 'white';
        ctx.textAlign = 'left';
        ctx.fillText('Total Squat Score:', overlayLabel, 30);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffd700';
        ctx.fillText(`${mergedGlobalScores.totalScore !== undefined ? mergedGlobalScores.totalScore.toFixed(1) : 'N/A'}`, overlayValue, 30);
        
        // --- Depth Score ---
        ctx.fillStyle = 'white';
        ctx.textAlign = 'left';
        ctx.fillText('Depth Score:', overlayLabel, 55);
        ctx.textAlign = 'right';
        ctx.fillStyle = colorFor(depthScore);
        ctx.fillText(`${depthScore !== undefined ? depthScore.toFixed(1) : 'N/A'}`, overlayValue, 55);
        
        // --- Shoulder Alignment Score ---
        ctx.fillStyle = 'white';
        ctx.textAlign = 'left';
        ctx.fillText('Shoulder Score:', overlayLabel, 80);
        ctx.textAlign = 'right';
        ctx.fillStyle = colorFor(shoulderScore);
        ctx.fillText(`${shoulderScore !== undefined ? shoulderScore.toFixed(1) : 'N/A'}`, overlayValue, 80);
        
        // --- Hip Flexion Score ---
        ctx.fillStyle = 'white';
        ctx.textAlign = 'left';
        ctx.fillText('Hip Score:', overlayLabel, 105);
        ctx.textAlign = 'right';
        ctx.fillStyle = colorFor(hipScore);
        ctx.fillText(`${hipScore !== undefined ? hipScore.toFixed(1) : 'N/A'}`, overlayValue, 105);
        
        // --- Pelvic Tilt Score ---
        ctx.fillStyle = 'white';
        ctx.textAlign = 'left';
        ctx.fillText('Pelvic Score:', overlayLabel, 130);
        ctx.textAlign = 'right';
        ctx.fillStyle = colorFor(pelvicScore);
        ctx.fillText(`${pelvicScore !== undefined ? pelvicScore.toFixed(1) : 'N/A'}`, overlayValue, 130);
        
        // --- Knee Angle ---
        ctx.fillStyle = 'white';
        ctx.textAlign = 'left';
        ctx.fillText('Knee Angle:', overlayLabel, 155);
        ctx.textAlign = 'right';
        ctx.fillStyle = colorFor(depthScore);
        ctx.fillText(`${kneeAngle !== null ? Math.round(kneeAngle) : 'N/A'}°`, overlayValue, 155);
        
        // --- Shoulder-Midfoot Diff ---
        ctx.fillStyle = 'white';
        ctx.textAlign = 'left';
        ctx.fillText('Shoulder-Midfoot Diff:', overlayLabel, 180);
        ctx.textAlign = 'right';
        ctx.fillStyle = colorFor(shoulderScore);
        ctx.fillText(`${shoulderMidfootDiff !== null ? shoulderMidfootDiff.toFixed(1) : 'N/A'}`, overlayValue, 180);
        
        // --- Pelvic Tilt ---
        ctx.fillStyle = 'white';
        ctx.textAlign = 'left';
        ctx.fillText('Pelvic Tilt:', overlayLabel, 205);
        ctx.textAlign = 'right';
        ctx.fillStyle = colorFor(pelvicScore);
        ctx.fillText(`${pelvicAngle !== null ? Math.round(pelvicAngle) : 'N/A'}°`, overlayValue, 205);
        
        // --- Hip Flexion ---
        ctx.fillStyle = 'white';
        ctx.textAlign = 'left';
        ctx.fillText('Hip Flexion:', overlayLabel, 230);
        ctx.textAlign = 'right';
        ctx.fillStyle = colorFor(hipScore);
        ctx.fillText(`${hipFlexionAngle !== null ? Math.round(hipFlexionAngle) : 'N/A'}°`, overlayValue, 230);
        
        if (window.DEBUG_OVERLAY) {
          console.log(`Frame ${currentFrameIndex}: depth=${depthScore}, hip=${hipScore}, pelvic=${pelvicScore}, total=${mergedGlobalScores.totalScore}`);
        }
      });
    } // Added closing bracket here

    // Draw frame indicator
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '12px Arial';
    ctx.fillText(`Frame: ${currentFrameIndex}, Time: ${frameData.timestamp.toFixed(2)}s`, 10, ctx.canvas.height - 10);
    
    // Helper to map numeric scores to colors – defined once inside drawOverlays
    function colorFor(score) {
      if (score === undefined || score === null || isNaN(score)) return '#ffffff';
      if (score >= 100) return '#22c55e';
      if (score >= 75) return '#38bdf8';
      if (score >= 25) return '#facc15';
      return '#dc2626';
    }
  }, [hasAnalysisData, analysisData, videoOrientation, transformCoordinates, findFrameIndex, mergedGlobalScores]);

  // Stable ref to latest drawOverlays to avoid re-creating listeners each render
  const drawOverlaysRef = useRef();
  useEffect(() => { drawOverlaysRef.current = drawOverlays; }, [drawOverlays]);

  // *** ADD HELPER FUNCTION TO DRAW KNEE ANGLE ARC ***
  const drawKneeAngleArc = useCallback((ctx, frameData, side, isPortrait) => {
    const hipIndex = side === 'left' ? 23 : 24;
    const kneeIndex = side === 'left' ? 25 : 26;
    const ankleIndex = side === 'left' ? 27 : 28;

    const { keypoints, measurements } = frameData;
    const kneeAngle = measurements?.kneeAngle;

    if (kneeAngle === null || kneeAngle === undefined || !keypoints) return false; // No angle or keypoints

    const hip = keypoints[hipIndex];
    const knee = keypoints[kneeIndex];
    const ankle = keypoints[ankleIndex];

    // Check visibility
    const minConfidence = 0.3;
    if (!hip || !knee || !ankle || (hip.score ?? 0) < minConfidence || (knee.score ?? 0) < minConfidence || (ankle.score ?? 0) < minConfidence) {
      // console.debug(`[Squat] Skipping knee arc draw for ${side} side due to low confidence or missing points.`);
      return false; // Indicate failure to draw for this side
    }

    // Transform coordinates
    const pHip = transformCoordinates(hip.x, hip.y, ctx.canvas.width, ctx.canvas.height, isPortrait);
    const pKnee = transformCoordinates(knee.x, knee.y, ctx.canvas.width, ctx.canvas.height, isPortrait);
    const pAnkle = transformCoordinates(ankle.x, ankle.y, ctx.canvas.width, ctx.canvas.height, isPortrait);

    // Calculate angles of segments relative to horizontal
    const thighAngleRad = Math.atan2(pHip.y - pKnee.y, pHip.x - pKnee.x);
    const shinAngleRad = Math.atan2(pAnkle.y - pKnee.y, pAnkle.x - pKnee.x);

    // Determine start and end angles for the arc to represent the internal angle
    let startAngle = thighAngleRad;
    let endAngle = shinAngleRad;

    let angleDiff = endAngle - startAngle;
    while (angleDiff <= -Math.PI) angleDiff += 2 * Math.PI;
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    
    // The actual knee angle from backend (0-180 degrees usually)
    const internalAngleRad = kneeAngle * (Math.PI / 180);
    
    // Determine if the calculated sweep matches the internal angle direction
    // This heuristic assumes flexion reduces the angle towards zero
    const sweepAngle = Math.abs(angleDiff);
    const counterClockwise = angleDiff < 0; // Define sweep direction based on angle difference

    const radius = 40; // Radius of the arc in pixels
    ctx.strokeStyle = '#00ffff'; // Cyan color for the arc
    ctx.lineWidth = 3;
    ctx.setLineDash([]); // Ensure solid line

    // Draw the arc
    ctx.beginPath();
    // We draw from thigh to shin angle. Sweep direction determined by angleDiff sign.
    ctx.arc(pKnee.x, pKnee.y, radius, startAngle, endAngle, counterClockwise);
    ctx.stroke();

    // Draw the angle value near the arc
    ctx.fillStyle = '#00ffff';
    ctx.font = '14px Arial';
    const textAngle = startAngle + angleDiff / 2; // Midpoint angle for text
    const textDist = radius + 15;
    const textX = pKnee.x + textDist * Math.cos(textAngle);
    const textY = pKnee.y + textDist * Math.sin(textAngle);
    // Add background for text
    const text = `${Math.round(kneeAngle)}°`;
    const textMetrics = ctx.measureText(text);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(
      textX - 5,
      textY - 14,
      textMetrics.width + 10,
      18
    );
    ctx.fillStyle = '#00ffff';
    ctx.fillText(text, textX, textY);

    return true; // Indicate success
  }, [transformCoordinates]); // Added dependency

  // Log any issues with analysis data
  useEffect(() => {
    if (analysisData && (!analysisData.frames || analysisData.frames.length === 0)) {
      console.warn("Analysis data has no valid frames", analysisData);
      setError("Analysis completed but no valid frames were found. Try recording a clearer video.");
    }
  }, [analysisData, setError]); // Added setError dependency

  // Reset error when video URL changes
  useEffect(() => {
    if (videoUrl) {
      setError(null);
    }
  }, [videoUrl, setError]); // Added setError dependency

  // Add logic to load video/image source and metadata
  useEffect(() => {
    console.log(`[Playback Setup] videoUrl updated or isImagePlayback changed. URL: ${videoUrl}, IsImage: ${isImagePlayback}`);
    
    // If it's image playback mode
    if (videoUrl && isImagePlayback) {
      console.log("[Playback Setup] Loading image source...");
      const img = new Image();
      img.onload = () => {
        console.log('[Playback Setup] Image loaded successfully for playback');
        setVideoDimensions({ width: img.width, height: img.height }); // Set dimensions from image
        // Optionally draw overlays if analysis data exists for the single frame
        if (hasAnalysisData && canvasRef.current) {
          const canvas = canvasRef.current;
          canvas.width = img.width; // Match canvas to image size
          canvas.height = img.height;
          const ctx = canvas.getContext('2d'); // Removed { alpha: false }
          drawOverlaysRef.current?.(ctx, 0); // Draw overlay for the static image (time 0)
        }
      };
      img.onerror = (err) => {
        console.error('[Playback Setup] Error loading image for playback:', err);
        setError('Failed to load snapshot image. Please try again.');
      };
      img.src = videoUrl;
    }
    // If it's video playback mode
    else if (videoUrl && !isImagePlayback && videoRef.current) {
      console.log("[Playback Setup] Loading video source...");
      videoRef.current.src = videoUrl;
      // Reset duration/time when src changes
      setCurrentTime(0);
      setDuration(0);
      // Add a load() call for reliability, though src assignment usually triggers it
      videoRef.current.load(); 
      
      // The 'loadedmetadata' event listener added in the other useEffect 
      // will handle setting duration, dimensions, and initial overlay draw.
      console.log("[Playback Setup] Video source set. Waiting for 'loadedmetadata' event...");
    }
    else if (!videoUrl) {
        console.log("[Playback Setup] videoUrl is null, clearing video/image.");
        if (videoRef.current) videoRef.current.src = "";
        // If needed, clear image display here too
    }
    
  }, [videoUrl, isImagePlayback, hasAnalysisData, drawOverlaysRef, setError]); // Dependencies

  // Detect mobile recordings that are rotated
  const detectVideoRotation = useCallback((video) => {
    if (!video) return 'landscape';
    
    // Simple detection based on dimensions
    const isPortrait = video.videoHeight > video.videoWidth;
    
    // Additional checks to detect rotation
    // Sometimes videos are recorded in portrait but stored as landscape with rotation metadata
    if (isPortrait) {
      return 'portrait';
    }
    
    // Check if video might be mobile-recorded (typically 9:16 ratio when properly oriented)
    const aspectRatio = video.videoWidth / video.videoHeight;
    if (aspectRatio > 1.7) { // Wide aspect ratio common for mobile videos shot in landscape
      // This is likely a mobile recording with natural landscape orientation
      return 'landscape-mobile';
    }
    
    return 'landscape';
  }, []);

  // Handle video time updates - Simplified, primarily for UI, drawing handled by rAF
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      // No need to call drawOverlays here, rAF loop handles it
    }
  }, []);

  // Handle video errors
  const handleError = useCallback((e) => {
    console.error('Video error:', e);
    setError('Error playing video. Please try recording again.');
  }, [setError]);

  // Check if the video orientation is portrait (for coordinate transform)
  const isPortraitVideo = useCallback(() => {
    return videoOrientation === 'portrait';
  }, [videoOrientation]);

  // Handle video metadata loading
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      const video = videoRef.current;
      setDuration(video.duration);
      
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      
      // Use our enhanced rotation detection
      const orientation = detectVideoRotation(video);
      setVideoOrientation(orientation);
      
      console.log(`Video loaded: ${videoWidth}x${videoHeight}, duration: ${video.duration}s, orientation: ${orientation}`);
      setVideoDimensions({ width: videoWidth, height: videoHeight });
      
      // Update debugging info
      debugInfoRef.current = {
        ...debugInfoRef.current,
        videoMetadata: {
          width: videoWidth,
          height: videoHeight,
          duration: video.duration,
          orientation: orientation,
          aspectRatio: (videoWidth / videoHeight).toFixed(2)
        }
      };
      
      // Set up canvas with dimensions matching the video
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        canvas.width = videoWidth;
        canvas.height = videoHeight;
        setCanvasDimensions({ width: canvas.width, height: canvas.height });
        
        // Initial draw of overlays if we have analysis data
        if (hasAnalysisData) {
          const ctx = canvas.getContext('2d'); // Removed { alpha: false }
          drawOverlaysRef.current?.(ctx, 0);
        }
      }
    }
  }, [hasAnalysisData, detectVideoRotation, drawOverlaysRef]);

  // Set up video event listeners and completely rewritten animation frame loop
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isImagePlayback) return; // Don't run for images
    
    console.log("Setting up video event listeners and new rAF loop");
    
    // Set up event listeners
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('error', handleError);
    
    // Only start animation loop if we have analysis data
    if (hasAnalysisData && canvasRef.current) {
      // Get the canvas context only once
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d'); // Removed { alpha: false }
      
      // Track last overlay render time to throttle to ~30fps
      let lastOverlayDisplayTime = -Infinity; // in ms
      
      // Helper that actually performs draw for a given mediaTime
      const performDraw = (mediaTime, displayTimeMs = performance.now(), shouldThrottle = true) => {
        // Throttle: apply only when explicitly enabled
        if (shouldThrottle && displayTimeMs - lastOverlayDisplayTime < 33) return;
        lastOverlayDisplayTime = displayTimeMs;
        try {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (drawOverlaysRef.current) {
            drawOverlaysRef.current(ctx, mediaTime);
          }
        } catch (err) {
          console.error('Error drawing overlays:', err);
        }
      };
      
      // Prefer requestVideoFrameCallback when supported (better synced & less CPU)
      if (typeof video.requestVideoFrameCallback === 'function') {
        let vfCallbackId = null;
        
        const handleVideoFrame = (_now, metadata) => {
          performDraw(metadata.mediaTime, metadata.expectedDisplayTime, false); // draw every frame, no throttle
          vfCallbackId = video.requestVideoFrameCallback(handleVideoFrame);
        };
        
        // Start when playing
        const startVFC = () => {
          if (vfCallbackId == null) {
            vfCallbackId = video.requestVideoFrameCallback(handleVideoFrame);
          }
        };
        
        // Stop when paused/ended
        const stopVFC = () => {
          if (vfCallbackId != null) {
            try { video.cancelVideoFrameCallback(vfCallbackId); } catch { /**/ }
            vfCallbackId = null;
          }
        };
        
        // Initial start/stop depending on state
        if (!video.paused && !video.ended) startVFC(); else performDraw(video.currentTime);
        
        // Wire events
        video.addEventListener('play', startVFC);
        video.addEventListener('pause', stopVFC);
        video.addEventListener('ended', stopVFC);
        video.addEventListener('seeked', () => performDraw(video.currentTime));
        
        // Cleanup
        return () => {
          stopVFC();
          video.removeEventListener('play', startVFC);
          video.removeEventListener('pause', stopVFC);
          video.removeEventListener('ended', stopVFC);
          video.removeEventListener('seeked', () => performDraw(video.currentTime));
        };
      }
      
      // Fallback: requestAnimationFrame loop (throttled)
      else {
        let animationFrameId = null;
        let previousVideoTime = -1;
        let isDrawing = false;
        
        // Simplified animation loop with safeguards
        const animate = () => {
          // Safely check if video and canvas still exist
          if (!videoRef.current || !canvasRef.current) {
            if (animationFrameId) {
              cancelAnimationFrame(animationFrameId);
              animationFrameId = null;
            }
            return;
          }
          
          // Get the current video time
          const currentVideoTime = videoRef.current.currentTime;
          
          // Only redraw if the time has changed and we're not already drawing
          if (!isDrawing && Math.abs(currentVideoTime - previousVideoTime) > 0.001) {
            isDrawing = true;
            previousVideoTime = currentVideoTime;
            
            try {
              // Clear the entire canvas completely
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              
              // Only draw if we have a valid time and analysis data
              if (drawOverlaysRef.current && hasAnalysisData) {
                performDraw(currentVideoTime);
              }
            } catch (error) {
              console.error('Error drawing overlays:', error);
            } finally {
              isDrawing = false;
            }
          }
          
          // Continue the animation loop
          animationFrameId = requestAnimationFrame(animate);
        };
        
        // Create one-time draw function for paused state
        const drawOnce = () => {
          if (!videoRef.current || !canvasRef.current) return;
          
          try {
            // Clear the canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw at current time
            if (drawOverlaysRef.current) {
              performDraw(videoRef.current.currentTime);
            }
          } catch (error) {
            console.error('Error in drawOnce:', error);
          }
        };
        
        // Setup explicit play/pause handlers to avoid redraw issues
        const handlePlay = () => {
          if (animationFrameId) cancelAnimationFrame(animationFrameId);
          animationFrameId = requestAnimationFrame(animate);
        };
        
        const handlePause = drawOnce;
        const handleSeeked = drawOnce;
        
        // Add event listeners for handling play/pause/seek
        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);
        video.addEventListener('seeked', handleSeeked);
        
        // Start animation loop if playing, draw once if paused
        if (video.paused) {
          drawOnce();
        } else {
          animationFrameId = requestAnimationFrame(animate);
        }
        
        // Cleanup function
        return () => {
          // Cancel animation frame
          if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
          }
          
          // Remove all event listeners
          video.removeEventListener('play', handlePlay);
          video.removeEventListener('pause', handlePause);
          video.removeEventListener('seeked', handleSeeked);
        };
      }
    }
    
    // Cleanup without animation loop
    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('error', handleError);
    };
  }, [hasAnalysisData, isImagePlayback, handleLoadedMetadata, handleTimeUpdate, handleError, drawOverlaysRef]);

  // New utility to format seconds into mm:ss (or hh:mm:ss if >1h)
  const formatTime = (seconds = 0) => {
    if (isNaN(seconds)) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const padded = (n) => n.toString().padStart(2, '0');
    return hrs > 0 ? `${hrs}:${padded(mins)}:${padded(secs)}` : `${mins}:${padded(secs)}`;
  };

  const timelineWasPlayingRef = useRef(false);

  // Skip helpers
  const skipTime = useCallback((delta) => {
    if (!videoRef.current) return;
    let newTime = videoRef.current.currentTime + delta;
    newTime = Math.max(0, Math.min(duration || 0, newTime));
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration]);

  const stepFrame = useCallback((offset) => {
    if (!analysisData || !videoRef.current) return;
    const idx = findFrameIndex(currentTime); // use existing helper to find nearest frame
    if (idx === undefined) return;
    let newIdx = idx + offset;
    newIdx = Math.max(0, Math.min(newIdx, analysisData.frames.length - 1));
    const ts = analysisData.frames[newIdx].timestamp;
    videoRef.current.currentTime = ts;
    setCurrentTime(ts);
  }, [analysisData, currentTime, findFrameIndex]);

  // Scrubber drag handlers
  const handleScrubStart = () => {
    if (!videoRef.current) return;
    timelineWasPlayingRef.current = isPlaying;
    if (isPlaying) setIsPlaying(false);
    setIsDraggingTimeline(true);
  };

  const handleScrubChange = (e) => {
    if (!videoRef.current) return;
    const val = parseFloat(e.target.value);
    videoRef.current.currentTime = val;
    setCurrentTime(val);
  };

  const handleScrubEnd = () => {
    setIsDraggingTimeline(false);
    if (timelineWasPlayingRef.current) {
      setIsPlaying(true);
    }
  };

  // Compute a smoother progress bar that doesn't finish too early.
  // We assume analysis might take ~1.5× the video length and we slow the curve using a square-root easing.
  const estimatedTotalMs = duration * 1500; // 1.5 × duration for a safer upper bound
  const progressFraction = duration > 0 ? Math.min(elapsedLoadingTime / estimatedTotalMs, 1) : 0;
  const progressPercent = Math.floor(Math.sqrt(progressFraction) * 100);

  const shoulderDiffValues = useMemo(() => analysisData?.frames
    ?.map(f => f.measurements?.shoulderMidfootDiff)
    ?.filter(v => typeof v === 'number' && !isNaN(v)), [analysisData]);

  const avgShoulderDiff = useMemo(() => {
    if (!shoulderDiffValues || shoulderDiffValues.length === 0) return undefined;
    return shoulderDiffValues.reduce((a, b) => a + b, 0) / shoulderDiffValues.length;
  }, [shoulderDiffValues]);

  const getTimestampForMetric = useCallback((selector, preferHigh=true) => {
    if (!analysisData?.frames) return undefined;
    let bestVal = preferHigh ? -Infinity : Infinity;
    let bestTs;
    analysisData.frames.forEach(f => {
      const val = selector(f);
      if (val === undefined || val === null || isNaN(val)) return;
      if ((preferHigh && val > bestVal) || (!preferHigh && val < bestVal)) {
        bestVal = val;
        bestTs = f.timestamp;
      }
    });
    return bestTs;
  }, [analysisData]);

  const qualitativeMessages = useMemo(() => {
    const msgs = [];
    // 1. Knee extension / depth
    const depthScore = mergedGlobalScores.kneeDepthScore;
    const depthTs = getTimestampForMetric(f=>f.scores?.knee_depth, true);
    if (depthScore !== undefined) {
      if (depthScore >= 80) {
        msgs.push({msg:'Great depth — your knees are bending deep enough to activate your glutes and quads effectively.', ts: depthTs});
      } else if (depthScore >= 50) {
        msgs.push({msg:"You're not squatting deep enough — try bending your knees more to lower your hips at least to knee level.", ts: depthTs});
      } else {
        msgs.push({msg:"You’re going deep, but check that you're keeping control at the bottom — avoid collapsing into the squat.", ts: depthTs});
      }
    }

    // 2. Shoulder alignment
    const alignTs = getTimestampForMetric(f=>Math.abs(f.measurements?.shoulderMidfootDiff), false); // prefer smallest diff
    if (avgShoulderDiff !== undefined) {
      const absDiff = Math.abs(avgShoulderDiff);
      const threshold=0.05;
      if (absDiff <= threshold) {
        msgs.push({msg:'Nice work — your shoulders are staying centered over your midfoot, which keeps your balance strong and protects your spine.', ts: alignTs});
      } else if (avgShoulderDiff > 0) {
        msgs.push({msg:"You're leaning too far forward — keep your chest up and your shoulders stacked over your midfoot.", ts: alignTs});
      } else {
        msgs.push({msg:"You're leaning too far back — this can throw off your balance. Keep your weight centered over your feet.", ts: alignTs});
      }
    }

    // 3. Hip flexion
    const hipScore = mergedGlobalScores.hipFlexionScore;
    const hipTs = getTimestampForMetric(f=>f.scores?.hip_flexion, true);
    if (hipScore !== undefined) {
      if (hipScore >= 80) {
        msgs.push({msg:'Strong hip engagement — your hips are hinging properly to drive power and protect your knees.', ts: hipTs});
      } else if (hipScore >= 50) {
        msgs.push({msg:'Try hinging more at the hips — this helps activate your glutes and keeps your squat powerful.', ts: hipTs});
      } else {
        msgs.push({msg:'You may be bending too much at the hips — check your form to avoid leaning too far forward.', ts: hipTs});
      }
    }

    // 4. Pelvic tilt
    const pelvicScore = mergedGlobalScores.pelvicTiltScore;
    const pelvicTs = getTimestampForMetric(f=>f.scores?.pelvic_tilt, false); // lower is worse
    if (pelvicScore !== undefined) {
      if (pelvicScore >= 80) {
        msgs.push({msg:'Solid posture — you\'re maintaining a neutral spine at the bottom of your squat.', ts: pelvicTs});
      } else if (pelvicScore >= 50) {
        msgs.push({msg:'Watch your lower back — there’s a slight tuck under at the bottom. Try not to go deeper than your hips can control.', ts: pelvicTs});
      } else {
        msgs.push({msg:'You’re losing spinal alignment at the bottom — stop just before your lower back starts to round and work on hip or ankle mobility.', ts: pelvicTs});
      }
    }
    return msgs;
  }, [mergedGlobalScores, avgShoulderDiff, getTimestampForMetric]);

  return (
    <Container ref={containerRef}>
      <h2>Exercise Playback</h2>
      
      {error && (
        <ErrorMessage>
          <AlertTriangle size={18} />
          {error}
        </ErrorMessage>
      )}
      
      <div className="playback-container">
        <div ref={videoContainerRef} style={{ position: 'relative' }}>
          {isImagePlayback ? (
            <img 
              src={videoUrl} 
              alt="Recorded Squat Snapshot" 
              style={{ maxWidth: '100%', maxHeight: '75vh', display: 'block' }} 
            />
          ) : (
            <Video
              ref={videoRef}
              src={videoUrl}
              playsInline
              onClick={() => setIsPlaying(!isPlaying)}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onError={handleError}
              onEnded={() => setIsPlaying(false)}
              style={{ maxWidth: '100%', maxHeight: '75vh' }} 
              controls={false}
            />
          )}
          <CanvasOverlay ref={canvasRef} />
          {isLoading && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              backgroundColor: 'rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 1000
            }}>
              <div style={{
                width: '80%',
                backgroundColor: '#444',
                borderRadius: '4px',
                overflow: 'hidden',
                height: '8px'
              }}>
                <div style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  backgroundColor: '#07c',
                  transition: 'width 0.2s'
                }} />
              </div>
            </div>
          )}
          {isFullscreen && (
            <button
              onClick={() => setIsFullscreen(false)}
              style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 1001 }}
            >
              <Minimize2 size={24} color="white" />
            </button>
          )}
        </div>
      </div>
      
      {/* Add video orientation badge for debugging */}
      {showDebug && (
        <div style={{
          position: 'absolute',
          top: '5px',
          right: '5px',
          background: 'rgba(0,0,0,0.5)',
          color: 'white',
          padding: '2px 6px',
          borderRadius: '4px',
          fontSize: '12px'
        }}>
          {videoOrientation}
        </div>
      )}
      
      <ControlsWrapper>
        {/* Top row: play button left, time labels & scrubber */}
        <Controls>
          <Button onClick={() => setIsPlaying(!isPlaying)}>
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </Button>

          <TimeLabel>{formatTime(currentTime)}</TimeLabel>

          <Scrubber
            min={0}
            max={duration || 0}
            step={0.01}
            value={currentTime}
            onMouseDown={handleScrubStart}
            onTouchStart={handleScrubStart}
            onChange={handleScrubChange}
            onMouseUp={handleScrubEnd}
            onTouchEnd={handleScrubEnd}
            disabled={duration === 0}
          />

          <TimeLabel>{formatTime(duration)}</TimeLabel>
        </Controls>

        {/* Bottom row: frame selector arrows and info button */}
        <Controls>
          <Button onClick={() => stepFrame(-1)}>
            <ArrowLeft size={18} />
          </Button>
          <Button onClick={() => stepFrame(1)}>
            <ArrowRight size={18} />
          </Button>
          <Button onClick={() => setShowDebug(!showDebug)}>
            <Info size={20} />
          </Button>
        </Controls>
      </ControlsWrapper>
      
      {/* Debug information panel */}
      <DebugInfo $show={showDebug}>
        {JSON.stringify(debugInfoRef.current, null, 2)}
      </DebugInfo>
      
      <AnalysisPanel>
        <h3>
          Analysis Results
        </h3>
        {hasAnalysisData ? (
          <>
            {qualitativeMessages.length > 0 && (
              <FeedbackSection>
                <FeedbackList>
                  {qualitativeMessages.map(({msg, ts}, idx) => (
                    <FeedbackItem key={idx} onClick={()=> ts!==undefined && setCurrentTime(ts)} style={{cursor: ts!==undefined?'pointer':'default'}}>
                      {msg} {ts!==undefined && <span style={{color:'#38bdf8'}}>({ts.toFixed(2)}s)</span>}
                    </FeedbackItem>
                  ))}
                </FeedbackList>
              </FeedbackSection>
            )}
          </>
        ) : null}
      </AnalysisPanel>
      
      {/* Add a new debug panel for analysisData and frame/timestamp matching */}
      {showDebug && (
        <div style={{
          position: 'absolute',
          top: '50px',
          right: '5px',
          background: 'rgba(0,0,0,0.5)',
          color: 'white',
          padding: '2px 6px',
          borderRadius: '4px',
          fontSize: '12px'
        }}>
          <h4>Analysis Data Debug</h4>
          <pre>
            {JSON.stringify(analysisData, null, 2)}
          </pre>
          <h4>Frame/Timestamp Matching Debug</h4>
          <pre>
            {JSON.stringify(debugInfoRef.current.frameTimestamps, null, 2)}
          </pre>
        </div>
      )}
    </Container>
  );
};

export default ExercisePlayback;