/**
 * Main Server Entry Point
 * Turn-by-Turn Navigation System (IoT Motorcycle Rider Assistant)
 * College Mini Project - Dept. of IT - Live HUD Server
 */

const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const config = require('./config');
const db = require('./db');
const socketModule = require('./socket');

const tripsRouter = require('./routes/trips');
const devicesRouter = require('./routes/devices');
const emergencyRouter = require('./routes/emergency');
const navigationRouter = require('./routes/navigation');
const aiRouter = require('./routes/ai');

// 1. Initialize SQLite Database & Tables
console.log('[Server] Initializing database...');
db.initDb();

// 2. Setup Express
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. Serve Frontend Static Assets
const frontendPath = path.resolve(__dirname, '../../frontend');
app.use(express.static(frontendPath));

// 4. API Endpoints
app.use('/api/trips', tripsRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/emergency-events', emergencyRouter);
app.use('/api/navigation', navigationRouter);
app.use('/api/ai', aiRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    system: 'Turn-by-Turn Rider Assistant IoT Backend',
    version: '2.0.0',
    mapEngine: 'Leaflet + OpenStreetMap + OSRM',
    timestamp: new Date().toISOString()
  });
});

// Config endpoint providing system configuration
app.get('/api/config', (req, res) => {
  res.json({
    mapProvider: 'leaflet_osm',
    country: 'India',
    defaultCenter: { lat: 20.5937, lng: 78.9629 },
    defaultZoom: 5,
    version: '2.0.0'
  });
});

// Fallback route to serve index.html for SPA routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// 5. Create HTTP & Socket.IO server
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Attach Socket.IO to broadcaster
socketModule.initSocket(io);

// 6. Start listening
server.listen(config.PORT, config.HOST, () => {
  console.log('\n===============================================================');
  console.log('   🏍️ TURN-BY-TURN NAVIGATION SYSTEM (IOT RIDER ASSISTANT)');
  console.log('   Dept. of IT - Mini Project II Prototype Server');
  console.log('===============================================================');
  console.log(`📡 Backend Server & API: http://localhost:${config.PORT}`);
  console.log(`🌐 Web Companion App:   http://localhost:${config.PORT}`);
  console.log(`💾 SQLite Database:     ${config.DB_PATH}`);
  console.log(`⚡ WebSocket:            Socket.IO active`);
  console.log(`📍 Hardware Target:     ESP32-C3 + NEO-6M GPS + SSD1306 OLED`);
  console.log('===============================================================\n');
});

module.exports = { app, server };
