/**
 * In-Browser Virtual Ride Simulator
 * Allows full end-to-end evaluation without physical hardware
 * Dept. of IT - Mini Project II
 */

class RideSimulator {
  constructor() {
    this.isRunning = false;
    this.timer = null;
    this.currentPointIndex = 0;
    this.subStep = 0;
    this.subStepsTotal = 5; // Interpolation steps between waypoints for smooth motion
    this.speedKmh = 45;
    this.routePoints = [];
    this.deviceId = 'esp32-c3-01';

    this.initControls();
  }

  setRoute(points) {
    this.routePoints = points || [];
    this.currentPointIndex = 0;
    this.subStep = 0;
    this.stop();
  }

  initControls() {
    const playBtn = document.getElementById('btn-sim-play');
    const stepBtn = document.getElementById('btn-sim-step');
    const resetBtn = document.getElementById('btn-sim-reset');
    const obstacleBtn = document.getElementById('btn-sim-obstacle');
    const sosBtn = document.getElementById('btn-sim-sos');
    const speedSlider = document.getElementById('sim-speed-slider');
    const speedVal = document.getElementById('sim-speed-val');

    if (playBtn) {
      playBtn.addEventListener('click', () => {
        if (this.isRunning) {
          this.pause();
        } else {
          this.start();
        }
      });
    }

    if (stepBtn) {
      stepBtn.addEventListener('click', () => this.stepForward());
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.reset());
    }

    if (obstacleBtn) {
      obstacleBtn.addEventListener('click', () => this.triggerObstacle());
    }

    if (sosBtn) {
      sosBtn.addEventListener('click', () => this.triggerSos());
    }

    if (speedSlider) {
      speedSlider.addEventListener('input', (e) => {
        this.speedKmh = parseInt(e.target.value, 10);
        if (speedVal) speedVal.innerText = `${this.speedKmh} km/h`;
      });
    }
  }

  start() {
    if (!this.routePoints || this.routePoints.length === 0) {
      if (window.app) {
        window.app.startDefaultTrip();
      }
      return;
    }

    this.isRunning = true;
    const playBtn = document.getElementById('btn-sim-play');
    if (playBtn) {
      playBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <rect x="6" y="4" width="4" height="16"/>
          <rect x="14" y="4" width="4" height="16"/>
        </svg>
        Pause Ride
      `;
      playBtn.className = 'btn btn-warning';
    }

    console.log('[Simulator] Ride simulation started at speed:', this.speedKmh);
    this.runLoop();
  }

  pause() {
    this.isRunning = false;
    if (this.timer) clearTimeout(this.timer);

    const playBtn = document.getElementById('btn-sim-play');
    if (playBtn) {
      playBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        Resume Ride
      `;
      playBtn.className = 'btn btn-success';
    }
  }

  stop() {
    this.isRunning = false;
    if (this.timer) clearTimeout(this.timer);

    const playBtn = document.getElementById('btn-sim-play');
    if (playBtn) {
      playBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        Start Auto Ride
      `;
      playBtn.className = 'btn btn-primary';
    }
  }

  reset() {
    this.stop();
    this.currentPointIndex = 0;
    this.subStep = 0;
    if (this.routePoints.length > 0) {
      const p = this.routePoints[0];
      this.sendLocation(p.lat, p.lng, 0, 0);
    }
  }

  stepForward() {
    if (!this.routePoints || this.routePoints.length === 0) return;
    this.currentPointIndex = Math.min(this.routePoints.length - 1, this.currentPointIndex + 1);
    this.subStep = 0;
    const pt = this.routePoints[this.currentPointIndex];
    const prev = this.routePoints[Math.max(0, this.currentPointIndex - 1)];
    const heading = this.calculateHeading(prev.lat, prev.lng, pt.lat, pt.lng);
    this.sendLocation(pt.lat, pt.lng, this.speedKmh, heading);
  }

  runLoop() {
    if (!this.isRunning) return;

    if (this.currentPointIndex >= this.routePoints.length - 1) {
      console.log('[Simulator] Reached final destination!');
      this.stop();
      return;
    }

    const pA = this.routePoints[this.currentPointIndex];
    const pB = this.routePoints[this.currentPointIndex + 1];

    // Linear interpolation
    const t = this.subStep / this.subStepsTotal;
    const currentLat = pA.lat + (pB.lat - pA.lat) * t;
    const currentLng = pA.lng + (pB.lng - pA.lng) * t;
    const heading = this.calculateHeading(pA.lat, pA.lng, pB.lat, pB.lng);

    // Fluctuate speed slightly for realism (e.g. slowing down near turns)
    let speed = this.speedKmh;
    if (this.subStep === 0 || this.subStep === this.subStepsTotal - 1) {
      speed = Math.max(15, this.speedKmh * 0.65);
    }

    this.sendLocation(currentLat, currentLng, speed, heading);

    this.subStep++;
    if (this.subStep >= this.subStepsTotal) {
      this.subStep = 0;
      this.currentPointIndex++;
    }

    // Interval inversely proportional to speed
    const intervalMs = Math.max(400, Math.round(36000 / this.speedKmh));
    this.timer = setTimeout(() => this.runLoop(), intervalMs);
  }

  async sendLocation(lat, lng, speed, heading) {
    try {
      await fetch(`/api/devices/${this.deviceId}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat,
          lng,
          speed,
          heading,
          battery: 98
        })
      });
    } catch (err) {
      console.error('[Simulator] Error posting simulated GPS coordinates:', err);
    }
  }

  async triggerObstacle() {
    try {
      const distance = Math.floor(Math.random() * 40) + 25; // 25cm - 65cm
      console.log(`[Simulator] Triggering ultrasonic obstacle detection: ${distance}cm`);
      await fetch(`/api/devices/${this.deviceId}/obstacle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distance_cm: distance,
          alert: true
        })
      });
    } catch (err) {
      console.error('[Simulator] Error sending obstacle alert:', err);
    }
  }

  async triggerSos() {
    try {
      console.log('[Simulator] Triggering physical SOS button event');
      await fetch(`/api/devices/${this.deviceId}/emergency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: 'Triggered from Web Hardware Simulator review panel'
        })
      });
    } catch (err) {
      console.error('[Simulator] Error sending SOS trigger:', err);
    }
  }

  calculateHeading(lat1, lon1, lat2, lon2) {
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
    const x =
      Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
      Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
    const brng = (Math.atan2(y, x) * 180) / Math.PI;
    return (brng + 360) % 360;
  }
}

window.RideSimulator = RideSimulator;
