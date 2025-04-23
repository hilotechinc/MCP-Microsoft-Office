# MCP Project: Phase 3 Architecture

## System Overview

Phase 3 completes the MCP vision by building on the foundations established in Phases 1 and 2, adding the following major capabilities:

- **Teams Integration**: Complete Microsoft Teams support
- **Proactive Intelligence**: Notifications and smart suggestions
- **Cross-Device Sync**: Seamless experience across multiple devices
- **Enterprise Features**: Deployment, security, and compliance
- **Advanced Analytics**: Usage patterns and productivity insights

The architecture maintains the same core principles while adding these enterprise-ready capabilities.

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Electron Application                                │
│                                                                                 │
│  ┌─────────────────┐        ┌─────────────────────────────────────────────┐    │
│  │                 │        │                                             │    │
│  │   Advanced UI   │◄──────►│   Local API Server                          │    │
│  │   (Dashboard)   │        │   (Express)                                 │    │
│  │                 │        │                                             │    │
│  └─────────────────┘        └────────────────────┬─────────────────────────    │
│                                                  │                              │
│                                                  ▼                              │
│  ┌─────────────────┐        ┌─────────────────────────────────────────────┐    │
│  │                 │        │                                             │    │
│  │  Sync Engine    │◄──────►│   Complete Module System                    │    │
│  │  (Multi-device) │        │   (Mail, Calendar, Files, People, SP, Teams)│    │
│  │                 │        │                                             │    │
│  └─────────────────┘        └────────────────────┬─────────────────────────    │
│                                                  │                              │
│                                                  ▼                              │
│  ┌─────────────────┐        ┌─────────────────────────────────────────────┐    │
│  │                 │        │                                             │    │
│  │  Notification   │◄──────►│   Proactive Intelligence Engine             │    │
│  │  Center         │        │   (Monitoring, Insights, Assistants)        │    │
│  │                 │        │                                             │    │
│  └─────────────────┘        └────────────────────┬─────────────────────────    │
│                                                  │                              │
│  ┌─────────────────┐        ┌─────────────────────────────────────────────┐    │
│  │                 │        │                                             │    │
│  │  Enterprise     │◄──────►│   Analytics Engine                          │    │
│  │  Controls       │        │   (Usage, Productivity, Reporting)          │    │
│  │                 │        │                                             │    │
│  └─────────────────┘        └────────────────────┬─────────────────────────    │
│                                                  │                              │
└──────────────────────────────────────────────────┼──────────────────────────────┘
                                                   │
                                                   ▼
┌─────────────────────────────┐    ┌─────────────────┐  ┌────────────────┐
│                             │    │                 │  │                │
│  Microsoft Graph API        │◄──►│  Advanced LLM   │  │ User's Microsoft│
│  (Complete Services)        │    │  Integration    │  │ Account        │
│                             │    │                 │  │                │
└─────────────────────────────┘    └─────────────────┘  └────────────────┘
```

## Enhanced Data Flow

1. **Multi-Source Input**: 
   - User queries through UI
   - Proactive triggers from monitoring
   - Cross-device sync events
   - Enterprise policy changes

2. **Intelligent Routing**:
   - Requests routed to appropriate module(s)
   - Context from multiple services combined
   - Priority determined by source and content

3. **Multiple Execution Paths**:
   - Real-time responses to queries
   - Background processing for monitoring
   - Deferred execution for offline actions
   - Policy-enforced handling for enterprise requirements

4. **Tiered Output**:
   - Immediate UI responses
   - Proactive notifications
   - Cross-device synchronization
   - Analytics and reporting

## Complete File Structure (Phase 3 Additions)

```
mcp-desktop/
├── package.json
├── ... [existing Phase 1-2 files]
├── src/
│   ├── main/
│   │   └── ... [existing Phase 1-2 files]
│   │
│   ├── core/
│   │   ├── ... [existing Phase 1-2 files]
│   │   ├── multi-device-manager.js  # Cross-device synchronization
│   │   ├── enterprise-manager.js    # Enterprise policy management
│   │   └── offline-manager.js       # Offline operation management
│   │
│   ├── api/
│   │   ├── ... [existing Phase 1-2 files]
│   │   ├── controllers/
│   │   │   ├── ... [existing Phase 1-2 files]
│   │   │   ├── teams-controller.js  # Teams API endpoints
│   │   │   ├── analytics-controller.js # Analytics endpoints
│   │   │   ├── notification-controller.js # Notification endpoints
│   │   │   └── sync-controller.js   # Synchronization endpoints
│   │   │
│   │   └── ... [existing Phase 1-2 files]
│   │
│   ├── graph/
│   │   ├── ... [existing Phase 1-2 files]
│   │   ├── teams-service.js         # Teams API operations
│   │   └── advanced-batch-service.js # Enhanced batching
│   │
│   ├── modules/
│   │   ├── ... [existing Phase 1-2 files]
│   │   ├── teams/
│   │   │   ├── index.js             # Teams module definition
│   │   │   └── handlers.js          # Teams intent handlers
│   │   │
│   │   └── integration/
│   │       ├── index.js             # Integration module
│   │       └── workflows.js         # Cross-module workflows
│   │
│   ├── services/
│   │   ├── ... [existing Phase 1-2 files]
│   │   ├── notification-service.js  # Notification management
│   │   ├── monitoring-engine.js     # Proactive monitoring
│   │   ├── analytics-service.js     # Usage analytics
│   │   ├── insights-engine.js       # Advanced insights
│   │   ├── sync-service.js          # Cross-device sync
│   │   ├── offline-service.js       # Offline capabilities
│   │   ├── device-service.js        # Device management
│   │   ├── enterprise-service.js    # Enterprise features
│   │   ├── security-service.js      # Enhanced security
│   │   ├── compliance-service.js    # Compliance features
│   │   ├── performance-service.js   # Performance optimization
│   │   └── accessibility-service.js # Accessibility enhancements
│   │
│   ├── assistants/                  # Proactive assistants
│   │   ├── index.js                 # Assistant framework
│   │   ├── deadline-assistant.js    # Deadline monitoring
│   │   ├── meeting-assistant.js     # Meeting preparation
│   │   ├── email-assistant.js       # Email suggestions
│   │   └── document-assistant.js    # Document reviews
│   │
│   └── renderer/
│       ├── ... [existing Phase 1-2 files]
│       ├── components/
│       │   ├── ... [existing Phase 1-2 files]
│       │   ├── teams-components.js  # Teams UI components
│       │   ├── notification-center.js # Notification display
│       │   ├── dashboard-components.js # Analytics dashboard
│       │   ├── insight-components.js # Insight visualization
│       │   └── enterprise-controls.js # Enterprise settings UI
│       │
│       └── ... [existing Phase 1-2 files]
│
└── ... [existing Phase 1-2 files]
```

## Microsoft Teams Integration

### Teams Service
**File**: `src/graph/teams-service.js`

Handles Microsoft Graph Teams API operations:
```javascript
class TeamsService {
  constructor(graphClientFactory, cacheService) {
    this.graphClientFactory = graphClientFactory;
    this.cacheService = cacheService;
  }
  
  // Get teams the user is a member of
  async getTeams(options = {}) {
    const { top = 50 } = options;
    const cacheKey = `teams:${top}`;
    
    // Try to get from cache first
    const cachedTeams = await this.cacheService.get(cacheKey);
    if (cachedTeams) {
      return cachedTeams;
    }
    
    // Get Graph client
    const client = await this.graphClientFactory.createClient();
    
    try {
      // Get teams
      const response = await client.api('/me/joinedTeams')
        .select('id,displayName,description,isArchived,visibility')
        .top(top)
        .get();
      
      // Normalize teams
      const normalizedTeams = response.value.map(t => normalizeTeam(t));
      
      // Cache results (2 hours TTL for teams)
      await this.cacheService.set(cacheKey, normalizedTeams, 2 * 60 * 60);
      
      return normalizedTeams;
    } catch (error) {
      console.error('Error fetching teams:', error);
      throw new Error('Failed to fetch teams');
    }
  }
  
  // Get channels in a team
  async getChannels(teamId) {
    const cacheKey = `team:${teamId}:channels`;
    
    // Try to get from cache first
    const cachedChannels = await this.cacheService.get(cacheKey);
    if (cachedChannels) {
      return cachedChannels;
    }
    
    // Get Graph client
    const client = await this.graphClientFactory.createClient();
    
    try {
      // Get channels
      const response = await client.api(`/teams/${teamId}/channels`)
        .select('id,displayName,description,membershipType')
        .get();
      
      // Normalize channels
      const normalizedChannels = response.value.map(c => normalizeChannel(c));
      
      // Cache results (1 hour TTL for channels)
      await this.cacheService.set(cacheKey, normalizedChannels, 60 * 60);
      
      return normalizedChannels;
    } catch (error) {
      console.error('Error fetching channels:', error);
      throw new Error('Failed to fetch channels');
    }
  }
  
  // Get messages in a channel
  async getChannelMessages(teamId, channelId, options = {}) {
    const { top = 50 } = options;
    const cacheKey = `team:${teamId}:channel:${channelId}:messages:${top}`;
    
    // Try to get from cache first (shorter TTL for messages)
    const cachedMessages = await this.cacheService.get(cacheKey);
    if (cachedMessages) {
      return cachedMessages;
    }
    
    // Get Graph client
    const client = await this.graphClientFactory.createClient();
    
    try {
      // Get messages
      const response = await client.api(`/teams/${teamId}/channels/${channelId}/messages`)
        .top(top)
        .get();
      
      // Normalize messages
      const normalizedMessages = response.value.map(m => normalizeTeamsMessage(m));
      
      // Cache results (5 minutes TTL for messages, as they change frequently)
      await this.cacheService.set(cacheKey, normalizedMessages, 5 * 60);
      
      return normalizedMessages;
    } catch (error) {
      console.error('Error fetching channel messages:', error);
      throw new Error('Failed to fetch channel messages');
    }
  }
  
  // Get files in a channel
  async getChannelFiles(teamId, channelId) {
    const cacheKey = `team:${teamId}:channel:${channelId}:files`;
    
    // Try to get from cache first
    const cachedFiles = await this.cacheService.get(cacheKey);
    if (cachedFiles) {
      return cachedFiles;
    }
    
    // Get Graph client
    const client = await this.graphClientFactory.createClient();
    
    try {
      // Get channel drive
      const channelInfo = await client.api(`/teams/${teamId}/channels/${channelId}`)
        .select('id,displayName,filesFolder')
        .get();
      
      // Get files in the channel drive
      const driveItems = await client.api(`/drives/${channelInfo.filesFolder.driveId}/items/${channelInfo.filesFolder.id}/children`)
        .select('id,name,webUrl,lastModifiedDateTime,size,file')
        .get();
      
      // Normalize files
      const normalizedFiles = driveItems.value.map(f => normalizeFile(f));
      
      // Cache results (15 minutes TTL for files)
      await this.cacheService.set(cacheKey, normalizedFiles, 15 * 60);
      
      return normalizedFiles;
    } catch (error) {
      console.error('Error fetching channel files:', error);
      throw new Error('Failed to fetch channel files');
    }
  }
  
  // Get team members
  async getTeamMembers(teamId) {
    const cacheKey = `team:${teamId}:members`;
    
    // Try to get from cache first
    const cachedMembers = await this.cacheService.get(cacheKey);
    if (cachedMembers) {
      return cachedMembers;
    }
    
    // Get Graph client
    const client = await this.graphClientFactory.createClient();
    
    try {
      // Get members
      const response = await client.api(`/teams/${teamId}/members`)
        .select('id,displayName,userId,roles')
        .get();
      
      // Normalize members
      const normalizedMembers = response.value.map(m => normalizeTeamMember(m));
      
      // Cache results (1 hour TTL for team members)
      await this.cacheService.set(cacheKey, normalizedMembers, 60 * 60);
      
      return normalizedMembers;
    } catch (error) {
      console.error('Error fetching team members:', error);
      throw new Error('Failed to fetch team members');
    }
  }
  
  // Send message to a channel
  async sendChannelMessage(teamId, channelId, messageContent) {
    // Get Graph client
    const client = await this.graphClientFactory.createClient();
    
    try {
      // Create message
      const message = {
        body: {
          content: messageContent
        }
      };
      
      // Send message
      const response = await client.api(`/teams/${teamId}/channels/${channelId}/messages`)
        .post(message);
      
      // Invalidate messages cache
      await this.cacheService.invalidate(`team:${teamId}:channel:${channelId}:messages:`);
      
      return normalizeTeamsMessage(response);
    } catch (error) {
      console.error('Error sending channel message:', error);
      throw new Error('Failed to send channel message');
    }
  }
}
```

### Teams Module
**File**: `src/modules/teams/index.js`

Implements Teams-related functionality:
```javascript
module.exports = {
  id: 'teams',
  name: 'Microsoft Teams',
  
  capabilities: [
    'getTeams',
    'getChannels',
    'getChannelMessages',
    'sendChannelMessage',
    'getChannelFiles',
    'getTeamMembers',
    'createTeamsMeeting'
  ],
  
  // Dependencies
  teamsService: null,
  calendarService: null,
  filesService: null,
  contextService: null,
  cacheService: null,
  
  // Initialize module with services
  init(services) {
    this.teamsService = services.teamsService;
    this.calendarService = services.calendarService;
    this.filesService = services.filesService;
    this.contextService = services.contextService;
    this.cacheService = services.cacheService;
    
    return this;
  },
  
  // Handle Teams-related intents
  async handleIntent(intent, entities, context) {
    switch (intent) {
      case 'getTeams':
        return await this.handlers.getTeams(entities, context);
        
      case 'getChannels':
        return await this.handlers.getChannels(entities, context);
        
      case 'getChannelMessages':
        return await this.handlers.getChannelMessages(entities, context);
        
      case 'sendChannelMessage':
        return await this.handlers.sendChannelMessage(entities, context);
        
      case 'getChannelFiles':
        return await this.handlers.getChannelFiles(entities, context);
        
      case 'getTeamMembers':
        return await this.handlers.getTeamMembers(entities, context);
        
      case 'createTeamsMeeting':
        return await this.handlers.createTeamsMeeting(entities, context);
        
      default:
        throw new Error(`Unknown intent: ${intent}`);
    }
  },
  
  // Load handlers from separate file
  handlers: require('./handlers')
};
```

## Proactive Intelligence

### Notification Service
**File**: `src/services/notification-service.js`

Handles notification creation and delivery:
```javascript
class NotificationService {
  constructor() {
    this.notifications = [];
    this.listeners = new Map();
    this.preferences = {
      // Default preferences
      global: { enabled: true, desktop: true, sound: true },
      categories: {
        reminder: { enabled: true, desktop: true, sound: true },
        update: { enabled: true, desktop: true, sound: false },
        suggestion: { enabled: true, desktop: false, sound: false }
      }
    };
    
    // Load preferences
    this.loadPreferences();
  }
  
  // Create a new notification
  async create(notification) {
    // Generate ID if not provided
    const id = notification.id || generateId();
    
    // Create notification object
    const newNotification = {
      id,
      title: notification.title,
      body: notification.body,
      category: notification.category || 'general',
      priority: notification.priority || 'normal',
      actions: notification.actions || [],
      createdAt: new Date(),
      read: false,
      data: notification.data || {}
    };
    
    // Save notification
    this.notifications.unshift(newNotification);
    
    // Limit stored notifications (keep last 100)
    if (this.notifications.length > 100) {
      this.notifications = this.notifications.slice(0, 100);
    }
    
    // Save to storage
    await this.saveNotifications();
    
    // Deliver notification if enabled
    const categoryPrefs = this.preferences.categories[newNotification.category] || this.preferences.global;
    if (this.preferences.global.enabled && categoryPrefs.enabled) {
      await this.deliver(id);
    }
    
    return newNotification;
  }
  
  // Deliver a notification to appropriate channels
  async deliver(notificationId) {
    const notification = this.notifications.find(n => n.id === notificationId);
    if (!notification) {
      throw new Error(`Notification not found: ${notificationId}`);
    }
    
    // Get preferences for this category
    const categoryPrefs = this.preferences.categories[notification.category] || this.preferences.global;
    
    const deliveryMethods = [];
    
    // In-app notification
    deliveryMethods.push('in-app');
    this.notifyListeners('notification', notification);
    
    // Desktop notification (if enabled)
    if (categoryPrefs.desktop) {
      try {
        await this.showDesktopNotification(notification);
        deliveryMethods.push('desktop');
      } catch (error) {
        console.error('Failed to show desktop notification:', error);
      }
    }
    
    // Play sound (if enabled)
    if (categoryPrefs.sound) {
      try {
        await this.playNotificationSound(notification.priority);
        deliveryMethods.push('sound');
      } catch (error) {
        console.error('Failed to play notification sound:', error);
      }
    }
    
    return {
      success: true,
      deliveredTo: deliveryMethods
    };
  }
  
  // Show desktop notification
  async showDesktopNotification(notification) {
    // Use Electron's notification API
    const { Notification } = require('electron');
    
    const desktopNotification = new Notification({
      title: notification.title,
      body: notification.body,
      silent: true // We handle sounds separately
    });
    
    desktopNotification.show();
    
    // Return a promise that resolves when the notification is clicked or closed
    return new Promise((resolve) => {
      desktopNotification.on('click', () => {
        this.markAsRead(notification.id);
        resolve({ clicked: true });
      });
      
      desktopNotification.on('close', () => {
        resolve({ clicked: false });
      });
    });
  }
  
  // Play notification sound
  async playNotificationSound(priority = 'normal') {
    // Different sound for different priorities
    const sound = priority === 'high' ? 'notification-high.mp3' : 'notification.mp3';
    
    // Use HTML5 Audio API
    const audio = new Audio(`./sounds/${sound}`);
    return audio.play();
  }
  
  // Get all notifications
  async getAll() {
    return this.notifications;
  }
  
  // Get unread notifications
  async getUnread() {
    return this.notifications.filter(n => !n.read);
  }
  
  // Get recent notifications
  async getRecent(limit = 10) {
    return this.notifications.slice(0, limit);
  }
  
  // Mark notification as read
  async markAsRead(notificationId) {
    const notification = this.notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.read = true;
      await this.saveNotifications();
      this.notifyListeners('read', notification);
      return true;
    }
    return false;
  }
  
  // Update notification preferences
  async updatePreferences(category, preferences) {
    if (category === 'global') {
      this.preferences.global = {
        ...this.preferences.global,
        ...preferences
      };
    } else {
      this.preferences.categories[category] = {
        ...this.preferences.categories[category],
        ...preferences
      };
    }
    
    await this.savePreferences();
    return this.preferences;
  }
  
  // Get notification preferences
  async getPreferences() {
    return this.preferences;
  }
  
  // Add notification listener
  addListener(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    
    // Return a function to remove the listener
    return () => {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    };
  }
  
  // Notify all listeners of an event
  notifyListeners(event, data) {
    if (this.listeners.has(event)) {
      for (const callback of this.listeners.get(event)) {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in notification listener for ${event}:`, error);
        }
      }
    }
  }
  
  // Save notifications to storage
  async saveNotifications() {
    try {
      await window.api.storageSet('notifications', this.notifications);
    } catch (error) {
      console.error('Failed to save notifications:', error);
    }
  }
  
  // Load notifications from storage
  async loadNotifications() {
    try {
      const storedNotifications = await window.api.storageGet('notifications');
      if (storedNotifications) {
        this.notifications = storedNotifications;
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  }
  
  // Save preferences to storage
  async savePreferences() {
    try {
      await window.api.storageSet('notification-preferences', this.preferences);
    } catch (error) {
      console.error('Failed to save notification preferences:', error);
    }
  }
  
  // Load preferences from storage
  async loadPreferences() {
    try {
      const storedPreferences = await window.api.storageGet('notification-preferences');
      if (storedPreferences) {
        this.preferences = storedPreferences;
      }
    } catch (error) {
      console.error('Failed to load notification preferences:', error);
    }
  }
}
```

### Monitoring Engine
**File**: `src/services/monitoring-engine.js`

Proactively monitors for conditions:
```javascript
class MonitoringEngine {
  constructor(services) {
    this.services = services;
    this.rules = [];
    this.running = false;
    this.checkInterval = 5 * 60 * 1000; // 5 minutes default
    this.lastRun = null;
    
    // Load rules
    this.loadRules();
  }
  
  // Start monitoring
  async start() {
    if (this.running) return;
    
    this.running = true;
    this.scheduleNextCheck();
    
    // Register event listeners
    this.registerEventListeners();
    
    console.log('Monitoring engine started');
  }
  
  // Stop monitoring
  async stop() {
    this.running = false;
    
    // Unregister event listeners
    this.unregisterEventListeners();
    
    console.log('Monitoring engine stopped');
  }
  
  // Schedule next check
  scheduleNextCheck() {
    if (!this.running) return;
    
    setTimeout(() => {
      this.checkAllRules()
        .then(() => {
          this.lastRun = new Date();
          this.scheduleNextCheck();
        })
        .catch(error => {
          console.error('Error checking monitoring rules:', error);
          this.scheduleNextCheck();
        });
    }, this.checkInterval);
  }
  
  // Register event listeners for relevant events
  registerEventListeners() {
    // Listen for calendar events
    this.services.eventService.subscribe('calendar:eventAdded', this.handleCalendarEvent.bind(this));
    this.services.eventService.subscribe('calendar:eventUpdated', this.handleCalendarEvent.bind(this));
    
    // Listen for email events
    this.services.eventService.subscribe('mail:received', this.handleEmailReceived.bind(this));
    
    // Listen for task events
    this.services.eventService.subscribe('tasks:taskAdded', this.handleTaskAdded.bind(this));
    this.services.eventService.subscribe('tasks:taskUpdated', this.handleTaskUpdated.bind(this));
  }
  
  // Unregister event listeners
  unregisterEventListeners() {
    this.services.eventService.unsubscribeAll(this);
  }
  
  // Handle calendar event
  async handleCalendarEvent(event) {
    await this.processEvent('calendar_event', event);
  }
  
  // Handle email received
  async handleEmailReceived(email) {
    await this.processEvent('email_received', email);
  }
  
  // Handle task added
  async handleTaskAdded(task) {
    await this.processEvent('task_added', task);
  }
  
  // Handle task updated
  async handleTaskUpdated(task) {
    await this.processEvent('task_updated', task);
  }
  
  // Process event against rules
  async processEvent(eventType, eventData) {
    // Find rules that apply to this event type
    const applicableRules = this.rules.filter(rule => 
      rule.condition.type === eventType ||
      (eventType === 'calendar_event' && rule.condition.type === 'upcoming_event')
    );
    
    // Check each rule
    for (const rule of applicableRules) {
      const matches = await this.checkRuleCondition(rule, eventData);
      if (matches) {
        await this.executeRuleAction(rule, eventData);
      }
    }
  }
  
  // Check all rules
  async checkAllRules() {
    console.log('Checking all monitoring rules');
    
    for (const rule of this.rules) {
      try {
        // Some rules need to be checked proactively
        switch (rule.condition.type) {
          case 'upcoming_event':
            await this.checkUpcomingEvents(rule);
            break;
            
          case 'deadline_approaching':
            await this.checkDeadlines(rule);
            break;
            
          case 'email_no_response':
            await this.checkNoResponseEmails(rule);
            break;
            
          case 'low_disk_space':
            await this.checkDiskSpace(rule);
            break;
            
          // Other rule types...
        }
      } catch (error) {
        console.error(`Error checking rule ${rule.id}:`, error);
      }
    }
  }
  
  // Check for upcoming events
  async checkUpcomingEvents(rule) {
    const minutesBefore = rule.condition.minutesBefore || 15;
    const now = new Date();
    
    // Get events starting soon
    const startTime = new Date();
    const endTime = new Date(now.getTime() + minutesBefore * 60 * 1000);
    
    const events = await this.services.calendarService.getEvents(startTime, endTime);
    
    for (const event of events) {
      // Skip events that are too far in the future
      const eventStart = new Date(event.start.dateTime);
      const minutesUntilStart = (eventStart - now) / (60 * 1000);
      
      if (minutesUntilStart <= minutesBefore && minutesUntilStart > 0) {
        // Check if notification already sent for this event
        const notificationKey = `event:reminder:${event.id}:${minutesBefore}`;
        const alreadySent = await this.services.cacheService.get(notificationKey);
        
        if (!alreadySent) {
          // Mark as notified
          await this.services.cacheService.set(notificationKey, true, 60 * 60); // 1 hour TTL
          
          // Execute rule action
          await this.executeRuleAction(rule, event);
        }
      }
    }
  }
  
  // Create a new rule
  async createRule(ruleDefinition) {
    const id = ruleDefinition.id || generateId();
    
    const rule = {
      id,
      name: ruleDefinition.name,
      condition: ruleDefinition.condition,
      action: ruleDefinition.action,
      createdAt: new Date(),
      enabled: true
    };
    
    this.rules.push(rule);
    await this.saveRules();
    
    return rule;
  }
  
  // Update an existing rule
  async updateRule(ruleId, updates) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }
    
    // Update rule properties
    Object.assign(rule, updates);
    
    await this.saveRules();
    return rule;
  }
  
  // Delete a rule
  async deleteRule(ruleId) {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index === -1) {
      throw new Error(`Rule not found: ${ruleId}`);
    }
    
    this.rules.splice(index, 1);
    await this.saveRules();
    
    return true;
  }
  
  // Get all rules
  async getRules() {
    return this.rules;
  }
  
  // Check if a rule condition matches
  async checkRuleCondition(rule, data) {
    // Implement condition checking based on rule type
    switch (rule.condition.type) {
      case 'upcoming_event':
        // Check if event is approaching
        return this.checkUpcomingEventCondition(rule.condition, data);
        
      case 'email_received':
        // Check if email matches criteria
        return this.checkEmailCondition(rule.condition, data);
        
      case 'deadline_approaching':
        // Check if deadline is approaching
        return this.checkDeadlineCondition(rule.condition, data);
        
      // Other condition types...
        
      default:
        console.warn(`Unknown rule condition type: ${rule.condition.type}`);
        return false;
    }
  }
  
  // Execute a rule action
  async executeRuleAction(rule, data) {
    try {
      // Implement action execution based on action type
      switch (rule.action.type) {
        case 'notification':
          await this.executeNotificationAction(rule.action, data);
          break;
          
        case 'email':
          await this.executeEmailAction(rule.action, data);
          break;
          
        case 'function':
          await this.executeFunctionAction(rule.action, data);
          break;
          
        // Other action types...
          
        default:
          console.warn(`Unknown rule action type: ${rule.action.type}`);
      }
    } catch (error) {
      console.error(`Error executing rule action for rule ${rule.id}:`, error);
    }
  }
  
  // Execute notification action
  async executeNotificationAction(action, data) {
    // Format title and body using templates
    const title = this.formatTemplate(action.titleTemplate, data);
    const body = this.formatTemplate(action.bodyTemplate, data);
    
    // Create notification
    await this.services.notificationService.create({
      title,
      body,
      category: action.category || 'monitoring',
      priority: action.priority || 'normal',
      data: {
        ruleData: data,
        actionType: 'notification'
      }
    });
  }
  
  // Format template with data
  formatTemplate(template, data) {
    return template.replace(/\{\{(.+?)\}\}/g, (match, key) => {
      const keys = key.trim().split('.');
      let value = data;
      
      // Navigate nested properties
      for (const k of keys) {
        if (value === undefined || value === null) return match;
        value = value[k];
      }
      
      return value !== undefined ? value : match;
    });
  }
  
  // Load rules from storage
  async loadRules() {
    try {
      const storedRules = await window.api.storageGet('monitoring-rules');
      if (storedRules) {
        this.rules = storedRules;
      } else {
        // Load default rules
        this.rules = await this.getDefaultRules();
      }
    } catch (error) {
      console.error('Failed to load monitoring rules:', error);
      // Load default rules
      this.rules = await this.getDefaultRules();
    }
  }
  
  // Save rules to storage
  async saveRules() {
    try {
      await window.api.storageSet('monitoring-rules', this.rules);
    } catch (error) {
      console.error('Failed to save monitoring rules:', error);
    }
  }
  
  // Get default monitoring rules
  async getDefaultRules() {
    return [
      // Meeting reminder rule
      {
        id: 'default-meeting-reminder',
        name: 'Meeting Reminder',
        condition: {
          type: 'upcoming_event',
          minutesBefore: 10,
          source: 'calendar'
        },
        action: {
          type: 'notification',
          category: 'reminder',
          priority: 'normal',
          titleTemplate: 'Meeting starting soon',
          bodyTemplate: '{{subject}} starts in 10 minutes'
        },
        enabled: true,
        createdAt: new Date()
      },
      
      // Email from VIP rule
      {
        id: 'default-vip-email',
        name: 'Important Email',
        condition: {
          type: 'email_received',
          from: ['boss@example.com', 'vip@example.com'],
          importance: 'high'
        },
        action: {
          type: 'notification',
          category: 'reminder',
          priority: 'high',
          titleTemplate: 'Important email received',
          bodyTemplate: 'From {{from.name}}: {{subject}}'
        },
        enabled: true,
        createdAt: new Date()
      }
    ];
  }
}
```

## Cross-Device Synchronization

### Sync Service
**File**: `src/services/sync-service.js`

Manages data synchronization across devices:
```javascript
class SyncService {
  constructor(services) {
    this.services = services;
    this.deviceId = null;
    this.syncEnabled = true;
    this.lastSyncTime = null;
    this.syncInProgress = false;
    this.syncQueue = [];
    this.syncInterval = 5 * 60 * 1000; // 5 minutes
    this.syncTimer = null;
    
    // Load device ID
    this.loadDeviceId();
  }
  
  // Initialize sync service
  async init() {
    if (!this.deviceId) {
      await this.registerDevice();
    }
    
    // Start periodic sync
    this.startPeriodicSync();
    
    return this;
  }
  
  // Start periodic sync
  startPeriodicSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
    
    this.syncTimer = setInterval(() => {
      if (this.syncEnabled && !this.syncInProgress) {
        this.sync().catch(error => {
          console.error('Error during periodic sync:', error);
        });
      }
    }, this.syncInterval);
  }
  
  // Stop periodic sync
  stopPeriodicSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }
  
  // Perform a full sync
  async sync() {
    if (this.syncInProgress) {
      return { alreadyInProgress: true };
    }
    
    this.syncInProgress = true;
    
    try {
      // Process outgoing changes
      const pushResult = await this.pushChanges();
      
      // Get incoming changes
      const pullResult = await this.pullChanges();
      
      // Update last sync time
      this.lastSyncTime = new Date();
      await this.saveLastSyncTime();
      
      this.syncInProgress = false;
      
      return {
        success: true,
        pushed: pushResult.changes.length,
        pulled: pullResult.changes.length,
        timestamp: this.lastSyncTime
      };
    } catch (error) {
      this.syncInProgress = false;
      console.error('Sync failed:', error);
      throw error;
    }
  }
  
  // Push local changes to server
  async pushChanges() {
    // Get changes from queue
    const pendingChanges = [...this.syncQueue];
    
    if (pendingChanges.length === 0) {
      return { changes: [] };
    }
    
    // Send changes to sync service
    const response = await this.services.graphService.syncClient.pushChanges({
      deviceId: this.deviceId,
      changes: pendingChanges
    });
    
    // Remove processed changes from queue
    this.syncQueue = this.syncQueue.filter(change => 
      !pendingChanges.some(pc => pc.id === change.id)
    );
    
    return { changes: pendingChanges, response };
  }
  
  // Pull changes from server
  async pullChanges() {
    // Get timestamp of last sync
    const timestamp = this.lastSyncTime ? this.lastSyncTime.toISOString() : null;
    
    // Get changes from sync service
    const response = await this.services.graphService.syncClient.getChanges({
      deviceId: this.deviceId,
      since: timestamp
    });
    
    const changes = response.changes || [];
    
    // Apply each change
    for (const change of changes) {
      await this.applyChange(change);
    }
    
    return { changes, response };
  }
  
  // Apply a change locally
  async applyChange(change) {
    try {
      // Skip changes from this device
      if (change.deviceId === this.deviceId) {
        return { skipped: true };
      }
      
      // Apply based on change type
      switch (change.type) {
        case 'settings':
          await this.services.storageService.setSetting(change.key, change.value);
          break;
          
        case 'preference':
          await this.services.preferencesService.setPreference(change.key, change.value);
          break;
          
        case 'notification':
          await this.services.notificationService.syncNotification(change.data);
          break;
          
        case 'analytics':
          await this.services.analyticsService.syncAnalytics(change.data);
          break;
          
        default:
          console.warn(`Unknown change type: ${change.type}`);
      }
      
      return { applied: true };
    } catch (error) {
      console.error(`Error applying change ${change.id}:`, error);
      throw error;
    }
  }
  
  // Queue a change for sync
  async pushChange(change) {
    // Generate ID and add metadata
    const syncChange = {
      id: change.id || generateId(),
      deviceId: this.deviceId,
      timestamp: new Date().toISOString(),
      ...change
    };
    
    // Add to queue
    this.syncQueue.push(syncChange);
    
    // Trigger immediate sync if needed
    if (this.syncEnabled && !this.syncInProgress && this.syncQueue.length === 1) {
      await this.sync();
    }
    
    return syncChange;
  }
  
  // Register this device
  async registerDevice() {
    // Generate device ID
    this.deviceId = generateDeviceId();
    
    // Get device info
    const deviceInfo = {
      id: this.deviceId,
      name: getDeviceName(),
      platform: getPlatform(),
      osVersion: getOSVersion(),
      appVersion: getAppVersion(),
      registeredAt: new Date().toISOString()
    };
    
    // Register with sync service
    await this.services.graphService.syncClient.registerDevice(deviceInfo);
    
    // Save device ID locally
    await this.saveDeviceId();
    
    return deviceInfo;
  }
  
  // Resolve a sync conflict
  async resolveConflict(key, resolution) {
    // Apply resolution locally
    switch (resolution.type) {
      case 'settings':
        await this.services.storageService.setSetting(key, resolution.selectedValue);
        break;
        
      case 'preference':
        await this.services.preferencesService.setPreference(key, resolution.selectedValue);
        break;
        
      default:
        throw new Error(`Unknown resolution type: ${resolution.type}`);
    }
    
    // Push resolution to sync service
    await this.pushChange({
      type: resolution.type,
      key,
      value: resolution.selectedValue,
      isConflictResolution: true
    });
    
    return {
      success: true,
      key,
      finalValue: resolution.selectedValue
    };
  }
  
  // Enable or disable sync
  async setEnabled(enabled) {
    this.syncEnabled = enabled;
    
    if (enabled) {
      this.startPeriodicSync();
    } else {
      this.stopPeriodicSync();
    }
    
    // Save setting
    await this.services.storageService.setSetting('sync.enabled', enabled);
    
    return { enabled };
  }
  
  // Get sync status
  async getStatus() {
    return {
      enabled: this.syncEnabled,
      lastSync: this.lastSyncTime,
      deviceId: this.deviceId,
      pendingChanges: this.syncQueue.length,
      inProgress: this.syncInProgress
    };
  }
  
  // Load device ID from storage
  async loadDeviceId() {
    try {
      this.deviceId = await this.services.storageService.getSetting('sync.deviceId');
    } catch (error) {
      console.error('Failed to load device ID:', error);
    }
  }
  
  // Save device ID to storage
  async saveDeviceId() {
    try {
      await this.services.storageService.setSetting('sync.deviceId', this.deviceId);
    } catch (error) {
      console.error('Failed to save device ID:', error);
    }
  }
  
  // Load last sync time from storage
  async loadLastSyncTime() {
    try {
      const timestamp = await this.services.storageService.getSetting('sync.lastSyncTime');
      if (timestamp) {
        this.lastSyncTime = new Date(timestamp);
      }
    } catch (error) {
      console.error('Failed to load last sync time:', error);
    }
  }
  
  // Save last sync time to storage
  async saveLastSyncTime() {
    try {
      await this.services.storageService.setSetting(
        'sync.lastSyncTime',
        this.lastSyncTime ? this.lastSyncTime.toISOString() : null
      );
    } catch (error) {
      console.error('Failed to save last sync time:', error);
    }
  }
}
```

## Enterprise Features

### Enterprise Service
**File**: `src/services/enterprise-service.js`

Manages enterprise-specific features:
```javascript
class EnterpriseService {
  constructor(services) {
    this.services = services;
    this.policies = {};
    this.userRole = 'user';
    this.enterpriseMode = false;
    
    // Load enterprise settings
    this.loadEnterpriseSettings();
  }
  
  // Initialize enterprise service
  async init() {
    // Detect enterprise mode
    this.enterpriseMode = await this.detectEnterpriseMode();
    
    if (this.enterpriseMode) {
      // Try to get policies from management service
      await this.fetchPolicies();
    }
    
    return this;
  }
  
  // Detect if running in enterprise mode
  async detectEnterpriseMode() {
    // Check for enterprise configurations
    try {
      // Check for group policy settings
      const groupPolicyExists = await this.checkGroupPolicyExists();
      if (groupPolicyExists) {
        return true;
      }
      
      // Check for enterprise tenant
      const isEnterpriseTenant = await this.isEnterpriseTenant();
      if (isEnterpriseTenant) {
        return true;
      }
      
      // Check for environment variable
      if (process.env.ENTERPRISE_MODE === 'true') {
        return true;
      }
      
      // Check for registry setting (Windows)
      if (process.platform === 'win32') {
        const registryValue = await this.getRegistryValue('HKLM\\Software\\MCP\\EnterpriseMode');
        if (registryValue === 'true') {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error detecting enterprise mode:', error);
      return false;
    }
  }
  
  // Apply group policy
  async applyGroupPolicy(policy) {
    if (!this.enterpriseMode) {
      throw new Error('Cannot apply group policy in non-enterprise mode');
    }
    
    // Merge with existing policies
    this.policies = {
      ...this.policies,
      ...policy
    };
    
    // Apply policies to various services
    
    // Feature enablement
    if (policy.features) {
      for (const [feature, settings] of Object.entries(policy.features)) {
        await this.applyFeaturePolicy(feature, settings);
      }
    }
    
    // Security settings
    if (policy.security) {
      await this.applySecurityPolicies(policy.security);
    }
    
    // Save policies
    await this.savePolicies();
    
    return this.policies;
  }
  
  // Apply feature-specific policy
  async applyFeaturePolicy(feature, settings) {
    switch (feature) {
      case 'teams':
        // Enable/disable Teams module
        await this.services.moduleRegistry.setModuleEnabled('teams', settings.enabled);
        break;
        
      case 'sharepoint':
        // Enable/disable SharePoint module
        await this.services.moduleRegistry.setModuleEnabled('sharepoint', settings.enabled);
        break;
        
      case 'analytics':
        // Enable/disable analytics
        if (this.services.analyticsService) {
          await this.services.analyticsService.setEnabled(settings.enabled);
        }
        break;
        
      case 'sync':
        // Configure sync settings
        if (this.services.syncService) {
          await this.services.syncService.setEnabled(settings.enabled);
        }
        break;
        
      default:
        console.warn(`Unknown feature in policy: ${feature}`);
    }
  }
  
  // Apply security policies
  async applySecurityPolicies(securityPolicies) {
    // Token storage policy
    if (securityPolicies.tokenStorage) {
      await this.services.securityService.setTokenStorageMode(securityPolicies.tokenStorage);
    }
    
    // Offline access policy
    if (securityPolicies.offlineAccess) {
      await this.services.offlineService.setAccessMode(securityPolicies.offlineAccess);
    }
    
    // Content sharing policy
    if (securityPolicies.contentSharing) {
      await this.services.securityService.setContentSharingPolicy(securityPolicies.contentSharing);
    }
    
    // Other security policies...
  }
  
  // Get applied policies
  async getAppliedPolicy() {
    return this.policies;
  }
  
  // Set user role
  async setUserRole(role) {
    this.userRole = role;
    await this.services.storageService.setSetting('enterprise.userRole', role);
    return { role };
  }
  
  // Check if user has access to a feature
  async checkAccess(feature) {
    // If not in enterprise mode, allow all
    if (!this.enterpriseMode) {
      return true;
    }
    
    // Check role-based permissions
    switch (feature) {
      case 'admin_dashboard':
        return this.userRole === 'admin';
        
      case 'reporting':
        return ['admin', 'manager'].includes(this.userRole);
        
      case 'user_management':
        return this.userRole === 'admin';
        
      // Default access control
      default:
        // Check if there's a policy for this feature
        if (this.policies.features && this.policies.features[feature]) {
          return this.policies.features[feature].enabled;
        }
        
        // Allow by default
        return true;
    }
  }
  
  // Get available features for current user
  async getAvailableFeatures() {
    const features = [];
    
    // Basic features
    features.push('mail', 'calendar', 'files');
    
    // Additional features based on policies
    if (!this.policies.features || this.policies.features.teams?.enabled !== false) {
      features.push('teams');
    }
    
    if (!this.policies.features || this.policies.features.sharepoint?.enabled !== false) {
      features.push('sharepoint');
    }
    
    // Admin features
    if (this.userRole === 'admin') {
      features.push('admin_dashboard', 'user_management', 'policy_management');
    }
    
    if (['admin', 'manager'].includes(this.userRole)) {
      features.push('reporting', 'analytics');
    }
    
    return features;
  }
  
  // Fetch policies from management service
  async fetchPolicies() {
    try {
      // Try to get policies from server
      const policies = await this.services.graphService.enterpriseClient.getPolicies();
      
      if (policies) {
        // Apply fetched policies
        this.policies = policies;
        
        // Apply to services
        for (const [feature, settings] of Object.entries(policies.features || {})) {
          await this.applyFeaturePolicy(feature, settings);
        }
        
        if (policies.security) {
          await this.applySecurityPolicies(policies.security);
        }
      }
    } catch (error) {
      console.error('Failed to fetch enterprise policies:', error);
      
      // Fall back to stored policies
      await this.loadPolicies();
    }
  }
  
  // Load policies from storage
  async loadPolicies() {
    try {
      const storedPolicies = await this.services.storageService.getSetting('enterprise.policies');
      if (storedPolicies) {
        this.policies = storedPolicies;
      }
    } catch (error) {
      console.error('Failed to load enterprise policies:', error);
    }
  }
  
  // Save policies to storage
  async savePolicies() {
    try {
      await this.services.storageService.setSetting('enterprise.policies', this.policies);
    } catch (error) {
      console.error('Failed to save enterprise policies:', error);
    }
  }
  
  // Load enterprise settings
  async loadEnterpriseSettings() {
    try {
      // Load user role
      const userRole = await this.services.storageService.getSetting('enterprise.userRole');
      if (userRole) {
        this.userRole = userRole;
      }
      
      // Load policies
      await this.loadPolicies();
    } catch (error) {
      console.error('Failed to load enterprise settings:', error);
    }
  }
}
```

## Analytics and Insights

### Analytics Service
**File**: `src/services/analytics-service.js`

Collects and analyzes usage data:
```javascript
class AnalyticsService {
  constructor(services) {
    this.services = services;
    this.enabled = false;
    this.events = [];
    this.sessionId = generateId();
    this.sessionStartTime = new Date();
    
    // Load settings
    this.loadSettings();
  }
  
  // Initialize analytics service
  async init() {
    // Check if analytics are enabled
    await this.checkEnabled();
    
    // Add session start event
    if (this.enabled) {
      await this.trackSystemEvent('session_start', {
        sessionId: this.sessionId,
        timestamp: this.sessionStartTime
      });
    }
    
    return this;
  }
  
  // Track an event
  async trackEvent(eventType, data = {}) {
    if (!this.enabled) {
      return null;
    }
    
    const event = {
      id: generateId(),
      type: eventType,
      data,
      timestamp: new Date(),
      sessionId: this.sessionId
    };
    
    // Add to events array
    this.events.push(event);
    
    // Limit stored events (keep last 1000)
    if (this.events.length > 1000) {
      this.events = this.events.slice(-1000);
    }
    
    // Save events
    await this.saveEvents();
    
    return event;
  }
  
  // Track system events (not user actions)
  async trackSystemEvent(eventType, data = {}) {
    if (!this.enabled) {
      return null;
    }
    
    const event = {
      id: generateId(),
      type: eventType,
      system: true,
      data,
      timestamp: new Date(),
      sessionId: this.sessionId
    };
    
    // Add to events array
    this.events.push(event);
    
    // Save events
    await this.saveEvents();
    
    return event;
  }
  
  // Generate usage report
  async generateUsageReport() {
    if (!this.enabled || this.events.length === 0) {
      return {
        enabled: this.enabled,
        eventsCount: 0,
        sessions: [],
        popularFeatures: []
      };
    }
    
    // Group events by session
    const sessions = {};
    
    for (const event of this.events) {
      if (!sessions[event.sessionId]) {
        sessions[event.sessionId] = {
          id: event.sessionId,
          events: [],
          startTime: null,
          endTime: null
        };
      }
      
      sessions[event.sessionId].events.push(event);
    }
    
    // Calculate session times
    for (const sessionId in sessions) {
      const sessionEvents = sessions[sessionId].events.sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
      );
      
      sessions[sessionId].startTime = new Date(sessionEvents[0].timestamp);
      sessions[sessionId].endTime = new Date(sessionEvents[sessionEvents.length - 1].timestamp);
      sessions[sessionId].duration = sessions[sessionId].endTime - sessions[sessionId].startTime;
    }
    
    // Calculate popular features
    const featureCounts = {};
    
    for (const event of this.events) {
      if (event.type.startsWith('feature_')) {
        const feature = event.type.substring(8); // Remove 'feature_' prefix
        featureCounts[feature] = (featureCounts[feature] || 0) + 1;
      }
    }
    
    const popularFeatures = Object.entries(featureCounts)
      .map(([feature, count]) => ({ feature, count }))
      .sort((a, b) => b.count - a.count);
    
    // Session metrics
    const sessionArray = Object.values(sessions);
    const sessionMetrics = {
      count: sessionArray.length,
      averageDuration: sessionArray.reduce((sum, session) => sum + session.duration, 0) / sessionArray.length,
      totalTime: sessionArray.reduce((sum, session) => sum + session.duration, 0)
    };
    
    return {
      enabled: this.enabled,
      eventsCount: this.events.length,
      sessions: sessionArray,
      popularFeatures,
      sessionMetrics,
      currentSession: {
        id: this.sessionId,
        startTime: this.sessionStartTime,
        duration: new Date() - this.sessionStartTime
      }
    };
  }
  
  // Enable or disable analytics
  async setEnabled(enabled) {
    this.enabled = enabled;
    
    if (enabled) {
      // Track analytics enabled event
      await this.trackSystemEvent('analytics_enabled', {
        timestamp: new Date()
      });
    }
    
    // Save setting
    await this.services.storageService.setSetting('analytics.enabled', enabled);
    
    return { enabled };
  }
  
  // Check if analytics are enabled
  async checkEnabled() {
    try {
      // First check enterprise policy
      if (this.services.enterpriseService && this.services.enterpriseService.enterpriseMode) {
        const policies = await this.services.enterpriseService.getAppliedPolicy();
        if (policies.features && policies.features.analytics !== undefined) {
          this.enabled = policies.features.analytics.enabled;
          return this.enabled;
        }
      }
      
      // Otherwise, check user setting
      const enabled = await this.services.storageService.getSetting('analytics.enabled');
      if (enabled !== undefined) {
        this.enabled = enabled;
      } else {
        // Default to disabled
        this.enabled = false;
      }
    } catch (error) {
      console.error('Failed to check analytics setting:', error);
      this.enabled = false;
    }
    
    return this.enabled;
  }
  
  // Get analytics enabled status
  async isEnabled() {
    return this.enabled;
  }
  
  // Get all analytics events
  async getEvents() {
    return this.enabled ? this.events : [];
  }
  
  // Clear all analytics data
  async clearData() {
    if (!this.enabled) {
      return { success: false, reason: 'Analytics disabled' };
    }
    
    // Clear events
    this.events = [];
    
    // Create a new session
    this.sessionId = generateId();
    this.sessionStartTime = new Date();
    
    // Save cleared state
    await this.saveEvents();
    
    // Track data cleared event
    await this.trackSystemEvent('analytics_cleared', {
      timestamp: new Date(),
      sessionId: this.sessionId
    });
    
    return { success: true };
  }
  
  // Handle end of session
  async endSession() {
    if (!this.enabled) {
      return { success: false, reason: 'Analytics disabled' };
    }
    
    // Track session end event
    await this.trackSystemEvent('session_end', {
      sessionId: this.sessionId,
      duration: new Date() - this.sessionStartTime,
      eventsCount: this.events.filter(e => e.sessionId === this.sessionId).length
    });
    
    // Save session data
    await this.saveEvents();
    
    return { success: true };
  }
  
  // Sync analytics data from another device
  async syncAnalytics(analyticsData) {
    if (!this.enabled) {
      return { success: false, reason: 'Analytics disabled' };
    }
    
    // Merge events, avoiding duplicates
    const newEvents = analyticsData.events.filter(newEvent => 
      !this.events.some(existingEvent => existingEvent.id === newEvent.id)
    );
    
    this.events.push(...newEvents);
    
    // Sort by timestamp
    this.events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    // Limit stored events (keep last 1000)
    if (this.events.length > 1000) {
      this.events = this.events.slice(-1000);
    }
    
    // Save merged events
    await this.saveEvents();
    
    return { success: true, mergedEvents: newEvents.length };
  }
  
  // Load settings from storage
  async loadSettings() {
    try {
      // Load events
      const storedEvents = await this.services.storageService.getSetting('analytics.events');
      if (storedEvents) {
        this.events = storedEvents;
      }
    } catch (error) {
      console.error('Failed to load analytics settings:', error);
    }
  }
  
  // Save events to storage
  async saveEvents() {
    try {
      await this.services.storageService.setSetting('analytics.events', this.events);
    } catch (error) {
      console.error('Failed to save analytics events:', error);
    }
  }
}
```

## Conclusion

The Phase 3 architecture completes the MCP vision by adding enterprise-ready features, proactive intelligence, Teams integration, and cross-device capabilities. The system now provides a comprehensive Microsoft 365 experience through natural language, with these key enhancements:

1. **Complete Microsoft 365 Coverage**: All major services integrated, including Teams
2. **Proactive Intelligence**: Monitoring engine that anticipates user needs
3. **Multi-Device Experience**: Seamless synchronization across devices
4. **Enterprise Readiness**: Security, compliance, and management features
5. **Rich Analytics**: Insights into productivity and usage patterns

The architecture maintains the same core principles established in Phases 1 and 2 while adding these powerful new capabilities. The modular design allows for future expansion and customization, ensuring the MCP project can continue to evolve with Microsoft's ecosystem.

By implementing this Phase 3 architecture, the MCP project delivers a fully-featured, intelligent assistant for Microsoft 365 that transforms how users interact with their digital workplace.