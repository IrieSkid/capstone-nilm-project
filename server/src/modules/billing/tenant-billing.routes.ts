import { Router } from 'express';

import { authenticate, authorize, authorizePermission } from '../../shared/middleware/auth';
import { validate } from '../../shared/middleware/validate';
import {
  billingStatementIdParamsSchema,
  submitBillingPaymentBodySchema,
} from './billing.schemas';
import {
  getTenantCurrentBilling,
  submitTenantBillingPayment,
} from './billing.service';

export const tenantBillingRouter = Router();

tenantBillingRouter.use(authenticate, authorize('tenant'));

tenantBillingRouter.get(
  '/current',
  authorizePermission('tenant.billing.view'),
  async (req, res) => {
    const data = await getTenantCurrentBilling(req.user!);

    res.json({
      data,
    });
  },
);

tenantBillingRouter.post(
  '/statements/:id/payments',
  authorizePermission('tenant.billing.view'),
  validate({
    params: billingStatementIdParamsSchema,
    body: submitBillingPaymentBodySchema,
  }),
  async (req, res) => {
    const data = await submitTenantBillingPayment(req.user!, Number(req.params.id), req.body);

    res.status(201).json({
      message: 'Payment submitted successfully.',
      data,
    });
  },
);
