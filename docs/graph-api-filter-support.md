# Microsoft Graph API Filter Support

## Overview

This document outlines the supported filter operations for Microsoft Graph API in the MCP Microsoft Office project. It provides guidance on constructing valid filter expressions and avoiding unsupported operations that can cause API failures.

## Filter Validation

The MCP adapter now includes filter validation to prevent sending unsupported filter expressions to Microsoft Graph API. When an unsupported filter is detected:

1. The filter is skipped (not included in the API request)
2. A warning is logged with details about the unsupported filter
3. The request continues with other valid filters
4. An event `calendar:filter:skipped` is emitted for monitoring

## Supported Filter Operations

### Calendar Event Properties

| Property | Supported Operators | Examples |
|----------|---------------------|----------|
| `subject` | `eq`, `ne`, `contains`, `startswith`, `endswith` | `subject eq 'Meeting'`<br>`contains(subject, 'important')` |
| `bodyPreview` | `contains` | `contains(bodyPreview, 'agenda')` |
| `importance` | `eq`, `ne` | `importance eq 'high'` |
| `sensitivity` | `eq`, `ne` | `sensitivity eq 'normal'` |
| `showAs` | `eq`, `ne` | `showAs eq 'busy'` |
| `isAllDay` | `eq`, `ne` | `isAllDay eq true` |
| `isCancelled` | `eq`, `ne` | `isCancelled eq false` |
| `isDraft` | `eq`, `ne` | `isDraft eq false` |
| `isOrganizer` | `eq`, `ne` | `isOrganizer eq true` |
| `start/dateTime` | `eq`, `ne`, `gt`, `ge`, `lt`, `le` | `start/dateTime ge '2025-06-01T00:00:00Z'` |
| `end/dateTime` | `eq`, `ne`, `gt`, `ge`, `lt`, `le` | `end/dateTime le '2025-06-30T23:59:59Z'` |
| `location/displayName` | `eq`, `contains` | `contains(location/displayName, 'Conference')` |
| `organizer/emailAddress/address` | `eq` only | `organizer/emailAddress/address eq 'user@example.com'` |
| `attendees/emailAddress/address` | `eq` only | `attendees/any(a: a/emailAddress/address eq 'user@example.com')` |

### Known Limitations

1. **Complex Properties with Limited Operator Support**:
   - `organizer/emailAddress/address` only supports `eq` operator (not `ne`)
   - `attendees/emailAddress/address` only supports `eq` operator (not `ne`)

2. **Lambda Expressions Limitations**:
   - Complex lambda expressions with `ne` operators are generally not supported
   - Example of unsupported filter: `attendees/any(a: a/emailAddress/address ne 'user@example.com')`

3. **Workarounds for Unsupported Filters**:
   - For filtering by "not equal" on organizer, consider client-side filtering
   - Use alternative properties when possible (e.g., filter on subject instead)
   - For complex filtering needs, retrieve more data and filter client-side

## Examples

### Valid Filter Examples

```
subject eq 'Team Meeting'
start/dateTime ge '2025-06-01T00:00:00Z'
end/dateTime le '2025-06-30T23:59:59Z'
contains(subject, 'important')
isAllDay eq true
organizer/emailAddress/address eq 'user@example.com'
attendees/any(a: a/emailAddress/address eq 'user@example.com')
```

### Invalid Filter Examples

```
organizer/emailAddress/address ne 'user@example.com'  // 'ne' not supported on this property
attendees/emailAddress/address ne 'user@example.com'  // 'ne' not supported on this property
attendees/any(a: a/emailAddress/address ne 'user@example.com')  // Complex lambda with 'ne' not supported
```

## Best Practices

1. Use `eq` operator when possible as it has the widest support
2. For text searching, use `contains()`, `startswith()`, or `endswith()`
3. Date/time comparisons work well with standard operators (`ge`, `le`, etc.)
4. For complex filtering needs, consider:
   - Breaking down into multiple simpler filters
   - Retrieving more data and filtering client-side
   - Using alternative properties that have better operator support

## References

- [Microsoft Graph Query Parameters Documentation](https://learn.microsoft.com/en-us/graph/query-parameters?tabs=http)
- [Microsoft Graph Calendar API Documentation](https://learn.microsoft.com/en-us/graph/api/resources/calendar?view=graph-rest-1.0)
