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

/**
 * Ping the server to keep it warm
 * @returns {Promise<boolean>} True if ping was successful
 */
const pingServer = async () => {
  try {
    console.log('Pinging server to keep it warm...');
    const response = await pingApi.get('/ping');
    console.log('Server is alive:', response.data);
    return true;
  } catch (error) {
    console.warn('Server ping failed:', error.message);
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
  stopWarmupService
}; 