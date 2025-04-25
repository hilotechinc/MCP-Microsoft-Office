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
  const client = await graphClientFactory.createClient(req);
  const { to, subject, body } = emailData;
  
  const message = {
    subject,
    body: {
      contentType: 'HTML',
      content: body
    },
    toRecipients: [
      {
        emailAddress: {
          address: to
        }
      }
    ]
  };

  await client.api('/me/sendMail').post({ message });
  return true;
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

async function getInboxRaw(options = {}, req) {
  const client = await graphClientFactory.createClient(req);
  const top = options.top || 10;
  const res = await client.api(`/me/mailFolders/inbox/messages?$top=${top}`).get();
  return res.value || [];
}

module.exports = {
  getInbox,
  searchEmails,
  sendEmail,
  flagEmail,
  getAttachments,
  getInboxRaw
};
