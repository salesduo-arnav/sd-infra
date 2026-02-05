import { Router } from 'express';
import { authenticate, requireAdmin } from '../middlewares/auth.middleware';
import { getUsers, updateUser, deleteUser } from '../controllers/admin.user.controller';

const router = Router();

// global middleware for all admin routes in this file
router.use(authenticate, requireAdmin);

// User Routes
router.get('/users', getUsers);
router.patch('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

// Organization Routes
import { getOrganizations, updateOrganization, deleteOrganization } from '../controllers/admin.organization.controller';

router.get('/organizations', getOrganizations);
router.patch('/organizations/:id', updateOrganization);
router.delete('/organizations/:id', deleteOrganization);

export default router;
