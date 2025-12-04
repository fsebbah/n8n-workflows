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

export class GmailToolDynamic implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Gmail Tool Dynamic',
    name: 'gmailToolDynamic',
    icon: 'file:gmail.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{ $parameter["operation"] + " " + $parameter["resource"] }}',
    description: 'Gmail API with dynamic OAuth token from input - Multi-tenant ready',
    defaults: {
      name: 'Gmail Dynamic',
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
          { name: 'Message', value: 'message' },
          { name: 'Draft', value: 'draft' },
          { name: 'Label', value: 'label' },
          { name: 'Thread', value: 'thread' },
        ],
        default: 'message',
      },
      // === OPERATIONS: MESSAGE ===
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: { resource: ['message'] },
        },
        options: [
          { name: 'Search', value: 'search', description: 'Search messages using Gmail query syntax' },
          { name: 'Get', value: 'get', description: 'Get a message by ID' },
          { name: 'Get Many', value: 'getMany', description: 'Get multiple messages' },
          { name: 'Send', value: 'send', description: 'Send an email' },
          { name: 'Reply', value: 'reply', description: 'Reply to an email' },
          { name: 'Delete', value: 'delete', description: 'Delete a message (trash)' },
          { name: 'Mark Read', value: 'markRead', description: 'Mark message as read' },
          { name: 'Mark Unread', value: 'markUnread', description: 'Mark message as unread' },
          { name: 'Add Labels', value: 'addLabels', description: 'Add labels to a message' },
          { name: 'Remove Labels', value: 'removeLabels', description: 'Remove labels from a message' },
        ],
        default: 'search',
      },
      // === OPERATIONS: DRAFT ===
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: { resource: ['draft'] },
        },
        options: [
          { name: 'Create', value: 'create', description: 'Create a draft' },
          { name: 'Get', value: 'get', description: 'Get a draft by ID' },
          { name: 'Get Many', value: 'getMany', description: 'Get multiple drafts' },
          { name: 'Delete', value: 'delete', description: 'Delete a draft' },
          { name: 'Send', value: 'send', description: 'Send a draft' },
        ],
        default: 'create',
      },
      // === OPERATIONS: LABEL ===
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: { resource: ['label'] },
        },
        options: [
          { name: 'List', value: 'list', description: 'List all labels' },
          { name: 'Get', value: 'get', description: 'Get a label by ID' },
          { name: 'Create', value: 'create', description: 'Create a label' },
          { name: 'Delete', value: 'delete', description: 'Delete a label' },
          { name: 'Update', value: 'update', description: 'Update a label' },
        ],
        default: 'list',
      },
      // === OPERATIONS: THREAD ===
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: { resource: ['thread'] },
        },
        options: [
          { name: 'Get', value: 'get', description: 'Get a thread by ID' },
          { name: 'Get Many', value: 'getMany', description: 'Get multiple threads' },
          { name: 'Delete', value: 'delete', description: 'Delete a thread (trash)' },
          { name: 'Modify', value: 'modify', description: 'Modify thread labels' },
        ],
        default: 'get',
      },
      // === PARAMETERS: SEARCH ===
      {
        displayName: 'Query',
        name: 'query',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['message'], operation: ['search'] },
        },
        default: '',
        placeholder: 'from:sender@example.com is:unread',
        description: 'Gmail search query syntax. Examples: "from:user@example.com", "is:unread", "subject:hello"',
      },
      {
        displayName: 'Max Results',
        name: 'maxResults',
        type: 'number',
        displayOptions: {
          show: {
            resource: ['message', 'thread'],
            operation: ['search', 'getMany']
          },
        },
        default: 10,
        description: 'Maximum number of results to return',
      },
      {
        displayName: 'Include Full Message',
        name: 'includeFullMessage',
        type: 'boolean',
        displayOptions: {
          show: { resource: ['message'], operation: ['search'] },
        },
        default: true,
        description: 'Whether to fetch full message details for each result',
      },
      // === PARAMETERS: GET MESSAGE ===
      {
        displayName: 'Message ID',
        name: 'messageId',
        type: 'string',
        required: true,
        displayOptions: {
          show: {
            resource: ['message'],
            operation: ['get', 'delete', 'markRead', 'markUnread', 'reply', 'addLabels', 'removeLabels']
          },
        },
        default: '',
        description: 'The ID of the message',
      },
      // === PARAMETERS: SEND ===
      {
        displayName: 'To',
        name: 'to',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['message', 'draft'], operation: ['send', 'reply', 'create'] },
        },
        default: '',
        placeholder: 'recipient@example.com',
        description: 'Recipient email address',
      },
      {
        displayName: 'Subject',
        name: 'subject',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['message', 'draft'], operation: ['send', 'create'] },
        },
        default: '',
        description: 'Email subject line',
      },
      {
        displayName: 'Body',
        name: 'body',
        type: 'string',
        typeOptions: { rows: 5 },
        required: true,
        displayOptions: {
          show: { resource: ['message', 'draft'], operation: ['send', 'reply', 'create'] },
        },
        default: '',
        description: 'Email body content',
      },
      {
        displayName: 'CC',
        name: 'cc',
        type: 'string',
        displayOptions: {
          show: { resource: ['message', 'draft'], operation: ['send', 'create'] },
        },
        default: '',
        placeholder: 'cc@example.com',
        description: 'CC recipients (comma separated)',
      },
      {
        displayName: 'BCC',
        name: 'bcc',
        type: 'string',
        displayOptions: {
          show: { resource: ['message', 'draft'], operation: ['send', 'create'] },
        },
        default: '',
        placeholder: 'bcc@example.com',
        description: 'BCC recipients (comma separated)',
      },
      // === PARAMETERS: LABEL OPERATIONS ===
      {
        displayName: 'Label IDs',
        name: 'labelIds',
        type: 'string',
        required: true,
        displayOptions: {
          show: {
            resource: ['message', 'thread'],
            operation: ['addLabels', 'removeLabels', 'modify']
          },
        },
        default: '',
        placeholder: 'Label_1,Label_2',
        description: 'Comma-separated list of label IDs',
      },
      // === PARAMETERS: LABEL CRUD ===
      {
        displayName: 'Label Name',
        name: 'labelName',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['label'], operation: ['create', 'update'] },
        },
        default: '',
        description: 'Name of the label',
      },
      {
        displayName: 'Label ID',
        name: 'labelId',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['label'], operation: ['get', 'delete', 'update'] },
        },
        default: '',
        description: 'The ID of the label',
      },
      // === PARAMETERS: DRAFT ===
      {
        displayName: 'Draft ID',
        name: 'draftId',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['draft'], operation: ['get', 'delete', 'send'] },
        },
        default: '',
        description: 'The ID of the draft',
      },
      // === PARAMETERS: THREAD ===
      {
        displayName: 'Thread ID',
        name: 'threadId',
        type: 'string',
        required: true,
        displayOptions: {
          show: { resource: ['thread'], operation: ['get', 'delete', 'modify'] },
        },
        default: '',
        description: 'The ID of the thread',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      try {
        // Get dynamic token (expression auto-evaluated by n8n)
        const accessToken = this.getNodeParameter('accessToken', itemIndex) as string;
        const resource = this.getNodeParameter('resource', itemIndex) as string;
        const operation = this.getNodeParameter('operation', itemIndex) as string;

        if (!accessToken) {
          throw new Error('Access token is required. Use expression like {{ $json.access_token }}');
        }

        let result: unknown;

        // === MESSAGE OPERATIONS ===
        if (resource === 'message') {
          result = await executeMessageOperation.call(this, accessToken, operation, itemIndex);
        }
        // === DRAFT OPERATIONS ===
        else if (resource === 'draft') {
          result = await executeDraftOperation.call(this, accessToken, operation, itemIndex);
        }
        // === LABEL OPERATIONS ===
        else if (resource === 'label') {
          result = await executeLabelOperation.call(this, accessToken, operation, itemIndex);
        }
        // === THREAD OPERATIONS ===
        else if (resource === 'thread') {
          result = await executeThreadOperation.call(this, accessToken, operation, itemIndex);
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

// === HELPER FUNCTION: Gmail API Request ===
async function gmailRequest(
  this: IExecuteFunctions,
  accessToken: string,
  method: string,
  endpoint: string,
  body?: IDataObject,
  qs?: IDataObject,
): Promise<unknown> {
  const options: IHttpRequestOptions = {
    method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: `https://www.googleapis.com/gmail/v1/users/me${endpoint}`,
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

// === MESSAGE OPERATIONS ===
async function executeMessageOperation(
  this: IExecuteFunctions,
  accessToken: string,
  operation: string,
  itemIndex: number,
): Promise<unknown> {
  switch (operation) {
    case 'search': {
      const query = this.getNodeParameter('query', itemIndex) as string;
      const maxResults = this.getNodeParameter('maxResults', itemIndex) as number;
      const includeFullMessage = this.getNodeParameter('includeFullMessage', itemIndex) as boolean;

      const response = await gmailRequest.call(this, accessToken, 'GET', '/messages', undefined, {
        q: query,
        maxResults,
      }) as { messages?: Array<{ id: string }>; resultSizeEstimate?: number };

      if (!includeFullMessage || !response.messages) {
        return response;
      }

      // Fetch full message details
      const detailedMessages = [];
      for (const msg of response.messages.slice(0, maxResults)) {
        const detail = await gmailRequest.call(this, accessToken, 'GET', `/messages/${msg.id}`);
        detailedMessages.push(detail);
      }

      return {
        messages: detailedMessages,
        resultSizeEstimate: response.resultSizeEstimate,
      };
    }

    case 'get': {
      const messageId = this.getNodeParameter('messageId', itemIndex) as string;
      return gmailRequest.call(this, accessToken, 'GET', `/messages/${messageId}`);
    }

    case 'getMany': {
      const maxResults = this.getNodeParameter('maxResults', itemIndex) as number;
      return gmailRequest.call(this, accessToken, 'GET', '/messages', undefined, { maxResults });
    }

    case 'send': {
      const to = this.getNodeParameter('to', itemIndex) as string;
      const subject = this.getNodeParameter('subject', itemIndex) as string;
      const body = this.getNodeParameter('body', itemIndex) as string;
      const cc = this.getNodeParameter('cc', itemIndex, '') as string;
      const bcc = this.getNodeParameter('bcc', itemIndex, '') as string;

      const emailLines = [
        `To: ${to}`,
      ];
      if (cc) emailLines.push(`Cc: ${cc}`);
      if (bcc) emailLines.push(`Bcc: ${bcc}`);
      emailLines.push(
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        body,
      );

      const encodedEmail = Buffer.from(emailLines.join('\r\n'))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      return gmailRequest.call(this, accessToken, 'POST', '/messages/send', { raw: encodedEmail });
    }

    case 'reply': {
      const messageId = this.getNodeParameter('messageId', itemIndex) as string;
      const to = this.getNodeParameter('to', itemIndex) as string;
      const body = this.getNodeParameter('body', itemIndex) as string;

      // Get original message for thread ID and subject
      const original = await gmailRequest.call(this, accessToken, 'GET', `/messages/${messageId}`) as {
        threadId: string;
        payload?: { headers?: Array<{ name: string; value: string }> };
      };

      const subjectHeader = original.payload?.headers?.find((h) => h.name.toLowerCase() === 'subject');
      const subject = subjectHeader ? `Re: ${subjectHeader.value}` : 'Re:';

      const emailLines = [
        `To: ${to}`,
        `Subject: ${subject}`,
        `In-Reply-To: ${messageId}`,
        `References: ${messageId}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        body,
      ];

      const encodedEmail = Buffer.from(emailLines.join('\r\n'))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      return gmailRequest.call(this, accessToken, 'POST', '/messages/send', {
        raw: encodedEmail,
        threadId: original.threadId,
      });
    }

    case 'delete': {
      const messageId = this.getNodeParameter('messageId', itemIndex) as string;
      await gmailRequest.call(this, accessToken, 'POST', `/messages/${messageId}/trash`);
      return { success: true, messageId, action: 'trashed' };
    }

    case 'markRead': {
      const messageId = this.getNodeParameter('messageId', itemIndex) as string;
      return gmailRequest.call(this, accessToken, 'POST', `/messages/${messageId}/modify`, {
        removeLabelIds: ['UNREAD'],
      });
    }

    case 'markUnread': {
      const messageId = this.getNodeParameter('messageId', itemIndex) as string;
      return gmailRequest.call(this, accessToken, 'POST', `/messages/${messageId}/modify`, {
        addLabelIds: ['UNREAD'],
      });
    }

    case 'addLabels': {
      const messageId = this.getNodeParameter('messageId', itemIndex) as string;
      const labelIds = (this.getNodeParameter('labelIds', itemIndex) as string).split(',').map(s => s.trim());
      return gmailRequest.call(this, accessToken, 'POST', `/messages/${messageId}/modify`, {
        addLabelIds: labelIds,
      });
    }

    case 'removeLabels': {
      const messageId = this.getNodeParameter('messageId', itemIndex) as string;
      const labelIds = (this.getNodeParameter('labelIds', itemIndex) as string).split(',').map(s => s.trim());
      return gmailRequest.call(this, accessToken, 'POST', `/messages/${messageId}/modify`, {
        removeLabelIds: labelIds,
      });
    }

    default:
      throw new Error(`Unknown message operation: ${operation}`);
  }
}

// === DRAFT OPERATIONS ===
async function executeDraftOperation(
  this: IExecuteFunctions,
  accessToken: string,
  operation: string,
  itemIndex: number,
): Promise<unknown> {
  switch (operation) {
    case 'create': {
      const to = this.getNodeParameter('to', itemIndex) as string;
      const subject = this.getNodeParameter('subject', itemIndex) as string;
      const body = this.getNodeParameter('body', itemIndex) as string;
      const cc = this.getNodeParameter('cc', itemIndex, '') as string;
      const bcc = this.getNodeParameter('bcc', itemIndex, '') as string;

      const emailLines = [`To: ${to}`];
      if (cc) emailLines.push(`Cc: ${cc}`);
      if (bcc) emailLines.push(`Bcc: ${bcc}`);
      emailLines.push(
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        body,
      );

      const encodedEmail = Buffer.from(emailLines.join('\r\n'))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      return gmailRequest.call(this, accessToken, 'POST', '/drafts', {
        message: { raw: encodedEmail },
      });
    }

    case 'get': {
      const draftId = this.getNodeParameter('draftId', itemIndex) as string;
      return gmailRequest.call(this, accessToken, 'GET', `/drafts/${draftId}`);
    }

    case 'getMany': {
      const maxResults = this.getNodeParameter('maxResults', itemIndex, 10) as number;
      return gmailRequest.call(this, accessToken, 'GET', '/drafts', undefined, { maxResults });
    }

    case 'delete': {
      const draftId = this.getNodeParameter('draftId', itemIndex) as string;
      await gmailRequest.call(this, accessToken, 'DELETE', `/drafts/${draftId}`);
      return { success: true, draftId, action: 'deleted' };
    }

    case 'send': {
      const draftId = this.getNodeParameter('draftId', itemIndex) as string;
      return gmailRequest.call(this, accessToken, 'POST', '/drafts/send', { id: draftId });
    }

    default:
      throw new Error(`Unknown draft operation: ${operation}`);
  }
}

// === LABEL OPERATIONS ===
async function executeLabelOperation(
  this: IExecuteFunctions,
  accessToken: string,
  operation: string,
  itemIndex: number,
): Promise<unknown> {
  switch (operation) {
    case 'list': {
      return gmailRequest.call(this, accessToken, 'GET', '/labels');
    }

    case 'get': {
      const labelId = this.getNodeParameter('labelId', itemIndex) as string;
      return gmailRequest.call(this, accessToken, 'GET', `/labels/${labelId}`);
    }

    case 'create': {
      const labelName = this.getNodeParameter('labelName', itemIndex) as string;
      return gmailRequest.call(this, accessToken, 'POST', '/labels', {
        name: labelName,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      });
    }

    case 'delete': {
      const labelId = this.getNodeParameter('labelId', itemIndex) as string;
      await gmailRequest.call(this, accessToken, 'DELETE', `/labels/${labelId}`);
      return { success: true, labelId, action: 'deleted' };
    }

    case 'update': {
      const labelId = this.getNodeParameter('labelId', itemIndex) as string;
      const labelName = this.getNodeParameter('labelName', itemIndex) as string;
      return gmailRequest.call(this, accessToken, 'PUT', `/labels/${labelId}`, {
        id: labelId,
        name: labelName,
      });
    }

    default:
      throw new Error(`Unknown label operation: ${operation}`);
  }
}

// === THREAD OPERATIONS ===
async function executeThreadOperation(
  this: IExecuteFunctions,
  accessToken: string,
  operation: string,
  itemIndex: number,
): Promise<unknown> {
  switch (operation) {
    case 'get': {
      const threadId = this.getNodeParameter('threadId', itemIndex) as string;
      return gmailRequest.call(this, accessToken, 'GET', `/threads/${threadId}`);
    }

    case 'getMany': {
      const maxResults = this.getNodeParameter('maxResults', itemIndex, 10) as number;
      return gmailRequest.call(this, accessToken, 'GET', '/threads', undefined, { maxResults });
    }

    case 'delete': {
      const threadId = this.getNodeParameter('threadId', itemIndex) as string;
      await gmailRequest.call(this, accessToken, 'POST', `/threads/${threadId}/trash`);
      return { success: true, threadId, action: 'trashed' };
    }

    case 'modify': {
      const threadId = this.getNodeParameter('threadId', itemIndex) as string;
      const labelIds = (this.getNodeParameter('labelIds', itemIndex) as string).split(',').map(s => s.trim());
      return gmailRequest.call(this, accessToken, 'POST', `/threads/${threadId}/modify`, {
        addLabelIds: labelIds,
      });
    }

    default:
      throw new Error(`Unknown thread operation: ${operation}`);
  }
}
