# Google Calendar MCP Server - API Documentation

## Overview

The Google Calendar MCP Server provides a webhook-based API to interact with Google Calendar. It supports multi-tenant authentication via dynamic OAuth tokens passed in each request.

**Endpoint:** `POST /webhook/mcp-calendar`

## Authentication

All requests must include `access_token` in the request body. This is the OAuth 2.0 access token for the user's Google account.

```json
{
  "access_token": "ya29.xxx...",
  "resource": "event",
  "operation": "getAll"
}
```

## Resources

### Event Resource

Operations on calendar events.

---

#### `create` - Create Event

Creates a new calendar event.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "event",
  "operation": "create",
  "calendar_id": "primary",
  "summary": "Meeting Title",
  "start": "2025-12-10T10:00:00Z",
  "end": "2025-12-10T11:00:00Z",
  "description": "Meeting description",
  "location": "Conference Room A",
  "attendees": ["user1@example.com", "user2@example.com"],
  "all_day": false,
  "timezone": "Europe/Paris",
  "add_google_meet": true,
  "recurrence": "daily",
  "recurrence_count": 5,
  "use_default_reminders": false,
  "reminder_email": 60,
  "reminder_popup": 10,
  "color_id": "1",
  "visibility": "private"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `calendar_id` | string | No | Calendar ID (default: "primary") |
| `summary` | string | No | Event title |
| `start` | string | No | Start time (ISO 8601) |
| `end` | string | No | End time (ISO 8601) |
| `description` | string | No | Event description |
| `location` | string | No | Location |
| `attendees` | array/string | No | List of attendee emails |
| `all_day` | boolean | No | All-day event (default: false) |
| `timezone` | string | No | Timezone (e.g., "Europe/Paris") |
| `add_google_meet` | boolean | No | Create Google Meet link (default: false) |
| `recurrence` | string | No | "daily", "weekly", "monthly", "yearly", or custom RRULE |
| `recurrence_count` | number | No | Number of occurrences (0 = unlimited) |
| `use_default_reminders` | boolean | No | Use calendar default reminders (default: true) |
| `reminder_email` | number | No | Email reminder (minutes before) |
| `reminder_popup` | number | No | Popup reminder (minutes before) |
| `color_id` | string | No | Color ID (1-11, see Color Reference) |
| `visibility` | string | No | "default", "public", "private", "confidential" |

---

#### `get` - Get Event

Retrieves a single event by ID.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "event",
  "operation": "get",
  "calendar_id": "primary",
  "event_id": "abc123xyz"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `calendar_id` | string | No | Calendar ID (default: "primary") |
| `event_id` | string | Yes | Event ID |

---

#### `getAll` - Get All Events

Retrieves multiple events with optional filters.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "event",
  "operation": "getAll",
  "calendar_id": "primary",
  "time_min": "2025-12-01T00:00:00Z",
  "time_max": "2025-12-31T23:59:59Z",
  "max_results": 50,
  "query": "meeting",
  "single_events": true,
  "order_by": "startTime"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `calendar_id` | string | No | Calendar ID (default: "primary") |
| `time_min` | string | No | Lower bound (ISO 8601) |
| `time_max` | string | No | Upper bound (ISO 8601) |
| `max_results` | number | No | Max events to return (default: 10, max: 2500) |
| `query` | string | No | Free text search |
| `single_events` | boolean | No | Expand recurring events (default: true) |
| `order_by` | string | No | "startTime" or "updated" |

---

#### `update` - Update Event

Updates an existing event.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "event",
  "operation": "update",
  "calendar_id": "primary",
  "event_id": "abc123xyz",
  "summary": "Updated Title",
  "start": "2025-12-10T14:00:00Z",
  "end": "2025-12-10T15:00:00Z",
  "status": "tentative",
  "color_id": "5",
  "visibility": "public"
}
```

**Parameters:**
Same as `create`, plus:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `event_id` | string | Yes | Event ID to update |
| `status` | string | No | "confirmed", "tentative", "cancelled" |

---

#### `delete` - Delete Event

Deletes an event.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "event",
  "operation": "delete",
  "calendar_id": "primary",
  "event_id": "abc123xyz"
}
```

---

#### `addAttendee` - Add Attendee

Adds a single attendee to an existing event.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "event",
  "operation": "addAttendee",
  "calendar_id": "primary",
  "event_id": "abc123xyz",
  "attendee_email": "newuser@example.com"
}
```

---

#### `removeAttendee` - Remove Attendee

Removes an attendee from an event.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "event",
  "operation": "removeAttendee",
  "calendar_id": "primary",
  "event_id": "abc123xyz",
  "attendee_email": "user@example.com"
}
```

---

#### `quickAdd` - Quick Add Event

Creates an event from a natural language text string.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "event",
  "operation": "quickAdd",
  "calendar_id": "primary",
  "text": "Meeting with John tomorrow at 3pm"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | Yes | Natural language event description |

---

#### `move` - Move Event

Moves an event to a different calendar.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "event",
  "operation": "move",
  "calendar_id": "primary",
  "event_id": "abc123xyz",
  "destination_calendar_id": "work@group.calendar.google.com"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `event_id` | string | Yes | Event ID to move |
| `destination_calendar_id` | string | Yes | Target calendar ID |

---

#### `freeBusy` - Free/Busy Query

Checks availability across one or more calendars.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "event",
  "operation": "freeBusy",
  "calendars": ["primary", "work@group.calendar.google.com"],
  "time_min": "2025-12-10T00:00:00Z",
  "time_max": "2025-12-10T23:59:59Z"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `calendars` | array/string | No | Calendar IDs to check (default: "primary") |
| `time_min` | string | Yes | Start of interval (ISO 8601) |
| `time_max` | string | Yes | End of interval (ISO 8601) |

**Response:**
```json
{
  "kind": "calendar#freeBusy",
  "timeMin": "2025-12-10T00:00:00.000Z",
  "timeMax": "2025-12-10T23:59:59.000Z",
  "calendars": {
    "primary": {
      "busy": [
        {
          "start": "2025-12-10T10:00:00Z",
          "end": "2025-12-10T11:00:00Z"
        }
      ]
    }
  }
}
```

---

### Calendar Resource

Operations on calendars.

#### `getAll` - Get All Calendars

Retrieves all calendars accessible by the user.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "calendar",
  "operation": "getAll"
}
```

---

## Color Reference

| ID | Name |
|----|------|
| 1 | Lavender |
| 2 | Sage |
| 3 | Grape |
| 4 | Flamingo |
| 5 | Banana |
| 6 | Tangerine |
| 7 | Peacock |
| 8 | Graphite |
| 9 | Blueberry |
| 10 | Basil |
| 11 | Tomato |

---

## Recurrence Rules

### Preset Values
- `daily` - Repeat every day
- `weekly` - Repeat every week
- `monthly` - Repeat every month
- `yearly` - Repeat every year

### Custom RRULE
For advanced recurrence patterns, use RFC 5545 RRULE format:

```
RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10
```

Examples:
- Every weekday: `RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR`
- Every 2 weeks on Tuesday: `RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU`
- Monthly on the 15th: `RRULE:FREQ=MONTHLY;BYMONTHDAY=15`

---

## Response Format

All responses follow this structure:

```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

On error:
```json
{
  "success": true,
  "data": {
    "error": "Error message",
    "errorDetails": { ... }
  },
  "error": null
}
```

---

## Usage Examples

### Create a recurring meeting with Google Meet

```json
{
  "access_token": "ya29.xxx...",
  "resource": "event",
  "operation": "create",
  "summary": "Weekly Team Standup",
  "start": "2025-12-09T09:00:00",
  "end": "2025-12-09T09:30:00",
  "timezone": "Europe/Paris",
  "attendees": ["team@company.com"],
  "add_google_meet": true,
  "recurrence": "weekly",
  "reminder_popup": 5
}
```

### Check team availability

```json
{
  "access_token": "ya29.xxx...",
  "resource": "event",
  "operation": "freeBusy",
  "calendars": ["alice@company.com", "bob@company.com"],
  "time_min": "2025-12-10T08:00:00Z",
  "time_max": "2025-12-10T18:00:00Z"
}
```

### Quick schedule from natural language

```json
{
  "access_token": "ya29.xxx...",
  "resource": "event",
  "operation": "quickAdd",
  "text": "Lunch with Sarah next Friday at noon"
}
```
