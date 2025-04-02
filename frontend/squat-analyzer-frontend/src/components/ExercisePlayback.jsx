// src/components/ExercisePlayback.jsx
import React, { useRef, useEffect } from 'react';

const ExercisePlayback = ({ videoUrl, feedbackLog }) => {
  const videoRef = useRef(null);
  const timelineRef = useRef(null);

  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  const videoStyle = {
    width: '100%',
    ...(isIOS ? { transform: 'rotate(-90deg)' } : {})
  };

  const jumpToTime = (time) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      videoRef.current.play();
    }
  };

  const createMarkers = () => {
    const video = videoRef.current;
    const timeline = timelineRef.current;

    if (!video || !timeline || !video.duration) return;

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
    return () => {
      if (video) {
        video.removeEventListener('loadedmetadata', createMarkers);
      }
    };
  }, [feedbackLog, videoUrl]);

  return (
    <div>
      <video ref={videoRef} src={videoUrl} controls style={videoStyle} />

      {/* Timeline with markers */}
      <div ref={timelineRef} className="relative w-full h-2 bg-gray-200 rounded overflow-hidden mt-2" />

      <div className="mt-4">
        <h3 className="font-semibold">Timeline Markers:</h3>
        <ul className="list-disc ml-5">
          {feedbackLog.map((entry, index) => (
            <li key={index}>
              <button onClick={() => jumpToTime(entry.timestamp)} className="text-blue-500 hover:underline">
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
