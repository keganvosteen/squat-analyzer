// src/components/ExercisePlayback.jsx
import React, { useRef, useState, useEffect } from 'react';

const ExercisePlayback = ({ videoUrl, feedbackLog }) => {
  const videoRef = useRef(null);
  const [debugInfo, setDebugInfo] = useState('');

  useEffect(() => {
    // Get user agent and check for iOS
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const info = `User agent: ${ua}\nDetected isIOS: ${isIOS}`;
    console.log(info);
    setDebugInfo(info);
  }, []);

  // Apply a rotation if necessary (you can tweak or remove based on debug results)
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const videoStyle = isIOS ? { width: '100%', transform: 'rotate(90deg)' } : { width: '100%' };

  // Function to jump to a specific timestamp when a timeline marker is clicked
  const jumpToTime = (time) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      videoRef.current.play();
    }
  };

  return (
    <div>
      {/* Display debug information on-screen */}
      <div style={{
        whiteSpace: 'pre-wrap',
        backgroundColor: '#f0f0f0',
        padding: '10px',
        marginBottom: '10px',
        fontSize: '12px'
      }}>
        {debugInfo}
      </div>
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
