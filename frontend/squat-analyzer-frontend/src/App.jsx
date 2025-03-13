// src/App.jsx
import React, { useState } from 'react';
import ExerciseRecorder from './components/ExerciseRecorder';
import './App.css';

function App() {
  // State to hold all recorded video URLs
  const [recordings, setRecordings] = useState([]);

  // Callback function that receives the recorded video URL from ExerciseRecorder
  const handleRecordingComplete = (videoUrl) => {
    setRecordings(prev => [...prev, videoUrl]);
  };

  return (
    <div className="App">
      <h1>Squat Analyzer</h1>
      {/* Always display the video preview with recording controls */}
      <ExerciseRecorder onRecordingComplete={handleRecordingComplete} />
      
      {/* Video Library */}
      {recordings.length > 0 && (
        <div className="video-library">
          <h2>Recorded Videos</h2>
          {recordings.map((videoUrl, index) => (
            <div key={index} style={{ marginBottom: '20px' }}>
              <video src={videoUrl} controls style={{ width: '100%' }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
