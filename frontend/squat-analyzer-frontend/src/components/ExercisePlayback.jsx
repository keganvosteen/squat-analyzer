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
  const drawOverlays = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw landmarks if available
    if (feedbackData && feedbackData.length > 0) {
      const currentFeedback = feedbackData.find(f => 
        Math.abs(f.timestamp - currentTime * 1000) < 100
      );

      if (currentFeedback && currentFeedback.keyPoints) {
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        
        // Draw connections between landmarks
        Object.entries(currentFeedback.keyPoints).forEach(([key, point]) => {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
          ctx.fillStyle = '#00ff00';
          ctx.fill();
        });
      }

      // Draw feedback arrows if available
      if (currentFeedback && currentFeedback.warnings) {
        currentFeedback.warnings.forEach(warning => {
          if (warning.type === 'arrow' && warning.start && warning.end) {
            ctx.beginPath();
            ctx.moveTo(warning.start.x, warning.start.y);
            ctx.lineTo(warning.end.x, warning.end.y);
            ctx.strokeStyle = warning.color || '#ff0000';
            ctx.stroke();
          }
        });
      }
    }
  };

  // Handle video time updates
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      drawOverlays();
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
      drawOverlays();
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
    console.log("Video URL changed:", videoUrl);
    setVideoError(null);
    
    if (!videoUrl) {
      return;
    }
    
    const video = videoRef.current;
    if (!video) return;
    
    // Reset state
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    
    try {
      // Set video source
      video.src = videoUrl;
      video.load();
      
      // Try playing after a delay
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.play().catch(err => {
            console.warn("Delayed auto-play failed (expected):", err);
          });
        }
      }, 500);
    } catch (err) {
      console.error("Error setting video source:", err);
      setVideoError("Couldn't load video. Please try again.");
    }
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
    <div 
      ref={containerRef}
      className={`flex flex-col w-full bg-gray-900 rounded-lg overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}
    >
      {/* Video container */}
      <div className="relative aspect-video bg-black">
        {videoUrl ? (
          <>
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              playsInline
              controls
              preload="auto"
              type="video/webm"
              muted={false}
              crossOrigin="anonymous"
              onLoadedData={() => console.log("Video loaded data")}
              onError={(e) => console.error("Video error:", e)}
            />
            
            {/* Overlay canvas (can be used for drawing) */}
            <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-10" />
            
            {/* Error message */}
            {videoError && (
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-red-600 bg-opacity-80 px-4 py-2 rounded text-white z-30 text-center max-w-sm">
                {videoError}
              </div>
            )}
            
            {/* Angles overlay */}
            {currentAngle && (
              <div className="absolute bottom-4 left-4 bg-black bg-opacity-70 p-2 rounded text-white text-sm z-20">
                {currentAngle.leftKnee && <div>Left Knee: {currentAngle.leftKnee}°</div>}
                {currentAngle.rightKnee && <div>Right Knee: {currentAngle.rightKnee}°</div>}
                {currentAngle.back && <div>Back: {currentAngle.back}°</div>}
              </div>
            )}
            
            {/* Active feedback warnings */}
            {activeFeedback && activeFeedback.warnings && activeFeedback.warnings.length > 0 && (
              <div className="absolute top-4 right-4 bg-black bg-opacity-75 p-3 rounded text-white max-w-sm z-20">
                <h4 className="font-semibold flex items-center">
                  <AlertTriangle size={16} className="text-red-500 mr-1" />
                  Form Corrections
                </h4>
                <ul className="mt-1 text-sm">
                  {activeFeedback.warnings.map((warning, idx) => (
                    <li key={idx} className="flex items-start mt-1">
                      <span className="mr-2">•</span>
                      <span>{warning.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Squat state indicator */}
            {activeFeedback && activeFeedback.squatState && (
              <div className={`absolute top-4 left-4 px-3 py-1 rounded-full text-sm font-medium z-20 ${
                activeFeedback.squatState === 'bottom' ? 'bg-green-500 text-white' :
                activeFeedback.squatState === 'descending' ? 'bg-yellow-500 text-black' :
                'bg-blue-500 text-white'
              }`}>
                {activeFeedback.squatState.charAt(0).toUpperCase() + activeFeedback.squatState.slice(1)}
              </div>
            )}
            
            {/* Fullscreen button */}
            <button
              onClick={toggleFullscreen}
              className="absolute top-12 right-4 bg-black bg-opacity-50 p-2 rounded-full text-white hover:bg-opacity-70 transition-all z-20"
            >
              {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
            
            {/* Debug info toggle */}
            <button 
              onClick={() => setDebugInfo(!debugInfo)} 
              className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-50 p-1 rounded-full z-20"
              aria-label="Toggle debug info"
            >
              <Info size={16} className="text-white" />
            </button>
            
            {/* Debug information panel */}
            {debugInfo && (
              <div className="absolute inset-x-0 top-12 bg-black bg-opacity-75 p-2 text-white text-xs font-mono z-20">
                <div>Video URL: {videoUrl ? 'Provided' : 'Missing'}</div>
                <div>Video Duration: {formatTime(duration)}</div>
                <div>Current Time: {formatTime(currentTime)}</div>
                <div>Feedback Data: {feedbackData?.length || 0} points</div>
                <div>Squat Timings: {squatTimings?.length || 0} events</div>
                <div>Playback State: {isPlaying ? 'Playing' : 'Paused'}</div>
                <div>Active Feedback: {activeFeedback ? 'Yes' : 'No'}</div>
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white text-lg">
            No video available. Record a squat first.
          </div>
        )}
      </div>
      
      {/* Custom timeline control */}
      {videoUrl && (
        <div 
          className="relative px-4 py-2 bg-gray-800"
          onMouseMove={handleTimelineHover}
          onMouseLeave={handleTimelineLeave}
        >
          <div className="text-white text-sm mb-1 font-mono flex justify-between">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
          
          {/* Timeline bar */}
          <div 
            ref={timelineRef} 
            className="relative w-full h-4 bg-gray-700 rounded cursor-pointer"
            onClick={handleTimelineClick}
            onMouseDown={handleTimelineMouseDown}
          >
            {/* Progress bar */}
            <div 
              className="absolute top-0 left-0 h-full bg-gray-500 pointer-events-none"
              style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
            />
            
            {/* Hover indicator */}
            {hoverPosition !== null && (
              <div 
                className="absolute top-0 h-full w-0.5 bg-white pointer-events-none"
                style={{ left: `${hoverPosition * 100}%` }}
              />
            )}
            
            {/* Hover time tooltip */}
            {hoverPosition !== null && duration > 0 && (
              <div 
                className="absolute bottom-full mb-1 bg-gray-900 text-white px-2 py-0.5 rounded text-xs transform -translate-x-1/2 pointer-events-none"
                style={{ left: `${hoverPosition * 100}%` }}
              >
                {formatTime(hoverPosition * duration)}
              </div>
            )}
          </div>
          
          {/* Timeline legend */}
          <div className="flex justify-center gap-4 mt-2 text-xs text-gray-300">
            <div className="flex items-center">
              <div className="w-2 h-2 bg-blue-500 rounded-full mr-1"></div>
              <span>Bottom of Squat</span>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
              <span>Completed Squat</span>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 bg-red-500 rounded-full mr-1"></div>
              <span>Form Issues</span>
            </div>
          </div>
        </div>
      )}
      
      {/* Custom playback controls */}
      {videoUrl && (
        <div className="flex justify-between items-center p-3 bg-gray-800 text-white">
          <button
            onClick={() => skipToSquat('prev')}
            className="p-2 rounded-full hover:bg-gray-700 transition-colors"
            aria-label="Previous squat"
          >
            <SkipBack size={20} />
          </button>
          
          <button
            onClick={togglePlayPause}
            className="p-3 bg-white text-black rounded-full hover:bg-gray-200 transition-colors"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause size={24} /> : <Play size={24} />}
          </button>
          
          <button
            onClick={() => skipToSquat('next')}
            className="p-2 rounded-full hover:bg-gray-700 transition-colors"
            aria-label="Next squat"
          >
            <SkipForward size={20} />
          </button>
        </div>
      )}
      
      {/* Feedback panel */}
      {videoUrl && activeFeedback && (
        <div className="p-4 bg-gray-900 text-white rounded-b-lg">
          <h3 className="text-lg font-semibold mb-2">Form Analysis</h3>
          
          {activeFeedback.squatCount !== undefined && (
            <div className="mb-3">
              <span className="font-medium">Squats completed: </span>
              <span className="text-green-400">{activeFeedback.squatCount}</span>
            </div>
          )}
          
          {activeFeedback.warnings && activeFeedback.warnings.length > 0 ? (
            <div className="mt-2">
              <h4 className="font-medium flex items-center text-red-400">
                <AlertTriangle size={16} className="mr-1" />
                Form Corrections Needed
              </h4>
              <ul className="ml-6 mt-1 list-disc">
                {activeFeedback.warnings.map((warning, idx) => (
                  <li key={idx} className="text-sm mt-1">{warning.message}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="mt-2 flex items-center text-green-400">
              <CheckCircle size={16} className="mr-1" />
              <span>Good form in this frame!</span>
            </div>
          )}
          
          {/* Hover tooltip for timeline markers */}
          {hoveredMarker && (
            <div className="mt-3 p-2 bg-gray-800 rounded border border-gray-600">
              <div className="font-medium">
                {hoveredMarker.message || (
                  hoveredMarker.type ? 
                    `${hoveredMarker.type.charAt(0).toUpperCase() + hoveredMarker.type.slice(1)} of squat #${hoveredMarker.count}` : 
                    `Marker at ${formatTime(hoveredMarker.time)}`
                )}
              </div>
              
              {hoveredMarker.warnings && hoveredMarker.warnings.length > 0 && (
                <ul className="mt-1 ml-4 list-disc">
                  {hoveredMarker.warnings.map((w, i) => (
                    <li key={i} className="text-sm">{w.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Analysis panel */}
      {error ? (
        <AnalysisPanel>
          <ErrorMessage>{error}</ErrorMessage>
        </AnalysisPanel>
      ) : (
        <AnalysisPanel>
          <h3>Analysis Results</h3>
          <StatBox>
            <StatLabel>Total Squats</StatLabel>
            <StatValue>{squatCount}</StatValue>
          </StatBox>
          
          <FeedbackSection>
            <h4>Feedback Tips</h4>
            {feedbackData && feedbackData.length > 0 ? (
              feedbackData.map((tip, index) => (
                <FeedbackTip key={index}>
                  {tip.message || tip}
                </FeedbackTip>
              ))
            ) : (
              <FeedbackTip>No feedback available yet.</FeedbackTip>
            )}
          </FeedbackSection>
        </AnalysisPanel>
      )}
    </div>
  );
};

export default ExercisePlayback;