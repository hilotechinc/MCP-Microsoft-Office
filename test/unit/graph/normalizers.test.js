/**
 * @fileoverview Unit tests for email normalization in src/graph/normalizers.js
 */
const { normalizeEmail, normalizeFile, normalizeEvent } = require('../../../src/graph/normalizers');

describe('normalizeEmail', () => {
    it('should normalize a standard Graph email object', () => {
        const graphEmail = {
            id: 'abc123',
            subject: 'Test Subject',
            from: { emailAddress: { name: 'Sender', address: 'sender@example.com' } },
            toRecipients: [
                { emailAddress: { name: 'Recipient1', address: 'r1@example.com' } },
                { emailAddress: { name: 'Recipient2', address: 'r2@example.com' } }
            ],
            receivedDateTime: '2025-04-23T08:00:00Z',
            sentDateTime: '2025-04-23T07:59:00Z',
            bodyPreview: 'This is a test email. It has some content.',
            isRead: false,
            importance: 'normal',
            hasAttachments: true
        };
        const normalized = normalizeEmail(graphEmail);
        expect(normalized).toEqual({
            id: 'abc123',
            type: 'email',
            subject: 'Test Subject',
            from: { name: 'Sender', email: 'sender@example.com' },
            to: [
                { name: 'Recipient1', email: 'r1@example.com' },
                { name: 'Recipient2', email: 'r2@example.com' }
            ],
            received: '2025-04-23T08:00:00Z',
            sent: '2025-04-23T07:59:00Z',
            preview: 'This is a test email. It has some content.',
            isRead: false,
            importance: 'normal',
            hasAttachments: true
        });
    });

    it('should handle missing optional fields gracefully', () => {
        const graphEmail = {
            id: 'xyz789',
            subject: 'No From/To',
            receivedDateTime: '2025-04-23T08:00:00Z',
            sentDateTime: '2025-04-23T07:59:00Z',
            isRead: true,
            importance: 'high',
            hasAttachments: false
        };
        const normalized = normalizeEmail(graphEmail);
        expect(normalized).toEqual({
            id: 'xyz789',
            type: 'email',
            subject: 'No From/To',
            from: undefined,
            to: [],
            received: '2025-04-23T08:00:00Z',
            sent: '2025-04-23T07:59:00Z',
            preview: '',
            isRead: true,
            importance: 'high',
            hasAttachments: false
        });
    });

    it('should throw on invalid input', () => {
        expect(() => normalizeEmail(null)).toThrow();
        expect(() => normalizeEmail('bad')).toThrow();
    });
});

describe('normalizeEvent', () => {
    it('should normalize a standard Graph event object', () => {
        const graphEvent = {
            id: 'evt1',
            subject: 'Test Event',
            start: { dateTime: '2025-04-24T09:00:00Z' },
            end: { dateTime: '2025-04-24T10:00:00Z' },
            location: { displayName: 'Room 1' },
            organizer: { emailAddress: { name: 'Org', address: 'org@example.com' } },
            attendees: [
                { emailAddress: { name: 'A1', address: 'a1@example.com' } }
            ],
            isAllDay: false,
            isCancelled: false,
            isOnlineMeeting: true,
            importance: 'normal',
            webLink: 'https://example.com/evt1',
            bodyPreview: 'This is a test event.',
            createdDateTime: '2025-04-23T08:00:00Z',
            lastModifiedDateTime: '2025-04-23T09:00:00Z'
        };
        const normalized = normalizeEvent(graphEvent);
        expect(normalized).toEqual({
            id: 'evt1',
            type: 'event',
            subject: 'Test Event',
            start: '2025-04-24T09:00:00Z',
            end: '2025-04-24T10:00:00Z',
            location: 'Room 1',
            organizer: { name: 'Org', email: 'org@example.com' },
            attendees: [ { name: 'A1', email: 'a1@example.com' } ],
            isAllDay: false,
            isCancelled: false,
            isOnlineMeeting: true,
            importance: 'normal',
            webLink: 'https://example.com/evt1',
            preview: 'This is a test event.',
            created: '2025-04-23T08:00:00Z',
            lastModified: '2025-04-23T09:00:00Z'
        });
    });

    it('should handle missing optional fields gracefully', () => {
        const graphEvent = {
            id: 'evt2',
            subject: 'No Organizer/Attendees',
            start: { dateTime: '2025-04-24T09:00:00Z' },
            end: { dateTime: '2025-04-24T10:00:00Z' },
            isAllDay: true,
            isCancelled: true,
            isOnlineMeeting: false,
            importance: 'high',
            createdDateTime: '2025-04-23T08:00:00Z',
            lastModifiedDateTime: '2025-04-23T09:00:00Z'
        };
        const normalized = normalizeEvent(graphEvent);
        expect(normalized).toEqual({
            id: 'evt2',
            type: 'event',
            subject: 'No Organizer/Attendees',
            start: '2025-04-24T09:00:00Z',
            end: '2025-04-24T10:00:00Z',
            location: undefined,
            organizer: undefined,
            attendees: [],
            isAllDay: true,
            isCancelled: true,
            isOnlineMeeting: false,
            importance: 'high',
            webLink: undefined,
            preview: '',
            created: '2025-04-23T08:00:00Z',
            lastModified: '2025-04-23T09:00:00Z'
        });
    });

    it('should throw on invalid input', () => {
        expect(() => normalizeEvent(null)).toThrow();
        expect(() => normalizeEvent('bad')).toThrow();
    });
});

describe('normalizeFile', () => {
    it('should normalize a standard Graph file object', () => {
        const graphFile = {
            id: 'file1',
            name: 'Document.docx',
            description: 'A test document',
            size: 1024,
            file: { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
            webUrl: 'https://example.com/file1',
            createdDateTime: '2025-04-22T12:00:00Z',
            lastModifiedDateTime: '2025-04-23T10:00:00Z'
        };
        const normalized = normalizeFile(graphFile);
        expect(normalized).toEqual({
            id: 'file1',
            type: 'file',
            name: 'Document.docx',
            description: 'A test document',
            size: 1024,
            isFolder: false,
            isFile: true,
            webUrl: 'https://example.com/file1',
            parentId: undefined,
            lastModified: '2025-04-23T10:00:00Z',
            created: '2025-04-22T12:00:00Z',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            hasAttachments: false
        });
    });

    it('should handle missing optional fields gracefully', () => {
        const graphFile = {
            id: 'file2',
            name: 'No Description/MimeType',
            size: 2048,
            folder: { id: 'parent2' },
            createdDateTime: '2025-04-22T12:00:00Z',
            lastModifiedDateTime: '2025-04-23T10:00:00Z'
        };
        const normalized = normalizeFile(graphFile);
        expect(normalized).toEqual({
            id: 'file2',
            type: 'file',
            name: 'No Description/MimeType',
            description: undefined,
            size: 2048,
            isFolder: true,
            isFile: false,
            webUrl: undefined,
            parentId: undefined,
            lastModified: '2025-04-23T10:00:00Z',
            created: '2025-04-22T12:00:00Z',
            mimeType: undefined,
            hasAttachments: false
        });
    });

    it('should throw on invalid input', () => {
        expect(() => normalizeFile(null)).toThrow();
        expect(() => normalizeFile('bad')).toThrow();
    });
});
