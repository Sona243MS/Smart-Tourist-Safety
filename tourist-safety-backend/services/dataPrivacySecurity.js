const crypto = require('crypto');
const EventEmitter = require('events');

// Data Privacy & Security Service
class DataPrivacySecurityService extends EventEmitter {
  constructor() {
    super();
    this.encryptionKeys = new Map(); // touristId -> encryption key
    this.consentRecords = new Map(); // touristId -> consent data
    this.dataRetentionPolicies = new Map(); // dataType -> retention policy
    this.auditLogs = new Map(); // logId -> audit log
    this.blockchainHashes = new Map(); // recordId -> blockchain hash
    this.initializeDataRetentionPolicies();
    this.initializeEncryptionKeys();
  }

  // Initialize data retention policies
  initializeDataRetentionPolicies() {
    this.dataRetentionPolicies.set('gps_data', {
      retentionDays: 30,
      autoDelete: true,
      anonymizeAfter: 7,
      description: 'GPS location data retention policy'
    });
    
    this.dataRetentionPolicies.set('personal_data', {
      retentionDays: 365,
      autoDelete: false,
      anonymizeAfter: 90,
      description: 'Personal information retention policy'
    });
    
    this.dataRetentionPolicies.set('incident_data', {
      retentionDays: 2555, // 7 years
      autoDelete: false,
      anonymizeAfter: 365,
      description: 'Incident and emergency data retention policy'
    });
    
    this.dataRetentionPolicies.set('audit_logs', {
      retentionDays: 1095, // 3 years
      autoDelete: true,
      anonymizeAfter: 365,
      description: 'Audit log retention policy'
    });
    
    this.dataRetentionPolicies.set('voice_data', {
      retentionDays: 7,
      autoDelete: true,
      anonymizeAfter: 1,
      description: 'Voice recordings retention policy'
    });
  }

  // Initialize encryption keys for existing tourists
  initializeEncryptionKeys() {
    // In production, load from secure key management system
    console.log('Initializing encryption keys for data privacy...');
  }

  // Generate encryption key for tourist
  generateEncryptionKey(touristId) {
    const key = crypto.randomBytes(32); // 256-bit key
    const iv = crypto.randomBytes(16); // 128-bit IV
    
    this.encryptionKeys.set(touristId, {
      key: key.toString('hex'),
      iv: iv.toString('hex'),
      algorithm: 'aes-256-gcm',
      createdAt: new Date().toISOString()
    });
    
    this.logAuditEvent('encryption_key_generated', {
      touristId,
      keyId: key.toString('hex').substring(0, 16) + '...',
      algorithm: 'aes-256-gcm'
    });
    
    return { keyId: key.toString('hex').substring(0, 16) + '...', algorithm: 'aes-256-gcm' };
  }

  // Encrypt sensitive data
  encryptData(data, touristId, dataType = 'personal_data') {
    const keyData = this.encryptionKeys.get(touristId);
    if (!keyData) {
      throw new Error('Encryption key not found for tourist');
    }

    const key = Buffer.from(keyData.key, 'hex');
    const iv = Buffer.from(keyData.iv, 'hex');
    const cipher = crypto.createCipher(keyData.algorithm, key);
    cipher.setAAD(Buffer.from(dataType, 'utf8'));

    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    const encryptedData = {
      data: encrypted,
      authTag: authTag.toString('hex'),
      algorithm: keyData.algorithm,
      dataType,
      encryptedAt: new Date().toISOString(),
      keyId: key.toString('hex').substring(0, 16) + '...'
    };

    this.logAuditEvent('data_encrypted', {
      touristId,
      dataType,
      keyId: encryptedData.keyId,
      algorithm: keyData.algorithm
    });

    return encryptedData;
  }

  // Decrypt sensitive data
  decryptData(encryptedData, touristId) {
    const keyData = this.encryptionKeys.get(touristId);
    if (!keyData) {
      throw new Error('Encryption key not found for tourist');
    }

    const key = Buffer.from(keyData.key, 'hex');
    const decipher = crypto.createDecipher(keyData.algorithm, key);
    decipher.setAAD(Buffer.from(encryptedData.dataType, 'utf8'));
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

    let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    this.logAuditEvent('data_decrypted', {
      touristId,
      dataType: encryptedData.dataType,
      keyId: encryptedData.keyId
    });

    return JSON.parse(decrypted);
  }

  // Hash data for blockchain anchoring
  hashDataForBlockchain(data) {
    const dataString = JSON.stringify(data, Object.keys(data).sort());
    const hash = crypto.createHash('sha256').update(dataString).digest('hex');
    
    this.blockchainHashes.set(data.id || data.touristId, {
      hash,
      dataType: data.type || 'unknown',
      timestamp: new Date().toISOString(),
      dataSize: dataString.length
    });
    
    return hash;
  }

  // Verify data integrity using blockchain hash
  verifyDataIntegrity(data, expectedHash) {
    const currentHash = this.hashDataForBlockchain(data);
    return currentHash === expectedHash;
  }

  // Record consent for data processing
  recordConsent(touristId, consentData) {
    const consent = {
      touristId,
      consentId: require('crypto').randomUUID(),
      dataTypes: consentData.dataTypes || ['personal_data', 'gps_data'],
      purposes: consentData.purposes || ['safety', 'emergency_response'],
      granted: consentData.granted || false,
      grantedAt: consentData.granted ? new Date().toISOString() : null,
      expiresAt: consentData.expiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      ipAddress: consentData.ipAddress,
      userAgent: consentData.userAgent,
      language: consentData.language || 'en',
      version: '1.0',
      createdAt: new Date().toISOString()
    };

    this.consentRecords.set(touristId, consent);
    
    this.logAuditEvent('consent_recorded', {
      touristId,
      consentId: consent.consentId,
      granted: consent.granted,
      dataTypes: consent.dataTypes
    });

    return consent;
  }

  // Check if consent is valid
  checkConsent(touristId, dataType, purpose) {
    const consent = this.consentRecords.get(touristId);
    if (!consent) return false;

    const now = new Date();
    const expiresAt = new Date(consent.expiresAt);
    
    if (now > expiresAt) {
      this.logAuditEvent('consent_expired', { touristId, dataType, purpose });
      return false;
    }

    if (!consent.granted) {
      this.logAuditEvent('consent_denied', { touristId, dataType, purpose });
      return false;
    }

    const hasDataType = consent.dataTypes.includes(dataType) || consent.dataTypes.includes('all');
    const hasPurpose = consent.purposes.includes(purpose) || consent.purposes.includes('all');

    if (!hasDataType || !hasPurpose) {
      this.logAuditEvent('consent_insufficient', { 
        touristId, 
        dataType, 
        purpose, 
        availableDataTypes: consent.dataTypes,
        availablePurposes: consent.purposes
      });
      return false;
    }

    return true;
  }

  // Anonymize personal data
  anonymizeData(data, dataType) {
    const anonymized = { ...data };
    
    // Remove or hash personal identifiers
    if (anonymized.name) {
      anonymized.name = this.hashPersonalData(anonymized.name);
    }
    if (anonymized.phone) {
      anonymized.phone = this.hashPersonalData(anonymized.phone);
    }
    if (anonymized.email) {
      anonymized.email = this.hashPersonalData(anonymized.email);
    }
    if (anonymized.passportNumber) {
      anonymized.passportNumber = this.hashPersonalData(anonymized.passportNumber);
    }
    if (anonymized.aadhaar) {
      anonymized.aadhaar = this.hashPersonalData(anonymized.aadhaar);
    }

    // Add anonymization metadata
    anonymized.anonymizedAt = new Date().toISOString();
    anonymized.anonymizationMethod = 'hash_with_salt';
    anonymized.dataType = dataType;

    this.logAuditEvent('data_anonymized', {
      dataType,
      originalId: data.id || data.touristId,
      anonymizedId: anonymized.id || anonymized.touristId
    });

    return anonymized;
  }

  // Hash personal data with salt
  hashPersonalData(data) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHash('sha256').update(data + salt).digest('hex');
    return `hashed_${hash.substring(0, 16)}_${salt.substring(0, 8)}`;
  }

  // Log audit event
  logAuditEvent(eventType, details) {
    const logId = require('crypto').randomUUID();
    const auditLog = {
      logId,
      eventType,
      details,
      timestamp: new Date().toISOString(),
      ipAddress: details.ipAddress || 'system',
      userAgent: details.userAgent || 'system',
      severity: this.getEventSeverity(eventType)
    };

    this.auditLogs.set(logId, auditLog);
    this.emit('auditEvent', auditLog);

    return logId;
  }

  // Get event severity
  getEventSeverity(eventType) {
    const highSeverity = ['data_breach', 'unauthorized_access', 'encryption_failure'];
    const mediumSeverity = ['consent_denied', 'data_anonymized', 'data_deleted'];
    const lowSeverity = ['data_encrypted', 'data_decrypted', 'consent_recorded'];

    if (highSeverity.includes(eventType)) return 'high';
    if (mediumSeverity.includes(eventType)) return 'medium';
    if (lowSeverity.includes(eventType)) return 'low';
    return 'info';
  }

  // Get audit logs
  getAuditLogs(filters = {}) {
    let logs = Array.from(this.auditLogs.values());
    
    if (filters.eventType) {
      logs = logs.filter(log => log.eventType === filters.eventType);
    }
    
    if (filters.severity) {
      logs = logs.filter(log => log.severity === filters.severity);
    }
    
    if (filters.dateFrom) {
      logs = logs.filter(log => new Date(log.timestamp) >= new Date(filters.dateFrom));
    }
    
    if (filters.dateTo) {
      logs = logs.filter(log => new Date(log.timestamp) <= new Date(filters.dateTo));
    }

    return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  // Delete data according to retention policy
  deleteDataByRetentionPolicy(dataType) {
    const policy = this.dataRetentionPolicies.get(dataType);
    if (!policy || !policy.autoDelete) return { deleted: 0, message: 'No auto-delete policy' };

    const cutoffDate = new Date(Date.now() - policy.retentionDays * 24 * 60 * 60 * 1000);
    let deletedCount = 0;

    // This would integrate with the actual data storage
    // For now, just log the deletion event
    this.logAuditEvent('data_deleted_by_retention', {
      dataType,
      cutoffDate: cutoffDate.toISOString(),
      retentionDays: policy.retentionDays
    });

    return { deleted: deletedCount, message: `Deleted ${deletedCount} records older than ${policy.retentionDays} days` };
  }

  // Get data retention policy
  getDataRetentionPolicy(dataType) {
    return this.dataRetentionPolicies.get(dataType);
  }

  // Update data retention policy
  updateDataRetentionPolicy(dataType, policy) {
    this.dataRetentionPolicies.set(dataType, {
      ...this.dataRetentionPolicies.get(dataType),
      ...policy,
      updatedAt: new Date().toISOString()
    });

    this.logAuditEvent('retention_policy_updated', {
      dataType,
      policy
    });
  }

  // Generate privacy report
  generatePrivacyReport(touristId) {
    const consent = this.consentRecords.get(touristId);
    const encryptionKey = this.encryptionKeys.get(touristId);
    const auditLogs = this.getAuditLogs({ touristId });

    return {
      touristId,
      generatedAt: new Date().toISOString(),
      consent: consent ? {
        granted: consent.granted,
        dataTypes: consent.dataTypes,
        purposes: consent.purposes,
        grantedAt: consent.grantedAt,
        expiresAt: consent.expiresAt
      } : null,
      encryption: encryptionKey ? {
        algorithm: encryptionKey.algorithm,
        keyId: encryptionKey.key.substring(0, 16) + '...',
        createdAt: encryptionKey.createdAt
      } : null,
      dataRetention: Array.from(this.dataRetentionPolicies.entries()).map(([type, policy]) => ({
        dataType: type,
        retentionDays: policy.retentionDays,
        autoDelete: policy.autoDelete,
        anonymizeAfter: policy.anonymizeAfter
      })),
      auditLogs: auditLogs.slice(0, 10), // Last 10 audit logs
      totalAuditLogs: auditLogs.length
    };
  }

  // Check GDPR compliance
  checkGDPRCompliance(touristId) {
    const consent = this.consentRecords.get(touristId);
    const encryptionKey = this.encryptionKeys.get(touristId);
    
    const compliance = {
      touristId,
      checkedAt: new Date().toISOString(),
      gdprCompliant: true,
      issues: [],
      recommendations: []
    };

    // Check consent
    if (!consent) {
      compliance.gdprCompliant = false;
      compliance.issues.push('No consent record found');
      compliance.recommendations.push('Obtain explicit consent before processing data');
    } else if (!consent.granted) {
      compliance.gdprCompliant = false;
      compliance.issues.push('Consent not granted');
      compliance.recommendations.push('Ensure consent is obtained before data processing');
    }

    // Check encryption
    if (!encryptionKey) {
      compliance.gdprCompliant = false;
      compliance.issues.push('No encryption key found');
      compliance.recommendations.push('Encrypt all personal data');
    }

    // Check data retention
    const hasRetentionPolicies = this.dataRetentionPolicies.size > 0;
    if (!hasRetentionPolicies) {
      compliance.gdprCompliant = false;
      compliance.issues.push('No data retention policies defined');
      compliance.recommendations.push('Define and implement data retention policies');
    }

    return compliance;
  }

  // Export user data (GDPR right to data portability)
  exportUserData(touristId) {
    const consent = this.consentRecords.get(touristId);
    const encryptionKey = this.encryptionKeys.get(touristId);
    const auditLogs = this.getAuditLogs({ touristId });

    const exportData = {
      touristId,
      exportedAt: new Date().toISOString(),
      dataTypes: ['consent', 'encryption', 'audit_logs'],
      consent: consent || null,
      encryption: encryptionKey ? {
        algorithm: encryptionKey.algorithm,
        keyId: encryptionKey.key.substring(0, 16) + '...',
        createdAt: encryptionKey.createdAt
      } : null,
      auditLogs: auditLogs.map(log => ({
        eventType: log.eventType,
        timestamp: log.timestamp,
        severity: log.severity
      })),
      format: 'json',
      version: '1.0'
    };

    this.logAuditEvent('data_exported', {
      touristId,
      dataTypes: exportData.dataTypes,
      recordCount: auditLogs.length
    });

    return exportData;
  }

  // Delete user data (GDPR right to be forgotten)
  deleteUserData(touristId) {
    const deleted = {
      touristId,
      deletedAt: new Date().toISOString(),
      deletedData: []
    };

    // Delete consent record
    if (this.consentRecords.has(touristId)) {
      this.consentRecords.delete(touristId);
      deleted.deletedData.push('consent');
    }

    // Delete encryption key
    if (this.encryptionKeys.has(touristId)) {
      this.encryptionKeys.delete(touristId);
      deleted.deletedData.push('encryption_key');
    }

    // Delete audit logs
    const auditLogs = this.getAuditLogs({ touristId });
    auditLogs.forEach(log => {
      this.auditLogs.delete(log.logId);
    });
    deleted.deletedData.push(`audit_logs_${auditLogs.length}`);

    this.logAuditEvent('user_data_deleted', {
      touristId,
      deletedData: deleted.deletedData
    });

    return deleted;
  }

  // Get blockchain hash for record
  getBlockchainHash(recordId) {
    return this.blockchainHashes.get(recordId);
  }

  // Verify blockchain integrity
  verifyBlockchainIntegrity(recordId, expectedHash) {
    const storedHash = this.blockchainHashes.get(recordId);
    if (!storedHash) return false;
    
    return storedHash.hash === expectedHash;
  }

  // Get all blockchain hashes
  getAllBlockchainHashes() {
    return Array.from(this.blockchainHashes.entries()).map(([recordId, hashData]) => ({
      recordId,
      hash: hashData.hash,
      dataType: hashData.dataType,
      timestamp: hashData.timestamp,
      dataSize: hashData.dataSize
    }));
  }

  // Generate security report
  generateSecurityReport() {
    const totalConsents = this.consentRecords.size;
    const totalEncryptionKeys = this.encryptionKeys.size;
    const totalAuditLogs = this.auditLogs.size;
    const totalBlockchainHashes = this.blockchainHashes.size;

    const recentAuditLogs = this.getAuditLogs({ 
      dateFrom: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() 
    });

    const highSeverityLogs = recentAuditLogs.filter(log => log.severity === 'high');
    const mediumSeverityLogs = recentAuditLogs.filter(log => log.severity === 'medium');

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalConsents,
        totalEncryptionKeys,
        totalAuditLogs,
        totalBlockchainHashes,
        recentAuditLogs: recentAuditLogs.length,
        highSeverityEvents: highSeverityLogs.length,
        mediumSeverityEvents: mediumSeverityLogs.length
      },
      dataRetentionPolicies: Array.from(this.dataRetentionPolicies.entries()),
      recentHighSeverityEvents: highSeverityLogs.slice(0, 5),
      securityRecommendations: this.generateSecurityRecommendations(highSeverityLogs.length, mediumSeverityLogs.length)
    };
  }

  // Generate security recommendations
  generateSecurityRecommendations(highSeverityCount, mediumSeverityCount) {
    const recommendations = [];

    if (highSeverityCount > 0) {
      recommendations.push('Immediate attention required: High severity security events detected');
    }

    if (mediumSeverityCount > 5) {
      recommendations.push('Review medium severity events: Consider implementing additional security measures');
    }

    if (this.consentRecords.size === 0) {
      recommendations.push('No consent records found: Implement consent management system');
    }

    if (this.encryptionKeys.size === 0) {
      recommendations.push('No encryption keys found: Implement data encryption for all personal data');
    }

    return recommendations;
  }
}

module.exports = new DataPrivacySecurityService();
