/**
 * @fileoverview MCP People Module - Handles people-related intents and actions for MCP.
 * Exposes: id, name, capabilities, init, handleIntent. Aligned with MCP module system.
 */

const { normalizePerson } = require('../../graph/normalizers.cjs');

const PEOPLE_CAPABILITIES = [
    'findPeople',
    'searchPeople',
    'getPersonById',
    'getRelevantPeople'
];

const PeopleModule = {
    /**
     * Gets relevant people from Microsoft Graph
     * @param {object} options - Query options
     * @param {object} req - Express request object (optional)
     * @returns {Promise<Array<object>>} List of people
     */
    async getRelevantPeople(options = {}, req) {
        const { graphService } = this.services || {};
        if (!graphService || typeof graphService.getRelevantPeople !== 'function') {
            throw new Error('GraphService.getRelevantPeople not implemented');
        }
        return await graphService.getRelevantPeople(options, req);
    },
    
    /**
     * Search for people by name or email
     * @param {string} query - Search query
     * @param {object} options - Search options
     * @param {object} req - Express request object (optional)
     * @returns {Promise<Array<object>>} List of matching people
     */
    async searchPeople(query, options = {}, req) {
        const { graphService } = this.services || {};
        if (!graphService || typeof graphService.searchPeople !== 'function') {
            throw new Error('GraphService.searchPeople not implemented');
        }
        console.log(`[People Module] Searching for people with query: ${query}, options:`, options);
        return await graphService.searchPeople(query, options, req);
    },
    
    /**
     * Get a specific person by ID
     * @param {string} personId - Person ID
     * @param {object} req - Express request object (optional)
     * @returns {Promise<object>} Person details
     */
    async getPersonById(personId, req) {
        const { graphService } = this.services || {};
        if (!graphService || typeof graphService.getPersonById !== 'function') {
            throw new Error('GraphService.getPersonById not implemented');
        }
        return await graphService.getPersonById(personId, req);
    },
    
    /**
     * Find people based on criteria (name, role, etc.)
     * @param {object} criteria - Search criteria
     * @param {object} req - Express request object (optional)
     * @returns {Promise<Array<object>>} List of matching people
     */
    async findPeople(criteria = {}, req) {
        const { graphService, cacheService } = this.services || {};
        if (!graphService || typeof graphService.searchPeople !== 'function') {
            throw new Error('GraphService.searchPeople not implemented');
        }
        
        console.log(`[People Module] Finding people with criteria:`, criteria);
        
        // Extract search query from criteria
        const query = criteria.query || criteria.name || '';
        if (!query) {
            console.log(`[People Module] No query provided, returning relevant people`);
            return await this.getRelevantPeople({ top: criteria.limit || 10 }, req);
        }
        
        // Try cache first
        const cacheKey = `people:search:${query}`;
        let results = cacheService && await cacheService.get(cacheKey);
        
        if (results) {
            console.log(`[People Module] Found ${results.length} people in cache for query: ${query}`);
        } else {
            console.log(`[People Module] Cache miss for query: ${query}, calling graph service`);
            results = await graphService.searchPeople(query, { top: criteria.limit || 10 }, req);
            console.log(`[People Module] Found ${results.length} people from graph service for query: ${query}`);
            if (cacheService) await cacheService.set(cacheKey, results, 60); // Cache for 1 minute
        }
        
        return results;
    },
    
    id: 'people',
    name: 'Microsoft People',
    capabilities: PEOPLE_CAPABILITIES,
    
    /**
     * Initializes the people module with dependencies.
     * @param {object} services - { graphService, cacheService }
     * @returns {object} Initialized module
     */
    init(services) {
        this.services = services;
        return this;
    },
    
    /**
     * Handles people-related intents routed to this module.
     * @param {string} intent
     * @param {object} entities
     * @param {object} context
     * @returns {Promise<object>} Normalized response
     */
    async handleIntent(intent, entities = {}, context = {}) {
        const { graphService, cacheService } = this.services || {};
        
        switch (intent) {
            case 'findPeople': {
                const criteria = entities.criteria || {};
                const results = await this.findPeople(criteria, context.req);
                return { type: 'peopleList', items: results };
            }
            
            case 'searchPeople': {
                const query = entities.query || '';
                const cacheKey = `people:search:${query}`;
                let results = cacheService && await cacheService.get(cacheKey);
                
                if (!results) {
                    results = await graphService.searchPeople(query, {}, context.req);
                    if (cacheService) await cacheService.set(cacheKey, results, 60);
                }
                
                return { type: 'peopleList', items: results };
            }
            
            case 'getPersonById': {
                const personId = entities.personId;
                if (!personId) throw new Error('Person ID is required');
                
                const cacheKey = `people:id:${personId}`;
                let person = cacheService && await cacheService.get(cacheKey);
                
                if (!person) {
                    person = await graphService.getPersonById(personId, context.req);
                    if (cacheService) await cacheService.set(cacheKey, person, 300); // Cache for 5 minutes
                }
                
                return { type: 'person', person };
            }
            
            case 'getRelevantPeople': {
                const options = entities.options || {};
                const cacheKey = `people:relevant:${JSON.stringify(options)}`;
                let people = cacheService && await cacheService.get(cacheKey);
                
                if (!people) {
                    people = await graphService.getRelevantPeople(options, context.req);
                    if (cacheService) await cacheService.set(cacheKey, people, 300); // Cache for 5 minutes
                }
                
                return { type: 'peopleList', items: people };
            }
            
            default:
                throw new Error(`PeopleModule cannot handle intent: ${intent}`);
        }
    }
};

module.exports = PeopleModule;
