import {
  IExecuteFunctions,
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
  NodeApiError,
  JsonObject,
  IHttpRequestOptions,
  IDataObject,
} from 'n8n-workflow';

export class CalendarToolDynamic implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Google Calendar Tool Dynamic',
    name: 'calendarToolDynamic',
    icon: 'file:calendar.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{ $parameter["operation"] + " " + $parameter["resource"] }}',
    description: 'Google Calendar API with dynamic OAuth token from input - Multi-tenant ready',
    defaults: {
      name: 'Calendar Dynamic',
    },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [], // NO static credentials - token passed as parameter
    properties: [
      // === ACCESS TOKEN (DYNAMIC) ===
      {
        displayName: 'Access Token',
        name: 'accessToken',
        type: 'string',
        typeOptions: {
          password: true,
        },
        required: true,
        default: '',
        placeholder: '{{ $json.access_token }}',
        description: 'OAuth 2.0 access token. Use expression to get from webhook body or previous node.',
      },
      // === RESOURCE ===
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Event', value: 'event' },
          { name: 'Calendar', value: 'calendar' },
        ],
        default: 'event',
      },
      // === OPERATIONS: EVENT ===
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: { resource: ['event'] },
        },
        options: [
          { name: 'Add Attendee', value: 'addAttendee', description: 'Add an attendee to an event' },
          { name: 'Create', value: 'create', description: 'Create a new event' },
          { name: 'Delete', value: 'delete', description: 'Delete an event' },
          { name: 'Free/Busy Query', value: 'freeBusy', description: 'Check availability of calendars' },
          { name: 'Get', value: 'get', description: 'Get an event by ID' },
          { name: 'Get Many', value: 'getAll', description: 'Get multiple events' },
          { name: 'Move', value: 'move', description: 'Move an event to another calendar' },
          { name: 'Quick Add', value: 'quickAdd', description: 'Create an event from a text string' },
          { name: 'Remove Attendee', value: 'removeAttendee', description: 'Remove an attendee from an event' },
          { name: 'Update', value: 'update', description: 'Update an event' },
        ],
        default: 'getAll',
      },
      // === OPERATIONS: CALENDAR ===
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: { resource: ['calendar'] },
        },
        options: [
          { name: 'Get Many', value: 'getAll', description: 'Get all calendars' },
        ],
        default: 'getAll',
      },
      // === PARAMETERS: CALENDAR ID ===
      {
        displayName: 'Calendar ID',
        name: 'calendarId',
        type: 'string',
        required: false,
        displayOptions: {
          show: { resource: ['event'] },
        },
        default: 'primary',
        description: 'Calendar identifier. Use "primary" for the primary calendar of the authenticated user.',
      },
      // === PARAMETERS: EVENT ID ===
      {
        displayName: 'Event ID',
        name: 'eventId',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['event'], operation: ['get', 'delete', 'update', 'addAttendee', 'removeAttendee', 'move'] },
        },
        default: '',
        description: 'The ID of the event',
      },
      // === PARAMETERS: ATTENDEE EMAIL (for add/remove) ===
      {
        displayName: 'Attendee Email',
        name: 'attendeeEmail',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['event'], operation: ['addAttendee', 'removeAttendee'] },
        },
        default: '',
        placeholder: 'user@example.com',
        description: 'Email address of the attendee to add or remove',
      },
      // === PARAMETERS: EVENT CREATE/UPDATE ===
      {
        displayName: 'Summary',
        name: 'summary',
        type: 'string',
        required: false,
        displayOptions: {
          show: { resource: ['event'], operation: ['create', 'update'] },
        },
        default: '',
        description: 'Title of the event',
      },
      {
        displayName: 'Start',
        name: 'start',
        type: 'string',
        required: false,
        displayOptions: {
          show: { resource: ['event'], operation: ['create', 'update'] },
        },
        default: '',
        placeholder: '2025-12-06T10:00:00Z',
        description: 'Start date/time in ISO 8601 format (e.g., 2025-12-06T10:00:00Z or 2025-12-06 for all-day events)',
      },
      {
        displayName: 'End',
        name: 'end',
        type: 'string',
        required: false,
        displayOptions: {
          show: { resource: ['event'], operation: ['create', 'update'] },
        },
        default: '',
        placeholder: '2025-12-06T11:00:00Z',
        description: 'End date/time in ISO 8601 format (e.g., 2025-12-06T11:00:00Z or 2025-12-07 for all-day events)',
      },
      {
        displayName: 'Description',
        name: 'description',
        type: 'string',
        typeOptions: { rows: 3 },
        required: false,
        displayOptions: {
          show: { resource: ['event'], operation: ['create', 'update'] },
        },
        default: '',
        description: 'Description of the event',
      },
      {
        displayName: 'Location',
        name: 'location',
        type: 'string',
        required: false,
        displayOptions: {
          show: { resource: ['event'], operation: ['create', 'update'] },
        },
        default: '',
        description: 'Geographic location of the event',
      },
      {
        displayName: 'Attendees',
        name: 'attendees',
        type: 'string',
        required: false,
        displayOptions: {
          show: { resource: ['event'], operation: ['create', 'update'] },
        },
        default: '',
        placeholder: 'email1@example.com,email2@example.com',
        description: 'Comma-separated list of attendee email addresses',
      },
      {
        displayName: 'All Day Event',
        name: 'allDay',
        type: 'boolean',
        required: false,
        displayOptions: {
          show: { resource: ['event'], operation: ['create', 'update'] },
        },
        default: false,
        description: 'Whether this is an all-day event',
      },
      {
        displayName: 'Timezone',
        name: 'timezone',
        type: 'string',
        required: false,
        displayOptions: {
          show: { resource: ['event'], operation: ['create', 'update'] },
        },
        default: '',
        placeholder: 'Europe/Paris',
        description: 'Timezone for the event (e.g., Europe/Paris, America/New_York)',
      },
      {
        displayName: 'Add Google Meet',
        name: 'addGoogleMeet',
        type: 'boolean',
        required: false,
        displayOptions: {
          show: { resource: ['event'], operation: ['create'] },
        },
        default: false,
        description: 'Whether to create a Google Meet conference for this event',
      },
      // === PARAMETERS: RECURRENCE ===
      {
        displayName: 'Recurrence',
        name: 'recurrence',
        type: 'options',
        required: false,
        displayOptions: {
          show: { resource: ['event'], operation: ['create'] },
        },
        options: [
          { name: 'None', value: '' },
          { name: 'Daily', value: 'RRULE:FREQ=DAILY' },
          { name: 'Weekly', value: 'RRULE:FREQ=WEEKLY' },
          { name: 'Monthly', value: 'RRULE:FREQ=MONTHLY' },
          { name: 'Yearly', value: 'RRULE:FREQ=YEARLY' },
          { name: 'Custom', value: 'custom' },
        ],
        default: '',
        description: 'Recurrence rule for the event',
      },
      {
        displayName: 'Custom Recurrence Rule',
        name: 'customRecurrence',
        type: 'string',
        required: false,
        displayOptions: {
          show: { resource: ['event'], operation: ['create'], recurrence: ['custom'] },
        },
        default: '',
        placeholder: 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10',
        description: 'Custom RRULE recurrence rule (RFC 5545 format)',
      },
      {
        displayName: 'Recurrence Count',
        name: 'recurrenceCount',
        type: 'number',
        required: false,
        displayOptions: {
          show: { resource: ['event'], operation: ['create'] },
          hide: { recurrence: ['', 'custom'] },
        },
        default: 0,
        description: 'Number of occurrences (0 = unlimited)',
      },
      // === PARAMETERS: REMINDERS ===
      {
        displayName: 'Use Default Reminders',
        name: 'useDefaultReminders',
        type: 'boolean',
        required: false,
        displayOptions: {
          show: { resource: ['event'], operation: ['create', 'update'] },
        },
        default: true,
        description: 'Whether to use the default reminders of the calendar',
      },
      {
        displayName: 'Email Reminder (minutes before)',
        name: 'reminderEmail',
        type: 'number',
        required: false,
        displayOptions: {
          show: { resource: ['event'], operation: ['create', 'update'], useDefaultReminders: [false] },
        },
        default: 0,
        description: 'Send email reminder X minutes before (0 = no email reminder)',
      },
      {
        displayName: 'Popup Reminder (minutes before)',
        name: 'reminderPopup',
        type: 'number',
        required: false,
        displayOptions: {
          show: { resource: ['event'], operation: ['create', 'update'], useDefaultReminders: [false] },
        },
        default: 10,
        description: 'Show popup reminder X minutes before (0 = no popup reminder)',
      },
      // === PARAMETERS: COLOR ===
      {
        displayName: 'Color',
        name: 'colorId',
        type: 'options',
        required: false,
        displayOptions: {
          show: { resource: ['event'], operation: ['create', 'update'] },
        },
        options: [
          { name: 'Default', value: '' },
          { name: 'Lavender', value: '1' },
          { name: 'Sage', value: '2' },
          { name: 'Grape', value: '3' },
          { name: 'Flamingo', value: '4' },
          { name: 'Banana', value: '5' },
          { name: 'Tangerine', value: '6' },
          { name: 'Peacock', value: '7' },
          { name: 'Graphite', value: '8' },
          { name: 'Blueberry', value: '9' },
          { name: 'Basil', value: '10' },
          { name: 'Tomato', value: '11' },
        ],
        default: '',
        description: 'Color of the event',
      },
      // === PARAMETERS: VISIBILITY ===
      {
        displayName: 'Visibility',
        name: 'visibility',
        type: 'options',
        required: false,
        displayOptions: {
          show: { resource: ['event'], operation: ['create', 'update'] },
        },
        options: [
          { name: 'Default', value: 'default' },
          { name: 'Public', value: 'public' },
          { name: 'Private', value: 'private' },
          { name: 'Confidential', value: 'confidential' },
        ],
        default: 'default',
        description: 'Visibility of the event',
      },
      // === PARAMETERS: STATUS ===
      {
        displayName: 'Status',
        name: 'status',
        type: 'options',
        required: false,
        displayOptions: {
          show: { resource: ['event'], operation: ['update'] },
        },
        options: [
          { name: 'Confirmed', value: 'confirmed' },
          { name: 'Tentative', value: 'tentative' },
          { name: 'Cancelled', value: 'cancelled' },
        ],
        default: 'confirmed',
        description: 'Status of the event',
      },
      // === PARAMETERS: QUICK ADD ===
      {
        displayName: 'Quick Add Text',
        name: 'quickAddText',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['event'], operation: ['quickAdd'] },
        },
        default: '',
        placeholder: 'Meeting with John tomorrow at 3pm',
        description: 'Text describing the event to create (Google parses this automatically)',
      },
      // === PARAMETERS: MOVE EVENT ===
      {
        displayName: 'Destination Calendar ID',
        name: 'destinationCalendarId',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['event'], operation: ['move'] },
        },
        default: '',
        description: 'ID of the destination calendar to move the event to',
      },
      // === PARAMETERS: FREE/BUSY ===
      {
        displayName: 'Calendars to Check',
        name: 'freeBusyCalendars',
        type: 'string',
        required: false,
        displayOptions: {
          show: { resource: ['event'], operation: ['freeBusy'] },
        },
        default: 'primary',
        placeholder: 'primary,calendar2@group.calendar.google.com',
        description: 'Comma-separated list of calendar IDs to check availability',
      },
      {
        displayName: 'Free/Busy Time Min',
        name: 'freeBusyTimeMin',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['event'], operation: ['freeBusy'] },
        },
        default: '',
        placeholder: '2025-12-10T00:00:00Z',
        description: 'Start of the interval to check (ISO 8601 format)',
      },
      {
        displayName: 'Free/Busy Time Max',
        name: 'freeBusyTimeMax',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['event'], operation: ['freeBusy'] },
        },
        default: '',
        placeholder: '2025-12-10T23:59:59Z',
        description: 'End of the interval to check (ISO 8601 format)',
      },
      // === PARAMETERS: GET ALL EVENTS ===
      {
        displayName: 'Time Min',
        name: 'timeMin',
        type: 'string',
        required: false,
        displayOptions: {
          show: { resource: ['event'], operation: ['getAll'] },
        },
        default: '',
        placeholder: '2025-12-01T00:00:00Z',
        description: 'Lower bound (inclusive) for event start time to filter by',
      },
      {
        displayName: 'Time Max',
        name: 'timeMax',
        type: 'string',
        required: false,
        displayOptions: {
          show: { resource: ['event'], operation: ['getAll'] },
        },
        default: '',
        placeholder: '2025-12-31T23:59:59Z',
        description: 'Upper bound (exclusive) for event start time to filter by',
      },
      {
        displayName: 'Max Results',
        name: 'maxResults',
        type: 'number',
        required: false,
        displayOptions: {
          show: { resource: ['event'], operation: ['getAll'] },
        },
        default: 10,
        description: 'Maximum number of events to return (max 2500)',
      },
      {
        displayName: 'Query',
        name: 'query',
        type: 'string',
        required: false,
        displayOptions: {
          show: { resource: ['event'], operation: ['getAll'] },
        },
        default: '',
        description: 'Free text search terms to find events that match these terms',
      },
      {
        displayName: 'Single Events',
        name: 'singleEvents',
        type: 'boolean',
        required: false,
        displayOptions: {
          show: { resource: ['event'], operation: ['getAll'] },
        },
        default: true,
        description: 'Whether to expand recurring events into instances',
      },
      {
        displayName: 'Order By',
        name: 'orderBy',
        type: 'options',
        required: false,
        displayOptions: {
          show: { resource: ['event'], operation: ['getAll'] },
        },
        options: [
          { name: 'Start Time', value: 'startTime' },
          { name: 'Updated', value: 'updated' },
        ],
        default: 'startTime',
        description: 'Order of the events returned',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      try {
        const accessToken = this.getNodeParameter('accessToken', itemIndex) as string;
        const resource = this.getNodeParameter('resource', itemIndex) as string;
        const operation = this.getNodeParameter('operation', itemIndex) as string;

        if (!accessToken) {
          throw new Error('Access token is required. Use expression like {{ $json.access_token }}');
        }

        let result: unknown;

        if (resource === 'event') {
          result = await executeEventOperation.call(this, accessToken, operation, itemIndex);
        } else if (resource === 'calendar') {
          result = await executeCalendarOperation.call(this, accessToken, operation, itemIndex);
        }

        returnData.push({
          json: result as JsonObject,
          pairedItem: itemIndex,
        });

      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: {
              error: (error as Error).message,
              errorDetails: (error as JsonObject),
            },
            pairedItem: itemIndex,
          });
        } else {
          throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex });
        }
      }
    }

    return [returnData];
  }
}

// === HELPER FUNCTION: Calendar API Request ===
async function calendarRequest(
  this: IExecuteFunctions,
  accessToken: string,
  method: string,
  endpoint: string,
  body?: IDataObject,
  qs?: IDataObject,
): Promise<unknown> {
  const options: IHttpRequestOptions = {
    method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: `https://www.googleapis.com/calendar/v3${endpoint}`,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    json: true,
  };

  if (body && Object.keys(body).length > 0) {
    options.body = body;
  }
  if (qs && Object.keys(qs).length > 0) {
    options.qs = qs;
  }

  return this.helpers.httpRequest(options);
}

// === EVENT OPERATIONS ===
async function executeEventOperation(
  this: IExecuteFunctions,
  accessToken: string,
  operation: string,
  itemIndex: number,
): Promise<unknown> {
  const calendarId = this.getNodeParameter('calendarId', itemIndex, 'primary') as string;

  switch (operation) {
    case 'create': {
      const summary = this.getNodeParameter('summary', itemIndex, '') as string;
      const start = this.getNodeParameter('start', itemIndex, '') as string;
      const end = this.getNodeParameter('end', itemIndex, '') as string;
      const description = this.getNodeParameter('description', itemIndex, '') as string;
      const location = this.getNodeParameter('location', itemIndex, '') as string;
      const attendees = this.getNodeParameter('attendees', itemIndex, '') as string;
      const allDay = this.getNodeParameter('allDay', itemIndex, false) as boolean;
      const timezone = this.getNodeParameter('timezone', itemIndex, '') as string;
      const addGoogleMeet = this.getNodeParameter('addGoogleMeet', itemIndex, false) as boolean;
      const recurrence = this.getNodeParameter('recurrence', itemIndex, '') as string;
      const customRecurrence = this.getNodeParameter('customRecurrence', itemIndex, '') as string;
      const recurrenceCount = this.getNodeParameter('recurrenceCount', itemIndex, 0) as number;
      const useDefaultReminders = this.getNodeParameter('useDefaultReminders', itemIndex, true) as boolean;
      const reminderEmail = this.getNodeParameter('reminderEmail', itemIndex, 0) as number;
      const reminderPopup = this.getNodeParameter('reminderPopup', itemIndex, 10) as number;
      const colorId = this.getNodeParameter('colorId', itemIndex, '') as string;
      const visibility = this.getNodeParameter('visibility', itemIndex, 'default') as string;

      const eventBody: IDataObject = {};

      if (summary) eventBody.summary = summary;
      if (description) eventBody.description = description;
      if (location) eventBody.location = location;

      // Handle start/end times
      if (start) {
        if (allDay) {
          eventBody.start = { date: start.split('T')[0] };
        } else {
          const startObj: IDataObject = { dateTime: start };
          if (timezone) startObj.timeZone = timezone;
          eventBody.start = startObj;
        }
      }

      if (end) {
        if (allDay) {
          eventBody.end = { date: end.split('T')[0] };
        } else {
          const endObj: IDataObject = { dateTime: end };
          if (timezone) endObj.timeZone = timezone;
          eventBody.end = endObj;
        }
      }

      // Handle attendees
      if (attendees) {
        const attendeesList = attendees.split(',').map(email => ({ email: email.trim() }));
        eventBody.attendees = attendeesList;
      }

      // Handle Google Meet
      if (addGoogleMeet) {
        eventBody.conferenceData = {
          createRequest: {
            requestId: `meet-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            conferenceSolutionKey: {
              type: 'hangoutsMeet',
            },
          },
        };
      }

      // Handle recurrence
      if (recurrence) {
        let rrule = recurrence;
        if (recurrence === 'custom' && customRecurrence) {
          rrule = customRecurrence;
        } else if (recurrenceCount > 0) {
          rrule = `${recurrence};COUNT=${recurrenceCount}`;
        }
        if (rrule && rrule !== 'custom') {
          eventBody.recurrence = [rrule];
        }
      }

      // Handle reminders
      if (!useDefaultReminders) {
        const overrides: Array<{ method: string; minutes: number }> = [];
        if (reminderEmail > 0) {
          overrides.push({ method: 'email', minutes: reminderEmail });
        }
        if (reminderPopup > 0) {
          overrides.push({ method: 'popup', minutes: reminderPopup });
        }
        eventBody.reminders = {
          useDefault: false,
          overrides: overrides.length > 0 ? overrides : undefined,
        };
      }

      // Handle color
      if (colorId) {
        eventBody.colorId = colorId;
      }

      // Handle visibility
      if (visibility && visibility !== 'default') {
        eventBody.visibility = visibility;
      }

      // Use conferenceDataVersion=1 if Google Meet is requested
      const qs: IDataObject = addGoogleMeet ? { conferenceDataVersion: 1 } : {};

      return calendarRequest.call(
        this,
        accessToken,
        'POST',
        `/calendars/${encodeURIComponent(calendarId)}/events`,
        eventBody,
        qs
      );
    }

    case 'get': {
      const eventId = this.getNodeParameter('eventId', itemIndex) as string;
      return calendarRequest.call(
        this,
        accessToken,
        'GET',
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
      );
    }

    case 'getAll': {
      const timeMin = this.getNodeParameter('timeMin', itemIndex, '') as string;
      const timeMax = this.getNodeParameter('timeMax', itemIndex, '') as string;
      const maxResults = this.getNodeParameter('maxResults', itemIndex, 10) as number;
      const query = this.getNodeParameter('query', itemIndex, '') as string;
      const singleEvents = this.getNodeParameter('singleEvents', itemIndex, true) as boolean;
      const orderBy = this.getNodeParameter('orderBy', itemIndex, 'startTime') as string;

      const qs: IDataObject = {
        maxResults,
        singleEvents,
      };

      if (singleEvents) {
        qs.orderBy = orderBy;
      }

      if (timeMin) qs.timeMin = timeMin;
      if (timeMax) qs.timeMax = timeMax;
      if (query) qs.q = query;

      return calendarRequest.call(
        this,
        accessToken,
        'GET',
        `/calendars/${encodeURIComponent(calendarId)}/events`,
        undefined,
        qs
      );
    }

    case 'update': {
      const eventId = this.getNodeParameter('eventId', itemIndex) as string;
      const summary = this.getNodeParameter('summary', itemIndex, '') as string;
      const start = this.getNodeParameter('start', itemIndex, '') as string;
      const end = this.getNodeParameter('end', itemIndex, '') as string;
      const description = this.getNodeParameter('description', itemIndex, '') as string;
      const location = this.getNodeParameter('location', itemIndex, '') as string;
      const attendees = this.getNodeParameter('attendees', itemIndex, '') as string;
      const allDay = this.getNodeParameter('allDay', itemIndex, false) as boolean;
      const timezone = this.getNodeParameter('timezone', itemIndex, '') as string;
      const useDefaultReminders = this.getNodeParameter('useDefaultReminders', itemIndex, true) as boolean;
      const reminderEmail = this.getNodeParameter('reminderEmail', itemIndex, 0) as number;
      const reminderPopup = this.getNodeParameter('reminderPopup', itemIndex, 10) as number;
      const colorId = this.getNodeParameter('colorId', itemIndex, '') as string;
      const visibility = this.getNodeParameter('visibility', itemIndex, 'default') as string;
      const status = this.getNodeParameter('status', itemIndex, 'confirmed') as string;

      const eventBody: IDataObject = {};

      if (summary) eventBody.summary = summary;
      if (description) eventBody.description = description;
      if (location) eventBody.location = location;

      if (start) {
        if (allDay) {
          eventBody.start = { date: start.split('T')[0] };
        } else {
          const startObj: IDataObject = { dateTime: start };
          if (timezone) startObj.timeZone = timezone;
          eventBody.start = startObj;
        }
      }

      if (end) {
        if (allDay) {
          eventBody.end = { date: end.split('T')[0] };
        } else {
          const endObj: IDataObject = { dateTime: end };
          if (timezone) endObj.timeZone = timezone;
          eventBody.end = endObj;
        }
      }

      if (attendees) {
        const attendeesList = attendees.split(',').map(email => ({ email: email.trim() }));
        eventBody.attendees = attendeesList;
      }

      // Handle reminders
      if (!useDefaultReminders) {
        const overrides: Array<{ method: string; minutes: number }> = [];
        if (reminderEmail > 0) {
          overrides.push({ method: 'email', minutes: reminderEmail });
        }
        if (reminderPopup > 0) {
          overrides.push({ method: 'popup', minutes: reminderPopup });
        }
        eventBody.reminders = {
          useDefault: false,
          overrides: overrides.length > 0 ? overrides : undefined,
        };
      }

      // Handle color
      if (colorId) {
        eventBody.colorId = colorId;
      }

      // Handle visibility
      if (visibility && visibility !== 'default') {
        eventBody.visibility = visibility;
      }

      // Handle status
      if (status) {
        eventBody.status = status;
      }

      return calendarRequest.call(
        this,
        accessToken,
        'PATCH',
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        eventBody
      );
    }

    case 'delete': {
      const eventId = this.getNodeParameter('eventId', itemIndex) as string;
      await calendarRequest.call(
        this,
        accessToken,
        'DELETE',
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
      );
      return { success: true, eventId, calendarId, action: 'deleted' };
    }

    case 'addAttendee': {
      const eventId = this.getNodeParameter('eventId', itemIndex) as string;
      const attendeeEmail = this.getNodeParameter('attendeeEmail', itemIndex) as string;

      // First, get the current event to preserve existing attendees
      const currentEvent = await calendarRequest.call(
        this,
        accessToken,
        'GET',
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
      ) as { attendees?: Array<{ email: string }> };

      // Get existing attendees or empty array
      const existingAttendees = currentEvent.attendees || [];

      // Check if attendee already exists
      const alreadyExists = existingAttendees.some(
        (a) => a.email.toLowerCase() === attendeeEmail.toLowerCase()
      );

      if (alreadyExists) {
        return {
          success: false,
          message: `Attendee ${attendeeEmail} is already in the event`,
          eventId,
          attendees: existingAttendees
        };
      }

      // Add new attendee
      const updatedAttendees = [...existingAttendees, { email: attendeeEmail.trim() }];

      // Update the event with new attendee list
      const result = await calendarRequest.call(
        this,
        accessToken,
        'PATCH',
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        { attendees: updatedAttendees }
      );

      return result;
    }

    case 'removeAttendee': {
      const eventId = this.getNodeParameter('eventId', itemIndex) as string;
      const attendeeEmail = this.getNodeParameter('attendeeEmail', itemIndex) as string;

      // First, get the current event
      const currentEvent = await calendarRequest.call(
        this,
        accessToken,
        'GET',
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
      ) as { attendees?: Array<{ email: string }> };

      // Get existing attendees
      const existingAttendees = currentEvent.attendees || [];

      // Filter out the attendee to remove
      const updatedAttendees = existingAttendees.filter(
        (a) => a.email.toLowerCase() !== attendeeEmail.toLowerCase()
      );

      // Check if attendee was found and removed
      if (updatedAttendees.length === existingAttendees.length) {
        return {
          success: false,
          message: `Attendee ${attendeeEmail} was not found in the event`,
          eventId,
          attendees: existingAttendees
        };
      }

      // Update the event with filtered attendee list
      const result = await calendarRequest.call(
        this,
        accessToken,
        'PATCH',
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        { attendees: updatedAttendees }
      );

      return result;
    }

    case 'quickAdd': {
      const quickAddText = this.getNodeParameter('quickAddText', itemIndex) as string;

      return calendarRequest.call(
        this,
        accessToken,
        'POST',
        `/calendars/${encodeURIComponent(calendarId)}/events/quickAdd`,
        undefined,
        { text: quickAddText }
      );
    }

    case 'move': {
      const eventId = this.getNodeParameter('eventId', itemIndex) as string;
      const destinationCalendarId = this.getNodeParameter('destinationCalendarId', itemIndex) as string;

      return calendarRequest.call(
        this,
        accessToken,
        'POST',
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}/move`,
        undefined,
        { destination: destinationCalendarId }
      );
    }

    case 'freeBusy': {
      const freeBusyCalendars = this.getNodeParameter('freeBusyCalendars', itemIndex, 'primary') as string;
      const freeBusyTimeMin = this.getNodeParameter('freeBusyTimeMin', itemIndex) as string;
      const freeBusyTimeMax = this.getNodeParameter('freeBusyTimeMax', itemIndex) as string;

      // Parse calendar IDs
      const calendarIds = freeBusyCalendars.split(',').map(id => ({ id: id.trim() }));

      const body: IDataObject = {
        timeMin: freeBusyTimeMin,
        timeMax: freeBusyTimeMax,
        items: calendarIds,
      };

      // Free/Busy uses a different endpoint
      const options: IHttpRequestOptions = {
        method: 'POST',
        url: 'https://www.googleapis.com/calendar/v3/freeBusy',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body,
        json: true,
      };

      return this.helpers.httpRequest(options);
    }

    default:
      throw new Error(`Unknown event operation: ${operation}`);
  }
}

// === CALENDAR OPERATIONS ===
async function executeCalendarOperation(
  this: IExecuteFunctions,
  accessToken: string,
  operation: string,
  _itemIndex: number,
): Promise<unknown> {
  switch (operation) {
    case 'getAll': {
      return calendarRequest.call(this, accessToken, 'GET', '/users/me/calendarList');
    }

    default:
      throw new Error(`Unknown calendar operation: ${operation}`);
  }
}
