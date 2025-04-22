const mailService = require('../../../src/graph/mail-service');
const graphClientFactory = require('../../../src/graph/graph-client');

jest.mock('../../../src/graph/graph-client');

const MOCK_MAIL = [
  {
    id: '1',
    subject: 'Test Email',
    from: { emailAddress: { name: 'Sender', address: 'sender@example.com' } },
    receivedDateTime: '2025-04-22T10:00:00Z',
    bodyPreview: 'Hello world',
    isRead: false,
    importance: 'normal',
    hasAttachments: false
  }
];

describe('MailService', () => {
  let client;
  beforeEach(() => {
    client = {
      api: jest.fn().mockReturnThis(),
      get: jest.fn()
    };
    graphClientFactory.createClient.mockResolvedValue(client);
  });

  it('should retrieve inbox emails', async () => {
    client.api.mockReturnValue({ get: jest.fn().mockResolvedValue({ value: MOCK_MAIL }) });
    const emails = await mailService.getInbox({ top: 1 });
    expect(Array.isArray(emails)).toBe(true);
    expect(emails[0]).toHaveProperty('id', '1');
    expect(emails[0]).toHaveProperty('subject', 'Test Email');
    expect(emails[0]).toHaveProperty('from');
  });

  it('should search emails', async () => {
    client.api.mockReturnValue({ get: jest.fn().mockResolvedValue({ value: MOCK_MAIL }) });
    const emails = await mailService.searchEmails('test', { top: 1 });
    expect(emails[0].subject).toMatch(/test/i);
  });

  it('should send an email', async () => {
    client.api.mockReturnValue({
      post: jest.fn().mockResolvedValue({ id: 'sent-id' })
    });
    const result = await mailService.sendEmail({ to: 'user@example.com', subject: 'Hello', body: 'World' });
    expect(result).toHaveProperty('id', 'sent-id');
  });

  it('should flag/categorize an email', async () => {
    client.api.mockReturnValue({ patch: jest.fn().mockResolvedValue({ id: '1', flag: { flagStatus: 'flagged' } }) });
    const result = await mailService.flagEmail('1', { flagStatus: 'flagged' });
    expect(result.flag.flagStatus).toBe('flagged');
  });

  it('should handle attachments', async () => {
    client.api.mockReturnValue({ get: jest.fn().mockResolvedValue({ value: [{ id: 'att-1', name: 'file.txt' }] }) });
    const attachments = await mailService.getAttachments('1');
    expect(Array.isArray(attachments)).toBe(true);
    expect(attachments[0]).toHaveProperty('id', 'att-1');
  });

  it('should handle throttling errors gracefully', async () => {
    client.api.mockReturnValue({
      get: jest.fn().mockRejectedValue(new Error('Graph API throttled (429)'))
    });
    await expect(mailService.getInbox({ top: 1 })).rejects.toThrow(/429/);
  });
});
