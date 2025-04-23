const mailModule = require('../../../src/modules/mail');

describe('Mail Module', () => {
    const mockGraphService = {
        getInbox: jest.fn(async (count) => [
            { id: '1', subject: 'A', from: { emailAddress: { name: 'Alice', address: 'alice@example.com' } }, receivedDateTime: '2025-01-01T00:00:00Z' }
        ]),
        searchEmails: jest.fn(async (q) => [
            { id: '2', subject: 'B', from: { emailAddress: { name: 'Bob', address: 'bob@example.com' } }, receivedDateTime: '2025-01-02T00:00:00Z' }
        ]),
        sendEmail: jest.fn(async ({ to, subject, body }) => ({ id: '3', to, subject, body })),
        flagEmail: jest.fn(async (mailId, flag) => ({ id: mailId, flag })),
        getAttachments: jest.fn(async (mailId) => [{ id: 'att1', name: 'file.txt' }])
    };
    const mockCacheService = {
        get: jest.fn(async () => undefined),
        set: jest.fn(async () => {})
    };
    let mod;
    beforeEach(() => {
        mod = mailModule.init({ graphService: mockGraphService, cacheService: mockCacheService });
    });
    it('handles readMail intent', async () => {
        const res = await mod.handleIntent('readMail', { count: 1 }, {});
        expect(res).toHaveProperty('type', 'mailList');
        expect(res.items[0]).toHaveProperty('id', '1');
    });
    it('handles searchMail intent', async () => {
        const res = await mod.handleIntent('searchMail', { query: 'B' }, {});
        expect(res).toHaveProperty('type', 'mailList');
        expect(res.items[0]).toHaveProperty('id', '2');
    });
    it('handles sendMail intent', async () => {
        const res = await mod.handleIntent('sendMail', { to: 'bob@example.com', subject: 'S', body: 'B' }, {});
        expect(res).toHaveProperty('type', 'mailSendResult');
        expect(res.sent).toHaveProperty('id', '3');
    });
    it('handles flagMail intent', async () => {
        const res = await mod.handleIntent('flagMail', { mailId: '1', flag: 'important' }, {});
        expect(res).toHaveProperty('type', 'mailFlagResult');
        expect(res.flagged).toHaveProperty('id', '1');
    });
    it('handles getMailAttachments intent', async () => {
        const res = await mod.handleIntent('getMailAttachments', { mailId: '1' }, {});
        expect(res).toHaveProperty('type', 'mailAttachments');
        expect(Array.isArray(res.attachments)).toBe(true);
    });
    it('throws on unknown intent', async () => {
        await expect(mod.handleIntent('unknownIntent')).rejects.toThrow(/cannot handle intent/);
    });
});
