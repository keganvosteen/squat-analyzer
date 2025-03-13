// src/components/ExercisePlayback.jsx
import React, { useRef, useEffect } from 'react';

const ExercisePlayback = ({ videoUrl, feedbackLog }) => {
  const videoRef = useRef(null);

  // This function can be enhanced to show detailed feedback when a marker is clicked.
  const jumpToTime = (time) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      videoRef.current.play();
    }
  };

  return (
    <div>
      <video ref={videoRef} src={videoUrl} style={{ width: '100%' }} controls />
      <div>
        <h3>Timeline Markers:</h3>
        <ul>
          {feedbackLog.map((entry, index) => (
            <li key={index}>
              <button onClick={() => jumpToTime(entry.timestamp)}>
                {`At ${entry.timestamp.toFixed(2)}s: ${entry.feedback}`}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default ExercisePlayback;
