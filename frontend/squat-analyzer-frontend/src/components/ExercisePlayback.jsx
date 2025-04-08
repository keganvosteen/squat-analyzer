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
  width: 100%;
  max-width: 800px;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
`;

const Video = styled.video`
  width: 100%;
  height: auto;
  display: block;
`;

const Canvas = styled.canvas`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
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

const ExercisePlayback = ({ videoUrl, analysisData, squatCount = 0, squatTimings = [], sessionId }) => {
  console.log('ExercisePlayback Component');
  console.log('Video URL:', videoUrl);
  console.log('Analysis data:', analysisData);
  
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
  
  // Check if we have valid analysis data
  const hasAnalysisData = analysisData && 
                        analysisData.success && 
                        Array.isArray(analysisData.frames) && 
                        analysisData.frames.length > 0;

  // Reset error when video URL changes
  useEffect(() => {
    if (videoUrl) {
      setError(null);
    }
  }, [videoUrl]);

  // Draw overlays on the canvas
  const drawOverlays = useCallback((ctx, timestamp) => {
    if (!ctx || !hasAnalysisData) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
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
    
    if (!closestFrame) return;
    
    // Draw landmarks if available
    if (closestFrame.landmarks && Array.isArray(closestFrame.landmarks)) {
      console.log("Drawing landmarks:", closestFrame.landmarks.length);
      
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
        
        if (start && end) {
          ctx.beginPath();
          ctx.moveTo(start.x * ctx.canvas.width, start.y * ctx.canvas.height);
          ctx.lineTo(end.x * ctx.canvas.width, end.y * ctx.canvas.height);
          ctx.stroke();
        }
      });
      
      // Draw landmark points
      ctx.fillStyle = 'red';
      closestFrame.landmarks.forEach(landmark => {
        ctx.beginPath();
        ctx.arc(
          landmark.x * ctx.canvas.width, 
          landmark.y * ctx.canvas.height, 
          3, 0, 2 * Math.PI
        );
        ctx.fill();
      });
    }

    // Draw measurements and analysis
    if (closestFrame.measurements) {
      const { kneeAngle, depthRatio, shoulderMidfootDiff } = closestFrame.measurements;
      
      // Position text in top-left corner
      ctx.font = '16px Arial';
      let yOffset = 30;
      const xOffset = 10;
      
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
        if (arrow.start && arrow.end) {
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
          
          // Draw message
          if (arrow.message) {
            ctx.font = '14px Arial';
            ctx.fillStyle = 'white';
            ctx.fillText(arrow.message, endX + 10, endY);
          }
        }
      });
    }
  }, [hasAnalysisData, analysisData]);

  // Handle video time updates
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        drawOverlays(ctx, videoRef.current.currentTime);
      }
    }
  };

  // Handle video metadata loading
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      console.log(`Video loaded: ${videoRef.current.videoWidth}x${videoRef.current.videoHeight}, duration: ${videoRef.current.duration}s`);
      
      // Initialize canvas size
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        
        // Initial render of overlays
        const ctx = canvas.getContext('2d');
        drawOverlays(ctx, 0);
      }
    }
  };

  // Handle video errors
  const handleError = (e) => {
    console.error('Video error:', e);
    setError('Error playing video. Please try recording again.');
  };

  // Set up video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    console.log("Setting up video event listeners");
    
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);
    };
  }, [videoRef.current, drawOverlays]);

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
    
    setIsPlaying(!isPlaying);
  };

  return (
    <Container ref={containerRef}>
      <h2>Exercise Playback</h2>
      
      {error && (
        <ErrorMessage>
          <AlertTriangle size={18} />
          {error}
        </ErrorMessage>
      )}
      
      <VideoContainer>
        <Video
          ref={videoRef}
          src={videoUrl}
          controls={false}
          onError={handleError}
        >
          <source src={videoUrl} type="video/webm" />
          Your browser does not support the video tag.
        </Video>
        <Canvas ref={canvasRef} />
      </VideoContainer>
      
      <Controls>
        <Button onClick={togglePlayPause}>
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          {isPlaying ? 'Pause' : 'Play'}
        </Button>
      </Controls>
      
      <AnalysisPanel>
        <h3>Analysis Results</h3>
        
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
          <div>
            {analysisData ? (
              <p>Analysis failed. You can still review your recording, but feedback is not available.</p>
            ) : (
              <p>Video recorded successfully. Analysis data is not available.</p>
            )}
          </div>
        )}
      </AnalysisPanel>
    </Container>
  );
};

export default ExercisePlayback;