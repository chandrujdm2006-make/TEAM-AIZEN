/**
 * Emergency events management routes
 * College Mini Project - Dept. of IT
 */

const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * GET /api/emergency-events
 * List all logged emergency incidents
 */
router.get('/', (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const events = db.getAllEmergencyEvents(limit);
    res.json({ success: true, events });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/emergency-events/:id/resolve
 * Mark an emergency event as handled / resolved by operator
 */
router.post('/:id/resolve', (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    const { notes = 'Resolved by operator from dashboard' } = req.body;
    db.resolveEmergencyEvent(eventId, notes);
    res.json({ success: true, message: `Event #${eventId} marked as resolved` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
