const axios = require('axios');

// Entry Point Integration Service for Airports, Hotels, and Check-posts
class EntryPointIntegrationService {
  constructor() {
    this.entryPoints = new Map(); // entryPointId -> config
    this.integrations = new Map(); // entryPointId -> integration status
    this.initializeDefaultEntryPoints();
  }

  initializeDefaultEntryPoints() {
    // Airport integrations
    this.registerEntryPoint('guwahati-airport', {
      id: 'guwahati-airport',
      name: 'Lokpriya Gopinath Bordoloi International Airport',
      type: 'airport',
      location: { lat: 26.1061, lng: 91.5859 },
      regionId: 'guwahati',
      iataCode: 'GAU',
      integrations: {
        didIssuance: true,
        touristRegistration: true,
        safetyBriefing: true,
        emergencyContacts: true,
        qrCodeGeneration: true
      },
      staff: [
        { id: 'staff-001', name: 'Security Officer', role: 'security', permissions: ['did_issue', 'tourist_register'] },
        { id: 'staff-002', name: 'Immigration Officer', role: 'immigration', permissions: ['did_verify', 'tourist_register'] }
      ],
      operatingHours: { start: '05:00', end: '23:00' },
      contactInfo: {
        phone: '+91-361-284-1001',
        email: 'info@gauairport.com'
      }
    });

    // Hotel integrations
    this.registerEntryPoint('kaziranga-hotel', {
      id: 'kaziranga-hotel',
      name: 'Kaziranga Hotel Check-in',
      type: 'hotel',
      location: { lat: 26.5892, lng: 93.3851 },
      regionId: 'assam',
      hotelCode: 'KZH001',
      integrations: {
        didIssuance: true,
        touristRegistration: true,
        safetyBriefing: true,
        emergencyContacts: true,
        roomAssignment: true
      },
      staff: [
        { id: 'staff-004', name: 'Reception Manager', role: 'reception', permissions: ['did_issue', 'tourist_register', 'room_assign'] },
        { id: 'staff-005', name: 'Security Guard', role: 'security', permissions: ['did_verify', 'safety_briefing'] }
      ],
      operatingHours: { start: '00:00', end: '23:59' },
      contactInfo: {
        phone: '+91-3776-262-001',
        email: 'info@kazirangahotel.com'
      }
    });

    // Checkpoint integrations
    this.registerEntryPoint('shillong-checkpoint', {
      id: 'shillong-checkpoint',
      name: 'Shillong Entry Checkpoint',
      type: 'checkpoint',
      location: { lat: 25.5788, lng: 91.8933 },
      regionId: 'shillong',
      checkpointCode: 'SHL001',
      integrations: {
        didIssuance: true,
        touristRegistration: true,
        safetyBriefing: true,
        emergencyContacts: true,
        vehicleInspection: true
      },
      staff: [
        { id: 'staff-003', name: 'Checkpoint Officer', role: 'checkpoint', permissions: ['did_issue', 'did_verify', 'tourist_register'] }
      ],
      operatingHours: { start: '06:00', end: '22:00' },
      contactInfo: {
        phone: '+91-364-222-2000',
        email: 'checkpoint@shillong.gov.in'
      }
    });
  }

  // Register a new entry point
  registerEntryPoint(entryPointId, config) {
    this.entryPoints.set(entryPointId, {
      ...config,
      createdAt: new Date().toISOString(),
      isActive: true,
      lastActivity: null,
      statistics: {
        totalTourists: 0,
        didsIssued: 0,
        safetyBriefings: 0,
        incidents: 0
      }
    });
  }

  // Get entry point configuration
  getEntryPoint(entryPointId) {
    return this.entryPoints.get(entryPointId);
  }

  // List all entry points
  listEntryPoints() {
    return Array.from(this.entryPoints.values());
  }

  // Process tourist arrival at entry point
  async processTouristArrival({
    entryPointId,
    touristData,
    staffId,
    arrivalType = 'normal' // 'normal', 'emergency', 'group'
  }) {
    const entryPoint = this.getEntryPoint(entryPointId);
    if (!entryPoint) {
      throw new Error('Entry point not found');
    }

    if (!entryPoint.isActive) {
      throw new Error('Entry point is currently inactive');
    }

    // Verify staff permissions
    const staff = entryPoint.staff.find(s => s.id === staffId);
    if (!staff) {
      throw new Error('Staff member not found');
    }

    const arrivalId = require('crypto').randomUUID();
    const timestamp = new Date().toISOString();

    const arrival = {
      arrivalId,
      entryPointId,
      touristData,
      staffId,
      staffName: staff.name,
      arrivalType,
      timestamp,
      status: 'processing',
      steps: []
    };

    try {
      // Step 1: Tourist Registration (if not already registered)
      if (touristData.needsRegistration) {
        const registration = await this.registerTourist(touristData, entryPointId);
        arrival.steps.push({
          step: 'registration',
          status: 'completed',
          data: registration
        });
      }

      // Step 2: DID Issuance
      if (staff.permissions.includes('did_issue')) {
        const didResult = await this.issueDIDForArrival(touristData, entryPointId, staffId);
        arrival.steps.push({
          step: 'did_issuance',
          status: 'completed',
          data: didResult
        });
      }

      // Step 3: Safety Briefing
      if (staff.permissions.includes('safety_briefing')) {
        const briefing = await this.conductSafetyBriefing(touristData, entryPointId);
        arrival.steps.push({
          step: 'safety_briefing',
          status: 'completed',
          data: briefing
        });
      }

      // Step 4: Emergency Contacts Setup
      const emergencySetup = await this.setupEmergencyContacts(touristData, entryPointId);
      arrival.steps.push({
        step: 'emergency_contacts',
        status: 'completed',
        data: emergencySetup
      });

      // Step 5: QR Code Generation
      const qrCode = await this.generateQRCode(touristData, entryPointId);
      arrival.steps.push({
        step: 'qr_generation',
        status: 'completed',
        data: qrCode
      });

      arrival.status = 'completed';
      arrival.completedAt = new Date().toISOString();

      // Update entry point statistics
      this.updateEntryPointStats(entryPointId, 'tourist_arrival');

      return arrival;

    } catch (error) {
      arrival.status = 'failed';
      arrival.error = error.message;
      arrival.failedAt = new Date().toISOString();
      throw error;
    }
  }

  // Register tourist at entry point
  async registerTourist(touristData, entryPointId) {
    // This would integrate with the main tourist registration system
    const registration = {
      touristId: require('crypto').randomUUID(),
      name: touristData.name,
      phone: touristData.phone,
      nationality: touristData.nationality,
      passportNumber: touristData.passportNumber,
      entryPointId,
      registeredAt: new Date().toISOString()
    };

    // In real implementation, this would call the main API
    console.log(`Tourist registered at ${entryPointId}:`, registration);
    
    return registration;
  }

  // Issue DID for arrival
  async issueDIDForArrival(touristData, entryPointId, staffId) {
    // This would integrate with the enhanced DID service
    const didData = {
      kycType: touristData.kycType || 'passport',
      kycNumber: touristData.passportNumber || touristData.aadhaar,
      entryPointId,
      touristInfo: {
        name: touristData.name,
        phone: touristData.phone,
        nationality: touristData.nationality
      },
      itinerary: touristData.itinerary,
      emergencyContacts: touristData.emergencyContacts,
      validDays: touristData.validDays || 30,
      issuedBy: staffId
    };

    // In real implementation, this would call the enhanced DID API
    const didResult = {
      didId: require('crypto').randomUUID(),
      didToken: 'mock-token-' + Date.now(),
      expiresAt: new Date(Date.now() + (didData.validDays * 24 * 60 * 60 * 1000)).toISOString(),
      entryPoint: entryPointId
    };

    console.log(`DID issued at ${entryPointId}:`, didResult);
    
    return didResult;
  }

  // Conduct safety briefing
  async conductSafetyBriefing(touristData, entryPointId) {
    const entryPoint = this.getEntryPoint(entryPointId);
    const briefing = {
      briefingId: require('crypto').randomUUID(),
      entryPointId,
      touristId: touristData.touristId,
      topics: [
        'Emergency contacts and procedures',
        'High-risk areas to avoid',
        'Panic button usage',
        'GPS tracking consent',
        'Local laws and customs'
      ],
      completedAt: new Date().toISOString(),
      duration: 5 // minutes
    };

    console.log(`Safety briefing conducted at ${entryPointId}:`, briefing);
    
    return briefing;
  }

  // Setup emergency contacts
  async setupEmergencyContacts(touristData, entryPointId) {
    const entryPoint = this.getEntryPoint(entryPointId);
    const contacts = {
      local: [
        { name: 'Police', phone: '100', priority: 1 },
        { name: 'Ambulance', phone: '108', priority: 2 },
        { name: 'Tourist Helpline', phone: '1363', priority: 3 }
      ],
      personal: touristData.emergencyContacts || [],
      entryPoint: {
        name: entryPoint.name,
        phone: entryPoint.contactInfo.phone,
        location: entryPoint.location
      }
    };

    console.log(`Emergency contacts setup at ${entryPointId}:`, contacts);
    
    return contacts;
  }

  // Generate QR code for tourist
  async generateQRCode(touristData, entryPointId) {
    const qrData = {
      touristId: touristData.touristId,
      didId: touristData.didId,
      entryPointId,
      generatedAt: new Date().toISOString(),
      qrCode: `QR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };

    console.log(`QR code generated at ${entryPointId}:`, qrData);
    
    return qrData;
  }

  // Update entry point statistics
  updateEntryPointStats(entryPointId, eventType) {
    const entryPoint = this.getEntryPoint(entryPointId);
    if (!entryPoint) return;

    entryPoint.lastActivity = new Date().toISOString();
    
    switch (eventType) {
      case 'tourist_arrival':
        entryPoint.statistics.totalTourists++;
        break;
      case 'did_issued':
        entryPoint.statistics.didsIssued++;
        break;
      case 'safety_briefing':
        entryPoint.statistics.safetyBriefings++;
        break;
      case 'incident':
        entryPoint.statistics.incidents++;
        break;
    }
  }

  // Get entry point statistics
  getEntryPointStats(entryPointId) {
    const entryPoint = this.getEntryPoint(entryPointId);
    if (!entryPoint) return null;

    return {
      entryPointId,
      name: entryPoint.name,
      type: entryPoint.type,
      statistics: entryPoint.statistics,
      lastActivity: entryPoint.lastActivity,
      isActive: entryPoint.isActive
    };
  }

  // Get all entry point statistics
  getAllEntryPointStats() {
    const stats = [];
    for (const [id, entryPoint] of this.entryPoints) {
      stats.push({
        entryPointId: id,
        name: entryPoint.name,
        type: entryPoint.type,
        statistics: entryPoint.statistics,
        lastActivity: entryPoint.lastActivity,
        isActive: entryPoint.isActive
      });
    }
    return stats;
  }

  // Update entry point status
  updateEntryPointStatus(entryPointId, isActive, reason = 'Manual update') {
    const entryPoint = this.getEntryPoint(entryPointId);
    if (!entryPoint) return false;

    entryPoint.isActive = isActive;
    entryPoint.statusUpdatedAt = new Date().toISOString();
    entryPoint.statusUpdateReason = reason;

    console.log(`Entry point ${entryPointId} status updated:`, { isActive, reason });
    return true;
  }

  // Get staff members for entry point
  getEntryPointStaff(entryPointId) {
    const entryPoint = this.getEntryPoint(entryPointId);
    if (!entryPoint) return [];

    return entryPoint.staff.map(staff => ({
      ...staff,
      entryPointId,
      entryPointName: entryPoint.name
    }));
  }

  // Verify staff access
  verifyStaffAccess(entryPointId, staffId, permission) {
    const entryPoint = this.getEntryPoint(entryPointId);
    if (!entryPoint) return false;

    const staff = entryPoint.staff.find(s => s.id === staffId);
    if (!staff) return false;

    return staff.permissions.includes(permission);
  }

  // Get operating hours for entry point
  getOperatingHours(entryPointId) {
    const entryPoint = this.getEntryPoint(entryPointId);
    if (!entryPoint) return null;

    return entryPoint.operatingHours;
  }

  // Check if entry point is currently operating
  isCurrentlyOperating(entryPointId) {
    const entryPoint = this.getEntryPoint(entryPointId);
    if (!entryPoint || !entryPoint.isActive) return false;

    const now = new Date();
    const currentTime = now.getHours() * 100 + now.getMinutes();
    const startTime = parseInt(entryPoint.operatingHours.start.replace(':', ''));
    const endTime = parseInt(entryPoint.operatingHours.end.replace(':', ''));

    return currentTime >= startTime && currentTime <= endTime;
  }

  // Generate arrival report
  generateArrivalReport(entryPointId, startDate, endDate) {
    const entryPoint = this.getEntryPoint(entryPointId);
    if (!entryPoint) return null;

    // In real implementation, this would query actual arrival data
    const report = {
      entryPointId,
      entryPointName: entryPoint.name,
      reportPeriod: { startDate, endDate },
      summary: {
        totalArrivals: 0,
        didsIssued: 0,
        safetyBriefings: 0,
        averageProcessingTime: 0
      },
      generatedAt: new Date().toISOString()
    };

    return report;
  }
}

module.exports = new EntryPointIntegrationService();
