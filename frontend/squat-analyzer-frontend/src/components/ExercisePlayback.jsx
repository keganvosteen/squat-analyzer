// src/components/ExercisePlayback.jsx
import React, { useRef, useState, useEffect } from 'react';

const ExercisePlayback = ({ videoUrl, feedbackLog }) => {
  const videoRef = useRef(null);
  const [isMobile, setIsMobile] = useState(false);

  // Check if the device is mobile by looking at the window width
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // adjust the breakpoint as needed
    };

    // Check on mount
    checkMobile();

    // Update when window resizes
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Conditionally apply rotation if mobile
  const videoStyle = isMobile
    ? { width: '100%', transform: 'rotate(90deg)' }
    : { width: '100%' };

  // Function to jump to a specific time in the video when a timeline marker is clicked
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
