# Sections API Examples

This document provides examples for interacting with the Sections API endpoints.

## Base URL

```
http://localhost:${PORT}/api/sections
```

Replace `${PORT}` with your actual server port (typically defined in your .env file).

## API Endpoints

### 1. Get All Sections

**Endpoint:** `GET /api/sections`

**Description:** Retrieves all sections, with optional filtering by content type and active status.

**Query Parameters:**
- `contentType` (optional): Filter by content type ('Live TV', 'Movies', 'Series')
- `active` (optional): Filter by active status ('true' or 'false')

**Example Requests:**
```
GET /api/sections
GET /api/sections?contentType=Live%20TV
GET /api/sections?active=true
GET /api/sections?contentType=Movies&active=true
```

**Example Response:**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "_id": "64e8a53b2c6e1d8901234567",
      "sectionId": "sports",
      "title": "Sports",
      "description": "Live sports channels and events",
      "contentType": "Live TV",
      "sortOrder": 1,
      "backdropImage": "https://example.com/images/sports-backdrop.jpg",
      "active": true,
      "createdAt": "2023-08-25T12:30:45.123Z",
      "updatedAt": "2023-08-25T12:30:45.123Z"
    },
    {
      "_id": "64e8a53b2c6e1d8901234568",
      "sectionId": "movies",
      "title": "Movies",
      "description": "Latest movies collection",
      "contentType": "Movies",
      "sortOrder": 2,
      "backdropImage": null,
      "active": true,
      "createdAt": "2023-08-25T12:31:45.123Z",
      "updatedAt": "2023-08-25T12:31:45.123Z"
    }
  ]
}
```

### 2. Create New Section

**Endpoint:** `POST /api/sections`

**Description:** Creates a new content section.

**Authentication:** Required

**Request Body:**
```json
{
  "sectionId": "news-info",
  "title": "News & Information",
  "description": "Latest news and information channels",
  "contentType": "Live TV",
  "sortOrder": 3,
  "backdropImage": "https://example.com/images/news-backdrop.jpg",
  "active": true
}
```

**Minimal Example (will generate sectionId automatically):**
```json
{
  "title": "Entertainment",
  "description": "Entertainment channels and shows",
  "contentType": "Live TV",
  "sortOrder": 4
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "_id": "64e8a53b2c6e1d8901234569",
    "sectionId": "news-info",
    "title": "News & Information",
    "description": "Latest news and information channels",
    "contentType": "Live TV",
    "sortOrder": 3,
    "backdropImage": "https://example.com/images/news-backdrop.jpg",
    "active": true,
    "createdAt": "2023-08-25T12:35:45.123Z",
    "updatedAt": "2023-08-25T12:35:45.123Z"
  },
  "message": "Section created successfully"
}
```

### 3. Update Section

**Endpoint:** `PUT /api/sections/:id`

**Description:** Updates an existing section by its ID.

**Authentication:** Required

**URL Parameter:**
- `id`: MongoDB ObjectId of the section

**Request Body (include only fields you want to update):**
```json
{
  "title": "Updated News & Information",
  "description": "Updated description for news section",
  "backdropImage": "https://example.com/images/updated-news-backdrop.jpg"
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "_id": "64e8a53b2c6e1d8901234569",
    "sectionId": "news-info",
    "title": "Updated News & Information",
    "description": "Updated description for news section",
    "contentType": "Live TV",
    "sortOrder": 3,
    "backdropImage": "https://example.com/images/updated-news-backdrop.jpg",
    "active": true,
    "createdAt": "2023-08-25T12:35:45.123Z",
    "updatedAt": "2023-08-25T12:40:45.123Z"
  },
  "message": "Section updated successfully"
}
```

### 4. Delete Section

**Endpoint:** `DELETE /api/sections/:id`

**Description:** Deletes a section by its ID.

**Authentication:** Required

**URL Parameter:**
- `id`: MongoDB ObjectId of the section

**Example Response:**
```json
{
  "success": true,
  "message": "Section deleted successfully"
}
```

## Common Error Responses

### 1. Validation Error

```json
{
  "success": false,
  "error": [
    "Section ID is required",
    "Title cannot exceed 100 characters"
  ]
}
```

### 2. Duplicate Section ID

```json
{
  "success": false,
  "error": "Section with this ID already exists"
}
```

### 3. Section Not Found

```json
{
  "success": false,
  "error": "Section not found"
}
```

### 4. Server Error

```json
{
  "success": false,
  "error": "Server Error"
}
```

## Notes

1. All authenticated endpoints require a valid JWT token in the Authorization header:
   ```
   Authorization: Bearer <your-jwt-token>
   ```

2. The `sectionId` field must contain only lowercase letters, numbers, hyphens, and underscores.

3. If you don't provide a `sectionId`, it will be automatically generated from the title.

4. The `contentType` field must be one of: 'Live TV', 'Movies', 'Series'.

5. The `backdropImage` field is optional and only applicable for 'Live TV' content type in the frontend application.
