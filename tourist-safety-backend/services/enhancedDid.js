const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Enhanced DID service with KYC validation and entry point integration
class EnhancedDIDService {
  constructor() {
    this.kycValidators = {
      aadhaar: this.validateAadhaar.bind(this),
      passport: this.validatePassport.bind(this),
      driving_license: this.validateDrivingLicense.bind(this),
      voter_id: this.validateVoterId.bind(this)
    };
    
    this.entryPoints = new Map(); // entryPointId -> config
    this.issuedTokens = new Map(); // didId -> token info
  }

  // KYC Validation Methods
  validateAadhaar(number) {
    const cleaned = number.replace(/\s+/g, '');
    if (!/^\d{12}$/.test(cleaned)) {
      return { valid: false, error: 'Aadhaar must be 12 digits' };
    }
    
    // Verhoeff algorithm for Aadhaar validation
    if (!this.verhoeffCheck(cleaned)) {
      return { valid: false, error: 'Invalid Aadhaar checksum' };
    }
    
    return { valid: true, cleaned };
  }

  validatePassport(number) {
    const cleaned = number.replace(/\s+/g, '').toUpperCase();
    // Basic passport format validation (varies by country)
    if (!/^[A-Z]{1,2}\d{6,9}$/.test(cleaned)) {
      return { valid: false, error: 'Invalid passport format' };
    }
    return { valid: true, cleaned };
  }

  validateDrivingLicense(number) {
    const cleaned = number.replace(/\s+/g, '').toUpperCase();
    // Basic DL format validation
    if (!/^[A-Z]{2}\d{2}\d{4}\d{7}$/.test(cleaned)) {
      return { valid: false, error: 'Invalid driving license format' };
    }
    return { valid: true, cleaned };
  }

  validateVoterId(number) {
    const cleaned = number.replace(/\s+/g, '');
    if (!/^[A-Z]{3}\d{7}$/.test(cleaned)) {
      return { valid: false, error: 'Invalid voter ID format' };
    }
    return { valid: true, cleaned };
  }

  // Verhoeff algorithm for Aadhaar validation
  verhoeffCheck(number) {
    const multiplication = [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
      [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
      [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
      [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
      [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
      [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
      [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
      [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
      [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
    ];
    
    const permutation = [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
      [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
      [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
      [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
      [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
      [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
      [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
    ];
    
    let checksum = 0;
    for (let i = 0; i < number.length; i++) {
      const digit = parseInt(number[number.length - 1 - i]);
      checksum = multiplication[checksum][permutation[((i + 1) % 8)][digit]];
    }
    
    return checksum === 0;
  }

  // Entry Point Management
  registerEntryPoint(entryPointId, config) {
    this.entryPoints.set(entryPointId, {
      id: entryPointId,
      name: config.name,
      type: config.type, // 'airport', 'hotel', 'checkpoint', 'border'
      location: config.location,
      regionId: config.regionId,
      authorizedStaff: config.authorizedStaff || [],
      maxValidityDays: config.maxValidityDays || 30,
      createdAt: new Date().toISOString()
    });
  }

  getEntryPoint(entryPointId) {
    return this.entryPoints.get(entryPointId);
  }

  listEntryPoints() {
    return Array.from(this.entryPoints.values());
  }

  // Enhanced DID Issuance
  async issueDID({
    kycType,
    kycNumber,
    kycHash,
    entryPointId,
    touristInfo,
    itinerary,
    emergencyContacts,
    validDays,
    issuedBy
  }) {
    try {
      // Validate KYC if provided
      if (kycNumber && this.kycValidators[kycType]) {
        const validation = this.kycValidators[kycType](kycNumber);
        if (!validation.valid) {
          throw new Error(`KYC validation failed: ${validation.error}`);
        }
      }

      // Validate entry point
      const entryPoint = this.getEntryPoint(entryPointId);
      if (!entryPoint) {
        throw new Error('Invalid entry point');
      }

      // Check if staff is authorized
      if (issuedBy && entryPoint.authorizedStaff.length > 0) {
        if (!entryPoint.authorizedStaff.includes(issuedBy)) {
          throw new Error('Unauthorized staff member');
        }
      }

      const didId = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      const maxDays = Math.min(validDays || 30, entryPoint.maxValidityDays);
      const exp = now + (maxDays * 24 * 60 * 60);

      // Create enhanced payload
      const payload = {
        iss: 'smart-tourist-safety',
        iat: now,
        exp: exp,
        didId,
        kycType,
        kycHash: kycHash || (kycNumber ? crypto.createHash('sha256').update(kycNumber).digest('hex') : null),
        entryPoint: {
          id: entryPointId,
          name: entryPoint.name,
          type: entryPoint.type,
          regionId: entryPoint.regionId
        },
        touristInfo: {
          name: touristInfo?.name,
          phone: touristInfo?.phone,
          nationality: touristInfo?.nationality,
          age: touristInfo?.age
        },
        itinerary: itinerary || null,
        emergencyContacts: emergencyContacts || null,
        issuedBy: issuedBy || null,
        version: '2.0'
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET || 'dev-secret-change-me');
      
      // Store token info
      this.issuedTokens.set(didId, {
        didId,
        token,
        issuedAt: new Date(now * 1000).toISOString(),
        expiresAt: new Date(exp * 1000).toISOString(),
        entryPointId,
        issuedBy,
        status: 'active'
      });

      return {
        success: true,
        didToken: token,
        didId,
        expiresAt: new Date(exp * 1000).toISOString(),
        entryPoint: entryPoint.name,
        validityDays: maxDays
      };

    } catch (error) {
      console.error('DID issuance failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Token Management
  verifyDID(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change-me');
      const tokenInfo = this.issuedTokens.get(decoded.didId);
      
      if (!tokenInfo || tokenInfo.status !== 'active') {
        return { valid: false, error: 'Token not found or inactive' };
      }

      return {
        valid: true,
        claims: decoded,
        tokenInfo
      };
    } catch (error) {
      return { valid: false, error: 'Invalid or expired token' };
    }
  }

  revokeDID(didId, reason = 'Manual revocation') {
    const tokenInfo = this.issuedTokens.get(didId);
    if (tokenInfo) {
      tokenInfo.status = 'revoked';
      tokenInfo.revokedAt = new Date().toISOString();
      tokenInfo.revocationReason = reason;
      return true;
    }
    return false;
  }

  getTokenInfo(didId) {
    return this.issuedTokens.get(didId);
  }

  listActiveTokens() {
    return Array.from(this.issuedTokens.values())
      .filter(token => token.status === 'active');
  }

  // Analytics
  getIssuanceStats(entryPointId = null, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const tokens = Array.from(this.issuedTokens.values())
      .filter(token => new Date(token.issuedAt) >= since)
      .filter(token => !entryPointId || token.entryPointId === entryPointId);

    const stats = {
      totalIssued: tokens.length,
      activeTokens: tokens.filter(t => t.status === 'active').length,
      revokedTokens: tokens.filter(t => t.status === 'revoked').length,
      byEntryPoint: {},
      byDay: {}
    };

    tokens.forEach(token => {
      // By entry point
      if (!stats.byEntryPoint[token.entryPointId]) {
        stats.byEntryPoint[token.entryPointId] = 0;
      }
      stats.byEntryPoint[token.entryPointId]++;

      // By day
      const day = token.issuedAt.split('T')[0];
      if (!stats.byDay[day]) {
        stats.byDay[day] = 0;
      }
      stats.byDay[day]++;
    });

    return stats;
  }
}

// Singleton instance
const enhancedDIDService = new EnhancedDIDService();

// Initialize with default entry points
enhancedDIDService.registerEntryPoint('guwahati-airport', {
  name: 'Guwahati Airport',
  type: 'airport',
  location: { lat: 26.1061, lng: 91.5859 },
  regionId: 'guwahati',
  maxValidityDays: 30,
  authorizedStaff: ['staff-001', 'staff-002']
});

enhancedDIDService.registerEntryPoint('shillong-checkpoint', {
  name: 'Shillong Entry Checkpoint',
  type: 'checkpoint',
  location: { lat: 25.5788, lng: 91.8933 },
  regionId: 'shillong',
  maxValidityDays: 15,
  authorizedStaff: ['staff-003']
});

enhancedDIDService.registerEntryPoint('kaziranga-hotel', {
  name: 'Kaziranga Hotel Check-in',
  type: 'hotel',
  location: { lat: 26.5892, lng: 93.3851 },
  regionId: 'assam',
  maxValidityDays: 7,
  authorizedStaff: ['staff-004', 'staff-005']
});

module.exports = enhancedDIDService;


