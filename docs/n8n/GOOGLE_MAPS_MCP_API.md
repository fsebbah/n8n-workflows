# Google Maps MCP Server - API Documentation

## Overview

The Google Maps MCP Server provides a webhook-based API to interact with Google Maps Platform APIs. It supports geocoding, directions, places search, air quality, pollen data, and timezone information.

**Endpoint:** `POST /webhook/mcp-google-maps`

**GitHub Issue:** [#137](https://github.com/fsebbah/n8n-workflows/issues/137)

---

## Authentication

All requests must include `api_key` in the request body. This is your Google Maps Platform API key.

```json
{
  "api_key": "AIzaSy...",
  "operation": "geocode",
  "address": "Paris, France"
}
```

### Obtaining an API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable the required APIs (see [Required APIs](#required-apis))
4. Go to **APIs & Services > Credentials**
5. Create an **API Key**
6. (Recommended) Restrict the key by IP address for security

### Required APIs

Enable these APIs in your Google Cloud project:

| API | Required For |
|-----|--------------|
| Geocoding API | `geocode`, `reverse_geocode` |
| Directions API | `directions` |
| Places API | `search_places`, `place_details` |
| Air Quality API | `air_quality` |
| Pollen API | `pollen` |
| Time Zone API | `timezone` |

---

## Operations

### `geocode` - Address to Coordinates

Converts an address into geographic coordinates (latitude/longitude).

**Request:**
```json
{
  "api_key": "AIzaSy...",
  "operation": "geocode",
  "address": "10 rue de Rivoli, Paris, France",
  "language": "fr"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `address` | string | Yes | The address to geocode |
| `language` | string | No | Language for results (default: "fr") |

**Response:**
```json
{
  "results": [
    {
      "formatted_address": "10 Rue de Rivoli, 75004 Paris, France",
      "geometry": {
        "location": {
          "lat": 48.8559,
          "lng": 2.3588
        }
      },
      "place_id": "ChIJ..."
    }
  ],
  "status": "OK"
}
```

---

### `reverse_geocode` - Coordinates to Address

Converts geographic coordinates into a human-readable address.

**Request:**
```json
{
  "api_key": "AIzaSy...",
  "operation": "reverse_geocode",
  "latitude": 48.8566,
  "longitude": 2.3522,
  "language": "fr"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `latitude` | number | Yes | Latitude coordinate |
| `longitude` | number | Yes | Longitude coordinate |
| `language` | string | No | Language for results (default: "fr") |

**Response:**
```json
{
  "results": [
    {
      "formatted_address": "Place de l'Hotel de Ville, 75004 Paris, France",
      "address_components": [...]
    }
  ],
  "status": "OK"
}
```

---

### `directions` - Route Calculation

Calculates directions between an origin and destination.

**Request:**
```json
{
  "api_key": "AIzaSy...",
  "operation": "directions",
  "origin": "Paris, France",
  "destination": "Lyon, France",
  "mode": "driving",
  "language": "fr"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `origin` | string | Yes | Starting point (address or coordinates) |
| `destination` | string | Yes | End point (address or coordinates) |
| `mode` | string | No | Travel mode (default: "driving") |
| `language` | string | No | Language for instructions (default: "fr") |

**Travel Modes:**
- `driving` - Car (default)
- `walking` - Pedestrian
- `bicycling` - Bicycle
- `transit` - Public transport

**Response:**
```json
{
  "routes": [
    {
      "legs": [
        {
          "distance": { "text": "465 km", "value": 465000 },
          "duration": { "text": "4 h 30 min", "value": 16200 },
          "steps": [...]
        }
      ],
      "overview_polyline": { "points": "..." }
    }
  ],
  "status": "OK"
}
```

---

### `search_places` - Places Search

Searches for places near a location.

**Request:**
```json
{
  "api_key": "AIzaSy...",
  "operation": "search_places",
  "query": "restaurants italiens",
  "latitude": 48.8566,
  "longitude": 2.3522,
  "radius": 1000,
  "language": "fr"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search query |
| `latitude` | number | Yes | Center latitude |
| `longitude` | number | Yes | Center longitude |
| `radius` | number | No | Search radius in meters (default: 5000) |
| `language` | string | No | Language for results (default: "fr") |

**Response:**
```json
{
  "results": [
    {
      "name": "Ristorante Roma",
      "formatted_address": "12 Rue...",
      "rating": 4.5,
      "place_id": "ChIJ...",
      "geometry": {
        "location": { "lat": 48.857, "lng": 2.354 }
      }
    }
  ],
  "status": "OK"
}
```

---

### `place_details` - Place Details

Gets detailed information about a specific place.

**Request:**
```json
{
  "api_key": "AIzaSy...",
  "operation": "place_details",
  "place_id": "ChIJD7fiBh9u5kcRYJSMaMOCCwQ",
  "fields": "name,formatted_address,rating,opening_hours,website,formatted_phone_number",
  "language": "fr"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `place_id` | string | Yes | Google Place ID |
| `fields` | string | No | Comma-separated list of fields |
| `language` | string | No | Language for results (default: "fr") |

**Available Fields:**
- Basic: `name`, `formatted_address`, `geometry`, `place_id`
- Contact: `formatted_phone_number`, `website`, `opening_hours`
- Atmosphere: `rating`, `reviews`, `price_level`, `user_ratings_total`

**Response:**
```json
{
  "result": {
    "name": "Tour Eiffel",
    "formatted_address": "Champ de Mars, 5 Av. Anatole France, 75007 Paris",
    "rating": 4.7,
    "opening_hours": {
      "open_now": true,
      "weekday_text": [...]
    },
    "website": "https://www.toureiffel.paris/"
  },
  "status": "OK"
}
```

---

### `air_quality` - Air Quality Index

Gets current air quality data for a location.

**Request:**
```json
{
  "api_key": "AIzaSy...",
  "operation": "air_quality",
  "latitude": 48.8566,
  "longitude": 2.3522
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `latitude` | number | Yes | Latitude coordinate |
| `longitude` | number | Yes | Longitude coordinate |

**Response:**
```json
{
  "dateTime": "2025-01-15T12:00:00Z",
  "regionCode": "fr",
  "indexes": [
    {
      "code": "uaqi",
      "displayName": "Universal AQI",
      "aqi": 42,
      "aqiDisplay": "42",
      "color": { "green": 0.8 },
      "category": "Good air quality",
      "dominantPollutant": "pm25"
    }
  ],
  "pollutants": [
    {
      "code": "pm25",
      "displayName": "PM2.5",
      "concentration": { "value": 8.5, "units": "MICROGRAMS_PER_CUBIC_METER" }
    }
  ],
  "healthRecommendations": {
    "generalPopulation": "Air quality is good. Enjoy outdoor activities."
  }
}
```

---

### `pollen` - Pollen Forecast

Gets pollen forecast data for a location.

**Request:**
```json
{
  "api_key": "AIzaSy...",
  "operation": "pollen",
  "latitude": 48.8566,
  "longitude": 2.3522,
  "days": 3,
  "language": "fr"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `latitude` | number | Yes | Latitude coordinate |
| `longitude` | number | Yes | Longitude coordinate |
| `days` | number | No | Forecast days (1-5, default: 5) |
| `language` | string | No | Language for results (default: "fr") |

**Response:**
```json
{
  "regionCode": "FR",
  "dailyInfo": [
    {
      "date": { "year": 2025, "month": 1, "day": 15 },
      "pollenTypeInfo": [
        {
          "code": "GRASS",
          "displayName": "Graminees",
          "indexInfo": {
            "code": "UPI",
            "value": 2,
            "category": "Low"
          }
        },
        {
          "code": "TREE",
          "displayName": "Arbres",
          "indexInfo": {
            "code": "UPI",
            "value": 3,
            "category": "Moderate"
          }
        }
      ]
    }
  ]
}
```

---

### `timezone` - Timezone Information

Gets timezone information for a location.

**Request:**
```json
{
  "api_key": "AIzaSy...",
  "operation": "timezone",
  "latitude": 48.8566,
  "longitude": 2.3522,
  "timestamp": 1705315200
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `latitude` | number | Yes | Latitude coordinate |
| `longitude` | number | Yes | Longitude coordinate |
| `timestamp` | number | No | Unix timestamp (default: current time) |

**Response:**
```json
{
  "dstOffset": 0,
  "rawOffset": 3600,
  "status": "OK",
  "timeZoneId": "Europe/Paris",
  "timeZoneName": "Central European Standard Time"
}
```

---

## Error Handling

### Invalid Operation

If an unknown operation is provided:

```json
{
  "error": {
    "code": 400,
    "message": "Invalid operation: unknown. Valid operations: geocode, reverse_geocode, directions, search_places, place_details, air_quality, pollen, timezone",
    "status": "BAD_REQUEST"
  }
}
```

### Google API Errors

Google API errors are returned directly:

```json
{
  "error_message": "The provided API key is invalid.",
  "results": [],
  "status": "REQUEST_DENIED"
}
```

Common status codes:
- `OK` - Success
- `ZERO_RESULTS` - No results found
- `OVER_QUERY_LIMIT` - Quota exceeded
- `REQUEST_DENIED` - Invalid API key or API not enabled
- `INVALID_REQUEST` - Missing required parameters

---

## Pricing

Google Maps Platform uses pay-as-you-go pricing with free monthly quotas:

| API | Free Monthly Quota | Price After |
|-----|-------------------|-------------|
| Geocoding | 10,000 requests | $5 per 1,000 |
| Directions | 10,000 requests | $5 per 1,000 |
| Places - Text Search | 5,000 requests | $32 per 1,000 |
| Places - Details | 5,000 requests | $17 per 1,000 |
| Air Quality | 10,000 requests | $5 per 1,000 |
| Pollen | 5,000 requests | $5 per 1,000 |
| Time Zone | 10,000 requests | $5 per 1,000 |

See [Google Maps Platform Pricing](https://cloud.google.com/maps-platform/pricing) for current rates.

---

## Usage Examples

### Get route with estimated time

```json
{
  "api_key": "AIzaSy...",
  "operation": "directions",
  "origin": "Gare de Lyon, Paris",
  "destination": "Aeroport Charles de Gaulle",
  "mode": "transit"
}
```

### Find pharmacies nearby

```json
{
  "api_key": "AIzaSy...",
  "operation": "search_places",
  "query": "pharmacie",
  "latitude": 48.8566,
  "longitude": 2.3522,
  "radius": 500
}
```

### Check air quality and pollen before outdoor activity

```json
// First, get air quality
{
  "api_key": "AIzaSy...",
  "operation": "air_quality",
  "latitude": 48.8566,
  "longitude": 2.3522
}

// Then, get pollen forecast
{
  "api_key": "AIzaSy...",
  "operation": "pollen",
  "latitude": 48.8566,
  "longitude": 2.3522,
  "days": 1
}
```

### Geocode and get timezone

```json
// First, geocode the address
{
  "api_key": "AIzaSy...",
  "operation": "geocode",
  "address": "New York, USA"
}

// Then, get timezone using the coordinates
{
  "api_key": "AIzaSy...",
  "operation": "timezone",
  "latitude": 40.7128,
  "longitude": -74.0060
}
```

---

## Security Best Practices

1. **Restrict your API key** by IP address in Google Cloud Console
2. **Never expose** your API key in client-side code
3. **Monitor usage** in Google Cloud Console to detect anomalies
4. **Set quotas** to prevent unexpected charges
5. **Rotate keys** periodically for security

---

## Related Documentation

- [Google Maps Platform Documentation](https://developers.google.com/maps/documentation)
- [Geocoding API Guide](https://developers.google.com/maps/documentation/geocoding)
- [Directions API Guide](https://developers.google.com/maps/documentation/directions)
- [Places API Guide](https://developers.google.com/maps/documentation/places/web-service)
- [Air Quality API Guide](https://developers.google.com/maps/documentation/air-quality)
- [Pollen API Guide](https://developers.google.com/maps/documentation/pollen)
