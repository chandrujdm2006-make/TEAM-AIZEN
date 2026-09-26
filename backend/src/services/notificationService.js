/**
 * Notification Service for Emergency SOS Alerts
 * Logs and stubs SMS/Email alerts for the rider's emergency contacts
 */

function sendEmergencyAlert({ user, deviceId, tripId, lat, lng, timestamp = new Date().toISOString() }) {
  const mapLink = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
  const gmapsLink = `https://maps.google.com/?q=${lat},${lng}`;

  const smsBody = `[RIDER SOS ALERT] ${user.name} has triggered an emergency button on device ${deviceId} at ${timestamp}! Live location: ${gmapsLink}`;
  const emailSubject = `[URGENT SOS] Emergency Alert for ${user.name} - Location Pin Attached`;
  const emailHtml = `
    <h2>🚨 EMERGENCY ASSISTANCE REQUESTED 🚨</h2>
    <p><strong>Rider:</strong> ${user.name}</p>
    <p><strong>Device ID:</strong> ${deviceId}</p>
    <p><strong>Trip ID:</strong> ${tripId || 'N/A'}</p>
    <p><strong>Time:</strong> ${timestamp}</p>
    <p><strong>GPS Coordinates:</strong> ${lat.toFixed(6)}, ${lng.toFixed(6)}</p>
    <p><a href="${gmapsLink}" target="_blank" style="background:#dc2626;color:white;padding:10px 16px;text-decoration:none;border-radius:6px;font-weight:bold;">View Live Location on Map</a></p>
  `;

  console.log('\n================== [EMERGENCY NOTIFICATION DISPATCH] ==================');
  console.log(`[SMS STUB] To: ${user.emergency_contact_phone}`);
  console.log(`[SMS BODY] ${smsBody}`);
  console.log(`[EMAIL STUB] To: ${user.emergency_contact_email}`);
  console.log(`[EMAIL SUBJECT] ${emailSubject}`);
  console.log('=======================================================================\n');

  return {
    success: true,
    sms: {
      recipient: user.emergency_contact_phone,
      message: smsBody,
      sentAt: timestamp,
      status: 'DELIVERED (STUB)'
    },
    email: {
      recipient: user.emergency_contact_email,
      subject: emailSubject,
      sentAt: timestamp,
      status: 'SENT (STUB)'
    },
    mapLink,
    gmapsLink
  };
}

module.exports = {
  sendEmergencyAlert
};
