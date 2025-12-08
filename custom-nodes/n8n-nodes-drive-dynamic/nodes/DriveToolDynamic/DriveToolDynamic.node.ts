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

export class DriveToolDynamic implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Google Drive Tool Dynamic',
    name: 'driveToolDynamic',
    icon: 'file:drive.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{ $parameter["operation"] + " " + $parameter["resource"] }}',
    description: 'Google Drive API with dynamic OAuth token - Multi-tenant ready',
    defaults: {
      name: 'Drive Dynamic',
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
        placeholder: '={{ $json.body.access_token }}',
        description: 'OAuth 2.0 access token for Google Drive API',
      },
      // === RESOURCE ===
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'File', value: 'file' },
          { name: 'Folder', value: 'folder' },
        ],
        default: 'file',
      },
      // === OPERATIONS - FILE ===
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['file'] } },
        options: [
          { name: 'Copy', value: 'copy', description: 'Copy a file' },
          { name: 'Delete', value: 'delete', description: 'Delete a file' },
          { name: 'Download', value: 'download', description: 'Download file content' },
          { name: 'Get', value: 'get', description: 'Get file metadata' },
          { name: 'List', value: 'list', description: 'List files' },
          { name: 'Move', value: 'move', description: 'Move a file to another folder' },
          { name: 'Share', value: 'share', description: 'Share a file' },
          { name: 'Update', value: 'update', description: 'Update file metadata' },
          { name: 'Upload', value: 'upload', description: 'Upload a file' },
        ],
        default: 'list',
      },
      // === OPERATIONS - FOLDER ===
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['folder'] } },
        options: [
          { name: 'Create', value: 'create', description: 'Create a folder' },
          { name: 'Delete', value: 'delete', description: 'Delete a folder' },
          { name: 'List', value: 'list', description: 'List folders' },
        ],
        default: 'list',
      },
      // === FILE ID ===
      {
        displayName: 'File ID',
        name: 'fileId',
        type: 'string',
        required: true,
        default: '',
        displayOptions: {
          show: {
            resource: ['file'],
            operation: ['get', 'download', 'delete', 'copy', 'move', 'share', 'update'],
          },
        },
        description: 'The ID of the file',
      },
      // === FOLDER ID (for list operations) ===
      {
        displayName: 'Folder ID',
        name: 'folderId',
        type: 'string',
        default: 'root',
        displayOptions: {
          show: {
            resource: ['file', 'folder'],
            operation: ['list'],
          },
        },
        description: 'The ID of the folder to list (default: root)',
      },
      // === PARENT FOLDER ID (for create/upload/move/copy) ===
      {
        displayName: 'Parent Folder ID',
        name: 'parentId',
        type: 'string',
        default: '',
        displayOptions: {
          show: {
            resource: ['file'],
            operation: ['upload', 'copy', 'move'],
          },
        },
        description: 'The ID of the parent folder (leave empty for root)',
      },
      {
        displayName: 'Parent Folder ID',
        name: 'parentId',
        type: 'string',
        default: '',
        displayOptions: {
          show: {
            resource: ['folder'],
            operation: ['create'],
          },
        },
        description: 'The ID of the parent folder (leave empty for root)',
      },
      // === FOLDER ID (for folder delete) ===
      {
        displayName: 'Folder ID',
        name: 'folderId',
        type: 'string',
        required: true,
        default: '',
        displayOptions: {
          show: {
            resource: ['folder'],
            operation: ['delete'],
          },
        },
        description: 'The ID of the folder to delete',
      },
      // === FILE NAME (for upload/copy/create folder) ===
      {
        displayName: 'Name',
        name: 'name',
        type: 'string',
        required: true,
        default: '',
        displayOptions: {
          show: {
            resource: ['file'],
            operation: ['upload'],
          },
        },
        description: 'Name for the file',
      },
      {
        displayName: 'Name',
        name: 'name',
        type: 'string',
        default: '',
        displayOptions: {
          show: {
            resource: ['file'],
            operation: ['copy', 'update'],
          },
        },
        description: 'New name for the file (optional)',
      },
      {
        displayName: 'Folder Name',
        name: 'name',
        type: 'string',
        required: true,
        default: '',
        displayOptions: {
          show: {
            resource: ['folder'],
            operation: ['create'],
          },
        },
        description: 'Name for the folder',
      },
      // === CONTENT (for upload) ===
      {
        displayName: 'Content (Base64)',
        name: 'content',
        type: 'string',
        required: true,
        default: '',
        displayOptions: {
          show: {
            resource: ['file'],
            operation: ['upload'],
          },
        },
        description: 'Base64 encoded file content',
      },
      // === MIME TYPE (for upload) ===
      {
        displayName: 'MIME Type',
        name: 'mimeType',
        type: 'string',
        default: 'application/octet-stream',
        displayOptions: {
          show: {
            resource: ['file'],
            operation: ['upload'],
          },
        },
        description: 'MIME type of the file (e.g., text/plain, application/pdf)',
      },
      // === SHARE PARAMETERS ===
      {
        displayName: 'Email',
        name: 'email',
        type: 'string',
        required: true,
        default: '',
        displayOptions: {
          show: {
            resource: ['file'],
            operation: ['share'],
          },
        },
        description: 'Email address to share with',
      },
      {
        displayName: 'Role',
        name: 'role',
        type: 'options',
        options: [
          { name: 'Reader', value: 'reader' },
          { name: 'Commenter', value: 'commenter' },
          { name: 'Writer', value: 'writer' },
          { name: 'Owner', value: 'owner' },
        ],
        default: 'reader',
        displayOptions: {
          show: {
            resource: ['file'],
            operation: ['share'],
          },
        },
        description: 'The role to grant',
      },
      // === QUERY (for list) ===
      {
        displayName: 'Query',
        name: 'query',
        type: 'string',
        default: '',
        displayOptions: {
          show: {
            resource: ['file'],
            operation: ['list'],
          },
        },
        description: 'Google Drive query string (e.g., "name contains \'report\'")',
      },
      // === MAX RESULTS ===
      {
        displayName: 'Max Results',
        name: 'maxResults',
        type: 'number',
        default: 100,
        displayOptions: {
          show: {
            resource: ['file', 'folder'],
            operation: ['list'],
          },
        },
        description: 'Maximum number of results to return',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const baseUrl = 'https://www.googleapis.com/drive/v3';

    for (let i = 0; i < items.length; i++) {
      try {
        const accessToken = this.getNodeParameter('accessToken', i) as string;
        const resource = this.getNodeParameter('resource', i) as string;
        const operation = this.getNodeParameter('operation', i) as string;

        let responseData: IDataObject | IDataObject[];

        // === FILE OPERATIONS ===
        if (resource === 'file') {
          if (operation === 'list') {
            const folderId = this.getNodeParameter('folderId', i, 'root') as string;
            const query = this.getNodeParameter('query', i, '') as string;
            const maxResults = this.getNodeParameter('maxResults', i, 100) as number;

            let q = `'${folderId}' in parents and trashed = false`;
            if (query) {
              q += ` and ${query}`;
            }

            const options: IHttpRequestOptions = {
              method: 'GET',
              url: `${baseUrl}/files`,
              headers: { Authorization: `Bearer ${accessToken}` },
              qs: {
                q,
                pageSize: maxResults,
                fields: 'files(id,name,mimeType,size,createdTime,modifiedTime,parents,webViewLink,webContentLink)',
              },
            };

            const response = await this.helpers.httpRequest(options);
            responseData = response.files || [];

          } else if (operation === 'get') {
            const fileId = this.getNodeParameter('fileId', i) as string;

            const options: IHttpRequestOptions = {
              method: 'GET',
              url: `${baseUrl}/files/${fileId}`,
              headers: { Authorization: `Bearer ${accessToken}` },
              qs: {
                fields: 'id,name,mimeType,size,createdTime,modifiedTime,parents,webViewLink,webContentLink,description',
              },
            };

            responseData = await this.helpers.httpRequest(options);

          } else if (operation === 'download') {
            const fileId = this.getNodeParameter('fileId', i) as string;

            const options: IHttpRequestOptions = {
              method: 'GET',
              url: `${baseUrl}/files/${fileId}`,
              headers: { Authorization: `Bearer ${accessToken}` },
              qs: { alt: 'media' },
              encoding: 'arraybuffer',
            };

            const response = await this.helpers.httpRequest(options);
            const base64Content = Buffer.from(response as Buffer).toString('base64');
            responseData = { fileId, content: base64Content };

          } else if (operation === 'upload') {
            const name = this.getNodeParameter('name', i) as string;
            const content = this.getNodeParameter('content', i) as string;
            const mimeType = this.getNodeParameter('mimeType', i, 'application/octet-stream') as string;
            const parentId = this.getNodeParameter('parentId', i, '') as string;

            const metadata: IDataObject = { name, mimeType };
            if (parentId) {
              metadata.parents = [parentId];
            }

            const boundary = '-------314159265358979323846';
            const delimiter = `\r\n--${boundary}\r\n`;
            const closeDelimiter = `\r\n--${boundary}--`;

            const body =
              delimiter +
              'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
              JSON.stringify(metadata) +
              delimiter +
              `Content-Type: ${mimeType}\r\n` +
              'Content-Transfer-Encoding: base64\r\n\r\n' +
              content +
              closeDelimiter;

            const options: IHttpRequestOptions = {
              method: 'POST',
              url: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`,
              },
              body,
            };

            responseData = await this.helpers.httpRequest(options);

          } else if (operation === 'update') {
            const fileId = this.getNodeParameter('fileId', i) as string;
            const name = this.getNodeParameter('name', i, '') as string;

            const body: IDataObject = {};
            if (name) body.name = name;

            const options: IHttpRequestOptions = {
              method: 'PATCH',
              url: `${baseUrl}/files/${fileId}`,
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body,
            };

            responseData = await this.helpers.httpRequest(options);

          } else if (operation === 'delete') {
            const fileId = this.getNodeParameter('fileId', i) as string;

            const options: IHttpRequestOptions = {
              method: 'DELETE',
              url: `${baseUrl}/files/${fileId}`,
              headers: { Authorization: `Bearer ${accessToken}` },
            };

            await this.helpers.httpRequest(options);
            responseData = { success: true, fileId };

          } else if (operation === 'copy') {
            const fileId = this.getNodeParameter('fileId', i) as string;
            const name = this.getNodeParameter('name', i, '') as string;
            const parentId = this.getNodeParameter('parentId', i, '') as string;

            const body: IDataObject = {};
            if (name) body.name = name;
            if (parentId) body.parents = [parentId];

            const options: IHttpRequestOptions = {
              method: 'POST',
              url: `${baseUrl}/files/${fileId}/copy`,
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body,
            };

            responseData = await this.helpers.httpRequest(options);

          } else if (operation === 'move') {
            const fileId = this.getNodeParameter('fileId', i) as string;
            const parentId = this.getNodeParameter('parentId', i) as string;

            // First get current parents
            const getOptions: IHttpRequestOptions = {
              method: 'GET',
              url: `${baseUrl}/files/${fileId}`,
              headers: { Authorization: `Bearer ${accessToken}` },
              qs: { fields: 'parents' },
            };

            const fileInfo = await this.helpers.httpRequest(getOptions);
            const previousParents = (fileInfo.parents as string[])?.join(',') || '';

            const options: IHttpRequestOptions = {
              method: 'PATCH',
              url: `${baseUrl}/files/${fileId}`,
              headers: { Authorization: `Bearer ${accessToken}` },
              qs: {
                addParents: parentId,
                removeParents: previousParents,
              },
            };

            responseData = await this.helpers.httpRequest(options);

          } else if (operation === 'share') {
            const fileId = this.getNodeParameter('fileId', i) as string;
            const email = this.getNodeParameter('email', i) as string;
            const role = this.getNodeParameter('role', i, 'reader') as string;

            const options: IHttpRequestOptions = {
              method: 'POST',
              url: `${baseUrl}/files/${fileId}/permissions`,
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: {
                type: 'user',
                role,
                emailAddress: email,
              },
            };

            responseData = await this.helpers.httpRequest(options);

          } else {
            throw new NodeApiError(this.getNode(), { message: `Unknown file operation: ${operation}` } as JsonObject);
          }

        // === FOLDER OPERATIONS ===
        } else if (resource === 'folder') {
          if (operation === 'list') {
            const folderId = this.getNodeParameter('folderId', i, 'root') as string;
            const maxResults = this.getNodeParameter('maxResults', i, 100) as number;

            const options: IHttpRequestOptions = {
              method: 'GET',
              url: `${baseUrl}/files`,
              headers: { Authorization: `Bearer ${accessToken}` },
              qs: {
                q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                pageSize: maxResults,
                fields: 'files(id,name,mimeType,createdTime,modifiedTime,parents)',
              },
            };

            const response = await this.helpers.httpRequest(options);
            responseData = response.files || [];

          } else if (operation === 'create') {
            const name = this.getNodeParameter('name', i) as string;
            const parentId = this.getNodeParameter('parentId', i, '') as string;

            const body: IDataObject = {
              name,
              mimeType: 'application/vnd.google-apps.folder',
            };
            if (parentId) {
              body.parents = [parentId];
            }

            const options: IHttpRequestOptions = {
              method: 'POST',
              url: `${baseUrl}/files`,
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body,
            };

            responseData = await this.helpers.httpRequest(options);

          } else if (operation === 'delete') {
            const folderId = this.getNodeParameter('folderId', i) as string;

            const options: IHttpRequestOptions = {
              method: 'DELETE',
              url: `${baseUrl}/files/${folderId}`,
              headers: { Authorization: `Bearer ${accessToken}` },
            };

            await this.helpers.httpRequest(options);
            responseData = { success: true, folderId };

          } else {
            throw new NodeApiError(this.getNode(), { message: `Unknown folder operation: ${operation}` } as JsonObject);
          }

        } else {
          throw new NodeApiError(this.getNode(), { message: `Unknown resource: ${resource}` } as JsonObject);
        }

        const executionData = this.helpers.constructExecutionMetaData(
          this.helpers.returnJsonArray(responseData),
          { itemData: { item: i } }
        );
        returnData.push(...executionData);

      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
          continue;
        }
        throw error;
      }
    }

    return [returnData];
  }
}
