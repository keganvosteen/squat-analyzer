// src/App.jsx
import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import axios from 'axios'; // Import axios
import VideoCapture from './components/VideoCapture';
import ExercisePlayback from './components/ExercisePlayback';
import LocalAnalysis from './utils/LocalAnalysis'; // Import local analysis module (we'll create this)
import ServerWarmup from './utils/ServerWarmup'; // Import server warmup utility
// Import logo images from public folder
import './App.css';

// Define the backend URL with a fallback
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://squat-analyzer-backend.onrender.com';

// Create an axios instance with shorter timeout for free Render tier
const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 45000, // 45 seconds timeout instead of 30
  headers: {
    'Content-Type': 'multipart/form-data',
  }
});

// Make sure Axios is using our extended timeout globally
axios.defaults.timeout = 45000;

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

const LogosContainer = styled.div`
  display: flex;
  justify-content: center;
  gap: 40px;
  margin-bottom: 2rem;
`;

const Logo = styled.img`
  height: 50px;
  width: auto;
  object-fit: contain;
`;

// Use local image paths instead of remote URLs
const COLUMBIA_BUSINESS_LOGO = '/images/columbia-business.png';
const COLUMBIA_ENGINEERING_LOGO = '/images/columbia_engineering.svg';

const App = () => {
  const [videoBlob, setVideoBlob] = useState(null);
  const [analysisData, setAnalysisData] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [showPlayback, setShowPlayback] = useState(false);
  const [loading, setLoading] = useState(false);
  const [usingLocalAnalysis, setUsingLocalAnalysis] = useState(false);
  const [serverReady, setServerReady] = useState(false);
  const [logoError, setLogoError] = useState(false);

  // Start the server warmup service when the app loads
  useEffect(() => {
    // Start pinging the server every 8 minutes to keep it warm
    ServerWarmup.startWarmupService(8 * 60 * 1000);
    
    // Try an initial ping to check if server is ready
    ServerWarmup.pingServer().then(isReady => {
      setServerReady(isReady);
    });
    
    // Clean up the interval when the component unmounts
    return () => {
      ServerWarmup.stopWarmupService();
    };
  }, []);

  // Handle logo loading errors
  const handleLogoError = () => {
    setLogoError(true);
    console.warn("Error loading one or more logo images. Using text fallback.");
  };

  const handleRecordingComplete = async (videoBlob) => {
    console.log("Recording complete, preparing for analysis...", {blobSize: videoBlob.size, blobType: videoBlob.type});
    try {
      setLoading(true);
      setError(null);
      setShowPlayback(true); // Show playback immediately for better UX
      setUsingLocalAnalysis(false);
      
      // Save the blob for potential direct playback
      setVideoBlob(videoBlob);
      
      // Create URL for local playback
      const videoUrl = URL.createObjectURL(videoBlob);
      setVideoUrl(videoUrl);
      
      const formData = new FormData();
      formData.append('video', videoBlob, 'squat-recording.webm');

      console.log(`Sending request to ${BACKEND_URL}/analyze with blob size ${Math.round(videoBlob.size / 1024)} KB`);
      
      try {
        // Use axios with timeout
        const response = await api.post('/analyze', formData, {
          timeout: 45000, // Explicitly set timeout for this request
          onUploadProgress: progressEvent => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            console.log(`Upload progress: ${percentCompleted}%`);
          }
        });
        
        console.log("Analysis data received:", response.data);
        
        // Validate analysis data
        if (response.data && 
            response.data.success && 
            Array.isArray(response.data.frames) && 
            response.data.frames.length > 0) {
          // Valid analysis data
          setAnalysisData(response.data);
        } else {
          console.warn("Received invalid analysis data from backend", response.data);
          
          // Try local analysis as fallback
          console.log("Falling back to local analysis due to invalid backend response");
          const localAnalysisResult = await LocalAnalysis.analyzeVideo(videoBlob, videoUrl);
          setAnalysisData(localAnalysisResult);
          setUsingLocalAnalysis(true);
          setError("Backend analysis returned invalid data. Using simplified local analysis instead.");
        }
      } catch (apiError) {
        console.error("Backend analysis error:", apiError);
        
        // Extract error message
        let errorMessage = "Unknown error";
        let shouldTryLocalAnalysis = false;
        
        if (apiError.code === 'ECONNABORTED') {
          // Check if we're hitting the 30s default timeout despite our 45s setting
          const isDefaultTimeout = apiError.message.includes('timeout of 30000ms exceeded');
          
          if (isDefaultTimeout) {
            console.warn("Warning: Default 30s timeout was used instead of configured 45s timeout!");
            errorMessage = "Analysis took too long and timed out after 30 seconds (instead of expected 45s). Switching to local analysis mode.";
          } else {
            errorMessage = "Analysis took too long and timed out after 45 seconds. Switching to local analysis mode.";
          }
          shouldTryLocalAnalysis = true;
        } else if (apiError.response) {
          // Server responded with an error status
          errorMessage = `Server error: ${apiError.response.status} ${apiError.response.statusText}`;
          console.error("Server error details:", apiError.response.data);
          shouldTryLocalAnalysis = true; // Also try local analysis for server errors
        } else if (apiError.request) {
          // Request was made but no response received
          errorMessage = "No response from server. The backend may be offline or restarting.";
          shouldTryLocalAnalysis = true; // Also try local analysis when server is unreachable
        } else {
          // Something else caused the error
          errorMessage = apiError.message;
        }
        
        // Try local analysis as fallback
        if (shouldTryLocalAnalysis) {
          console.log("Attempting local analysis as fallback...");
          try {
            const localAnalysisResult = await LocalAnalysis.analyzeVideo(videoBlob, videoUrl);
            if (localAnalysisResult && localAnalysisResult.success) {
              console.log("Local analysis succeeded:", localAnalysisResult);
              setAnalysisData(localAnalysisResult);
              setUsingLocalAnalysis(true);
              setError("Using simplified local analysis due to backend timeout. Some advanced features may not be available.");
              return;
            } else {
              console.error("Local analysis returned invalid data");
              errorMessage += " Local analysis also failed.";
            }
          } catch (localError) {
            console.error("Local analysis error:", localError);
            // Continue with server error message, don't expose local error to user
          }
        }
        
        setError(errorMessage);
      }
    } catch (error) {
      console.error("General error in recording handling:", error);
      setError(`Error: ${error.message || "Unknown error occurred"}`);
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
    setUsingLocalAnalysis(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="container mx-auto px-4">
        <Container>
          <Title>Columbia Squat Analyzer</Title>
          <LogosContainer>
            {logoError ? (
              <div className="text-logos">
                <span className="text-logo">Columbia Business School</span>
                <span className="text-logo">Columbia Engineering</span>
              </div>
            ) : (
              <>
                <Logo 
                  src={COLUMBIA_BUSINESS_LOGO}
                  alt="Columbia Business School" 
                  onError={handleLogoError}
                />
                <Logo 
                  src={COLUMBIA_ENGINEERING_LOGO}
                  alt="Columbia Engineering" 
                  onError={handleLogoError}
                />
              </>
            )}
          </LogosContainer>
          
          {!showPlayback ? (
            <VideoCapture onRecordingComplete={handleRecordingComplete} />
          ) : (
            <ExercisePlayback
              videoUrl={videoUrl}
              analysisData={analysisData}
              isAnalyzing={isAnalyzing || loading}
              error={error}
              onBackToRecord={handleBackToRecord}
              usingLocalAnalysis={usingLocalAnalysis}
            />
          )}
        </Container>
        
        {loading && (
          <div className="text-center mt-4 p-4 bg-blue-100 rounded">
            <p className="font-semibold">Analyzing video...</p>
            <p className="text-sm text-gray-600 mt-2">This can take up to 45 seconds on the free Render tier. Please be patient.</p>
            {videoBlob && videoBlob.size > 3 * 1024 * 1024 && (
              <p className="text-sm text-gray-600 mt-1">
                <span className="font-medium">Video compression active:</span> Large videos are automatically compressed to improve analysis speed.
              </p>
            )}
            {serverReady && (
              <p className="text-sm text-green-600 mt-1">✓ Server is warmed up and ready</p>
            )}
            {!serverReady && (
              <p className="text-sm text-orange-600 mt-1">⚠️ Server may be starting up (cold start)</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
