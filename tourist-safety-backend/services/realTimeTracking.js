const EventEmitter = require('events');

// Real-time Tracking Service for Families and Law Enforcement
class RealTimeTrackingService extends EventEmitter {
  constructor() {
    super();
    this.trackingSessions = new Map(); // sessionId -> tracking data
    this.familyConnections = new Map(); // touristId -> family members
    this.lawEnforcementAccess = new Map(); // touristId -> authorized officers
    this.trackingHistory = new Map(); // touristId -> location history
    this.maxHistorySize = 1000; // Keep last 1000 points per tourist
  }

  // Create a tracking session for a tourist
  createTrackingSession({
    touristId,
    deviceId,
    sessionType, // 'family', 'law_enforcement', 'emergency'
    authorizedBy, // who authorized the tracking
    duration = 24, // hours
    permissions = {
      location: true,
      speed: true,
      geofence: true,
      panic: true
    }
  }) {
    const sessionId = require('crypto').randomUUID();
    const expiresAt = new Date(Date.now() + duration * 60 * 60 * 1000);

    const session = {
      sessionId,
      touristId,
      deviceId,
      sessionType,
      authorizedBy,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      permissions,
      isActive: true,
      lastLocation: null,
      locationCount: 0
    };

    this.trackingSessions.set(sessionId, session);

    // Add to family/LE access maps
    if (sessionType === 'family') {
      if (!this.familyConnections.has(touristId)) {
        this.familyConnections.set(touristId, new Set());
      }
      this.familyConnections.get(touristId).add(sessionId);
    } else if (sessionType === 'law_enforcement') {
      if (!this.lawEnforcementAccess.has(touristId)) {
        this.lawEnforcementAccess.set(touristId, new Set());
      }
      this.lawEnforcementAccess.get(touristId).add(sessionId);
    }

    this.emit('trackingStarted', session);
    return session;
  }

  // Update location for a tracking session
  updateLocation(sessionId, locationData) {
    const session = this.trackingSessions.get(sessionId);
    if (!session || !session.isActive) {
      return { success: false, error: 'Session not found or inactive' };
    }

    // Check if session has expired
    if (new Date() > new Date(session.expiresAt)) {
      session.isActive = false;
      return { success: false, error: 'Session expired' };
    }

    const location = {
      sessionId,
      touristId: session.touristId,
      deviceId: session.deviceId,
      latitude: locationData.latitude,
      longitude: locationData.longitude,
      accuracy: locationData.accuracy,
      speed: locationData.speed,
      heading: locationData.heading,
      timestamp: new Date().toISOString(),
      batteryLevel: locationData.batteryLevel,
      networkType: locationData.networkType
    };

    // Update session
    session.lastLocation = location;
    session.locationCount++;

    // Store in history
    if (!this.trackingHistory.has(session.touristId)) {
      this.trackingHistory.set(session.touristId, []);
    }
    const history = this.trackingHistory.get(session.touristId);
    history.push(location);
    
    // Keep history bounded
    if (history.length > this.maxHistorySize) {
      history.splice(0, history.length - this.maxHistorySize);
    }

    this.emit('locationUpdate', location);
    return { success: true, location };
  }

  // Get current location for a tracking session
  getCurrentLocation(sessionId) {
    const session = this.trackingSessions.get(sessionId);
    if (!session || !session.isActive) {
      return null;
    }
    return session.lastLocation;
  }

  // Get location history for a tracking session
  getLocationHistory(sessionId, limit = 100) {
    const session = this.trackingSessions.get(sessionId);
    if (!session || !session.isActive) {
      return [];
    }

    const history = this.trackingHistory.get(session.touristId) || [];
    return history.slice(-limit);
  }

  // Get all active tracking sessions for a tourist
  getActiveSessions(touristId) {
    const sessions = [];
    for (const [sessionId, session] of this.trackingSessions) {
      if (session.touristId === touristId && session.isActive) {
        sessions.push({
          sessionId,
          sessionType: session.sessionType,
          authorizedBy: session.authorizedBy,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          locationCount: session.locationCount,
          lastLocation: session.lastLocation
        });
      }
    }
    return sessions;
  }

  // Stop a tracking session
  stopTrackingSession(sessionId, reason = 'Manual stop') {
    const session = this.trackingSessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    session.isActive = false;
    session.stoppedAt = new Date().toISOString();
    session.stopReason = reason;

    // Remove from access maps
    if (session.sessionType === 'family') {
      const familySet = this.familyConnections.get(session.touristId);
      if (familySet) {
        familySet.delete(sessionId);
        if (familySet.size === 0) {
          this.familyConnections.delete(session.touristId);
        }
      }
    } else if (session.sessionType === 'law_enforcement') {
      const leSet = this.lawEnforcementAccess.get(session.touristId);
      if (leSet) {
        leSet.delete(sessionId);
        if (leSet.size === 0) {
          this.lawEnforcementAccess.delete(session.touristId);
        }
      }
    }

    this.emit('trackingStopped', session);
    return { success: true, session };
  }

  // Get tracking statistics for a tourist
  getTrackingStats(touristId) {
    const sessions = this.getActiveSessions(touristId);
    const history = this.trackingHistory.get(touristId) || [];
    
    const stats = {
      touristId,
      activeSessions: sessions.length,
      totalLocations: history.length,
      familyTracking: sessions.filter(s => s.sessionType === 'family').length,
      lawEnforcementTracking: sessions.filter(s => s.sessionType === 'law_enforcement').length,
      lastLocation: history[history.length - 1] || null,
      trackingDuration: 0
    };

    // Calculate total tracking duration
    if (sessions.length > 0) {
      const oldestSession = sessions.reduce((oldest, current) => 
        new Date(current.createdAt) < new Date(oldest.createdAt) ? current : oldest
      );
      stats.trackingDuration = Date.now() - new Date(oldestSession.createdAt).getTime();
    }

    return stats;
  }

  // Check if tourist is being tracked
  isBeingTracked(touristId) {
    return this.getActiveSessions(touristId).length > 0;
  }

  // Get all tourists currently being tracked
  getAllTrackedTourists() {
    const tracked = new Set();
    for (const [sessionId, session] of this.trackingSessions) {
      if (session.isActive) {
        tracked.add(session.touristId);
      }
    }
    return Array.from(tracked);
  }

  // Emergency tracking activation (by law enforcement)
  activateEmergencyTracking({
    touristId,
    deviceId,
    authorizedBy,
    reason,
    duration = 72 // 72 hours for emergency
  }) {
    return this.createTrackingSession({
      touristId,
      deviceId,
      sessionType: 'emergency',
      authorizedBy,
      duration,
      permissions: {
        location: true,
        speed: true,
        geofence: true,
        panic: true
      }
    });
  }

  // Generate tracking report for a session
  generateTrackingReport(sessionId, startTime, endTime) {
    const session = this.trackingSessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const history = this.getLocationHistory(sessionId);
    const filteredHistory = history.filter(loc => {
      const locTime = new Date(loc.timestamp);
      return locTime >= new Date(startTime) && locTime <= new Date(endTime);
    });

    // Calculate statistics
    const totalDistance = this.calculateTotalDistance(filteredHistory);
    const avgSpeed = this.calculateAverageSpeed(filteredHistory);
    const maxSpeed = this.calculateMaxSpeed(filteredHistory);
    const timeSpent = this.calculateTimeSpent(filteredHistory);

    return {
      success: true,
      sessionId,
      touristId: session.touristId,
      reportPeriod: { startTime, endTime },
      statistics: {
        totalDistance: totalDistance.toFixed(2) + ' km',
        averageSpeed: avgSpeed.toFixed(2) + ' km/h',
        maxSpeed: maxSpeed.toFixed(2) + ' km/h',
        timeSpent: timeSpent + ' minutes',
        locationCount: filteredHistory.length
      },
      locations: filteredHistory
    };
  }

  // Helper methods for calculations
  calculateTotalDistance(locations) {
    if (locations.length < 2) return 0;
    
    let total = 0;
    for (let i = 1; i < locations.length; i++) {
      total += this.calculateDistance(
        locations[i-1].latitude, locations[i-1].longitude,
        locations[i].latitude, locations[i].longitude
      );
    }
    return total;
  }

  calculateAverageSpeed(locations) {
    if (locations.length < 2) return 0;
    
    const speeds = locations.filter(loc => loc.speed && loc.speed > 0);
    if (speeds.length === 0) return 0;
    
    return speeds.reduce((sum, loc) => sum + loc.speed, 0) / speeds.length;
  }

  calculateMaxSpeed(locations) {
    const speeds = locations.filter(loc => loc.speed && loc.speed > 0);
    if (speeds.length === 0) return 0;
    
    return Math.max(...speeds.map(loc => loc.speed));
  }

  calculateTimeSpent(locations) {
    if (locations.length < 2) return 0;
    
    const start = new Date(locations[0].timestamp);
    const end = new Date(locations[locations.length - 1].timestamp);
    return Math.round((end - start) / (1000 * 60)); // minutes
  }

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

  // Cleanup expired sessions
  cleanupExpiredSessions() {
    const now = new Date();
    for (const [sessionId, session] of this.trackingSessions) {
      if (session.isActive && now > new Date(session.expiresAt)) {
        this.stopTrackingSession(sessionId, 'Expired');
      }
    }
  }

  // Get all sessions (for admin)
  getAllSessions() {
    return Array.from(this.trackingSessions.values());
  }
}

module.exports = new RealTimeTrackingService();
