// src/App.jsx
import React, { useState } from 'react';
import styled from 'styled-components';
import axios from 'axios'; // Import axios
import VideoCapture from './components/VideoCapture';
import ExercisePlayback from './components/ExercisePlayback';
import './App.css';

// Define the backend URL with a fallback
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://squat-analyzer-backend.onrender.com';

// Create an axios instance with shorter timeout for free Render tier
const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 30000, // 30 seconds timeout instead of 60
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
  const [videoBlob, setVideoBlob] = useState(null);
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
      
      // Save the blob for potential direct playback
      setVideoBlob(videoBlob);
      
      // Create URL for local playback
      const videoUrl = URL.createObjectURL(videoBlob);
      setVideoUrl(videoUrl);
      
      const formData = new FormData();
      formData.append('video', videoBlob, 'squat-recording.webm');

      console.log(`Sending request to ${BACKEND_URL}/analyze`);
      
      // Use axios instead of fetch
      const response = await api.post('/analyze', formData, {
        onUploadProgress: progressEvent => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          console.log(`Upload progress: ${percentCompleted}%`);
        }
      });
      
      console.log("Analysis data received:", response.data);
      setAnalysisData(response.data);
      setShowPlayback(true);
    } catch (error) {
      console.error("Error analyzing video:", error);
      
      // Extract the most useful error message
      let errorMessage = "Unknown error";
      if (error.code === 'ECONNABORTED') {
        errorMessage = "Analysis took too long and timed out. This is common on the free Render tier. You can still watch your recording without the analysis overlays.";
      } else if (error.response) {
        // Server responded with an error status
        errorMessage = `Server error: ${error.response.status} ${error.response.statusText}`;
        console.error("Server error details:", error.response.data);
      } else if (error.request) {
        // Request was made but no response received
        errorMessage = "No response from server. The backend may be offline or restarting.";
      } else {
        // Something else caused the error
        errorMessage = error.message;
      }
      
      // Still show the video for playback even if analysis failed
      setShowPlayback(true);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleBackToRecord = () => {
    // Clean up resources
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    
    setVideoBlob(null);
    setVideoUrl(null);
    setAnalysisData(null);
    setError(null);
    setShowPlayback(false);
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
            
            {error && (
              <div className="mt-4 p-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700">
                <p className="font-bold">Analysis Warning:</p>
                <p>{error}</p>
              </div>
            )}
            
            <button
              onClick={handleBackToRecord}
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Record New Video
            </button>
          </div>
        )}

        {loading && (
          <div className="text-center mt-4 p-4 bg-blue-100 rounded">
            <p className="font-semibold">Analyzing video...</p>
            <p className="text-sm text-gray-600 mt-2">This can take up to 30 seconds on the free Render tier. Please be patient.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
