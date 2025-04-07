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
  const [debugInfo, setDebugInfo] = useState(true); // Default to true for debugging
  const [hoveredMarker, setHoveredMarker] = useState(null);
  
  // Debug log for video URL
  console.log("ExercisePlayback received videoUrl:", videoUrl);

  // Detect iOS devices for video rotation
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const videoStyle = {
    width: '100%',
    ...(isIOS ? { transform: 'rotate(-90deg)' } : {})
  };

  // Jump to a specific time in the video (input in ms)
  const jumpToTime = (timeInMs) => {
    if (videoRef.current) {
      videoRef.current.currentTime = timeInMs / 1000;
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

  // Skip to next or previous squat marker
  const skipToSquat = (direction) => {
    const video = videoRef.current;
    if (!video || !squatTimings.length) return;

    const currentTimeMs = video.currentTime * 1000;
    
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
  };

  // Create timeline markers for key events with interactive hover events
  const createMarkers = () => {
    const video = videoRef.current;
    const timeline = timelineRef.current;
    if (!video || !timeline || !video.duration) return;

    // Clear existing markers
    timeline.innerHTML = '';

    // Process feedback data to create warning markers
    if (feedbackData && feedbackData.length) {
      const warningMarkers = new Map(); // timestamp (sec) -> warnings array
      feedbackData.forEach((data) => {
        const timestamp = data.timestamp / 1000; // convert to seconds
        if (data.warnings && data.warnings.length > 0) {
          if (!warningMarkers.has(timestamp)) {
            warningMarkers.set(timestamp, []);
          }
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
        // Set interactive hover events
        marker.onmouseenter = () => setHoveredMarker({ time: timestamp, warnings });
        marker.onmouseleave = () => setHoveredMarker(null);
        timeline.appendChild(marker);
      });
    }
    
    // Create markers for squat timings
    if (squatTimings && squatTimings.length) {
      squatTimings.forEach((timing) => {
        if (timing.bottom) {
          const marker = document.createElement('div');
          marker.className = 'absolute top-0 h-full w-1.5 bg-blue-500 cursor-pointer';
          marker.style.left = `${(timing.bottom / video.duration) * 100}%`;
          marker.title = `Bottom of squat #${timing.count}`;
          marker.onclick = () => jumpToTime(timing.bottom * 1000);
          timeline.appendChild(marker);
        }
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

  // Find active feedback based on current video time
  const findActiveFeedback = () => {
    if (!feedbackData || !feedbackData.length || !videoRef.current) return null;
    const currentTimeMs = videoRef.current.currentTime * 1000;
    const closeItems = feedbackData.filter(
      data => Math.abs(data.timestamp - currentTimeMs) < 500
    );
    if (!closeItems.length) return null;
    return closeItems.reduce((closest, curr) =>
      Math.abs(curr.timestamp - currentTimeMs) < Math.abs(closest.timestamp - currentTimeMs)
        ? curr : closest
    );
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
    
    console.log("Setting up video event listeners");
    
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
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
      console.log("Duration changed:", video.duration);
      setDuration(video.duration);
      createMarkers();
    };
    
    const onLoadedMetadata = () => {
      console.log("Loaded metadata, duration:", video.duration);
      setDuration(video.duration);
      createMarkers();
      
      // Try to play the video automatically
      try {
        video.play().catch(err => {
          console.warn("Auto-play failed (expected in some browsers):", err);
        });
      } catch (err) {
        console.warn("Auto-play error:", err);
      }
    };
    
    const onLoadedData = () => {
      console.log("Video data loaded");
    };
    
    const onPlay = () => {
      console.log("Video play event");
      setIsPlaying(true);
    };
    
    const onPause = () => {
      console.log("Video pause event");
      setIsPlaying(false);
    };
    
    const onError = (e) => {
      console.error("Video error:", e);
    };
    
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('error', onError);
    
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('error', onError);
    };
  }, [feedbackData, squatTimings]);

  // Effect specifically for video URL changes
  useEffect(() => {
    console.log("Video URL changed to:", videoUrl);
    
    if (!videoUrl) return;
    
    // If video element exists, update its src and load it
    if (videoRef.current) {
      console.log("Updating video element with new URL");
      
      // Force reload the video element
      videoRef.current.src = videoUrl;
      videoRef.current.load();
      
      // Try to play after a short delay
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.play().catch(err => {
            console.warn("Delayed play failed (expected in some browsers):", err);
          });
        }
      }, 300);
    }
  }, [videoUrl]);
  
  // Effect for updating markers
  useEffect(() => {
    if (videoRef.current && videoRef.current.duration) {
      console.log("Creating markers");
      createMarkers();
    }
  }, [videoUrl, feedbackData, squatTimings]);

  // Handle click on timeline for seeking
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
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full h-full object-contain"
            style={videoStyle}
            playsInline
            controls
            preload="auto"
            type="video/webm"
            autoPlay
            onLoadedData={() => console.log("Video loaded data")}
            onError={(e) => console.error("Video error:", e)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white">
            No video recorded.
          </div>
        )}
        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-10" />
        
        {/* Current angles overlay */}
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
      
      {/* Interactive timeline */}
      <div className="relative px-4 py-2 bg-gray-800" onClick={handleTimelineClick}>
        <div className="text-white text-sm mb-1 font-mono">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
        <div 
          ref={timelineRef} 
          className="relative w-full h-4 bg-gray-700 rounded cursor-pointer"
        >
          <div 
            className="absolute top-0 left-0 h-full bg-gray-500 pointer-events-none"
            style={{ width: `${(currentTime / duration) * 100}%` }}
          />
        </div>
      </div>
      
      {/* Playback Controls */}
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
      
      {/* Detailed Feedback Panel with Interactive Tooltip */}
      {activeFeedback && (
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
          
          {hoveredMarker && (
            <div className="mt-2 p-2 bg-gray-800 rounded border border-gray-600">
              <strong>Marker at {formatTime(hoveredMarker.time)}:</strong>
              <ul className="ml-4 list-disc">
                {hoveredMarker.warnings.map((w, i) => (
                  <li key={i} className="text-sm">{w.message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ExercisePlayback;
