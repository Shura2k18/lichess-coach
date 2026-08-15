import express from 'express';
import cors from 'cors';
import apiRoutes from './routes/api.js';

export function startServer(port = process.env.PORT || 3000) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/api', apiRoutes);

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 REST API server started on port ${port}`);
  });
}
