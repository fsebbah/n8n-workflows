# Gmail MCP Server - API Documentation

## Overview

The Gmail MCP Server provides a webhook-based API to interact with Gmail. It supports multi-tenant authentication via dynamic OAuth tokens passed in each request.

**Endpoint:** `POST /webhook/mcp-gmail`

## Authentication

All requests must include `access_token` in the request body. This is the OAuth 2.0 access token for the user's Google account.

```json
{
  "access_token": "ya29.xxx...",
  "resource": "message",
  "operation": "search"
}
```

## Resources

### Message Resource

Operations on email messages.

---

#### `search` - Search Messages

Search messages using Gmail query syntax.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "message",
  "operation": "search",
  "query": "from:sender@example.com is:unread",
  "max_results": 10,
  "include_full_message": true
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Gmail search query syntax |
| `max_results` | number | No | Maximum results (default: 10) |
| `include_full_message` | boolean | No | Fetch full message details (default: true) |

**Query Examples:**
- `from:user@example.com` - From specific sender
- `to:me` - Sent to me
- `is:unread` - Unread messages
- `is:starred` - Starred messages
- `subject:hello` - Subject contains "hello"
- `has:attachment` - Has attachments
- `after:2025/01/01` - After date
- `label:important` - Has label

---

#### `get` - Get Message

Get a single message by ID.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "message",
  "operation": "get",
  "message_id": "18abc123def456"
}
```

---

#### `getMany` - Get Many Messages

Get multiple messages.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "message",
  "operation": "getMany",
  "max_results": 20
}
```

---

#### `send` - Send Email

Send a new email message.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "message",
  "operation": "send",
  "to": "recipient@example.com",
  "subject": "Hello World",
  "body": "This is the email body",
  "cc": "cc@example.com",
  "bcc": "bcc@example.com",
  "attachments": [
    {
      "filename": "document.pdf",
      "content": "base64encodedcontent...",
      "mimeType": "application/pdf"
    }
  ]
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `to` | string | Yes | Recipient email |
| `subject` | string | Yes | Subject line |
| `body` | string | Yes | Email body (plain text) |
| `cc` | string | No | CC recipients (comma-separated) |
| `bcc` | string | No | BCC recipients (comma-separated) |
| `attachments` | array | No | Array of attachment objects |

---

#### `reply` - Reply to Email

Reply to an existing email.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "message",
  "operation": "reply",
  "message_id": "18abc123def456",
  "to": "sender@example.com",
  "body": "Thank you for your email..."
}
```

---

#### `delete` - Delete Message (Trash)

Move a message to trash.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "message",
  "operation": "delete",
  "message_id": "18abc123def456"
}
```

---

#### `untrash` - Restore from Trash

Restore a message from trash.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "message",
  "operation": "untrash",
  "message_id": "18abc123def456"
}
```

---

#### `markRead` - Mark as Read

Mark a message as read.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "message",
  "operation": "markRead",
  "message_id": "18abc123def456"
}
```

---

#### `markUnread` - Mark as Unread

Mark a message as unread.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "message",
  "operation": "markUnread",
  "message_id": "18abc123def456"
}
```

---

#### `star` - Star Message

Add star to a message.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "message",
  "operation": "star",
  "message_id": "18abc123def456"
}
```

---

#### `unstar` - Remove Star

Remove star from a message.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "message",
  "operation": "unstar",
  "message_id": "18abc123def456"
}
```

---

#### `archive` - Archive Message

Archive a message (remove from INBOX).

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "message",
  "operation": "archive",
  "message_id": "18abc123def456"
}
```

---

#### `addLabels` - Add Labels

Add labels to a message.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "message",
  "operation": "addLabels",
  "message_id": "18abc123def456",
  "label_ids": "STARRED,Label_123"
}
```

---

#### `removeLabels` - Remove Labels

Remove labels from a message.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "message",
  "operation": "removeLabels",
  "message_id": "18abc123def456",
  "label_ids": "UNREAD,INBOX"
}
```

---

#### `getAttachment` - Get Attachment

Download an attachment from a message.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "message",
  "operation": "getAttachment",
  "message_id": "18abc123def456",
  "attachment_id": "ANGjdJ_xyz..."
}
```

**Response:**
```json
{
  "size": 12345,
  "data": "base64encodedcontent..."
}
```

**Note:** The `attachment_id` is found in `message.payload.parts[].body.attachmentId` when fetching a message.

---

#### `batchModify` - Batch Modify Messages

Modify multiple messages at once.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "message",
  "operation": "batchModify",
  "message_ids": "msg1,msg2,msg3",
  "add_label_ids": "STARRED",
  "remove_label_ids": "UNREAD,INBOX"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `message_ids` | string | Yes | Comma-separated message IDs |
| `add_label_ids` | string | No | Labels to add |
| `remove_label_ids` | string | No | Labels to remove |

---

### Draft Resource

Operations on email drafts.

---

#### `create` - Create Draft

Create a new draft.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "draft",
  "operation": "create",
  "to": "recipient@example.com",
  "subject": "Draft Subject",
  "body": "Draft body content",
  "cc": "cc@example.com",
  "bcc": "bcc@example.com"
}
```

---

#### `get` - Get Draft

Get a draft by ID.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "draft",
  "operation": "get",
  "draft_id": "r123456789"
}
```

---

#### `getMany` - Get Many Drafts

List all drafts.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "draft",
  "operation": "getMany",
  "max_results": 10
}
```

---

#### `update` - Update Draft

Update an existing draft.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "draft",
  "operation": "update",
  "draft_id": "r123456789",
  "to": "newrecipient@example.com",
  "subject": "Updated Subject",
  "body": "Updated body content"
}
```

---

#### `delete` - Delete Draft

Delete a draft permanently.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "draft",
  "operation": "delete",
  "draft_id": "r123456789"
}
```

---

#### `send` - Send Draft

Send an existing draft.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "draft",
  "operation": "send",
  "draft_id": "r123456789"
}
```

---

### Label Resource

Operations on Gmail labels.

---

#### `getAll` - Get All Labels

List all labels.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "label",
  "operation": "getAll"
}
```

---

#### `get` - Get Label

Get a label by ID.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "label",
  "operation": "get",
  "label_id": "Label_123"
}
```

---

#### `create` - Create Label

Create a new label.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "label",
  "operation": "create",
  "label_name": "My New Label"
}
```

---

#### `update` - Update Label

Update a label name.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "label",
  "operation": "update",
  "label_id": "Label_123",
  "label_name": "Updated Label Name"
}
```

---

#### `delete` - Delete Label

Delete a label.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "label",
  "operation": "delete",
  "label_id": "Label_123"
}
```

---

### Thread Resource

Operations on email threads (conversations).

---

#### `get` - Get Thread

Get a thread by ID.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "thread",
  "operation": "get",
  "thread_id": "18abc123def456"
}
```

---

#### `getMany` - Get Many Threads

List threads.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "thread",
  "operation": "getMany",
  "max_results": 10
}
```

---

#### `search` - Search Threads

Search threads using Gmail query syntax.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "thread",
  "operation": "search",
  "query": "from:sender@example.com",
  "max_results": 10
}
```

---

#### `delete` - Delete Thread (Trash)

Move a thread to trash.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "thread",
  "operation": "delete",
  "thread_id": "18abc123def456"
}
```

---

#### `untrash` - Restore Thread from Trash

Restore a thread from trash.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "thread",
  "operation": "untrash",
  "thread_id": "18abc123def456"
}
```

---

#### `modify` - Modify Thread Labels

Add labels to a thread.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "thread",
  "operation": "modify",
  "thread_id": "18abc123def456",
  "label_ids": "STARRED,Label_123"
}
```

---

### Settings Resource

Operations on Gmail settings.

---

#### `getVacation` - Get Vacation Settings

Get current vacation auto-reply settings.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "settings",
  "operation": "getVacation"
}
```

**Response:**
```json
{
  "enableAutoReply": false,
  "responseSubject": "",
  "responseBodyPlainText": "",
  "responseBodyHtml": "",
  "restrictToContacts": false,
  "restrictToDomain": false,
  "startTime": null,
  "endTime": null
}
```

---

#### `setVacation` - Set Vacation Auto-Reply

Configure vacation auto-reply.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "settings",
  "operation": "setVacation",
  "enable_auto_reply": true,
  "response_subject": "Out of Office",
  "response_body_html": "<p>Thank you for your email. I am currently out of office and will respond when I return.</p>",
  "response_body_plain_text": "Thank you for your email. I am currently out of office and will respond when I return.",
  "restrict_to_contacts": false,
  "restrict_to_domain": false,
  "start_time": "2025-12-20T00:00:00Z",
  "end_time": "2025-01-05T00:00:00Z"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `enable_auto_reply` | boolean | No | Enable auto-reply (default: true) |
| `response_subject` | string | No | Subject of auto-reply |
| `response_body_html` | string | No | HTML body of auto-reply |
| `response_body_plain_text` | string | No | Plain text body of auto-reply |
| `restrict_to_contacts` | boolean | No | Only reply to contacts (default: false) |
| `restrict_to_domain` | boolean | No | Only reply to same domain (default: false) |
| `start_time` | string | No | Start time (ISO 8601) |
| `end_time` | string | No | End time (ISO 8601) |

---

#### `disableVacation` - Disable Vacation Auto-Reply

Disable vacation auto-reply.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "settings",
  "operation": "disableVacation"
}
```

---

## System Labels Reference

| Label ID | Description |
|----------|-------------|
| `INBOX` | Inbox |
| `SPAM` | Spam |
| `TRASH` | Trash |
| `UNREAD` | Unread |
| `STARRED` | Starred |
| `IMPORTANT` | Important |
| `SENT` | Sent |
| `DRAFT` | Drafts |
| `CATEGORY_PERSONAL` | Personal category |
| `CATEGORY_SOCIAL` | Social category |
| `CATEGORY_PROMOTIONS` | Promotions category |
| `CATEGORY_UPDATES` | Updates category |
| `CATEGORY_FORUMS` | Forums category |

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

### Archive all unread emails from a sender

```json
{
  "access_token": "ya29.xxx...",
  "resource": "message",
  "operation": "search",
  "query": "from:newsletter@example.com is:unread"
}
```

Then for each message:
```json
{
  "access_token": "ya29.xxx...",
  "resource": "message",
  "operation": "archive",
  "message_id": "..."
}
```

### Set up an out-of-office reply

```json
{
  "access_token": "ya29.xxx...",
  "resource": "settings",
  "operation": "setVacation",
  "enable_auto_reply": true,
  "response_subject": "Out of Office - Back January 6th",
  "response_body_html": "<p>Hello,</p><p>Thank you for your email. I am currently out of office for the holidays and will return on January 6th, 2025.</p><p>For urgent matters, please contact support@company.com</p><p>Best regards</p>",
  "start_time": "2025-12-23T00:00:00Z",
  "end_time": "2025-01-06T00:00:00Z"
}
```

### Batch archive and mark as read

```json
{
  "access_token": "ya29.xxx...",
  "resource": "message",
  "operation": "batchModify",
  "message_ids": "msg1,msg2,msg3,msg4,msg5",
  "remove_label_ids": "INBOX,UNREAD"
}
```
