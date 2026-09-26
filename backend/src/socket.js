/**
 * WebSocket handler using Socket.IO for real-time telemetry,
 * OLED display updates, and emergency event broadcasts.
 */

let ioInstance = null;

function initSocket(io) {
  ioInstance = io;

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    // Client can subscribe to a specific device's room
    socket.on('join_device', (deviceId) => {
      socket.join(`device_${deviceId}`);
      console.log(`[Socket.IO] Socket ${socket.id} joined device_${deviceId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });
}

function getIo() {
  return ioInstance;
}

/**
 * Broadcast location update to all clients or specific device room
 */
function broadcastLocationUpdate(data) {
  if (!ioInstance) return;
  ioInstance.emit('location_update', data);
  if (data.deviceId) {
    ioInstance.to(`device_${data.deviceId}`).emit('device_location', data);
  }
}

/**
 * Broadcast turn-by-turn instruction update (for OLED view and dashboard)
 */
function broadcastInstructionUpdate(data) {
  if (!ioInstance) return;
  ioInstance.emit('instruction_update', data);
}

/**
 * Broadcast obstacle warning from HC-SR04 sensor
 */
function broadcastObstacleAlert(data) {
  if (!ioInstance) return;
  ioInstance.emit('obstacle_alert', data);
}

/**
 * Broadcast Emergency SOS event
 */
function broadcastEmergencyAlert(data) {
  if (!ioInstance) return;
  ioInstance.emit('emergency_alert', data);
}

/**
 * Broadcast trip lifecycle event (trip_started, trip_completed)
 */
function broadcastTripEvent(eventName, data) {
  if (!ioInstance) return;
  ioInstance.emit(eventName, data);
}

module.exports = {
  initSocket,
  getIo,
  broadcastLocationUpdate,
  broadcastInstructionUpdate,
  broadcastObstacleAlert,
  broadcastEmergencyAlert,
  broadcastTripEvent
};
