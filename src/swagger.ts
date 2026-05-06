import swaggerUi from 'swagger-ui-express';
import { spec } from '../lib/openapi.js';
import type { Express } from 'express';

export class SwaggerDocs {
  /**
   * Mounts the Swagger UI documentation on the provided Express app.
   * @param app The Express application instance
   * @param path The route path where the docs will be available
   */
  public static setup(app: Express, path: string = '/api-docs'): void {
    app.use(path, swaggerUi.serve, swaggerUi.setup(spec));
  }
}
