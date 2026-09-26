/**
 * OLED Display Renderer (SSD1306 128x64 Simulation)
 * Turn-by-Turn Rider Assistant - Dept. of IT
 */

class OledDisplay {
  constructor(screenElementId = 'oled-screen') {
    this.screen = document.getElementById(screenElementId);
    this.currentMode = 'standby'; // 'standby', 'normal', 'obstacle', 'sos'
    this.obstacleTimeout = null;

    // SVG icon templates supporting both standard lowercase and uppercase states
    const straightSvg = `<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const leftSvg = `<svg viewBox="0 0 24 24"><path d="M19 19v-6a4 4 0 0 0-4-4H5M10 4L5 9l5 5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const rightSvg = `<svg viewBox="0 0 24 24"><path d="M5 19v-6a4 4 0 0 1 4-4h10M14 4l5 5-5 5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const slightLeftSvg = `<svg viewBox="0 0 24 24"><path d="M16 19l-4-7a3 3 0 0 0-2.6-1.5H6M10 6l-4 4 4 4" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const slightRightSvg = `<svg viewBox="0 0 24 24"><path d="M8 19l4-7a3 3 0 0 1 2.6-1.5H18M14 6l4 4-4 4" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const uTurnSvg = `<svg viewBox="0 0 24 24"><path d="M9 19V9a5 5 0 0 1 10 0v10M5 15l4 4 4-4" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const roundaboutSvg = `<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9M21 7l-4 5h5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const destinationSvg = `<svg viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    this.icons = {
      'straight': straightSvg,
      'depart': straightSvg,
      'STRAIGHT': straightSvg,
      'turn-left': leftSvg,
      'LEFT': leftSvg,
      'turn-right': rightSvg,
      'RIGHT': rightSvg,
      'turn-slight-left': slightLeftSvg,
      'SLIGHT_LEFT': slightLeftSvg,
      'turn-slight-right': slightRightSvg,
      'SLIGHT_RIGHT': slightRightSvg,
      'turn-sharp-left': leftSvg,
      'turn-sharp-right': rightSvg,
      'uturn': uTurnSvg,
      'U_TURN': uTurnSvg,
      'roundabout': roundaboutSvg,
      'ROUNDABOUT': roundaboutSvg,
      'arrive': destinationSvg,
      'DESTINATION': destinationSvg,
      'obstacle': `<svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      'sos': `<svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    };
  }

  /**
   * Render Standby Screen
   */
  renderStandby(deviceName = 'ESP32-C3', statusText = 'Awaiting Trip Route...') {
    this.currentMode = 'standby';
    this.screen.className = 'oled-screen mode-standby';
    this.screen.innerHTML = `
      <div class="oled-statusbar">
        <div class="oled-status-left">
          <span>📶 WIFI: OK</span>
          <span>🛰️ 3D FIX</span>
        </div>
        <div class="oled-status-right">
          <span>0 KM/H</span>
        </div>
      </div>
      <div class="oled-main-body">
        <div class="standby-title">HUD ASSISTANT</div>
        <div class="standby-sub">${deviceName} READY</div>
        <div style="font-size:0.6rem;opacity:0.6;margin-top:6px;">${statusText}</div>
      </div>
      <div class="oled-bottombar">
        <span>DEV ID: C3-01</span>
        <span>STANDBY</span>
      </div>
    `;
  }

  /**
   * Render Destination Reached Screen
   */
  renderDestinationReached() {
    this.currentMode = 'normal';
    this.screen.className = 'oled-screen';
    this.screen.innerHTML = `
      <div class="oled-statusbar">
        <div class="oled-status-left">
          <span>🏁 ARRIVED</span>
          <span>🛰️ GPS: OK</span>
        </div>
        <div class="oled-status-right">
          <span>0 KM/H</span>
        </div>
      </div>
      <div class="oled-main-body" style="flex-direction:column;justify-content:center;align-items:center;text-align:center;">
        <div style="font-size:1.05rem;font-weight:900;letter-spacing:0.06em;color:#e0f2fe;">DESTINATION</div>
        <div style="font-size:1.05rem;font-weight:900;letter-spacing:0.06em;color:#38bdf8;">REACHED!</div>
        <div style="font-size:0.62rem;margin-top:4px;opacity:0.8;">NAVIGATION COMPLETE</div>
      </div>
      <div class="oled-bottombar">
        <span>100% COMPLETE</span>
        <span>0 M</span>
      </div>
    `;
  }

  /**
   * Render Normal Turn-by-Turn Instruction
   */
  renderInstruction(instructionData, speedKmh = 0) {
    if (this.currentMode === 'obstacle' || this.currentMode === 'sos') {
      // Do not override active hazard or emergency screen
      return;
    }

    // Check if reached destination
    if (instructionData.state === 'DESTINATION' || instructionData.maneuver === 'arrive' || instructionData.status === 'arrived') {
      this.renderDestinationReached();
      return;
    }

    this.currentMode = 'normal';
    this.screen.className = 'oled-screen';

    const maneuverKey = instructionData.state || instructionData.maneuver || 'straight';
    const iconSvg = this.icons[maneuverKey] || this.icons[instructionData.maneuver] || this.icons['straight'];
    const distText = instructionData.formatted_distance || `${instructionData.distance_to_turn_m || instructionData.distanceM || 0} m`;
    const instructionText = instructionData.instruction || 'Continue Ahead';
    const progressPct = instructionData.progress_pct || 0;
    const speedDisplay = (speedKmh === null || speedKmh === undefined || isNaN(speedKmh) || speedKmh === '--') 
      ? '--' 
      : `${Math.round(speedKmh)}`;

    this.screen.innerHTML = `
      <div class="oled-statusbar">
        <div class="oled-status-left">
          <span>📶 ONLINE</span>
          <span>🛰️ GPS: 12</span>
        </div>
        <div class="oled-status-right">
          <span>${speedDisplay} KM/H</span>
        </div>
      </div>

      <div class="oled-main-body">
        <div class="oled-icon-box">
          ${iconSvg}
        </div>
        <div class="oled-text-box">
          <div class="oled-distance-val">${distText}</div>
          <div class="oled-instruction-text">${instructionText}</div>
        </div>
      </div>

      <div class="oled-bottombar">
        <span>STEP ${instructionData.current_step || 1}/${instructionData.total_steps || 1}</span>
        <div class="oled-progress-track">
          <div class="oled-progress-fill" style="width: ${progressPct}%"></div>
        </div>
        <span>${progressPct}%</span>
      </div>
    `;
  }

  /**
   * Render Ultrasonic Sensor Obstacle Detection (HC-SR04 Warning)
   */
  triggerObstacleWarning(distanceCm = 45, durationMs = 3500) {
    if (this.currentMode === 'sos') return; // SOS has higher priority

    this.currentMode = 'obstacle';
    this.screen.className = 'oled-screen mode-obstacle';

    this.screen.innerHTML = `
      <div class="oled-statusbar">
        <div class="oled-status-left">
          <span>⚠️ PROXIMITY HAZARD</span>
        </div>
        <div class="oled-status-right">
          <span>BRAKE!</span>
        </div>
      </div>

      <div class="oled-main-body" style="flex-direction:column;justify-content:center;align-items:center;">
        <div class="obstacle-title">⚠️ OBSTACLE AHEAD!</div>
        <div class="obstacle-dist">${Math.round(distanceCm)} CM</div>
        <div style="font-size:0.65rem;font-weight:bold;letter-spacing:0.05em;">HC-SR04 DETECTION TRIGGER</div>
      </div>

      <div class="oled-bottombar">
        <span>COLLISION AVOIDANCE</span>
        <span>ALERT ACTIVE</span>
      </div>
    `;

    // Clear previous timeout
    if (this.obstacleTimeout) clearTimeout(this.obstacleTimeout);

    // Auto-restore after duration
    this.obstacleTimeout = setTimeout(() => {
      this.currentMode = 'normal';
      this.screen.className = 'oled-screen';
      if (window.currentInstruction) {
        this.renderInstruction(window.currentInstruction, window.currentSpeed || 0);
      } else {
        this.renderStandby();
      }
    }, durationMs);
  }

  /**
   * Render Emergency SOS Screen
   */
  triggerSosScreen(details = {}) {
    this.currentMode = 'sos';
    this.screen.className = 'oled-screen mode-sos';

    const coords = details.lat ? `${details.lat.toFixed(4)}, ${details.lng.toFixed(4)}` : 'GPS SENT';

    this.screen.innerHTML = `
      <div class="oled-statusbar">
        <div class="oled-status-left">
          <span>🚨 SOS ACTIVE</span>
        </div>
        <div class="oled-status-right">
          <span>BROADCASTING</span>
        </div>
      </div>

      <div class="oled-main-body" style="flex-direction:column;justify-content:center;align-items:center;text-align:center;">
        <div style="font-size:1.15rem;font-weight:900;letter-spacing:0.08em;">EMERGENCY SOS</div>
        <div style="font-size:0.8rem;margin-top:2px;font-weight:bold;">${coords}</div>
        <div style="font-size:0.65rem;margin-top:4px;">SMS & EMAIL NOTIFIED</div>
      </div>

      <div class="oled-bottombar">
        <span>ASSISTANCE REQUESTED</span>
        <span>LIVE PIN</span>
      </div>
    `;
  }

  /**
   * Clear SOS Screen and return to normal
   */
  clearSos() {
    this.currentMode = 'normal';
    this.screen.className = 'oled-screen';
    if (window.currentInstruction) {
      this.renderInstruction(window.currentInstruction, window.currentSpeed || 0);
    } else {
      this.renderStandby();
    }
  }
}

// Export global instance
window.OledDisplay = OledDisplay;
