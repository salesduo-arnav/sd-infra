import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.routes';
import organizationRoutes from './routes/organization.routes';
import invitationRoutes from './routes/invitation.routes';
import adminRoutes from './routes/admin.routes';
import billingRoutes from './routes/billing.routes';
import webhookRoutes from './routes/webhook.routes';
import toolRoutes from './routes/tool.routes';
import publicPlanRoutes from './routes/public.plan.routes';
import integrationRoutes from './routes/integration.routes';
import { errorHandler } from './middlewares/error';
import morganMiddleware from './middlewares/morgan.middleware';
import './models'; // Initialize associations

const app = express();

app.use(helmet());
const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || [];

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}))

app.use('/webhooks', webhookRoutes);

app.use(express.json());
app.use(cookieParser());
app.use(morganMiddleware);

// Routes
app.use('/auth', authRoutes);
app.use('/organizations', organizationRoutes);
app.use('/invitations', invitationRoutes);
app.use('/admin', adminRoutes);
app.use('/billing', billingRoutes);
app.use('/tools', toolRoutes);
app.use('/public', publicPlanRoutes);
app.use('/integrations', integrationRoutes);

// Standard Health Check
app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/api/health', (req, res) => res.status(200).send('OK'));

app.use(errorHandler);

export default app;