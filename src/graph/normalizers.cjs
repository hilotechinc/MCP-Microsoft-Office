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
    const MAX_SUBJECT_LENGTH = 150;

    if (!graphEmail || typeof graphEmail !== 'object') {
        throw new Error('Invalid email object for normalization');
    }
    return {
        id: graphEmail.id,
        type: 'email',
        subject: graphEmail.subject ? (graphEmail.subject.length > MAX_SUBJECT_LENGTH ? graphEmail.subject.substring(0, MAX_SUBJECT_LENGTH) + '...' : graphEmail.subject) : '',
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
        hasAttachments: !!graphEmail.hasAttachments,
        hasInlineImages: !!(graphEmail.attachments && graphEmail.attachments.some(att => att.isInline))
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
        size: typeof item.size === 'number' ? item.size : undefined,
        isFolder: !!item.folder,
        isFile: !!item.file,
        webUrl: typeof item.webUrl === 'string' ? item.webUrl : undefined,
        parentId: item.parentReference && item.parentReference.id ? item.parentReference.id : undefined,
        lastModified: item.lastModifiedDateTime || null,
        created: item.createdDateTime || null,
        mimeType: item.file && item.file.mimeType ? item.file.mimeType : undefined,
        shared: item.shared ? {
          scope: item.shared.scope,
          owner: item.shared.owner ? {
            user: item.shared.owner.user ? {
              id: item.shared.owner.user.id,
              displayName: item.shared.owner.user.displayName
            } : undefined,
            // Add other owner types if needed (e.g., group, application)
          } : undefined,
          sharedDateTime: item.shared.sharedDateTime,
          shareId: item.shared.shareId,
          // Normalize link details if available (may vary based on link type)
          link: item.shared.link ? {
            type: item.shared.link.type,
            scope: item.shared.link.scope,
            webUrl: item.shared.link.webUrl
            // Add other link properties as needed
          } : undefined
        } : undefined,
        sharepointIds: item.sharepointIds ? {
          listId: item.sharepointIds.listId,
          listItemId: item.sharepointIds.listItemId,
          listItemUniqueId: item.sharepointIds.listItemUniqueId,
          siteId: item.sharepointIds.siteId,
          siteUrl: item.sharepointIds.siteUrl,
          tenantId: item.sharepointIds.tenantId,
          webId: item.sharepointIds.webId
        } : undefined
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
        // Keep the original format with both the dateTime and timeZone properties
        start: event.start ? {
            dateTime: event.start.dateTime || null,
            timeZone: event.start.timeZone || null
        } : null,
        end: event.end ? {
            dateTime: event.end.dateTime || null,
            timeZone: event.end.timeZone || null
        } : null,
        // Keep these for backward compatibility
        startTime: event.start && event.start.dateTime || null,
        startTimeZone: event.start && event.start.timeZone || null,
        endTime: event.end && event.end.dateTime || null,
        endTimeZone: event.end && event.end.timeZone || null,
        location: event.location ? {
            displayName: event.location.displayName,
            address: event.location.address ? JSON.stringify(event.location.address) : undefined, // Simple stringify for now
            coordinates: event.location.coordinates ? event.location.coordinates : undefined
        } : undefined,
        organizer: event.organizer && event.organizer.emailAddress ? {
            name: event.organizer.emailAddress.name,
            email: event.organizer.emailAddress.address
        } : undefined,
        attendees: event.attendees ? event.attendees.map(att => {
          if (!att || !att.emailAddress) return null;
          return {
            email: att.emailAddress.address,
            name: att.emailAddress.name,
            type: att.type, // required, optional, resource
            status: (att.status && att.status.response) ? att.status.response : 'notResponded',
            responseTime: (att.status && att.status.time) ? att.status.time : null
          };
        }).filter(Boolean) : [],
        isAllDay: !!event.isAllDay,
        isCancelled: !!event.isCancelled,
        isOnlineMeeting: !!event.isOnlineMeeting,
        onlineMeetingUrl: event.onlineMeeting ? event.onlineMeeting.joinUrl : undefined,
        recurrence: event.recurrence || undefined, // Pass recurrence object directly for now
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
 * @param {object} [options] - Normalization options
 * @param {boolean} [options.strictPrivacy=false] - If true, removes PII fields (phones, address).
 * @returns {object} Normalized user profile
 */
function normalizeUser(user, options = {}) {
    if (!user || typeof user !== 'object') throw new Error('Invalid user object for normalization');

    const { strictPrivacy = false } = options;

    const normalized = {
        id: user.id,
        type: 'user',
        displayName: user.displayName,
        givenName: user.givenName,
        surname: user.surname,
        jobTitle: user.jobTitle,
        mail: user.mail,
        userPrincipalName: user.userPrincipalName,
        // Include PII fields initially
        mobilePhone: user.mobilePhone,
        businessPhones: Array.isArray(user.businessPhones) ? user.businessPhones : [],
        streetAddress: typeof user.streetAddress === 'string' ? user.streetAddress : undefined,
        city: typeof user.city === 'string' ? user.city : undefined,
        state: typeof user.state === 'string' ? user.state : undefined,
        postalCode: typeof user.postalCode === 'string' ? user.postalCode : undefined,
        country: typeof user.country === 'string' ? user.country : undefined,
        officeLocation: user.officeLocation,
        preferredLanguage: user.preferredLanguage,
        // TODO: Consider normalizing photo differently (e.g., base64 or direct URL if possible)
        photo: user.photo && user.photo['@odata.mediaEditLink'] ? user.photo['@odata.mediaEditLink'] : undefined
        // Deprecated/removed: companyName, country, city are now conditionally removed
    };

    // TODO: Remove PII (address/phones) when `strictPrivacy` flag on.
    if (strictPrivacy) {
        delete normalized.mobilePhone;
        delete normalized.businessPhones;
        delete normalized.streetAddress;
        delete normalized.city;
        delete normalized.state;
        delete normalized.postalCode;
        delete normalized.country;
    }

    return normalized;
}

/**
 * Normalizes a Microsoft Graph person object to MCP format.
 * @param {object} person - Raw person object from Graph API
 * @returns {object} Normalized person object
 */
function normalizePerson(person) {
    if (!person || typeof person !== 'object') throw new Error('Invalid person object for normalization');
    
    // Extract primary email from scoredEmailAddresses if available
    let primaryEmail = '';
    if (Array.isArray(person.scoredEmailAddresses) && person.scoredEmailAddresses.length > 0) {
        // Sort by relevance score (highest first) and take the first one
        const sortedEmails = [...person.scoredEmailAddresses].sort((a, b) => {
            const scoreA = typeof a.relevanceScore === 'number' ? a.relevanceScore : 0;
            const scoreB = typeof b.relevanceScore === 'number' ? b.relevanceScore : 0;
            return scoreB - scoreA;
        });
        primaryEmail = sortedEmails[0].address;
    }
    
    // Extract primary phone if available
    let primaryPhone = '';
    if (Array.isArray(person.phones) && person.phones.length > 0) {
        // Prefer business phones if available
        const businessPhone = person.phones.find(p => p.type === 'business');
        primaryPhone = businessPhone ? businessPhone.number : person.phones[0].number;
    }
    
    return {
        id: person.id,
        type: 'person',
        displayName: person.displayName || '',
        givenName: person.givenName || '',
        surname: person.surname || '',
        email: primaryEmail,
        phone: primaryPhone,
        jobTitle: person.jobTitle || '',
        companyName: person.companyName || '',
        department: person.department || '',
        officeLocation: person.officeLocation || '',
        userPrincipalName: person.userPrincipalName || '',
        imAddress: person.imAddress || '',
        scoredEmailAddresses: (Array.isArray(person.scoredEmailAddresses) && person.scoredEmailAddresses.length > 0) ? person.scoredEmailAddresses.map(email => ({
            address: email.address,
            relevanceScore: typeof email.relevanceScore === 'number' ? email.relevanceScore : 0
        })) : [],
        phones: (Array.isArray(person.phones) && person.phones.length > 0) ? person.phones.map(phone => ({
            type: phone.type,
            number: phone.number
        })) : [],
        personType: person.personType ? {
            class: person.personType.class,
            subclass: person.personType.subclass
        } : { class: 'Person', subclass: 'Unknown' },
        relevanceScore: typeof person.relevanceScore === 'number' ? person.relevanceScore : 0,
        isFavorite: !!person.isFavorite
    };
}

module.exports = {
    normalizeEmail,
    normalizeFile,
    normalizeEvent,
    normalizeUser,
    normalizePerson
};
