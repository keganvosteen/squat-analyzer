// src/components/ExercisePlayback.jsx
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, SkipForward, SkipBack, AlertTriangle, CheckCircle, Info, Maximize2, Minimize2, ArrowLeft } from 'lucide-react';
import styled from 'styled-components';

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

const ExercisePlayback = ({ videoUrl, videoBlob, analysisData, usingLocalAnalysis = false, isLoading = false, error: externalError = null, onBack }) => {
  console.log("ExercisePlayback Component");
  console.log("Video URL:", videoUrl);
  console.log("Video Blob type:", videoBlob?.type);
  console.log("Analysis data:", analysisData);
  console.log("Using local analysis:", usingLocalAnalysis);
  
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
  const [debugInfo, setDebugInfo] = useState({});
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
                        analysisData.success && 
                        Array.isArray(analysisData.frames) && 
                        analysisData.frames.length > 0;

  // Define drawing and coordinate functions BEFORE the useEffect that uses them
  // Transform coordinates based on video orientation and apply scaling
  const transformCoordinates = useCallback((x, y, canvasWidth, canvasHeight, isPortrait = false, landmarkIndex = -1) => {
    // Default values to prevent NaN
    if (typeof x !== 'number' || typeof y !== 'number') {
      console.warn('Invalid coordinates:', x, y);
      return { x: 0.5, y: 0.5 };
    }
    
    // Better handling for coordinates that are in decimal format (0-1)
    // or in pixel format (0-width/height)
    let normalizedX = x;
    let normalizedY = y;
    
    if (x > 1) normalizedX = x / canvasWidth;
    if (y > 1) normalizedY = y / canvasHeight;
    
    // Detect and correct extreme positions - this helps filter out detection errors
    // Particularly useful for ankles/feet that sometimes get incorrectly placed
    const isExtreme = normalizedY < 0.05; // Top 5% of the screen is usually not valid for body parts
    if (isExtreme) {
      // For ankle/foot landmarks (27, 28, 31, 32), handle differently
      if ([27, 28, 31, 32].includes(landmarkIndex)) {
        console.log(`Correcting extreme position for landmark ${landmarkIndex}: ${normalizedX}, ${normalizedY}`);
        // Keep X but move Y to a reasonable position (bottom third of screen)
        normalizedY = 0.7 + (Math.random() * 0.2); // Random position in bottom third for natural look
      }
    }
    
    // Clamp values to valid range
    normalizedX = Math.max(0, Math.min(1, normalizedX));
    normalizedY = Math.max(0, Math.min(1, normalizedY));
    
    // Improved coordinate alignment - apply small correction factor to better match body
    // This helps account for differences between pose model coordinate space and display
    const xCorrection = 0.03; // Small correction to align horizontally
    normalizedX = Math.max(0, Math.min(1, normalizedX - xCorrection));
    
    return { x: normalizedX, y: normalizedY };
  }, []);
  
  // Draw overlays on canvas - MEMOIZED with useCallback
  const drawOverlays = useCallback((ctx, time) => {
    if (!ctx || !ctx.canvas || !hasAnalysisData) return;

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
    setDebugInfo(prev => ({
      ...prev,
      currentTime: time.toFixed(2),
      canvasWidth: ctx.canvas.width,
      canvasHeight: ctx.canvas.height,
      videoWidth: videoRef.current?.videoWidth || 0,
      videoHeight: videoRef.current?.videoHeight || 0,
      frameCount: analysisData.frames.length,
      frameTimestamps: analysisData.frames.map(f => f.timestamp),
      time,
    }));

    // Find the closest frame based on timestamp with a slight offset for better sync
    const frames = analysisData.frames;
    if (!frames || frames.length === 0) return;
    
    // Add a small time offset (0.2 seconds) to adjust for any delay in pose calculation vs video playback
    // This helps sync the pose overlay better with the actual movements in the video
    const timeOffset = 0.2; // seconds
    const adjustedTime = Math.max(0, time - timeOffset);
    
    const closestFrameIndex = frames.reduce((prev, curr, idx, arr) => {
      return Math.abs(curr.timestamp - adjustedTime) < Math.abs(arr[prev].timestamp - adjustedTime) ? idx : prev;
    }, 0);
    
    const frameData = frames[closestFrameIndex];
    
    // Debug: Log the frame data structure to see what properties it actually has
    console.log(`Frame ${closestFrameIndex} data structure:`, frameData);
    
    // Looking for pose keypoints - they could be named landmarks, keypoints, or pose_keypoints
    const keypointsData = frameData.landmarks || frameData.keypoints || frameData.pose_keypoints;
    
    if (!frameData || !keypointsData) {
      console.warn(`No valid keypoints data in frame ${closestFrameIndex}. Available properties:`, 
        Object.keys(frameData || {}).join(', '));
      return;
    }
    
    // Store the keypoints in a consistent property for later use
    frameData.keypoints = keypointsData;
    
    // Only show debug info when explicitly enabled
    if (showDebug) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(10, 10, 280, 100);
      ctx.font = '12px monospace';
      ctx.fillStyle = 'white';
      ctx.fillText(`Video time: ${time.toFixed(2)}s / Duration: ${videoRef.current?.duration.toFixed(2)}s`, 20, 30);
      ctx.fillText(`Frame index: ${closestFrameIndex} / Total frames: ${frames.length}`, 20, 50);
      ctx.fillText(`Frame timestamp: ${frameData.timestamp?.toFixed(2) || 'N/A'}s`, 20, 70);
      ctx.fillText(`Frame data: ${Object.keys(frameData || {}).join(', ')}`, 20, 90);
    }
    
    // Determine if video is in portrait
    const isPortrait = videoOrientation === 'portrait';

    // Draw landmark connections (skeleton lines)
    if (frameData.keypoints) {
      // Define connections for the pose landmarks (simplified for squat analysis)
      const connections = [
        // Torso
        [11, 12], // Left shoulder to right shoulder
        [11, 23], // Left shoulder to left hip
        [12, 24], // Right shoulder to right hip
        [23, 24], // Left hip to right hip
        
        // Left arm
        [11, 13], // Left shoulder to left elbow
        [13, 15], // Left elbow to left wrist
        
        // Right arm
        [12, 14], // Right shoulder to right elbow
        [14, 16], // Right elbow to right wrist
        
        // Left leg
        [23, 25], // Left hip to left knee
        [25, 27], // Left knee to left ankle
        [27, 31], // Left ankle to left foot
        
        // Right leg
        [24, 26], // Right hip to right knee
        [26, 28], // Right knee to right ankle
        [28, 32], // Right ankle to right foot
      ];
      
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      
      // Draw skeleton lines
      connections.forEach(([i, j]) => {
        const landmark1 = frameData.keypoints[i];
        const landmark2 = frameData.keypoints[j];
        
        if (!landmark1 || !landmark2 || 
            typeof landmark1.x !== 'number' || 
            typeof landmark2.x !== 'number' ||
            landmark1.visibility < 0.5 || 
            landmark2.visibility < 0.5) {
          return;
        }
        
        const p1 = transformCoordinates(
          landmark1.x, landmark1.y, 
          ctx.canvas.width, ctx.canvas.height, 
          isPortrait,
          i // Pass landmark index for special case handling
        );
        
        const p2 = transformCoordinates(
          landmark2.x, landmark2.y, 
          ctx.canvas.width, ctx.canvas.height, 
          isPortrait,
          j // Pass landmark index for special case handling
        );
        
        ctx.beginPath();
        ctx.moveTo(p1.x * ctx.canvas.width, p1.y * ctx.canvas.height);
        ctx.lineTo(p2.x * ctx.canvas.width, p2.y * ctx.canvas.height);
        ctx.stroke();
      });
      
      // Define relevant landmark indices for squat analysis (exclude facial features)
      const relevantLandmarks = [
        11, 12, 13, 14, 15, 16, // shoulders and arms
        23, 24, 25, 26, 27, 28, 31, 32 // hips, knees, ankles, feet
      ];
      
      // Draw only relevant landmark points
      relevantLandmarks.forEach((idx) => {
        const landmark = frameData.keypoints[idx];
        if (!landmark || typeof landmark.x !== 'number' || landmark.visibility < 0.5) {
          return;
        }
        
        // Transform coordinates
        const coord = transformCoordinates(
          landmark.x, landmark.y, 
          ctx.canvas.width, ctx.canvas.height, 
          isPortrait,
          idx // Pass landmark index for special handling
        );
        
        // Use different colors for different body parts
        if (idx === 11 || idx === 12) { // Shoulders
          ctx.fillStyle = 'red';
        } else if (idx === 23 || idx === 24) { // Hips
          ctx.fillStyle = 'blue';
        } else if (idx === 25 || idx === 26) { // Knees
          ctx.fillStyle = 'green';
        } else if (idx === 27 || idx === 28 || idx === 31 || idx === 32) { // Ankles and feet
          ctx.fillStyle = 'yellow';
        } else {
          ctx.fillStyle = 'white';
        }
        
        // Draw landmark point
        ctx.beginPath();
        ctx.arc(
          coord.x * ctx.canvas.width, 
          coord.y * ctx.canvas.height, 
          5, 0, 2 * Math.PI
        );
        ctx.fill();
        
        // Add index number for debugging
        if (showDebug) {
          ctx.fillStyle = 'white';
          ctx.font = '10px Arial';
          ctx.fillText(`${idx}`, coord.x * ctx.canvas.width + 7, coord.y * ctx.canvas.height);
        }
      });
    }

    // Draw measurements and analysis
    if (frameData.measurements) {
      const { kneeAngle, depthRatio, shoulderMidfootDiff } = frameData.measurements;

      // If all values are null, skip drawing the stats box
      if (kneeAngle === null && depthRatio === null && shoulderMidfootDiff === null) {
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

      // Knee Angle
      ctx.fillStyle = 'white';
      ctx.fillText('Knee Angle:', xOffset + paddingRight, yOffset);
      ctx.fillStyle = '#00ff00';
      ctx.fillText(
        kneeAngle !== null && typeof kneeAngle === 'number' ? ` ${Math.round(kneeAngle)}°` : ' N/A',
        xOffset + paddingRight + 90, yOffset
      );
      yOffset += 25;

      // Depth Ratio
      ctx.fillStyle = 'white';
      ctx.fillText('Depth Ratio:', xOffset + paddingRight, yOffset);
      ctx.fillStyle = '#ff9900';
      ctx.fillText(
        depthRatio !== null && typeof depthRatio === 'number' ? ` ${depthRatio.toFixed(2)}` : ' N/A',
        xOffset + paddingRight + 100, yOffset
      );
      yOffset += 25;

      // Shoulder-Midfoot Difference
      ctx.fillStyle = 'white';
      ctx.fillText('Shoulder-Midfoot Diff:', xOffset + paddingRight, yOffset);
      ctx.fillStyle = '#00ffff';
      ctx.fillText(
        shoulderMidfootDiff !== null && typeof shoulderMidfootDiff === 'number' ? ` ${shoulderMidfootDiff.toFixed(1)}` : ' N/A',
        xOffset + paddingRight + 170, yOffset
      );
    }

    // Draw feedback arrows
    if (frameData.arrows && Array.isArray(frameData.arrows)) {
      frameData.arrows.forEach(arrow => {
        // Skip arrows with empty or undefined messages
        if (!arrow.message) return;
        if (arrow.start && arrow.end && typeof arrow.start.x === 'number' && typeof arrow.end.x === 'number') {
          // Apply feedback message corrections
          let messageText = arrow.message;
          let startPoint = {...arrow.start};
          let endPoint = {...arrow.end};
          
          // Fix "chest up" arrow to actually point to chest instead of hips
          if (messageText.toLowerCase().includes("chest up")) {
            // If the message is about chest but points elsewhere, correct the target
            const chest = frameData.keypoints.find((kp, idx) => idx === 11 || idx === 12);
            if (chest && typeof chest.x === 'number') {
              endPoint = {x: chest.x, y: chest.y};
            }
          }
          
          ctx.beginPath();
          ctx.strokeStyle = arrow.color || 'yellow';
          ctx.lineWidth = 3;

          // Apply coordinate transformation to arrow points
          const start = transformCoordinates(
            startPoint.x, startPoint.y, 
            ctx.canvas.width, ctx.canvas.height, 
            isPortrait
          );
          
          const end = transformCoordinates(
            endPoint.x, endPoint.y, 
            ctx.canvas.width, ctx.canvas.height, 
            isPortrait
          );

          const startX = start.x * ctx.canvas.width;
          const startY = start.y * ctx.canvas.height;
          const endX = end.x * ctx.canvas.width;
          const endY = end.y * ctx.canvas.height;

          // Draw line
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
          ctx.stroke();

          // Draw arrowhead
          const angle = Math.atan2(endY - startY, endX - startX);
          const arrowLength = 15;

          ctx.beginPath();
          ctx.moveTo(endX, endY);
          ctx.lineTo(
            endX - arrowLength * Math.cos(angle - Math.PI / 6),
            endY - arrowLength * Math.sin(angle - Math.PI / 6)
          );
          ctx.moveTo(endX, endY);
          ctx.lineTo(
            endX - arrowLength * Math.cos(angle + Math.PI / 6),
            endY - arrowLength * Math.sin(angle + Math.PI / 6)
          );
          ctx.stroke();

          // Offset message away from landmark along arrow direction
          const vecX = endX - startX;
          const vecY = endY - startY;
          const len = Math.max(Math.hypot(vecX, vecY), 0.001);
          const normX = vecX / len;
          const normY = vecY / len;
          const msgOffset = 40; // Increase offset from arrow head for better visibility
          const textX = endX + normX * msgOffset;
          const textY = endY + normY * msgOffset;

          // Draw background rectangle for text
          ctx.font = '14px Arial';
          const textWidth = ctx.measureText(arrow.message).width;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          // Make the background larger for better readability
          ctx.fillRect(textX - 5, textY - 15, textWidth + 10, 25);

          // Draw text
          ctx.fillStyle = 'white';
          ctx.fillText(messageText, textX, textY);
        }
      });
    }
    
    // Draw frame indicator
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '12px Arial';
    ctx.fillText(`Frame: ${closestFrameIndex}, Time: ${frameData.timestamp.toFixed(2)}s`, 10, ctx.canvas.height - 10);
    
  }, [hasAnalysisData, analysisData, videoOrientation, showDebug, transformCoordinates]);

  // Log any issues with analysis data
  useEffect(() => {
    if (analysisData && (!analysisData.frames || analysisData.frames.length === 0)) {
      console.warn("Analysis data has no valid frames", analysisData);
      setError("Analysis completed but no valid frames were found. Try recording a clearer video.");
    }
    
    if (analysisData && (analysisData.frame_count < 0 || !isFinite(analysisData.frame_count))) {
      console.warn("Analysis data has invalid frame count:", analysisData.frame_count);
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
      setDebugInfo(prev => ({
        ...prev,
        videoMetadata: {
          width: videoWidth,
          height: videoHeight,
          duration: video.duration,
          orientation: orientation,
          aspectRatio: (videoWidth / videoHeight).toFixed(2)
        }
      }));
      
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
        {JSON.stringify(debugInfo, null, 2)}
      </DebugInfo>
      
      <AnalysisPanel>
        <h3>
          Analysis Results
          {usingLocalAnalysis && (
            <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
              Local Mode
            </span>
          )}
        </h3>
        {hasAnalysisData ? (
          <>
            {/* Only show StatBox if at least one measurement is not null */}
            {(() => {
              const m = analysisData.frames[0]?.measurements || {};
              const allNull =
                m.kneeAngle === null &&
                m.depthRatio === null &&
                m.shoulderMidfootDiff === null;
              if (allNull) return null;
              return (
                <StatBox>
                  <StatTitle>Measurements</StatTitle>
                  <div className="flex flex-wrap mt-2">
                    {Object.entries(m).map(([key, value]) => (
                      <div key={key} className="w-1/3 mb-2">
                        <StatLabel>{key}</StatLabel>
                        <StatValue>
                          {value === null || value === undefined
                            ? 'N/A'
                            : typeof value === 'number'
                              ? key === 'kneeAngle'
                                ? Math.round(value) + '°'
                                : key === 'depthRatio'
                                  ? value.toFixed(2)
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
              <h4>Feedback Tips</h4>
              {usingLocalAnalysis && (
                <div className="mb-3 text-xs bg-blue-50 text-blue-700 p-2 rounded">
                  Simplified feedback based on local analysis
                </div>
              )}
              {analysisData.frames.some(frame => frame.arrows && frame.arrows.length > 0) ? (
                <FeedbackList>
                  {Array.from(new Set(
                    analysisData.frames
                      .flatMap(frame => frame.arrows || [])
                      .map(arrow => arrow.message)
                      .filter(Boolean)
                  )).map((message, index) => (
                    <FeedbackTip key={index}>
                      <Info size={16} className="mr-2" />
                      {message}
                    </FeedbackTip>
                  ))}
                </FeedbackList>
              ) : (
                <p>Great job! No significant issues detected.</p>
              )}
            </FeedbackSection>
          </>
        ) : (
          <div className="text-center p-4">
            <div className="font-semibold mb-2">Analysis data not available</div>
            <p className="text-sm text-gray-600 mb-3">
              Analysis couldn't be completed due to a timeout (45 seconds), network issue, or processing error.
            </p>
            <p className="text-sm text-gray-600">
              Tip: Try recording a shorter video (5-10 seconds) for better processing success.
            </p>
          </div>
        )}
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
            {JSON.stringify(debugInfo.frameTimestamps, null, 2)}
          </pre>
        </div>
      )}
    </Container>
  );
};

export default ExercisePlayback;