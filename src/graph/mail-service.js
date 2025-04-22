/**
 * @fileoverview MailService - Microsoft Graph Mail API operations.
 * All methods are async, modular, and use GraphClient for requests.
 * Follows project error handling, validation, and normalization rules.
 */

const graphClientFactory = require('./graph-client');

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
 * @returns {Promise<Array<object>>}
 */
async function getInbox(options = {}) {
  const client = await graphClientFactory.createClient();
  const top = options.top || 10;
  const res = await client.api(`/me/mailFolders/inbox/messages?$top=${top}`).get();
  return (res.value || []).map(normalizeEmail);
}

/**
 * Searches emails by query string.
 * @param {string} query
 * @param {object} options
 * @returns {Promise<Array<object>>}
 */
async function searchEmails(query, options = {}) {
  const client = await graphClientFactory.createClient();
  const top = options.top || 10;
  const res = await client.api(`/me/messages?$search="${encodeURIComponent(query)}"&$top=${top}`).get();
  return (res.value || []).map(normalizeEmail);
}

/**
 * Sends an email.
 * @param {object} emailData
 * @returns {Promise<object>}
 */
async function sendEmail(emailData) {
  const client = await graphClientFactory.createClient();
  const message = {
    message: {
      subject: emailData.subject,
      body: {
        contentType: 'Text',
        content: emailData.body
      },
      toRecipients: [{ emailAddress: { address: emailData.to } }]
    },
    saveToSentItems: true
  };
  return await client.api('/me/sendMail').post(message);
}

/**
 * Flags or categorizes an email.
 * @param {string} id
 * @param {object} flagData
 * @returns {Promise<object>}
 */
async function flagEmail(id, flagData) {
  const client = await graphClientFactory.createClient();
  return await client.api(`/me/messages/${id}`).patch({ flag: flagData });
}

/**
 * Retrieves attachments for an email.
 * @param {string} id
 * @returns {Promise<Array<object>>}
 */
async function getAttachments(id) {
  const client = await graphClientFactory.createClient();
  const res = await client.api(`/me/messages/${id}/attachments`).get();
  return res.value || [];
}

module.exports = {
  getInbox,
  searchEmails,
  sendEmail,
  flagEmail,
  getAttachments
};
