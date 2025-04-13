/**
 * Utility to keep the backend server warm by pinging it periodically.
 * This helps prevent the Render free tier from spinning down and reduces cold-start times.
 */

import axios from 'axios';

// Get the backend URL from environment or use default
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://squat-analyzer-backend.onrender.com';

// Flag to determine if we should use local analysis instead of server
let useLocalAnalysis = false;

// Create an axios instance with shorter timeout for pings
const pingApi = axios.create({
  baseURL: BACKEND_URL,
  timeout: 5000, // 5 seconds is enough for a ping
});

let pingInterval = null;
let isInitialized = false;
let serverStatus = 'unknown'; // 'unknown', 'starting', 'ready', 'error', 'local'
let statusListeners = [];
let pingRetryCount = 0;
const MAX_RETRY_COUNT = 3;

/**
 * Update the server status and notify all listeners
 * @param {string} status The new status
 */
const updateServerStatus = (status) => {
  serverStatus = status;
  notifyStatusListeners();
};

/**
 * Notify all status listeners of the current status
 */
const notifyStatusListeners = () => {
  statusListeners.forEach(listener => listener(serverStatus));
};

/**
 * Register a listener for server status changes
 * @param {Function} listener A function that accepts a status string
 * @returns {Function} A function to unregister the listener
 */
const onServerStatusChange = (listener) => {
  statusListeners.push(listener);
  
  // Notify the new listener of the current status immediately
  listener(serverStatus);
  
  // Return a function to unregister this listener
  return () => {
    statusListeners = statusListeners.filter(l => l !== listener);
  };
};

/**
 * Get the current server status
 * @returns {string} The current server status
 */
const getServerStatus = () => serverStatus;

/**
 * Check if we're using local analysis mode
 * @returns {boolean} True if using local analysis
 */
const isUsingLocalAnalysis = () => useLocalAnalysis;

/**
 * Switch to local analysis mode
 */
const switchToLocalAnalysis = () => {
  console.log('Switching to local analysis mode');
  useLocalAnalysis = true;
  updateServerStatus('local');
};

/**
 * Create a CORS-friendly request to the server
 * Uses multiple methods to attempt to circumvent CORS issues
 */
const corsRequest = async (endpoint) => {
  const url = `${BACKEND_URL}${endpoint}`;
  
  // First try with standard fetch with CORS mode
  try {
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Access-Control-Request-Method': 'GET',
        'Origin': window.location.origin
      }
    });
    
    if (response.ok) {
      return response.json();
    }
    
    // If we got a response but it wasn't ok, throw an error
    throw new Error(`Server response: ${response.status} ${response.statusText}`);
  } catch (fetchError) {
    console.warn(`Direct CORS request failed: ${fetchError.message}`);
    
    // If CORS error, try using a CORS proxy
    try {
      // Use a CORS proxy (this is a public one, consider setting up your own for production)
      const corsProxyUrl = 'https://cors-anywhere.herokuapp.com/';
      const proxyResponse = await fetch(corsProxyUrl + url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Origin': window.location.origin
        }
      });
      
      if (proxyResponse.ok) {
        return proxyResponse.json();
      }
      
      throw new Error(`Proxy response: ${proxyResponse.status} ${proxyResponse.statusText}`);
    } catch (proxyError) {
      console.warn(`CORS proxy request failed: ${proxyError.message}`);
      
      // All methods failed, throw error
      throw new Error('All CORS request methods failed');
    }
  }
};

/**
 * Ping the server to keep it warm
 * @returns {Promise<boolean>} True if ping was successful
 */
const pingServer = async () => {
  if (useLocalAnalysis) {
    console.log('Using local analysis mode, skipping server ping');
    return false;
  }
  
  try {
    console.log('Pinging server to keep it warm...');
    
    // Use the CORS-friendly request method
    try {
      const data = await corsRequest('/ping');
      console.log('Server is alive:', data);
      updateServerStatus('ready');
      pingRetryCount = 0; // Reset retry count on success
      return true;
    } catch (corsError) {
      console.warn(`CORS request failed: ${corsError.message}`);
      
      // Increment retry count
      pingRetryCount++;
      
      // If we've exceeded the retry limit, switch to local mode
      if (pingRetryCount >= MAX_RETRY_COUNT) {
        console.warn(`Max ping retry count (${MAX_RETRY_COUNT}) reached, switching to local analysis`);
        switchToLocalAnalysis();
        return false;
      }
      
      // Otherwise, update status to error
      updateServerStatus('error');
      return false;
    }
  } catch (error) {
    console.warn('Server ping failed:', error.message);
    
    // Increment retry count
    pingRetryCount++;
    
    // If we've exceeded the retry limit, switch to local mode
    if (pingRetryCount >= MAX_RETRY_COUNT) {
      console.warn(`Max ping retry count (${MAX_RETRY_COUNT}) reached, switching to local analysis`);
      switchToLocalAnalysis();
      return false;
    }
    
    // If the error is a timeout or network error, the server is probably starting up
    if (error.code === 'ECONNABORTED' || 
        error.name === 'AbortError' || 
        error.message.includes('timeout') || 
        error.message.includes('Network Error')) {
      updateServerStatus('starting');
    } else {
      // For other errors, assume the server is unavailable
      updateServerStatus('error');
    }
    
    return false;
  }
};

/**
 * Warm up the server and check if it's ready
 * @param {string} url The backend URL to warm up
 * @returns {Promise<boolean>} True if server is ready
 */
const warmupServer = async (url = BACKEND_URL) => {
  if (useLocalAnalysis) {
    console.log('Using local analysis mode, skipping server warmup');
    return false;
  }
  
  try {
    console.log(`Warming up server at ${url}...`);
    updateServerStatus('starting');
    
    // Start the warmup service in the background
    startWarmupService();
    
    // Try to ping the server right away to check if it's ready
    const isReady = await pingServer();
    
    // Update status based on ping result
    updateServerStatus(isReady ? 'ready' : 'starting');
    
    return isReady;
  } catch (error) {
    console.error('Server warmup failed:', error);
    updateServerStatus('error');
    
    // Check if we should just use local analysis mode
    if (pingRetryCount >= MAX_RETRY_COUNT) {
      switchToLocalAnalysis();
    }
    
    return false;
  }
};

/**
 * Start pinging the server at regular intervals
 * @param {number} intervalMs Milliseconds between pings (default: 10 minutes)
 */
const startWarmupService = (intervalMs = 10 * 60 * 1000) => {
  if (isInitialized) {
    console.log('Server warmup service already running');
    return;
  }
  
  // If status is unknown, set it to starting
  if (serverStatus === 'unknown') {
    updateServerStatus('starting');
  }
  
  // Ping immediately on startup
  pingServer();
  
  // Then set up the interval
  pingInterval = setInterval(() => {
    // Skip ping if we're in local mode
    if (!useLocalAnalysis) {
      pingServer();
    }
  }, intervalMs);
  
  isInitialized = true;
  
  console.log(`Server warmup service started, pinging every ${intervalMs/1000} seconds`);
};

/**
 * Stop the server warmup service
 */
const stopWarmupService = () => {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
    isInitialized = false;
    console.log('Server warmup service stopped');
  }
};

/**
 * Force the use of local analysis mode
 */
const forceLocalAnalysis = () => {
  switchToLocalAnalysis();
  stopWarmupService(); // No need to ping server anymore
};

export default {
  pingServer,
  startWarmupService,
  stopWarmupService,
  warmupServer,
  onServerStatusChange,
  getServerStatus,
  isUsingLocalAnalysis,
  forceLocalAnalysis
}; 