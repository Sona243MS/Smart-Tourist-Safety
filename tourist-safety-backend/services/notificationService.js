const axios = require('axios');

// Enhanced Notification Service for Emergency Response
class NotificationService {
  constructor() {
    this.emergencyContacts = new Map(); // regionId -> contacts
    this.policeStations = new Map(); // regionId -> police stations with coordinates
    this.initializeEmergencyContacts();
  }

  initializeEmergencyContacts() {
    // Police stations by region with coordinates
    this.policeStations.set('guwahati', [
      { name: 'Guwahati Police Station', phone: '+91-361-254-0123', lat: 26.1841, lng: 91.7462 },
      { name: 'Paltan Bazaar Police', phone: '+91-361-254-0124', lat: 26.1861, lng: 91.7482 },
      { name: 'Dispur Police Station', phone: '+91-361-254-0125', lat: 26.1406, lng: 91.7906 }
    ]);

    this.policeStations.set('shillong', [
      { name: 'Shillong Police Station', phone: '+91-364-222-2000', lat: 25.5740, lng: 91.8832 },
      { name: 'Bara Bazaar Police', phone: '+91-364-222-2001', lat: 25.5760, lng: 91.8852 }
    ]);

    this.policeStations.set('assam', [
      { name: 'Kaziranga Police', phone: '+91-3776-262-001', lat: 26.5892, lng: 93.3851 },
      { name: 'Jorhat Police Station', phone: '+91-376-232-0001', lat: 26.7509, lng: 94.2037 }
    ]);

    this.policeStations.set('default', [
      { name: 'Emergency Police', phone: '100', lat: 26.1841, lng: 91.7462 }
    ]);

    // Emergency contacts by region
    this.emergencyContacts.set('guwahati', [
      { name: 'Police', phone: '100', priority: 1 },
      { name: 'Ambulance', phone: '108', priority: 2 },
      { name: 'Women Helpline', phone: '181', priority: 3 },
      { name: 'Disaster Management', phone: '1070', priority: 4 }
    ]);

    this.emergencyContacts.set('shillong', [
      { name: 'Police', phone: '100', priority: 1 },
      { name: 'Ambulance', phone: '108', priority: 2 },
      { name: 'Disaster Management', phone: '1070', priority: 3 }
    ]);

    this.emergencyContacts.set('assam', [
      { name: 'Police', phone: '100', priority: 1 },
      { name: 'Ambulance', phone: '108', priority: 2 },
      { name: 'Wildlife Emergency', phone: '+91-3776-262-001', priority: 3 }
    ]);

    this.emergencyContacts.set('default', [
      { name: 'Police', phone: '100', priority: 1 },
      { name: 'Ambulance', phone: '108', priority: 2 }
    ]);
  }

  // Find nearest police station to coordinates
  findNearestPoliceStation(latitude, longitude, regionId = 'default') {
    const stations = this.policeStations.get(regionId) || this.policeStations.get('default');
    let nearest = null;
    let minDistance = Infinity;

    for (const station of stations) {
      const distance = this.calculateDistance(latitude, longitude, station.lat, station.lng);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = { ...station, distance };
      }
    }

    return nearest;
  }

  // Calculate distance between two points (Haversine formula)
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  toRadians(degrees) {
    return degrees * (Math.PI/180);
  }

  // Send panic alert notifications
  async sendPanicAlert({
    touristId,
    deviceId,
    latitude,
    longitude,
    regionId = 'default',
    severity = 'high',
    additionalInfo = {}
  }) {
    const alertId = require('crypto').randomUUID();
    const timestamp = new Date().toISOString();

    // Find nearest police station
    const nearestPolice = this.findNearestPoliceStation(latitude, longitude, regionId);
    
    // Get emergency contacts for region
    const emergencyContacts = this.emergencyContacts.get(regionId) || this.emergencyContacts.get('default');

    // Create alert data
    const alertData = {
      alertId,
      timestamp,
      touristId,
      deviceId,
      location: { latitude, longitude },
      regionId,
      severity,
      nearestPolice,
      emergencyContacts,
      googleMapsUrl: `https://www.google.com/maps?q=${latitude},${longitude}`,
      additionalInfo
    };

    // Send notifications (in real implementation, these would be actual SMS/email/push)
    const notifications = [];

    try {
      // 1. Notify nearest police station
      if (nearestPolice) {
        const policeNotification = await this.notifyPoliceStation(alertData, nearestPolice);
        notifications.push(policeNotification);
      }

      // 2. Notify emergency contacts
      const contactNotifications = await this.notifyEmergencyContacts(alertData, emergencyContacts);
      notifications.push(...contactNotifications);

      // 3. Send to dashboard/command center
      const dashboardNotification = await this.notifyDashboard(alertData);
      notifications.push(dashboardNotification);

      // 4. Send SMS to tourist's emergency contacts (if available)
      if (additionalInfo.emergencyContacts) {
        const smsNotifications = await this.sendSMSToContacts(alertData, additionalInfo.emergencyContacts);
        notifications.push(...smsNotifications);
      }

    } catch (error) {
      console.error('Notification sending failed:', error);
    }

    return {
      success: true,
      alertId,
      notifications,
      nearestPolice,
      emergencyContacts,
      googleMapsUrl: alertData.googleMapsUrl
    };
  }

  // Notify police station (mock implementation)
  async notifyPoliceStation(alertData, policeStation) {
    // In real implementation, this would integrate with police dispatch systems
    console.log(`🚨 PANIC ALERT to ${policeStation.name}:`, {
      alertId: alertData.alertId,
      location: alertData.location,
      touristId: alertData.touristId,
      distance: policeStation.distance?.toFixed(2) + ' km',
      googleMaps: alertData.googleMapsUrl
    });

    return {
      type: 'police',
      station: policeStation.name,
      phone: policeStation.phone,
      status: 'notified',
      timestamp: new Date().toISOString()
    };
  }

  // Notify emergency contacts (mock implementation)
  async notifyEmergencyContacts(alertData, contacts) {
    const notifications = [];
    
    for (const contact of contacts.slice(0, 3)) { // Limit to top 3 contacts
      console.log(`📞 Emergency call to ${contact.name} (${contact.phone}):`, {
        alertId: alertData.alertId,
        location: alertData.location,
        touristId: alertData.touristId
      });

      notifications.push({
        type: 'emergency_contact',
        contact: contact.name,
        phone: contact.phone,
        priority: contact.priority,
        status: 'notified',
        timestamp: new Date().toISOString()
      });
    }

    return notifications;
  }

  // Notify dashboard/command center
  async notifyDashboard(alertData) {
    // This would typically send to a command center dashboard
    console.log(`📊 Dashboard alert:`, alertData);

    return {
      type: 'dashboard',
      status: 'notified',
      timestamp: new Date().toISOString()
    };
  }

  // Send SMS to tourist's emergency contacts
  async sendSMSToContacts(alertData, contacts) {
    const notifications = [];
    
    for (const contact of contacts) {
      const message = `🚨 EMERGENCY ALERT: Tourist ${alertData.touristId} needs help at ${alertData.googleMapsUrl}. Location: ${alertData.location.latitude}, ${alertData.location.longitude}`;
      
      console.log(`📱 SMS to ${contact}: ${message}`);

      notifications.push({
        type: 'sms',
        contact,
        message,
        status: 'sent',
        timestamp: new Date().toISOString()
      });
    }

    return notifications;
  }

  // Send geofence alert notifications
  async sendGeofenceAlert({
    touristId,
    deviceId,
    latitude,
    longitude,
    geofenceId,
    action, // 'enter' or 'exit'
    riskLevel,
    regionId = 'default'
  }) {
    const alertId = require('crypto').randomUUID();
    const timestamp = new Date().toISOString();

    const alertData = {
      alertId,
      timestamp,
      touristId,
      deviceId,
      location: { latitude, longitude },
      geofenceId,
      action,
      riskLevel,
      regionId,
      googleMapsUrl: `https://www.google.com/maps?q=${latitude},${longitude}`
    };

    const notifications = [];

    try {
      // Only notify for high-risk entries
      if (action === 'enter' && (riskLevel === 'red' || riskLevel === 'yellow')) {
        const nearestPolice = this.findNearestPoliceStation(latitude, longitude, regionId);
        
        if (nearestPolice) {
          const policeNotification = await this.notifyPoliceStation({
            ...alertData,
            severity: riskLevel === 'red' ? 'high' : 'medium',
            additionalInfo: { type: 'geofence_alert', geofenceId, action }
          }, nearestPolice);
          notifications.push(policeNotification);
        }

        // Notify emergency contacts
        const emergencyContacts = this.emergencyContacts.get(regionId) || this.emergencyContacts.get('default');
        const contactNotifications = await this.notifyEmergencyContacts(alertData, emergencyContacts);
        notifications.push(...contactNotifications);
      }

    } catch (error) {
      console.error('Geofence notification sending failed:', error);
    }

    return {
      success: true,
      alertId,
      notifications,
      googleMapsUrl: alertData.googleMapsUrl
    };
  }

  // Get emergency contacts for a region
  getEmergencyContacts(regionId = 'default') {
    return this.emergencyContacts.get(regionId) || this.emergencyContacts.get('default');
  }

  // Get police stations for a region
  getPoliceStations(regionId = 'default') {
    return this.policeStations.get(regionId) || this.policeStations.get('default');
  }
}

module.exports = new NotificationService();
