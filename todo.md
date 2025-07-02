# MCP Microsoft Office Bug Analysis and Fix Plan

## Critical Issues

### 1. Missing `graphService` Dependency

**Description:**
Calendar, files, and people modules fail to initialize because the `graphService` dependency is missing during module initialization.

**Analysis:**
- The modules require `graphService` in their `init()` methods
- In `init-modules.cjs`, the `enrichedServices` object doesn't include `graphService`
- The `graphService` is not properly created or injected during application startup
- The `graph-client.cjs` file exports `createClient` and `GraphClient`, but there's no service instance exported
- The modules expect a service instance with methods like `getRelevantPeople`, `searchFiles`, etc.

**Affected Files:**
- `/src/modules/init-modules.cjs` - Missing graphService in enrichedServices
- `/src/graph/graph-client.cjs` - Exports factory function but no service instance
- `/src/modules/calendar/index.cjs` - Requires graphService
- `/src/modules/files/index.js` - Requires graphService
- `/src/modules/people/index.cjs` - Requires graphService

**Solution Approach:**
Create a proper graph service that wraps the graph client and provides the required methods, then inject it during module initialization.

---

### 2. Missing `eventService.publish` Method

**Description:**
Errors related to `eventService.publish` not being a function, causing repeated metric event publication failures.

**Analysis:**
- The monitoring service attempts to call `eventService.publish` for metrics
- The event service has an `emit` method but no `publish` method
- This suggests an API mismatch between the monitoring service and event service

**Affected Files:**
- `/src/core/monitoring-service.cjs` - Calls eventService.publish
- `/src/core/event-service.cjs` - Has emit() but no publish() method

**Solution Approach:**
Either rename the method call in monitoring-service to use `emit()` instead of `publish()`, or add a `publish()` method to the event service that wraps the `emit()` method.

---

### 3. Authentication Errors from MSAL Info Messages

**Description:**
MSAL informational messages are being treated as errors in the logs.

**Analysis:**
- The authentication service is logging informational messages with error severity
- This is causing noise in the error logs and making it difficult to identify real issues

**Affected Files:**
- `/src/auth/msal-service.cjs` - Likely using error logging for info messages
- `/src/core/auth-service.cjs` - May be involved in the authentication flow

**Solution Approach:**
Review the logging in the MSAL service and ensure informational messages use the appropriate logging level.

---

### 4. Duplicate Database and Storage Service Initialization

**Description:**
Database and storage services are being initialized multiple times, causing redundant operations.

**Analysis:**
- Both `dev-server.cjs` and `init-modules.cjs` initialize the database factory and storage service
- This causes duplicate initialization and potential race conditions

**Affected Files:**
- `/src/core/database-factory.cjs` - Being initialized multiple times
- `/src/core/storage-service.cjs` - Being initialized multiple times
- `/dev-server.cjs` - Calls initializeModules() and may also initialize services directly
- `/src/modules/init-modules.cjs` - Initializes services that may already be initialized

**Solution Approach:**
Consolidate initialization to a single location and add checks to prevent re-initialization.

---

### 5. Missing Tool Definitions

**Description:**
Tool definitions are missing for some capabilities, causing fallback to defaults.

**Analysis:**
- The tools service is not finding definitions for certain capabilities
- This suggests missing or incorrect tool registration

**Affected Files:**
- `/src/core/tools-service.cjs` - Likely where tool definitions are managed

**Solution Approach:**
Review the tool registration process and ensure all required tool definitions are properly registered.

---

### 6. High Memory Usage Warnings

**Description:**
High memory usage warnings indicating potential performance issues.

**Analysis:**
- Memory leaks or inefficient resource usage may be occurring
- Possible causes include large object retention, circular references, or improper cleanup

**Affected Files:**
- Multiple services could be involved, particularly those handling large data sets

**Solution Approach:**
Profile memory usage, identify leaks, and implement proper cleanup and resource management.

---

### 7. Inconsistent Authentication Session States

**Description:**
Inconsistent authentication session states observed in logs.

**Analysis:**
- Session management may not be properly handling state transitions
- Token refresh or validation may be failing intermittently

**Affected Files:**
- `/src/auth/msal-service.cjs` - Handles authentication tokens
- `/src/core/session-service.cjs` - Likely manages session state

**Solution Approach:**
Review the session management flow and ensure proper state handling and error recovery.

---

### 8. Multiple Database Connections for Single Operations

**Description:**
Multiple database connections are being acquired for single operations, indicating possible redundancy.

**Analysis:**
- The database factory may not be properly reusing connections
- Services may be creating new connections unnecessarily

**Affected Files:**
- `/src/core/database-factory.cjs` - Connection management
- Services that interact with the database

**Solution Approach:**
Implement connection pooling or ensure proper connection reuse patterns.

---

## Previously Resolved Issues

### 1. Recursive Metrics Logging Loop

**Status:** FIXED
- Modified `trackMetric` function to skip metrics related to storage operations
- Created and ran patch script (`fix-metrics-loop.js`) to update affected files

### 2. Duplicate Migration Version Conflict

**Status:** FIXED
- Updated the `user_logs` migration version from 3 to 4
- Created and applied database fix script (`fix-database.js`)

---

## Implementation Plan

1. Create a proper graph service implementation that wraps the graph client
2. Fix the event service publish/emit method mismatch
3. Correct MSAL logging severity levels
4. Consolidate database and storage service initialization
5. Complete missing tool definitions
6. Optimize memory usage and implement proper cleanup
7. Fix session state management
8. Implement proper database connection management

Each fix should be implemented separately and tested thoroughly before moving to the next issue to ensure stability.
