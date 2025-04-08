// src/App.jsx
import React, { useState } from 'react';
import styled from 'styled-components';
import VideoCapture from './components/VideoCapture';
import ExercisePlayback from './components/ExercisePlayback';
import './App.css';

const API_URL = process.env.NODE_ENV === 'production' 
  ? 'https://squat-analyzer-backend.onrender.com'
  : 'http://localhost:3000';

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
`;

const Title = styled.h1`
  text-align: center;
  color: #333;
  margin-bottom: 2rem;
`;

const App = () => {
  const [recordedVideo, setRecordedVideo] = useState(null);
  const [analysisData, setAnalysisData] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);

  const handleRecordingComplete = async (data) => {
    console.log('Recording complete:', data);
    if (!data.videoBlob || data.videoBlob.size === 0) {
      setError('Recording failed. Please try again.');
      return;
    }
    setRecordedVideo(data);
    await analyzeVideo(data.videoBlob);
  };

  const analyzeVideo = async (videoBlob) => {
    try {
      setIsAnalyzing(true);
      setError(null);

      const formData = new FormData();
      formData.append('video', videoBlob, 'squat-recording.webm');

      const response = await fetch(`${API_URL}/api/analyze`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Analysis complete:', data);
      setAnalysisData(data);
    } catch (error) {
      console.error('Error analyzing video:', error);
      setError('Failed to analyze video. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <Container>
      <Title>Squat Analyzer</Title>
      {!recordedVideo ? (
        <VideoCapture onRecordingComplete={handleRecordingComplete} />
      ) : (
        <ExercisePlayback
          videoUrl={recordedVideo.videoUrl}
          analysisData={analysisData}
          isAnalyzing={isAnalyzing}
          error={error}
          onReset={() => {
            setRecordedVideo(null);
            setAnalysisData(null);
            setError(null);
          }}
        />
      )}
    </Container>
  );
};

export default App;
