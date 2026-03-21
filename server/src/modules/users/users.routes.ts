import { Router } from 'express';

import { authorize, authenticate } from '../../shared/middleware/auth';
import { validate } from '../../shared/middleware/validate';
import { createUser, listUsers, updateUser } from './users.service';
import { createUserBodySchema, updateUserBodySchema, userIdParamsSchema } from './users.schemas';

export const usersRouter = Router();

usersRouter.use(authenticate, authorize('admin'));

usersRouter.get('/', async (_req, res) => {
  const data = await listUsers();

  res.json({
    data,
  });
});

usersRouter.post('/', validate({ body: createUserBodySchema }), async (req, res) => {
  const user = await createUser(req.body);

  res.status(201).json({
    message: 'User created successfully.',
    data: user,
  });
});

usersRouter.patch(
  '/:id',
  validate({
    params: userIdParamsSchema,
    body: updateUserBodySchema,
  }),
  async (req, res) => {
    const user = await updateUser(Number(req.params.id), req.body);

    res.json({
      message: 'User updated successfully.',
      data: user,
    });
  },
);
