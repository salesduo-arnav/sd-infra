import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.routes';
import organizationRoutes from './routes/organization.routes';
import invitationRoutes from './routes/invitation.routes';
import adminRoutes from './routes/admin.routes';
import toolRoutes from './routes/tool.routes';
import billingRoutes from './routes/billing.routes';
import webhookRoutes from './routes/webhook.routes';
import publicPlanRoutes from './routes/public.plan.routes';
import { errorHandler } from './middlewares/error';
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

// Routes
app.use('/auth', authRoutes);
app.use('/organizations', organizationRoutes);
app.use('/invitations', invitationRoutes);
app.use('/admin', adminRoutes);
app.use('/tools', toolRoutes);
app.use('/billing', billingRoutes);
app.use('/public', publicPlanRoutes);

// Standard Health Check
app.get('/health', (req, res) => res.status(200).send('OK'));

app.use(errorHandler);

export default app;