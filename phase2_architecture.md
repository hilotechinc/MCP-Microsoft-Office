# MCP Project: Phase 2 Architecture

## System Overview

Phase 2 builds upon the foundation established in Phase 1, enhancing the desktop application with additional modules, improved context awareness, optional Redis caching, and a richer user interface. The architecture retains the same core principles while expanding capabilities:

- **Enhanced Modularity**: Adding People and SharePoint modules
- **Cross-Service Intelligence**: Deeper connections between services
- **Distributed Caching**: Optional Redis support for improved performance
- **Rich Interaction**: Enhanced UI with better formatting and visualization

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Electron Application                               │
│                                                                             │
│  ┌─────────────────┐        ┌─────────────────────────────────────────┐    │
│  │                 │        │                                         │    │
│  │   Enhanced UI   │◄──────►│   Local API Server                      │    │
│  │   (Rich Format) │        │   (Express)                             │    │
│  │                 │        │                                         │    │
│  └─────────────────┘        └────────────────────┬────────────────────┘    │
│                                                  │                          │
│                                                  ▼                          │
│  ┌─────────────────┐        ┌─────────────────────────────────────────┐    │
│  │                 │        │                                         │    │
│  │  Local Storage  │◄──────►│   Enhanced Module System                │    │
│  │  (SQLite)       │        │   (Mail, Calendar, Files, People, SP)   │    │
│  │                 │        │                                         │    │
│  └─────────────────┘        └────────────────────┬────────────────────┘    │
│                                                  │                          │
│                                                  ▼                          │
│  ┌─────────────────┐        ┌─────────────────────────────────────────┐    │
│  │                 │        │                                         │    │
│  │  Redis Cache    │◄──────►│   Cross-Service Context Engine          │    │
│  │  (Optional)     │        │   (Entity Resolution, Relationships)     │    │
│  │                 │        │                                         │    │
│  └─────────────────┘        └────────────────────┬────────────────────┘    │
│                                                  │                          │
└──────────────────────────────────────────────────┼──────────────────────────┘
                                                   │
                                                   ▼
┌─────────────────────────────┐    ┌─────────────────┐  ┌────────────────┐
│                             │    │                 │  │                │
│  Microsoft Graph API        │◄──►│  Enhanced LLM   │  │ User's Microsoft│
│  (Extended Services)        │    │  Integration    │  │ Account        │
│                             │    │                 │  │                │
└─────────────────────────────┘    └─────────────────┘  └────────────────┘
```

## Data Flow (Enhanced)

1. **User Input**: User enters natural language query in rich UI
2. **Context-Aware Processing**: 
   - Query sent to enhanced NLU Agent
   - Context from multiple services considered
   - More sophisticated LLM prompting
3. **Cross-Module Handling**:
   - Intent may be routed to multiple modules
   - Data from different modules combined
   - Entity resolution across services
4. **Caching Layer**:
   - Data cached in tiered system (memory/Redis)
   - Intelligent cache invalidation
5. **Response Generation**:
   - Rich structured data returned
   - Cross-service insights included
6. **UI Rendering**:
   - Response displayed with rich formatting
   - Context visualization provided
   - Entity relationships displayed

## Complete File Structure (Phase 2 Additions)

```
mcp-desktop/
├── package.json
├── ... [existing Phase 1 files]
├── src/
│   ├── main/
│   │   └── ... [existing Phase 1 files]
│   │
│   ├── core/
│   │   ├── ... [existing Phase 1 files]
│   │   ├── redis-cache-service.js   # Redis caching implementation
│   │   ├── cache-factory.js         # Cache implementation factory
│   │   ├── entity-resolution-service.js  # Cross-service entity resolution
│   │   └── enhanced-auth-service.js  # Improved authentication
│   │
│   ├── api/
│   │   ├── ... [existing Phase 1 files]
│   │   ├── controllers/
│   │   │   ├── ... [existing Phase 1 files]
│   │   │   ├── people-controller.js   # People API endpoints
│   │   │   ├── sharepoint-controller.js # SharePoint API endpoints
│   │   │   └── insights-controller.js  # Cross-service insights
│   │   │
│   │   └── ... [existing Phase 1 files]
│   │
│   ├── graph/
│   │   ├── ... [existing Phase 1 files]
│   │   ├── people-service.js      # People API operations
│   │   ├── sharepoint-service.js  # SharePoint API operations
│   │   └── batch-service.js       # Graph batch request handling
│   │
│   ├── modules/
│   │   ├── ... [existing Phase 1 files]
│   │   ├── people/
│   │   │   ├── index.js           # People module definition
│   │   │   └── handlers.js        # People intent handlers
│   │   │
│   │   ├── sharepoint/
│   │   │   ├── index.js           # SharePoint module definition
│   │   │   └── handlers.js        # SharePoint intent handlers
│   │   │
│   │   ├── cross-module-handlers.js  # Cross-module intent handlers
│   │   └── insights/
│   │       ├── index.js           # Insights module definition
│   │       └── generators.js      # Insight generation logic
│   │
│   ├── nlu/
│   │   ├── ... [existing Phase 1 files]
│   │   ├── prompt-templates.js    # Enhanced prompt templates
│   │   └── context-enricher.js    # Context enrichment for LLM
│   │
│   ├── services/
│   │   ├── insights-service.js    # Cross-service insights
│   │   └── notification-service.js # Notification system
│   │
│   ├── utils/
│   │   ├── ... [existing Phase 1 files]
│   │   ├── parallel-request.js    # Optimized parallel requests
│   │   ├── response-cache-strategies.js # Advanced caching strategies
│   │   ├── localization.js        # Localization support
│   │   ├── telemetry.js           # Opt-in analytics
│   │   └── accessibility.js       # Accessibility helpers
│   │
│   └── renderer/
│       ├── ... [existing Phase 1 files]
│       ├── components/
│       │   ├── ... [existing Phase 1 files]
│       │   ├── rich-message.js    # Enhanced message display
│       │   ├── enhanced-input-form.js # Improved query input
│       │   ├── context-panel.js   # Context visualization
│       │   ├── entity-card.js     # Entity display component
│       │   ├── relationship-view.js # Relationship visualization
│       │   └── insight-panel.js   # Insights display
│       │
│       └── ... [existing Phase 1 files]
│
└── ... [existing Phase 1 files]
```

## Enhanced Core Services

### Redis Cache Service
**File**: `src/core/redis-cache-service.js`

Provides Redis-based distributed caching with fallback to in-memory:
```javascript
class RedisCacheService {
  constructor(options = {}) {
    this.redisUrl = options.redisUrl || process.env.REDIS_URL;
    this.keyPrefix = options.keyPrefix || 'mcp:';
    this.fallbackCache = new Map();
    
    // Initialize Redis client if URL provided
    if (this.redisUrl) {
      this.redis = new Redis(this.redisUrl);
      this.redis.on('error', (error) => {
        console.error('Redis connection error:', error);
        this.useRedis = false;
      });
      this.useRedis = true;
    } else {
      this.useRedis = false;
    }
  }

  async get(key) {
    const prefixedKey = this.keyPrefix + key;
    
    if (this.useRedis) {
      try {
        const value = await this.redis.get(prefixedKey);
        if (value) {
          return JSON.parse(value);
        }
      } catch (error) {
        // Fall back to memory cache on Redis failure
        console.warn('Redis get failed, using memory cache:', error);
      }
    }
    
    // Use memory cache as fallback
    return this.fallbackCache.get(key) || null;
  }

  async set(key, value, ttlSeconds = 300) {
    const prefixedKey = this.keyPrefix + key;
    
    if (this.useRedis) {
      try {
        await this.redis.set(
          prefixedKey, 
          JSON.stringify(value), 
          'EX', 
          ttlSeconds
        );
      } catch (error) {
        console.warn('Redis set failed, using memory cache:', error);
      }
    }
    
    // Always update memory cache as fallback
    this.fallbackCache.set(key, value);
    
    // Set expiration for memory cache
    setTimeout(() => {
      if (this.fallbackCache.get(key) === value) {
        this.fallbackCache.delete(key);
      }
    }, ttlSeconds * 1000);
    
    return true;
  }

  async invalidate(pattern) {
    const prefixedPattern = this.keyPrefix + pattern;
    
    if (this.useRedis) {
      try {
        // Find keys matching pattern
        const keys = await this.redis.keys(prefixedPattern);
        if (keys.length > 0) {
          // Delete matching keys
          await this.redis.del(...keys);
        }
      } catch (error) {
        console.warn('Redis invalidate failed:', error);
      }
    }
    
    // Invalidate in memory cache too
    for (const key of this.fallbackCache.keys()) {
      if (key.startsWith(pattern) || key.match(new RegExp(pattern))) {
        this.fallbackCache.delete(key);
      }
    }
    
    return true;
  }
}
```

### Cache Factory
**File**: `src/core/cache-factory.js`

Provides a factory for creating the appropriate cache implementation:
```javascript
class CacheFactory {
  createCache(type = process.env.CACHE_TYPE || 'memory') {
    switch (type) {
      case 'redis':
        if (process.env.REDIS_URL) {
          return new RedisCacheService({
            redisUrl: process.env.REDIS_URL,
            keyPrefix: process.env.REDIS_KEY_PREFIX || 'mcp:'
          });
        } else {
          console.warn('Redis URL not provided, falling back to memory cache');
          return new InMemoryCacheService();
        }
        
      case 'memory':
      default:
        return new InMemoryCacheService();
    }
  }
}
```

### Entity Resolution Service
**File**: `src/core/entity-resolution-service.js`

Resolves entities across different services:
```javascript
class EntityResolutionService {
  constructor() {
    this.matchers = {
      email: this.matchByEmail.bind(this),
      name: this.matchByName.bind(this),
      id: this.matchById.bind(this)
    };
  }
  
  // Resolve a collection of entities, merging duplicates
  async resolveEntities(entities) {
    const resolved = [];
    const entityMap = new Map();
    
    // First pass: index entities by various keys
    for (const entity of entities) {
      // Generate entity fingerprint
      const fingerprint = this.generateFingerprint(entity);
      
      if (entityMap.has(fingerprint)) {
        // Merge with existing entity
        entityMap.set(
          fingerprint, 
          this.mergeEntities(entityMap.get(fingerprint), entity)
        );
      } else {
        // Add new entity
        entityMap.set(fingerprint, { ...entity, sources: [entity.source] });
      }
    }
    
    // Convert map to array
    return Array.from(entityMap.values());
  }
  
  // Generate entity fingerprint for matching
  generateFingerprint(entity) {
    if (entity.email) {
      return `email:${entity.email.toLowerCase()}`;
    } else if (entity.id) {
      return `id:${entity.id}`;
    } else if (entity.name) {
      // Normalize name: lowercase, remove extra spaces, remove punctuation
      return `name:${entity.name.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[^\w\s]/g, '')}`;
    } else {
      // Fallback to JSON representation
      return `entity:${JSON.stringify(entity)}`;
    }
  }
  
  // Merge two entities, preferring the most complete information
  mergeEntities(entity1, entity2) {
    const merged = { ...entity1 };
    
    // Add source if not already present
    if (entity2.source && !merged.sources.includes(entity2.source)) {
      merged.sources.push(entity2.source);
    }
    
    // Merge properties, preferring non-empty values
    for (const [key, value] of Object.entries(entity2)) {
      if (key === 'source' || key === 'sources') continue;
      
      if (value && (!merged[key] || this.isMoreComplete(value, merged[key]))) {
        merged[key] = value;
      }
    }
    
    return merged;
  }
  
  // Determine if value1 is more complete than value2
  isMoreComplete(value1, value2) {
    if (typeof value1 === 'string' && typeof value2 === 'string') {
      // Prefer longer strings, assuming they contain more information
      return value1.length > value2.length;
    } else if (Array.isArray(value1) && Array.isArray(value2)) {
      // Prefer longer arrays
      return value1.length > value2.length;
    } else if (typeof value1 === 'object' && typeof value2 === 'object') {
      // Prefer objects with more keys
      return Object.keys(value1).length > Object.keys(value2).length;
    }
    
    // Default to keeping existing value
    return false;
  }
}
```

## New Microsoft Graph Services

### People Service
**File**: `src/graph/people-service.js`

Handles Microsoft Graph People API operations:
```javascript
class PeopleService {
  constructor(graphClientFactory, cacheService) {
    this.graphClientFactory = graphClientFactory;
    this.cacheService = cacheService;
  }
  
  // Get user's contacts
  async getContacts(options = {}) {
    const { top = 20, skip = 0, filter = null } = options;
    const cacheKey = `contacts:${top}:${skip}:${filter || 'all'}`;
    
    // Try to get from cache first
    const cachedContacts = await this.cacheService.get(cacheKey);
    if (cachedContacts) {
      return cachedContacts;
    }
    
    // Get Graph client
    const client = await this.graphClientFactory.createClient();
    
    try {
      // Configure request
      let request = client.api('/me/contacts')
        .select('id,displayName,givenName,surname,emailAddresses,businessPhones,mobilePhone,jobTitle,department,companyName')
        .top(top)
        .skip(skip);
        
      if (filter) {
        request = request.filter(filter);
      }
      
      // Execute request
      const response = await request.get();
      
      // Normalize contacts
      const normalizedContacts = response.value.map(c => normalizeContact(c));
      
      // Cache results (1 hour TTL for contacts, which change infrequently)
      await this.cacheService.set(cacheKey, normalizedContacts, 60 * 60);
      
      return normalizedContacts;
    } catch (error) {
      console.error('Error fetching contacts:', error);
      throw new Error('Failed to fetch contacts');
    }
  }
  
  // Search for people
  async searchPeople(query, options = {}) {
    const { top = 20, sources = ['contacts', 'directory'] } = options;
    const cacheKey = `people:search:${query}:${top}:${sources.join(',')}`;
    
    // Try to get from cache first (shorter TTL for search results)
    const cachedResults = await this.cacheService.get(cacheKey);
    if (cachedResults) {
      return cachedResults;
    }
    
    // Get Graph client
    const client = await this.graphClientFactory.createClient();
    
    try {
      // Configure request
      const response = await client.api('/me/people')
        .search(query)
        .select('id,displayName,givenName,surname,emailAddresses,scoredEmailAddresses,jobTitle,department,companyName')
        .top(top)
        .get();
      
      // Normalize people
      const normalizedPeople = response.value.map(p => normalizePerson(p));
      
      // Cache results (15 minutes TTL for search results)
      await this.cacheService.set(cacheKey, normalizedPeople, 15 * 60);
      
      return normalizedPeople;
    } catch (error) {
      console.error('Error searching people:', error);
      throw new Error('Failed to search people');
    }
  }
  
  // Get organization information for a person
  async getPersonOrgInfo(personId) {
    const cacheKey = `person:org:${personId}`;
    
    // Try to get from cache first
    const cachedInfo = await this.cacheService.get(cacheKey);
    if (cachedInfo) {
      return cachedInfo;
    }
    
    // Get Graph client
    const client = await this.graphClientFactory.createClient();
    
    try {
      // Get user by ID or UPN
      const user = await client.api(`/users/${personId}`)
        .select('id,displayName,jobTitle,department,officeLocation,manager')
        .expand('manager($select=id,displayName,jobTitle)')
        .get();
      
      // Get direct reports
      const directReportsResponse = await client.api(`/users/${personId}/directReports`)
        .select('id,displayName,jobTitle,department')
        .get();
      
      // Combine information
      const orgInfo = {
        id: user.id,
        displayName: user.displayName,
        jobTitle: user.jobTitle,
        department: user.department,
        officeLocation: user.officeLocation,
        manager: user.manager ? {
          id: user.manager.id,
          displayName: user.manager.displayName,
          jobTitle: user.manager.jobTitle
        } : null,
        directReports: directReportsResponse.value.map(dr => ({
          id: dr.id,
          displayName: dr.displayName,
          jobTitle: dr.jobTitle,
          department: dr.department
        }))
      };
      
      // Cache results (4 hours TTL for org info, which changes infrequently)
      await this.cacheService.set(cacheKey, orgInfo, 4 * 60 * 60);
      
      return orgInfo;
    } catch (error) {
      console.error('Error fetching person org info:', error);
      throw new Error('Failed to fetch organization information');
    }
  }
}
```

### SharePoint Service
**File**: `src/graph/sharepoint-service.js`

Handles Microsoft Graph SharePoint API operations:
```javascript
class SharePointService {
  constructor(graphClientFactory, cacheService) {
    this.graphClientFactory = graphClientFactory;
    this.cacheService = cacheService;
  }
  
  // Get sites the user has access to
  async getSites(options = {}) {
    const { top = 50, orderBy = 'name' } = options;
    const cacheKey = `sites:${top}:${orderBy}`;
    
    // Try to get from cache first
    const cachedSites = await this.cacheService.get(cacheKey);
    if (cachedSites) {
      return cachedSites;
    }
    
    // Get Graph client
    const client = await this.graphClientFactory.createClient();
    
    try {
      // Get followed sites
      const response = await client.api('/me/followedSites')
        .select('id,displayName,name,webUrl,siteCollection,root')
        .top(top)
        .orderby(orderBy)
        .get();
      
      // Normalize sites
      const normalizedSites = response.value.map(s => normalizeSite(s));
      
      // Cache results (2 hours TTL for sites)
      await this.cacheService.set(cacheKey, normalizedSites, 2 * 60 * 60);
      
      return normalizedSites;
    } catch (error) {
      console.error('Error fetching sites:', error);
      throw new Error('Failed to fetch SharePoint sites');
    }
  }
  
  // Search for sites
  async searchSites(query) {
    const cacheKey = `sites:search:${query}`;
    
    // Try to get from cache first (shorter TTL for search)
    const cachedResults = await this.cacheService.get(cacheKey);
    if (cachedResults) {
      return cachedResults;
    }
    
    // Get Graph client
    const client = await this.graphClientFactory.createClient();
    
    try {
      // Search for sites
      const response = await client.api('/sites')
        .search(query)
        .select('id,displayName,name,webUrl,siteCollection,root')
        .get();
      
      // Normalize sites
      const normalizedSites = response.value.map(s => normalizeSite(s));
      
      // Cache results (15 minutes TTL for search results)
      await this.cacheService.set(cacheKey, normalizedSites, 15 * 60);
      
      return normalizedSites;
    } catch (error) {
      console.error('Error searching sites:', error);
      throw new Error('Failed to search SharePoint sites');
    }
  }
  
  // Get lists in a site
  async getLists(siteId) {
    const cacheKey = `site:${siteId}:lists`;
    
    // Try to get from cache first
    const cachedLists = await this.cacheService.get(cacheKey);
    if (cachedLists) {
      return cachedLists;
    }
    
    // Get Graph client
    const client = await this.graphClientFactory.createClient();
    
    try {
      // Get lists
      const response = await client.api(`/sites/${siteId}/lists`)
        .select('id,displayName,name,description,list,system')
        .expand('columns($select=name,displayName,description)')
        .get();
      
      // Filter out system lists (typically hidden)
      const userLists = response.value.filter(list => !list.system);
      
      // Normalize lists
      const normalizedLists = userLists.map(l => normalizeList(l));
      
      // Cache results (1 hour TTL for lists)
      await this.cacheService.set(cacheKey, normalizedLists, 60 * 60);
      
      return normalizedLists;
    } catch (error) {
      console.error('Error fetching lists:', error);
      throw new Error('Failed to fetch SharePoint lists');
    }
  }
  
  // Get items in a list
  async getListItems(siteId, listId, options = {}) {
    const { top = 50, filter = null } = options;
    const cacheKey = `site:${siteId}:list:${listId}:items:${top}:${filter || 'all'}`;
    
    // Try to get from cache first (short TTL, list items change frequently)
    const cachedItems = await this.cacheService.get(cacheKey);
    if (cachedItems) {
      return cachedItems;
    }
    
    // Get Graph client
    const client = await this.graphClientFactory.createClient();
    
    try {
      // Configure request
      let request = client.api(`/sites/${siteId}/lists/${listId}/items`)
        .expand('fields')
        .top(top);
        
      if (filter) {
        request = request.filter(filter);
      }
      
      // Get items
      const response = await request.get();
      
      // Extract fields from each item
      const itemsWithFields = response.value.map(item => ({
        id: item.id,
        createdDateTime: item.createdDateTime,
        lastModifiedDateTime: item.lastModifiedDateTime,
        webUrl: item.webUrl,
        // Extract all field values
        fields: item.fields
      }));
      
      // Cache results (5 minutes TTL for list items, as they change frequently)
      await this.cacheService.set(cacheKey, itemsWithFields, 5 * 60);
      
      return itemsWithFields;
    } catch (error) {
      console.error('Error fetching list items:', error);
      throw new Error('Failed to fetch SharePoint list items');
    }
  }
}
```

## New Modules

### People Module
**File**: `src/modules/people/index.js`

Implements contact-related functionality:
```javascript
module.exports = {
  id: 'people',
  name: 'People & Contacts',
  
  capabilities: [
    'findPerson',
    'getContacts',
    'getPersonDetails',
    'getOrgChart',
    'findCoworkers'
  ],
  
  // Dependencies
  peopleService: null,
  mailService: null,
  calendarService: null,
  filesService: null,
  contextService: null,
  cacheService: null,
  
  // Initialize module with services
  init(services) {
    this.peopleService = services.peopleService;
    this.mailService = services.mailService;
    this.calendarService = services.calendarService;
    this.filesService = services.filesService;
    this.contextService = services.contextService;
    this.cacheService = services.cacheService;
    
    return this;
  },
  
  // Handle people-related intents
  async handleIntent(intent, entities, context) {
    switch (intent) {
      case 'findPerson':
        return await this.handlers.findPerson(entities, context);
        
      case 'getContacts':
        return await this.handlers.getContacts(entities, context);
        
      case 'getPersonDetails':
        return await this.handlers.getPersonDetails(entities, context);
        
      case 'getOrgChart':
        return await this.handlers.getOrgChart(entities, context);
        
      case 'findCoworkers':
        return await this.handlers.findCoworkers(entities, context);
        
      default:
        throw new Error(`Unknown intent: ${intent}`);
    }
  },
  
  // Load handlers from separate file
  handlers: require('./handlers')
};
```

**File**: `src/modules/people/handlers.js`

Implements People module handlers:
```javascript
module.exports = {
  // Find a person by name or email
  async findPerson(entities, context) {
    const module = require('./index');
    const { query, email, name } = entities;
    
    try {
      let people = [];
      
      if (email) {
        // Search by exact email
        people = await module.peopleService.searchPeople(`"${email}"`);
      } else if (name) {
        // Search by name
        people = await module.peopleService.searchPeople(`"${name}"`);
      } else if (query) {
        // General search query
        people = await module.peopleService.searchPeople(query);
      } else {
        throw new Error('No search criteria provided');
      }
      
      return {
        type: 'personList',
        data: {
          people,
          query: query || email || name,
          count: people.length
        },
        possibleActions: people.length > 0 ? [
          { type: 'viewPersonDetails', personId: people[0].id },
          { type: 'findRelatedContent', personId: people[0].id },
          { type: 'findCoworkers', personId: people[0].id }
        ] : []
      };
    } catch (error) {
      console.error('Error finding person:', error);
      throw error;
    }
  },
  
  // Get user's contacts
  async getContacts(entities, context) {
    const module = require('./index');
    const { limit = 10, filter } = entities;
    
    try {
      const contacts = await module.peopleService.getContacts({
        top: limit,
        filter
      });
      
      return {
        type: 'contactList',
        data: {
          contacts,
          count: contacts.length,
          filter: filter || 'all'
        },
        possibleActions: contacts.length > 0 ? [
          { type: 'viewContactDetails', contactId: contacts[0].id },
          { type: 'filterContacts', categories: ['work', 'personal', 'other'] }
        ] : []
      };
    } catch (error) {
      console.error('Error getting contacts:', error);
      throw error;
    }
  },
  
  // Get comprehensive details about a person
  async getPersonDetails(entities, context) {
    const module = require('./index');
    const { personId, email, name } = entities;
    
    try {
      // First, identify the person
      let personIdentifier;
      
      if (personId) {
        personIdentifier = personId;
      } else if (email) {
        // Search by email to get ID
        const people = await module.peopleService.searchPeople(`"${email}"`);
        if (people.length > 0) {
          personIdentifier = people[0].id;
        } else {
          throw new Error('Person not found with that email');
        }
      } else if (name) {
        // Search by name to get ID
        const people = await module.peopleService.searchPeople(`"${name}"`);
        if (people.length > 0) {
          personIdentifier = people[0].id;
        } else {
          throw new Error('Person not found with that name');
        }
      } else {
        throw new Error('No person identifier provided');
      }
      
      // Get organization information
      const orgInfo = await module.peopleService.getPersonOrgInfo(personIdentifier);
      
      // Get recent emails (if available)
      let recentEmails = [];
      try {
        recentEmails = await module.mailService.getEmailsForPerson(
          orgInfo.mail || orgInfo.userPrincipalName, 
          5
        );
      } catch (e) {
        console.warn('Could not fetch emails for person:', e);
      }
      
      // Get upcoming meetings (if available)
      let upcomingMeetings = [];
      try {
        upcomingMeetings = await module.calendarService.getMeetingsWithAttendee(
          orgInfo.mail || orgInfo.userPrincipalName,
          5
        );
      } catch (e) {
        console.warn('Could not fetch meetings for person:', e);
      }
      
      // Get shared documents (if available)
      let sharedDocuments = [];
      try {
        sharedDocuments = await module.filesService.getSharedDocuments(
          orgInfo.mail || orgInfo.userPrincipalName,
          5
        );
      } catch (e) {
        console.warn('Could not fetch shared documents for person:', e);
      }
      
      // Compile comprehensive person details
      const personDetails = {
        ...orgInfo,
        communications: {
          emails: recentEmails,
          meetings: upcomingMeetings
        },
        documents: sharedDocuments
      };
      
      return {
        type: 'personDetails',
        data: personDetails,
        possibleActions: [
          { type: 'sendEmail', to: orgInfo.mail || orgInfo.userPrincipalName },
          { type: 'scheduleMeeting', attendees: [orgInfo.mail || orgInfo.userPrincipalName] },
          { type: 'viewOrgChart', personId: personIdentifier }
        ]
      };
    } catch (error) {
      console.error('Error getting person details:', error);
      throw error;
    }
  },
  
  // Get organizational chart for a person
  async getOrgChart(entities, context) {
    const module = require('./index');
    const { personId, email, name, levels = 1 } = entities;
    
    // Implementation similar to getPersonDetails, but focusing on org structure
    // ...
    
    return {
      type: 'orgChart',
      data: {
        // Organization chart data
      },
      possibleActions: [
        // Possible actions
      ]
    };
  },
  
  // Find coworkers of a person
  async findCoworkers(entities, context) {
    const module = require('./index');
    const { personId, email, name } = entities;
    
    // Implementation similar to getPersonDetails, but focusing on coworkers
    // ...
    
    return {
      type: 'coworkerList',
      data: {
        // Coworker data
      },
      possibleActions: [
        // Possible actions
      ]
    };
  }
};
```

### SharePoint Module
**File**: `src/modules/sharepoint/index.js`

Implements SharePoint-related functionality:
```javascript
module.exports = {
  id: 'sharepoint',
  name: 'SharePoint',
  
  capabilities: [
    'findSites',
    'getSiteLists',
    'getListItems',
    'findSharePointContent'
  ],
  
  // Dependencies
  sharepointService: null,
  filesService: null,
  contextService: null,
  cacheService: null,
  
  // Initialize module with services
  init(services) {
    this.sharepointService = services.sharepointService;
    this.filesService = services.filesService;
    this.contextService = services.contextService;
    this.cacheService = services.cacheService;
    
    return this;
  },
  
  // Handle SharePoint-related intents
  async handleIntent(intent, entities, context) {
    switch (intent) {
      case 'findSites':
        return await this.handlers.findSites(entities, context);
        
      case 'getSiteLists':
        return await this.handlers.getSiteLists(entities, context);
        
      case 'getListItems':
        return await this.handlers.getListItems(entities, context);
        
      case 'findSharePointContent':
        return await this.handlers.findSharePointContent(entities, context);
        
      default:
        throw new Error(`Unknown intent: ${intent}`);
    }
  },
  
  // Load handlers from separate file
  handlers: require('./handlers')
};
```

**File**: `src/modules/sharepoint/handlers.js`

Implements SharePoint module handlers:
```javascript
module.exports = {
  // Find SharePoint sites
  async findSites(entities, context) {
    const module = require('./index');
    const { query } = entities;
    
    try {
      let sites = [];
      
      if (query) {
        // Search for sites
        sites = await module.sharepointService.searchSites(query);
      } else {
        // Get followed sites
        sites = await module.sharepointService.getSites();
      }
      
      return {
        type: 'siteList',
        data: {
          sites,
          query: query || 'followed',
          count: sites.length
        },
        possibleActions: sites.length > 0 ? [
          { type: 'viewSite', siteId: sites[0].id },
          { type: 'viewSiteLists', siteId: sites[0].id },
          { type: 'findContent', siteId: sites[0].id }
        ] : []
      };
    } catch (error) {
      console.error('Error finding sites:', error);
      throw error;
    }
  },
  
  // Get lists in a SharePoint site
  async getSiteLists(entities, context) {
    const module = require('./index');
    const { siteId, siteName } = entities;
    
    try {
      // Identify site
      let siteIdentifier;
      
      if (siteId) {
        siteIdentifier = siteId;
      } else if (siteName) {
        // Search for site by name
        const sites = await module.sharepointService.searchSites(siteName);
        if (sites.length > 0) {
          siteIdentifier = sites[0].id;
        } else {
          throw new Error('Site not found with that name');
        }
      } else {
        throw new Error('No site identifier provided');
      }
      
      // Get lists for the site
      const lists = await module.sharepointService.getLists(siteIdentifier);
      
      // Get site details
      const sites = await module.sharepointService.getSites();
      const site = sites.find(s => s.id === siteIdentifier) || { displayName: 'Site' };
      
      return {
        type: 'listCollection',
        data: {
          site,
          lists,
          count: lists.length
        },
        possibleActions: lists.length > 0 ? lists.slice(0, 3).map(list => ({
          type: 'viewListItems',
          listId: list.id,
          siteId: siteIdentifier,
          listName: list.displayName
        })) : []
      };
    } catch (error) {
      console.error('Error getting site lists:', error);
      throw error;
    }
  },
  
  // Get items in a SharePoint list
  async getListItems(entities, context) {
    const module = require('./index');
    const { siteId, listId, listName, limit = 20, filter } = entities;
    
    try {
      // Validate required parameters
      if (!siteId) {
        throw new Error('Site ID is required');
      }
      
      // Identify list
      let listIdentifier;
      
      if (listId) {
        listIdentifier = listId;
      } else if (listName) {
        // Find list by name
        const lists = await module.sharepointService.getLists(siteId);
        const matchingList = lists.find(l => 
          l.displayName.toLowerCase() === listName.toLowerCase() ||
          l.name.toLowerCase() === listName.toLowerCase()
        );
        
        if (matchingList) {
          listIdentifier = matchingList.id;
        } else {
          throw new Error('List not found with that name');
        }
      } else {
        throw new Error('No list identifier provided');
      }
      
      // Get list items
      const items = await module.sharepointService.getListItems(siteId, listIdentifier, {
        top: limit,
        filter
      });
      
      return {
        type: 'listItems',
        data: {
          siteId,
          listId: listIdentifier,
          items,
          count: items.length
        },
        possibleActions: [
          { type: 'filterListItems', listId: listIdentifier, siteId },
          { type: 'exportListItems', listId: listIdentifier, siteId }
        ]
      };
    } catch (error) {
      console.error('Error getting list items:', error);
      throw error;
    }
  },
  
  // Find content across SharePoint
  async findSharePointContent(entities, context) {
    const module = require('./index');
    const { query, contentType, siteId } = entities;
    
    try {
      if (!query) {
        throw new Error('Search query is required');
      }
      
      // Use search API to find content
      const searchResults = await module.filesService.searchSharePointContent(query, {
        contentType,
        siteId
      });
      
      return {
        type: 'sharePointSearchResults',
        data: {
          query,
          results: searchResults,
          count: searchResults.length,
          contentType: contentType || 'all'
        },
        possibleActions: searchResults.length > 0 ? [
          { type: 'viewContent', contentId: searchResults[0].id },
          { type: 'refineSiteSearch', siteId: searchResults[0].siteId }
        ] : []
      };
    } catch (error) {
      console.error('Error searching SharePoint content:', error);
      throw error;
    }
  }
};
```

## Cross-Service Integration

### Cross-Module Handlers
**File**: `src/modules/cross-module-handlers.js`

Implements handlers that span multiple modules:
```javascript
module.exports = {
  // Find related content across services for a person
  async findRelatedContent(entities, context, services) {
    const { person, personId, email, name, timeframe } = entities;
    
    // Determine time range
    const range = parseTimeframeToDateRange(timeframe || { days: 30 });
    
    // Identify person
    let personIdentifier;
    let personEmail;
    
    if (personId) {
      personIdentifier = personId;
      // Get person details to find email
      const personDetails = await services.peopleService.getPersonOrgInfo(personIdentifier);
      personEmail = personDetails.mail || personDetails.userPrincipalName;
    } else if (email) {
      personEmail = email;
    } else if (name || person) {
      const searchName = name || person;
      // Search for person
      const people = await services.peopleService.searchPeople(searchName);
      if (people.length > 0) {
        personIdentifier = people[0].id;
        personEmail = people[0].emailAddresses[0].address;
      } else {
        throw new Error('Person not found with that name');
      }
    } else {
      throw new Error('No person identifier provided');
    }
    
    // Get data from multiple services in parallel
    const [emails, meetings, documents, sites] = await Promise.all([
      // Get emails from/to this person
      services.mailService.getEmailsForPerson(personEmail, 10, range),
      
      // Get meetings with this person
      services.calendarService.getMeetingsWithAttendee(personEmail, 5, range),
      
      // Get documents shared with this person
      services.filesService.getSharedDocuments(personEmail, 5),
      
      // Get sites where both user and this person have access
      services.sharepointService.getSharedSites(personEmail, 3)
    ]);
    
    // Get person details if we have the ID
    let personDetails = { email: personEmail };
    if (personIdentifier) {
      personDetails = await services.peopleService.getPersonOrgInfo(personIdentifier);
    }
    
    // Find common topics across content
    const topics = extractCommonTopics([
      ...emails.map(e => e.subject),
      ...meetings.map(m => m.subject),
      ...documents.map(d => d.name)
    ]);
    
    return {
      type: 'relatedContent',
      data: {
        person: personDetails,
        communications: {
          emails,
          meetings
        },
        content: {
          documents,
          sites
        },
        topics,
        timeframe: range
      },
      possibleActions: [
        { type: 'viewPersonDetails', personId: personIdentifier || personEmail },
        { type: 'sendEmail', to: personEmail },
        { type: 'scheduleMeeting', attendees: [personEmail] }
      ]
    };
  },
  
  // Find upcoming deadlines and commitments across services
  async findDeadlinesAndCommitments(entities, context, services) {
    const { timeframe, category } = entities;
    
    // Determine time range
    const range = parseTimeframeToDateRange(timeframe || { days: 14 });
    
    // Get data from multiple services in parallel
    const [
      upcomingMeetings,
      emailCommitments,
      calendarDeadlines,
      taskItems
    ] = await Promise.all([
      // Get upcoming meetings
      services.calendarService.getEvents(range.start, range.end),
      
      // Extract commitments from emails
      services.insightsService.extractEmailCommitments(range),
      
      // Find deadline-related calendar events
      services.insightsService.findDeadlineEvents(range),
      
      // Get task items from SharePoint or Planner
      services.sharepointService.getTaskItems(range)
    ]);
    
    // Combine all commitments
    const allCommitments = [
      ...upcomingMeetings.map(m => ({
        type: 'meeting',
        title: m.subject,
        date: m.start.dateTime,
        source: 'calendar',
        sourceId: m.id
      })),
      
      ...emailCommitments.map(c => ({
        type: 'commitment',
        title: c.text,
        date: c.dueDate,
        source: 'email',
        sourceId: c.emailId
      })),
      
      ...calendarDeadlines.map(d => ({
        type: 'deadline',
        title: d.subject,
        date: d.start.dateTime,
        source: 'calendar',
        sourceId: d.id
      })),
      
      ...taskItems.map(t => ({
        type: 'task',
        title: t.title,
        date: t.dueDate,
        source: 'tasks',
        sourceId: t.id
      }))
    ];
    
    // Sort by date
    allCommitments.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Filter by category if specified
    const filteredCommitments = category 
      ? allCommitments.filter(c => c.type === category)
      : allCommitments;
    
    return {
      type: 'commitments',
      data: {
        commitments: filteredCommitments,
        timeframe: range,
        groupedByDate: groupByDate(filteredCommitments),
        category: category || 'all'
      },
      possibleActions: [
        { type: 'filterCommitments', categories: ['meeting', 'deadline', 'task', 'commitment'] },
        { type: 'createReminders', items: filteredCommitments.slice(0, 3).map(c => c.sourceId) }
      ]
    };
  },
  
  // Generate project overview across services
  async generateProjectOverview(entities, context, services) {
    const { project, projectName, timeframe } = entities;
    
    const projectSearchTerm = project || projectName;
    if (!projectSearchTerm) {
      throw new Error('Project name is required');
    }
    
    // Determine time range
    const range = parseTimeframeToDateRange(timeframe || { days: 90 });
    
    // Search across services for project-related content
    const [
      relatedEmails,
      relatedMeetings,
      relatedDocuments,
      relatedSites,
      relatedPeople
    ] = await Promise.all([
      // Find project-related emails
      services.mailService.searchEmails(projectSearchTerm, { since: range.start }),
      
      // Find project-related meetings
      services.calendarService.searchEvents(projectSearchTerm, range),
      
      // Find project-related documents
      services.filesService.searchDocuments(projectSearchTerm),
      
      // Find project-related SharePoint sites
      services.sharepointService.searchSites(projectSearchTerm),
      
      // Find people associated with the project
      services.insightsService.findPeopleRelatedToTopic(projectSearchTerm)
    ]);
    
    // Extract timeline and milestones
    const timeline = extractProjectTimeline(
      relatedEmails, 
      relatedMeetings, 
      relatedDocuments
    );
    
    // Create project team based on communication frequency
    const projectTeam = createProjectTeam(relatedPeople, relatedEmails, relatedMeetings);
    
    return {
      type: 'projectOverview',
      data: {
        project: projectSearchTerm,
        timeline,
        team: projectTeam,
        content: {
          emails: relatedEmails.slice(0, 5),
          meetings: relatedMeetings.slice(0, 5),
          documents: relatedDocuments.slice(0, 5),
          sites: relatedSites.slice(0, 3)
        },
        stats: generateProjectStats(
          relatedEmails, 
          relatedMeetings, 
          relatedDocuments,
          projectTeam
        )
      },
      possibleActions: [
        { type: 'scheduleProjectMeeting', attendees: projectTeam.map(p => p.email) },
        { type: 'createProjectCollection', name: projectSearchTerm },
        { type: 'exportProjectSummary', project: projectSearchTerm }
      ]
    };
  }
};
```

### Insights Service
**File**: `src/services/insights-service.js`

Generates insights across services:
```javascript
class InsightsService {
  constructor(services) {
    this.mailService = services.mailService;
    this.calendarService = services.calendarService;
    this.filesService = services.filesService;
    this.peopleService = services.peopleService;
    this.sharepointService = services.sharepointService;
    this.entityResolutionService = services.entityResolutionService;
    this.cacheService = services.cacheService;
    this.llmService = services.llmService;
  }
  
  // Generate activity insights for a person
  async generateActivityInsights(personEmail, options = {}) {
    const { days = 30 } = options;
    const cacheKey = `insights:activity:${personEmail}:${days}`;
    
    // Check cache first (insights can be cached longer)
    const cachedInsights = await this.cacheService.get(cacheKey);
    if (cachedInsights) {
      return cachedInsights;
    }
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Get data from multiple services
    const [emails, meetings, documents] = await Promise.all([
      this.mailService.getEmailsForPerson(personEmail, 100, { start: startDate, end: endDate }),
      this.calendarService.getMeetingsWithAttendee(personEmail, 50, { start: startDate, end: endDate }),
      this.filesService.getSharedDocuments(personEmail, 50)
    ]);
    
    // Calculate communication frequency (emails per week)
    const weeksInPeriod = days / 7;
    const communicationFrequency = emails.length / weeksInPeriod;
    
    // Find top collaborators across emails and meetings
    const collaborators = this.findTopCollaborators(emails, meetings);
    
    // Extract common topics from communication
    const topics = this.extractTopics(emails, meetings, documents);
    
    // Identify pending actions or requests
    const pendingActions = this.identifyPendingActions(emails, meetings);
    
    // Generate insights
    const insights = {
      communicationFrequency,
      topCollaborators: collaborators.slice(0, 5),
      commonTopics: topics.slice(0, 5),
      pendingActions: pendingActions.slice(0, 5),
      meetingFrequency: meetings.length / weeksInPeriod,
      documentCollaboration: documents.length,
      lastInteraction: this.findLastInteraction(emails, meetings)
    };
    
    // Cache insights (1 day TTL)
    await this.cacheService.set(cacheKey, insights, 24 * 60 * 60);
    
    return insights;
  }
  
  // Extract commitments from emails
  async extractEmailCommitments(timeRange) {
    // Implementation for commitment extraction...
    // This would likely use the LLM to analyze email content
    // ...
    
    return commitments;
  }
  
  // Find deadline-related calendar events
  async findDeadlineEvents(timeRange) {
    // Implementation to identify deadline events...
    // ...
    
    return deadlineEvents;
  }
  
  // Find people related to a topic
  async findPeopleRelatedToTopic(topic) {
    // Implementation to find topic-related people...
    // ...
    
    return relatedPeople;
  }
  
  // Helper: Find top collaborators from emails and meetings
  findTopCollaborators(emails, meetings) {
    // Implementation to find collaborators...
    // ...
    
    return collaborators;
  }
  
  // Helper: Extract common topics from content
  extractTopics(emails, meetings, documents) {
    // Implementation to extract topics...
    // ...
    
    return topics;
  }
  
  // Helper: Identify pending actions
  identifyPendingActions(emails, meetings) {
    // Implementation to identify actions...
    // ...
    
    return pendingActions;
  }
  
  // Helper: Find last interaction
  findLastInteraction(emails, meetings) {
    // Implementation to find last interaction...
    // ...
    
    return lastInteraction;
  }
}
```

## Enhanced UI Components

### Rich Message Component
**File**: `src/renderer/components/rich-message.js`

Displays rich, formatted messages:
```javascript
class RichMessage {
  constructor(container) {
    this.container = container;
  }
  
  render(message) {
    // Clear container
    this.container.innerHTML = '';
    
    // Handle different message types
    switch (message.type) {
      case 'text':
        this.renderTextMessage(message);
        break;
        
      case 'markdown':
        this.renderMarkdownMessage(message);
        break;
        
      case 'code':
        this.renderCodeMessage(message);
        break;
        
      case 'table':
        this.renderTableMessage(message);
        break;
        
      case 'list':
        this.renderListMessage(message);
        break;
        
      case 'card':
        this.renderCardMessage(message);
        break;
        
      case 'entity':
        this.renderEntityMessage(message);
        break;
        
      default:
        this.renderTextMessage({ content: message.content || JSON.stringify(message) });
    }
  }
  
  renderTextMessage(message) {
    const element = document.createElement('div');
    element.className = 'text-message';
    element.textContent = message.content;
    this.container.appendChild(element);
  }
  
  renderMarkdownMessage(message) {
    const element = document.createElement('div');
    element.className = 'markdown-message';
    
    // Use marked.js to render markdown
    element.innerHTML = window.marked.parse(message.content);
    
    // Add syntax highlighting if code blocks are present
    if (element.querySelectorAll('pre code').length > 0) {
      element.querySelectorAll('pre code').forEach(block => {
        window.hljs.highlightElement(block);
      });
    }
    
    this.container.appendChild(element);
  }
  
  renderCodeMessage(message) {
    const element = document.createElement('div');
    element.className = 'code-message';
    
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    
    if (message.language) {
      code.className = `language-${message.language}`;
    }
    
    code.textContent = message.content;
    pre.appendChild(code);
    element.appendChild(pre);
    
    // Apply syntax highlighting
    window.hljs.highlightElement(code);
    
    this.container.appendChild(element);
  }
  
  renderTableMessage(message) {
    const element = document.createElement('div');
    element.className = 'table-message';
    
    const table = document.createElement('table');
    
    // Create header
    if (message.content.headers) {
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      
      message.content.headers.forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        headerRow.appendChild(th);
      });
      
      thead.appendChild(headerRow);
      table.appendChild(thead);
    }
    
    // Create body
    const tbody = document.createElement('tbody');
    
    message.content.rows.forEach(row => {
      const tr = document.createElement('tr');
      
      row.forEach(cell => {
        const td = document.createElement('td');
        td.textContent = cell;
        tr.appendChild(td);
      });
      
      tbody.appendChild(tr);
    });
    
    table.appendChild(tbody);
    element.appendChild(table);
    
    this.container.appendChild(element);
  }
  
  renderListMessage(message) {
    // Implementation for list messages...
    // ...
  }
  
  renderCardMessage(message) {
    // Implementation for card messages...
    // ...
  }
  
  renderEntityMessage(message) {
    // Implementation for entity messages...
    // ...
  }
}
```

### Context Panel Component
**File**: `src/renderer/components/context-panel.js`

Visualizes conversation context:
```javascript
class ContextPanel {
  constructor(container) {
    this.container = container;
    this.visible = false;
    this.currentContext = null;
    
    // Create panel elements
    this.createPanelElements();
  }
  
  createPanelElements() {
    // Create header
    this.header = document.createElement('div');
    this.header.className = 'context-panel-header';
    
    const title = document.createElement('h3');
    title.textContent = 'Conversation Context';
    this.header.appendChild(title);
    
    const closeButton = document.createElement('button');
    closeButton.className = 'context-panel-close';
    closeButton.textContent = '×';
    closeButton.addEventListener('click', () => this.toggle());
    this.header.appendChild(closeButton);
    
    // Create content sections
    this.entitiesSection = document.createElement('div');
    this.entitiesSection.className = 'context-panel-section';
    
    const entitiesTitle = document.createElement('h4');
    entitiesTitle.textContent = 'Entities';
    this.entitiesSection.appendChild(entitiesTitle);
    
    this.entitiesContainer = document.createElement('div');
    this.entitiesContainer.className = 'entities-container';
    this.entitiesSection.appendChild(this.entitiesContainer);
    
    // Topics section
    this.topicsSection = document.createElement('div');
    this.topicsSection.className = 'context-panel-section';
    
    const topicsTitle = document.createElement('h4');
    topicsTitle.textContent = 'Recent Topics';
    this.topicsSection.appendChild(topicsTitle);
    
    this.topicsContainer = document.createElement('div');
    this.topicsContainer.className = 'topics-container';
    this.topicsSection.appendChild(this.topicsContainer);
    
    // Add sections to container
    this.container.appendChild(this.header);
    this.container.appendChild(this.entitiesSection);
    this.container.appendChild(this.topicsSection);
    
    // Initially hide
    this.container.style.display = 'none';
  }
  
  toggle() {
    this.visible = !this.visible;
    this.container.style.display = this.visible ? 'block' : 'none';
  }
  
  update(context) {
    this.currentContext = context;
    this.render();
  }
  
  render() {
    if (!this.currentContext) return;
    
    // Clear containers
    this.entitiesContainer.innerHTML = '';
    this.topicsContainer.innerHTML = '';
    
    // Render entities
    const entityTypes = Object.keys(this.currentContext.recentEntities || {});
    
    entityTypes.forEach(type => {
      const entities = this.currentContext.recentEntities[type];
      if (!entities || entities.length === 0) return;
      
      // Render each entity
      entities.forEach(entity => {
        const entityCard = this.createEntityCard(entity, type);
        this.entitiesContainer.appendChild(entityCard);
      });
    });
    
    // Render topics
    const topics = this.currentContext.recentTopics || [];
    
    topics.forEach(topic => {
      const topicItem = document.createElement('div');
      topicItem.className = 'topic-item';
      topicItem.textContent = topic;
      this.topicsContainer.appendChild(topicItem);
    });
  }
  
  createEntityCard(entity, type) {
    const card = document.createElement('div');
    card.className = `entity-card entity-type-${type}`;
    
    // Create card content based on entity type
    switch (type) {
      case 'people':
        card.innerHTML = `
          <div class="entity-icon person-icon"></div>
          <div class="entity-content">
            <div class="entity-title">${entity.name}</div>
            <div class="entity-subtitle">${entity.email || ''}</div>
          </div>
        `;
        break;
        
      case 'documents':
        card.innerHTML = `
          <div class="entity-icon document-icon"></div>
          <div class="entity-content">
            <div class="entity-title">${entity.name}</div>
            <div class="entity-subtitle">${formatDate(entity.modified)}</div>
          </div>
        `;
        break;
        
      case 'events':
        card.innerHTML = `
          <div class="entity-icon event-icon"></div>
          <div class="entity-content">
            <div class="entity-title">${entity.title}</div>
            <div class="entity-subtitle">${formatDate(entity.start)}</div>
          </div>
        `;
        break;
        
      default:
        card.innerHTML = `
          <div class="entity-icon"></div>
          <div class="entity-content">
            <div class="entity-title">${entity.name || entity.title || 'Entity'}</div>
          </div>
        `;
    }
    
    // Add click handler
    card.addEventListener('click', () => {
      // Dispatch event for entity click
      const event = new CustomEvent('entityClick', {
        detail: { entity, type }
      });
      document.dispatchEvent(event);
    });
    
    return card;
  }
}
```

## Conclusion

The Phase 2 architecture builds on the solid foundation established in Phase 1, expanding the system's capabilities with:

1. **New Modules**: People and SharePoint modules extend the system's reach
2. **Enhanced Context**: Cross-service awareness provides richer insights
3. **Improved Caching**: Optional Redis support enables better performance
4. **Rich UI**: Enhanced message formatting and visualization
5. **Advanced Prompting**: Better LLM integration for improved understanding

The architecture maintains the same core principles while adding powerful new capabilities that make the system more valuable and insightful for users.

By implementing this Phase 2 architecture, the MCP project will deliver a more comprehensive and integrated experience, helping users to seamlessly work across Microsoft's ecosystem with natural language.