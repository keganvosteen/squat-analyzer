// src/App.jsx
import React, { useState } from 'react';
import ExerciseRecorder from './components/ExerciseRecorder';
import './App.css';

function App() {
  // State to hold all recordings as objects: { videoUrl, feedbackLog }
  const [recordings, setRecordings] = useState([]);

  // Callback function receives an object { videoUrl, feedbackLog }
  const handleRecordingComplete = (data) => {
    setRecordings(prev => [...prev, data]);
  };

  return (
    <div className="App">
      <h1>Squat Analyzer</h1>
      {/* Always display the recorder */}
      <ExerciseRecorder onRecordingComplete={handleRecordingComplete} />
      
      {/* Video Library */}
      {recordings.length > 0 && (
        <div className="video-library">
          <h2>Recorded Videos</h2>
          {recordings.map((recording, index) => (
            <div key={index} style={{ marginBottom: '20px' }}>
              <video src={recording.videoUrl} controls style={{ width: '100%' }} />
              {/* Optionally, display feedback log */}
              <div>
                <h4>Feedback Log:</h4>
                <pre>{JSON.stringify(recording.feedbackLog, null, 2)}</pre>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
