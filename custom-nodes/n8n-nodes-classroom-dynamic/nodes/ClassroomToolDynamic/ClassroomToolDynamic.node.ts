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

export class ClassroomToolDynamic implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Google Classroom Tool Dynamic',
    name: 'classroomToolDynamic',
    icon: 'file:classroom.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{ $parameter["operation"] + " " + $parameter["resource"] }}',
    description: 'Google Classroom API with dynamic OAuth token from input - Multi-tenant ready',
    defaults: {
      name: 'Classroom Dynamic',
    },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [], // NO static credentials - token passed as parameter (BYOT pattern)
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
          { name: 'Announcement', value: 'announcement' },
          { name: 'Course', value: 'course' },
          { name: 'Course Work', value: 'courseWork' },
          { name: 'Student', value: 'student' },
          { name: 'Student Submission', value: 'studentSubmission' },
          { name: 'Teacher', value: 'teacher' },
          { name: 'Topic', value: 'topic' },
        ],
        default: 'course',
      },
      // === OPERATIONS: COURSE ===
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: { resource: ['course'] },
        },
        options: [
          { name: 'Archive', value: 'archive', description: 'Archive a course' },
          { name: 'Create', value: 'create', description: 'Create a new course' },
          { name: 'Delete', value: 'delete', description: 'Delete a course' },
          { name: 'Get', value: 'get', description: 'Get a course by ID' },
          { name: 'Get Many', value: 'getAll', description: 'Get multiple courses' },
          { name: 'Update', value: 'update', description: 'Update a course' },
        ],
        default: 'getAll',
      },
      // === OPERATIONS: COURSEWORK ===
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: { resource: ['courseWork'] },
        },
        options: [
          { name: 'Create', value: 'create', description: 'Create a new course work' },
          { name: 'Delete', value: 'delete', description: 'Delete a course work' },
          { name: 'Get', value: 'get', description: 'Get a course work by ID' },
          { name: 'Get Many', value: 'getAll', description: 'Get multiple course works' },
          { name: 'Update', value: 'update', description: 'Update a course work' },
        ],
        default: 'getAll',
      },
      // === OPERATIONS: STUDENT SUBMISSION ===
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: { resource: ['studentSubmission'] },
        },
        options: [
          { name: 'Get', value: 'get', description: 'Get a student submission' },
          { name: 'Get Many', value: 'getAll', description: 'Get multiple student submissions' },
          { name: 'Grade', value: 'grade', description: 'Grade a student submission' },
          { name: 'Modify Attachments', value: 'modifyAttachments', description: 'Modify attachments of a submission' },
          { name: 'Return', value: 'return', description: 'Return a student submission to the student' },
        ],
        default: 'getAll',
      },
      // === OPERATIONS: STUDENT ===
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: { resource: ['student'] },
        },
        options: [
          { name: 'Create', value: 'create', description: 'Add a student to a course' },
          { name: 'Delete', value: 'delete', description: 'Remove a student from a course' },
          { name: 'Get', value: 'get', description: 'Get a student by ID' },
          { name: 'Get Many', value: 'getAll', description: 'Get all students in a course' },
        ],
        default: 'getAll',
      },
      // === OPERATIONS: TEACHER ===
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: { resource: ['teacher'] },
        },
        options: [
          { name: 'Create', value: 'create', description: 'Add a teacher to a course' },
          { name: 'Delete', value: 'delete', description: 'Remove a teacher from a course' },
          { name: 'Get', value: 'get', description: 'Get a teacher by ID' },
          { name: 'Get Many', value: 'getAll', description: 'Get all teachers in a course' },
        ],
        default: 'getAll',
      },
      // === OPERATIONS: ANNOUNCEMENT ===
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: { resource: ['announcement'] },
        },
        options: [
          { name: 'Create', value: 'create', description: 'Create a new announcement' },
          { name: 'Delete', value: 'delete', description: 'Delete an announcement' },
          { name: 'Get', value: 'get', description: 'Get an announcement by ID' },
          { name: 'Get Many', value: 'getAll', description: 'Get multiple announcements' },
          { name: 'Update', value: 'update', description: 'Update an announcement' },
        ],
        default: 'getAll',
      },
      // === OPERATIONS: TOPIC ===
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: { resource: ['topic'] },
        },
        options: [
          { name: 'Create', value: 'create', description: 'Create a new topic' },
          { name: 'Delete', value: 'delete', description: 'Delete a topic' },
          { name: 'Get', value: 'get', description: 'Get a topic by ID' },
          { name: 'Get Many', value: 'getAll', description: 'Get all topics in a course' },
          { name: 'Update', value: 'update', description: 'Update a topic' },
        ],
        default: 'getAll',
      },
      // === COMMON PARAMETER: COURSE ID ===
      {
        displayName: 'Course ID',
        name: 'courseId',
        type: 'string',
        required: true,
        displayOptions: {
          hide: {
            resource: ['course'],
            operation: ['create', 'getAll'],
          },
        },
        default: '',
        description: 'The ID of the course',
      },
      // Course ID for course resource (only for specific operations)
      {
        displayName: 'Course ID',
        name: 'courseId',
        type: 'string',
        required: true,
        displayOptions: {
          show: {
            resource: ['course'],
            operation: ['get', 'update', 'delete', 'archive'],
          },
        },
        default: '',
        description: 'The ID of the course',
      },
      // === COURSE PARAMETERS ===
      {
        displayName: 'Name',
        name: 'name',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['course'], operation: ['create'] },
        },
        default: '',
        description: 'Name of the course',
      },
      {
        displayName: 'Name',
        name: 'name',
        type: 'string',
        required: false,
        displayOptions: {
          show: { resource: ['course'], operation: ['update'] },
        },
        default: '',
        description: 'New name of the course',
      },
      {
        displayName: 'Section',
        name: 'section',
        type: 'string',
        required: false,
        displayOptions: {
          show: { resource: ['course'], operation: ['create', 'update'] },
        },
        default: '',
        description: 'Section of the course (e.g., "Period 1" or "Room 304")',
      },
      {
        displayName: 'Description',
        name: 'description',
        type: 'string',
        typeOptions: { rows: 3 },
        required: false,
        displayOptions: {
          show: { resource: ['course'], operation: ['create', 'update'] },
        },
        default: '',
        description: 'Description of the course',
      },
      {
        displayName: 'Room',
        name: 'room',
        type: 'string',
        required: false,
        displayOptions: {
          show: { resource: ['course'], operation: ['create', 'update'] },
        },
        default: '',
        description: 'Optional room location of the course',
      },
      {
        displayName: 'Owner ID',
        name: 'ownerId',
        type: 'string',
        required: false,
        displayOptions: {
          show: { resource: ['course'], operation: ['create'] },
        },
        default: '',
        description: 'The identifier of the owner (email or user ID). Defaults to the authenticated user.',
      },
      {
        displayName: 'Course State',
        name: 'courseState',
        type: 'options',
        required: false,
        displayOptions: {
          show: { resource: ['course'], operation: ['update', 'getAll'] },
        },
        options: [
          { name: 'Active', value: 'ACTIVE' },
          { name: 'Archived', value: 'ARCHIVED' },
          { name: 'Provisioned', value: 'PROVISIONED' },
          { name: 'Declined', value: 'DECLINED' },
          { name: 'Suspended', value: 'SUSPENDED' },
        ],
        default: 'ACTIVE',
        description: 'State of the course',
      },
      // === COURSEWORK PARAMETERS ===
      {
        displayName: 'Course Work ID',
        name: 'courseWorkId',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['courseWork'], operation: ['get', 'update', 'delete'] },
        },
        default: '',
        description: 'The ID of the course work',
      },
      {
        displayName: 'Course Work ID',
        name: 'courseWorkId',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['studentSubmission'] },
        },
        default: '',
        description: 'The ID of the course work',
      },
      {
        displayName: 'Title',
        name: 'title',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['courseWork'], operation: ['create'] },
        },
        default: '',
        description: 'Title of the course work',
      },
      {
        displayName: 'Title',
        name: 'title',
        type: 'string',
        required: false,
        displayOptions: {
          show: { resource: ['courseWork'], operation: ['update'] },
        },
        default: '',
        description: 'New title of the course work',
      },
      {
        displayName: 'Description',
        name: 'courseWorkDescription',
        type: 'string',
        typeOptions: { rows: 3 },
        required: false,
        displayOptions: {
          show: { resource: ['courseWork'], operation: ['create', 'update'] },
        },
        default: '',
        description: 'Description of the course work',
      },
      {
        displayName: 'Work Type',
        name: 'workType',
        type: 'options',
        required: true,
        displayOptions: {
          show: { resource: ['courseWork'], operation: ['create'] },
        },
        options: [
          { name: 'Assignment', value: 'ASSIGNMENT' },
          { name: 'Short Answer Question', value: 'SHORT_ANSWER_QUESTION' },
          { name: 'Multiple Choice Question', value: 'MULTIPLE_CHOICE_QUESTION' },
        ],
        default: 'ASSIGNMENT',
        description: 'Type of the course work',
      },
      {
        displayName: 'Max Points',
        name: 'maxPoints',
        type: 'number',
        required: false,
        displayOptions: {
          show: { resource: ['courseWork'], operation: ['create', 'update'] },
        },
        default: 100,
        description: 'Maximum grade for this course work',
      },
      {
        displayName: 'Due Date',
        name: 'dueDate',
        type: 'string',
        required: false,
        displayOptions: {
          show: { resource: ['courseWork'], operation: ['create', 'update'] },
        },
        default: '',
        placeholder: '2025-12-31',
        description: 'Due date in YYYY-MM-DD format',
      },
      {
        displayName: 'Due Time',
        name: 'dueTime',
        type: 'string',
        required: false,
        displayOptions: {
          show: { resource: ['courseWork'], operation: ['create', 'update'] },
        },
        default: '',
        placeholder: '23:59',
        description: 'Due time in HH:MM format (24-hour)',
      },
      {
        displayName: 'Topic ID',
        name: 'topicId',
        type: 'string',
        required: false,
        displayOptions: {
          show: { resource: ['courseWork'], operation: ['create', 'update'] },
        },
        default: '',
        description: 'ID of the topic to associate with this course work',
      },
      {
        displayName: 'State',
        name: 'courseWorkState',
        type: 'options',
        required: false,
        displayOptions: {
          show: { resource: ['courseWork'], operation: ['create', 'update'] },
        },
        options: [
          { name: 'Draft', value: 'DRAFT' },
          { name: 'Published', value: 'PUBLISHED' },
        ],
        default: 'PUBLISHED',
        description: 'State of the course work',
      },
      // === STUDENT SUBMISSION PARAMETERS ===
      {
        displayName: 'Submission ID',
        name: 'submissionId',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['studentSubmission'], operation: ['get', 'grade', 'return', 'modifyAttachments'] },
        },
        default: '',
        description: 'The ID of the student submission',
      },
      {
        displayName: 'Assigned Grade',
        name: 'assignedGrade',
        type: 'number',
        required: true,
        displayOptions: {
          show: { resource: ['studentSubmission'], operation: ['grade'] },
        },
        default: 0,
        description: 'The grade to assign to the submission',
      },
      {
        displayName: 'Draft Grade',
        name: 'draftGrade',
        type: 'number',
        required: false,
        displayOptions: {
          show: { resource: ['studentSubmission'], operation: ['grade'] },
        },
        default: 0,
        description: 'Optional draft grade (visible to teacher only)',
      },
      // === STUDENT/TEACHER PARAMETERS ===
      {
        displayName: 'User ID',
        name: 'userId',
        type: 'string',
        required: true,
        displayOptions: {
          show: {
            resource: ['student', 'teacher'],
            operation: ['create', 'get', 'delete'],
          },
        },
        default: '',
        placeholder: 'user@example.com',
        description: 'Email address or ID of the user',
      },
      // === ANNOUNCEMENT PARAMETERS ===
      {
        displayName: 'Announcement ID',
        name: 'announcementId',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['announcement'], operation: ['get', 'update', 'delete'] },
        },
        default: '',
        description: 'The ID of the announcement',
      },
      {
        displayName: 'Text',
        name: 'text',
        type: 'string',
        typeOptions: { rows: 3 },
        required: true,
        displayOptions: {
          show: { resource: ['announcement'], operation: ['create'] },
        },
        default: '',
        description: 'Text of the announcement',
      },
      {
        displayName: 'Text',
        name: 'text',
        type: 'string',
        typeOptions: { rows: 3 },
        required: false,
        displayOptions: {
          show: { resource: ['announcement'], operation: ['update'] },
        },
        default: '',
        description: 'New text of the announcement',
      },
      {
        displayName: 'State',
        name: 'announcementState',
        type: 'options',
        required: false,
        displayOptions: {
          show: { resource: ['announcement'], operation: ['create', 'update'] },
        },
        options: [
          { name: 'Draft', value: 'DRAFT' },
          { name: 'Published', value: 'PUBLISHED' },
        ],
        default: 'PUBLISHED',
        description: 'State of the announcement',
      },
      {
        displayName: 'Scheduled Time',
        name: 'scheduledTime',
        type: 'string',
        required: false,
        displayOptions: {
          show: { resource: ['announcement'], operation: ['create', 'update'] },
        },
        default: '',
        placeholder: '2025-12-31T10:00:00Z',
        description: 'Scheduled time for publishing (ISO 8601 format)',
      },
      // === TOPIC PARAMETERS ===
      {
        displayName: 'Topic ID',
        name: 'topicIdParam',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['topic'], operation: ['get', 'update', 'delete'] },
        },
        default: '',
        description: 'The ID of the topic',
      },
      {
        displayName: 'Name',
        name: 'topicName',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['topic'], operation: ['create'] },
        },
        default: '',
        description: 'Name of the topic',
      },
      {
        displayName: 'Name',
        name: 'topicName',
        type: 'string',
        required: false,
        displayOptions: {
          show: { resource: ['topic'], operation: ['update'] },
        },
        default: '',
        description: 'New name of the topic',
      },
      // === PAGINATION PARAMETERS ===
      {
        displayName: 'Return All',
        name: 'returnAll',
        type: 'boolean',
        displayOptions: {
          show: { operation: ['getAll'] },
        },
        default: false,
        description: 'Whether to return all results or only up to a given limit',
      },
      {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        displayOptions: {
          show: { operation: ['getAll'], returnAll: [false] },
        },
        typeOptions: {
          minValue: 1,
          maxValue: 100,
        },
        default: 50,
        description: 'Max number of results to return',
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

        switch (resource) {
          case 'course':
            result = await executeCourseOperation.call(this, accessToken, operation, itemIndex);
            break;
          case 'courseWork':
            result = await executeCourseWorkOperation.call(this, accessToken, operation, itemIndex);
            break;
          case 'studentSubmission':
            result = await executeStudentSubmissionOperation.call(this, accessToken, operation, itemIndex);
            break;
          case 'student':
            result = await executeStudentOperation.call(this, accessToken, operation, itemIndex);
            break;
          case 'teacher':
            result = await executeTeacherOperation.call(this, accessToken, operation, itemIndex);
            break;
          case 'announcement':
            result = await executeAnnouncementOperation.call(this, accessToken, operation, itemIndex);
            break;
          case 'topic':
            result = await executeTopicOperation.call(this, accessToken, operation, itemIndex);
            break;
          default:
            throw new Error(`Unknown resource: ${resource}`);
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

// === HELPER FUNCTION: Classroom API Request ===
async function classroomRequest(
  this: IExecuteFunctions,
  accessToken: string,
  method: string,
  endpoint: string,
  body?: IDataObject,
  qs?: IDataObject,
): Promise<unknown> {
  const options: IHttpRequestOptions = {
    method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: `https://classroom.googleapis.com/v1${endpoint}`,
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

// === HELPER: Fetch all pages ===
async function classroomRequestAllPages(
  this: IExecuteFunctions,
  accessToken: string,
  endpoint: string,
  itemsKey: string,
  qs: IDataObject = {},
  limit?: number,
): Promise<unknown[]> {
  const allItems: unknown[] = [];
  let pageToken: string | undefined;

  do {
    const queryParams: IDataObject = { ...qs };
    if (pageToken) {
      queryParams.pageToken = pageToken;
    }
    if (limit && !pageToken) {
      queryParams.pageSize = Math.min(limit, 100);
    }

    const response = await classroomRequest.call(this, accessToken, 'GET', endpoint, undefined, queryParams) as IDataObject;

    const items = response[itemsKey] as unknown[] || [];
    allItems.push(...items);

    pageToken = response.nextPageToken as string | undefined;

    // Stop if we've reached the limit
    if (limit && allItems.length >= limit) {
      return allItems.slice(0, limit);
    }
  } while (pageToken);

  return allItems;
}

// === COURSE OPERATIONS ===
async function executeCourseOperation(
  this: IExecuteFunctions,
  accessToken: string,
  operation: string,
  itemIndex: number,
): Promise<unknown> {
  switch (operation) {
    case 'create': {
      const name = this.getNodeParameter('name', itemIndex) as string;
      const section = this.getNodeParameter('section', itemIndex, '') as string;
      const description = this.getNodeParameter('description', itemIndex, '') as string;
      const room = this.getNodeParameter('room', itemIndex, '') as string;
      const ownerId = this.getNodeParameter('ownerId', itemIndex, '') as string;

      const body: IDataObject = { name };
      if (section) body.section = section;
      if (description) body.descriptionHeading = description;
      if (room) body.room = room;
      if (ownerId) body.ownerId = ownerId;

      return classroomRequest.call(this, accessToken, 'POST', '/courses', body);
    }

    case 'get': {
      const courseId = this.getNodeParameter('courseId', itemIndex) as string;
      return classroomRequest.call(this, accessToken, 'GET', `/courses/${encodeURIComponent(courseId)}`);
    }

    case 'getAll': {
      const returnAll = this.getNodeParameter('returnAll', itemIndex) as boolean;
      const courseState = this.getNodeParameter('courseState', itemIndex, '') as string;

      const qs: IDataObject = {};
      if (courseState) qs.courseStates = courseState;

      if (returnAll) {
        const courses = await classroomRequestAllPages.call(this, accessToken, '/courses', 'courses', qs);
        return { courses };
      } else {
        const limit = this.getNodeParameter('limit', itemIndex) as number;
        const courses = await classroomRequestAllPages.call(this, accessToken, '/courses', 'courses', qs, limit);
        return { courses };
      }
    }

    case 'update': {
      const courseId = this.getNodeParameter('courseId', itemIndex) as string;
      const name = this.getNodeParameter('name', itemIndex, '') as string;
      const section = this.getNodeParameter('section', itemIndex, '') as string;
      const description = this.getNodeParameter('description', itemIndex, '') as string;
      const room = this.getNodeParameter('room', itemIndex, '') as string;
      const courseState = this.getNodeParameter('courseState', itemIndex, '') as string;

      const body: IDataObject = {};
      const updateMask: string[] = [];

      if (name) { body.name = name; updateMask.push('name'); }
      if (section) { body.section = section; updateMask.push('section'); }
      if (description) { body.descriptionHeading = description; updateMask.push('descriptionHeading'); }
      if (room) { body.room = room; updateMask.push('room'); }
      if (courseState) { body.courseState = courseState; updateMask.push('courseState'); }

      return classroomRequest.call(
        this,
        accessToken,
        'PATCH',
        `/courses/${encodeURIComponent(courseId)}`,
        body,
        { updateMask: updateMask.join(',') }
      );
    }

    case 'delete': {
      const courseId = this.getNodeParameter('courseId', itemIndex) as string;
      await classroomRequest.call(this, accessToken, 'DELETE', `/courses/${encodeURIComponent(courseId)}`);
      return { success: true, courseId, action: 'deleted' };
    }

    case 'archive': {
      const courseId = this.getNodeParameter('courseId', itemIndex) as string;
      return classroomRequest.call(
        this,
        accessToken,
        'PATCH',
        `/courses/${encodeURIComponent(courseId)}`,
        { courseState: 'ARCHIVED' },
        { updateMask: 'courseState' }
      );
    }

    default:
      throw new Error(`Unknown course operation: ${operation}`);
  }
}

// === COURSEWORK OPERATIONS ===
async function executeCourseWorkOperation(
  this: IExecuteFunctions,
  accessToken: string,
  operation: string,
  itemIndex: number,
): Promise<unknown> {
  const courseId = this.getNodeParameter('courseId', itemIndex) as string;

  switch (operation) {
    case 'create': {
      const title = this.getNodeParameter('title', itemIndex) as string;
      const courseWorkDescription = this.getNodeParameter('courseWorkDescription', itemIndex, '') as string;
      const workType = this.getNodeParameter('workType', itemIndex) as string;
      const maxPoints = this.getNodeParameter('maxPoints', itemIndex, 100) as number;
      const dueDate = this.getNodeParameter('dueDate', itemIndex, '') as string;
      const dueTime = this.getNodeParameter('dueTime', itemIndex, '') as string;
      const topicId = this.getNodeParameter('topicId', itemIndex, '') as string;
      const state = this.getNodeParameter('courseWorkState', itemIndex, 'PUBLISHED') as string;

      const body: IDataObject = {
        title,
        workType,
        state,
      };

      if (courseWorkDescription) body.description = courseWorkDescription;
      if (maxPoints) body.maxPoints = maxPoints;
      if (topicId) body.topicId = topicId;

      // Handle due date
      if (dueDate) {
        const [year, month, day] = dueDate.split('-').map(Number);
        body.dueDate = { year, month, day };

        if (dueTime) {
          const [hours, minutes] = dueTime.split(':').map(Number);
          body.dueTime = { hours, minutes };
        }
      }

      return classroomRequest.call(
        this,
        accessToken,
        'POST',
        `/courses/${encodeURIComponent(courseId)}/courseWork`,
        body
      );
    }

    case 'get': {
      const courseWorkId = this.getNodeParameter('courseWorkId', itemIndex) as string;
      return classroomRequest.call(
        this,
        accessToken,
        'GET',
        `/courses/${encodeURIComponent(courseId)}/courseWork/${encodeURIComponent(courseWorkId)}`
      );
    }

    case 'getAll': {
      const returnAll = this.getNodeParameter('returnAll', itemIndex) as boolean;

      if (returnAll) {
        const courseWork = await classroomRequestAllPages.call(
          this,
          accessToken,
          `/courses/${encodeURIComponent(courseId)}/courseWork`,
          'courseWork'
        );
        return { courseWork };
      } else {
        const limit = this.getNodeParameter('limit', itemIndex) as number;
        const courseWork = await classroomRequestAllPages.call(
          this,
          accessToken,
          `/courses/${encodeURIComponent(courseId)}/courseWork`,
          'courseWork',
          {},
          limit
        );
        return { courseWork };
      }
    }

    case 'update': {
      const courseWorkId = this.getNodeParameter('courseWorkId', itemIndex) as string;
      const title = this.getNodeParameter('title', itemIndex, '') as string;
      const courseWorkDescription = this.getNodeParameter('courseWorkDescription', itemIndex, '') as string;
      const maxPoints = this.getNodeParameter('maxPoints', itemIndex, 0) as number;
      const dueDate = this.getNodeParameter('dueDate', itemIndex, '') as string;
      const dueTime = this.getNodeParameter('dueTime', itemIndex, '') as string;
      const topicId = this.getNodeParameter('topicId', itemIndex, '') as string;
      const state = this.getNodeParameter('courseWorkState', itemIndex, '') as string;

      const body: IDataObject = {};
      const updateMask: string[] = [];

      if (title) { body.title = title; updateMask.push('title'); }
      if (courseWorkDescription) { body.description = courseWorkDescription; updateMask.push('description'); }
      if (maxPoints > 0) { body.maxPoints = maxPoints; updateMask.push('maxPoints'); }
      if (topicId) { body.topicId = topicId; updateMask.push('topicId'); }
      if (state) { body.state = state; updateMask.push('state'); }

      if (dueDate) {
        const [year, month, day] = dueDate.split('-').map(Number);
        body.dueDate = { year, month, day };
        updateMask.push('dueDate');

        if (dueTime) {
          const [hours, minutes] = dueTime.split(':').map(Number);
          body.dueTime = { hours, minutes };
          updateMask.push('dueTime');
        }
      }

      return classroomRequest.call(
        this,
        accessToken,
        'PATCH',
        `/courses/${encodeURIComponent(courseId)}/courseWork/${encodeURIComponent(courseWorkId)}`,
        body,
        { updateMask: updateMask.join(',') }
      );
    }

    case 'delete': {
      const courseWorkId = this.getNodeParameter('courseWorkId', itemIndex) as string;
      await classroomRequest.call(
        this,
        accessToken,
        'DELETE',
        `/courses/${encodeURIComponent(courseId)}/courseWork/${encodeURIComponent(courseWorkId)}`
      );
      return { success: true, courseId, courseWorkId, action: 'deleted' };
    }

    default:
      throw new Error(`Unknown courseWork operation: ${operation}`);
  }
}

// === STUDENT SUBMISSION OPERATIONS ===
async function executeStudentSubmissionOperation(
  this: IExecuteFunctions,
  accessToken: string,
  operation: string,
  itemIndex: number,
): Promise<unknown> {
  const courseId = this.getNodeParameter('courseId', itemIndex) as string;
  const courseWorkId = this.getNodeParameter('courseWorkId', itemIndex) as string;

  const basePath = `/courses/${encodeURIComponent(courseId)}/courseWork/${encodeURIComponent(courseWorkId)}/studentSubmissions`;

  switch (operation) {
    case 'get': {
      const submissionId = this.getNodeParameter('submissionId', itemIndex) as string;
      return classroomRequest.call(
        this,
        accessToken,
        'GET',
        `${basePath}/${encodeURIComponent(submissionId)}`
      );
    }

    case 'getAll': {
      const returnAll = this.getNodeParameter('returnAll', itemIndex) as boolean;

      if (returnAll) {
        const studentSubmissions = await classroomRequestAllPages.call(
          this,
          accessToken,
          basePath,
          'studentSubmissions'
        );
        return { studentSubmissions };
      } else {
        const limit = this.getNodeParameter('limit', itemIndex) as number;
        const studentSubmissions = await classroomRequestAllPages.call(
          this,
          accessToken,
          basePath,
          'studentSubmissions',
          {},
          limit
        );
        return { studentSubmissions };
      }
    }

    case 'grade': {
      const submissionId = this.getNodeParameter('submissionId', itemIndex) as string;
      const assignedGrade = this.getNodeParameter('assignedGrade', itemIndex) as number;
      const draftGrade = this.getNodeParameter('draftGrade', itemIndex, 0) as number;

      const body: IDataObject = { assignedGrade };
      const updateMask = ['assignedGrade'];

      if (draftGrade > 0) {
        body.draftGrade = draftGrade;
        updateMask.push('draftGrade');
      }

      return classroomRequest.call(
        this,
        accessToken,
        'PATCH',
        `${basePath}/${encodeURIComponent(submissionId)}`,
        body,
        { updateMask: updateMask.join(',') }
      );
    }

    case 'return': {
      const submissionId = this.getNodeParameter('submissionId', itemIndex) as string;
      return classroomRequest.call(
        this,
        accessToken,
        'POST',
        `${basePath}/${encodeURIComponent(submissionId)}:return`,
        {}
      );
    }

    case 'modifyAttachments': {
      const submissionId = this.getNodeParameter('submissionId', itemIndex) as string;
      // For now, just return the submission - full attachment support would require additional parameters
      return classroomRequest.call(
        this,
        accessToken,
        'POST',
        `${basePath}/${encodeURIComponent(submissionId)}:modifyAttachments`,
        { addAttachments: [] }
      );
    }

    default:
      throw new Error(`Unknown studentSubmission operation: ${operation}`);
  }
}

// === STUDENT OPERATIONS ===
async function executeStudentOperation(
  this: IExecuteFunctions,
  accessToken: string,
  operation: string,
  itemIndex: number,
): Promise<unknown> {
  const courseId = this.getNodeParameter('courseId', itemIndex) as string;

  switch (operation) {
    case 'create': {
      const userId = this.getNodeParameter('userId', itemIndex) as string;
      return classroomRequest.call(
        this,
        accessToken,
        'POST',
        `/courses/${encodeURIComponent(courseId)}/students`,
        { userId }
      );
    }

    case 'get': {
      const userId = this.getNodeParameter('userId', itemIndex) as string;
      return classroomRequest.call(
        this,
        accessToken,
        'GET',
        `/courses/${encodeURIComponent(courseId)}/students/${encodeURIComponent(userId)}`
      );
    }

    case 'getAll': {
      const returnAll = this.getNodeParameter('returnAll', itemIndex) as boolean;

      if (returnAll) {
        const students = await classroomRequestAllPages.call(
          this,
          accessToken,
          `/courses/${encodeURIComponent(courseId)}/students`,
          'students'
        );
        return { students };
      } else {
        const limit = this.getNodeParameter('limit', itemIndex) as number;
        const students = await classroomRequestAllPages.call(
          this,
          accessToken,
          `/courses/${encodeURIComponent(courseId)}/students`,
          'students',
          {},
          limit
        );
        return { students };
      }
    }

    case 'delete': {
      const userId = this.getNodeParameter('userId', itemIndex) as string;
      await classroomRequest.call(
        this,
        accessToken,
        'DELETE',
        `/courses/${encodeURIComponent(courseId)}/students/${encodeURIComponent(userId)}`
      );
      return { success: true, courseId, userId, action: 'removed' };
    }

    default:
      throw new Error(`Unknown student operation: ${operation}`);
  }
}

// === TEACHER OPERATIONS ===
async function executeTeacherOperation(
  this: IExecuteFunctions,
  accessToken: string,
  operation: string,
  itemIndex: number,
): Promise<unknown> {
  const courseId = this.getNodeParameter('courseId', itemIndex) as string;

  switch (operation) {
    case 'create': {
      const userId = this.getNodeParameter('userId', itemIndex) as string;
      return classroomRequest.call(
        this,
        accessToken,
        'POST',
        `/courses/${encodeURIComponent(courseId)}/teachers`,
        { userId }
      );
    }

    case 'get': {
      const userId = this.getNodeParameter('userId', itemIndex) as string;
      return classroomRequest.call(
        this,
        accessToken,
        'GET',
        `/courses/${encodeURIComponent(courseId)}/teachers/${encodeURIComponent(userId)}`
      );
    }

    case 'getAll': {
      const returnAll = this.getNodeParameter('returnAll', itemIndex) as boolean;

      if (returnAll) {
        const teachers = await classroomRequestAllPages.call(
          this,
          accessToken,
          `/courses/${encodeURIComponent(courseId)}/teachers`,
          'teachers'
        );
        return { teachers };
      } else {
        const limit = this.getNodeParameter('limit', itemIndex) as number;
        const teachers = await classroomRequestAllPages.call(
          this,
          accessToken,
          `/courses/${encodeURIComponent(courseId)}/teachers`,
          'teachers',
          {},
          limit
        );
        return { teachers };
      }
    }

    case 'delete': {
      const userId = this.getNodeParameter('userId', itemIndex) as string;
      await classroomRequest.call(
        this,
        accessToken,
        'DELETE',
        `/courses/${encodeURIComponent(courseId)}/teachers/${encodeURIComponent(userId)}`
      );
      return { success: true, courseId, userId, action: 'removed' };
    }

    default:
      throw new Error(`Unknown teacher operation: ${operation}`);
  }
}

// === ANNOUNCEMENT OPERATIONS ===
async function executeAnnouncementOperation(
  this: IExecuteFunctions,
  accessToken: string,
  operation: string,
  itemIndex: number,
): Promise<unknown> {
  const courseId = this.getNodeParameter('courseId', itemIndex) as string;

  switch (operation) {
    case 'create': {
      const text = this.getNodeParameter('text', itemIndex) as string;
      const state = this.getNodeParameter('announcementState', itemIndex, 'PUBLISHED') as string;
      const scheduledTime = this.getNodeParameter('scheduledTime', itemIndex, '') as string;

      const body: IDataObject = { text, state };
      if (scheduledTime) body.scheduledTime = scheduledTime;

      return classroomRequest.call(
        this,
        accessToken,
        'POST',
        `/courses/${encodeURIComponent(courseId)}/announcements`,
        body
      );
    }

    case 'get': {
      const announcementId = this.getNodeParameter('announcementId', itemIndex) as string;
      return classroomRequest.call(
        this,
        accessToken,
        'GET',
        `/courses/${encodeURIComponent(courseId)}/announcements/${encodeURIComponent(announcementId)}`
      );
    }

    case 'getAll': {
      const returnAll = this.getNodeParameter('returnAll', itemIndex) as boolean;

      if (returnAll) {
        const announcements = await classroomRequestAllPages.call(
          this,
          accessToken,
          `/courses/${encodeURIComponent(courseId)}/announcements`,
          'announcements'
        );
        return { announcements };
      } else {
        const limit = this.getNodeParameter('limit', itemIndex) as number;
        const announcements = await classroomRequestAllPages.call(
          this,
          accessToken,
          `/courses/${encodeURIComponent(courseId)}/announcements`,
          'announcements',
          {},
          limit
        );
        return { announcements };
      }
    }

    case 'update': {
      const announcementId = this.getNodeParameter('announcementId', itemIndex) as string;
      const text = this.getNodeParameter('text', itemIndex, '') as string;
      const state = this.getNodeParameter('announcementState', itemIndex, '') as string;
      const scheduledTime = this.getNodeParameter('scheduledTime', itemIndex, '') as string;

      const body: IDataObject = {};
      const updateMask: string[] = [];

      if (text) { body.text = text; updateMask.push('text'); }
      if (state) { body.state = state; updateMask.push('state'); }
      if (scheduledTime) { body.scheduledTime = scheduledTime; updateMask.push('scheduledTime'); }

      return classroomRequest.call(
        this,
        accessToken,
        'PATCH',
        `/courses/${encodeURIComponent(courseId)}/announcements/${encodeURIComponent(announcementId)}`,
        body,
        { updateMask: updateMask.join(',') }
      );
    }

    case 'delete': {
      const announcementId = this.getNodeParameter('announcementId', itemIndex) as string;
      await classroomRequest.call(
        this,
        accessToken,
        'DELETE',
        `/courses/${encodeURIComponent(courseId)}/announcements/${encodeURIComponent(announcementId)}`
      );
      return { success: true, courseId, announcementId, action: 'deleted' };
    }

    default:
      throw new Error(`Unknown announcement operation: ${operation}`);
  }
}

// === TOPIC OPERATIONS ===
async function executeTopicOperation(
  this: IExecuteFunctions,
  accessToken: string,
  operation: string,
  itemIndex: number,
): Promise<unknown> {
  const courseId = this.getNodeParameter('courseId', itemIndex) as string;

  switch (operation) {
    case 'create': {
      const name = this.getNodeParameter('topicName', itemIndex) as string;
      return classroomRequest.call(
        this,
        accessToken,
        'POST',
        `/courses/${encodeURIComponent(courseId)}/topics`,
        { name }
      );
    }

    case 'get': {
      const topicId = this.getNodeParameter('topicIdParam', itemIndex) as string;
      return classroomRequest.call(
        this,
        accessToken,
        'GET',
        `/courses/${encodeURIComponent(courseId)}/topics/${encodeURIComponent(topicId)}`
      );
    }

    case 'getAll': {
      const returnAll = this.getNodeParameter('returnAll', itemIndex) as boolean;

      if (returnAll) {
        const topics = await classroomRequestAllPages.call(
          this,
          accessToken,
          `/courses/${encodeURIComponent(courseId)}/topics`,
          'topic'
        );
        return { topics };
      } else {
        const limit = this.getNodeParameter('limit', itemIndex) as number;
        const topics = await classroomRequestAllPages.call(
          this,
          accessToken,
          `/courses/${encodeURIComponent(courseId)}/topics`,
          'topic',
          {},
          limit
        );
        return { topics };
      }
    }

    case 'update': {
      const topicId = this.getNodeParameter('topicIdParam', itemIndex) as string;
      const name = this.getNodeParameter('topicName', itemIndex, '') as string;

      const body: IDataObject = {};
      if (name) body.name = name;

      return classroomRequest.call(
        this,
        accessToken,
        'PATCH',
        `/courses/${encodeURIComponent(courseId)}/topics/${encodeURIComponent(topicId)}`,
        body,
        { updateMask: 'name' }
      );
    }

    case 'delete': {
      const topicId = this.getNodeParameter('topicIdParam', itemIndex) as string;
      await classroomRequest.call(
        this,
        accessToken,
        'DELETE',
        `/courses/${encodeURIComponent(courseId)}/topics/${encodeURIComponent(topicId)}`
      );
      return { success: true, courseId, topicId, action: 'deleted' };
    }

    default:
      throw new Error(`Unknown topic operation: ${operation}`);
  }
}
