/**
 * @fileoverview PeopleService - Microsoft Graph People API operations.
 * All methods are async, modular, and use GraphClient for requests.
 * Follows project error handling, validation, and normalization rules.
 */

const graphClientFactory = require('./graph-client.cjs');
const { normalizePerson, normalizeUser } = require('./normalizers.cjs');

/**
 * Gets a list of people relevant to the current user.
 * @param {object} options - Query options
 * @param {number} [options.top=10] - Number of people to retrieve
 * @param {string} [options.filter] - OData filter
 * @param {string} [options.orderby] - Property to sort by
 * @param {object} req - Express request object
 * @returns {Promise<Array<object>>} Normalized people objects
 */
async function getRelevantPeople(options = {}, req) {
  try {
    const client = await graphClientFactory.createClient(req);
    const top = options.top || options.limit || 10;
    
    // Build the URL with query parameters
    let queryParams = [];
    queryParams.push(`$top=${top}`);
    
    if (options.filter) {
      queryParams.push(`$filter=${encodeURIComponent(options.filter)}`);
    }
    
    if (options.orderby) {
      queryParams.push(`$orderby=${encodeURIComponent(options.orderby)}`);
    }
    
    // Construct the final URL
    const url = `/me/people?${queryParams.join('&')}`;
    
    console.log(`[People Service] Getting relevant people with URL: ${url}`);
    const res = await client.api(url).get();
    
    console.log(`[People Service] Found ${res.value ? res.value.length : 0} relevant people`);
    return (res.value || []).map(normalizePerson);
  } catch (error) {
    console.error(`[People Service] Error getting relevant people:`, error);
    throw error;
  }
}

/**
 * Searches for people by name or email.
 * @param {string} searchQuery - Search query string
 * @param {object} options - Query options
 * @param {number} [options.top=10] - Number of people to retrieve
 * @param {object} req - Express request object
 * @returns {Promise<Array<object>>} Normalized people objects
 */
async function searchPeople(searchQuery, options = {}, req) {
  const client = await graphClientFactory.createClient(req);
  const top = options.top || 10;
  
  try {
    console.log(`[People Service] Searching for people with query: ${searchQuery}`);
    
    // First try: Standard people search with $search parameter
    const url = `/me/people?$search="${encodeURIComponent(searchQuery)}"&$top=${top}`;
    const res = await client.api(url).get();
    
    if (res.value && res.value.length > 0) {
      console.log(`[People Service] Found ${res.value.length} people via people search`);
      return res.value.map(normalizePerson);
    }
    
    // Second try: Fall back to users search if people search returns no results
    console.log(`[People Service] No results from people search, trying users search`);
    const usersUrl = `/users?$filter=startswith(displayName,'${encodeURIComponent(searchQuery)}') or startswith(givenName,'${encodeURIComponent(searchQuery)}') or startswith(surname,'${encodeURIComponent(searchQuery)}')&$top=${top}`;
    const usersRes = await client.api(usersUrl).get();
    
    if (usersRes.value && usersRes.value.length > 0) {
      console.log(`[People Service] Found ${usersRes.value.length} people via users search`);
      return usersRes.value.map(normalizePerson);
    }
    
    // Third try: Search for unlicensed users in the directory
    console.log(`[People Service] No results from users search, trying directory search for unlicensed users`);
    const directoryUrl = `/directory/users?$filter=startswith(displayName,'${encodeURIComponent(searchQuery)}') or startswith(givenName,'${encodeURIComponent(searchQuery)}') or startswith(surname,'${encodeURIComponent(searchQuery)}') or startswith(userPrincipalName,'${encodeURIComponent(searchQuery)}')&$top=${top}`;
    const directoryRes = await client.api(directoryUrl).get();
    
    if (directoryRes.value && directoryRes.value.length > 0) {
      console.log(`[People Service] Found ${directoryRes.value.length} people via directory search (including unlicensed users)`);
      return directoryRes.value.map(normalizePerson);
    }
    
    console.log(`[People Service] No results found for query: ${searchQuery}`);
    return [];
  } catch (error) {
    console.error(`[People Service] Error searching for people:`, error);
    throw error;
  }
}

/**
 * Gets a specific person by ID.
 * @param {string} personId - Person ID
 * @param {object} req - Express request object
 * @returns {Promise<object>} Normalized person object
 */
async function getPersonById(personId, req) {
  try {
    console.log(`[People Service] Getting person with ID: ${personId}`);
    const client = await graphClientFactory.createClient(req);
    
    // Try first with /me/people endpoint (returns person format)
    try {
      const res = await client.api(`/me/people/${personId}`).get();
      console.log(`[People Service] Successfully retrieved person from /me/people endpoint`);
      return normalizePerson(res);
    } catch (peopleError) {
      console.log(`[People Service] Failed to get person from /me/people endpoint: ${peopleError.message}`);
      
      // If the first attempt fails, try with /users endpoint (returns user format)
      try {
        // Add $select to get comprehensive user details
        const selectFields = [
          'id', 'displayName', 'givenName', 'surname', 'mail', 'userPrincipalName',
          'jobTitle', 'department', 'companyName', 'businessPhones', 'mobilePhone',
          'officeLocation', 'streetAddress', 'city', 'state', 'postalCode', 'country',
          'preferredLanguage', 'photo'
        ].join(',');
        
        const res = await client.api(`/users/${personId}?$select=${selectFields}`).get();
        console.log(`[People Service] Successfully retrieved user from /users endpoint`);
        
        // Use normalizeUser since this is user format, not person format
        return normalizeUser(res);
      } catch (usersError) {
        console.log(`[People Service] Failed to get person from /users endpoint: ${usersError.message}`);
        
        // If both attempts fail, throw the original error
        throw peopleError;
      }
    }
  } catch (error) {
    console.error(`[People Service] Error getting person by ID:`, error);
    throw error;
  }
}

/**
 * Gets a list of people relevant to another user (requires admin consent).
 * @param {string} userId - User ID
 * @param {object} options - Query options
 * @param {number} [options.top=10] - Number of people to retrieve
 * @param {object} req - Express request object
 * @returns {Promise<Array<object>>} Normalized people objects
 */
async function getUserRelevantPeople(userId, options = {}, req) {
  const client = await graphClientFactory.createClient(req);
  const top = options.top || 10;
  const url = `/users/${userId}/people?$top=${top}`;
  
  const res = await client.api(url).get();
  return (res.value || []).map(normalizePerson);
}

module.exports = {
  getRelevantPeople,
  searchPeople,
  getPersonById,
  getUserRelevantPeople
};
