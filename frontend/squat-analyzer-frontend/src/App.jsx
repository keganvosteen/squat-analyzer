// src/App.jsx
import React, { useState } from 'react';
import styled from 'styled-components';
import VideoCapture from './components/VideoCapture';
import ExercisePlayback from './components/ExercisePlayback';
import './App.css';

const AppContainer = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
`;

const Title = styled.h1`
  text-align: center;
  color: #333;
  margin-bottom: 30px;
`;

const Section = styled.div`
  margin-bottom: 40px;
`;

const App = () => {
  const [recordedVideo, setRecordedVideo] = useState(null);
  const [analysisData, setAnalysisData] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [apiConnectionFailed, setApiConnectionFailed] = useState(false);
  const [error, setError] = useState(null);

  const handleRecordingComplete = (videoUrl, videoBlob) => {
    console.log('Recording complete:', { videoUrl, videoBlob });
    setRecordedVideo(videoUrl);
    setShowAnalysis(false);
    setAnalysisData(null);
    setApiConnectionFailed(false);
    setError(null);
    
    // Create FormData and append the video blob
    const formData = new FormData();
    formData.append('video', videoBlob, 'squat-recording.webm');
    
    // Send video for analysis
    fetch(`${API_URL}/api/analyze`, {
      method: 'POST',
      body: formData
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('Analysis complete:', data);
      setAnalysisData(data);
      setShowAnalysis(true);
    })
    .catch(error => {
      console.error('Error analyzing video:', error);
      setError('Failed to analyze video. Please try again.');
      setApiConnectionFailed(true);
    });
  };

  return (
    <AppContainer>
      <Title>Squat Analysis</Title>
      
      <Section>
        {!recordedVideo ? (
          <VideoCapture onRecordingComplete={handleRecordingComplete} />
        ) : (
          <ExercisePlayback 
            videoUrl={recordedVideo}
            analysisData={analysisData}
          />
        )}
      </Section>

      {isAnalyzing && (
        <div style={{ textAlign: 'center' }}>
          Analyzing your squat... Please wait.
        </div>
      )}

      {showAnalysis && (
        <div style={{ textAlign: 'center' }}>
          Analysis complete!
        </div>
      )}

      {apiConnectionFailed && (
        <div style={{ textAlign: 'center', color: 'red' }}>
          {error}
        </div>
      )}
    </AppContainer>
  );
};

export default App;
