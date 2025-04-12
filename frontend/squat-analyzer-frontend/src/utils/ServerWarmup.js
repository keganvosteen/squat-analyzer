/**
 * Utility to keep the backend server warm by pinging it periodically.
 * This helps prevent the Render free tier from spinning down and reduces cold-start times.
 */

import axios from 'axios';

// Get the backend URL from environment or use default
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://squat-analyzer-backend.onrender.com';

// Create an axios instance with shorter timeout for pings
const pingApi = axios.create({
  baseURL: BACKEND_URL,
  timeout: 5000, // 5 seconds is enough for a ping
});

let pingInterval = null;
let isInitialized = false;
let serverStatus = 'unknown'; // 'unknown', 'starting', 'ready', 'error'
let statusListeners = [];

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
 * Ping the server to keep it warm
 * @returns {Promise<boolean>} True if ping was successful
 */
const pingServer = async () => {
  try {
    console.log('Pinging server to keep it warm...');
    const response = await pingApi.get('/ping');
    console.log('Server is alive:', response.data);
    updateServerStatus('ready');
    return true;
  } catch (error) {
    console.warn('Server ping failed:', error.message);
    
    // If the error is a timeout or network error, the server is probably starting up
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout') || error.message.includes('Network Error')) {
      updateServerStatus('starting');
    } else {
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
  pingInterval = setInterval(pingServer, intervalMs);
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

export default {
  pingServer,
  startWarmupService,
  stopWarmupService,
  warmupServer,
  onServerStatusChange,
  getServerStatus
}; 