/**
 * @fileoverview Unit tests for mail-controller (dependency-injected).
 */
// Use Jest's built-in expect
// const { expect } = require('chai');
// Using Jest's built-in mocking instead of sinon
const httpMocks = require('node-mocks-http');
const mailControllerFactory = require('../../../../src/api/controllers/mail-controller');

function mockDeps(overrides = {}) {
    return {
        mailModule: {
            getInbox: jest.fn().mockResolvedValue([{ id: '1', subject: 'Test' }]),
            sendMail: jest.fn().mockResolvedValue({ sent: true })
        },
        ...overrides
    };
}

describe('mail-controller', () => {
    it('should call getInbox and return messages', async () => {
        const deps = mockDeps();
        const { getMail } = mailControllerFactory(deps);
        const req = httpMocks.createRequest({ method: 'GET', query: {} });
        const res = httpMocks.createResponse();
        await getMail(req, res);
        expect(deps.mailModule.getInbox).toHaveBeenCalledTimes(1);
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res._getJSONData())).toBe(true);
    });

    it('should validate sendMail input and return 400 on invalid', async () => {
        const deps = mockDeps();
        const { sendMail } = mailControllerFactory(deps);
        const req = httpMocks.createRequest({ method: 'POST', body: { to: '', subject: '', body: '' } });
        const res = httpMocks.createResponse();
        await sendMail(req, res);
        expect(res.statusCode).toBe(400);
        expect(res._getJSONData()).toHaveProperty('error');
    });

    it('should call sendMail and return result on valid input', async () => {
        const deps = mockDeps();
        const { sendMail } = mailControllerFactory(deps);
        const req = httpMocks.createRequest({ method: 'POST', body: { to: 'test@example.com', subject: 'Hi', body: 'Body' } });
        const res = httpMocks.createResponse();
        await sendMail(req, res);
        expect(deps.mailModule.sendMail).toHaveBeenCalledTimes(1);
        expect(res.statusCode).toBe(200);
        expect(res._getJSONData()).toHaveProperty('sent');
    });

    it('should handle internal errors and return 500', async () => {
        const deps = mockDeps({ mailModule: { sendMail: jest.fn().mockRejectedValue(new Error('fail')) } });
        const { sendMail } = mailControllerFactory(deps);
        const req = httpMocks.createRequest({ method: 'POST', body: { to: 'test@example.com', subject: 'Hi', body: 'Body' } });
        const res = httpMocks.createResponse();
        await sendMail(req, res);
        expect(res.statusCode).toBe(500);
        expect(res._getJSONData()).toHaveProperty('error');
    });
});
