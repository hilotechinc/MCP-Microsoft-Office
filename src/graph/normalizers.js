/**
 * @fileoverview Normalization functions for Microsoft Graph API responses.
 * Follows MCP modular, testable, and consistent data contract rules.
 */

/**
 * Normalizes a Microsoft Graph email object to the MCP standard format.
 * @param {object} graphEmail - Raw email object from Graph API
 * @returns {object} Normalized email object
 */
function normalizeEmail(graphEmail) {
    if (!graphEmail || typeof graphEmail !== 'object') {
        throw new Error('Invalid email object for normalization');
    }
    return {
        id: graphEmail.id,
        type: 'email',
        subject: graphEmail.subject,
        from: graphEmail.from && graphEmail.from.emailAddress ? {
            name: graphEmail.from.emailAddress.name,
            email: graphEmail.from.emailAddress.address
        } : undefined,
        to: Array.isArray(graphEmail.toRecipients) ? graphEmail.toRecipients.map(r => ({
            name: r.emailAddress.name,
            email: r.emailAddress.address
        })) : [],
        received: graphEmail.receivedDateTime || null,
        sent: graphEmail.sentDateTime || null,
        preview: graphEmail.bodyPreview ? graphEmail.bodyPreview.substring(0, 150) : '',
        isRead: !!graphEmail.isRead,
        importance: graphEmail.importance,
        hasAttachments: !!graphEmail.hasAttachments
    };
}

/**
 * Normalizes a Microsoft Graph driveItem (file/folder) to MCP format.
 * @param {object} item - Raw driveItem from Graph API
 * @returns {object} Normalized file object
 */
function normalizeFile(item) {
    if (!item || typeof item !== 'object') throw new Error('Invalid file object for normalization');
    return {
        id: item.id,
        type: 'file',
        name: item.name,
        description: typeof item.description === 'string' ? item.description : undefined,
        size: item.size,
        isFolder: !!item.folder,
        isFile: !!item.file,
        webUrl: typeof item.webUrl === 'string' ? item.webUrl : undefined,
        parentId: item.parentReference && item.parentReference.id ? item.parentReference.id : undefined,
        lastModified: item.lastModifiedDateTime || null,
        created: item.createdDateTime || null,
        mimeType: item.file && item.file.mimeType ? item.file.mimeType : undefined,
        hasAttachments: !!item.file && !!item.file.hasAttachments
    };
}

/**
 * Normalizes a Microsoft Graph calendar event object to MCP format.
 * @param {object} event - Raw event object from Graph API
 * @returns {object} Normalized event object
 */
function normalizeEvent(event) {
    if (!event || typeof event !== 'object') throw new Error('Invalid event object for normalization');
    return {
        id: event.id,
        type: 'event',
        subject: event.subject,
        start: event.start && event.start.dateTime || null,
        end: event.end && event.end.dateTime || null,
        location: event.location && typeof event.location.displayName === 'string' ? event.location.displayName : undefined,
        organizer: event.organizer && event.organizer.emailAddress ? {
            name: event.organizer.emailAddress.name,
            email: event.organizer.emailAddress.address
        } : undefined,
        attendees: Array.isArray(event.attendees) ? event.attendees.map(a => a.emailAddress ? {
            name: a.emailAddress.name,
            email: a.emailAddress.address
        } : undefined).filter(Boolean) : [],
        isAllDay: !!event.isAllDay,
        isCancelled: !!event.isCancelled,
        isOnlineMeeting: !!event.isOnlineMeeting,
        importance: event.importance,
        webLink: typeof event.webLink === 'string' ? event.webLink : undefined,
        preview: event.bodyPreview ? event.bodyPreview.substring(0, 150) : '',
        created: event.createdDateTime || null,
        lastModified: event.lastModifiedDateTime || null
    };
}

/**
 * Normalizes a Microsoft Graph user object to MCP user profile format.
 * @param {object} user - Raw user object from Graph API
 * @returns {object} Normalized user profile
 */
function normalizeUser(user) {
    if (!user || typeof user !== 'object') throw new Error('Invalid user object for normalization');
    return {
        id: user.id,
        type: 'user',
        displayName: user.displayName,
        givenName: user.givenName,
        surname: user.surname,
        email: user.mail || user.userPrincipalName,
        jobTitle: typeof user.jobTitle === 'string' ? user.jobTitle : undefined,
        department: typeof user.department === 'string' ? user.department : undefined,
        officeLocation: typeof user.officeLocation === 'string' ? user.officeLocation : undefined,
        mobilePhone: typeof user.mobilePhone === 'string' ? user.mobilePhone : undefined,
        businessPhones: Array.isArray(user.businessPhones) ? user.businessPhones : [],
        companyName: typeof user.companyName === 'string' ? user.companyName : undefined,
        country: typeof user.country === 'string' ? user.country : undefined,
        city: typeof user.city === 'string' ? user.city : undefined,
        photo: user.photo && user.photo['@odata.mediaEditLink'] ? user.photo['@odata.mediaEditLink'] : undefined
    };

}

module.exports = {
    normalizeEmail,
    normalizeFile,
    normalizeEvent,
    normalizeUser
};
