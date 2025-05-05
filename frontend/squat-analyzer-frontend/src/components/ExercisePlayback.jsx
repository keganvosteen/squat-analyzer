// src/components/ExercisePlayback.jsx
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, SkipForward, SkipBack, AlertTriangle, CheckCircle, Info, Maximize2, Minimize2, ArrowLeft } from 'lucide-react';
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
  gap: 1rem;
  padding: 1rem;
  max-width: 1200px;
  margin: 0 auto;
`;

const VideoContainer = styled.div`
  position: relative;
  max-width: 100%;
  max-height: 70vh;
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
  max-height: 70vh;
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
  gap: 1rem;
  margin-top: 1rem;
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
  max-width: 800px;
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 8px;
  margin-top: 1rem;
`;

const StatBox = styled.div`
  background: white;
  padding: 1rem;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  margin-bottom: 1rem;
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
  padding: 1rem;
  background-color: #fee2e2;
  border-radius: 0.375rem;
  margin-bottom: 1rem;
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
  margin-top: 1rem;
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
  margin-top: 1rem;
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

const BackButton = styled.button`
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  background: #007bff;
  color: white;
  cursor: pointer;
  transition: background 0.2s;
  margin-bottom: 1rem;

  &:hover {
    background: #0056b3;
  }

  &:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
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

  // Draw overlays on canvas - MEMOIZED with useCallback
  const drawOverlays = useCallback((ctx, time) => {
    if (!ctx || !ctx.canvas) {
      console.warn('[Debug] Missing context or canvas');
      return;
    }
    
    if (!hasAnalysisData) {
      console.warn('[Debug] No analysis data available');
      return;
    }

    // Clear canvas first
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // Debug: Log analysisData and drawing context
    if (window && window.DEBUG_OVERLAY) {
      // Only log if explicitly enabled
      console.log('[Overlay Debug] Drawing overlays at time:', time);
      console.log('[Overlay Debug] analysisData:', analysisData);
      console.log('[Overlay Debug] Canvas size:', ctx.canvas.width, ctx.canvas.height);
    }

    // Update debug info
    debugInfoRef.current = {
      currentTime: time.toFixed(2),
      canvasWidth: ctx.canvas.width,
      canvasHeight: ctx.canvas.height,
      videoWidth: videoRef.current?.videoWidth || 0,
      videoHeight: videoRef.current?.videoHeight || 0,
      frameCount: analysisData.frames.length,
      frameTimestamps: analysisData.frames.map(f => f.timestamp),
      time,
    };

    // Determine if video is in portrait
    const isPortrait = videoOrientation === 'portrait';

    // Get video duration for proportional mapping
    const videoDuration = videoRef.current?.duration || 0;
    const lastAnalysisTs = analysisData.frames[analysisData.frames.length - 1].timestamp;

    let currentFrameIndex = -1;

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
      ctx.strokeStyle = stroke;
      // if (window && window.DEBUG_OVERLAY) console.log(`[Debug] Drawing connection group with stroke: ${stroke}`);
      
      // Check keypoints vs landmarks naming
      if (!frameData.keypoints && frameData.landmarks) {
        if (window && window.DEBUG_OVERLAY) console.warn('[Debug] Frame data has landmarks but not keypoints - using landmarks instead');
        frameData.keypoints = frameData.landmarks;
      }
      
      if (!frameData.keypoints) {
        if (window && window.DEBUG_OVERLAY) console.error('[Debug] No keypoints/landmarks found in frame data!');
        return;
      }
      
      // if (window && window.DEBUG_OVERLAY) console.log('[Debug] Keypoints array length:', frameData.keypoints.length);
      
      connectionsArr.forEach(([i, j]) => {
        // if (window && window.DEBUG_OVERLAY) console.log(`[Debug] Trying to draw connection between points ${i} and ${j}`);
        const l1 = blendedKeypoints[i];
        const l2 = blendedKeypoints[j];
        
        if (!l1 || !l2) {
          // if (window && window.DEBUG_OVERLAY) console.warn(`[Debug] Missing keypoint at index ${i} or ${j}`);
          return;
        }
        
        // if (window && window.DEBUG_OVERLAY) console.log(`[Debug] Keypoint ${i} visibility: ${l1.visibility}, Keypoint ${j} visibility: ${l2.visibility}`);
        
        if (l1.visibility < 0.5 || l2.visibility < 0.5) {
          // if (window && window.DEBUG_OVERLAY) console.log(`[Debug] Skipping connection ${i}-${j} due to low visibility`);
          return;
        }
        const p1 = transformCoordinates(l1.x, l1.y, ctx.canvas.width, ctx.canvas.height, isPortrait);
        const p2 = transformCoordinates(l2.x, l2.y, ctx.canvas.width, ctx.canvas.height, isPortrait);
        
        // --- Mitigation for stuck landmarks --- 
        // Skip drawing if either point is suspiciously close to the edge (0,0 or 1,1)
        const isPointInvalid = (p) => p.x < 0.01 || p.x > 0.99 || p.y < 0.01 || p.y > 0.99;
        if (isPointInvalid(p1) || isPointInvalid(p2)) {
            // if (window && window.DEBUG_OVERLAY) console.warn(`Skipping connection [${i}, ${j}] due to potentially invalid coordinates:`, p1, p2);
            return; 
        }
        // --- End Mitigation --- 

        ctx.beginPath();
        ctx.moveTo(p1.x * ctx.canvas.width, p1.y * ctx.canvas.height);
        ctx.lineTo(p2.x * ctx.canvas.width, p2.y * ctx.canvas.height);
        ctx.lineWidth = 2;
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
        let labelX, labelY;
        const padding = 20; // Distance from edge
        const labelPadding = 5; // Padding around label text
        
        // Determine if point is closer to left/right or top/bottom edges
        const distToLeft = targetX;
        const distToRight = canvasWidth - targetX;
        const distToTop = targetY;
        const distToBottom = canvasHeight - targetY;
        
        const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
        
        // MODIFIED: Only use left or right edges for feedback tips
        // Determine if we should use the left or right side based on target position
        const useLeftSide = targetX < canvasWidth / 2;
        
        if (useLeftSide) {
          // Place on left side
          startX = padding;
          startY = targetY;
          labelX = padding;
          labelY = targetY - 10; // Position label above arrow start
        } else {
          // Place on right side
          startX = canvasWidth - padding;
          startY = targetY;
          labelX = canvasWidth - padding;
          labelY = targetY - 10; // Position label above arrow start
        }
        
        // Draw arrow
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 3;
        
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(targetX, targetY);
        ctx.stroke();
        
        // Draw arrow head
        const angle = Math.atan2(targetY - startY, targetX - startX);
        const headLen = 10;
        const hx = targetX - headLen * Math.cos(angle - Math.PI / 6);
        const hy = targetY - headLen * Math.sin(angle - Math.PI / 6);
        const hx2 = targetX - headLen * Math.cos(angle + Math.PI / 6);
        const hy2 = targetY - headLen * Math.sin(angle + Math.PI / 6);
        ctx.beginPath();
        ctx.moveTo(targetX, targetY);
        ctx.lineTo(hx, hy);
        ctx.moveTo(targetX, targetY);
        ctx.lineTo(hx2, hy2);
        ctx.stroke();
        
        // Message text with improved positioning and background
        if (message) {
          const textPadding = labelPadding;
          ctx.font = 'bold 14px Arial';
          const textMetrics = ctx.measureText(message);
          const textWidth = textMetrics.width;
          const textHeight = 14; // Approximate height based on font size
          
          // MODIFIED: Position text only on left or right sides
          if (useLeftSide) {
            // Left side - align text left
            labelX = padding * 2;
            
            // Ensure the text is vertically within canvas bounds and has some spacing between entries
            // Map the target Y position to a range that prevents overlap between tips
            const verticalPosition = (targetY / canvasHeight) * (canvasHeight - 4 * padding) + 2 * padding;
            labelY = Math.max(textHeight + padding, Math.min(verticalPosition, canvasHeight - padding));
          } else {
            // Right side - align text right
            labelX = canvasWidth - textWidth - (padding * 2);
            
            // Ensure the text is vertically within canvas bounds and has some spacing between entries
            const verticalPosition = (targetY / canvasHeight) * (canvasHeight - 4 * padding) + 2 * padding;
            labelY = Math.max(textHeight + padding, Math.min(verticalPosition, canvasHeight - padding));
          }
          
          // Draw semi-transparent background for readability
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.fillRect(
            labelX - textPadding,
            labelY - textHeight,
            textWidth + 2 * textPadding,
            textHeight + 2 * textPadding
          );
          
          // Draw text
          ctx.fillStyle = color; // Use arrow color for text
          ctx.fillText(message, labelX, labelY);
        }
      });
    }
    
    // *** ADD CALL TO DRAW KNEE ANGLE ARC ***
    let arcDrawn = drawKneeAngleArc(ctx, frameData, 'left', isPortrait);
    if (!arcDrawn) {
      // If left side failed, try right side
      drawKneeAngleArc(ctx, frameData, 'right', isPortrait);
    }
    // *** END KNEE ANGLE ARC DRAWING ***

    // Draw measurements and analysis
    if (frameData.measurements) {
      const { kneeAngle, shoulderMidfootDiff } = frameData.measurements;
      
      // If all values are null, skip drawing the stats box
      if (kneeAngle === null && shoulderMidfootDiff === null) {
        return;
      }
      
      // Position text in top-right corner
      ctx.font = '16px Arial';
      let yOffset = 30;
      const xOffset = ctx.canvas.width - 250; // Align to right side
      const paddingRight = 20; // Padding from right edge

      // Draw background for text for better visibility
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(xOffset, 0, 250, 100);

      // === Display Depth-focused Scores ===
      if (frameData.scores || analysisData.scores) {
        const scores = frameData.scores || {};
        const globalScores = analysisData.scores || {};

        // Depth score (0-100). Prefer per-frame, fallback to global.
        const depthScore =
          scores.knee_depth !== undefined
            ? scores.knee_depth
            : globalScores.kneeDepthScore;

        // Total squat score currently only uses depth (40% weight).
        const totalScore = depthScore !== undefined ? (depthScore * 0.4) : undefined;

        // --- Total Squat Score ---
        ctx.fillStyle = 'white';
        ctx.fillText('Total Squat Score:', xOffset + paddingRight, yOffset);
        ctx.fillStyle = '#ffd700';
        ctx.fillText(` ${totalScore !== undefined ? totalScore.toFixed(1) : 'N/A'}`, xOffset + paddingRight + 160, yOffset);
        yOffset += 25;

        // --- Depth Score ---
        ctx.fillStyle = 'white';
        ctx.fillText('Depth:', xOffset + paddingRight, yOffset);
        ctx.fillStyle = '#00ff00';
        ctx.fillText(` ${depthScore !== undefined ? depthScore.toFixed(1) : 'N/A'}`, xOffset + paddingRight + 60, yOffset);
        yOffset += 25;
        
        // Add raw knee angle display for debugging
        ctx.fillStyle = 'white';
        ctx.fillText('Raw Knee Angle:', xOffset + paddingRight, yOffset);
        ctx.fillStyle = '#ffff00';
        ctx.fillText(` ${kneeAngle !== null ? Math.round(kneeAngle) : 'N/A'}°`, xOffset + paddingRight + 120, yOffset);
        
        // Log values to console for debugging
        if (window.DEBUG_OVERLAY || true) { // Always show during debugging
          console.log(`Frame ${currentFrameIndex}: knee=${kneeAngle}, depth=${depthScore}, total=${totalScore}`);
        }
      }
    }

    // Draw frame indicator
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '12px Arial';
    ctx.fillText(`Frame: ${currentFrameIndex}, Time: ${frameData.timestamp.toFixed(2)}s`, 10, ctx.canvas.height - 10);
    
  }, [hasAnalysisData, analysisData, videoOrientation, transformCoordinates]);

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
    ctx.fillRect(textX - 5, textY - 14, textMetrics.width + 10, 18);
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
          const ctx = canvas.getContext('2d');
          drawOverlays(ctx, 0); // Draw overlay for the static image (time 0)
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
    
  }, [videoUrl, isImagePlayback, hasAnalysisData, drawOverlays, setError]); // Dependencies

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
          const ctx = canvas.getContext('2d');
          drawOverlays(ctx, 0);
        }
      }
    }
  }, [hasAnalysisData, detectVideoRotation, drawOverlays]);

  // Set up video event listeners and animation frame loop
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isImagePlayback) return; // Don't run for images
    
    console.log("Setting up video event listeners and rAF loop");
    
    let animationFrameId = null;
    
    // rAF loop function
    const animationLoop = () => {
      if (video.paused || video.ended) {
        cancelAnimationFrame(animationFrameId); // Stop loop if paused/ended
        return;
      }
      
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        drawOverlays(ctx, video.currentTime); // Use memoized drawOverlays
      }
      
      // Continue animation loop
      animationFrameId = requestAnimationFrame(animationLoop);
    };

    // Handlers to manage play / pause state and rAF loop
    const localHandlePlay = () => {
      setIsPlaying(true);
      // Ensure the video actually plays (in case play called programmatically)
      if (videoRef.current && videoRef.current.paused) {
        videoRef.current.play().catch(err => {
          console.warn('Video play() failed in localHandlePlay:', err);
        });
      }
      cancelAnimationFrame(animationFrameId); // Avoid duplicates
      animationFrameId = requestAnimationFrame(animationLoop);
    };

    const localHandlePause = () => {
      setIsPlaying(false);
      cancelAnimationFrame(animationFrameId);
      // Draw one frame so overlay matches pause position
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        drawOverlays(ctx, video.currentTime);
      }
    };

    // Add listeners
    video.addEventListener('play', localHandlePlay);
    video.addEventListener('pause', localHandlePause);
    video.addEventListener('seeking', localHandlePause); // Update frame when seeking finishes (usually fires pause)
    video.addEventListener('seeked', localHandlePause); // Also handle seeked for good measure
    video.addEventListener('timeupdate', handleTimeUpdate); // Keep for UI display
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('error', handleError);

    // Cleanup function
    return () => {
      console.log("Cleaning up video event listeners and rAF loop");
      cancelAnimationFrame(animationFrameId);
      video.removeEventListener('play', localHandlePlay);
      video.removeEventListener('pause', localHandlePause);
      video.removeEventListener('seeking', localHandlePause);
      video.removeEventListener('seeked', localHandlePause);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);
    };
  // Rerun this effect if the video element itself changes (via videoUrl) or drawing logic updates
  }, [videoUrl, isImagePlayback, drawOverlays, handleLoadedMetadata, handleTimeUpdate, handleError]);

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

  // Compute progress and remaining time
  const estimatedLoadingTotalMs = duration * 1000;
  const progressPercent = duration > 0 ? Math.min((elapsedLoadingTime / estimatedLoadingTotalMs) * 100, 99) : 0;
  const remainingSeconds = duration > 0 ? Math.max(Math.ceil((estimatedLoadingTotalMs - elapsedLoadingTime) / 1000), 0) : 0;

  return (
    <Container ref={containerRef}>
      <BackButton onClick={onBack}>
        <ArrowLeft size={20} /> Back
      </BackButton>
      
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
              style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block' }} 
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
              style={{ maxWidth: '100%', maxHeight: '70vh' }} 
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
              <p style={{ color: 'white', fontSize: '1em', marginTop: '0.5em' }}>
                Estimated time remaining: {formatTime(remainingSeconds)}
              </p>
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
      
      <Controls>
        <Button onClick={() => setIsPlaying(!isPlaying)}>
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </Button>

        <Button onClick={() => skipTime(-5)}>
          <SkipBack size={18} />
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

        <Button onClick={() => skipTime(5)}>
          <SkipForward size={18} />
        </Button>

        <Button onClick={() => setShowDebug(!showDebug)}>
          <Info size={20} />
        </Button>
      </Controls>
      
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
            {/* Only show StatBox if at least one measurement is not null */}
            {(() => {
              const m = analysisData.frames[0]?.measurements || {};
              const allNull =
                m.kneeAngle === null &&
                m.shoulderMidfootDiff === null;
              if (allNull) return null;
              return (
                <StatBox>
                  <StatTitle>Measurements</StatTitle>
                  <div className="flex flex-wrap mt-2">
                    {Object.entries(m)
                      .filter(([key]) => key !== 'depthRatio') // Remove depthRatio from display
                      .map(([key, value]) => (
                      <div key={key} className="w-1/2 mb-2"> {/* Increased width since we have fewer items */}
                        <StatLabel>{key === 'kneeAngle' ? 'Knee Angle' : 'Shoulder Position'}</StatLabel>
                        <StatValue>
                          {value === null || value === undefined
                            ? 'N/A'
                            : typeof value === 'number'
                              ? key === 'kneeAngle'
                                ? Math.round(value) + '°'
                                : value.toFixed(1)
                              : value}
                        </StatValue>
                      </div>
                    ))}
                  </div>
                </StatBox>
              );
            })()}

            <FeedbackSection>
              <h4>Feedback Tips (click timestamp to seek)</h4>
              {analysisData.frames
                .flatMap(frame => (frame.arrows || []).map(arrow => ({ ts: frame.timestamp, msg: arrow.message })))
                // Deduplicate by message to avoid repeated tips
                .filter((item, idx, arr) => arr.findIndex(x => x.msg === item.msg) === idx)
                .map(({ ts, msg }, idx) => (
                  <FeedbackTip key={idx} onClick={() => setCurrentTime(ts)} style={{cursor:'pointer'}}>
                    <span style={{marginRight:'6px', color:'#38bdf8'}}>{ts.toFixed(2)}s</span>
                    {msg}
                  </FeedbackTip>
                ))}
            </FeedbackSection>
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