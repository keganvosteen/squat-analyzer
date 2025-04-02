// src/components/ExercisePlayback.jsx
import React, { useRef, useEffect, useState } from 'react';
import { Play, Pause, SkipForward, SkipBack, AlertTriangle, CheckCircle, Info } from 'lucide-react';

const ExercisePlayback = ({ videoUrl, feedbackData, squatTimings = [] }) => {
  const videoRef = useRef(null);
  const timelineRef = useRef(null);
  const canvasRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentAngle, setCurrentAngle] = useState(null);
  const [activeFeedback, setActiveFeedback] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [debugInfo, setDebugInfo] = useState(false);

  // Detect iOS devices for video rotation
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Video rotation style based on device
  const videoStyle = {
    width: '100%',
    ...(isIOS ? { transform: 'rotate(-90deg)' } : {})
  };

  // Jump to a specific time in the video
  const jumpToTime = (time) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time / 1000; // Convert to seconds
      if (!isPlaying) {
        videoRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  // Toggle play/pause
  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
    setIsPlaying(!isPlaying);
  };

  // Skip to next or previous squat
  const skipToSquat = (direction) => {
    const video = videoRef.current;
    if (!video || !squatTimings.length) return;

    const currentTimeMs = video.currentTime * 1000;
    
    // Filter squat bottom points
    const bottomPoints = squatTimings
      .filter(t => t.bottom)
      .map(t => ({ time: t.bottom, type: 'bottom', count: t.count }));
      
    // Filter completed squat points
    const completedPoints = squatTimings
      .filter(t => t.completed)
      .map(t => ({ time: t.completed, type: 'completed', count: t.count }));
      
    // Combine all points and sort by time
    const allPoints = [...bottomPoints, ...completedPoints].sort((a, b) => a.time - b.time);
    
    if (direction === 'next') {
      // Find next point after current time
      const nextPoint = allPoints.find(point => point.time * 1000 > currentTimeMs);
      if (nextPoint) {
        jumpToTime(nextPoint.time * 1000);
      }
    } else {
      // Find previous point before current time
      const prevPoints = allPoints.filter(point => point.time * 1000 < currentTimeMs);
      if (prevPoints.length > 0) {
        jumpToTime(prevPoints[prevPoints.length - 1].time * 1000);
      }
    }
  };

  // Create timeline markers for key events
  const createMarkers = () => {
    const video = videoRef.current;
    const timeline = timelineRef.current;

    if (!video || !timeline || !video.duration) return;

    // Clear existing markers
    timeline.innerHTML = '';

    // Process feedback data to create markers
    if (feedbackData && feedbackData.length) {
      // Group markers by type to avoid too many markers
      const warningMarkers = new Map(); // timestamp -> warning[]
      
      feedbackData.forEach(data => {
        const timestamp = data.timestamp / 1000; // convert to seconds
        const relativePosition = (timestamp / video.duration) * 100;
        
        // Only create markers for frames with warnings
        if (data.warnings && data.warnings.length > 0) {
          if (!warningMarkers.has(timestamp)) {
            warningMarkers.set(timestamp, []);
          }
          
          // Add unique warnings by type
          data.warnings.forEach(warning => {
            const warnings = warningMarkers.get(timestamp);
            if (!warnings.find(w => w.type === warning.type)) {
              warnings.push(warning);
            }
          });
        }
      });
      
      // Create warning markers
      warningMarkers.forEach((warnings, timestamp) => {
        const marker = document.createElement('div');
        marker.className = 'absolute top-0 h-full w-1.5 bg-red-500 cursor-pointer';
        marker.style.left = `${(timestamp / video.duration) * 100}%`;
        marker.title = warnings.map(w => w.message).join('\n');
        marker.onclick = () => jumpToTime(timestamp * 1000);
        timeline.appendChild(marker);
      });
    }
    
    // Add squat timing markers
    if (squatTimings && squatTimings.length) {
      // Bottom of squat markers
      squatTimings.forEach(timing => {
        if (timing.bottom) {
          const marker = document.createElement('div');
          marker.className = 'absolute top-0 h-full w-1.5 bg-blue-500 cursor-pointer';
          marker.style.left = `${(timing.bottom / video.duration) * 100}%`;
          marker.title = `Bottom of squat #${timing.count}`;
          marker.onclick = () => jumpToTime(timing.bottom * 1000);
          timeline.appendChild(marker);
        }
        
        // Completed squat markers
        if (timing.completed) {
          const marker = document.createElement('div');
          marker.className = 'absolute top-0 h-full w-1.5 bg-green-500 cursor-pointer';
          marker.style.left = `${(timing.completed / video.duration) * 100}%`;
          marker.title = `Completed squat #${timing.count}`;
          marker.onclick = () => jumpToTime(timing.completed * 1000);
          timeline.appendChild(marker);
        }
      });
    }
  };

  // Find active feedback based on current video timestamp
  const findActiveFeedback = () => {
    if (!feedbackData || !feedbackData.length || !videoRef.current) return null;
    
    const currentTimeMs = videoRef.current.currentTime * 1000;
    
    // Find closest feedback data to current time (within 500ms window)
    const closeItems = feedbackData.filter(
      data => Math.abs(data.timestamp - currentTimeMs) < 500
    );
    
    if (closeItems.length === 0) return null;
    
    // Get the closest one
    return closeItems.reduce((closest, current) => {
      return Math.abs(current.timestamp - currentTimeMs) < 
             Math.abs(closest.timestamp - currentTimeMs) ? current : closest;
    });
  };

  // Format time in MM:SS.ms format
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs}.${ms}`;
  };

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    
    if (!video) return;
    
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      
      // Find and set active feedback
      const feedback = findActiveFeedback();
      if (feedback) {
        setActiveFeedback(feedback);
        setCurrentAngle(feedback.angles);
      } else {
        setActiveFeedback(null);
        setCurrentAngle(null);
      }
    };
    
    const onDurationChange = () => {
      setDuration(video.duration);
      createMarkers();
    };
    
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('loadedmetadata', onDurationChange);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('loadedmetadata', onDurationChange);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
    };
  }, [feedbackData]);

  // Update timeline markers when video or feedback changes
  useEffect(() => {
    if (videoRef.current && videoRef.current.duration) {
      createMarkers();
    }
  }, [videoUrl, feedbackData, squatTimings]);

  // Handle timeline click for seeking
  const handleTimelineClick = (e) => {
    const timeline = timelineRef.current;
    const video = videoRef.current;
    
    if (!timeline || !video) return;
    
    const rect = timeline.getBoundingClientRect();
    const clickPosition = (e.clientX - rect.left) / rect.width;
    const seekTime = video.duration * clickPosition;
    
    video.currentTime = seekTime;
  };

  return (
    <div className="flex flex-col w-full bg-gray-900 rounded-lg overflow-hidden">
      {/* Video container */}
      <div className="relative aspect-video bg-black">
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-full object-contain"
          style={videoStyle}
          playsInline
        />
        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-10" />
        
        {/* Display current angles if available */}
        {currentAngle && (
          <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 p-2 rounded text-white text-sm">
            {currentAngle.leftKnee && <div>Left Knee: {currentAngle.leftKnee}°</div>}
            {currentAngle.rightKnee && <div>Right Knee: {currentAngle.rightKnee}°</div>}
            {currentAngle.back && <div>Back: {currentAngle.back}°</div>}
          </div>
        )}
        
        {/* Active feedback warnings */}
        {activeFeedback && activeFeedback.warnings && activeFeedback.warnings.length > 0 && (
          <div className="absolute top-4 right-4 bg-black bg-opacity-75 p-3 rounded text-white max-w-sm">
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
          <div className={`absolute top-4 left-4 px-3 py-1 rounded-full text-sm font-medium ${
            activeFeedback.squatState === 'bottom' ? 'bg-green-500 text-white' :
            activeFeedback.squatState === 'descending' ? 'bg-yellow-500 text-black' :
            'bg-blue-500 text-white'
          }`}>
            {activeFeedback.squatState.charAt(0).toUpperCase() + activeFeedback.squatState.slice(1)}
          </div>
        )}
        
        {/* Debug info toggle */}
        <button 
          onClick={() => setDebugInfo(!debugInfo)} 
          className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-50 p-1 rounded-full"
          aria-label="Toggle debug info"
        >
          <Info size={16} className="text-white" />
        </button>
        
        {/* Debug information panel */}
        {debugInfo && (
          <div className="absolute inset-x-0 top-12 bg-black bg-opacity-75 p-2 text-white text-xs font-mono">
            <div>iOS Device: {isIOS ? 'Yes' : 'No'}</div>
            <div>Video Duration: {formatTime(duration)}</div>
            <div>Current Time: {formatTime(currentTime)}</div>
            <div>Active Feedback: {activeFeedback ? 'Yes' : 'No'}</div>
            <div>Squat State: {activeFeedback?.squatState || 'N/A'}</div>
            <div>Warnings: {activeFeedback?.warnings?.length || 0}</div>
          </div>
        )}
      </div>
      
      {/* Timeline */}
      <div className="relative px-4 py-2 bg-gray-800">
        {/* Current time display */}
        <div className="text-white text-sm mb-1 font-mono">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
        
        {/* Scrubber timeline */}
        <div 
          ref={timelineRef} 
          className="relative w-full h-4 bg-gray-700 rounded cursor-pointer"
          onClick={handleTimelineClick}
        >
          {/* Progress indicator */}
          <div 
            className="absolute top-0 left-0 h-full bg-gray-500 pointer-events-none"
            style={{ width: `${(currentTime / duration) * 100}%` }}
          />
          
          {/* Timeline legend */}
          <div className="absolute -bottom-6 left-0 right-0 flex justify-between text-xs text-gray-400">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-blue-500 rounded-full mr-1"></div>
              <span>Bottom</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-500 rounded-full mr-1"></div>
              <span>Completed</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-red-500 rounded-full mr-1"></div>
              <span>Form issues</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Controls */}
      <div className="flex justify-between items-center p-3 bg-gray-800 text-white">
        <button
          onClick={() => skipToSquat('prev')}
          className="p-2 rounded-full hover:bg-gray-700"
          aria-label="Previous squat"
        >
          <SkipBack size={20} />
        </button>
        
        <button
          onClick={togglePlayPause}
          className="p-3 bg-white text-black rounded-full hover:bg-gray-200"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause size={24} /> : <Play size={24} />}
        </button>
        
        <button
          onClick={() => skipToSquat('next')}
          className="p-2 rounded-full hover:bg-gray-700"
          aria-label="Next squat"
        >
          <SkipForward size={20} />
        </button>
      </div>
      
      {/* Detailed feedback section */}
      {activeFeedback && (
        <div className="p-4 bg-gray-900 text-white rounded-b-lg">
          <h3 className="text-lg font-semibold mb-2">Form Analysis</h3>
          
          {/* Squat count */}
          {activeFeedback.squatCount !== undefined && (
            <div className="mb-3">
              <span className="font-medium">Squats completed: </span>
              <span className="text-green-400">{activeFeedback.squatCount}</span>
            </div>
          )}
          
          {/* Show current warnings */}
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
        </div>
      )}
    </div>
  );
};

export default ExercisePlayback;
