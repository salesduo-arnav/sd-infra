import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import itemRoutes from './routes/item.routes';
import { errorHandler } from './middlewares/error';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

// Mount the generic resource routes
// If this app is "Inventory", these become /api/inventory/items
app.use('/items', itemRoutes);

// Standard Health Check
app.get('/health', (req, res) => res.status(200).send('OK'));

app.use(errorHandler);

export default app;