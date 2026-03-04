# FashionX Virtual Try-On — External API Integration Guide

## Overview

The FashionX VTON API lets you integrate Virtual Try-On into your application. Submit a user photo and a garment image, and receive a composited try-on result.

Processing is **asynchronous**. You submit a job and receive results via a **webhook callback** or by **polling** the job status endpoint.

---

## Authentication

Client accounts are created and authenticated automatically by the VTON backend. You do not need to pass manual API credentials.

---

## Rate Limits

Limits are enforced per-client based on your subscription tier:

| Limit | Description | Error |
|---|---|---|
| **RPM** | Requests per minute | `429 Too Many Requests` |
| **Daily Quota** | Total requests per day | `403 Daily quota exceeded` |
| **Monthly Quota** | Total requests per month | `403 Monthly quota exceeded` |

Your limits are configured during onboarding. Contact us to adjust them.

---

## Base URL

```
{BASE_URL}/api/v1/external
```

All endpoint paths below are relative to this base.

---

## Endpoints

### 1. Submit VTON Job

```
POST /vton/process
```

Submits a Virtual Try-On job for asynchronous processing.

**Content-Type:** `multipart/form-data`

#### Headers

| Header | Required | Description |
|---|---|---|
| `Idempotency-Key` | No | UUID to prevent duplicate processing. If omitted, one is auto-generated (no retry protection). Same key returns the cached response for 24 hours. |

#### Form Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `user_id` | string | Yes | Your user's identifier in your system. |
| `user_image_id` | string | Yes | Version identifier for the user's photo (e.g. `"v1"`, `"v2"`). When this changes, you **must** provide a new `user_image`. |
| `category` | string | Yes | Garment category. See [Get Categories](#3-get-categories). |
| `consent_confirmed` | boolean | Yes | Must be `true`. Confirms the user has consented to image processing. |
| `user_image` | file | Conditional | User's full-body photo. **Required** on the first request for a `user_id`, or whenever `user_image_id` changes. Omit on subsequent requests if `user_image_id` has not changed. |
| `garment_image` | file | See below | Direct garment image upload. **Highest priority.** |
| `garment_image_url` | string | See below | URL to a publicly accessible garment image. **Second priority.** |
| `garment_id` | string | See below | Internal product ID (if pre-loaded into our catalog). **Lowest priority.** |
| `callback_url` | string | No | Override the default webhook URL for this specific request. |

**Garment source** — provide at least one of `garment_image`, `garment_image_url`, or `garment_id`.

**Priority order:** `garment_image` > `garment_image_url` > `garment_id`

#### Success Response (`200`)

```json
{
  "job_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "QUEUED",
  "eta_seconds": 30,
  "idempotency_key": "your-key-or-auto-generated"
}
```

#### Error Responses

| Status | Reason |
|---|---|
| `400` | Missing required field, invalid image, or no garment source provided |
| `401` | Invalid credentials |
| `403` | Account suspended or quota exceeded |
| `429` | Rate limit exceeded |
| `503` | Job could not be queued — retry with the same `Idempotency-Key` |

---

---

### 2. Get Categories

```
GET /config/categories
```

#### Headers

(None required)

#### Success Response (`200`)

```json
{
  "categories": [
    { "id": "tops", "name": "Tops" },
    { "id": "bottoms", "name": "Bottoms" },
    { "id": "dresses", "name": "Dresses" },
    { "id": "outerwear", "name": "Outerwear" },
    { "id": "all-body", "name": "Full Body" }
  ]
}
```

Use the `id` value as the `category` field when submitting a VTON job.

---

## Webhooks

When a job completes (or fails), we send a `POST` request to your callback URL with the result.

The callback URL is set during onboarding. You can override it per-request using the `callback_url` form field.

### Webhook Payload

```json
{
  "job_id": "a1b2c3d4-...",
  "status": "SUCCESS",
  "output_image_url": "https://presigned-s3-url.../result.png",
  "error": null,
  "timestamp": "2025-01-15T10:30:45.123456"
}
```

- `output_image_url` is a presigned URL valid for **1 hour**.
- For `FAILED` or `TIMEOUT` jobs, `output_image_url` will be `null` and `error` will contain the reason.
- Your endpoint must respond with `2xx` within **10 seconds**.

---

## Integration Flow

### First request for a new user

```
POST /vton/process

user_id        = "user_123"
user_image_id  = "v1"
user_image     = <full_body_photo.jpg>       ← Required on first request
garment_image  = <product.jpg>               ← Or garment_image_url / garment_id
category       = "tops"
consent_confirmed = true
```

### Subsequent requests (same user, same photo)

```
POST /vton/process

user_id        = "user_123"
user_image_id  = "v1"                        ← Same version — no re-upload needed
garment_image_url = "https://cdn.shop.com/product2.jpg"
category       = "bottoms"
consent_confirmed = true
```

### User uploads a new photo

```
POST /vton/process

user_id        = "user_123"
user_image_id  = "v2"                        ← New version — triggers re-processing
user_image     = <new_photo.jpg>             ← Required when version changes
garment_id     = "12345"
category       = "tops"
consent_confirmed = true
```

---

## Idempotency

Include an `Idempotency-Key` header (UUID) to safely retry failed requests without creating duplicate jobs.

- Same key within **24 hours** → returns the cached response from the original request.
- If omitted, a key is auto-generated and no retry protection is provided.

---

## Quick Start — cURL

```bash
curl -X POST "{BASE_URL}/api/v1/external/vton/process" \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -F "user_id=user_123" \
  -F "user_image_id=v1" \
  -F "user_image=@/path/to/user_photo.jpg" \
  -F "garment_image=@/path/to/garment.jpg" \
  -F "category=tops" \
  -F "consent_confirmed=true"
```

## Quick Start — Python

```python
import requests
import time

BASE_URL = "{BASE_URL}/api/v1/external"
HEADERS = {}

# 1. Submit a VTON job with webhooks!
with open("user_photo.jpg", "rb") as user_img, open("garment.jpg", "rb") as garment_img:
    resp = requests.post(
        f"{BASE_URL}/vton/process",
        headers=HEADERS,
        data={
            "user_id": "user_123",
            "user_image_id": "v1",
            "category": "tops",
            "callback_url": "https://my-shopify-app.com/webhooks/vto-result",
            "consent_confirmed": "true",
        },
        files={
            "user_image": user_img,
            "garment_image": garment_img,
        },
    )

job_id = resp.json()["job_id"]
print(f"Job submitted: {job_id}")

# Wait for the webhook to POST to your callback_url!
```
