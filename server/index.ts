import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { errorHandler } from './src/common';

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());
app.use(errorHandler);

const PORT = Number(process.env.PORT ?? 3000);

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
