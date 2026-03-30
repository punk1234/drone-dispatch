import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Drone Dispatch API',
      version: '1.0.0',
      description: `
## Blusalt Software Engineering Challenge

A REST API for managing a fleet of **10 drones** capable of delivering medications to locations with difficult access.

### Authentication

All endpoints require an **X-Api-Key** header.

| Key | Role | Capabilities |
|---|---|---|
| See README | **admin** | Full access — register drones, load, update state, create medications |
| See README | **readonly** | Read-only — GET endpoints only |

### Business Rules
- A drone **cannot be loaded** if its battery is below **25%**
- A drone **cannot be loaded** if it is not in \`IDLE\` or \`LOADING\` state
- Total medication weight **cannot exceed** the drone's weight limit (500gr max)
- Available drones are **cached in Redis** for fast retrieval
- A **cron job** runs every minute to audit and log all drone battery levels

### Image Upload Options
1. **Pre-signed URL (recommended)** — call \`POST /api/medications/upload-url\`, upload directly to S3, pass returned \`imageUrl\`
2. **Direct file upload** — send \`image\` as multipart/form-data field
3. **External URL** — pass any public image URL as \`imageUrl\` in the JSON body
      `,
      contact: { name: 'Fatai Akeju' },
    },
    servers: [{ url: 'http://localhost:3000', description: 'Local development' }],
    components: {
      securitySchemes: {
        ApiKeyAdmin: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Api-Key',
          description: 'Admin API key — full read/write access',
        },
        ApiKeyReadonly: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Api-Key',
          description: 'Readonly API key — GET endpoints only',
        },
      },
    },
    security: [{ ApiKeyAdmin: [] }, { ApiKeyReadonly: [] }],
  },
  apis: ['./src/routes/*.ts'],
  // Storage tag added via route JSDoc
};

export const swaggerSpec = swaggerJsdoc(options);
