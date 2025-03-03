// src/App.jsx
import React, { useState } from 'react';
import VideoCapture from './components/VideoCapture';
import './App.css';

function App() {
  // State to store feedback from the backend
  const [feedback, setFeedback] = useState(null);

  // Callback to receive feedback from VideoCapture
  const handleFrameFeedback = (data) => {
    console.log("Received backend feedback:", data);
    setFeedback(data);
  };

  return (
    <div className="App">
      <h1>Squat Analyzer</h1>
      {/* Pass the callback to VideoCapture */}
      <VideoCapture onFrameCapture={handleFrameFeedback} />
      
      {/* Display the feedback if available */}
      {feedback && (
        <div className="feedback">
          <h2>Analysis Feedback:</h2>
          <pre>{JSON.stringify(feedback, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export default App;
