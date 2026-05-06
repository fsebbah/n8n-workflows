# Google Classroom MCP Server - API Documentation

## Overview

The Google Classroom MCP Server provides a webhook-based API to interact with Google Classroom. It supports multi-tenant authentication via dynamic OAuth tokens passed in each request (BYOT - Bring Your Own Token pattern).

**Endpoint:** `POST /webhook/mcp-classroom`

**RFC:** [RFC-083-MCP-GOOGLE-CLASSROOM-SERVER](../rfc/RFC-083-MCP-GOOGLE-CLASSROOM-SERVER.md)

## Authentication

All requests must include `access_token` in the request body. This is the OAuth 2.0 access token for the user's Google account with Classroom scopes.

```json
{
  "access_token": "ya29.xxx...",
  "resource": "course",
  "operation": "getAll"
}
```

### Required OAuth Scopes

```
https://www.googleapis.com/auth/classroom.courses
https://www.googleapis.com/auth/classroom.coursework.students
https://www.googleapis.com/auth/classroom.coursework.me
https://www.googleapis.com/auth/classroom.rosters
https://www.googleapis.com/auth/classroom.announcements
https://www.googleapis.com/auth/classroom.topics
https://www.googleapis.com/auth/classroom.profile.emails
https://www.googleapis.com/auth/classroom.profile.photos
```

## Response Format

### Success Response
```json
{
  "success": true,
  "data": { /* Google Classroom API response */ }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "classroom_api_error",
    "message": "Course not found",
    "details": { /* Google error details */ }
  }
}
```

---

## Resources

### 1. Course Resource

Operations on Google Classroom courses.

---

#### `create` - Create Course

Creates a new classroom course.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "course",
  "operation": "create",
  "name": "Mathematics 101",
  "section": "Period 1",
  "description": "Introduction to Mathematics",
  "room": "Room 201"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Course name |
| `section` | string | No | Section name (e.g., "Period 1") |
| `description` | string | No | Course description |
| `room` | string | No | Physical location |
| `owner_id` | string | No | Owner email (defaults to authenticated user) |

---

#### `get` - Get Course

Retrieves a single course by ID.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "course",
  "operation": "get",
  "course_id": "123456789"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `course_id` | string | Yes | Course ID |

---

#### `getAll` - List Courses

Retrieves all courses the user has access to.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "course",
  "operation": "getAll",
  "course_states": ["ACTIVE"],
  "return_all": true
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `student_id` | string | No | Filter by student ID/email |
| `teacher_id` | string | No | Filter by teacher ID/email |
| `course_states` | array | No | Filter by states: `ACTIVE`, `ARCHIVED`, `PROVISIONED`, `DECLINED`, `SUSPENDED` |
| `return_all` | boolean | No | Fetch all pages (default: true) |
| `limit` | number | No | Max items if return_all is false |

---

#### `update` - Update Course

Updates an existing course.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "course",
  "operation": "update",
  "course_id": "123456789",
  "name": "Advanced Mathematics",
  "description": "Updated description",
  "course_state": "ACTIVE"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `course_id` | string | Yes | Course ID |
| `name` | string | No | New course name |
| `section` | string | No | New section |
| `description` | string | No | New description |
| `room` | string | No | New room |
| `course_state` | string | No | `ACTIVE`, `ARCHIVED`, `PROVISIONED`, `DECLINED`, `SUSPENDED` |

---

#### `delete` - Delete Course

Deletes a course permanently.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "course",
  "operation": "delete",
  "course_id": "123456789"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `course_id` | string | Yes | Course ID |

---

#### `archive` - Archive Course

Archives a course (shortcut for update with courseState=ARCHIVED).

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "course",
  "operation": "archive",
  "course_id": "123456789"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `course_id` | string | Yes | Course ID |

---

### 2. CourseWork Resource

Operations on assignments, questions, and other coursework.

---

#### `create` - Create CourseWork

Creates a new assignment or question.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "courseWork",
  "operation": "create",
  "course_id": "123456789",
  "title": "Homework Week 1",
  "description": "Complete exercises 1-10",
  "work_type": "ASSIGNMENT",
  "max_points": 100,
  "due_date": "2026-05-15",
  "due_time": "23:59:00",
  "topic_id": "topic123",
  "state": "DRAFT"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `course_id` | string | Yes | Course ID |
| `title` | string | Yes | CourseWork title |
| `description` | string | No | Description/instructions |
| `work_type` | string | Yes | `ASSIGNMENT`, `SHORT_ANSWER_QUESTION`, `MULTIPLE_CHOICE_QUESTION` |
| `max_points` | number | No | Maximum points (default: 100) |
| `due_date` | string | No | Due date (YYYY-MM-DD) |
| `due_time` | string | No | Due time (HH:MM:SS) |
| `topic_id` | string | No | Topic ID to organize under |
| `state` | string | No | `DRAFT` or `PUBLISHED` (default: DRAFT) |

---

#### `get` - Get CourseWork

Retrieves a single coursework item.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "courseWork",
  "operation": "get",
  "course_id": "123456789",
  "coursework_id": "cw123456"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `course_id` | string | Yes | Course ID |
| `coursework_id` | string | Yes | CourseWork ID |

---

#### `getAll` - List CourseWork

Retrieves all coursework in a course.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "courseWork",
  "operation": "getAll",
  "course_id": "123456789",
  "coursework_states": ["PUBLISHED"],
  "order_by": "dueDate desc"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `course_id` | string | Yes | Course ID |
| `coursework_states` | array | No | Filter: `DRAFT`, `PUBLISHED`, `DELETED` |
| `order_by` | string | No | Sort order (e.g., "dueDate desc") |
| `return_all` | boolean | No | Fetch all pages |
| `limit` | number | No | Max items |

---

#### `update` - Update CourseWork

Updates an existing coursework item.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "courseWork",
  "operation": "update",
  "course_id": "123456789",
  "coursework_id": "cw123456",
  "title": "Updated Title",
  "max_points": 150,
  "state": "PUBLISHED"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `course_id` | string | Yes | Course ID |
| `coursework_id` | string | Yes | CourseWork ID |
| `title` | string | No | New title |
| `description` | string | No | New description |
| `due_date` | string | No | New due date |
| `due_time` | string | No | New due time |
| `max_points` | number | No | New max points |
| `state` | string | No | `DRAFT` or `PUBLISHED` |

---

#### `delete` - Delete CourseWork

Deletes a coursework item.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "courseWork",
  "operation": "delete",
  "course_id": "123456789",
  "coursework_id": "cw123456"
}
```

---

### 3. StudentSubmission Resource

Operations on student submissions/assignments.

---

#### `get` - Get Submission

Retrieves a single student submission.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "studentSubmission",
  "operation": "get",
  "course_id": "123456789",
  "coursework_id": "cw123456",
  "submission_id": "sub789"
}
```

---

#### `getAll` - List Submissions

Retrieves all submissions for a coursework item.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "studentSubmission",
  "operation": "getAll",
  "course_id": "123456789",
  "coursework_id": "cw123456",
  "states": ["TURNED_IN"],
  "user_id": "student@example.com"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `course_id` | string | Yes | Course ID |
| `coursework_id` | string | Yes | CourseWork ID |
| `user_id` | string | No | Filter by student ID/email |
| `states` | array | No | Filter: `NEW`, `CREATED`, `TURNED_IN`, `RETURNED`, `RECLAIMED_BY_STUDENT` |
| `return_all` | boolean | No | Fetch all pages |

---

#### `return` - Return Submission

Returns a submission to the student.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "studentSubmission",
  "operation": "return",
  "course_id": "123456789",
  "coursework_id": "cw123456",
  "submission_id": "sub789"
}
```

---

#### `grade` - Grade Submission

Assigns a grade to a submission.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "studentSubmission",
  "operation": "grade",
  "course_id": "123456789",
  "coursework_id": "cw123456",
  "submission_id": "sub789",
  "assigned_grade": 85,
  "draft_grade": 85
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `assigned_grade` | number | Yes | Final assigned grade |
| `draft_grade` | number | No | Draft grade (visible only to teacher) |

---

#### `modifyAttachments` - Modify Attachments

Adds attachments to a submission.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "studentSubmission",
  "operation": "modifyAttachments",
  "course_id": "123456789",
  "coursework_id": "cw123456",
  "submission_id": "sub789",
  "add_attachments": [
    {"driveFile": {"id": "drive-file-id"}},
    {"link": {"url": "https://example.com/resource"}}
  ]
}
```

---

### 4. Student Resource

Operations on course students.

---

#### `create` - Add Student

Adds a student to a course.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "student",
  "operation": "create",
  "course_id": "123456789",
  "user_id": "student@example.com"
}
```

---

#### `get` - Get Student

Retrieves a student's enrollment info.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "student",
  "operation": "get",
  "course_id": "123456789",
  "user_id": "student@example.com"
}
```

---

#### `getAll` - List Students

Retrieves all students in a course.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "student",
  "operation": "getAll",
  "course_id": "123456789"
}
```

---

#### `delete` - Remove Student

Removes a student from a course.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "student",
  "operation": "delete",
  "course_id": "123456789",
  "user_id": "student@example.com"
}
```

---

### 5. Teacher Resource

Operations on course teachers.

---

#### `create` - Add Teacher

Adds a teacher to a course.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "teacher",
  "operation": "create",
  "course_id": "123456789",
  "user_id": "teacher@example.com"
}
```

---

#### `get` - Get Teacher

Retrieves a teacher's enrollment info.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "teacher",
  "operation": "get",
  "course_id": "123456789",
  "user_id": "teacher@example.com"
}
```

---

#### `getAll` - List Teachers

Retrieves all teachers in a course.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "teacher",
  "operation": "getAll",
  "course_id": "123456789"
}
```

---

#### `delete` - Remove Teacher

Removes a teacher from a course.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "teacher",
  "operation": "delete",
  "course_id": "123456789",
  "user_id": "teacher@example.com"
}
```

---

### 6. Announcement Resource

Operations on course announcements.

---

#### `create` - Create Announcement

Creates a new announcement.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "announcement",
  "operation": "create",
  "course_id": "123456789",
  "text": "Welcome to the class! Please read the syllabus.",
  "state": "PUBLISHED"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `course_id` | string | Yes | Course ID |
| `text` | string | Yes | Announcement text |
| `state` | string | No | `DRAFT` or `PUBLISHED` |
| `scheduled_time` | string | No | Schedule time (ISO 8601) |
| `assignee_mode` | string | No | `ALL_STUDENTS` or `INDIVIDUAL_STUDENTS` |

---

#### `get` - Get Announcement

Retrieves a single announcement.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "announcement",
  "operation": "get",
  "course_id": "123456789",
  "announcement_id": "ann123"
}
```

---

#### `getAll` - List Announcements

Retrieves all announcements in a course.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "announcement",
  "operation": "getAll",
  "course_id": "123456789",
  "announcement_states": ["PUBLISHED"],
  "order_by": "updateTime desc"
}
```

---

#### `update` - Update Announcement

Updates an existing announcement.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "announcement",
  "operation": "update",
  "course_id": "123456789",
  "announcement_id": "ann123",
  "text": "Updated announcement text",
  "state": "PUBLISHED"
}
```

---

#### `delete` - Delete Announcement

Deletes an announcement.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "announcement",
  "operation": "delete",
  "course_id": "123456789",
  "announcement_id": "ann123"
}
```

---

### 7. Topic Resource

Operations on course topics (used to organize coursework).

---

#### `create` - Create Topic

Creates a new topic.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "topic",
  "operation": "create",
  "course_id": "123456789",
  "name": "Week 1 - Introduction"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `course_id` | string | Yes | Course ID |
| `name` | string | Yes | Topic name |

---

#### `get` - Get Topic

Retrieves a single topic.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "topic",
  "operation": "get",
  "course_id": "123456789",
  "topic_id": "topic123"
}
```

---

#### `getAll` - List Topics

Retrieves all topics in a course.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "topic",
  "operation": "getAll",
  "course_id": "123456789"
}
```

---

#### `update` - Update Topic

Updates a topic name.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "topic",
  "operation": "update",
  "course_id": "123456789",
  "topic_id": "topic123",
  "name": "Week 1 - Fundamentals"
}
```

---

#### `delete` - Delete Topic

Deletes a topic.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "topic",
  "operation": "delete",
  "course_id": "123456789",
  "topic_id": "topic123"
}
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `auth_error` | 401 | Invalid or expired access token |
| `permission_denied` | 403 | User lacks required permissions |
| `not_found` | 404 | Resource not found |
| `quota_exceeded` | 429 | Google API quota exceeded |
| `classroom_api_error` | 4xx/5xx | General Classroom API error |
| `invalid_request` | 400 | Invalid parameters or missing required fields |

---

## Usage Examples

### Create a full course structure

```bash
# 1. Create a course
curl -X POST http://pi6.local:5678/webhook/mcp-classroom \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "ya29.xxx...",
    "resource": "course",
    "operation": "create",
    "name": "French Literature",
    "section": "Fall 2026",
    "description": "Introduction to French Literature"
  }'

# Response: {"success": true, "data": {"id": "123456789", "name": "French Literature", ...}}

# 2. Create topics for the course
curl -X POST http://pi6.local:5678/webhook/mcp-classroom \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "ya29.xxx...",
    "resource": "topic",
    "operation": "create",
    "course_id": "123456789",
    "name": "Module 1 - Introduction"
  }'

# 3. Create an assignment under the topic
curl -X POST http://pi6.local:5678/webhook/mcp-classroom \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "ya29.xxx...",
    "resource": "courseWork",
    "operation": "create",
    "course_id": "123456789",
    "title": "Essay: My Favorite Book",
    "description": "Write a 500-word essay about your favorite book.",
    "work_type": "ASSIGNMENT",
    "topic_id": "topic123",
    "max_points": 100,
    "due_date": "2026-05-20",
    "state": "PUBLISHED"
  }'
```

---

## Related Workflows

| Workflow | Description |
|----------|-------------|
| `MCP_-_Google_Classroom_Server.json` | Main MCP server (this API) |
| `Expert_Program_Classroom_Sync.json` | Syncs expert programs to Classroom |

---

## Changelog

- **2026-05-06** — Initial documentation for RFC-083
