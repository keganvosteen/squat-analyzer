// src/components/ExercisePlayback.jsx
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, SkipForward, SkipBack, AlertTriangle, CheckCircle, Info, Maximize2, Minimize2 } from 'lucide-react';
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
`;

const StyledVideo = styled.video`
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
  display: ${props => props.show ? 'block' : 'none'};
`;

const ExercisePlayback = ({ videoUrl, analysisData, usingLocalAnalysis = false }) => {
  console.log("ExercisePlayback Component");
  console.log("Video URL:", videoUrl);
  console.log("Analysis data:", analysisData);
  console.log("Using local analysis:", usingLocalAnalysis);
  
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const timelineRef = useRef(null);
  const canvasRef = useRef(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeFeedback, setActiveFeedback] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoverPosition, setHoverPosition] = useState(null);
  const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState({});
  const [showDebug, setShowDebug] = useState(false);
  const [videoOrientation, setVideoOrientation] = useState(null);
  
  // Track canvas dimensions for debugging
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 });
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
  
  // Toggle debug display with double-click
  const toggleDebug = () => {
    setShowDebug(prev => !prev);
  };
  
  // Check if we have valid analysis data
  const hasAnalysisData = analysisData && 
                        analysisData.success && 
                        Array.isArray(analysisData.frames) && 
                        analysisData.frames.length > 0;

  // Log any issues with analysis data
  useEffect(() => {
    if (analysisData && (!analysisData.frames || analysisData.frames.length === 0)) {
      console.warn("Analysis data has no valid frames", analysisData);
      setError("Analysis completed but no valid frames were found. Try recording a clearer video.");
    }
    
    if (analysisData && (analysisData.frame_count < 0 || !isFinite(analysisData.frame_count))) {
      console.warn("Analysis data has invalid frame count:", analysisData.frame_count);
    }
  }, [analysisData]);

  // Reset error when video URL changes
  useEffect(() => {
    if (videoUrl) {
      setError(null);
    }
  }, [videoUrl]);

  // Handle video metadata loading
  const handleLoadedMetadata = () => {
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
      
      // Initialize canvas size to match video dimensions exactly
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        canvas.width = videoWidth;
        canvas.height = videoHeight;
        setCanvasDimensions({ width: canvas.width, height: canvas.height });
        
        // Initial render of overlays
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Clear any previous drawings
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          drawOverlays(ctx, 0);
        }
      }
    }
  };

  // Adjust to properly handle landmark coordinates on potentially rotated video
  const transformCoordinates = useCallback((x, y, width, height, isPortrait = false) => {
    // For mobile recordings that might be rotated
    if (isPortrait) {
      // If the video is portrait and seems to be rotated left 90 degrees
      // This adjusts for the 90 degree counterclockwise rotation
      return { 
        x: 1.0 - y, // Flip the y coordinate to become the new x
        y: x        // Use the x coordinate as the new y
      };
    }
    
    // No transformations needed for standard landscape orientation
    return { x, y };
  }, []);
  
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

  // Draw overlays on the canvas with better coordinate handling
  const drawOverlays = useCallback((ctx, timestamp) => {
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    // Update debug info
    setDebugInfo(prev => ({
      ...prev,
      currentFrame: {
        timestamp,
        canvasWidth: ctx.canvas.width,
        canvasHeight: ctx.canvas.height
      }
    }));
    
    if (!hasAnalysisData) {
      // Draw "Analysis not available" message
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, 220, 30);
      ctx.font = '16px Arial';
      ctx.fillStyle = 'white';
      ctx.fillText('Analysis not available', 10, 20);
      return;
    }
    
    // Find the closest frame to the current timestamp
    const currentSeconds = timestamp || 0;
    const frames = analysisData.frames;
    
    // Find the frame that's closest to our current time
    let closestFrame = null;
    let smallestDiff = Infinity;
    
    for (const frame of frames) {
      const diff = Math.abs(frame.timestamp - currentSeconds);
      if (diff < smallestDiff) {
        smallestDiff = diff;
        closestFrame = frame;
      }
    }
    
    if (!closestFrame) {
      return;
    }
    
    const isPortrait = videoOrientation === 'portrait';
    console.log(`Drawing frame at ${closestFrame.timestamp.toFixed(2)}s, diff: ${smallestDiff.toFixed(2)}s, orientation: ${videoOrientation}`);
    
    // Update debug with frame info
    setDebugInfo(prev => ({
      ...prev,
      closestFrame: {
        timestamp: closestFrame.timestamp,
        diff: smallestDiff,
        frameIndex: closestFrame.frame,
        hasLandmarks: closestFrame.landmarks?.length || 0
      }
    }));
    
    // Draw landmarks if available
    if (closestFrame.landmarks && Array.isArray(closestFrame.landmarks)) {
      console.log(`Drawing ${closestFrame.landmarks.length} landmarks`);
      
      // Draw skeleton lines connecting landmarks
      const connections = [
        // Torso
        [11, 12], [11, 23], [12, 24], [23, 24],
        // Right arm
        [11, 13], [13, 15],
        // Left arm
        [12, 14], [14, 16],
        // Right leg
        [23, 25], [25, 27], [27, 31],
        // Left leg
        [24, 26], [26, 28], [28, 32]
      ];
      
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      
      connections.forEach(([startIdx, endIdx]) => {
        const start = closestFrame.landmarks[startIdx];
        const end = closestFrame.landmarks[endIdx];
        
        if (start && end && typeof start.x === 'number' && typeof end.x === 'number') {
          // Transform coordinates for proper rendering based on video orientation
          const startCoord = transformCoordinates(
            start.x, start.y, 
            ctx.canvas.width, ctx.canvas.height, 
            isPortrait
          );
          
          const endCoord = transformCoordinates(
            end.x, end.y, 
            ctx.canvas.width, ctx.canvas.height, 
            isPortrait
          );
          
          ctx.beginPath();
          ctx.moveTo(startCoord.x * ctx.canvas.width, startCoord.y * ctx.canvas.height);
          ctx.lineTo(endCoord.x * ctx.canvas.width, endCoord.y * ctx.canvas.height);
          ctx.stroke();
        }
      });
      
      // Draw landmark points
      ctx.fillStyle = 'red';
      closestFrame.landmarks.forEach((landmark, idx) => {
        if (typeof landmark.x === 'number') {
          // Transform coordinates based on video orientation
          const coord = transformCoordinates(
            landmark.x, landmark.y, 
            ctx.canvas.width, ctx.canvas.height, 
            isPortrait
          );
          
          ctx.beginPath();
          ctx.arc(
            coord.x * ctx.canvas.width, 
            coord.y * ctx.canvas.height, 
            4, 0, 2 * Math.PI
          );
          ctx.fill();
          
          // Add index number for debugging
          if (showDebug) {
            ctx.fillStyle = 'yellow';
            ctx.font = '10px Arial';
            ctx.fillText(`${idx}`, coord.x * ctx.canvas.width + 5, coord.y * ctx.canvas.height + 5);
            ctx.fillStyle = 'red';
          }
        }
      });
    }

    // Draw measurements and analysis
    if (closestFrame.measurements) {
      const { kneeAngle, depthRatio, shoulderMidfootDiff } = closestFrame.measurements;
      
      // Position text in top-left corner
      ctx.font = '16px Arial';
      let yOffset = 30;
      const xOffset = 10;
      
      // Draw background for text for better visibility
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, 250, 100);
      
      // Knee Angle
      ctx.fillStyle = 'white';
      ctx.fillText('Knee Angle:', xOffset, yOffset);
      ctx.fillStyle = '#00ff00';
      ctx.fillText(` ${Math.round(kneeAngle)}°`, xOffset + 90, yOffset);
      yOffset += 25;
      
      // Depth Ratio
      ctx.fillStyle = 'white';
      ctx.fillText('Depth Ratio:', xOffset, yOffset);
      ctx.fillStyle = '#ff9900';
      ctx.fillText(` ${depthRatio.toFixed(2)}`, xOffset + 100, yOffset);
      yOffset += 25;
      
      // Shoulder-Midfoot Difference
      ctx.fillStyle = 'white';
      ctx.fillText('Shoulder-Midfoot Diff:', xOffset, yOffset);
      ctx.fillStyle = '#00ffff';
      ctx.fillText(` ${shoulderMidfootDiff.toFixed(1)}`, xOffset + 170, yOffset);
    }

    // Draw feedback arrows
    if (closestFrame.arrows && Array.isArray(closestFrame.arrows)) {
      closestFrame.arrows.forEach(arrow => {
        if (arrow.start && arrow.end && typeof arrow.start.x === 'number' && typeof arrow.end.x === 'number') {
          ctx.beginPath();
          ctx.strokeStyle = arrow.color || 'yellow';
          ctx.lineWidth = 3;
          
          const startX = arrow.start.x * ctx.canvas.width;
          const startY = arrow.start.y * ctx.canvas.height;
          const endX = arrow.end.x * ctx.canvas.width;
          const endY = arrow.end.y * ctx.canvas.height;
          
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
          
          // Draw message with background for visibility
          if (arrow.message) {
            ctx.font = '14px Arial';
            const textWidth = ctx.measureText(arrow.message).width;
            
            // Draw background rectangle for text
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(endX + 10, endY - 15, textWidth + 10, 20);
            
            // Draw text
            ctx.fillStyle = 'white';
            ctx.fillText(arrow.message, endX + 15, endY);
          }
        }
      });
    }
    
    // Draw frame indicator
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '12px Arial';
    ctx.fillText(`Frame: ${closestFrame.frame}, Time: ${closestFrame.timestamp.toFixed(2)}s`, 10, ctx.canvas.height - 10);
    
  }, [hasAnalysisData, analysisData, videoOrientation, showDebug, transformCoordinates]);

  // Handle video time updates
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const currentTime = videoRef.current.currentTime;
      setCurrentTime(currentTime);
      
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        // Draw overlays appropriate for the current video time
        drawOverlays(ctx, currentTime);
      }
    }
  };

  // Handle video errors
  const handleError = (e) => {
    console.error('Video error:', e);
    setError('Error playing video. Please try recording again.');
  };

  // Check if the video orientation is portrait (for coordinate transform)
  const isPortraitVideo = useCallback(() => {
    return videoOrientation === 'portrait';
  }, [videoOrientation]);

  // Set up video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    console.log("Setting up video event listeners");
    
    // Use rAF for smoother animations
    let animationFrameId;
    
    const updateCanvas = () => {
      if (video.paused || video.ended) {
        return;
      }
      
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        drawOverlays(ctx, video.currentTime);
      }
      
      // Continue animation loop
      animationFrameId = requestAnimationFrame(updateCanvas);
    };
    
    const handlePlay = () => {
      setIsPlaying(true);
      // Start animation loop when video plays
      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(updateCanvas);
    };
    
    const handlePause = () => {
      setIsPlaying(false);
      // Stop animation loop when video pauses
      cancelAnimationFrame(animationFrameId);
      
      // Draw one last frame at the current position
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        drawOverlays(ctx, video.currentTime);
      }
    };
    
    // Handle regular time updates for UI updates (not for drawing)
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };
    
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('seeking', handlePause); // Update frame when seeking
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('error', handleError);

    return () => {
      cancelAnimationFrame(animationFrameId);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('seeking', handlePause);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);
    };
  }, [videoRef.current, drawOverlays, handleLoadedMetadata]);

  // Toggle play/pause
  const togglePlayPause = () => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(e => {
        console.error("Error playing video:", e);
        setError("Could not play video. This may be due to browser permissions or an unsupported format.");
      });
    }
  };

  return (
    <Container ref={containerRef}>
      <h2>Exercise Playback {usingLocalAnalysis && <span className="text-sm text-yellow-600">(Local Analysis Mode)</span>}</h2>
      
      {error && (
        <ErrorMessage>
          <AlertTriangle size={18} />
          {error}
        </ErrorMessage>
      )}
      
      <VideoContainer onDoubleClick={toggleDebug}>
        <StyledVideo
          ref={videoRef}
          src={videoUrl}
          controls={true}
          onError={handleError}
          playsInline
        >
          <source src={videoUrl} type="video/webm" />
          Your browser does not support the video tag.
        </StyledVideo>
        <CanvasOverlay ref={canvasRef} />
      </VideoContainer>
      
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
        <Button onClick={togglePlayPause}>
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          {isPlaying ? 'Pause' : 'Play'}
        </Button>
        
        <Button
          onClick={() => {
            if (videoRef.current) {
              videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 1);
            }
          }}
          >
            <SkipBack size={20} />
          Back 1s
        </Button>
        
        <Button
          onClick={() => {
            if (videoRef.current) {
              videoRef.current.currentTime = Math.min(videoRef.current.duration, videoRef.current.currentTime + 1);
            }
          }}
          >
            <SkipForward size={20} />
          Forward 1s
        </Button>
        
        <Button onClick={() => setShowDebug(!showDebug)}>
          <Info size={20} />
          {showDebug ? 'Hide Debug' : 'Show Debug'}
        </Button>
      </Controls>
      
      {/* Debug information panel */}
      <DebugInfo show={showDebug}>
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
            <StatBox>
              <StatTitle>Measurements</StatTitle>
              <div className="flex flex-wrap mt-2">
                {analysisData.frames.length > 0 && analysisData.frames[0].measurements && (
                  Object.entries(analysisData.frames[0].measurements).map(([key, value]) => (
                    <div key={key} className="w-1/3 mb-2">
                      <StatLabel>{key}</StatLabel>
                      <StatValue>{typeof value === 'number' ? value.toFixed(1) : value}</StatValue>
            </div>
                  ))
                )}
              </div>
            </StatBox>
            
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
    </Container>
  );
};

export default ExercisePlayback;