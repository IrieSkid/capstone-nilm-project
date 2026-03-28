import { Router } from 'express';

import { authenticate, authorize, authorizePermission } from '../../shared/middleware/auth';
import { AppModuleKey } from '../../shared/types/auth';
import { validate } from '../../shared/middleware/validate';
import {
  moduleKeyParamSchema,
  roleIdParamSchema,
  updateUserModulePermissionBodySchema,
  userIdParamSchema,
  updateRoleModulePermissionBodySchema,
} from './rbac.schemas';
import {
  getAccessControlMatrix,
  updateRoleModulePermission,
  updateUserModulePermission,
} from './rbac.service';

export const rbacRouter = Router();

rbacRouter.use(authenticate, authorize('admin'), authorizePermission('rbac.manage'));

rbacRouter.get('/', async (_req, res) => {
  const matrix = await getAccessControlMatrix();

  res.json({
    data: matrix,
  });
});

rbacRouter.patch(
  '/roles/:roleId/modules/:moduleKey',
  validate({
    params: roleIdParamSchema.merge(moduleKeyParamSchema),
    body: updateRoleModulePermissionBodySchema,
  }),
  async (req, res) => {
    const matrix = await updateRoleModulePermission({
      roleId: Number(req.params.roleId),
      moduleKey: req.params.moduleKey as AppModuleKey,
      canAccess: req.body.can_access,
      changedByUserId: req.user!.userId,
    });

    res.json({
      message: 'Role access updated successfully.',
      data: matrix,
    });
  },
);

rbacRouter.patch(
  '/users/:userId/modules/:moduleKey',
  validate({
    params: userIdParamSchema.merge(moduleKeyParamSchema),
    body: updateUserModulePermissionBodySchema,
  }),
  async (req, res) => {
    const matrix = await updateUserModulePermission({
      userId: Number(req.params.userId),
      moduleKey: req.params.moduleKey as AppModuleKey,
      overrideState: req.body.override_state,
      changedByUserId: req.user!.userId,
    });

    res.json({
      message: 'User access override updated successfully.',
      data: matrix,
    });
  },
);
