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
    const { to, subject, body, cc, bcc, contentType } = emailData;
    
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

    console.log('[MailService] Sending email with message:', JSON.stringify(message));
    await client.api('/me/sendMail').post({ message });
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
  const client = await graphClientFactory.createClient(req);
  const res = await client.api(`/me/messages/${id}/attachments`).get();
  return res.value || [];
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
