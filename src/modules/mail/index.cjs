/**
 * @fileoverview MCP Mail Module - Handles mail-related intents and actions for MCP.
 * Exposes: id, name, capabilities, init, handleIntent. Aligned with MCP module system and phase1_architecture.md.
 */

const { normalizeEmail } = require('../../graph/normalizers.cjs');
const ErrorService = require('../../core/error-service.cjs');
const MonitoringService = require('../../core/monitoring-service.cjs');

const MAIL_CAPABILITIES = [
    'readMail',
    'searchMail',
    'sendMail',
    'flagMail',
    'getMailAttachments',
    'readMailDetails',
    'markEmailRead'
];

// Log module initialization
MonitoringService.info('Mail Module initialized', {
    serviceName: 'mail-module',
    capabilities: MAIL_CAPABILITIES.length,
    timestamp: new Date().toISOString()
}, 'mail');

const MailModule = {
    /**
     * Helper method to redact sensitive email data from objects before logging
     * @param {object} data - The data object to redact
     * @returns {object} Redacted copy of the data
     * @private
     */
    redactSensitiveEmailData(data) {
        if (!data || typeof data !== 'object') {
            return data;
        }
        
        // Create a deep copy to avoid modifying the original
        const result = Array.isArray(data) ? [...data] : {...data};
        
        // Fields that should be redacted for email data
        const sensitiveFields = [
            'body', 'content', 'subject', 'to', 'from', 'cc', 'bcc', 
            'emailAddress', 'address', 'email', 'recipients', 'sender',
            'attachment', 'attachments', 'contentBytes'
        ];
        
        // Recursively process the object
        for (const key in result) {
            if (Object.prototype.hasOwnProperty.call(result, key)) {
                // Check if this is a sensitive field
                if (sensitiveFields.includes(key.toLowerCase())) {
                    if (typeof result[key] === 'string') {
                        result[key] = 'REDACTED';
                    } else if (Array.isArray(result[key])) {
                        result[key] = `[${result[key].length} items]`;
                    } else if (typeof result[key] === 'object' && result[key] !== null) {
                        result[key] = '{REDACTED}';
                    }
                } 
                // Recursively process nested objects
                else if (typeof result[key] === 'object' && result[key] !== null) {
                    result[key] = this.redactSensitiveEmailData(result[key]);
                }
            }
        }
        
        return result;
    },

    /**
     * Fetch raw inbox data from Graph for debugging (no normalization)
     * @param {object} options
     * @returns {Promise<object[]>}
     */
    async getInboxRaw(options = {}) {
        const { graphService } = this.services || {};
        if (!graphService || typeof graphService.getInboxRaw !== 'function') {
            throw new Error('GraphService.getInboxRaw not implemented');
        }
        return await graphService.getInboxRaw(options);
    },
    
    /**
     * Get inbox emails
     * @param {object} options - Options including top, filter
     * @param {object} req - Express request object (optional)
     * @returns {Promise<Array<object>>} List of emails
     */
    async getInbox(options = {}, req) {
        const { graphService } = this.services || {};
        if (!graphService || typeof graphService.getInbox !== 'function') {
            throw new Error('GraphService.getInbox not implemented');
        }
        return await graphService.getInbox(options, req);
    },
    
    /**
     * Search emails by query
     * @param {string} query - Search query
     * @param {object} options - Search options
     * @param {object} req - Express request object (optional)
     * @returns {Promise<Array<object>>} List of matching emails
     */
    async searchEmails(query, options = {}, req) {
        const { graphService } = this.services || {};
        if (!graphService || typeof graphService.searchEmails !== 'function') {
            throw new Error('GraphService.searchEmails not implemented');
        }
        return await graphService.searchEmails(query, options, req);
    },
    
    /**
     * Send an email
     * @param {object} emailData - Email data with to, subject, body, cc, bcc
     * @param {object} req - Express request object (optional)
     * @returns {Promise<boolean>} Success indicator
     */
    async sendEmail(emailData, req) {
        const startTime = Date.now();
        const { graphService, errorService = ErrorService, monitoringService = MonitoringService } = this.services || {};
        
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Send email operation started', {
                method: 'sendEmail',
                emailData: this.redactSensitiveEmailData(emailData),
                timestamp: new Date().toISOString()
            }, 'mail');
        }
        
        try {
            if (!graphService || typeof graphService.sendEmail !== 'function') {
                const mcpError = ErrorService.createError(
                    ErrorService.CATEGORIES.VALIDATION,
                    'GraphService.sendEmail not implemented',
                    ErrorService.SEVERITIES.ERROR,
                    {
                        method: 'sendEmail',
                        moduleId: 'mail',
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                throw mcpError;
            }
            
            // Validate required fields
            if (!emailData.to) {
                const mcpError = ErrorService.createError(
                    ErrorService.CATEGORIES.VALIDATION,
                    'Recipient (to) is required',
                    ErrorService.SEVERITIES.WARNING,
                    {
                        method: 'sendEmail',
                        moduleId: 'mail',
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                throw mcpError;
            }
            if (!emailData.subject) {
                const mcpError = ErrorService.createError(
                    ErrorService.CATEGORIES.VALIDATION,
                    'Subject is required',
                    ErrorService.SEVERITIES.WARNING,
                    {
                        method: 'sendEmail',
                        moduleId: 'mail',
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                throw mcpError;
            }
            if (!emailData.body) {
                const mcpError = ErrorService.createError(
                    ErrorService.CATEGORIES.VALIDATION,
                    'Body is required',
                    ErrorService.SEVERITIES.WARNING,
                    {
                        method: 'sendEmail',
                        moduleId: 'mail',
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                throw mcpError;
            }
            
            // Send email via graph service
            const result = await graphService.sendEmail(emailData, req);
            
            const executionTime = Date.now() - startTime;
            MonitoringService.trackMetric('mail_send_success', executionTime, {
                method: 'sendEmail',
                moduleId: 'mail',
                timestamp: new Date().toISOString()
            });
            
            MonitoringService.info('Email sent successfully', {
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'mail');
            
            return result;
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            // If it's already an MCP error, just track metrics and rethrow
            if (error.category) {
                MonitoringService.trackMetric('mail_send_failure', executionTime, {
                    method: 'sendEmail',
                    moduleId: 'mail',
                    errorType: error.code || 'validation_error',
                    timestamp: new Date().toISOString()
                });
                throw error;
            }
            
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Error sending email: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                {
                    method: 'sendEmail',
                    moduleId: 'mail',
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            MonitoringService.trackMetric('mail_send_failure', executionTime, {
                method: 'sendEmail',
                moduleId: 'mail',
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    },
    
    /**
     * Flag or unflag an email
     * @param {string} id - Email ID
     * @param {boolean} flag - Flag state
     * @param {object} req - Express request object (optional)
     * @returns {Promise<boolean>} Success indicator
     */
    async flagEmail(id, flag = true, req) {
        const { graphService } = this.services || {};
        if (!graphService || typeof graphService.flagEmail !== 'function') {
            throw new Error('GraphService.flagEmail not implemented');
        }
        return await graphService.flagEmail(id, flag, req);
    },
    
    /**
     * Get email attachments
     * @param {string} id - Email ID
     * @param {object} req - Express request object (optional)
     * @returns {Promise<Array<object>>} List of attachments
     */
    async getAttachments(id, req) {
        const { graphService } = this.services || {};
        if (!graphService || typeof graphService.getAttachments !== 'function') {
            throw new Error('GraphService.getAttachments not implemented');
        }
        return await graphService.getAttachments(id, req);
    },
    
    /**
     * Get detailed information for a specific email
     * @param {string} id - Email ID
     * @param {object} req - Express request object (optional)
     * @returns {Promise<object>} Email details
     */
    async getEmailDetails(id, req) {
        const { graphService } = this.services || {};
        if (!graphService || typeof graphService.getEmailDetails !== 'function') {
            throw new Error('GraphService.getEmailDetails not implemented');
        }
        return await graphService.getEmailDetails(id, req);
    },
    
    /**
     * Mark an email as read or unread
     * @param {string} id - Email ID
     * @param {boolean} isRead - Read status to set
     * @param {object} req - Express request object (optional)
     * @returns {Promise<boolean>} Success indicator
     */
    async markAsRead(id, isRead = true, req) {
        const { graphService } = this.services || {};
        if (!graphService || typeof graphService.markAsRead !== 'function') {
            throw new Error('GraphService.markAsRead not implemented');
        }
        return await graphService.markAsRead(id, isRead, req);
    },
    id: 'mail',
    name: 'Outlook Mail',
    capabilities: MAIL_CAPABILITIES,
    /**
     * Initializes the mail module with dependencies.
     * @param {object} services - { graphService, cacheService, eventService }
     * @returns {object} Initialized module
     */
    init(services) {
        this.services = services;
        return this;
    },
    /**
     * Handles mail-related intents routed to this module.
     * @param {string} intent
     * @param {object} entities
     * @param {object} context
     * @returns {Promise<object>} Normalized response
     */
    async handleIntent(intent, entities = {}, context = {}) {
        const { graphService, cacheService } = this.services || {};
        switch (intent) {
            case 'readMail': {
                const count = entities.count || 10;
                // Try cache first
                const cacheKey = `mail:inbox:${count}`;
                let mailList = cacheService && await cacheService.get(cacheKey);
                if (!mailList) {
                    const raw = await graphService.getInbox({ top: count }, context.req);
                    mailList = Array.isArray(raw) ? raw.map(normalizeEmail) : [];

                    if (cacheService) await cacheService.set(cacheKey, mailList, 60);
                }
                return { type: 'mailList', items: mailList };
            }
            case 'searchMail': {
                const query = entities.query || '';
                const cacheKey = `mail:search:${query}`;
                let results = cacheService && await cacheService.get(cacheKey);
                if (!results) {
                    const raw = await graphService.searchEmails(query, {}, context.req);
                    results = Array.isArray(raw) ? raw.map(normalizeEmail) : [];
                    if (cacheService) await cacheService.set(cacheKey, results, 60);
                }
                return { type: 'mailList', items: results };
            }
            case 'sendMail': {
                const { to, subject, body, cc, bcc } = entities;
                MonitoringService.debug('Handling sendMail intent', {
                    entities: this.redactSensitiveEmailData(entities),
                    timestamp: new Date().toISOString()
                }, 'mail');
                const sent = await graphService.sendEmail({ to, subject, body, cc, bcc }, context.req);
                return { type: 'mailSendResult', success: !!sent, sent };
            }
            case 'flagMail': {
                const { mailId, flag } = entities;
                const flagged = await graphService.flagEmail(mailId, flag, context.req);
                return { type: 'mailFlagResult', flagged };
            }
            case 'getMailAttachments': {
                const { mailId } = entities;
                const attachments = await graphService.getAttachments(mailId, context.req);
                return { type: 'mailAttachments', attachments };
            }
            case 'readMailDetails': {
                const { id } = entities;
                const cacheKey = `mail:details:${id}`;
                let details = cacheService && await cacheService.get(cacheKey);
                if (!details) {
                    details = await graphService.getEmailDetails(id, context.req);
                    if (cacheService) await cacheService.set(cacheKey, details, 60);
                }
                return { type: 'mailDetails', email: details };
            }
            case 'markEmailRead': {
                const { id, isRead = true } = entities;
                const success = await graphService.markAsRead(id, isRead, context.req);
                return { type: 'mailMarkReadResult', success, isRead };
            }
            default:
                throw new Error(`MailModule cannot handle intent: ${intent}`);
        }
    }
};

module.exports = MailModule;
