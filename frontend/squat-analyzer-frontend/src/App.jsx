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
  const [videoUrl, setVideoUrl] = useState(null);
  const [showPlayback, setShowPlayback] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRecordingComplete = async (videoBlob) => {
    try {
      setLoading(true);
      setError(null);

      // Store video URL for playback
      const videoUrl = URL.createObjectURL(videoBlob);
      setVideoUrl(videoUrl);

      // Create FormData and append video
      const formData = new FormData();
      formData.append('video', videoBlob, 'squat-recording.webm');

      // Send video to backend for analysis
      console.log('Sending video for analysis...');
      const response = await fetch('http://localhost:5000/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to analyze video');
      }

      const data = await response.json();
      console.log('Received analysis data:', data);

      if (data.error) {
        throw new Error(data.error);
      }

      setAnalysisData(data);
      setShowPlayback(true);
    } catch (err) {
      console.error('Error analyzing video:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-3xl font-bold text-center mb-8">Squat Form Analyzer</h1>
        
        {!showPlayback ? (
          <VideoCapture onRecordingComplete={handleRecordingComplete} />
        ) : (
          <div>
            <ExercisePlayback
              videoUrl={videoUrl}
              analysisData={analysisData}
            />
            <button
              onClick={() => {
                setShowPlayback(false);
                setVideoUrl(null);
                setAnalysisData(null);
              }}
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Record New Video
            </button>
          </div>
        )}

        {loading && (
          <div className="text-center mt-4">
            <p>Analyzing video...</p>
          </div>
        )}

        {error && (
          <div className="text-red-500 text-center mt-4">
            <p>{error}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
