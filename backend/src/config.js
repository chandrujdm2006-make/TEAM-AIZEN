/**
 * Configuration module for Turn-by-Turn Rider Assistant Backend
 * College Mini Project - Dept. of IT
 */

const path = require('path');
const fs = require('fs');

// Load environment variables from .env
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Ensure data directory exists
const dataDir = path.resolve(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

module.exports = {
  PORT: process.env.PORT || 3000,
  HOST: process.env.HOST || '0.0.0.0',
  DB_PATH: process.env.DB_PATH || path.join(dataDir, 'navigation.db'),
  GOOGLE_MAPS_API_KEY: process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || null,
  
  // Default IoT device ID
  DEFAULT_DEVICE_ID: 'esp32-c3-01',
  DEFAULT_USER_ID: 1,

  // Navigation threshold constants
  WAYPOINT_REACHED_RADIUS_METERS: 35, // Distance threshold to consider waypoint achieved
  ARRIVAL_RADIUS_METERS: 25,         // Distance to target to trigger "You have arrived"
  
  // Simulation constants
  DEFAULT_SIMULATION_SPEED_KMH: 45
};
