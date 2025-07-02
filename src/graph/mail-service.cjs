/**
 * @fileoverview MailService - Microsoft Graph Mail API operations.
 * All methods are async, modular, and use GraphClient for requests.
 * Follows project error handling, validation, and normalization rules.
 */

const graphClientFactory = require('./graph-client.cjs');
const ErrorService = require('../core/error-service.cjs');
const MonitoringService = require('../core/monitoring-service.cjs');

// Log service initialization
MonitoringService.info('Graph Mail Service initialized', {
    serviceName: 'graph-mail-service',
    timestamp: new Date().toISOString()
}, 'graph');

/**
 * Normalizes a Graph email object to MCP schema.
 */
function normalizeEmail(graphEmail) {
  return {
    id: graphEmail.id,
    subject: graphEmail.subject,
    from: {
      name: graphEmail.from?.emailAddress?.name,
      email: graphEmail.from?.emailAddress?.address
    },
    received: graphEmail.receivedDateTime,
    preview: graphEmail.bodyPreview?.substring(0, 150),
    isRead: graphEmail.isRead,
    importance: graphEmail.importance,
    hasAttachments: graphEmail.hasAttachments
  };
}

/**
 * Retrieves inbox emails.
 * @param {object} options
 * @param {object} req - Express request object
 * @returns {Promise<Array<object>>}
 */
async function getInbox(options = {}, req) {
  const startTime = Date.now();
  
  if (process.env.NODE_ENV === 'development') {
    MonitoringService.debug('Mail getInbox operation started', {
      method: 'getInbox',
      optionKeys: Object.keys(options),
      timestamp: new Date().toISOString()
    }, 'graph');
  }
  
  try {
    const client = await graphClientFactory.createClient(req);
    const top = options.top || options.limit || 10;
    const res = await client.api(`/me/mailFolders/inbox/messages?$top=${top}`).get();
    const emails = (res.value || []).map(normalizeEmail);
    
    const executionTime = Date.now() - startTime;
    MonitoringService.trackMetric('graph_mail_get_inbox_success', executionTime, {
      service: 'graph-mail-service',
      method: 'getInbox',
      emailCount: emails.length,
      requestedTop: top,
      timestamp: new Date().toISOString()
    });
    
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug('Mail getInbox operation completed', {
        emailCount: emails.length,
        executionTimeMs: executionTime,
        timestamp: new Date().toISOString()
      }, 'graph');
    }
    
    return emails;
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    const mcpError = ErrorService.createError(
      ErrorService.CATEGORIES.API,
      `Failed to get inbox emails: ${error.message}`,
      ErrorService.SEVERITIES.ERROR,
      {
        service: 'graph-mail-service',
        method: 'getInbox',
        requestedTop: options.top || options.limit || 10,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    );
    
    MonitoringService.logError(mcpError);
    MonitoringService.trackMetric('graph_mail_get_inbox_failure', executionTime, {
      service: 'graph-mail-service',
      method: 'getInbox',
      errorType: error.code || 'unknown',
      timestamp: new Date().toISOString()
    });
    
    throw mcpError;
  }
}

/**
 * Searches emails by query string using Microsoft Graph KQL syntax.
 * @param {string} query - KQL search query (e.g., "from:user@domain.com subject:meeting")
 * @param {object} options
 * @param {object} req - Express request object
 * @returns {Promise<Array<object>>}
 */
async function searchEmails(query, options = {}, req) {
  const startTime = Date.now();
  
  // Always log detailed information about the search operation regardless of environment
  MonitoringService.debug('Mail searchEmails operation started', {
    method: 'searchEmails',
    query: query, // Log the actual query for debugging
    queryLength: query ? query.length : 0,
    options: JSON.stringify(options),
    optionKeys: Object.keys(options),
    hasReq: !!req,
    hasReqUser: req && !!req.user,
    timestamp: new Date().toISOString()
  }, 'graph');
  
  try {
    if (!query || typeof query !== 'string') {
      const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.VALIDATION,
        'Search query must be a non-empty string',
        ErrorService.SEVERITIES.WARNING,
        {
          service: 'graph-mail-service',
          method: 'searchEmails',
          queryType: typeof query,
          timestamp: new Date().toISOString()
        }
      );
      MonitoringService.logError(mcpError);
      throw mcpError;
    }
    
    // Log authentication details (safely)
    MonitoringService.debug('Authentication context for mail search', {
      hasReq: !!req,
      hasReqUser: req && !!req.user,
      userIdFormat: req && req.user ? typeof req.user.userId : 'undefined',
      timestamp: new Date().toISOString()
    }, 'graph');
    
    // Log the attempt to create a Graph client
    MonitoringService.debug('Creating Graph client for mail search', {
      timestamp: new Date().toISOString()
    }, 'graph');
    
    const client = await graphClientFactory.createClient(req);
    
    MonitoringService.debug('Graph client created successfully', {
      clientType: client ? typeof client : 'undefined',
      hasApiMethod: client && typeof client.api === 'function',
      timestamp: new Date().toISOString()
    }, 'graph');
    
    const top = options.top || options.limit || 10;
    
    // Format the query for KQL syntax according to Microsoft Graph API requirements
    // Microsoft Graph KQL syntax doesn't use colons or equals signs, but uses specific operators
    let cleanQuery = query.trim();
    
    // If the query is wrapped in quotes, remove them to avoid double-wrapping
    if (cleanQuery.startsWith('"') && cleanQuery.endsWith('"')) {
      cleanQuery = cleanQuery.slice(1, -1);
    }
    
    // Fix common KQL syntax issues
    // 1. For property:value format, we need to use proper KQL syntax
    // KQL uses simple terms for most searches, not property:value format
    // For example, 'from:Christie' should just be 'Christie'
    
    // For specific property searches, we need to use proper KQL operators
    // Extract property:value pairs and convert to proper KQL
    if (cleanQuery.match(/([\w]+):(\S+)/)) {
      // For 'from:value', convert to just the value as KQL doesn't use property specifiers in $search
      cleanQuery = cleanQuery.replace(/from:(\S+)/gi, '$1');
      
      // For 'subject:value', convert to just the value
      cleanQuery = cleanQuery.replace(/subject:(\S+)/gi, '$1');
      
      // For date-based searches, we can't use them in $search parameter
      // Instead, we should use $filter parameter, but for now just simplify
      cleanQuery = cleanQuery.replace(/received:(\S+)/gi, '$1');
    }
    
    // Log the transformed query
    MonitoringService.debug('Transformed KQL query', {
      originalQuery: query,
      transformedQuery: cleanQuery,
      timestamp: new Date().toISOString()
    }, 'graph');
    
    // Build the search URL with proper KQL syntax
    const searchUrl = `/me/messages?$search=${encodeURIComponent(cleanQuery)}&$top=${top}`;
    
    MonitoringService.debug('Executing mail search with KQL', {
      originalQuery: query,
      cleanedQuery: cleanQuery,
      searchUrl: searchUrl.replace(/&/g, '&'), // For logging readability
      timestamp: new Date().toISOString()
    }, 'graph');
  
    // Log the API call attempt
    MonitoringService.debug('Making Graph API call for mail search', {
      searchUrl,
      timestamp: new Date().toISOString()
    }, 'graph');
    
    const res = await client.api(searchUrl).get();
    
    // Log the raw response for debugging
    MonitoringService.debug('Graph API search response received', {
      status: 'success',
      hasValue: !!res.value,
      valueLength: res.value ? res.value.length : 0,
      responseKeys: Object.keys(res),
      timestamp: new Date().toISOString()
    }, 'graph');
    
    const emails = (res.value || []).map(normalizeEmail);
    
    const executionTime = Date.now() - startTime;
    MonitoringService.trackMetric('graph_mail_search_emails_success', executionTime, {
      service: 'graph-mail-service',
      method: 'searchEmails',
      queryLength: query.length,
      resultCount: emails.length,
      requestedTop: top,
      timestamp: new Date().toISOString()
    });
    
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug('Mail searchEmails operation completed', {
        queryLength: query.length,
        resultCount: emails.length,
        executionTimeMs: executionTime,
        timestamp: new Date().toISOString()
      }, 'graph');
    }
    
    return emails;
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    // Enhanced error logging with detailed diagnostic information
    MonitoringService.error('Mail search operation failed', {
      errorMessage: error.message,
      errorName: error.name,
      errorCode: error.code || error.statusCode,
      errorBody: error.body || null,
      errorResponse: error.response || null,
      query: query,
      options: JSON.stringify(options),
      hasReq: !!req,
      hasReqUser: req && !!req.user,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }, 'graph');
    
    // If it's already an MCP error, just track metrics and rethrow
    if (error.category) {
      MonitoringService.trackMetric('graph_mail_search_emails_failure', executionTime, {
        service: 'graph-mail-service',
        method: 'searchEmails',
        errorType: error.code || 'validation_error',
        errorMessage: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
    
    const mcpError = ErrorService.createError(
      ErrorService.CATEGORIES.API,
      `Failed to search emails: ${error.message}`,
      ErrorService.SEVERITIES.ERROR,
      {
        service: 'graph-mail-service',
        method: 'searchEmails',
        query,
        requestedTop: options.top || options.limit || 10,
        errorName: error.name,
        errorCode: error.code || error.statusCode,
        errorBody: error.body || null,
        errorResponse: error.response || null,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    );
    
    MonitoringService.logError(mcpError);
    MonitoringService.trackMetric('graph_mail_search_emails_failure', executionTime, {
      service: 'graph-mail-service',
      method: 'searchEmails',
      errorType: error.code || 'unknown',
      errorMessage: error.message,
      timestamp: new Date().toISOString()
    });
    
    throw mcpError;
  }
}

/**
 * Sends an email.
 * @param {object} emailData
 * @param {object} req - Express request object
 * @returns {Promise<boolean>}
 */
async function sendEmail(emailData, req) {
  const startTime = Date.now();
  
  if (process.env.NODE_ENV === 'development') {
    MonitoringService.debug('Mail sendEmail operation started', {
      method: 'sendEmail',
      hasAttachments: emailData.attachments && Array.isArray(emailData.attachments),
      attachmentCount: emailData.attachments ? emailData.attachments.length : 0,
      timestamp: new Date().toISOString()
    }, 'graph');
  }
  
  try {
    const client = await graphClientFactory.createClient(req);
    const { to, subject, body, cc, bcc, contentType, attachments } = emailData;
    
    // Handle recipients in various formats (string or array)
    function formatRecipients(recipients) {
      if (!recipients) return [];
      
      // Convert string to array if needed
      const recipientArray = Array.isArray(recipients) ? recipients : [recipients];
      
      // Format each recipient
      return recipientArray.map(recipient => ({
        emailAddress: { address: recipient }
      }));
    }
    
    const message = {
      subject,
      body: {
        contentType: contentType || 'Text',
        content: body
      },
      toRecipients: formatRecipients(to),
      ccRecipients: formatRecipients(cc),
      bccRecipients: formatRecipients(bcc)
    };
    
    // Add attachments if provided
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Processing email attachments', {
          attachmentCount: attachments.length,
          timestamp: new Date().toISOString()
        }, 'graph');
      }
      
      // Process attachments asynchronously
      const processedAttachments = await Promise.all(attachments.map(async attachment => {
        try {
          // Check if attachment is a file ID (string) or an attachment object
          if (typeof attachment === 'string') {
            if (process.env.NODE_ENV === 'development') {
              MonitoringService.debug('Processing file attachment by ID', {
                fileId: attachment,
                timestamp: new Date().toISOString()
              }, 'graph');
            }
            // This is a file ID from the files service
            // We need to get the file content from the files service
            try {
              // Import the files service
              const filesService = require('./files-service.cjs');
              
              // Get the file metadata and content
              const fileMetadata = await filesService.getFileMetadata(attachment, req);
              const fileContent = await filesService.getFileContent(attachment, req);
              
              if (!fileMetadata || !fileContent) {
                MonitoringService.warn('Could not retrieve file for email attachment', {
                  fileId: attachment,
                  hasMetadata: !!fileMetadata,
                  hasContent: !!fileContent,
                  timestamp: new Date().toISOString()
                }, 'graph');
                return null;
              }
              
              if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('Retrieved file for email attachment', {
                  fileName: fileMetadata.name,
                  fileSize: fileContent.length,
                  timestamp: new Date().toISOString()
                }, 'graph');
              }
              
              // Convert file content to base64
              const contentBytes = Buffer.from(fileContent).toString('base64');
              
              return {
                '@odata.type': '#microsoft.graph.fileAttachment',
                name: fileMetadata.name,
                contentType: fileMetadata.contentType || 'application/octet-stream',
                contentBytes: contentBytes,
                isInline: false
              };
            } catch (fileError) {
              const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.API,
                `Error retrieving file for email attachment: ${fileError.message}`,
                ErrorService.SEVERITIES.WARNING,
                {
                  service: 'graph-mail-service',
                  method: 'sendEmail',
                  fileId: attachment,
                  stack: fileError.stack,
                  timestamp: new Date().toISOString()
                }
              );
              MonitoringService.logError(mcpError);
              return null;
            }
          }
          
          // Handle attachment object
          // Check if we have contentBytes or need to convert from content
          let contentBytes = attachment.contentBytes;
          
          // If we have content but not contentBytes, convert content to base64
          if (!contentBytes && attachment.content) {
            if (process.env.NODE_ENV === 'development') {
              MonitoringService.debug('Converting content to contentBytes for attachment', {
                attachmentName: attachment.name,
                timestamp: new Date().toISOString()
              }, 'graph');
            }
            contentBytes = Buffer.from(attachment.content).toString('base64');
          }
          
          // Ensure contentBytes is properly formatted - must be a valid base64 string
          if (contentBytes && typeof contentBytes === 'string') {
            // Make sure it's properly padded base64
            const paddingNeeded = contentBytes.length % 4;
            if (paddingNeeded > 0) {
              contentBytes += '='.repeat(4 - paddingNeeded);
            }
          }
          
          // Ensure we have all required fields for a valid attachment
          if (!contentBytes || !attachment.name || !attachment.contentType) {
            MonitoringService.warn('Invalid attachment missing required fields', {
              hasName: !!attachment.name,
              hasContentType: !!attachment.contentType,
              hasContentBytes: !!contentBytes,
              timestamp: new Date().toISOString()
            }, 'graph');
            return null; // Skip invalid attachments
          }
          
          return {
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: attachment.name,
            contentType: attachment.contentType,
            contentBytes: contentBytes,
            isInline: attachment.isInline || false
          };
        } catch (attachmentError) {
          const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.SYSTEM,
            `Error processing email attachment: ${attachmentError.message}`,
            ErrorService.SEVERITIES.WARNING,
            {
              service: 'graph-mail-service',
              method: 'sendEmail',
              attachmentName: attachment.name || 'unknown',
              stack: attachmentError.stack,
              timestamp: new Date().toISOString()
            }
          );
          MonitoringService.logError(mcpError);
          return null;
        }
      }));
      
      // Filter out null entries from invalid attachments
      message.attachments = processedAttachments.filter(Boolean);
      
      MonitoringService.trackMetric('graph_mail_attachments_processed', Date.now() - startTime, {
        originalCount: attachments.length,
        validCount: message.attachments.length,
        timestamp: new Date().toISOString()
      });
      
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Email attachments processed', {
          originalCount: attachments.length,
          validCount: message.attachments.length,
          timestamp: new Date().toISOString()
        }, 'graph');
      }
    }

    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug('Sending email via Graph API', {
        hasSubject: !!message.subject,
        toCount: message.toRecipients ? message.toRecipients.length : 0,
        ccCount: message.ccRecipients ? message.ccRecipients.length : 0,
        bccCount: message.bccRecipients ? message.bccRecipients.length : 0,
        attachmentCount: message.attachments ? message.attachments.length : 0,
        contentType: message.body.contentType,
        timestamp: new Date().toISOString()
      }, 'graph');
    }
    
    // Explicitly set saveToSentItems to true to ensure the email is saved with attachments
    // Also explicitly set the hasAttachments flag if we have attachments
    if (message.attachments && message.attachments.length > 0) {
      // Microsoft Graph API uses 'hasAttachments' (not 'isHasAttachments')
      message.hasAttachments = true;
    }
    
    const requestBody = {
      message,
      saveToSentItems: true
    };
    
    await client.api('/me/sendMail').post(requestBody);
    
    const executionTime = Date.now() - startTime;
    MonitoringService.trackMetric('graph_mail_send_email_success', executionTime, {
      service: 'graph-mail-service',
      method: 'sendEmail',
      toCount: message.toRecipients ? message.toRecipients.length : 0,
      ccCount: message.ccRecipients ? message.ccRecipients.length : 0,
      bccCount: message.bccRecipients ? message.bccRecipients.length : 0,
      attachmentCount: message.attachments ? message.attachments.length : 0,
      contentType: message.body.contentType,
      timestamp: new Date().toISOString()
    });
    
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug('Email sent successfully via Graph API', {
        executionTimeMs: executionTime,
        timestamp: new Date().toISOString()
      }, 'graph');
    }
    
    return true;
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    const mcpError = ErrorService.createError(
      ErrorService.CATEGORIES.API,
      `Failed to send email: ${error.message}`,
      ErrorService.SEVERITIES.ERROR,
      {
        service: 'graph-mail-service',
        method: 'sendEmail',
        hasSubject: emailData.subject && emailData.subject.length > 0,
        hasTo: emailData.to && emailData.to.length > 0,
        attachmentCount: emailData.attachments ? emailData.attachments.length : 0,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    );
    
    MonitoringService.logError(mcpError);
    MonitoringService.trackMetric('graph_mail_send_email_failure', executionTime, {
      service: 'graph-mail-service',
      method: 'sendEmail',
      errorType: error.code || 'unknown',
      timestamp: new Date().toISOString()
    });
    
    throw mcpError;
  }
}

/**
 * Flags/unflag an email.
 * @param {string} id - Email ID
 * @param {boolean} flag - Flag state
 * @param {object} req - Express request object
 * @returns {Promise<boolean>}
 */
async function flagEmail(id, flag = true, req) {
  const startTime = Date.now();
  
  if (process.env.NODE_ENV === 'development') {
    MonitoringService.debug('Mail flagEmail operation started', {
      method: 'flagEmail',
      emailId: id,
      flagState: flag,
      timestamp: new Date().toISOString()
    }, 'graph');
  }
  
  try {
    if (!id || typeof id !== 'string') {
      const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.VALIDATION,
        'Email ID must be a non-empty string',
        ErrorService.SEVERITIES.WARNING,
        {
          service: 'graph-mail-service',
          method: 'flagEmail',
          idType: typeof id,
          timestamp: new Date().toISOString()
        }
      );
      MonitoringService.logError(mcpError);
      throw mcpError;
    }
    
    const client = await graphClientFactory.createClient(req);
    await client.api(`/me/messages/${id}`).patch({
      flag: { flagStatus: flag ? 'flagged' : 'notFlagged' }
    });
    
    const executionTime = Date.now() - startTime;
    MonitoringService.trackMetric('graph_mail_flag_email_success', executionTime, {
      service: 'graph-mail-service',
      method: 'flagEmail',
      flagState: flag,
      timestamp: new Date().toISOString()
    });
    
    return true;
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    // If it's already an MCP error, just track metrics and rethrow
    if (error.category) {
      MonitoringService.trackMetric('graph_mail_flag_email_failure', executionTime, {
        service: 'graph-mail-service',
        method: 'flagEmail',
        errorType: error.code || 'validation_error',
        timestamp: new Date().toISOString()
      });
      throw error;
    }
    
    const mcpError = ErrorService.createError(
      ErrorService.CATEGORIES.API,
      `Failed to flag email: ${error.message}`,
      ErrorService.SEVERITIES.ERROR,
      {
        service: 'graph-mail-service',
        method: 'flagEmail',
        emailId: id,
        flagState: flag,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    );
    
    MonitoringService.logError(mcpError);
    MonitoringService.trackMetric('graph_mail_flag_email_failure', executionTime, {
      service: 'graph-mail-service',
      method: 'flagEmail',
      errorType: error.code || 'unknown',
      timestamp: new Date().toISOString()
    });
    
    throw mcpError;
  }
}

/**
 * Retrieves attachments for an email.
 * @param {string} id
 * @param {object} req - Express request object
 * @returns {Promise<Array<object>>}
 */
async function getAttachments(id, req) {
  const startTime = Date.now();
  
  if (process.env.NODE_ENV === 'development') {
    MonitoringService.debug('Mail getAttachments operation started', {
      method: 'getAttachments',
      emailId: id,
      timestamp: new Date().toISOString()
    }, 'graph');
  }
  
  try {
    if (!id || typeof id !== 'string') {
      const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.VALIDATION,
        'Email ID must be a non-empty string',
        ErrorService.SEVERITIES.WARNING,
        {
          service: 'graph-mail-service',
          method: 'getAttachments',
          idType: typeof id,
          timestamp: new Date().toISOString()
        }
      );
      MonitoringService.logError(mcpError);
      throw mcpError;
    }
    
    const client = await graphClientFactory.createClient(req);
    
    // First check if the email exists and has attachments
    try {
      const emailDetails = await client.api(`/me/messages/${id}`).get();
      
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Email metadata retrieved for attachments check', {
          emailId: id,
          hasAttachments: emailDetails.hasAttachments,
          timestamp: new Date().toISOString()
        }, 'graph');
      }
      
      // If the email doesn't have attachments according to metadata, return empty array early
      if (!emailDetails.hasAttachments) {
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('graph_mail_get_attachments_no_attachments', executionTime, {
          service: 'graph-mail-service',
          method: 'getAttachments',
          timestamp: new Date().toISOString()
        });
        return [];
      }
    } catch (metadataError) {
      MonitoringService.warn('Error checking email metadata for attachments', {
        emailId: id,
        error: metadataError.message,
        timestamp: new Date().toISOString()
      }, 'graph');
      // Continue anyway to try getting attachments directly
    }
    
    // Use $select to ensure we get all attachment properties
    const res = await client.api(`/me/messages/${id}/attachments`).get();
    
    const attachments = res.value || [];
    
    if (process.env.NODE_ENV === 'development' && attachments.length > 0) {
      // Log attachment details for debugging
      attachments.forEach(attachment => {
        MonitoringService.debug('Email attachment found', {
          emailId: id,
          attachmentName: attachment.name,
          contentType: attachment.contentType,
          size: attachment.size || 'unknown',
          timestamp: new Date().toISOString()
        }, 'graph');
      });
    }
    
    const normalizedAttachments = attachments.map(attachment => ({
      id: attachment.id,
      name: attachment.name,
      contentType: attachment.contentType,
      size: attachment.size || 0,
      isInline: attachment.isInline || false,
      lastModifiedDateTime: attachment.lastModifiedDateTime || new Date().toISOString()
    }));
    
    const executionTime = Date.now() - startTime;
    MonitoringService.trackMetric('graph_mail_get_attachments_success', executionTime, {
      service: 'graph-mail-service',
      method: 'getAttachments',
      attachmentCount: normalizedAttachments.length,
      timestamp: new Date().toISOString()
    });
    
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug('Mail getAttachments operation completed', {
        emailId: id,
        attachmentCount: normalizedAttachments.length,
        executionTimeMs: executionTime,
        timestamp: new Date().toISOString()
      }, 'graph');
    }
    
    return normalizedAttachments;
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    // If it's already an MCP error, just track metrics and rethrow
    if (error.category) {
      MonitoringService.trackMetric('graph_mail_get_attachments_failure', executionTime, {
        service: 'graph-mail-service',
        method: 'getAttachments',
        errorType: error.code || 'validation_error',
        timestamp: new Date().toISOString()
      });
      throw error;
    }
    
    const mcpError = ErrorService.createError(
      ErrorService.CATEGORIES.API,
      `Failed to get email attachments: ${error.message}`,
      ErrorService.SEVERITIES.ERROR,
      {
        service: 'graph-mail-service',
        method: 'getAttachments',
        emailId: id,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    );
    
    MonitoringService.logError(mcpError);
    MonitoringService.trackMetric('graph_mail_get_attachments_failure', executionTime, {
      service: 'graph-mail-service',
      method: 'getAttachments',
      errorType: error.code || 'unknown',
      timestamp: new Date().toISOString()
    });
    
    throw mcpError;
  }
}

/**
 * Retrieves raw inbox data (no normalization).
 * @param {object} options
 * @param {object} req - Express request object
 * @returns {Promise<Array<object>>}
 */
async function getInboxRaw(options = {}, req) {
  const startTime = Date.now();
  
  try {
    const client = await graphClientFactory.createClient(req);
    const top = options.top || options.limit || 10;
    const res = await client.api(`/me/mailFolders/inbox/messages?$top=${top}`).get();
    const emails = res.value || [];
    
    const executionTime = Date.now() - startTime;
    MonitoringService.trackMetric('graph_mail_get_inbox_raw_success', executionTime, {
      service: 'graph-mail-service',
      method: 'getInboxRaw',
      emailCount: emails.length,
      timestamp: new Date().toISOString()
    });
    
    return emails;
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    const mcpError = ErrorService.createError(
      ErrorService.CATEGORIES.API,
      `Failed to get raw inbox data: ${error.message}`,
      ErrorService.SEVERITIES.ERROR,
      {
        service: 'graph-mail-service',
        method: 'getInboxRaw',
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    );
    
    MonitoringService.logError(mcpError);
    MonitoringService.trackMetric('graph_mail_get_inbox_raw_failure', executionTime, {
      service: 'graph-mail-service',
      method: 'getInboxRaw',
      errorType: error.code || 'unknown',
      timestamp: new Date().toISOString()
    });
    
    throw mcpError;
  }
}

/**
 * Retrieves detailed information for a specific email by ID.
 * @param {string} id - Email ID
 * @param {object} req - Express request object
 * @returns {Promise<object>}
 */
async function getEmailDetails(id, req) {
  const startTime = Date.now();
  
  try {
    if (!id || typeof id !== 'string') {
      const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.VALIDATION,
        'Email ID must be a non-empty string',
        ErrorService.SEVERITIES.WARNING,
        {
          service: 'graph-mail-service',
          method: 'getEmailDetails',
          idType: typeof id,
          timestamp: new Date().toISOString()
        }
      );
      MonitoringService.logError(mcpError);
      throw mcpError;
    }
    
    const client = await graphClientFactory.createClient(req);
    const message = await client.api(`/me/messages/${id}`).get();
    
    if (!message) {
      const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.API,
        `No message found with ID: ${id}`,
        ErrorService.SEVERITIES.WARNING,
        {
          service: 'graph-mail-service',
          method: 'getEmailDetails',
          emailId: id,
          timestamp: new Date().toISOString()
        }
      );
      MonitoringService.logError(mcpError);
      throw mcpError;
    }
    
    const emailDetails = {
      id: message.id,
      subject: message.subject,
      from: {
        name: message.from?.emailAddress?.name,
        email: message.from?.emailAddress?.address
      },
      to: message.toRecipients?.map(r => ({
        name: r.emailAddress?.name,
        email: r.emailAddress?.address
      })) || [],
      cc: message.ccRecipients?.map(r => ({
        name: r.emailAddress?.name,
        email: r.emailAddress?.address
      })) || [],
      bcc: message.bccRecipients?.map(r => ({
        name: r.emailAddress?.name,
        email: r.emailAddress?.address
      })) || [],
      body: message.body?.content,
      contentType: message.body?.contentType,
      received: message.receivedDateTime,
      sent: message.sentDateTime,
      isRead: message.isRead,
      importance: message.importance,
      hasAttachments: message.hasAttachments,
      categories: message.categories || []
    };
    
    const executionTime = Date.now() - startTime;
    MonitoringService.trackMetric('graph_mail_get_email_details_success', executionTime, {
      service: 'graph-mail-service',
      method: 'getEmailDetails',
      hasAttachments: emailDetails.hasAttachments,
      timestamp: new Date().toISOString()
    });
    
    return emailDetails;
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    // If it's already an MCP error, just track metrics and rethrow
    if (error.category) {
      MonitoringService.trackMetric('graph_mail_get_email_details_failure', executionTime, {
        service: 'graph-mail-service',
        method: 'getEmailDetails',
        errorType: error.code || 'validation_error',
        timestamp: new Date().toISOString()
      });
      throw error;
    }
    
    const mcpError = ErrorService.createError(
      ErrorService.CATEGORIES.API,
      `Failed to get email details: ${error.message}`,
      ErrorService.SEVERITIES.ERROR,
      {
        service: 'graph-mail-service',
        method: 'getEmailDetails',
        emailId: id,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    );
    
    MonitoringService.logError(mcpError);
    MonitoringService.trackMetric('graph_mail_get_email_details_failure', executionTime, {
      service: 'graph-mail-service',
      method: 'getEmailDetails',
      errorType: error.code || 'unknown',
      timestamp: new Date().toISOString()
    });
    
    throw mcpError;
  }
}

/**
 * Marks an email as read.
 * @param {string} id - Email ID
 * @param {boolean} isRead - Read status to set
 * @param {object} req - Express request object
 * @returns {Promise<boolean>}
 */
async function markAsRead(id, isRead = true, req) {
  const startTime = Date.now();
  
  try {
    if (!id || typeof id !== 'string') {
      const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.VALIDATION,
        'Email ID must be a non-empty string',
        ErrorService.SEVERITIES.WARNING,
        {
          service: 'graph-mail-service',
          method: 'markAsRead',
          idType: typeof id,
          timestamp: new Date().toISOString()
        }
      );
      MonitoringService.logError(mcpError);
      throw mcpError;
    }
    
    const client = await graphClientFactory.createClient(req);
    await client.api(`/me/messages/${id}`).patch({
      isRead
    });
    
    const executionTime = Date.now() - startTime;
    MonitoringService.trackMetric('graph_mail_mark_as_read_success', executionTime, {
      service: 'graph-mail-service',
      method: 'markAsRead',
      isRead,
      timestamp: new Date().toISOString()
    });
    
    return true;
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    // If it's already an MCP error, just track metrics and rethrow
    if (error.category) {
      MonitoringService.trackMetric('graph_mail_mark_as_read_failure', executionTime, {
        service: 'graph-mail-service',
        method: 'markAsRead',
        errorType: error.code || 'validation_error',
        timestamp: new Date().toISOString()
      });
      throw error;
    }
    
    const mcpError = ErrorService.createError(
      ErrorService.CATEGORIES.API,
      `Failed to mark email as read: ${error.message}`,
      ErrorService.SEVERITIES.ERROR,
      {
        service: 'graph-mail-service',
        method: 'markAsRead',
        emailId: id,
        isRead,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    );
    
    MonitoringService.logError(mcpError);
    MonitoringService.trackMetric('graph_mail_mark_as_read_failure', executionTime, {
      service: 'graph-mail-service',
      method: 'markAsRead',
      errorType: error.code || 'unknown',
      timestamp: new Date().toISOString()
    });
    
    throw mcpError;
  }
}

/**
 * Add an attachment to an existing email message.
 * @param {string} messageId - ID of the email message
 * @param {object} attachment - Attachment data
 * @param {string} attachment.name - Name of the attachment
 * @param {string} attachment.contentType - MIME type of the attachment
 * @param {string} attachment.contentBytes - Base64 encoded content
 * @param {boolean} [attachment.isInline=false] - Whether the attachment is inline
 * @param {object} req - Express request object
 * @returns {Promise<object>} Created attachment object
 */
async function addMailAttachment(messageId, attachment, req) {
  const startTime = Date.now();
  
  try {
    if (!messageId || typeof messageId !== 'string') {
      const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.VALIDATION,
        'Message ID must be a non-empty string',
        ErrorService.SEVERITIES.WARNING,
        {
          service: 'graph-mail-service',
          method: 'addMailAttachment',
          messageIdType: typeof messageId,
          timestamp: new Date().toISOString()
        }
      );
      MonitoringService.logError(mcpError);
      throw mcpError;
    }
    
    if (!attachment || !attachment.name || !attachment.contentBytes) {
      const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.VALIDATION,
        'Attachment must have name and contentBytes',
        ErrorService.SEVERITIES.WARNING,
        {
          service: 'graph-mail-service',
          method: 'addMailAttachment',
          hasName: !!attachment?.name,
          hasContentBytes: !!attachment?.contentBytes,
          timestamp: new Date().toISOString()
        }
      );
      MonitoringService.logError(mcpError);
      throw mcpError;
    }
    
    const client = await graphClientFactory.createClient(req);
    
    // Prepare the attachment object for Microsoft Graph API
    const attachmentData = {
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: attachment.name,
      contentBytes: attachment.contentBytes,
      contentType: attachment.contentType || 'application/octet-stream',
      isInline: attachment.isInline || false
    };
    
    MonitoringService.debug('Adding attachment to email', {
      messageId: messageId,
      attachmentName: attachment.name,
      contentType: attachmentData.contentType,
      isInline: attachmentData.isInline,
      timestamp: new Date().toISOString()
    }, 'graph-mail-service');
    
    // Add the attachment to the message
    const result = await client.api(`/me/messages/${messageId}/attachments`).post(attachmentData);
    
    const executionTime = Date.now() - startTime;
    MonitoringService.trackMetric('graph_mail_add_attachment_success', executionTime, {
      service: 'graph-mail-service',
      method: 'addMailAttachment',
      attachmentName: attachment.name,
      timestamp: new Date().toISOString()
    });
    
    MonitoringService.info('Successfully added attachment to email', {
      messageId: messageId,
      attachmentId: result.id,
      attachmentName: result.name,
      executionTime: executionTime,
      timestamp: new Date().toISOString()
    }, 'graph-mail-service');
    
    return result;
    
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    const mcpError = ErrorService.createError(
      ErrorService.CATEGORIES.GRAPH,
      `Failed to add attachment to email: ${error.message}`,
      ErrorService.SEVERITIES.ERROR,
      {
        service: 'graph-mail-service',
        method: 'addMailAttachment',
        messageId: messageId,
        attachmentName: attachment?.name,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    );
    
    MonitoringService.logError(mcpError);
    MonitoringService.trackMetric('graph_mail_add_attachment_failure', executionTime, {
      service: 'graph-mail-service',
      method: 'addMailAttachment',
      errorType: error.code || 'unknown',
      timestamp: new Date().toISOString()
    });
    
    throw mcpError;
  }
}

/**
 * Remove an attachment from an existing email message.
 * @param {string} messageId - ID of the email message
 * @param {string} attachmentId - ID of the attachment to remove
 * @param {object} req - Express request object
 * @returns {Promise<object>} Success status
 */
async function removeMailAttachment(messageId, attachmentId, req) {
  const startTime = Date.now();
  
  try {
    if (!messageId || typeof messageId !== 'string') {
      const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.VALIDATION,
        'Message ID must be a non-empty string',
        ErrorService.SEVERITIES.WARNING,
        {
          service: 'graph-mail-service',
          method: 'removeMailAttachment',
          messageIdType: typeof messageId,
          timestamp: new Date().toISOString()
        }
      );
      MonitoringService.logError(mcpError);
      throw mcpError;
    }
    
    if (!attachmentId || typeof attachmentId !== 'string') {
      const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.VALIDATION,
        'Attachment ID must be a non-empty string',
        ErrorService.SEVERITIES.WARNING,
        {
          service: 'graph-mail-service',
          method: 'removeMailAttachment',
          attachmentIdType: typeof attachmentId,
          timestamp: new Date().toISOString()
        }
      );
      MonitoringService.logError(mcpError);
      throw mcpError;
    }
    
    const client = await graphClientFactory.createClient(req);
    
    MonitoringService.info('Attempting to remove attachment from email', {
      messageId: messageId,
      attachmentId: attachmentId,
      encodedAttachmentId: encodeURIComponent(attachmentId),
      apiPath: `/me/messages/${messageId}/attachments/${encodeURIComponent(attachmentId)}`,
      timestamp: new Date().toISOString()
    }, 'graph-mail-service');
    
    // URL encode the attachment ID to handle special characters
    const encodedAttachmentId = encodeURIComponent(attachmentId);
    
    MonitoringService.debug('Attempting to remove attachment', {
      messageId: messageId,
      attachmentId: attachmentId,
      encodedAttachmentId: encodedAttachmentId,
      apiPath: `/me/messages/${messageId}/attachments/${encodedAttachmentId}`,
      timestamp: new Date().toISOString()
    }, 'graph-mail-service');
    
    // Remove the attachment from the message
    try {
      const deleteResponse = await client.api(`/me/messages/${messageId}/attachments/${encodedAttachmentId}`).delete();
      MonitoringService.info('Graph API delete response received', {
        messageId: messageId,
        attachmentId: attachmentId,
        response: deleteResponse,
        timestamp: new Date().toISOString()
      }, 'graph-mail-service');
    } catch (graphError) {
      MonitoringService.error('Graph API delete request failed', {
        messageId: messageId,
        attachmentId: attachmentId,
        encodedAttachmentId: encodedAttachmentId,
        apiPath: `/me/messages/${messageId}/attachments/${encodedAttachmentId}`,
        error: graphError.message,
        statusCode: graphError.statusCode || graphError.code,
        errorDetails: graphError.body || graphError.response || graphError,
        timestamp: new Date().toISOString()
      }, 'graph-mail-service');
      throw graphError;
    }
    
    const executionTime = Date.now() - startTime;
    MonitoringService.trackMetric('graph_mail_remove_attachment_success', executionTime, {
      service: 'graph-mail-service',
      method: 'removeMailAttachment',
      timestamp: new Date().toISOString()
    });
    
    MonitoringService.info('Successfully removed attachment from email', {
      messageId: messageId,
      attachmentId: attachmentId,
      executionTime: executionTime,
      timestamp: new Date().toISOString()
    }, 'graph-mail-service');
    
    return { success: true, messageId, attachmentId };
    
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    const mcpError = ErrorService.createError(
      ErrorService.CATEGORIES.GRAPH,
      `Failed to remove attachment from email: ${error.message}`,
      ErrorService.SEVERITIES.ERROR,
      {
        service: 'graph-mail-service',
        method: 'removeMailAttachment',
        messageId: messageId,
        attachmentId: attachmentId,
        encodedAttachmentId: encodeURIComponent(attachmentId),
        apiPath: `/me/messages/${messageId}/attachments/${encodeURIComponent(attachmentId)}`,
        graphError: error.code || 'unknown',
        graphMessage: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    );
    
    MonitoringService.logError(mcpError);
    MonitoringService.trackMetric('graph_mail_remove_attachment_failure', executionTime, {
      service: 'graph-mail-service',
      method: 'removeMailAttachment',
      errorType: error.code || 'unknown',
      timestamp: new Date().toISOString()
    });
    
    throw mcpError;
  }
}

module.exports = {
  getInbox,
  searchEmails,
  sendEmail,
  flagEmail,
  getAttachments,
  getInboxRaw,
  getEmailDetails,
  markAsRead,
  addMailAttachment,
  removeMailAttachment
};
