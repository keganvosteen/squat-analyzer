// src/App.jsx
import React, { useState } from 'react';
import styled from 'styled-components';
import VideoCapture from './components/VideoCapture';
import ExercisePlayback from './components/ExercisePlayback';
import './App.css';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://squat-analyzer-backend.onrender.com';

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
    console.log("Sending video for analysis...");
    try {
      const formData = new FormData();
      formData.append('video', videoBlob, 'squat-recording.webm');

      const response = await fetch(`${BACKEND_URL}/analyze`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const analysisData = await response.json();
      console.log("Analysis data received:", analysisData);
      setAnalysisData(analysisData);
    } catch (error) {
      console.error("Error analyzing video:", error);
      setError(`Failed to analyze video: ${error.message}`);
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
