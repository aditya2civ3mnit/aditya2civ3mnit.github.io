# API Contract

Base URL for local development: `http://localhost:3000`

## Authentication

### `POST /api/auth/register`
Create a new user.

Request:
```json
{
  "name": "Shashank",
  "username": "shashank",
  "password": "secret123"
}
```

Response:
```json
{
  "user": {
    "id": "user_123",
    "name": "Shashank",
    "username": "shashank"
  },
  "accessToken": "jwt-token",
  "refreshToken": "refresh-token"
}
```

### `POST /api/auth/login`
Login using username and password.

Request:
```json
{
  "username": "shashank",
  "password": "secret123"
}
```

Response:
```json
{
  "user": {
    "id": "user_123",
    "name": "Shashank",
    "username": "shashank"
  },
  "accessToken": "jwt-token",
  "refreshToken": "refresh-token"
}
```

### `POST /api/auth/refresh`
Refresh an access token.

### `POST /api/auth/logout`
Invalidate session tokens.

### `GET /api/auth/me`
Return the current authenticated user.

## Trades

All trade routes must be user scoped.

Rule:
- `userId` must come from the verified auth token on the backend.
- The frontend must not send `userId` as a trusted field.

### `POST /api/trades`
Create a trade for the current user.

Request:
```json
{
  "bias": "short",
  "checkedIds": ["htf-poi", "sweep"],
  "prices": {
    "entry": "123.45",
    "sl": "124.10",
    "lrl": "122.80"
  },
  "notes": {
    "ideal": "Ideal execution note",
    "real": "Real execution note"
  },
  "media": {
    "htf": [],
    "liquidity": [],
    "bias": [],
    "ideal": [],
    "real": []
  }
}
```

Response:
```json
{
  "trade": {
    "id": "trade_123",
    "userId": "user_123",
    "bias": "short",
    "checkedIds": ["htf-poi", "sweep"],
    "prices": {
      "entry": "123.45",
      "sl": "124.10",
      "lrl": "122.80"
    },
    "notes": {
      "ideal": "Ideal execution note",
      "real": "Real execution note"
    },
    "media": {
      "htf": [],
      "liquidity": [],
      "bias": [],
      "ideal": [],
      "real": []
    },
    "createdAt": "2026-04-04T00:00:00.000Z",
    "updatedAt": "2026-04-04T00:00:00.000Z"
  }
}
```

### `GET /api/trades`
List current user's trades.

### `GET /api/trades/:id`
Get a single trade owned by the current user.

### `PUT /api/trades/:id`
Update a trade owned by the current user.

### `DELETE /api/trades/:id`
Delete a trade owned by the current user.

## Media upload

### `POST /api/uploads/media`
Upload one or more files for a specific section.

Request:
- `multipart/form-data`
- `section`: `htf`, `liquidity`, `bias`, `ideal`, `real`, or any custom label
- `files`: one or more file inputs

Response:
```json
{
  "files": [
    {
      "section": "htf",
      "name": "screenshot.png",
      "type": "image/png",
      "size": 123456,
      "key": "trade-media/user-id/htf/123.png",
      "url": "https://cdn.example.com/trade-media/user-id/htf/123.png"
    }
  ]
}
```

## Media format

Media can be stored in the API contract in one of two ways:
1. Temporary frontend export/import mode: store `dataUrl` payloads in JSON.
2. Production mode: upload files to storage and store returned `url` values.

Recommended media item shape:
```json
{
  "name": "screenshot.png",
  "type": "image/png",
  "size": 123456,
  "dataUrl": "data:image/png;base64,...",
  "url": "https://cdn.example.com/file.png"
}
```

## Common errors

```json
{
  "message": "Unauthorized"
}
```

```json
{
  "message": "Validation failed",
  "errors": ["username is required"]
}
```
