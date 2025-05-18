/**
 * @fileoverview MailService - Microsoft Graph Mail API operations.
 * All methods are async, modular, and use GraphClient for requests.
 * Follows project error handling, validation, and normalization rules.
 */

const graphClientFactory = require('./graph-client.cjs');

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
  const client = await graphClientFactory.createClient(req);
  const top = options.top || 10;
  const res = await client.api(`/me/mailFolders/inbox/messages?$top=${top}`).get();
  return (res.value || []).map(normalizeEmail);
}

/**
 * Searches emails by query string.
 * @param {string} query
 * @param {object} options
 * @param {object} req - Express request object
 * @returns {Promise<Array<object>>}
 */
async function searchEmails(query, options = {}, req) {
  const client = await graphClientFactory.createClient(req);
  const top = options.top || 10;
  const res = await client.api(`/me/messages?$search="${encodeURIComponent(query)}"&$top=${top}`).get();
  return (res.value || []).map(normalizeEmail);
}

/**
 * Sends an email.
 * @param {object} emailData
 * @param {object} req - Express request object
 * @returns {Promise<boolean>}
 */
async function sendEmail(emailData, req) {
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
      console.log(`[MailService] Adding ${attachments.length} attachments to email`);
      
      // Process attachments asynchronously
      const processedAttachments = await Promise.all(attachments.map(async attachment => {
        try {
          // Check if attachment is a file ID (string) or an attachment object
          if (typeof attachment === 'string') {
            console.log(`[MailService] Processing file attachment by ID: ${attachment}`);
            // This is a file ID from the files service
            // We need to get the file content from the files service
            try {
              // Import the files service
              const filesService = require('./files-service.cjs');
              
              // Get the file metadata and content
              const fileMetadata = await filesService.getFileMetadata(attachment, req);
              const fileContent = await filesService.getFileContent(attachment, req);
              
              if (!fileMetadata || !fileContent) {
                console.error(`[MailService] Could not retrieve file with ID: ${attachment}`);
                return null;
              }
              
              console.log(`[MailService] Retrieved file: ${fileMetadata.name}`);
              
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
              console.error(`[MailService] Error retrieving file: ${fileError.message}`);
              return null;
            }
          }
          
          // Handle attachment object
          // Check if we have contentBytes or need to convert from content
          let contentBytes = attachment.contentBytes;
          
          // If we have content but not contentBytes, convert content to base64
          if (!contentBytes && attachment.content) {
            console.log(`[MailService] Converting content to contentBytes for attachment: ${attachment.name}`);
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
            console.error(`[MailService] Invalid attachment: missing required fields`, {
              hasName: !!attachment.name,
              hasContentType: !!attachment.contentType,
              hasContentBytes: !!contentBytes
            });
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
          console.error(`[MailService] Error processing attachment: ${attachmentError.message}`);
          return null;
        }
      }));
      
      // Filter out null entries from invalid attachments
      message.attachments = processedAttachments.filter(Boolean);
      console.log(`[MailService] Processed ${message.attachments.length} valid attachments`);
    }

    console.log('[MailService] Sending email with message:', JSON.stringify({
      ...message,
      attachments: message.attachments ? `${message.attachments.length} attachments` : 'none'
    }));
    
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
    
    console.log('[MailService] Sending email with saveToSentItems: true');
    await client.api('/me/sendMail').post(requestBody);
    console.log('[MailService] Email sent successfully');
    return true;
  } catch (error) {
    console.error(`[MailService] Error sending email: ${error.message}`);
    throw error;
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
  const client = await graphClientFactory.createClient(req);
  await client.api(`/me/messages/${id}`).patch({
    flag: { flagStatus: flag ? 'flagged' : 'notFlagged' }
  });
  return true;
}

/**
 * Retrieves attachments for an email.
 * @param {string} id
 * @param {object} req - Express request object
 * @returns {Promise<Array<object>>}
 */
async function getAttachments(id, req) {
  try {
    if (!id) {
      console.error('[MailService] getAttachments called with invalid email ID');
      return [];
    }
    
    console.log(`[MailService] Getting attachments for email ID: ${id}`);
    const client = await graphClientFactory.createClient(req);
    
    // First check if the email exists and has attachments
    try {
      const emailDetails = await client.api(`/me/messages/${id}`).select('id,hasAttachments').get();
      console.log(`[MailService] Email metadata hasAttachments flag: ${emailDetails.hasAttachments}`);
      
      // If the email doesn't have attachments according to metadata, return empty array early
      if (!emailDetails.hasAttachments) {
        console.log(`[MailService] Email ${id} has no attachments according to metadata`);
        return [];
      }
    } catch (metadataError) {
      console.error(`[MailService] Error checking email metadata: ${metadataError.message}`);
      // Continue anyway to try getting attachments directly
    }
    
    // Use $select to ensure we get all attachment properties
    const res = await client.api(`/me/messages/${id}/attachments`)
      .select('id,name,contentType,size,isInline,lastModifiedDateTime')
      .get();
    
    const attachments = res.value || [];
    console.log(`[MailService] Retrieved ${attachments.length} attachments for email ID: ${id}`);
    
    if (attachments.length > 0) {
      // Log attachment details for debugging
      attachments.forEach(attachment => {
        console.log(`[MailService] Attachment found: ${attachment.name}, Type: ${attachment.contentType}, Size: ${attachment.size || 'unknown'}`);
      });
      
      // Return normalized attachments with consistent structure
      return attachments.map(attachment => ({
        id: attachment.id,
        name: attachment.name,
        contentType: attachment.contentType,
        size: attachment.size || 0,
        isInline: attachment.isInline || false,
        lastModifiedDateTime: attachment.lastModifiedDateTime || new Date().toISOString()
      }));
    }
    
    return [];
  } catch (error) {
    console.error(`[MailService] Error getting attachments for email ${id}: ${error.message}`);
    // Create a standardized error using the ErrorService
    const mcpError = ErrorService.createError(
      ErrorService.CATEGORIES.GRAPH,
      `Failed to get email attachments: ${error.message}`,
      ErrorService.SEVERITIES.ERROR,
      {
        emailId: id,
        graphErrorCode: error.code || 'unknown',
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    );
    
    // Log the error with the MonitoringService
    MonitoringService.logError(mcpError);
    
    // Rethrow the error for the caller to handle
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
  const client = await graphClientFactory.createClient(req);
  const top = options.top || 10;
  const res = await client.api(`/me/mailFolders/inbox/messages?$top=${top}`).get();
  return res.value || [];
}

/**
 * Retrieves detailed information for a specific email by ID.
 * @param {string} id - Email ID
 * @param {object} req - Express request object
 * @returns {Promise<object>}
 */
async function getEmailDetails(id, req) {
  try {
    const client = await graphClientFactory.createClient(req);
    const message = await client.api(`/me/messages/${id}`).get();
    
    if (!message) {
      console.error(`[MailService] No message found with ID: ${id}`);
      return null;
    }
    
    return {
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
  } catch (error) {
    console.error(`[MailService] Error getting email details for ID ${id}: ${error.message}`);
    // Re-throw to allow proper error handling up the chain
    throw error;
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
  const client = await graphClientFactory.createClient(req);
  await client.api(`/me/messages/${id}`).patch({
    isRead
  });
  return true;
}

module.exports = {
  getInbox,
  searchEmails,
  sendEmail,
  flagEmail,
  getAttachments,
  getInboxRaw,
  getEmailDetails,
  markAsRead
};
