/**
 * @fileoverview MCP Mail Module - Handles mail-related intents and actions for MCP.
 * Exposes: id, name, capabilities, init, handleIntent. Aligned with MCP module system and phase1_architecture.md.
 */

const { normalizeEmail } = require('../../graph/normalizers.cjs');

const MAIL_CAPABILITIES = [
    'readMail',
    'searchMail',
    'sendMail',
    'flagMail',
    'getMailAttachments',
    'readMailDetails',
    'markEmailRead'
];

const MailModule = {
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
        const { graphService } = this.services || {};
        if (!graphService || typeof graphService.sendEmail !== 'function') {
            throw new Error('GraphService.sendEmail not implemented');
        }
        
        console.log('[MailModule] Sending email with data:', JSON.stringify(emailData));
        
        // Validate required fields
        if (!emailData.to) {
            throw new Error('Recipient (to) is required');
        }
        if (!emailData.subject) {
            throw new Error('Subject is required');
        }
        if (!emailData.body) {
            throw new Error('Body is required');
        }
        
        // Send email via graph service
        try {
            const result = await graphService.sendEmail(emailData, req);
            console.log('[MailModule] Email sent successfully');
            return result;
        } catch (error) {
            console.error(`[MailModule] Error sending email: ${error.message}`);
            throw error;
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
                console.log('[MailModule:handleIntent] Sending email with entities:', JSON.stringify(entities));
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
