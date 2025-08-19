Here's a cleanly formatted **Markdown API documentation** file based on your specification:

---

# API Documentation

**Base URL:** `http://localhost:5000`

---

## Authentication

### 1. Register User

**POST** `/api/auth/register`
Creates a new user.

---

### 2. Login

**POST** `/api/auth/login`
Login as **super-admin** (via env) or **normal user**.

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "your_password"
}
```

---

### 3. List Users (Super-admin only)

**GET** `/api/secure/users`
Returns the list of all registered users.

---

## Providers (Auth Required — Owner Scoped)

🔑 **Note:** Add **Bearer Token** in the `Authorization` header for all Provider APIs.
Example:

```
Authorization: Bearer <your_token>
```

---

### 4. Create Provider

**POST** `/api/providers`

**Request Body:**

```json
{
  "name": "Core Services",
  "apiEndpoint": "https://core.example.com/api",
  "maxConcurrentUsers": 1000,
  "dns": "core.example.com",
  "status": "Active",
  "expiryHours": 240
}
```

---

### 5. List Providers (Owned)

**GET** `/api/providers`

**Query Parameters (optional filters):**

* `status` → filter by provider status
* `name` → filter by provider name

---

### 6. Get Provider by ID

**GET** `/api/providers/:id`
Fetch details of a specific provider (must be owned by the user).

---

### 7. Update Provider

**PATCH** `/api/providers/:id`
Update a specific provider (must be owned).

**Request Body (example):**

```json
{
  "status": "Inactive",
  "expiryHours": 480
}
```

---

### 8. Delete Provider

**DELETE** `/api/providers/:id`
Delete a specific provider (must be owned).

---


Got it ✅
Here’s the continuation of your **Markdown API Documentation**, adding the **Categories API** section based on your controller and router code.

---

# Categories API

**Base URL:** `http://localhost:5000/api/categories`
🔑 **Auth Required:** Yes → Add Bearer Token in the `Authorization` header.

Example:

```
Authorization: Bearer <your_token>
```

---

## Endpoints

### 1. Create Category

**POST** `/api/categories`

**Request Body:**

```json
{
  "category_id": "1234", // optional (auto-generated if not provided)
  "category_name": "Electronics",
  "parent_id": "5678",   // optional (null = root category)
  "provider": "Core Services",
  "category_type": "Product"
}
```

**Response:**

* `201 Created` → returns created category
* `409 Conflict` → category\_id already exists
* `500 Server Error`

---

### 2. List Categories

**GET** `/api/categories`

**Query Parameters (optional):**

* `provider` → filter by provider
* `category_type` → filter by type
* `parent_id` → filter by parent\_id (use `null` for root)
* `category_name` → partial match search

**Response:**

* `200 OK` → list of categories

---

### 3. Get Root Categories

**GET** `/api/categories/roots`

**Query Parameters (optional):**

* `provider` → filter by provider
* `category_type` → filter by type

**Response:**

* `200 OK` → list of root categories

---

### 4. Get Category by `category_id`

**GET** `/api/categories/by-category-id/:category_id`

**Path Params:**

* `category_id` (string, required)

**Response:**

* `200 OK` → category object
* `404 Not Found`

---

### 5. Get Category by MongoDB `_id`

**GET** `/api/categories/:id`

**Path Params:**

* `id` (MongoDB ObjectId, required)

**Response:**

* `200 OK` → category object
* `404 Not Found`

---

### 6. Get Child Categories

**GET** `/api/categories/:id/children`

**Path Params:**

* `id` (MongoDB ObjectId, required)

**Response:**

* `200 OK` → list of child categories
* `404 Not Found` → parent category not found

---

### 7. Update Category

**PATCH** `/api/categories/:id`

**Path Params:**

* `id` (MongoDB ObjectId, required)

**Allowed Fields in Request Body:**

```json
{
  "category_name": "Updated Name",
  "parent_id": "1234",   // or null
  "provider": "New Provider",
  "category_type": "Service"
}
```

**Response:**

* `200 OK` → updated category
* `404 Not Found`
* `500 Server Error`

---

### 8. Delete Category

**DELETE** `/api/categories/:id`

**Path Params:**

* `id` (MongoDB ObjectId, required)

**Rules:**

* Cannot delete category if it has child categories.

**Response:**

* `200 OK` → success message
* `400 Bad Request` → category has children
* `404 Not Found`
