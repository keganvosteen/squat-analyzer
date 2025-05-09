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
import mbamsLogo from '/MBAMS_logo.png';
import crownIcon from '/ColumbiaCrown.png';
import smartSquatLogo from '/smartsquat.png';

// Define the backend URL with a fallback
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:5000';

// Determine if we're in development mode
const isDevelopment = import.meta.env.DEV;

// Create an API URL that uses the local proxy in development
const getApiUrl = (endpoint) => {
  if (isDevelopment) {
    // In development, use the Vite proxy
    return endpoint; // e.g., '/analyze' will be proxied by Vite
  } else {
    // In production, use the full URL
    return `${BACKEND_URL}${endpoint}`;
  }
};

// Create a configured instance of axios with better CORS handling
const api = axios.create({
  baseURL: isDevelopment ? '' : BACKEND_URL, // In dev mode, use relative URLs for proxy
  timeout: 45000, // 45 seconds default timeout for longer videos
  withCredentials: false, // Important for CORS
  headers: {
    'Content-Type': 'application/json',
  }
});

// Add an interceptor to handle CORS and other errors gracefully
api.interceptors.response.use(
  response => response,
  error => {
    // Check if the error is related to CORS or unsafe headers
    const isCorsError = error.code === 'ERR_NETWORK' && 
                       (error.message?.includes('Network Error') || 
                        error.message?.includes('CORS'));
    
    const isHeaderError = error.message?.includes('Refused to set unsafe header');
    
    if (isCorsError || isHeaderError) {
      console.log('CORS or header error detected:', error.message);
      // Force local analysis mode on CORS errors
      ServerWarmup.forceLocalAnalysis();
      
      // For header errors, provide a more specific warning
      if (isHeaderError) {
        console.warn('Browser blocked restricted headers. This is expected behavior.');
      }
    }
    return Promise.reject(error);
  }
);

// Styled components with improved dark mode support
const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0.75rem 2rem 2rem;
`;

const Title = styled.h1`
  text-align: center;
  color: var(--accent-color);
  margin: 0;
  padding: 0;
  font-size: 2.2rem;
  font-weight: bold;
  letter-spacing: 1px;
  width: 100%;
  max-width: 250px;
  line-height: 1;
`;

const LogosContainer = styled.div`
  display: flex;
  justify-content: space-between;
  width: 100%;
  margin-bottom: 1rem;
  align-items: flex-end;
  max-width: 960px;
  margin-left: auto;
  margin-right: auto;
  padding: 0 20px;
`;

const Logo = styled.img`
  height: auto;
  width: 100%;
  max-width: 250px;
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
      default: return 'var(--bg-secondary)';
    }
  }};
  color: ${props => props.$status === 'ready' ? '#fff' : 'var(--text-primary)'};
  font-weight: ${props => props.$status === 'ready' ? 'normal' : 'bold'};
  transition: all 0.3s ease;
  display: ${props => props.$status === 'unknown' ? 'none' : 'block'};
`;

const ServerAction = styled.button`
  background-color: var(--accent-color);
  color: white;
  border: none;
  border-radius: 4px;
  padding: 6px 12px;
  font-size: 14px;
  margin-left: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background-color: #005ea8;
  }
`;

const ServerStatusContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 1rem;
`;

const App = () => {
  const [videoBlob, setVideoBlob] = useState(null);
  const [analysisData, setAnalysisData] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [showPlayback, setShowPlayback] = useState(false);
  const [loading, setLoading] = useState(false);
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
      return;
    }
    
    // Warm up the server
    ServerWarmup.warmupServer(BACKEND_URL);
    
    // Subscribe to server status changes
    const unsubscribe = ServerWarmup.onServerStatusChange((status) => {
      console.log("Server status updated:", status);
      setServerStatus(status);
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
        return 'Server is currently unavailable. Please try again later.';
      default:
        return 'Checking server status...';
    }
  };

  // Function to directly check server status before sending analysis
  const checkServerDirectly = async () => {
    console.log("Performing direct server status check before analysis...");
    try {
      const analyzeEndpoint = isDevelopment ? '/ping' : `${BACKEND_URL}/ping`;
      const response = await axios.get(analyzeEndpoint, { 
        timeout: 5000,
        validateStatus: function (status) {
          return status < 500;
        }
      });
      
      console.log("Direct server check response:", response.data);
      return response.status === 200 && response.data && response.data.status === "alive";
    } catch (error) {
      console.error("Direct server check failed:", error.message);
      return false;
    }
  };

  // Handle when a recording is completed
  const handleRecordingComplete = async (blobOrPromise) => {
    // Await the blob in case it's a Promise (from webm-duration-fix)
    const blob = await blobOrPromise;
    console.log("Recording complete, blob received:", blob);
    
    if (!blob) {
      console.error("No blob received from recording");
      setError("Recording failed: No video data received");
      setLoading(false);
      return;
    }

    setLoading(true);
    // Debug logging for blob
    console.log("Blob info:", {
      size: blob.size,
      type: blob.type,
      isFallback: blob._isFallback,
      isEmptyFallback: blob._isEmptyFallback
    });
    if (blob.size === 0) {
      console.error("Blob is empty. Aborting analysis.");
      setError("Recording failed: Video data is empty. Please try again.");
      setLoading(false);
      return;
    }
    
    // Check for invalid fallback blob
    if (blob.type === 'text/plain' && blob._isEmptyFallback) {
      console.error("Received invalid fallback blob from VideoCapture. Aborting analysis.");
      setError("Recording failed to capture usable video data. Please try again.");
      setLoading(false);
      handleBackToRecord(); 
      return;
    }

    // For fallback images that are valid but not ideal
    const isFallbackImage = blob._isFallback === true;
    if (isFallbackImage) {
      console.warn("Using fallback image for analysis. Quality may be reduced.");
      // Show a warning but continue with analysis
      setError("Using a snapshot image for analysis. Results may be limited.");
    } else {
      // Clear any previous errors for successful recordings
      setError(null);
    }
    
    // Create an Object URL for playback
    const url = URL.createObjectURL(blob);
    setVideoUrl(url); // Set the URL state for the playback component
    
    // Always show playback even for fallback images - they're better than nothing
    setShowPlayback(true);
    setVideoBlob(blob); // Keep the blob for potential re-analysis or download
    
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    console.log(`Device detected as ${isMobile ? 'mobile' : 'desktop'}`);
    
    // Always send to server
    console.log("Sending video to server for analysis");
    const formData = new FormData();
    const timestamp = Date.now();
    
    // Determine the proper file extension based on blob type
    let fileExtension = 'webm';
    if (blob.type.includes('image')) {
      fileExtension = 'jpg';
    } else if (blob.type.includes('mp4')) {
      fileExtension = 'mp4';
    }
    
    formData.append("video", blob, `squat_${timestamp}.${fileExtension}`);
    // Extra debug: check if blob is truly a Blob
    if (!(blob instanceof Blob)) {
      console.error("[handleRecordingComplete] The value being uploaded is not a Blob!", blob);
    }
    
    // Add metadata to help backend processing
    if (isFallbackImage) {
      formData.append("is_fallback", "true");
    }
    
    // Debug: Log FormData keys before sending
    if (window && window.FormData && formData && formData.entries) {
      for (const [key, value] of formData.entries()) {
        if (value instanceof Blob) {
          console.log(`FormData key: ${key}, Blob size: ${value.size}, type: ${value.type}`);
        } else {
          console.log(`FormData key: ${key}, value: ${value}`);
        }
      }
    }
    // Do NOT set Content-Type header manually! Let the browser set it for FormData.
    // Log outgoing headers (except body, for security)
    if (typeof formData.getHeaders === 'function') {
      console.log('FormData headers:', formData.getHeaders());
    } else {
      console.log('Letting browser set Content-Type for FormData (should be multipart/form-data with boundary)');
    }
    console.log('[App.jsx] About to send fetch request to analyze endpoint: ', `${BACKEND_URL}/analyze`); // Log the URL
    console.log('[App.jsx] Sending fetch request now...'); // ADDED LOG
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error('[App.jsx] Request timeout reached - aborting fetch');
      controller.abort();
    }, 120000); // 2-minute timeout
    
    fetch(`${BACKEND_URL}/analyze`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
      // headers: DO NOT include Content-Type here!
    })
    .then(response => {
      console.log('[App.jsx] Entered .then block'); // ADDED LOG
      clearTimeout(timeoutId);
      console.log(`[App.jsx] Received response status: ${response.status}`);
      if (!response.ok) {
        // Log non-OK status and potentially response text for debugging
        return response.text().then(text => {
          console.error(`[App.jsx] Server responded with status: ${response.status}. Response text: ${text}`);
          throw new Error(`Server responded with status: ${response.status}`);
        });
      }
      // Clone the response to allow reading the text and then parsing as JSON
      return response.clone().text().then(text => {
        console.log(`[App.jsx] Raw response text:`, text); // Log raw text first
        try {
          const data = JSON.parse(text); // Manually parse after logging text
          console.log('[App.jsx] Successfully parsed JSON:', data);
          // Basic validation
          if (!data || typeof data !== 'object') {
              console.error('[App.jsx] Invalid data structure received:', data);
              throw new Error('Invalid data structure received from server.');
          }
          return data; // Return parsed data
        } catch (e) {
          console.error('[App.jsx] Error parsing JSON:', e);
          console.error('[App.jsx] Raw text that failed parsing:', text); // Log text again on error
          throw new Error('Failed to parse JSON response from server.');
        }
      });
    })
    .then(data => {
      if (!data) {
          console.error('[App.jsx] Parsed data is null or undefined before setting state.');
          // Handle case where data might be unexpectedly null/undefined after parsing step
          throw new Error('Received null or undefined data after processing response.');
      }
      console.log('[App.jsx] About to set analysis data state with:', data);
      setAnalysisData(data);
      setLoading(false); // Corrected typo: setLoading instead of setAnalysisLoading
    })
    .catch(error => {
      console.log('[App.jsx] Entered .catch block'); // ADDED LOG
      clearTimeout(timeoutId);
      setIsLoading(false);
      console.error("[App.jsx] Error in analysis fetch/processing:", error);
      
      // Log stack trace for better debugging
      if (error.stack) {
        console.error("[App.jsx] Error stack trace:", error.stack);
      }
      
      // Check for specific error types
      if (error.name === 'AbortError') {
        console.error('[App.jsx] Request was aborted (timeout or user action)');
      } else if (error instanceof TypeError) {
        console.error('[App.jsx] TypeError may indicate network connectivity issue');
      } else if (error instanceof SyntaxError) {
        console.error('[App.jsx] SyntaxError may indicate invalid JSON response');
      }
      
      const errorMessage = error.message || "Unknown error occurred";
      console.error(`[App.jsx] Error message: ${errorMessage}`);
      
      // Enhanced error message that's more user-friendly
      let userErrorMessage = errorMessage;
      
      if (errorMessage.includes("CORS")) {
        userErrorMessage = "Connection to analysis server failed. This may be due to network security settings.";
      } else if (errorMessage.includes("Failed to fetch") || errorMessage.includes("Network error")) {
        userErrorMessage = "Unable to connect to the analysis server. Please check your internet connection and try again.";
      } else if (errorMessage.includes("Invalid response format") || errorMessage.includes("parse") || err instanceof SyntaxError) {
        userErrorMessage = "The server returned an invalid response. This may be due to the recording quality. Please try again with a clearer recording.";
      } else if (err.name === 'AbortError') {
        userErrorMessage = "The analysis request timed out. The video may be too large or the server is under heavy load.";
      } else if (err instanceof TypeError) {
        userErrorMessage = "A network error occurred. Please check your connection and that the server is running.";
      }
      
      console.error(`[App.jsx] Final user-friendly error message: ${userErrorMessage}`);
      setError(userErrorMessage);
      setAnalysisData(null);
      setLoading(false);
    });
  };

  // Add useEffect to track analysisData state changes
  useEffect(() => {
    console.log("[App.jsx] analysisData state changed:", analysisData);
  }, [analysisData]);

  // Handle going back to the recording screen
  const handleBackToRecord = () => {
    // Clean up the Object URL when leaving playback
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    
    // Reset state
    setVideoUrl(null);
    setVideoBlob(null);
    setAnalysisData(null);
    setShowPlayback(false);
    setError(null);
    setLoading(false);
  };

  return (
    <div className="app">
      <Container>
        <LogosContainer>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '45%' }}>
            <Logo 
              src={mbamsLogo} 
              alt="MBA MS Logo" 
              onError={handleLogoError}
              style={{ marginTop: '25px' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '45%', paddingBottom: '5px' }}>
            <Logo 
              src={smartSquatLogo} 
              alt="SmartSquat Logo" 
              onError={handleLogoError}
              style={{ marginBottom: '-32px', maxWidth: '210px', marginTop: '4px' }}
            />
            <Title style={{ position: 'relative', zIndex: '-1' }}>SmartSquat</Title>
          </div>
        </LogosContainer>
        
        {!showPlayback ? (
          <>
            <ServerStatusContainer>
              <ServerStatusMessage $status={serverStatus}>
                {getServerStatusMessage()}
              </ServerStatusMessage>
            </ServerStatusContainer>
            <VideoCapture 
              onRecordingComplete={handleRecordingComplete}
            />
          </>
        ) : (
              <ExercisePlayback 
            videoUrl={videoUrl}
            videoBlob={videoBlob}
            analysisData={analysisData}
            isLoading={loading}
            error={error}
            onBack={() => setShowPlayback(false)}
          />
        )}
      </Container>
    </div>
  );
};

export default App;
