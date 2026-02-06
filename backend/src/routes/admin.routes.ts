import { Router } from 'express';
import { authenticate, requireAdmin } from '../middlewares/auth.middleware';
import { getUsers, updateUser, deleteUser } from '../controllers/admin.user.controller';
import * as ToolController from '../controllers/admin.tool.controller';
import * as FeatureController from '../controllers/admin.feature.controller';
import * as BundleController from '../controllers/admin.bundle.controller';
import * as PlanController from '../controllers/admin.plan.controller';

const router = Router();

// Global middleware for all admin routes in this file
router.use(authenticate, requireAdmin);

// User Management Routes
router.get('/users', getUsers);
router.patch('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

// Organization Management Routes
import { getOrganizations, getOrganizationDetails, updateOrganization, deleteOrganization } from '../controllers/admin.organization.controller';

router.get('/organizations', getOrganizations);
router.get('/organizations/:id', getOrganizationDetails);
router.patch('/organizations/:id', updateOrganization);
router.delete('/organizations/:id', deleteOrganization);

// Tools
router.get('/tools', ToolController.getTools);
router.get('/tools/:id', ToolController.getToolById);
router.post('/tools', ToolController.createTool);
router.put('/tools/:id', ToolController.updateTool); // Use PUT or PATCH? ToolController uses update. Using PUT for "update" often implies full replacement, but here it's partial. I'll stick to PUT as it matches standard crud often, or I can use PATCH. I'll use PUT as defined in my controller I just used `update` which is generic.
router.delete('/tools/:id', ToolController.deleteTool);

// Features
router.get('/features', FeatureController.getFeatures);
router.get('/features/:id', FeatureController.getFeatureById);
router.post('/features', FeatureController.createFeature);
router.put('/features/:id', FeatureController.updateFeature);
router.delete('/features/:id', FeatureController.deleteFeature);

// Bundle Groups
router.get('/bundle-groups', BundleController.getBundleGroups);
router.post('/bundle-groups', BundleController.createBundleGroup);
router.put('/bundle-groups/:id', BundleController.updateBundleGroup);
router.delete('/bundle-groups/:id', BundleController.deleteBundleGroup);

// Bundles
router.get('/bundles', BundleController.getBundles);
router.get('/bundles/:id', BundleController.getBundleById);
router.post('/bundles', BundleController.createBundle);
router.put('/bundles/:id', BundleController.updateBundle);
router.delete('/bundles/:id', BundleController.deleteBundle);
router.post('/bundles/:id/plans', BundleController.addPlanToBundle);
router.delete('/bundles/:id/plans/:planId', BundleController.removePlanFromBundle);

// Plans
router.get('/plans', PlanController.getPlans);
router.get('/plans/:id', PlanController.getPlanById);
router.post('/plans', PlanController.createPlan);
router.put('/plans/:id', PlanController.updatePlan);
router.delete('/plans/:id', PlanController.deletePlan);

// Plan Limits
router.put('/plans/:plan_id/limits', PlanController.upsertPlanLimit);
router.delete('/plans/:plan_id/limits/:feature_id', PlanController.deletePlanLimit);

export default router;
