// src/components/ExercisePlayback.jsx
import React, { useRef } from 'react';

const ExercisePlayback = ({ videoUrl, feedbackLog }) => {
  const videoRef = useRef(null);

  // Detect iOS (iPhone, iPad, iPod)
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Apply a 90-degree rotation only on iOS
  const videoStyle = {
    width: '100%',
    ...(isIOS ? { transform: 'rotate(-90deg)' } : {})
  };

  // Jump to a specific timestamp when a timeline marker is clicked
  const jumpToTime = (time) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      videoRef.current.play();
    }
  };

  const createMarkers = () => {
    const video = videoRef.current;
    const timeline = timelineRef.current;

    if (!video || !timeline) return;

    // Clear existing markers
    timeline.innerHTML = '';

    feedbackLog.forEach(({ timestamp, feedback }) => {
      const marker = document.createElement('div');
      marker.className = 'absolute top-0 h-full w-1 bg-gray-400 hover:bg-blue-500 cursor-pointer';
      marker.style.left = `${(timestamp / video.duration) * 100}%`;
      marker.title = typeof feedback === 'object' ? JSON.stringify(feedback) : feedback;
      marker.onclick = () => jumpToTime(timestamp);
      timeline.appendChild(marker);
    });
  };

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.addEventListener('loadedmetadata', createMarkers);
    }
    return () => video && video.removeEventListener('loadedmetadata', createMarkers);
  }, [feedbackLog, videoUrl]);

  return (
    <div>
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        style={videoStyle}
      />
      <div>
        <h3>Timeline Markers:</h3>
        <ul>
          {feedbackLog.map((entry, index) => (
            <li key={index}>
              <button onClick={() => jumpToTime(entry.timestamp)}>
                {`At ${entry.timestamp.toFixed(2)}s: ${
                  typeof entry.feedback === 'object'
                    ? JSON.stringify(entry.feedback)
                    : entry.feedback
                }`}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default ExercisePlayback;
