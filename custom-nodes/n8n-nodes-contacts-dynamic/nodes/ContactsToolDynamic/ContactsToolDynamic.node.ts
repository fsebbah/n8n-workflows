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

export class ContactsToolDynamic implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Google Contacts Tool Dynamic',
    name: 'contactsToolDynamic',
    icon: 'file:contacts.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{ $parameter["operation"] + " " + $parameter["resource"] }}',
    description: 'Google People API with dynamic OAuth token - Multi-tenant ready',
    defaults: {
      name: 'Contacts Dynamic',
    },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [],
    properties: [
      // === ACCESS TOKEN (DYNAMIC) ===
      {
        displayName: 'Access Token',
        name: 'accessToken',
        type: 'string',
        typeOptions: { password: true },
        required: true,
        default: '',
        placeholder: '={{ $json.access_token }}',
        description: 'OAuth 2.0 access token for Google People API',
      },
      // === RESOURCE ===
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Contact', value: 'contact' },
          { name: 'Contact Group', value: 'contactGroup' },
          { name: 'Other Contact', value: 'otherContact' },
        ],
        default: 'contact',
      },
      // === OPERATIONS: CONTACT ===
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: { resource: ['contact'] },
        },
        options: [
          { name: 'Create', value: 'create', description: 'Create a new contact' },
          { name: 'Delete', value: 'delete', description: 'Delete a contact' },
          { name: 'Get', value: 'get', description: 'Get a contact by ID' },
          { name: 'Get Many', value: 'getAll', description: 'Get all contacts' },
          { name: 'Search', value: 'search', description: 'Search contacts' },
          { name: 'Update', value: 'update', description: 'Update a contact' },
        ],
        default: 'getAll',
      },
      // === OPERATIONS: CONTACT GROUP ===
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: { resource: ['contactGroup'] },
        },
        options: [
          { name: 'Add Members', value: 'addMembers', description: 'Add contacts to a group' },
          { name: 'Create', value: 'create', description: 'Create a contact group' },
          { name: 'Delete', value: 'delete', description: 'Delete a contact group' },
          { name: 'Get', value: 'get', description: 'Get a contact group' },
          { name: 'Get Many', value: 'getAll', description: 'Get all contact groups' },
          { name: 'Remove Members', value: 'removeMembers', description: 'Remove contacts from a group' },
          { name: 'Update', value: 'update', description: 'Update a contact group' },
        ],
        default: 'getAll',
      },
      // === OPERATIONS: OTHER CONTACT ===
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: { resource: ['otherContact'] },
        },
        options: [
          { name: 'Copy to My Contacts', value: 'copyToMyContacts', description: 'Copy to my contacts' },
          { name: 'Get Many', value: 'getAll', description: 'List other contacts' },
          { name: 'Search', value: 'search', description: 'Search other contacts' },
        ],
        default: 'getAll',
      },
      // === PARAMETERS: RESOURCE NAME ===
      {
        displayName: 'Resource Name',
        name: 'resourceName',
        type: 'string',
        required: true,
        displayOptions: {
          show: {
            resource: ['contact', 'otherContact'],
            operation: ['get', 'update', 'delete', 'copyToMyContacts'],
          },
        },
        default: '',
        placeholder: 'people/c123456789',
        description: 'The resource name of the contact (e.g., people/c123456789)',
      },
      {
        displayName: 'Group Resource Name',
        name: 'groupResourceName',
        type: 'string',
        required: true,
        displayOptions: {
          show: {
            resource: ['contactGroup'],
            operation: ['get', 'update', 'delete', 'addMembers', 'removeMembers'],
          },
        },
        default: '',
        placeholder: 'contactGroups/abc123',
        description: 'The resource name of the contact group',
      },
      // === PARAMETERS: CONTACT CREATE/UPDATE ===
      {
        displayName: 'Given Name (First Name)',
        name: 'givenName',
        type: 'string',
        displayOptions: {
          show: { resource: ['contact'], operation: ['create', 'update'] },
        },
        default: '',
        description: 'First name of the contact',
      },
      {
        displayName: 'Family Name (Last Name)',
        name: 'familyName',
        type: 'string',
        displayOptions: {
          show: { resource: ['contact'], operation: ['create', 'update'] },
        },
        default: '',
        description: 'Last name of the contact',
      },
      {
        displayName: 'Email',
        name: 'email',
        type: 'string',
        displayOptions: {
          show: { resource: ['contact'], operation: ['create', 'update'] },
        },
        default: '',
        placeholder: 'john.doe@example.com',
        description: 'Primary email address',
      },
      {
        displayName: 'Email Type',
        name: 'emailType',
        type: 'options',
        displayOptions: {
          show: { resource: ['contact'], operation: ['create', 'update'] },
        },
        options: [
          { name: 'Home', value: 'home' },
          { name: 'Work', value: 'work' },
          { name: 'Other', value: 'other' },
        ],
        default: 'work',
      },
      {
        displayName: 'Phone',
        name: 'phone',
        type: 'string',
        displayOptions: {
          show: { resource: ['contact'], operation: ['create', 'update'] },
        },
        default: '',
        placeholder: '+33612345678',
        description: 'Primary phone number',
      },
      {
        displayName: 'Phone Type',
        name: 'phoneType',
        type: 'options',
        displayOptions: {
          show: { resource: ['contact'], operation: ['create', 'update'] },
        },
        options: [
          { name: 'Mobile', value: 'mobile' },
          { name: 'Home', value: 'home' },
          { name: 'Work', value: 'work' },
          { name: 'Other', value: 'other' },
        ],
        default: 'mobile',
      },
      {
        displayName: 'Organization',
        name: 'organization',
        type: 'string',
        displayOptions: {
          show: { resource: ['contact'], operation: ['create', 'update'] },
        },
        default: '',
        placeholder: 'Company Inc',
        description: 'Company or organization name',
      },
      {
        displayName: 'Job Title',
        name: 'jobTitle',
        type: 'string',
        displayOptions: {
          show: { resource: ['contact'], operation: ['create', 'update'] },
        },
        default: '',
        placeholder: 'Software Developer',
        description: 'Job title or position',
      },
      {
        displayName: 'Notes',
        name: 'notes',
        type: 'string',
        typeOptions: { rows: 3 },
        displayOptions: {
          show: { resource: ['contact'], operation: ['create', 'update'] },
        },
        default: '',
        description: 'Notes or biography',
      },
      // === PARAMETERS: CONTACT GROUP ===
      {
        displayName: 'Group Name',
        name: 'groupName',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['contactGroup'], operation: ['create', 'update'] },
        },
        default: '',
        placeholder: 'VIP Clients',
        description: 'Name of the contact group',
      },
      {
        displayName: 'Contact Resource Names',
        name: 'memberResourceNames',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['contactGroup'], operation: ['addMembers', 'removeMembers'] },
        },
        default: '',
        placeholder: 'people/c123,people/c456',
        description: 'Comma-separated list of contact resource names',
      },
      // === PARAMETERS: SEARCH ===
      {
        displayName: 'Query',
        name: 'query',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['contact', 'otherContact'], operation: ['search'] },
        },
        default: '',
        placeholder: 'John Doe',
        description: 'Search query (name, email, phone, etc.)',
      },
      // === PARAMETERS: PAGINATION ===
      {
        displayName: 'Page Size',
        name: 'pageSize',
        type: 'number',
        displayOptions: {
          show: { resource: ['contact', 'contactGroup', 'otherContact'], operation: ['getAll', 'search'] },
        },
        default: 100,
        description: 'Maximum number of results to return (max 1000 for contacts)',
      },
      {
        displayName: 'Page Token',
        name: 'pageToken',
        type: 'string',
        displayOptions: {
          show: { resource: ['contact', 'otherContact'], operation: ['getAll', 'search'] },
        },
        default: '',
        description: 'Token for pagination (from previous response)',
      },
      // === PARAMETERS: PERSON FIELDS ===
      {
        displayName: 'Person Fields',
        name: 'personFields',
        type: 'string',
        displayOptions: {
          show: { resource: ['contact', 'otherContact'], operation: ['get', 'getAll', 'search'] },
        },
        default: 'names,emailAddresses,phoneNumbers,organizations,photos',
        description: 'Comma-separated fields to return (names,emailAddresses,phoneNumbers,addresses,organizations,birthdays,urls,biographies,memberships,photos)',
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
          throw new Error('Access token is required');
        }

        let result: unknown;

        if (resource === 'contact') {
          result = await executeContactOperation.call(this, accessToken, operation, itemIndex);
        } else if (resource === 'contactGroup') {
          result = await executeContactGroupOperation.call(this, accessToken, operation, itemIndex);
        } else if (resource === 'otherContact') {
          result = await executeOtherContactOperation.call(this, accessToken, operation, itemIndex);
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

// === HELPER: People API Request ===
async function peopleRequest(
  this: IExecuteFunctions,
  accessToken: string,
  method: string,
  endpoint: string,
  body?: IDataObject,
  qs?: IDataObject,
): Promise<unknown> {
  const options: IHttpRequestOptions = {
    method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: `https://people.googleapis.com/v1${endpoint}`,
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

// === CONTACT OPERATIONS ===
async function executeContactOperation(
  this: IExecuteFunctions,
  accessToken: string,
  operation: string,
  itemIndex: number,
): Promise<unknown> {
  switch (operation) {
    case 'create': {
      const givenName = this.getNodeParameter('givenName', itemIndex, '') as string;
      const familyName = this.getNodeParameter('familyName', itemIndex, '') as string;
      const email = this.getNodeParameter('email', itemIndex, '') as string;
      const emailType = this.getNodeParameter('emailType', itemIndex, 'work') as string;
      const phone = this.getNodeParameter('phone', itemIndex, '') as string;
      const phoneType = this.getNodeParameter('phoneType', itemIndex, 'mobile') as string;
      const organization = this.getNodeParameter('organization', itemIndex, '') as string;
      const jobTitle = this.getNodeParameter('jobTitle', itemIndex, '') as string;
      const notes = this.getNodeParameter('notes', itemIndex, '') as string;

      const contactBody: IDataObject = {};

      if (givenName || familyName) {
        contactBody.names = [{ givenName, familyName }];
      }
      if (email) {
        contactBody.emailAddresses = [{ value: email, type: emailType }];
      }
      if (phone) {
        contactBody.phoneNumbers = [{ value: phone, type: phoneType }];
      }
      if (organization || jobTitle) {
        contactBody.organizations = [{ name: organization, title: jobTitle }];
      }
      if (notes) {
        contactBody.biographies = [{ value: notes, contentType: 'TEXT_PLAIN' }];
      }

      return peopleRequest.call(this, accessToken, 'POST', '/people:createContact', contactBody);
    }

    case 'get': {
      const resourceName = this.getNodeParameter('resourceName', itemIndex) as string;
      const personFields = this.getNodeParameter('personFields', itemIndex, 'names,emailAddresses,phoneNumbers') as string;

      return peopleRequest.call(this, accessToken, 'GET', `/${resourceName}`, undefined, { personFields });
    }

    case 'getAll': {
      const pageSize = this.getNodeParameter('pageSize', itemIndex, 100) as number;
      const pageToken = this.getNodeParameter('pageToken', itemIndex, '') as string;
      const personFields = this.getNodeParameter('personFields', itemIndex, 'names,emailAddresses,phoneNumbers') as string;

      const qs: IDataObject = { pageSize, personFields };
      if (pageToken) qs.pageToken = pageToken;

      return peopleRequest.call(this, accessToken, 'GET', '/people/me/connections', undefined, qs);
    }

    case 'update': {
      const resourceName = this.getNodeParameter('resourceName', itemIndex) as string;
      const givenName = this.getNodeParameter('givenName', itemIndex, '') as string;
      const familyName = this.getNodeParameter('familyName', itemIndex, '') as string;
      const email = this.getNodeParameter('email', itemIndex, '') as string;
      const emailType = this.getNodeParameter('emailType', itemIndex, 'work') as string;
      const phone = this.getNodeParameter('phone', itemIndex, '') as string;
      const phoneType = this.getNodeParameter('phoneType', itemIndex, 'mobile') as string;
      const organization = this.getNodeParameter('organization', itemIndex, '') as string;
      const jobTitle = this.getNodeParameter('jobTitle', itemIndex, '') as string;
      const notes = this.getNodeParameter('notes', itemIndex, '') as string;

      // First get the current contact to get etag
      const current = await peopleRequest.call(
        this,
        accessToken,
        'GET',
        `/${resourceName}`,
        undefined,
        { personFields: 'names,emailAddresses,phoneNumbers,organizations,biographies' }
      ) as { etag: string };

      const contactBody: IDataObject = { etag: current.etag };
      const updatePersonFields: string[] = [];

      if (givenName || familyName) {
        contactBody.names = [{ givenName, familyName }];
        updatePersonFields.push('names');
      }
      if (email) {
        contactBody.emailAddresses = [{ value: email, type: emailType }];
        updatePersonFields.push('emailAddresses');
      }
      if (phone) {
        contactBody.phoneNumbers = [{ value: phone, type: phoneType }];
        updatePersonFields.push('phoneNumbers');
      }
      if (organization || jobTitle) {
        contactBody.organizations = [{ name: organization, title: jobTitle }];
        updatePersonFields.push('organizations');
      }
      if (notes) {
        contactBody.biographies = [{ value: notes, contentType: 'TEXT_PLAIN' }];
        updatePersonFields.push('biographies');
      }

      return peopleRequest.call(
        this,
        accessToken,
        'PATCH',
        `/${resourceName}:updateContact`,
        contactBody,
        { updatePersonFields: updatePersonFields.join(',') }
      );
    }

    case 'delete': {
      const resourceName = this.getNodeParameter('resourceName', itemIndex) as string;
      await peopleRequest.call(this, accessToken, 'DELETE', `/${resourceName}:deleteContact`);
      return { success: true, resourceName, action: 'deleted' };
    }

    case 'search': {
      const query = this.getNodeParameter('query', itemIndex) as string;
      const pageSize = this.getNodeParameter('pageSize', itemIndex, 30) as number;
      const personFields = this.getNodeParameter('personFields', itemIndex, 'names,emailAddresses,phoneNumbers') as string;

      return peopleRequest.call(this, accessToken, 'GET', '/people:searchContacts', undefined, {
        query,
        pageSize,
        readMask: personFields,
      });
    }

    default:
      throw new Error(`Unknown contact operation: ${operation}`);
  }
}

// === CONTACT GROUP OPERATIONS ===
async function executeContactGroupOperation(
  this: IExecuteFunctions,
  accessToken: string,
  operation: string,
  itemIndex: number,
): Promise<unknown> {
  switch (operation) {
    case 'create': {
      const groupName = this.getNodeParameter('groupName', itemIndex) as string;
      return peopleRequest.call(this, accessToken, 'POST', '/contactGroups', {
        contactGroup: { name: groupName },
      });
    }

    case 'get': {
      const groupResourceName = this.getNodeParameter('groupResourceName', itemIndex) as string;
      return peopleRequest.call(this, accessToken, 'GET', `/${groupResourceName}`, undefined, {
        maxMembers: 1000,
      });
    }

    case 'getAll': {
      const pageSize = this.getNodeParameter('pageSize', itemIndex, 100) as number;
      return peopleRequest.call(this, accessToken, 'GET', '/contactGroups', undefined, { pageSize });
    }

    case 'update': {
      const groupResourceName = this.getNodeParameter('groupResourceName', itemIndex) as string;
      const groupName = this.getNodeParameter('groupName', itemIndex) as string;
      return peopleRequest.call(this, accessToken, 'PUT', `/${groupResourceName}`, {
        contactGroup: { name: groupName },
      });
    }

    case 'delete': {
      const groupResourceName = this.getNodeParameter('groupResourceName', itemIndex) as string;
      await peopleRequest.call(this, accessToken, 'DELETE', `/${groupResourceName}`);
      return { success: true, groupResourceName, action: 'deleted' };
    }

    case 'addMembers': {
      const groupResourceName = this.getNodeParameter('groupResourceName', itemIndex) as string;
      const memberResourceNames = this.getNodeParameter('memberResourceNames', itemIndex) as string;
      const resourceNamesToAdd = memberResourceNames.split(',').map(s => s.trim());

      return peopleRequest.call(this, accessToken, 'POST', `/${groupResourceName}/members:modify`, {
        resourceNamesToAdd,
      });
    }

    case 'removeMembers': {
      const groupResourceName = this.getNodeParameter('groupResourceName', itemIndex) as string;
      const memberResourceNames = this.getNodeParameter('memberResourceNames', itemIndex) as string;
      const resourceNamesToRemove = memberResourceNames.split(',').map(s => s.trim());

      return peopleRequest.call(this, accessToken, 'POST', `/${groupResourceName}/members:modify`, {
        resourceNamesToRemove,
      });
    }

    default:
      throw new Error(`Unknown contact group operation: ${operation}`);
  }
}

// === OTHER CONTACT OPERATIONS ===
async function executeOtherContactOperation(
  this: IExecuteFunctions,
  accessToken: string,
  operation: string,
  itemIndex: number,
): Promise<unknown> {
  switch (operation) {
    case 'getAll': {
      const pageSize = this.getNodeParameter('pageSize', itemIndex, 100) as number;
      const pageToken = this.getNodeParameter('pageToken', itemIndex, '') as string;
      const personFields = this.getNodeParameter('personFields', itemIndex, 'names,emailAddresses,phoneNumbers') as string;

      const qs: IDataObject = { pageSize, readMask: personFields };
      if (pageToken) qs.pageToken = pageToken;

      return peopleRequest.call(this, accessToken, 'GET', '/otherContacts', undefined, qs);
    }

    case 'search': {
      const query = this.getNodeParameter('query', itemIndex) as string;
      const pageSize = this.getNodeParameter('pageSize', itemIndex, 30) as number;
      const personFields = this.getNodeParameter('personFields', itemIndex, 'names,emailAddresses,phoneNumbers') as string;

      return peopleRequest.call(this, accessToken, 'GET', '/otherContacts:search', undefined, {
        query,
        pageSize,
        readMask: personFields,
      });
    }

    case 'copyToMyContacts': {
      const resourceName = this.getNodeParameter('resourceName', itemIndex) as string;
      return peopleRequest.call(
        this,
        accessToken,
        'POST',
        `/${resourceName}:copyOtherContactToMyContactsGroup`,
        {},
        { copyMask: 'names,emailAddresses,phoneNumbers' }
      );
    }

    default:
      throw new Error(`Unknown other contact operation: ${operation}`);
  }
}
