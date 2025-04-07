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

  const handleRecordingComplete = async (videoUrl, videoBlob) => {
    setRecordedVideo(videoUrl);
    setIsAnalyzing(true);

    // Create FormData to send the video to the backend
    const formData = new FormData();
    formData.append('video', videoBlob, 'squat-recording.webm');

    try {
      // Send the video to the backend for analysis
      const response = await fetch('http://localhost:3000/api/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Analysis failed');
      }

      const data = await response.json();
      setAnalysisData(data);
    } catch (error) {
      console.error('Error analyzing video:', error);
      alert('Error analyzing video. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
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
    </AppContainer>
  );
};

export default App;
