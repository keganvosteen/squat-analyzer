// src/components/ExercisePlayback.jsx
import React, { useRef, useEffect, useState } from 'react';
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

const ExercisePlayback = ({ videoUrl, feedbackData = [], squatCount = 0, squatTimings = [], sessionId }) => {
  console.log('ExercisePlayback Component');
  console.log('Video URL:', videoUrl);
  console.log('Feedback data points:', feedbackData?.length || 0);
  console.log('Squat timings:', squatTimings?.length || 0);
  
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const timelineRef = useRef(null);
  const canvasRef = useRef(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentAngle, setCurrentAngle] = useState(null);
  const [activeFeedback, setActiveFeedback] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoverPosition, setHoverPosition] = useState(null);
  const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);
  const [hoveredMarker, setHoveredMarker] = useState(null);
  const [videoError, setVideoError] = useState(null);
  const [debugInfo, setDebugInfo] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [error, setError] = useState(null);
  const [apiConnectionFailed, setApiConnectionFailed] = useState(false);
  const [stream, setStream] = useState(null);

  // Debug info for development
  useEffect(() => {
    console.group("ExercisePlayback Component");
    console.log("Video URL:", videoUrl);
    console.log("Feedback data points:", feedbackData?.length || 0);
    console.log("Squat timings:", squatTimings?.length || 0);
    console.groupEnd();
  }, [videoUrl, feedbackData, squatTimings]);

  // Handle fullscreen toggle
  const toggleFullscreen = () => {
    if (!isFullscreen) {
      const element = containerRef.current;
      if (element) {
        if (element.requestFullscreen) {
          element.requestFullscreen();
        } else if (element.webkitRequestFullscreen) { 
          element.webkitRequestFullscreen();
        } else if (element.msRequestFullscreen) { 
          element.msRequestFullscreen();
        }
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) { 
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    }
  };
  
  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // Jump to a specific time in the video (input in ms)
  const jumpToTime = (timeInMs) => {
    if (!videoRef.current) return;
    
    try {
      const time = timeInMs / 1000; // Convert to seconds
      videoRef.current.currentTime = Math.max(0, Math.min(time, videoRef.current.duration || 0));
      
      if (!isPlaying) {
        videoRef.current.play().catch(err => {
          console.warn("Auto-play failed after seek:", err);
        });
      }
    } catch (err) {
      console.error("Error jumping to time:", err);
    }
  };

  // Toggle play/pause
  const togglePlayPause = () => {
    if (!videoRef.current) return;

    try {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(err => {
          console.warn("Play failed:", err);
          setVideoError("Browser blocked autoplay. Please click play again or use the video controls.");
        });
      }
    } catch (err) {
      console.error("Toggle play/pause error:", err);
      setVideoError("Video playback error");
    }
  };

  // Skip to next or previous squat marker
  const skipToSquat = (direction) => {
    if (!videoRef.current || !squatTimings.length) return;
    
    try {
      const currentTimeMs = videoRef.current.currentTime * 1000;
      
      // Combine bottom and completed squat points
      const allPoints = [];
      squatTimings.forEach((timing) => {
        if (timing.bottom) {
          allPoints.push({ time: timing.bottom, type: 'bottom', count: timing.count });
        }
        if (timing.completed) {
          allPoints.push({ time: timing.completed, type: 'completed', count: timing.count });
        }
      });
      allPoints.sort((a, b) => a.time - b.time);
      
      if (direction === 'next') {
        const nextPoint = allPoints.find(point => point.time * 1000 > currentTimeMs);
        if (nextPoint) {
          jumpToTime(nextPoint.time * 1000);
        }
      } else {
        const prevPoints = allPoints.filter(point => point.time * 1000 < currentTimeMs);
        if (prevPoints.length > 0) {
          jumpToTime(prevPoints[prevPoints.length - 1].time * 1000);
        }
      }
    } catch (err) {
      console.error("Skip to squat error:", err);
    }
  };

  // Create timeline markers for key events
  const createMarkers = () => {
    const video = videoRef.current;
    const timeline = timelineRef.current;
    if (!video || !timeline || !video.duration) return;

    try {
      // Clear existing markers
      while (timeline.firstChild) {
        timeline.removeChild(timeline.firstChild);
      }

      // Process feedback data to create warning markers
      if (feedbackData && feedbackData.length) {
        const warningTimeMap = new Map(); // timestamp (sec) -> warnings array
        
        feedbackData.forEach((data) => {
          if (!data.timestamp) return;
          
          const timestamp = data.timestamp / 1000; // convert to seconds
          if (timestamp < 0 || timestamp > video.duration) return;
          
          if (data.warnings && data.warnings.length > 0) {
            if (!warningTimeMap.has(timestamp)) {
              warningTimeMap.set(timestamp, []);
            }
            
            data.warnings.forEach(warning => {
              const warnings = warningTimeMap.get(timestamp);
              if (!warnings.find(w => w.type === warning.type)) {
                warnings.push(warning);
              }
            });
          }
        });
        
        // Create warning markers
        warningTimeMap.forEach((warnings, timestamp) => {
          const percent = (timestamp / video.duration) * 100;
          if (percent < 0 || percent > 100) return;
          
          const marker = document.createElement('div');
          marker.className = 'absolute top-0 h-full w-1.5 bg-red-500 cursor-pointer hover:w-2.5 transition-all';
          marker.style.left = `${percent}%`;
          marker.title = warnings.map(w => w.message).join('\n');
          
          // Interaction events
          marker.onclick = () => jumpToTime(timestamp * 1000);
          marker.onmouseenter = () => setHoveredMarker({ time: timestamp, warnings });
          marker.onmouseleave = () => setHoveredMarker(null);
          
          timeline.appendChild(marker);
        });
      }
      
      // Create markers for squat timings
      if (squatTimings && squatTimings.length) {
        squatTimings.forEach((timing) => {
          if (timing.bottom) {
            const percent = (timing.bottom / video.duration) * 100;
            if (percent < 0 || percent > 100) return;
            
            const marker = document.createElement('div');
            marker.className = 'absolute top-0 h-full w-1.5 bg-blue-500 cursor-pointer hover:w-2.5 transition-all';
            marker.style.left = `${percent}%`;
            marker.title = `Bottom of squat #${timing.count}`;
            marker.onclick = () => jumpToTime(timing.bottom * 1000);
            
            // Add tooltip on hover
            marker.onmouseenter = () => setHoveredMarker({ 
              time: timing.bottom, 
              type: 'bottom',
              count: timing.count,
              message: `Bottom of squat #${timing.count}`
            });
            marker.onmouseleave = () => setHoveredMarker(null);
            
            timeline.appendChild(marker);
          }
          
          if (timing.completed) {
            const percent = (timing.completed / video.duration) * 100;
            if (percent < 0 || percent > 100) return;
            
            const marker = document.createElement('div');
            marker.className = 'absolute top-0 h-full w-1.5 bg-green-500 cursor-pointer hover:w-2.5 transition-all';
            marker.style.left = `${percent}%`;
            marker.title = `Completed squat #${timing.count}`;
            marker.onclick = () => jumpToTime(timing.completed * 1000);
            
            // Add tooltip on hover
            marker.onmouseenter = () => setHoveredMarker({ 
              time: timing.completed, 
              type: 'completed',
              count: timing.count,
              message: `Completed squat #${timing.count}`
            });
            marker.onmouseleave = () => setHoveredMarker(null);
            
            timeline.appendChild(marker);
          }
        });
      }
    } catch (err) {
      console.error("Error creating timeline markers:", err);
    }
  };

  // Find active feedback based on current video time
  const findActiveFeedback = () => {
    if (!feedbackData?.length || !videoRef.current) return null;
    
    try {
      const currentTimeMs = videoRef.current.currentTime * 1000;
      
      // Find feedback within 500ms of current time
      const closeItems = feedbackData.filter(
        data => data.timestamp && Math.abs(data.timestamp - currentTimeMs) < 500
      );
      
      if (!closeItems.length) return null;
      
      // Return the closest one
      return closeItems.reduce((closest, curr) => {
        if (!closest.timestamp) return curr;
        if (!curr.timestamp) return closest;
        
        return Math.abs(curr.timestamp - currentTimeMs) < Math.abs(closest.timestamp - currentTimeMs)
          ? curr : closest;
      });
    } catch (err) {
      console.error("Error finding active feedback:", err);
      return null;
    }
  };

  // Format time in MM:SS.ms format
  const formatTime = (seconds) => {
    try {
      if (isNaN(seconds) || seconds < 0) return "00:00.0";
      
      const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
      const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
      const ms = Math.floor((seconds % 1) * 10);
      
      return `${mins}:${secs}.${ms}`;
    } catch (err) {
      return "00:00.0";
    }
  };

  // Draw overlays on the canvas
  const drawOverlays = (ctx, videoElement, landmarks, feedback) => {
    if (!ctx || !videoElement || !landmarks) return;

    // Clear previous frame
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // Set up styles for landmarks and lines
    ctx.strokeStyle = 'white';
    ctx.fillStyle = 'white';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw landmarks
    const points = landmarks.map(point => ({
      x: point.x * ctx.canvas.width,
      y: point.y * ctx.canvas.height
    }));

    // Draw connecting lines
    ctx.beginPath();
    // Right side
    if (points[11] && points[13] && points[15]) { // Right shoulder to ankle
      ctx.moveTo(points[11].x, points[11].y); // Right shoulder
      ctx.lineTo(points[13].x, points[13].y); // Right elbow
      ctx.lineTo(points[15].x, points[15].y); // Right wrist
    }
    if (points[23] && points[25] && points[27]) { // Right hip to foot
      ctx.moveTo(points[23].x, points[23].y); // Right hip
      ctx.lineTo(points[25].x, points[25].y); // Right knee
      ctx.lineTo(points[27].x, points[27].y); // Right ankle
    }
    // Left side
    if (points[12] && points[14] && points[16]) { // Left shoulder to ankle
      ctx.moveTo(points[12].x, points[12].y); // Left shoulder
      ctx.lineTo(points[14].x, points[14].y); // Left elbow
      ctx.lineTo(points[16].x, points[16].y); // Left wrist
    }
    if (points[24] && points[26] && points[28]) { // Left hip to foot
      ctx.moveTo(points[24].x, points[24].y); // Left hip
      ctx.lineTo(points[26].x, points[26].y); // Left knee
      ctx.lineTo(points[28].x, points[28].y); // Left ankle
    }
    ctx.stroke();

    // Draw landmark points
    const keyPoints = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]; // Shoulders, elbows, wrists, hips, knees, ankles
    keyPoints.forEach(index => {
      if (points[index]) {
        ctx.beginPath();
        ctx.arc(points[index].x, points[index].y, 6, 0, 2 * Math.PI);
        ctx.fill();
      }
    });

    // Draw feedback annotations
    if (feedback && feedback.length > 0) {
      ctx.font = '20px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      
      feedback.forEach((item, index) => {
        if (item.type === 'annotation' && item.position) {
          // Draw arrow
          const start = points[item.position.start];
          const end = points[item.position.end];
          if (start && end) {
            drawArrow(ctx, start.x, start.y, end.x, end.y);
          }
          
          // Draw text with background
          const text = item.message;
          const textX = item.position.textX * ctx.canvas.width;
          const textY = item.position.textY * ctx.canvas.height;
          
          // Draw text background
          const metrics = ctx.measureText(text);
          const padding = 4;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.fillRect(
            textX - padding, 
            textY - padding,
            metrics.width + padding * 2,
            parseInt(ctx.font) + padding * 2
          );
          
          // Draw text
          ctx.fillStyle = 'white';
          ctx.fillText(text, textX, textY);
        }
      });
    }
  };

  const drawArrow = (ctx, fromX, fromY, toX, toY) => {
    const headLength = 15;
    const angle = Math.atan2(toY - fromY, toX - fromX);
    
    // Draw line
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
    
    // Draw arrowhead
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - headLength * Math.cos(angle - Math.PI / 6),
      toY - headLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - headLength * Math.cos(angle + Math.PI / 6),
      toY - headLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.stroke();
  };

  // Handle video time updates
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      drawOverlays(canvasRef.current.getContext('2d'), videoRef.current, currentAngle, activeFeedback);
    }
  };

  // Handle video metadata loading
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  // Handle video errors
  const handleError = (e) => {
    console.error('Video error:', e);
    setError('Error playing video. Please try again.');
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
  }, [videoRef.current]);

  // Update canvas size when video dimensions change
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const updateCanvasSize = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      drawOverlays(canvas.getContext('2d'), video, currentAngle, activeFeedback);
    };

    video.addEventListener('loadedmetadata', updateCanvasSize);
    video.addEventListener('resize', updateCanvasSize);

    return () => {
      video.removeEventListener('loadedmetadata', updateCanvasSize);
      video.removeEventListener('resize', updateCanvasSize);
    };
  }, [videoRef.current]);

  // Handle video URL changes
  useEffect(() => {
    if (videoUrl) {
      console.log('Video URL changed:', videoUrl);
      
      // Reset state
      setError(null);
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(false);
      
      // Ensure video element is properly initialized
      if (videoRef.current) {
        // Reset video element
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
        
        // Load and play video
        videoRef.current.load();
        
        // Try playing after a short delay to ensure proper initialization
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.play().catch(error => {
              console.error('Error playing video:', error);
              if (error.name === 'NotSupportedError') {
                setError('Video format not supported. Please try recording again.');
              } else {
                setError('Failed to play video. Please try again.');
              }
            });
          }
        }, 100);
      }
    }
    
    return () => {
      // Cleanup
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      }
    };
  }, [videoUrl]);

  // Handle timeline interactions
  const handleTimelineClick = (e) => {
    if (!videoRef.current || !timelineRef.current) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const clickPosition = (e.clientX - rect.left) / rect.width;
    
    if (clickPosition < 0 || clickPosition > 1) return;
    
    const seekTime = videoRef.current.duration * clickPosition;
    if (isNaN(seekTime)) return;
    
    videoRef.current.currentTime = seekTime;
  };
  
  // Handle timeline hover
  const handleTimelineHover = (e) => {
    if (!timelineRef.current || isDraggingTimeline) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const position = (e.clientX - rect.left) / rect.width;
    
    if (position >= 0 && position <= 1) {
      setHoverPosition(position);
    } else {
      setHoverPosition(null);
    }
  };
  
  // Handle timeline mouse leave
  const handleTimelineLeave = () => {
    if (!isDraggingTimeline) {
      setHoverPosition(null);
    }
  };
  
  // Handle mouse down for dragging
  const handleTimelineMouseDown = (e) => {
    setIsDraggingTimeline(true);
    handleTimelineClick(e);
    
    // Add document-level event listeners
    document.addEventListener('mousemove', handleDocumentMouseMove);
    document.addEventListener('mouseup', handleDocumentMouseUp);
  };
  
  // Handle document mouse move (for dragging)
  const handleDocumentMouseMove = (e) => {
    if (isDraggingTimeline) {
      handleTimelineClick(e);
    }
  };
  
  // Handle document mouse up (for dragging)
  const handleDocumentMouseUp = () => {
    setIsDraggingTimeline(false);
    setHoverPosition(null);
    
    // Remove document-level event listeners
    document.removeEventListener('mousemove', handleDocumentMouseMove);
    document.removeEventListener('mouseup', handleDocumentMouseUp);
  };
  
  // Clean up document-level event listeners
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      document.removeEventListener('mouseup', handleDocumentMouseUp);
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <div className="relative w-full max-w-3xl">
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          controls
          playsInline
          preload="auto"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onError={(e) => {
            console.error('Video error:', e);
            const video = e.target;
            if (video.error) {
              console.error('Video error code:', video.error.code);
              console.error('Video error message:', video.error.message);
              
              // Handle specific error cases
              switch (video.error.code) {
                case 1:
                  setError('Video loading was aborted. Please try again.');
                  break;
                case 2:
                  setError('Network error occurred. Please check your connection.');
                  break;
                case 3:
                  setError('Video decoding error. Please try recording again.');
                  break;
                case 4:
                  setError('Video format not supported. Please try recording again.');
                  break;
                default:
                  // For Firefox privacy mode errors
                  if (video.error.message.includes('NS_ERROR_DOM_MEDIA_METADATA_ERR')) {
                    setError('Video metadata error. Please try recording again with a different browser or disable privacy.resistFingerprinting.');
                  } else {
                    setError('Failed to load video. Please try recording again.');
                  }
              }
            }
          }}
          onLoadStart={() => {
            console.log('Video load started');
            setError(null);
          }}
          onLoadedData={() => {
            console.log('Video data loaded');
            setError(null);
          }}
          onCanPlay={() => {
            console.log('Video can play');
            setError(null);
          }}
          crossOrigin="anonymous"
        >
          <source src={videoUrl} type="video/webm;codecs=vp8,opus" />
          <source src={videoUrl} type="video/webm;codecs=vp8" />
          <source src={videoUrl} type="video/webm" />
          <source src={videoUrl} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full pointer-events-none"
        />
      </div>
      
      <div className="w-full max-w-3xl">
        <div className="bg-gray-800 p-4 rounded-lg">
          {error ? (
            <ErrorMessage>
              <AlertTriangle size={20} />
              <span>{error}</span>
            </ErrorMessage>
          ) : (
            <>
              <h3 className="text-xl font-semibold mb-4">Analysis Results</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-700 p-4 rounded-lg">
                  <h4 className="text-lg font-medium mb-2">Squat Count</h4>
                  <p className="text-2xl font-bold">{squatTimings?.length || 0}</p>
                </div>
                <div className="bg-gray-700 p-4 rounded-lg">
                  <h4 className="text-lg font-medium mb-2">Current Time</h4>
                  <p className="text-2xl font-bold">{formatTime(currentTime)}</p>
                </div>
              </div>
              <div className="mt-4">
                <h4 className="text-lg font-medium mb-2">Feedback Tips</h4>
                <div className="space-y-2">
                  {feedbackData && feedbackData.length > 0 ? (
                    feedbackData.map((tip, index) => (
                      <div key={index} className="bg-gray-700 p-3 rounded-lg">
                        {tip.message || tip}
                      </div>
                    ))
                  ) : (
                    <div className="bg-gray-700 p-3 rounded-lg">
                      No feedback available yet.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExercisePlayback;