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

// Styled components with improved dark mode support
const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
`;

const Title = styled.h1`
  text-align: center;
  color: var(--text-primary);
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

// Try multiple file formats to increase chances of successful loading
const LOGO_FORMATS = {
  business: [
    `${window.location.origin}/images/columbia-business.png`, 
    `${window.location.origin}/images/columbia-business.svg`
  ],
  engineering: [
    `${window.location.origin}/images/columbia_engineering.svg`,
    `${window.location.origin}/images/columbia_engineering.png`
  ]
};

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
  const [businessLogo, setBusinessLogo] = useState(LOGO_FORMATS.business[0]);
  const [engineeringLogo, setEngineeringLogo] = useState(LOGO_FORMATS.engineering[0]);
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
  }, [isDarkMode]);

  // Check if images are available and find best format
  useEffect(() => {
    const checkImages = async () => {
      let businessFound = false;
      let engineeringFound = false;
      
      // Try each business logo format
      for (const format of LOGO_FORMATS.business) {
        try {
          const response = await fetch(format, { method: 'HEAD' });
          if (response.ok) {
            setBusinessLogo(format);
            businessFound = true;
            break;
          }
        } catch (e) {
          console.warn(`Failed to load ${format}:`, e);
        }
      }
      
      // Try each engineering logo format
      for (const format of LOGO_FORMATS.engineering) {
        try {
          const response = await fetch(format, { method: 'HEAD' });
          if (response.ok) {
            setEngineeringLogo(format);
            engineeringFound = true;
            break;
          }
        } catch (e) {
          console.warn(`Failed to load ${format}:`, e);
        }
      }
      
      // If either logo fails to load, use text fallback
      if (!businessFound || !engineeringFound) {
        console.warn("Some logo images could not be found. Using text fallback.");
        setLogoError(true);
      }
    };
    
    checkImages();
  }, []);

  // Logo error handler
  const handleLogoError = () => {
    setLogoError(true);
  };

  // Start the server warmup service when the app loads
  useEffect(() => {
    const warmupServer = async () => {
      try {
        const isReady = await ServerWarmup.warmupServer(BACKEND_URL);
        setServerReady(isReady);
      } catch (err) {
        console.error("Server warmup failed:", err);
        setServerReady(false);
      }
    };
    
    warmupServer();
  }, []);

  // Handle when a recording is completed
  const handleRecordingComplete = async (blob) => {
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
    setUsingLocalAnalysis(false);
    
    try {
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
      
      if (response.data && response.data.landmarks) {
        setAnalysisData(response.data);
      } else {
        throw new Error("Invalid response from server");
      }
      
    } catch (apiError) {
      console.error("API Error:", apiError);
      
      // Handle timeout errors specifically
      if (apiError.code === 'ECONNABORTED') {
        setError("Analysis took too long and timed out after 45 seconds.");
        
        // Try local analysis as a fallback
        try {
          console.log("Falling back to local analysis...");
          setUsingLocalAnalysis(true);
          
          // Process the video locally
          const localResults = await LocalAnalysis.analyzeVideo(blob);
          
          if (localResults && localResults.landmarks) {
            setAnalysisData(localResults);
            setError("Used local analysis mode due to server timeout. Results may be less accurate.");
          } else {
            throw new Error("Local analysis failed");
          }
        } catch (localError) {
          console.error("Local analysis failed:", localError);
          setError("Both remote and local analysis failed. Please try recording a shorter video or try again later.");
        }
      } else if (apiError.response) {
        // Server returned an error
        setError(`Analysis error: ${apiError.response.data.message || apiError.response.status}`);
      } else {
        // Network or other error
        setError(`Analysis error: ${apiError.message || "Unknown error"}`);
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
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <div className="container mx-auto px-4 py-8">
        <Container>
          <Title>Columbia Squat Analyzer</Title>
          <LogosContainer>
            {logoError ? (
              <>
                <TextLogo>Columbia Business School</TextLogo>
                <TextLogo>Columbia Engineering</TextLogo>
              </>
            ) : (
              <>
                <Logo 
                  src={businessLogo}
                  alt="Columbia Business School" 
                  onError={handleLogoError}
                />
                <Logo 
                  src={engineeringLogo}
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
        
        {!serverReady && !showPlayback && (
          <div className="text-center mt-4 p-3 bg-opacity-90 rounded-md" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
            <p className="text-sm">
              Server is starting up... This can take 30-60 seconds if the server was inactive.
              You can still record videos while waiting.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
