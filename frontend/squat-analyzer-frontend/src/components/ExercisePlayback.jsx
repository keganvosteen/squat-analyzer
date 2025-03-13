// src/components/ExercisePlayback.jsx
import React, { useRef } from 'react';

const ExercisePlayback = ({ videoUrl, feedbackLog }) => {
  const videoRef = useRef(null);

  // Detect iOS (iPhone, iPad, iPod)
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Apply a 90-degree rotation only on iOS
  const videoStyle = {
    width: '100%',
    ...(isIOS ? { transform: 'rotate(90deg)' } : {})
  };

  // Jump to a specific timestamp when a timeline marker is clicked
  const jumpToTime = (time) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      videoRef.current.play();
    }
  };

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
