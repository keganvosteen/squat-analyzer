/**
 * Utility to keep the backend server warm by pinging it periodically.
 * This helps prevent the Render free tier from spinning down and reduces cold-start times.
 */

import axios from 'axios';

// Get the backend URL from environment or use default
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://squat-analyzer-backend.onrender.com';

// Determine if we're in development mode
const isDevelopment = import.meta.env.DEV;

// Create a URL that uses the local proxy in development
const getApiUrl = (endpoint) => {
  if (isDevelopment) {
    // In development, use the Vite proxy (relative URL)
    return endpoint; // e.g., '/ping' will be proxied by Vite
  } else {
    // In production, use the full URL
    return `${BACKEND_URL}${endpoint}`;
  }
};

// Flag to determine if we should use local analysis instead of server
let useLocalAnalysis = false;

// Create an axios instance with shorter timeout for pings
const pingApi = axios.create({
  baseURL: isDevelopment ? '' : BACKEND_URL, // In dev mode, use relative URLs for proxy
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
  const url = getApiUrl(endpoint);
  
  // For development mode with the proxy, we can use a simpler approach
  if (isDevelopment) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        return response.json();
      }
      
      throw new Error(`Server response: ${response.status} ${response.statusText}`);
    } catch (error) {
      console.warn(`Local proxy request failed: ${error.message}`);
      throw error;
    }
  }
  
  // For production without proxy, try multiple CORS methods
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
    
    // For Render.com servers, we need to make multiple ping attempts
    // as their free tier can take 30-60 seconds to spin up
    const isRenderServer = url.includes('render.com');
    
    if (isRenderServer) {
      console.log('Detected Render.com hosted backend, initiating aggressive warmup');
      
      // For Render, make an initial ping, then start the ping service
      // This helps prevent 502 errors on the first request
      const pingPromise = new Promise(async (resolve) => {
        // Try an initial ping
        try {
          const result = await pingServer();
          if (result) {
            console.log('Server is ready on first ping');
            resolve(true);
            return;
          }
        } catch (e) {
          console.log('Initial ping failed, starting ping interval');
        }
        
        // Start a more aggressive ping schedule for Render servers
        let pingAttempts = 0;
        const maxPingAttempts = 5;
        const pingIntervalId = setInterval(async () => {
          pingAttempts++;
          console.log(`Warmup ping attempt ${pingAttempts}/${maxPingAttempts}`);
          
          try {
            const result = await pingServer();
            if (result) {
              clearInterval(pingIntervalId);
              resolve(true);
              return;
            }
          } catch (error) {
            console.warn(`Warmup ping ${pingAttempts} failed:`, error);
          }
          
          if (pingAttempts >= maxPingAttempts) {
            clearInterval(pingIntervalId);
            console.warn('Server warmup failed after maximum attempts');
            resolve(false);
          }
        }, 3000); // Ping every 3 seconds
        
        // Set a timeout to resolve regardless after 20 seconds
        setTimeout(() => {
          clearInterval(pingIntervalId);
          console.log('Server warmup timeout reached, resolving anyway');
          resolve(false);
        }, 20000);
      });
      
      const isReady = await pingPromise;
      updateServerStatus(isReady ? 'ready' : 'error');
      
      // In either case, start the normal warmup service for continued pings
      startWarmupService();
      
      return isReady;
    }
    
    // For non-Render servers, use the normal approach
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
  warmupServer,
  pingServer,
  startWarmupService,
  stopWarmupService,
  onServerStatusChange,
  getServerStatus,
  isUsingLocalAnalysis,
  forceLocalAnalysis,
  updateServerStatus
}; 