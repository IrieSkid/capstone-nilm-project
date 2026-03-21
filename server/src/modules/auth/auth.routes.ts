import { Router } from 'express';

import { authenticateUser } from './auth.service';
import { loginBodySchema } from './auth.schemas';
import { authenticate } from '../../shared/middleware/auth';
import { validate } from '../../shared/middleware/validate';
import { signAccessToken } from '../../shared/utils/jwt';

export const authRouter = Router();

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

authRouter.get('/me', authenticate, async (req, res) => {
  res.json({
    data: req.user,
  });
});
