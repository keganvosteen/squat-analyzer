// src/App.jsx
import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import axios from 'axios'; // Import axios
import VideoCapture from './components/VideoCapture';
import ExercisePlayback from './components/ExercisePlayback';
import LocalAnalysis from './utils/LocalAnalysis'; // Import local analysis module (we'll create this)
import ServerWarmup from './utils/ServerWarmup'; // Import server warmup utility
// Import logo images 
import './App.css';
// Import logos directly
import cbsLogo from '/public/CBSLogo.png';
import seasLogo from '/public/SEASLogo.png';

// Define the backend URL with a fallback
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://squat-analyzer-backend.onrender.com';

// Create an axios instance with better CORS handling and timeout for free Render tier
const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 45000, // 45 seconds timeout instead of 30
  headers: {
    'Content-Type': 'multipart/form-data',
    'Origin': window.location.origin,
    'Access-Control-Request-Method': 'POST,GET,OPTIONS'
  },
  withCredentials: false // Don't send cookies for cross-domain requests
});

// Setup axios interceptors for better error handling
api.interceptors.request.use(
  (config) => {
    // Add timestamp to prevent caching
    config.params = {
      ...config.params,
      _t: Date.now()
    };
    return config;
  },
  (error) => {
    console.error("Axios request error:", error);
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Check for CORS errors
    if (error.code === 'ERR_NETWORK' || 
        (error.response && error.response.status === 0) ||
        error.message.includes('Network Error')) {
      console.error("CORS or network error detected:", error);
      // Force local analysis mode when we encounter CORS issues
      ServerWarmup.forceLocalAnalysis();
    }
    return Promise.reject(error);
  }
);

// Make sure Axios is using our extended timeout globally
axios.defaults.timeout = 45000;

// Styled components with improved dark mode support
const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
`;

const Title = styled.h1`
  text-align: center;
  color: var(--text-primary);
  margin-bottom: 1rem;
  font-size: 2.5rem;
`;

const LogosContainer = styled.div`
  display: flex;
  justify-content: center;
  gap: 40px;
  margin-bottom: 1rem;
  align-items: center;
`;

const Logo = styled.img`
  height: 80px;
  width: auto;
  object-fit: contain;
`;

const TextLogo = styled.div`
  font-size: 18px;
  font-weight: bold;
  color: var(--text-primary);
  margin: 0 20px;
  text-align: center;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background-color: var(--bg-secondary);
`;

const ServerStatusMessage = styled.div`
  text-align: center;
  margin-bottom: 1rem;
  padding: 8px 16px;
  border-radius: 4px;
  background-color: ${props => {
    switch(props.$status) {
      case 'ready': return 'var(--success-color)';
      case 'error': return 'var(--error-color)';
      case 'starting': return 'var(--warning-color)';
      case 'local': return 'var(--success-color)';
      default: return 'var(--bg-secondary)';
    }
  }};
  color: ${props => props.$status === 'ready' ? '#fff' : 'var(--text-primary)'};
  font-weight: ${props => props.$status === 'ready' ? 'normal' : 'bold'};
  transition: all 0.3s ease;
  display: ${props => props.$status === 'unknown' ? 'none' : 'block'};
`;

const App = () => {
  const [videoBlob, setVideoBlob] = useState(null);
  const [analysisData, setAnalysisData] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [showPlayback, setShowPlayback] = useState(false);
  const [loading, setLoading] = useState(false);
  const [usingLocalAnalysis, setUsingLocalAnalysis] = useState(false);
  const [serverStatus, setServerStatus] = useState('unknown');
  const [logoError, setLogoError] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  // Add listener for color scheme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      setIsDarkMode(e.matches);
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Apply CSS variables for theme
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--bg-primary', 
      isDarkMode ? '#121212' : '#f5f5f5'
    );
    document.documentElement.style.setProperty(
      '--bg-secondary', 
      isDarkMode ? '#1e1e1e' : '#ffffff'
    );
    document.documentElement.style.setProperty(
      '--text-primary', 
      isDarkMode ? '#e0e0e0' : '#333333'
    );
    document.documentElement.style.setProperty(
      '--text-secondary', 
      isDarkMode ? '#a0a0a0' : '#666666'
    );
    document.documentElement.style.setProperty(
      '--border-color',
      isDarkMode ? '#444444' : '#dddddd'
    );
    document.documentElement.style.setProperty(
      '--accent-color',
      '#0072CE'
    );
    document.documentElement.style.setProperty(
      '--error-color',
      isDarkMode ? '#ff6b6b' : '#d32f2f'
    );
    document.documentElement.style.setProperty(
      '--success-color',
      isDarkMode ? '#4caf50' : '#4caf50'
    );
    document.documentElement.style.setProperty(
      '--warning-color',
      isDarkMode ? '#ff9800' : '#ff9800'
    );
  }, [isDarkMode]);

  // Logo error handler
  const handleLogoError = () => {
    console.error("Logo image failed to load");
    setLogoError(true);
  };

  // Start the server warmup service when the app loads
  useEffect(() => {
    // Check if we should force local analysis mode based on URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const forceLocal = urlParams.get('local') === 'true';
    
    if (forceLocal) {
      console.log("Forcing local analysis mode based on URL parameter");
      ServerWarmup.forceLocalAnalysis();
      setUsingLocalAnalysis(true);
      return;
    }
    
    // Warm up the server
    ServerWarmup.warmupServer(BACKEND_URL);
    
    // Subscribe to server status changes
    const unsubscribe = ServerWarmup.onServerStatusChange((status) => {
      console.log("Server status updated:", status);
      setServerStatus(status);
      
      // Automatically set local analysis mode if server is in error or local state
      if (status === 'error' || status === 'local') {
        setUsingLocalAnalysis(true);
      }
    });
    
    // Set a shorter ping interval to check server status more frequently
    const pingInterval = setInterval(() => {
      if (!ServerWarmup.isUsingLocalAnalysis()) {
        ServerWarmup.pingServer();
      }
    }, 10000); // Every 10 seconds
    
    // Clean up on unmount
    return () => {
      unsubscribe();
      clearInterval(pingInterval);
    };
  }, []);

  // Function to get server status message
  const getServerStatusMessage = () => {
    switch (serverStatus) {
      case 'ready':
        return 'Server is ready for analysis';
      case 'starting':
        return 'Server is starting up... This can take 30-60 seconds. You can still record videos while waiting.';
      case 'error':
        return 'Server is currently unavailable. Local analysis will be used.';
      case 'local':
        return 'Using local analysis mode for faster processing.';
      default:
        return 'Checking server status...';
    }
  };

  // Handle when a recording is completed
  const handleRecordingComplete = async (blob, metadata = {}) => {
    if (!blob || blob.size === 0) {
      setError("Recording failed - no data captured");
      return;
    }
    
    setLoading(true);
    setVideoBlob(blob);
    const url = URL.createObjectURL(blob);
    setVideoUrl(url);
    setShowPlayback(true);
    setIsAnalyzing(true);
    setError(null);
    
    // Store recording metadata (like camera facing mode) for later use
    console.log("Recording metadata:", metadata);
    
    // Check if we should use local analysis
    const shouldUseLocalAnalysis = ServerWarmup.isUsingLocalAnalysis() || serverStatus !== 'ready';
    setUsingLocalAnalysis(shouldUseLocalAnalysis);
    
    try {
      // If server is not ready or has errors, skip the API call and go straight to local analysis
      if (shouldUseLocalAnalysis) {
        console.log("Using local analysis due to server status:", serverStatus);
        throw new Error("Using local analysis mode");
      }
      
      const formData = new FormData();
      formData.append('video', blob, 'squat_video.webm');
      
      // Send the video to the backend for analysis
      console.log("Sending video to backend for analysis...");
      const response = await api.post('/analyze', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      console.log("Analysis response:", response.data);
      
      // More robust response validation
      if (response.data && 
          typeof response.data === 'object' && 
          Array.isArray(response.data.frames) && 
          response.data.frames.length > 0) {
        setAnalysisData(response.data);
      } else {
        console.error("Invalid server response format:", response.data);
        throw new Error("Invalid response format from server");
      }
      
    } catch (apiError) {
      console.error("API Error:", apiError);
      
      // Update server status if we got a network error
      if (apiError.code === 'ECONNABORTED' || 
          apiError.message.includes('Network Error')) {
        console.log("Network error, switching to local analysis mode");
        ServerWarmup.forceLocalAnalysis();
        setUsingLocalAnalysis(true);
      }
      
      // For user-facing error message
      let errorMessage = '';
      if (apiError.code === 'ECONNABORTED') {
        errorMessage = "Analysis took too long. Using local analysis instead.";
      } else if (apiError.message.includes('Using local analysis')) {
        // This is expected when we choose to use local analysis
        errorMessage = '';
      } else if (apiError.message.includes('Network Error')) {
        errorMessage = "Network error. Using local analysis instead.";
      } else {
        errorMessage = `Server analysis failed: ${apiError.message}`;
      }
      
      // Only set the error if we'll need to show it
      if (errorMessage) {
        setError(errorMessage);
      }
      
      // Try local analysis as a fallback
      try {
        console.log("Running local analysis...");
        
        // Process the video locally
        const localResults = await LocalAnalysis.analyzeVideo(blob, url);
        
        if (localResults && Array.isArray(localResults.frames) && localResults.frames.length > 0) {
          console.log("Local analysis successful with", localResults.frames.length, "frames");
          setAnalysisData(localResults);
        } else {
          throw new Error("Local analysis failed to generate valid results");
        }
      } catch (localError) {
        console.error("Local analysis failed:", localError);
        setError(`Analysis failed: ${localError.message || 'Unknown error'}`);
        setAnalysisData(null);
      }
    } finally {
      setIsAnalyzing(false);
      setLoading(false);
    }
  };

  // Handle going back to the recording screen
  const handleBackToRecord = () => {
    // Clean up resources
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    
    // Reset state
    setVideoUrl(null);
    setVideoBlob(null);
    setAnalysisData(null);
    setShowPlayback(false);
    setError(null);
    setIsAnalyzing(false);
    setUsingLocalAnalysis(false);
  };

  return (
    <div className="app">
      <Container>
        <LogosContainer>
          <Logo 
            src={seasLogo} 
            alt="Columbia Engineering Logo" 
            onError={handleLogoError}
          />
          <Logo 
            src={cbsLogo} 
            alt="Columbia Business School Logo" 
            onError={handleLogoError}
          />
        </LogosContainer>
        
        <Title>SmartSquat</Title>
        
        <ServerStatusMessage $status={serverStatus}>
          {getServerStatusMessage()}
        </ServerStatusMessage>
        
        {!showPlayback ? (
              <VideoCapture 
                onRecordingComplete={handleRecordingComplete}
              />
        ) : (
              <ExercisePlayback 
            videoUrl={videoUrl}
            videoBlob={videoBlob}
            analysisData={analysisData}
            usingLocalAnalysis={usingLocalAnalysis}
            isLoading={isAnalyzing || loading}
            error={error}
            onBack={handleBackToRecord}
          />
        )}
      </Container>
    </div>
  );
};

export default App;
