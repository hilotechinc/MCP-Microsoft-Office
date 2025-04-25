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
    'getMailAttachments'
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
                const { to, subject, body } = entities;
                const sent = await graphService.sendEmail({ to, subject, body }, context.req);
                return { type: 'mailSendResult', sent };
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
            default:
                throw new Error(`MailModule cannot handle intent: ${intent}`);
        }
    }
};

module.exports = MailModule;
