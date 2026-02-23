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
import userRoutes from './routes/user.routes';
import rateLimit from 'express-rate-limit';
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

app.use('/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);

// Apply express.json to everything EXCEPT webhooks
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/webhooks')) {
    next();
  } else {
    express.json()(req, res, next);
  }
});

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
app.use('/users', userRoutes);

// Standard Health Check
app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/api/health', (req, res) => res.status(200).send('OK'));

// SP-API Callback
import { handleSpCallback } from './controllers/sp.controller';

const oauthRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: 'Too many OAuth requests from this IP, please try again after 15 minutes',
  skip: () => process.env.NODE_ENV === 'test'
});

app.get('/callback', oauthRateLimiter, handleSpCallback);

app.use(errorHandler);

export default app;