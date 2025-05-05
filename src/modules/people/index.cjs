/**
 * @fileoverview MCP People Module - Handles people-related intents and actions for MCP.
 * Exposes: id, name, capabilities, init, handleIntent. Aligned with MCP module system.
 */

const { normalizePerson } = require('../../graph/normalizers.cjs');
const MonitoringService = require('../../core/monitoring-service.cjs');
const ErrorService = require('../../core/error-service.cjs');

const PEOPLE_CAPABILITIES = [
    'findPeople',
    'searchPeople',
    'getPersonById',
    'getRelevantPeople'
];

const PeopleModule = {
    /**
     * Helper method to redact sensitive data from objects before logging
     * @param {object} data - The data object to redact
     * @returns {object} Redacted copy of the data
     * @private
     */
    redactSensitiveData(data) {
        if (!data || typeof data !== 'object') {
            return data;
        }
        
        // Create a deep copy to avoid modifying the original
        const result = Array.isArray(data) ? [...data] : {...data};
        
        // Fields that should be redacted
        const sensitiveFields = [
            'user', 'email', 'mail', 'address', 'emailAddress', 'password', 'token', 'accessToken',
            'refreshToken', 'content', 'body', 'personId', 'id'
        ];
        
        // Recursively process the object
        for (const key in result) {
            if (Object.prototype.hasOwnProperty.call(result, key)) {
                // Check if this is a sensitive field
                if (sensitiveFields.includes(key.toLowerCase())) {
                    if (typeof result[key] === 'string') {
                        result[key] = 'REDACTED';
                    } else if (Array.isArray(result[key])) {
                        result[key] = `[${result[key].length} items]`;
                    } else if (typeof result[key] === 'object' && result[key] !== null) {
                        result[key] = '{REDACTED}';
                    }
                } 
                // Recursively process nested objects
                else if (typeof result[key] === 'object' && result[key] !== null) {
                    result[key] = this.redactSensitiveData(result[key]);
                }
            }
        }
        
        return result;
    },
    /**
     * Gets relevant people from Microsoft Graph
     * @param {object} options - Query options
     * @param {object} req - Express request object (optional)
     * @returns {Promise<Array<object>>} List of people
     */
    async getRelevantPeople(options = {}, req) {
        const { graphService, errorService = ErrorService, monitoringService = MonitoringService } = this.services || {};
        
        // Redact potentially sensitive data for logging
        const redactedOptions = this.redactSensitiveData(options);
        
        // Log the request attempt
        monitoringService?.debug('Attempting to get relevant people', { 
            options: redactedOptions,
            timestamp: new Date().toISOString()
        }, 'people');
        
        if (!graphService || typeof graphService.getRelevantPeople !== 'function') {
            const error = errorService?.createError(
                'people',
                'GraphService.getRelevantPeople not implemented',
                'error',
                { timestamp: new Date().toISOString() }
            ) || {
                category: 'people',
                message: 'GraphService.getRelevantPeople not implemented',
                severity: 'error',
                context: {}
            };
            
            monitoringService?.logError(error) || 
                console.error('[MCP PEOPLE] GraphService.getRelevantPeople not implemented');
                
            throw error;
        }
        
        try {
            // Track performance
            const startTime = Date.now();
            
            // Call the Graph API
            const results = await graphService.getRelevantPeople(options, req);
            
            // Calculate elapsed time and track metric
            const elapsedTime = Date.now() - startTime;
            monitoringService?.trackMetric('people_relevant_get_duration', elapsedTime, {
                count: results?.length || 0,
                timestamp: new Date().toISOString()
            });
            
            monitoringService?.info('Successfully retrieved relevant people', {
                count: results?.length || 0,
                elapsedTime,
                timestamp: new Date().toISOString()
            }, 'people') || 
                console.log(`[MCP PEOPLE] Successfully retrieved ${results?.length || 0} relevant people`);
                
            return results;
        } catch (error) {
            // Extract Graph API details if available
            const graphDetails = {
                statusCode: error.statusCode,
                code: error.code,
                graphRequestId: error.requestId,
                originalMessage: error.message
            };
            
            // Create a standardized error object
            const mcpError = errorService?.createError(
                'people',
                `Failed to get relevant people: ${error.code || error.message}`,
                error.statusCode && error.statusCode >= 500 ? 'error' : 'warn',
                { 
                    graphDetails, 
                    originalError: error.stack,
                    requestParams: { options: redactedOptions },
                    timestamp: new Date().toISOString()
                }
            ) || {
                category: 'people',
                message: `Failed to get relevant people: ${error.message}`,
                severity: 'error',
                context: { graphDetails }
            };
            
            // Log the error
            monitoringService?.logError(mcpError) || 
                console.error(`[MCP PEOPLE] Failed to get relevant people: ${error.message}`);
                
            // Throw the structured error
            throw mcpError;
        }
    },
    
    /**
     * Search for people by name or email
     * @param {string} query - Search query
     * @param {object} options - Search options
     * @param {object} req - Express request object (optional)
     * @returns {Promise<Array<object>>} List of matching people
     */
    async searchPeople(query, options = {}, req) {
        const { graphService, errorService = ErrorService, monitoringService = MonitoringService } = this.services || {};
        
        // Redact potentially sensitive data for logging
        const redactedOptions = this.redactSensitiveData(options);
        const redactedQuery = query ? 'REDACTED_QUERY' : '';
        
        // Log the request attempt
        monitoringService?.debug('Attempting to search for people', { 
            query: redactedQuery,
            options: redactedOptions,
            timestamp: new Date().toISOString()
        }, 'people');
        
        if (!graphService || typeof graphService.searchPeople !== 'function') {
            const error = errorService?.createError(
                'people',
                'GraphService.searchPeople not implemented',
                'error',
                { timestamp: new Date().toISOString() }
            ) || {
                category: 'people',
                message: 'GraphService.searchPeople not implemented',
                severity: 'error',
                context: {}
            };
            
            monitoringService?.logError(error) || 
                console.error('[MCP PEOPLE] GraphService.searchPeople not implemented');
                
            throw error;
        }
        
        try {
            // Track performance
            const startTime = Date.now();
            
            // Call the Graph API
            const results = await graphService.searchPeople(query, options, req);
            
            // Calculate elapsed time and track metric
            const elapsedTime = Date.now() - startTime;
            monitoringService?.trackMetric('people_search_duration', elapsedTime, {
                count: results?.length || 0,
                hasQuery: !!query,
                timestamp: new Date().toISOString()
            });
            
            monitoringService?.info('Successfully searched for people', {
                count: results?.length || 0,
                hasQuery: !!query,
                elapsedTime,
                timestamp: new Date().toISOString()
            }, 'people') || 
                console.log(`[MCP PEOPLE] Successfully found ${results?.length || 0} people for search query`);
                
            return results;
        } catch (error) {
            // Extract Graph API details if available
            const graphDetails = {
                statusCode: error.statusCode,
                code: error.code,
                graphRequestId: error.requestId,
                originalMessage: error.message
            };
            
            // Create a standardized error object
            const mcpError = errorService?.createError(
                'people',
                `Failed to search people: ${error.code || error.message}`,
                error.statusCode && error.statusCode >= 500 ? 'error' : 'warn',
                { 
                    graphDetails, 
                    originalError: error.stack,
                    requestParams: { options: redactedOptions, hasQuery: !!query },
                    timestamp: new Date().toISOString()
                }
            ) || {
                category: 'people',
                message: `Failed to search people: ${error.message}`,
                severity: 'error',
                context: { graphDetails }
            };
            
            // Log the error
            monitoringService?.logError(mcpError) || 
                console.error(`[MCP PEOPLE] Failed to search people: ${error.message}`);
                
            // Throw the structured error
            throw mcpError;
        }
    },
    
    /**
     * Get a specific person by ID
     * @param {string} personId - Person ID
     * @param {object} req - Express request object (optional)
     * @returns {Promise<object>} Person details
     */
    async getPersonById(personId, req) {
        const { graphService, errorService = ErrorService, monitoringService = MonitoringService } = this.services || {};
        
        // Redact potentially sensitive data for logging
        const redactedPersonId = 'REDACTED_PERSON_ID';
        
        // Log the request attempt
        monitoringService?.debug('Attempting to get person by ID', { 
            timestamp: new Date().toISOString()
        }, 'people');
        
        if (!personId) {
            const error = errorService?.createError(
                'people',
                'Person ID is required to get person details',
                'warn',
                { timestamp: new Date().toISOString() }
            ) || {
                category: 'people',
                message: 'Person ID is required to get person details',
                severity: 'warn',
                context: {}
            };
            
            monitoringService?.logError(error) || 
                console.error('[MCP PEOPLE] Person ID is required to get person details');
                
            throw error;
        }
        
        if (!graphService || typeof graphService.getPersonById !== 'function') {
            const error = errorService?.createError(
                'people',
                'GraphService.getPersonById not implemented',
                'error',
                { timestamp: new Date().toISOString() }
            ) || {
                category: 'people',
                message: 'GraphService.getPersonById not implemented',
                severity: 'error',
                context: {}
            };
            
            monitoringService?.logError(error) || 
                console.error('[MCP PEOPLE] GraphService.getPersonById not implemented');
                
            throw error;
        }
        
        try {
            // Track performance
            const startTime = Date.now();
            
            // Call the Graph API
            const person = await graphService.getPersonById(personId, req);
            
            // Calculate elapsed time and track metric
            const elapsedTime = Date.now() - startTime;
            monitoringService?.trackMetric('people_get_by_id_duration', elapsedTime, {
                found: !!person,
                timestamp: new Date().toISOString()
            });
            
            monitoringService?.info('Successfully retrieved person by ID', {
                found: !!person,
                elapsedTime,
                timestamp: new Date().toISOString()
            }, 'people') || 
                console.log(`[MCP PEOPLE] Successfully retrieved person by ID`);
                
            return person;
        } catch (error) {
            // Extract Graph API details if available
            const graphDetails = {
                statusCode: error.statusCode,
                code: error.code,
                graphRequestId: error.requestId,
                originalMessage: error.message
            };
            
            // Create a standardized error object
            const mcpError = errorService?.createError(
                'people',
                `Failed to get person by ID: ${error.code || error.message}`,
                error.statusCode && error.statusCode >= 500 ? 'error' : 'warn',
                { 
                    graphDetails, 
                    originalError: error.stack,
                    timestamp: new Date().toISOString()
                }
            ) || {
                category: 'people',
                message: `Failed to get person by ID: ${error.message}`,
                severity: 'error',
                context: { graphDetails }
            };
            
            // Log the error
            monitoringService?.logError(mcpError) || 
                console.error(`[MCP PEOPLE] Failed to get person by ID: ${error.message}`);
                
            // Throw the structured error
            throw mcpError;
        }
    },
    
    /**
     * Find people based on criteria (name, role, etc.)
     * @param {object} criteria - Search criteria
     * @param {object} req - Express request object (optional)
     * @returns {Promise<Array<object>>} List of matching people
     */
    async findPeople(criteria = {}, req) {
        const { graphService, cacheService, errorService = ErrorService, monitoringService = MonitoringService } = this.services || {};
        
        // Redact potentially sensitive data for logging
        const redactedCriteria = this.redactSensitiveData(criteria);
        
        // Log the request attempt
        monitoringService?.debug('Attempting to find people', { 
            criteria: redactedCriteria,
            timestamp: new Date().toISOString()
        }, 'people') || 
            console.log(`[MCP PEOPLE] Finding people with criteria`);
        
        if (!graphService || typeof graphService.searchPeople !== 'function') {
            const error = errorService?.createError(
                'people',
                'GraphService.searchPeople not implemented',
                'error',
                { timestamp: new Date().toISOString() }
            ) || {
                category: 'people',
                message: 'GraphService.searchPeople not implemented',
                severity: 'error',
                context: {}
            };
            
            monitoringService?.logError(error) || 
                console.error('[MCP PEOPLE] GraphService.searchPeople not implemented');
                
            throw error;
        }
        
        try {
            // Track performance
            const startTime = Date.now();
            
            // Extract search query from criteria
            const query = criteria.query || criteria.name || '';
            if (!query) {
                monitoringService?.debug('No query provided, returning relevant people', { 
                    limit: criteria.limit || 10,
                    timestamp: new Date().toISOString()
                }, 'people') || 
                    console.log(`[MCP PEOPLE] No query provided, returning relevant people`);
                    
                return await this.getRelevantPeople({ top: criteria.limit || 10 }, req);
            }
            
            // Try cache first
            const cacheKey = `people:search:${query}`;
            let results;
            let cacheHit = false;
            
            if (cacheService) {
                try {
                    results = await cacheService.get(cacheKey);
                    cacheHit = !!results;
                    
                    if (cacheHit) {
                        monitoringService?.debug('Found people in cache', { 
                            count: results.length,
                            query: 'REDACTED_QUERY',
                            timestamp: new Date().toISOString()
                        }, 'people') || 
                            console.log(`[MCP PEOPLE] Found ${results.length} people in cache`);
                    }
                } catch (cacheError) {
                    // Log cache error but continue with API call
                    monitoringService?.warn('Cache error when finding people', { 
                        error: cacheError.message,
                        timestamp: new Date().toISOString()
                    }, 'people') || 
                        console.warn(`[MCP PEOPLE] Cache error: ${cacheError.message}`);
                }
            }
            
            if (!results) {
                monitoringService?.debug('Cache miss, calling graph service', { 
                    query: 'REDACTED_QUERY',
                    limit: criteria.limit || 10,
                    timestamp: new Date().toISOString()
                }, 'people') || 
                    console.log(`[MCP PEOPLE] Cache miss, calling graph service`);
                    
                results = await graphService.searchPeople(query, { top: criteria.limit || 10 }, req);
                
                monitoringService?.debug('Found people from graph service', { 
                    count: results.length,
                    query: 'REDACTED_QUERY',
                    timestamp: new Date().toISOString()
                }, 'people') || 
                    console.log(`[MCP PEOPLE] Found ${results.length} people from graph service`);
                    
                // Cache the results
                if (cacheService) {
                    try {
                        await cacheService.set(cacheKey, results, 60); // Cache for 1 minute
                    } catch (cacheError) {
                        // Log cache error but continue
                        monitoringService?.warn('Failed to cache people search results', { 
                            error: cacheError.message,
                            timestamp: new Date().toISOString()
                        }, 'people') || 
                            console.warn(`[MCP PEOPLE] Failed to cache results: ${cacheError.message}`);
                    }
                }
            }
            
            // Calculate elapsed time and track metric
            const elapsedTime = Date.now() - startTime;
            monitoringService?.trackMetric('people_find_duration', elapsedTime, {
                count: results?.length || 0,
                cacheHit,
                hasQuery: !!query,
                timestamp: new Date().toISOString()
            });
            
            monitoringService?.info('Successfully found people', {
                count: results?.length || 0,
                cacheHit,
                hasQuery: !!query,
                elapsedTime,
                timestamp: new Date().toISOString()
            }, 'people');
            
            return results;
        } catch (error) {
            // Extract Graph API details if available
            const graphDetails = {
                statusCode: error.statusCode,
                code: error.code,
                graphRequestId: error.requestId,
                originalMessage: error.message
            };
            
            // Create a standardized error object
            const mcpError = errorService?.createError(
                'people',
                `Failed to find people: ${error.code || error.message}`,
                error.statusCode && error.statusCode >= 500 ? 'error' : 'warn',
                { 
                    graphDetails, 
                    originalError: error.stack,
                    requestParams: { criteria: redactedCriteria },
                    timestamp: new Date().toISOString()
                }
            ) || {
                category: 'people',
                message: `Failed to find people: ${error.message}`,
                severity: 'error',
                context: { graphDetails }
            };
            
            // Log the error
            monitoringService?.logError(mcpError) || 
                console.error(`[MCP PEOPLE] Failed to find people: ${error.message}`);
                
            // Throw the structured error
            throw mcpError;
        }
    },
    
    /**
     * Initializes the people module with dependencies.
     * @param {object} services - { graphService, cacheService, errorService, monitoringService }
     * @returns {object} Initialized module
     */
    init(services = {}) {
        // Destructure provided services and apply defaults
        const { graphService, cacheService, errorService = ErrorService, monitoringService = MonitoringService } = services;

        // Require graphService
        if (!graphService) {
            const err = errorService.createError(
                'people',
                "PeopleModule init failed: Required service 'graphService' is missing",
                'error',
                { missingService: 'graphService', timestamp: new Date().toISOString() }
            );
            monitoringService?.logError(err) || console.error('[MCP PEOPLE] Missing graphService in init');
            throw err;
        }

        // Store services for later use
        this.services = { graphService, cacheService, errorService, monitoringService };

        // Log successful init
        monitoringService?.info('PeopleModule initialized successfully', { timestamp: new Date().toISOString() }, 'people');
        return this;
    },
    
    /**
     * Handles people-related intents routed to this module.
     * @param {string} intent
     * @param {object} entities
     * @param {object} context
     * @returns {Promise<object>>} Normalized response
     */
    async handleIntent(intent, entities = {}, context = {}) {
        const { graphService, cacheService, errorService = ErrorService, monitoringService = MonitoringService } = this.services || {};
        
        // Redact potentially sensitive data for logging
        const redactedEntities = this.redactSensitiveData(entities);
        const redactedContext = this.redactSensitiveData(context);
        
        // Log the intent handling attempt
        monitoringService?.debug('Handling people intent', { 
            intent,
            entities: redactedEntities,
            timestamp: new Date().toISOString()
        }, 'people') || 
            console.log(`[MCP PEOPLE] Handling intent: ${intent}`);
        
        // Track performance
        const startTime = Date.now();
        
        try {
            let result;
            
            switch (intent) {
                case 'findPeople': {
                    const criteria = entities.criteria || {};
                    const results = await this.findPeople(criteria, context.req);
                    result = { type: 'peopleList', items: results };
                    break;
                }
                
                case 'searchPeople': {
                    const query = entities.query || '';
                    
                    monitoringService?.debug('Handling searchPeople intent', { 
                        hasQuery: !!query,
                        timestamp: new Date().toISOString()
                    }, 'people');
                    
                    // Try cache first if available
                    let results;
                    let cacheHit = false;
                    
                    if (cacheService) {
                        try {
                            const cacheKey = `people:search:${query}`;
                            results = await cacheService.get(cacheKey);
                            cacheHit = !!results;
                            
                            if (cacheHit) {
                                monitoringService?.debug('Found search results in cache', { 
                                    count: results.length,
                                    timestamp: new Date().toISOString()
                                }, 'people');
                            }
                        } catch (cacheError) {
                            // Log cache error but continue with API call
                            monitoringService?.warn('Cache error in searchPeople intent', { 
                                error: cacheError.message,
                                timestamp: new Date().toISOString()
                            }, 'people');
                        }
                    }
                    
                    if (!results) {
                        results = await graphService.searchPeople(query, {}, context.req);
                        
                        // Cache the results if possible
                        if (cacheService) {
                            try {
                                const cacheKey = `people:search:${query}`;
                                await cacheService.set(cacheKey, results, 60); // Cache for 1 minute
                            } catch (cacheError) {
                                // Log cache error but continue
                                monitoringService?.warn('Failed to cache search results', { 
                                    error: cacheError.message,
                                    timestamp: new Date().toISOString()
                                }, 'people');
                            }
                        }
                    }
                    
                    result = { type: 'peopleList', items: results };
                    break;
                }
                
                case 'getPersonById': {
                    const personId = entities.personId;
                    
                    if (!personId) {
                        const error = errorService?.createError(
                            'people',
                            'Person ID is required for getPersonById intent',
                            'warn',
                            { 
                                intent,
                                timestamp: new Date().toISOString() 
                            }
                        ) || {
                            category: 'people',
                            message: 'Person ID is required for getPersonById intent',
                            severity: 'warn',
                            context: { intent }
                        };
                        
                        monitoringService?.logError(error) || 
                            console.error('[MCP PEOPLE] Person ID is required for getPersonById intent');
                            
                        throw error;
                    }
                    
                    // Try cache first if available
                    let person;
                    let cacheHit = false;
                    
                    if (cacheService) {
                        try {
                            const cacheKey = `people:id:${personId}`;
                            person = await cacheService.get(cacheKey);
                            cacheHit = !!person;
                            
                            if (cacheHit) {
                                monitoringService?.debug('Found person in cache', { 
                                    timestamp: new Date().toISOString()
                                }, 'people');
                            }
                        } catch (cacheError) {
                            // Log cache error but continue with API call
                            monitoringService?.warn('Cache error in getPersonById intent', { 
                                error: cacheError.message,
                                timestamp: new Date().toISOString()
                            }, 'people');
                        }
                    }
                    
                    if (!person) {
                        person = await graphService.getPersonById(personId, context.req);
                        
                        // Cache the person if possible
                        if (cacheService) {
                            try {
                                const cacheKey = `people:id:${personId}`;
                                await cacheService.set(cacheKey, person, 300); // Cache for 5 minutes
                            } catch (cacheError) {
                                // Log cache error but continue
                                monitoringService?.warn('Failed to cache person', { 
                                    error: cacheError.message,
                                    timestamp: new Date().toISOString()
                                }, 'people');
                            }
                        }
                    }
                    
                    result = { type: 'person', person };
                    break;
                }
                
                case 'getRelevantPeople': {
                    const options = entities.options || {};
                    
                    // Try cache first if available
                    let people;
                    let cacheHit = false;
                    
                    if (cacheService) {
                        try {
                            const cacheKey = `people:relevant:${JSON.stringify(options)}`;
                            people = await cacheService.get(cacheKey);
                            cacheHit = !!people;
                            
                            if (cacheHit) {
                                monitoringService?.debug('Found relevant people in cache', { 
                                    count: people.length,
                                    timestamp: new Date().toISOString()
                                }, 'people');
                            }
                        } catch (cacheError) {
                            // Log cache error but continue with API call
                            monitoringService?.warn('Cache error in getRelevantPeople intent', { 
                                error: cacheError.message,
                                timestamp: new Date().toISOString()
                            }, 'people');
                        }
                    }
                    
                    if (!people) {
                        people = await graphService.getRelevantPeople(options, context.req);
                        
                        // Cache the results if possible
                        if (cacheService) {
                            try {
                                const cacheKey = `people:relevant:${JSON.stringify(options)}`;
                                await cacheService.set(cacheKey, people, 300); // Cache for 5 minutes
                            } catch (cacheError) {
                                // Log cache error but continue
                                monitoringService?.warn('Failed to cache relevant people', { 
                                    error: cacheError.message,
                                    timestamp: new Date().toISOString()
                                }, 'people');
                            }
                        }
                    }
                    
                    result = { type: 'peopleList', items: people };
                    break;
                }
                
                default: {
                    const unsupportedError = errorService?.createError(
                        'people',
                        `PeopleModule cannot handle intent: ${intent}`,
                        'warn',
                        { 
                            intent, 
                            moduleId: this.id,
                            timestamp: new Date().toISOString()
                        }
                    ) || {
                        category: 'people',
                        message: `The people module does not support the intent: ${intent}`,
                        severity: 'warn',
                        context: { intent, moduleId: this.id }
                    };
                    
                    monitoringService?.logError(unsupportedError) || 
                        console.warn(`[MCP PEOPLE] Unsupported people intent received: ${intent}`);
                        
                    // Track metric for unsupported intent
                    monitoringService?.trackMetric('people_unsupported_intent', 1, {
                        intent,
                        timestamp: new Date().toISOString()
                    });
                    
                    throw unsupportedError; // Throw error to signal unsupported operation
                }
            }
            
            // Calculate elapsed time and track metric
            const elapsedTime = Date.now() - startTime;
            monitoringService?.trackMetric('people_intent_handling_duration', elapsedTime, {
                intent,
                timestamp: new Date().toISOString()
            });
            
            monitoringService?.info('Successfully handled people intent', {
                intent,
                elapsedTime,
                timestamp: new Date().toISOString()
            }, 'people') || 
                console.log(`[MCP PEOPLE] Successfully handled intent: ${intent} in ${elapsedTime}ms`);
                
            return result;
        } catch (error) {
            // Calculate elapsed time even for errors
            const elapsedTime = Date.now() - startTime;
            
            // If this is already a structured MCP error, just re-throw it
            if (error.category && error.severity && error.context) {
                // Log additional timing information
                monitoringService?.trackMetric('people_intent_handling_error', elapsedTime, {
                    intent,
                    errorCategory: error.category,
                    timestamp: new Date().toISOString()
                });
                
                throw error;
            }
            
            // Otherwise, create a standardized error object
            const mcpError = errorService?.createError(
                'people',
                `Error handling people intent '${intent}': ${error.message}`,
                'error',
                { 
                    intent,
                    originalError: error.stack,
                    entities: redactedEntities,
                    elapsedTime,
                    timestamp: new Date().toISOString()
                }
            ) || {
                category: 'people',
                message: `Error handling people intent '${intent}': ${error.message}`,
                severity: 'error',
                context: { intent, entities: redactedEntities }
            };
            
            // Log the error
            monitoringService?.logError(mcpError) || 
                console.error(`[MCP PEOPLE] Error handling intent '${intent}': ${error.message}`);
                
            // Track metric for error
            monitoringService?.trackMetric('people_intent_handling_error', elapsedTime, {
                intent,
                timestamp: new Date().toISOString()
            });
            
            // Throw the structured error
            throw mcpError;
        }
    },
    id: 'people',
    name: 'Microsoft People',
    capabilities: PEOPLE_CAPABILITIES,
};

module.exports = PeopleModule;
