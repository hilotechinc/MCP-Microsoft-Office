/**
 * @fileoverview PeopleService - Microsoft Graph People API operations.
 * All methods are async, modular, and use GraphClient for requests.
 * Follows project error handling, validation, and normalization rules.
 */

const graphClientFactory = require('./graph-client.cjs');
const { normalizePerson, normalizeUser } = require('./normalizers.cjs');
const MonitoringService = require('../core/monitoring-service.cjs');
const ErrorService = require('../core/error-service.cjs');

/**
 * Gets a list of people relevant to the current user.
 * @param {object} options - Query options
 * @param {number} [options.top=10] - Number of people to retrieve
 * @param {string} [options.filter] - OData filter
 * @param {string} [options.orderby] - Property to sort by
 * @param {object} req - Express request object
 * @param {string} userId - User ID for logging context
 * @param {string} sessionId - Session ID for logging context
 * @returns {Promise<Array<object>>} Normalized people objects
 */
async function getRelevantPeople(options = {}, req, userId, sessionId) {
  const startTime = new Date();
  
  // Extract user context from req if not provided
  const resolvedUserId = userId || req?.user?.userId;
  const resolvedSessionId = sessionId || req?.session?.id;
  
  try {
    // Pattern 1: Development Debug Logs
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug('Getting relevant people', {
        sessionId: resolvedSessionId,
        userAgent: req?.get?.('User-Agent'),
        timestamp: new Date().toISOString(),
        options: { top: options.top || options.limit || 10, filter: options.filter, orderby: options.orderby }
      }, 'people');
    }
    
    const client = await graphClientFactory.createClient(req, resolvedUserId, resolvedSessionId);
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
    
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug(`Executing Graph API request to: ${url}`, {
        sessionId: resolvedSessionId,
        url: url,
        timestamp: new Date().toISOString()
      }, 'people');
    }
    
    const res = await client.api(url, resolvedUserId, resolvedSessionId).get();
    const endTime = new Date();
    const duration = endTime - startTime;
    
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug(`Retrieved ${res.value ? res.value.length : 0} relevant people`, {
        sessionId: resolvedSessionId,
        count: res.value ? res.value.length : 0,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      }, 'people');
    }
    
    // Normalize the results
    const normalizedPeople = (res.value || []).map(person => normalizePerson(person, resolvedUserId, resolvedSessionId));
    
    // Pattern 2: User Activity Logs
    if (resolvedUserId) {
      MonitoringService.info('Retrieved relevant people successfully', {
        count: normalizedPeople.length,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      }, 'people', null, resolvedUserId);
    } else if (resolvedSessionId) {
      MonitoringService.info('Retrieved relevant people with session', {
        sessionId: resolvedSessionId,
        count: normalizedPeople.length,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      }, 'people');
    }
    
    return normalizedPeople;
  } catch (error) {
    const endTime = new Date();
    const duration = endTime - startTime;
    
    // Pattern 3: Infrastructure Error Logging
    const mcpError = ErrorService.createError(
      'people',
      'Failed to get relevant people',
      'error',
      { 
        endpoint: '/me/people',
        options: options,
        error: error.message,
        stack: error.stack,
        duration: `${duration}ms`,
        sessionId: resolvedSessionId,
        timestamp: new Date().toISOString()
      }
    );
    MonitoringService.logError(mcpError);
    
    // Pattern 4: User Error Tracking
    if (resolvedUserId) {
      MonitoringService.error('Failed to retrieve relevant people', {
        error: error.message,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      }, 'people', null, resolvedUserId);
    } else if (resolvedSessionId) {
      MonitoringService.error('Failed to retrieve relevant people', {
        sessionId: resolvedSessionId,
        error: error.message,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      }, 'people');
    }
    
    throw error;
  }
}

/**
 * Searches for people by name or email.
 * @param {string} searchQuery - Search query string
 * @param {object} options - Query options
 * @param {number} [options.top=10] - Number of people to retrieve
 * @param {object} req - Express request object
 * @param {string} userId - User ID for logging context
 * @param {string} sessionId - Session ID for logging context
 * @returns {Promise<Array<object>>} Normalized people objects
 */
async function searchPeople(searchQuery, options = {}, req, userId, sessionId) {
  const startTime = new Date();
  
  // Extract user context from req if not provided
  const resolvedUserId = userId || req?.user?.userId;
  const resolvedSessionId = sessionId || req?.session?.id;
  
  try {
    // Pattern 1: Development Debug Logs
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug('Searching for people', {
        sessionId: resolvedSessionId,
        userAgent: req?.get?.('User-Agent'),
        timestamp: new Date().toISOString(),
        query: searchQuery?.substring(0, 50) + (searchQuery?.length > 50 ? '...' : ''),
        top: options.top || 10
      }, 'people');
    }
    
    const client = await graphClientFactory.createClient(req, resolvedUserId, resolvedSessionId);
    const top = options.top || 10;
    
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug(`Executing people search with query: ${searchQuery?.substring(0, 50) + (searchQuery?.length > 50 ? '...' : '')}`, {
        sessionId: resolvedSessionId,
        searchQuery: searchQuery?.substring(0, 50) + (searchQuery?.length > 50 ? '...' : ''),
        top: top,
        timestamp: new Date().toISOString()
      }, 'people');
    }
    
    // First try: Standard people search with $search parameter
    const url = `/me/people?$search="${encodeURIComponent(searchQuery)}"&$top=${top}`;
    const res = await client.api(url, resolvedUserId, resolvedSessionId).get();
    
    if (res.value && res.value.length > 0) {
      const endTime = new Date();
      const duration = endTime - startTime;
      
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug(`Found ${res.value.length} people via people search`, {
          sessionId: resolvedSessionId,
          count: res.value.length,
          duration: `${duration}ms`,
          timestamp: new Date().toISOString()
        }, 'people');
      }
      
      const normalizedPeople = res.value.map(person => normalizePerson(person, resolvedUserId, resolvedSessionId));
      
      // Pattern 2: User Activity Logs
      if (resolvedUserId) {
        MonitoringService.info('People search completed successfully', {
          query: searchQuery?.substring(0, 50) + (searchQuery?.length > 50 ? '...' : ''),
          count: normalizedPeople.length,
          duration: `${duration}ms`,
          timestamp: new Date().toISOString()
        }, 'people', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.info('People search completed with session', {
          sessionId: resolvedSessionId,
          query: searchQuery?.substring(0, 50) + (searchQuery?.length > 50 ? '...' : ''),
          count: normalizedPeople.length,
          duration: `${duration}ms`,
          timestamp: new Date().toISOString()
        }, 'people');
      }
      
      return normalizedPeople;
    }
    
    // Second try: Fall back to users search if people search returns no results
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug('No results from people search, trying users search', {
        sessionId: resolvedSessionId,
        timestamp: new Date().toISOString()
      }, 'people');
    }
    const usersUrl = `/users?$filter=startswith(displayName,'${encodeURIComponent(searchQuery)}') or startswith(givenName,'${encodeURIComponent(searchQuery)}') or startswith(surname,'${encodeURIComponent(searchQuery)}')&$top=${top}`;
    const usersRes = await client.api(usersUrl, resolvedUserId, resolvedSessionId).get();
    
    if (usersRes.value && usersRes.value.length > 0) {
      const endTime = new Date();
      const duration = endTime - startTime;
      
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug(`Found ${usersRes.value.length} people via users search`, {
          sessionId: resolvedSessionId,
          count: usersRes.value.length,
          duration: `${duration}ms`,
          timestamp: new Date().toISOString()
        }, 'people');
      }
      
      const normalizedPeople = usersRes.value.map(person => normalizePerson(person, resolvedUserId, resolvedSessionId));
      
      // Pattern 2: User Activity Logs
      if (resolvedUserId) {
        MonitoringService.info('People search completed successfully via users endpoint', {
          query: searchQuery?.substring(0, 50) + (searchQuery?.length > 50 ? '...' : ''),
          count: normalizedPeople.length,
          duration: `${duration}ms`,
          timestamp: new Date().toISOString()
        }, 'people', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.info('People search completed with session via users endpoint', {
          sessionId: resolvedSessionId,
          query: searchQuery?.substring(0, 50) + (searchQuery?.length > 50 ? '...' : ''),
          count: normalizedPeople.length,
          duration: `${duration}ms`,
          timestamp: new Date().toISOString()
        }, 'people');
      }
      
      return normalizedPeople;
    }
    
    // Third try: Search for unlicensed users in the directory
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug('No results from users search, trying directory search for unlicensed users', {
        sessionId: resolvedSessionId,
        timestamp: new Date().toISOString()
      }, 'people');
    }
    const directoryUrl = `/directory/users?$filter=startswith(displayName,'${encodeURIComponent(searchQuery)}') or startswith(givenName,'${encodeURIComponent(searchQuery)}') or startswith(surname,'${encodeURIComponent(searchQuery)}') or startswith(userPrincipalName,'${encodeURIComponent(searchQuery)}')&$top=${top}`;
    const directoryRes = await client.api(directoryUrl, resolvedUserId, resolvedSessionId).get();
    
    if (directoryRes.value && directoryRes.value.length > 0) {
      const endTime = new Date();
      const duration = endTime - startTime;
      
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug(`Found ${directoryRes.value.length} people via directory search (including unlicensed users)`, {
          sessionId: resolvedSessionId,
          count: directoryRes.value.length,
          duration: `${duration}ms`,
          timestamp: new Date().toISOString()
        }, 'people');
      }
      
      const normalizedPeople = directoryRes.value.map(person => normalizePerson(person, resolvedUserId, resolvedSessionId));
      
      // Pattern 2: User Activity Logs
      if (resolvedUserId) {
        MonitoringService.info('People search completed successfully via directory endpoint', {
          query: searchQuery?.substring(0, 50) + (searchQuery?.length > 50 ? '...' : ''),
          count: normalizedPeople.length,
          duration: `${duration}ms`,
          timestamp: new Date().toISOString()
        }, 'people', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.info('People search completed with session via directory endpoint', {
          sessionId: resolvedSessionId,
          query: searchQuery?.substring(0, 50) + (searchQuery?.length > 50 ? '...' : ''),
          count: normalizedPeople.length,
          duration: `${duration}ms`,
          timestamp: new Date().toISOString()
        }, 'people');
      }
      
      return normalizedPeople;
    }
    
    const endTime = new Date();
    const duration = endTime - startTime;
    
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug(`No results found for query: ${searchQuery?.substring(0, 50) + (searchQuery?.length > 50 ? '...' : '')}`, {
        sessionId: resolvedSessionId,
        query: searchQuery?.substring(0, 50) + (searchQuery?.length > 50 ? '...' : ''),
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      }, 'people');
    }
    
    // Pattern 2: User Activity Logs for empty results
    if (resolvedUserId) {
      MonitoringService.info('People search completed with no results', {
        query: searchQuery?.substring(0, 50) + (searchQuery?.length > 50 ? '...' : ''),
        count: 0,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      }, 'people', null, resolvedUserId);
    } else if (resolvedSessionId) {
      MonitoringService.info('People search completed with session - no results', {
        sessionId: resolvedSessionId,
        query: searchQuery?.substring(0, 50) + (searchQuery?.length > 50 ? '...' : ''),
        count: 0,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      }, 'people');
    }
    
    return [];
  } catch (error) {
    const endTime = new Date();
    const duration = endTime - startTime;
    
    // Pattern 3: Infrastructure Error Logging
    const mcpError = ErrorService.createError(
      'people',
      'Failed to search for people',
      'error',
      {
        searchQuery: searchQuery?.substring(0, 50) + (searchQuery?.length > 50 ? '...' : ''),
        error: error.message,
        stack: error.stack,
        duration: `${duration}ms`,
        sessionId: resolvedSessionId,
        timestamp: new Date().toISOString()
      }
    );
    MonitoringService.logError(mcpError);
    
    // Pattern 4: User Error Tracking
    if (resolvedUserId) {
      MonitoringService.error('Failed to search for people', {
        query: searchQuery?.substring(0, 50) + (searchQuery?.length > 50 ? '...' : ''),
        error: error.message,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      }, 'people', null, resolvedUserId);
    } else if (resolvedSessionId) {
      MonitoringService.error('Failed to search for people', {
        sessionId: resolvedSessionId,
        query: searchQuery?.substring(0, 50) + (searchQuery?.length > 50 ? '...' : ''),
        error: error.message,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      }, 'people');
    }
    
    throw error;
  }
}

/**
 * Gets a specific person by ID.
 * @param {string} personId - Person ID
 * @param {object} req - Express request object
 * @param {string} userId - User ID for logging context
 * @param {string} sessionId - Session ID for logging context
 * @returns {Promise<object>} Raw Graph API person object
 */
async function getPersonById(personId, req, userId, sessionId) {
  const startTime = new Date();
  
  // Extract user context from req if not provided
  const resolvedUserId = userId || req?.user?.userId;
  const resolvedSessionId = sessionId || req?.session?.id;
  
  try {
    // Pattern 1: Development Debug Logs
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug('Getting person by ID', {
        sessionId: resolvedSessionId,
        userAgent: req?.get?.('User-Agent'),
        timestamp: new Date().toISOString(),
        personId: personId?.substring(0, 20) + (personId?.length > 20 ? '...' : '')
      }, 'people');
    }
    
    const client = await graphClientFactory.createClient(req, resolvedUserId, resolvedSessionId);
    
    // Define fields to retrieve for comprehensive user details
    const selectFields = [
      'id', 'displayName', 'givenName', 'surname', 'mail', 'userPrincipalName',
      'jobTitle', 'department', 'companyName', 'businessPhones', 'mobilePhone',
      'officeLocation', 'streetAddress', 'city', 'state', 'postalCode', 'country',
      'preferredLanguage', 'photo', 'aboutMe', 'birthday', 'hireDate', 'interests',
      'mySite', 'pastProjects', 'preferredName', 'responsibilities', 'schools',
      'skills', 'manager', 'directReports'
    ].join(',');
    
    // Try multiple endpoints in order of most likely to return complete data
    const endpoints = [
      { name: 'beta users', url: `https://graph.microsoft.com/beta/users/${personId}?$select=${selectFields}` },
      { name: 'beta people', url: `https://graph.microsoft.com/beta/me/people/${personId}` },
      { name: 'v1.0 users', url: `/users/${personId}?$select=${selectFields}` },
      { name: 'v1.0 people', url: `/me/people/${personId}` }
    ];
    
    let lastError = null;
    
    // Try each endpoint in sequence until we get valid data
    for (const endpoint of endpoints) {
      try {
        if (process.env.NODE_ENV === 'development') {
          MonitoringService.debug(`Trying ${endpoint.name} endpoint`, {
            sessionId: resolvedSessionId,
            endpoint: endpoint.name,
            personId: personId?.substring(0, 20) + (personId?.length > 20 ? '...' : ''),
            timestamp: new Date().toISOString()
          }, 'people');
        }
        
        const res = await client.api(endpoint.url, resolvedUserId, resolvedSessionId).get();
        
        if (process.env.NODE_ENV === 'development') {
          const responseType = typeof res === 'object' ? 
            (res.success && res.status ? 
              `wrapper response with status ${res.status}` : 
              `object with ${Object.keys(res).length} keys`) : 
            typeof res;
          
          MonitoringService.debug(`Response from ${endpoint.name} endpoint: ${responseType}`, {
            sessionId: resolvedSessionId,
            endpoint: endpoint.name,
            responseType,
            hasData: !!res,
            timestamp: new Date().toISOString()
          }, 'people');
        }
        
        // Check if we got a wrapper response instead of actual data
        if (res && typeof res === 'object' && res.success === true && res.status === 200) {
          if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug(`Received wrapper response from ${endpoint.name} endpoint, continuing to next`, {
              sessionId: resolvedSessionId,
              endpoint: endpoint.name,
              timestamp: new Date().toISOString()
            }, 'people');
          }
          continue;
        }
        
        // Check if we got a valid person/user object
        if (res && typeof res === 'object' && (res.id || res.displayName)) {
          const endTime = new Date();
          const duration = endTime - startTime;
          
          if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug(`Successfully retrieved person data from ${endpoint.name} endpoint`, {
              sessionId: resolvedSessionId,
              endpoint: endpoint.name,
              fields: Object.keys(res),
              duration: `${duration}ms`,
              timestamp: new Date().toISOString()
            }, 'people');
          }
          
          // Pattern 2: User Activity Logs
          if (resolvedUserId) {
            MonitoringService.info('Retrieved person details successfully', {
              personId: personId?.substring(0, 20) + (personId?.length > 20 ? '...' : ''),
              endpoint: endpoint.name,
              duration: `${duration}ms`,
              timestamp: new Date().toISOString()
            }, 'people', null, resolvedUserId);
          } else if (resolvedSessionId) {
            MonitoringService.info('Retrieved person details with session', {
              sessionId: resolvedSessionId,
              personId: personId?.substring(0, 20) + (personId?.length > 20 ? '...' : ''),
              endpoint: endpoint.name,
              duration: `${duration}ms`,
              timestamp: new Date().toISOString()
            }, 'people');
          }
          
          return res;
        }
        
        if (process.env.NODE_ENV === 'development') {
          MonitoringService.debug(`Response from ${endpoint.name} endpoint doesn't appear to be valid person data`, {
            sessionId: resolvedSessionId,
            endpoint: endpoint.name,
            timestamp: new Date().toISOString()
          }, 'people');
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          MonitoringService.debug(`Failed to get person from ${endpoint.name} endpoint`, {
            sessionId: resolvedSessionId,
            endpoint: endpoint.name,
            error: error.message,
            timestamp: new Date().toISOString()
          }, 'people');
        }
        lastError = error;
      }
    }
    
    // If all endpoints failed, throw the last error
    if (lastError) {
      const endTime = new Date();
      const duration = endTime - startTime;
      
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'people',
        `All endpoints failed for person ID: ${personId}`,
        'error',
        {
          personId: personId?.substring(0, 20) + (personId?.length > 20 ? '...' : ''),
          lastError: lastError.message,
          stack: lastError.stack,
          duration: `${duration}ms`,
          sessionId: resolvedSessionId,
          timestamp: new Date().toISOString()
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (resolvedUserId) {
        MonitoringService.error('All endpoints failed for person retrieval', {
          personId: personId?.substring(0, 20) + (personId?.length > 20 ? '...' : ''),
          error: lastError.message,
          duration: `${duration}ms`,
          timestamp: new Date().toISOString()
        }, 'people', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.error('All endpoints failed for person retrieval', {
          sessionId: resolvedSessionId,
          personId: personId?.substring(0, 20) + (personId?.length > 20 ? '...' : ''),
          error: lastError.message,
          duration: `${duration}ms`,
          timestamp: new Date().toISOString()
        }, 'people');
      }
      
      throw lastError;
    }
    
    // If we somehow got here without valid data or an error, throw a generic error
    const endTime = new Date();
    const duration = endTime - startTime;
    const genericError = new Error(`Failed to retrieve person data for ID: ${personId} from any endpoint`);
    
    // Pattern 3: Infrastructure Error Logging
    const mcpError = ErrorService.createError(
      'people',
      'No valid person data returned from any endpoint',
      'error',
      {
        personId: personId?.substring(0, 20) + (personId?.length > 20 ? '...' : ''),
        duration: `${duration}ms`,
        sessionId: resolvedSessionId,
        timestamp: new Date().toISOString()
      }
    );
    MonitoringService.logError(mcpError);
    
    throw genericError;
  } catch (error) {
    const endTime = new Date();
    const duration = endTime - startTime;
    
    // Pattern 3: Infrastructure Error Logging
    const mcpError = ErrorService.createError(
      'people',
      'Failed to get person by ID',
      'error',
      {
        personId: personId?.substring(0, 20) + (personId?.length > 20 ? '...' : ''),
        error: error.message,
        stack: error.stack,
        duration: `${duration}ms`,
        sessionId: resolvedSessionId,
        timestamp: new Date().toISOString()
      }
    );
    MonitoringService.logError(mcpError);
    
    // Pattern 4: User Error Tracking
    if (resolvedUserId) {
      MonitoringService.error('Failed to retrieve person by ID', {
        personId: personId?.substring(0, 20) + (personId?.length > 20 ? '...' : ''),
        error: error.message,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      }, 'people', null, resolvedUserId);
    } else if (resolvedSessionId) {
      MonitoringService.error('Failed to retrieve person by ID', {
        sessionId: resolvedSessionId,
        personId: personId?.substring(0, 20) + (personId?.length > 20 ? '...' : ''),
        error: error.message,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      }, 'people');
    }
    
    throw error;
  }
}

/**
 * Gets a list of people relevant to another user (requires admin consent).
 * @param {string} targetUserId - Target user ID to get people for
 * @param {object} options - Query options
 * @param {number} [options.top=10] - Number of people to retrieve
 * @param {object} req - Express request object
 * @param {string} userId - User ID for logging context
 * @param {string} sessionId - Session ID for logging context
 * @returns {Promise<Array<object>>} Normalized people objects
 */
async function getUserRelevantPeople(targetUserId, options = {}, req, userId, sessionId) {
  const startTime = new Date();
  
  // Extract user context from req if not provided
  const resolvedUserId = userId || req?.user?.userId;
  const resolvedSessionId = sessionId || req?.session?.id;
  
  try {
    // Pattern 1: Development Debug Logs
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug('Getting relevant people for user', {
        sessionId: resolvedSessionId,
        userAgent: req?.get?.('User-Agent'),
        timestamp: new Date().toISOString(),
        targetUserId: targetUserId?.substring(0, 20) + (targetUserId?.length > 20 ? '...' : ''),
        top: options.top || 10
      }, 'people');
    }
    
    const client = await graphClientFactory.createClient(req, resolvedUserId, resolvedSessionId);
    const top = options.top || 10;
    const url = `/users/${targetUserId}/people?$top=${top}`;
    
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug(`Executing Graph API request for user people`, {
        sessionId: resolvedSessionId,
        targetUserId: targetUserId?.substring(0, 20) + (targetUserId?.length > 20 ? '...' : ''),
        url: url,
        timestamp: new Date().toISOString()
      }, 'people');
    }
    
    const res = await client.api(url, resolvedUserId, resolvedSessionId).get();
    const endTime = new Date();
    const duration = endTime - startTime;
    
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug(`Retrieved ${res.value ? res.value.length : 0} people for user`, {
        sessionId: resolvedSessionId,
        targetUserId: targetUserId?.substring(0, 20) + (targetUserId?.length > 20 ? '...' : ''),
        count: res.value ? res.value.length : 0,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      }, 'people');
    }
    
    // Normalize the results
    const normalizedPeople = (res.value || []).map(person => normalizePerson(person, resolvedUserId, resolvedSessionId));
    
    // Pattern 2: User Activity Logs
    if (resolvedUserId) {
      MonitoringService.info('Retrieved relevant people for user successfully', {
        targetUserId: targetUserId?.substring(0, 20) + (targetUserId?.length > 20 ? '...' : ''),
        count: normalizedPeople.length,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      }, 'people', null, resolvedUserId);
    } else if (resolvedSessionId) {
      MonitoringService.info('Retrieved relevant people for user with session', {
        sessionId: resolvedSessionId,
        targetUserId: targetUserId?.substring(0, 20) + (targetUserId?.length > 20 ? '...' : ''),
        count: normalizedPeople.length,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      }, 'people');
    }
    
    return normalizedPeople;
  } catch (error) {
    const endTime = new Date();
    const duration = endTime - startTime;
    
    // Pattern 3: Infrastructure Error Logging
    const mcpError = ErrorService.createError(
      'people',
      'Failed to get relevant people for user',
      'error',
      {
        targetUserId: targetUserId?.substring(0, 20) + (targetUserId?.length > 20 ? '...' : ''),
        options: options,
        error: error.message,
        stack: error.stack,
        duration: `${duration}ms`,
        sessionId: resolvedSessionId,
        timestamp: new Date().toISOString()
      }
    );
    MonitoringService.logError(mcpError);
    
    // Pattern 4: User Error Tracking
    if (resolvedUserId) {
      MonitoringService.error('Failed to retrieve relevant people for user', {
        targetUserId: targetUserId?.substring(0, 20) + (targetUserId?.length > 20 ? '...' : ''),
        error: error.message,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      }, 'people', null, resolvedUserId);
    } else if (resolvedSessionId) {
      MonitoringService.error('Failed to retrieve relevant people for user', {
        sessionId: resolvedSessionId,
        targetUserId: targetUserId?.substring(0, 20) + (targetUserId?.length > 20 ? '...' : ''),
        error: error.message,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      }, 'people');
    }
    
    throw error;
  }
}

module.exports = {
  getRelevantPeople,
  searchPeople,
  getPersonById,
  getUserRelevantPeople
};
