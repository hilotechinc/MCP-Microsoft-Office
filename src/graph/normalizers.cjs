/**
 * @fileoverview Normalization functions for Microsoft Graph API responses.
 * Follows MCP modular, testable, and consistent data contract rules.
 */

const MonitoringService = require('../core/monitoring-service.cjs');
const ErrorService = require('../core/error-service.cjs');

/**
 * Normalizes a Microsoft Graph email object to the MCP standard format.
 * @param {object} graphEmail - Raw email object from Graph API
 * @returns {object} Normalized email object
 */
function normalizeEmail(graphEmail) {
    const MAX_SUBJECT_LENGTH = 150;
    const startTime = Date.now();

    if (!graphEmail || typeof graphEmail !== 'object') {
        const error = ErrorService.createError(
            'graph',
            'Invalid email object for normalization',
            'error',
            {
                emailType: typeof graphEmail,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(error);
        throw error;
    }
    
    // Log debug information
    MonitoringService.debug('Normalizing email object', {
        emailId: graphEmail.id || 'unknown',
        hasAttachments: !!graphEmail.hasAttachments,
        timestamp: new Date().toISOString()
    }, 'graph');
    try {
        const normalizedEmail = {
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
        
        // Track performance metric
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('email_normalization_time', executionTime, {
            emailId: graphEmail.id || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        return normalizedEmail;
    } catch (error) {
        const mcpError = ErrorService.createError(
            'graph',
            `Failed to normalize email: ${error.message || 'Unknown error'}`,
            'error',
            {
                emailId: graphEmail.id || 'unknown',
                originalError: error.message,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);
        throw mcpError;
    }
}

/**
 * Normalizes a Microsoft Graph driveItem (file/folder) to MCP format.
 * @param {object} item - Raw driveItem from Graph API
 * @returns {object} Normalized file object
 */
function normalizeFile(item) {
    const startTime = Date.now();
    
    if (!item || typeof item !== 'object') {
        const error = ErrorService.createError(
            'graph',
            'Invalid file object for normalization',
            'error',
            {
                itemType: typeof item,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(error);
        throw error;
    }
    
    // Log debug information
    MonitoringService.debug('Normalizing file object', {
        fileId: item.id || 'unknown',
        fileName: item.name || 'unknown',
        isFolder: !!item.folder,
        timestamp: new Date().toISOString()
    }, 'graph');
    try {
        const normalizedFile = {
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
        
        // Track performance metric
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('file_normalization_time', executionTime, {
            fileId: item.id || 'unknown',
            isFolder: !!item.folder,
            timestamp: new Date().toISOString()
        });
        
        return normalizedFile;
    } catch (error) {
        const mcpError = ErrorService.createError(
            'graph',
            `Failed to normalize file: ${error.message || 'Unknown error'}`,
            'error',
            {
                fileId: item.id || 'unknown',
                fileName: item.name || 'unknown',
                originalError: error.message,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);
        throw mcpError;
    }
}

/**
 * Normalizes a Microsoft Graph calendar event object to MCP format.
 * @param {object} event - Raw event object from Graph API
 * @returns {object} Normalized event object
 */
function normalizeEvent(event) {
    const startTime = Date.now();
    
    // Enhanced validation with detailed error message
    if (!event) {
        const error = ErrorService.createError(
            'calendar',
            'Event object is null or undefined',
            'error',
            {
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(error);
        throw error;
    }
    
    if (typeof event !== 'object') {
        const error = ErrorService.createError(
            'calendar',
            `Invalid event object type: ${typeof event}`,
            'error',
            {
                eventType: typeof event,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(error);
        throw error;
    }
    
    // For debugging purposes, log the event structure
    MonitoringService.debug('Normalizing event object', {
        eventId: event.id || 'unknown',
        subject: event.subject || 'untitled',
        timestamp: new Date().toISOString()
    }, 'calendar');
    
    try {
        // Handle the case where the event is a response from Graph API or a client-side event
        const normalizedEvent = {
            id: event.id || `temp-${Date.now()}`,
            type: 'event',
            subject: event.subject || 'Untitled Event',
            
            // Normalize start/end with robust fallbacks
            start: {
                dateTime: event.start?.dateTime || (event.start || null),
                timeZone: event.start?.timeZone || 'UTC'
            },
            
            end: {
                dateTime: event.end?.dateTime || (event.end || null),
                timeZone: event.end?.timeZone || 'UTC'
            },
            
            // Backward compatibility fields with robust fallbacks
            startTime: event.start?.dateTime || (event.start || null),
            startTimeZone: event.start?.timeZone || 'UTC',
            endTime: event.end?.dateTime || (event.end || null),
            endTimeZone: event.end?.timeZone || 'UTC',
            
            // Handle location with fallbacks
            location: event.location ? {
                displayName: event.location.displayName || '',
                address: event.location.address ? 
                    (typeof event.location.address === 'string' ? 
                        event.location.address : 
                        JSON.stringify(event.location.address)) : 
                    undefined,
                coordinates: event.location.coordinates || undefined
            } : undefined,
            
            // Handle organizer with fallbacks
            organizer: event.organizer ? {
                name: event.organizer.emailAddress?.name || event.organizer.name || '',
                email: event.organizer.emailAddress?.address || event.organizer.email || ''
            } : undefined,
            
            // Handle attendees with robust parsing
            attendees: Array.isArray(event.attendees) ? 
                event.attendees.map(att => {
                    // Handle different attendee formats
                    if (!att) return null;
                    
                    // Handle direct email string format
                    if (typeof att === 'string') {
                        return {
                            email: att,
                            name: att.split('@')[0] || '',
                            type: 'required',
                            status: 'notResponded',
                            responseTime: null
                        };
                    }
                    
                    // Handle object with email property
                    if (att.email) {
                        return {
                            email: att.email,
                            name: att.name || att.email.split('@')[0] || '',
                            type: att.type || 'required',
                            status: att.status || 'notResponded',
                            responseTime: null
                        };
                    }
                    
                    // Handle Graph API format
                    if (att.emailAddress) {
                        return {
                            email: att.emailAddress.address || '',
                            name: att.emailAddress.name || '',
                            type: att.type || 'required',
                            status: (att.status?.response) || 'notResponded',
                            responseTime: (att.status?.time) || null
                        };
                    }
                    
                    return null;
                }).filter(Boolean) : 
                [],
            
            // Boolean properties with fallbacks
            isAllDay: !!event.isAllDay,
            isCancelled: !!event.isCancelled,
            isOnlineMeeting: !!event.isOnlineMeeting,
            
            // Optional properties
            onlineMeetingUrl: event.onlineMeeting?.joinUrl || event.onlineMeetingUrl,
            recurrence: event.recurrence,
            importance: event.importance || 'normal',
            webLink: event.webLink,
            
            // Handle body content
            body: event.body?.content || event.body || '',
            bodyType: event.body?.contentType || 'text',
            
            // Preview with fallbacks
            preview: event.bodyPreview ? 
                event.bodyPreview.substring(0, 150) : 
                (typeof event.body === 'string' ? 
                    event.body.substring(0, 150) : 
                    (event.body?.content ? 
                        event.body.content.substring(0, 150) : 
                        '')),
            
            // Timestamps
            created: event.createdDateTime || null,
            lastModified: event.lastModifiedDateTime || null
        };
        
        // Track performance metric
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('event_normalization_time', executionTime, {
            eventId: event.id || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        // Log success
        MonitoringService.info('Successfully normalized event', {
            eventId: event.id || 'unknown',
            subject: event.subject || 'Untitled Event',
            timestamp: new Date().toISOString()
        }, 'calendar');
        
        return normalizedEvent;
    } catch (error) {
        const mcpError = ErrorService.createError(
            'calendar',
            `Failed to normalize event: ${error.message || 'Unknown error'}`,
            'error',
            {
                eventId: event.id || 'unknown',
                subject: event.subject || 'Untitled Event',
                originalError: error.stack || error.toString(),
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);
        throw mcpError;
    }
}

/**
 * Normalizes a Microsoft Graph user object to MCP user profile format.
 * @param {object} user - Raw user object from Graph API
 * @param {object} [options] - Normalization options
 * @param {boolean} [options.strictPrivacy=false] - If true, removes PII fields (phones, address).
 * @returns {object} Normalized user profile
 */
function normalizeUser(user, options = {}) {
    const startTime = Date.now();
    
    if (!user || typeof user !== 'object') {
        const error = ErrorService.createError(
            'graph',
            'Invalid user object for normalization',
            'error',
            {
                userType: typeof user,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(error);
        throw error;
    }
    
    // Log debug information
    MonitoringService.debug('Normalizing user object', {
        userId: user.id || 'unknown',
        userPrincipalName: user.userPrincipalName || 'unknown',
        timestamp: new Date().toISOString()
    }, 'graph');
    
    try {
        const { strictPrivacy = false } = options;

        const normalized = {
            id: user.id,
            type: 'user',
            displayName: user.displayName || '',
            givenName: user.givenName || '',
            surname: user.surname || '',
            email: user.mail || user.userPrincipalName || '',
            userPrincipalName: user.userPrincipalName || '',
            jobTitle: user.jobTitle || '',
            department: user.department || '',
            mobilePhone: user.mobilePhone || '',
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

        // Remove PII (address/phones) when `strictPrivacy` flag on.
        if (strictPrivacy) {
            delete normalized.mobilePhone;
            delete normalized.businessPhones;
            delete normalized.streetAddress;
            delete normalized.city;
            delete normalized.state;
            delete normalized.postalCode;
            delete normalized.country;
            
            MonitoringService.debug('Applied privacy restrictions to user data', {
                userId: user.id || 'unknown',
                timestamp: new Date().toISOString()
            }, 'graph');
        }
        
        // Track performance metric
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('user_normalization_time', executionTime, {
            userId: user.id || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        return normalized;
    } catch (error) {
        const mcpError = ErrorService.createError(
            'graph',
            `Failed to normalize user: ${error.message || 'Unknown error'}`,
            'error',
            {
                userId: user.id || 'unknown',
                userPrincipalName: user.userPrincipalName || 'unknown',
                originalError: error.message,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);
        throw mcpError;
    }
}

/**
 * Normalizes a Microsoft Graph person object to MCP format.
 * @param {object} person - Raw person object from Graph API
 * @returns {object} Normalized person object
 */
function normalizePerson(person) {
    const startTime = Date.now();
    
    if (!person || typeof person !== 'object') {
        const error = ErrorService.createError(
            'graph',
            'Invalid person object for normalization',
            'error',
            {
                personType: typeof person,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(error);
        throw error;
    }
    
    // Log debug information
    MonitoringService.debug('Normalizing person object', {
        personId: person.id || 'unknown',
        displayName: person.displayName || 'unknown',
        timestamp: new Date().toISOString()
    }, 'graph');
    
    try {
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
        
        const normalizedPerson = {
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
        
        // Track performance metric
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('person_normalization_time', executionTime, {
            personId: person.id || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        return normalizedPerson;
    } catch (error) {
        const mcpError = ErrorService.createError(
            'graph',
            `Failed to normalize person: ${error.message || 'Unknown error'}`,
            'error',
            {
                personId: person.id || 'unknown',
                displayName: person.displayName || 'unknown',
                originalError: error.message,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);
        throw mcpError;
    }
}

module.exports = {
    normalizeEmail,
    normalizeFile,
    normalizeEvent,
    normalizeUser,
    normalizePerson
};
