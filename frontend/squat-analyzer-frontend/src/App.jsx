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
import cbsLogo from '/CBSLogo.png';
import seasLogo from '/SEASLogo.png';
import crownIcon from '/ColumbiaCrown.png';

// Define the backend URL with a fallback
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://squat-analyzer-backend.onrender.com';

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

  // Handle forcing local analysis mode
  const forceLocalMode = () => {
    ServerWarmup.forceLocalAnalysis();
    setUsingLocalAnalysis(true);
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
  const handleRecordingComplete = async (blob, metadata = {}) => {
    // Keep local analysis disabled for backend-only analysis
    const DISABLE_LOCAL_ANALYSIS = true;
    
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
    
    // Check if we should use local analysis based on server status or blob type
    const isImageBlob = blob.type?.startsWith('image/') || blob._recordingType === 'image';
    const isRenderServer = BACKEND_URL.includes('render.com');
    
    // Directly check server availability regardless of stored status
    const serverDirectlyAvailable = await checkServerDirectly();
    console.log(`Direct server check result: ${serverDirectlyAvailable ? "Available" : "Unavailable"}`);
    
    // Update server status based on direct check
    if (serverDirectlyAvailable && serverStatus !== 'ready') {
      console.log("Server is actually available despite status indicating otherwise, updating status");
      ServerWarmup.updateServerStatus('ready');
    } else if (!serverDirectlyAvailable && serverStatus === 'ready') {
      console.log("Server is not available despite status indicating otherwise, updating status");
      ServerWarmup.updateServerStatus('error');
    }
    
    // Determine if we should use local analysis
    // Use local analysis if:
    // 1. It's already set as the preference
    // 2. Server is not in "ready" state
    // 3. It's an image blob (not a video)
    // 4. URL has local=true parameter
    const shouldUseLocalAnalysis = !DISABLE_LOCAL_ANALYSIS && (
      ServerWarmup.isUsingLocalAnalysis() || 
      !serverDirectlyAvailable ||
      serverStatus !== 'ready' || 
      isImageBlob
    );
    
    setUsingLocalAnalysis(shouldUseLocalAnalysis);
    
    try {
      // If server is not ready or has errors, skip the API call and go straight to local analysis
      if (shouldUseLocalAnalysis) {
        console.log(`Using local analysis due to: ${isImageBlob ? 'image blob' : 
                                                   !serverDirectlyAvailable ? 'server not directly available' :
                                                   serverStatus !== 'ready' ? 'server not ready' : 
                                                   'local analysis preference'}`);
        throw new Error("Using local analysis mode");
      }
      
      // Send the video to the backend for analysis
      console.log("Sending video to backend for analysis...");
      
      // Create a clean FormData object
      const formData = new FormData();
      
      // Add a timestamp to prevent caching
      const timestamp = Date.now();
      
      // Append the blob with a filename that includes format
      const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
      formData.append('video', blob, `squat_recording_${timestamp}.${extension}`);
      
      // For Render servers, we may need a longer timeout
      const timeoutDuration = isRenderServer ? 60000 : 30000; // 1 minute for Render, 30 seconds otherwise
      
      // Use the correct URL (proxy in development or full URL in production)
      const analyzeEndpoint = isDevelopment ? '/analyze' : `${BACKEND_URL}/analyze`;
      
      // ADDED: Log more information about the request
      console.log(`Sending request to ${analyzeEndpoint} with timeout ${timeoutDuration}ms`);
      console.log(`Request headers: Content-Type undefined to let browser set boundary`);
      console.log(`Video blob info: size=${blob.size}, type=${blob.type}`);
      
      // ADDED: Create an axios instance with interceptors for debugging
      const debugAxios = axios.create({
        timeout: timeoutDuration,
        validateStatus: function (status) {
          return status < 500; // Only reject if status code is 5xx
        }
      });
      
      // Add request interceptor for debugging
      debugAxios.interceptors.request.use(
        config => {
          console.log('Sending request with config:', {
            url: config.url,
            method: config.method,
            headers: config.headers,
            timeout: config.timeout,
            data: 'FormData (binary data)'
          });
          return config;
        },
        error => {
          console.error('Request interceptor error:', error);
          return Promise.reject(error);
        }
      );
      
      // Add response interceptor for debugging
      debugAxios.interceptors.response.use(
        response => {
          console.log('Response received:', {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            data: response.data ? 'Data received (see full response separately)' : 'No data'
          });
          return response;
        },
        error => {
          console.error('Response interceptor error:', {
            message: error.message,
            code: error.code,
            response: error.response ? {
              status: error.response.status,
              statusText: error.response.statusText,
              headers: error.response.headers,
              data: error.response.data
            } : 'No response'
          });
          return Promise.reject(error);
        }
      );
      
      // Use a clean request configuration - don't inherit from api default headers
      const response = await debugAxios.post(analyzeEndpoint, formData, {
        headers: {
          // Let the browser set the Content-Type with boundary for FormData
          'Content-Type': undefined
          // Don't manually set restricted headers like Origin or Access-Control-Request-Method
          // The browser will set these automatically
        }
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
      
      // Detect specific Render.com 502 errors
      const isRender502 = apiError.response?.status === 502 && 
                         (apiError.response?.headers?.['x-render-origin-server'] === 'Render' ||
                          apiError.response?.headers?.['server'] === 'cloudflare' ||
                          apiError.response?.headers?.['x-render-routing']?.includes('502'));
      
      // Check if this is a CORS error
      const isCorsError = apiError.code === 'ERR_NETWORK' && 
                         (apiError.message?.includes('Network Error') || 
                          error?.toString().includes('CORS'));
      
      // Update server status if we got a network error or 502 bad gateway
      if (apiError.code === 'ECONNABORTED' || 
          isCorsError ||
          isRender502) {
        
        if (isRender502) {
          console.log("Detected Render.com 502 error - server likely still spinning up");
          // Update server status to starting
          ServerWarmup.updateServerStatus('starting');
        } else if (isCorsError) {
          console.log("CORS error detected - backend may not have correct CORS headers");
          ServerWarmup.forceLocalAnalysis();
        } else {
          console.log("Network error or timeout, switching to local analysis mode");
          ServerWarmup.forceLocalAnalysis();
        }
        
        // MODIFIED: Only set this if we're not disabling local analysis
        if (!DISABLE_LOCAL_ANALYSIS) {
          setUsingLocalAnalysis(true);
        }
      }
      
      // ADDED: More detailed error logging
      console.error(`API Error details:`, {
        status: apiError.response?.status,
        statusText: apiError.response?.statusText,
        message: apiError.message,
        code: apiError.code,
        headers: apiError.response?.headers,
        data: apiError.response?.data
      });
      
      // For user-facing error message
      let errorMessage = '';
      if (apiError.code === 'ECONNABORTED') {
        errorMessage = "Analysis took too long. Using local analysis instead.";
      } else if (apiError.message?.includes('Using local analysis')) {
        // This is expected when we choose to use local analysis
        errorMessage = '';
      } else if (isCorsError) {
        errorMessage = "CORS error: Backend unavailable. Using local analysis instead.";
      } else if (isRender502) {
        errorMessage = "Server is still starting up (502). Using local analysis for now.";
      } else if (apiError.response?.status === 502) {
        errorMessage = "Server unavailable (502). Using local analysis instead.";
      } else {
        errorMessage = `Server analysis failed: ${apiError.message}`;
      }
      
      // Only set the error if we'll need to show it
      if (errorMessage) {
        // MODIFIED: Update error message if local analysis is disabled
        if (DISABLE_LOCAL_ANALYSIS) {
          errorMessage = `Server analysis failed: ${apiError.message} (Local analysis disabled for debugging)`;
        }
        setError(errorMessage);
      }
      
      // Try local analysis as a fallback
      // MODIFIED: Skip local analysis if DISABLE_LOCAL_ANALYSIS is true
      if (!DISABLE_LOCAL_ANALYSIS) {
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
      } else {
        console.log("Local analysis disabled for debugging - stopping here");
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
        
        <ServerStatusContainer>
          <ServerStatusMessage $status={serverStatus}>
            {getServerStatusMessage()}
          </ServerStatusMessage>
          
          {(serverStatus === 'starting' || serverStatus === 'error') && (
            <ServerAction onClick={forceLocalMode}>
              Force Local Mode
            </ServerAction>
          )}
        </ServerStatusContainer>
        
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
