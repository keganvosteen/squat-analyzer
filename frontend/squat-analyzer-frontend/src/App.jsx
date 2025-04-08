// src/App.jsx
import React, { useState } from 'react';
import styled from 'styled-components';
import axios from 'axios'; // Import axios
import VideoCapture from './components/VideoCapture';
import ExercisePlayback from './components/ExercisePlayback';
import './App.css';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://squat-analyzer-backend.onrender.com';

// Create an axios instance
const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 60000, // 60 seconds timeout
  headers: {
    'Content-Type': 'multipart/form-data',
  }
});

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
    console.log("Recording complete, preparing for analysis...");
    try {
      setLoading(true);
      setError(null);
      
      // Create URL for local playback
      const videoUrl = URL.createObjectURL(videoBlob);
      setVideoUrl(videoUrl);
      
      const formData = new FormData();
      formData.append('video', videoBlob, 'squat-recording.webm');

      console.log(`Sending request to ${BACKEND_URL}/analyze`);
      
      // Use axios instead of fetch
      const response = await api.post('/analyze', formData);
      
      console.log("Analysis data received:", response.data);
      setAnalysisData(response.data);
      setShowPlayback(true);
    } catch (error) {
      console.error("Error analyzing video:", error);
      
      // Extract the most useful error message
      let errorMessage = "Unknown error";
      if (error.response) {
        // Server responded with an error status
        errorMessage = `Server error: ${error.response.status} ${error.response.statusText}`;
        console.error("Server error details:", error.response.data);
      } else if (error.request) {
        // Request was made but no response received
        errorMessage = "No response from server. Please check your connection.";
      } else {
        // Something else caused the error
        errorMessage = error.message;
      }
      
      // Still show the video for playback even if analysis failed
      setShowPlayback(true);
      setError(`Failed to analyze video: ${errorMessage}`);
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
