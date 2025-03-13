// src/components/ExercisePlayback.jsx
import React, { useRef } from 'react';

const ExercisePlayback = ({ videoUrl, feedbackLog }) => {
  const videoRef = useRef(null);

  // Jump to a specific time in the video
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
        style={{ width: '100%' }}
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
