// src/App.jsx
import React, { useState } from 'react';
import ExerciseRecorder from './components/ExerciseRecorder';
import ExercisePlayback from './components/ExercisePlayback';
import './App.css';

function App() {
  // State to hold the recorded video URL and feedback log
  const [recordingData, setRecordingData] = useState(null);
  // State to determine whether to show the playback view or the recorder
  const [showPlayback, setShowPlayback] = useState(false);

  // Callback triggered when recording is complete
  const handleRecordingComplete = (data) => {
    setRecordingData(data);
    setShowPlayback(true);
  };

  return (
    <div className="App">
      <h1>Squat Analyzer</h1>
      { !showPlayback ? (
        // Show the recorder if playback isn't ready
        <ExerciseRecorder onRecordingComplete={handleRecordingComplete} />
      ) : (
        // Once recording is complete, show the playback component
        <ExercisePlayback 
          videoUrl={recordingData.videoUrl} 
          feedbackLog={recordingData.feedbackLog} 
        />
      )}
    </div>
  );
}

export default App;

