import express from 'express';
import { SwaggerDocs } from './swagger.js';

const app = express();
SwaggerDocs.setup(app, '/'); // Serve it directly at the root (http://localhost:3001)

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`\nSwagger UI is running!`);
  console.log(`👉 View API documentation at: http://localhost:${PORT}\n`);
});
