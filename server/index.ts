import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL }));

const PORT = process.env.PORT;

