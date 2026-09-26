/**
 * WebSocket Client & Web Audio Sound FX Manager
 * Turn-by-Turn Rider Assistant - Dept. of IT
 */

class SocketClient {
  constructor() {
    this.socket = null;
    this.audioEnabled = true;
    this.audioCtx = null;
    this.connected = false;

    this.initAudio();
    this.initSocket();
  }

  initAudio() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    } catch (e) {
      console.warn('Web Audio not supported in this browser');
    }
  }

  ensureAudioContext() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  playTurnChime() {
    if (!this.audioEnabled || !this.audioCtx) return;
    this.ensureAudioContext();

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, this.audioCtx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, this.audioCtx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.2, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.3);
  }

  playObstacleBeep() {
    if (!this.audioEnabled || !this.audioCtx) return;
    this.ensureAudioContext();

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1000, this.audioCtx.currentTime);

    gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.4);
  }

  playSosSiren() {
    if (!this.audioEnabled || !this.audioCtx) return;
    this.ensureAudioContext();

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(440, this.audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(880, this.audioCtx.currentTime + 0.3);
    osc.frequency.linearRampToValueAtTime(440, this.audioCtx.currentTime + 0.6);

    gain.gain.setValueAtTime(0.25, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.8);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.8);
  }

  initSocket() {
    if (typeof io === 'undefined') {
      console.warn('Socket.IO script not loaded');
      return;
    }

    this.socket = io();

    this.socket.on('connect', () => {
      console.log('[Socket] Connected to server, ID:', this.socket.id);
      this.connected = true;
      this.updateConnectionBadge(true);
    });

    this.socket.on('disconnect', () => {
      console.warn('[Socket] Disconnected from server');
      this.connected = false;
      this.updateConnectionBadge(false);
    });

    // 1. Live GPS Location Update
    this.socket.on('location_update', (data) => {
      if (window.navMap) {
        window.navMap.updateRiderPosition(data.lat, data.lng, data.headingDeg);
      }

      window.currentSpeed = data.speedKmh;
      document.getElementById('metric-speed').innerText = Math.round(data.speedKmh);
      document.getElementById('metric-heading').innerText = `${Math.round(data.headingDeg)}°`;

      if (data.instruction) {
        window.currentInstruction = data.instruction;
        if (window.oledDisplay) {
          window.oledDisplay.renderInstruction(data.instruction, data.speedKmh);
        }
        this.updateDashboardMetrics(data.instruction);
      }
    });

    // 2. Turn Instruction Update
    this.socket.on('instruction_update', (data) => {
      if (data.instruction) {
        window.currentInstruction = data.instruction;
        if (window.oledDisplay) {
          window.oledDisplay.renderInstruction(data.instruction, window.currentSpeed || 0);
        }
        this.updateDashboardMetrics(data.instruction);
        this.playTurnChime();
      }
    });

    // 3. Obstacle Alert from HC-SR04
    this.socket.on('obstacle_alert', (data) => {
      if (window.oledDisplay) {
        window.oledDisplay.triggerObstacleWarning(data.distanceCm || 45);
      }
      this.playObstacleBeep();
      this.showToast(`⚠️ OBSTACLE WARNING: Proximity sensor detected obstacle at ${Math.round(data.distanceCm || 45)}cm!`, 'warning');
    });

    // 4. Emergency Alert
    this.socket.on('emergency_alert', (data) => {
      if (window.oledDisplay) {
        window.oledDisplay.triggerSosScreen(data);
      }
      this.playSosSiren();
      this.showEmergencyBanner(data);
      if (window.app) {
        window.app.loadEmergencyLogs();
      }
    });

    // 5. Trip Lifecycle Events
    this.socket.on('trip_started', (data) => {
      console.log('[Socket] New trip started:', data.trip.id);
      if (window.navMap && data.points) {
        window.navMap.drawRoute(data.points);
      }
      this.showToast(`🏁 Trip started: ${data.trip.origin} → ${data.trip.destination}`, 'success');
      if (window.app) {
        window.app.loadTripHistory();
        window.app.setActiveTripUI(data.trip, data.points);
      }
    });

    this.socket.on('trip_completed', (data) => {
      this.showToast(`🎉 Trip Destination Reached!`, 'success');
      if (window.app) {
        window.app.loadTripHistory();
      }
    });
  }

  updateConnectionBadge(isOnline) {
    const dot = document.getElementById('socket-status-dot');
    const text = document.getElementById('socket-status-text');
    if (dot && text) {
      if (isOnline) {
        dot.className = 'status-dot';
        text.innerText = 'LIVE SYNC';
      } else {
        dot.className = 'status-dot offline';
        text.innerText = 'OFFLINE';
      }
    }
    this.checkEsp32DeviceStatus();
  }

  async checkEsp32DeviceStatus() {
    const badgeText = document.getElementById('esp32-badge-text');
    const batteryText = document.getElementById('esp32-battery-text');
    if (!badgeText) return;

    try {
      const res = await fetch('/api/devices/esp32-c3-01/status');
      const data = await res.json();
      if (data.success && data.device) {
        const lastSeen = new Date(data.device.last_seen_at).getTime();
        const now = Date.now();
        const isEspOnline = (now - lastSeen) < 45000; // 45s heartbeat window

        if (isEspOnline) {
          badgeText.innerText = '⚡ ESP32-C3';
          badgeText.style.color = 'var(--accent-cyan)';
          if (batteryText) batteryText.innerText = `${data.device.battery_level || 98}%`;
        } else {
          badgeText.innerText = '⚠️ ESP32 OFFLINE';
          badgeText.style.color = 'var(--text-muted)';
          if (batteryText) batteryText.innerText = '--%';
        }
      }
    } catch (e) {
      badgeText.innerText = '⚠️ ESP32 OFFLINE';
      badgeText.style.color = 'var(--text-muted)';
    }
  }

  updateDashboardMetrics(instruction) {
    const turnValEl = document.getElementById('metric-turn-dist');
    const destValEl = document.getElementById('metric-dest-dist');
    const instructionEl = document.getElementById('hud-current-instruction');
    const progressFillEl = document.getElementById('trip-progress-fill');
    const progressPctEl = document.getElementById('trip-progress-pct');

    if (turnValEl) turnValEl.innerText = instruction.formatted_distance || `${instruction.distance_to_turn_m || 0} m`;
    if (destValEl && instruction.distance_to_destination_m !== undefined) {
      const d = instruction.distance_to_destination_m;
      destValEl.innerText = d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${d} m`;
    }
    if (instructionEl) instructionEl.innerText = instruction.instruction || 'Continue Ahead';
    if (progressFillEl) progressFillEl.style.width = `${instruction.progress_pct || 0}%`;
    if (progressPctEl) progressPctEl.innerText = `${instruction.progress_pct || 0}%`;
  }

  showToast(message, type = 'info') {
    console.log(`[Toast ${type}]`, message);
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: rgba(13, 19, 31, 0.95);
      border: 1px solid ${type === 'warning' ? '#f59e0b' : type === 'success' ? '#10b981' : '#00f0ff'};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 0.88rem;
      box-shadow: 0 10px 25px rgba(0,0,0,0.6);
      z-index: 9999;
      animation: slideInRight 0.3s ease-out;
      display: flex;
      align-items: center;
      gap: 10px;
    `;
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.4s';
      setTimeout(() => toast.remove(), 400);
    }, 4000);
  }

  showEmergencyBanner(data) {
    const banner = document.getElementById('emergency-alert-banner');
    const desc = document.getElementById('emergency-banner-desc');
    if (banner && desc) {
      desc.innerHTML = `<strong>Rider SOS Alert Triggered!</strong> Device: ${data.deviceId} | Coords: ${data.lat?.toFixed(5)}, ${data.lng?.toFixed(5)} | Notifications dispatched to emergency contact.`;
      banner.classList.add('active');
    }
  }
}

window.SocketClient = SocketClient;
