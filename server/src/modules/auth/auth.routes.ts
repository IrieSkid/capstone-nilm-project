import { Router } from 'express';

import {
  authenticateUser,
  changeAuthenticatedUserPassword,
  registerTenant,
  resetPasswordWithRecovery,
  updateAuthenticatedUserProfile,
} from './auth.service';
import {
  changePasswordBodySchema,
  forgotPasswordBodySchema,
  loginBodySchema,
  registerTenantBodySchema,
  updateProfileBodySchema,
} from './auth.schemas';
import { authenticate, authorizePermission } from '../../shared/middleware/auth';
import { validate } from '../../shared/middleware/validate';
import { signAccessToken } from '../../shared/utils/jwt';

export const authRouter = Router();

authRouter.post(
  '/register-tenant',
  validate({ body: registerTenantBodySchema }),
  async (req, res) => {
    const user = await registerTenant(req.body);

    res.status(201).json({
      message: 'Tenant account created and sent for landlord approval.',
      data: user,
    });
  },
);

authRouter.post('/login', validate({ body: loginBodySchema }), async (req, res) => {
  const user = await authenticateUser(req.body.email, req.body.password);
  const token = signAccessToken(user);

  res.json({
    message: 'Login successful.',
    data: {
      token,
      user,
    },
  });
});

authRouter.post(
  '/forgot-password',
  validate({ body: forgotPasswordBodySchema }),
  async (req, res) => {
    const user = await resetPasswordWithRecovery(req.body);

    res.json({
      message: 'Password reset successful.',
      data: user,
    });
  },
);

authRouter.get('/me', authenticate, async (req, res) => {
  res.json({
    data: req.user,
  });
});

authRouter.patch(
  '/me',
  authenticate,
  authorizePermission('profile.manage'),
  validate({ body: updateProfileBodySchema }),
  async (req, res) => {
    const user = await updateAuthenticatedUserProfile(req.user!.userId, req.body);

    res.json({
      message: 'Profile updated successfully.',
      data: user,
    });
  },
);

authRouter.patch(
  '/change-password',
  authenticate,
  authorizePermission('profile.manage'),
  validate({ body: changePasswordBodySchema }),
  async (req, res) => {
    const user = await changeAuthenticatedUserPassword(
      req.user!.userId,
      req.body.current_password,
      req.body.new_password,
    );

    res.json({
      message: 'Password changed successfully.',
      data: user,
    });
  },
);
