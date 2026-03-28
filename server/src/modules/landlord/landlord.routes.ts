import { Router } from 'express';

import { validate } from '../../shared/middleware/validate';
import { authenticate, authorize, authorizePermission } from '../../shared/middleware/auth';
import { AppError } from '../../shared/utils/app-error';
import {
  billingCycleIdParamsSchema,
  billingPaymentIdParamsSchema,
  billingStatementIdParamsSchema,
  closeBillingCycleBodySchema,
  createBillingCycleBodySchema,
  generateBillingStatementBodySchema,
  issueBillingStatementBodySchema,
  updateBillingCycleBodySchema,
  verifyBillingPaymentBodySchema,
} from '../billing/billing.schemas';
import {
  closeLandlordBillingCycle,
  generateLandlordBillingStatementDraft,
  getLandlordBillingCycleDetail,
  getLandlordBillingStatementDetail,
  verifyLandlordBillingPayment,
  issueLandlordBillingStatement,
  listLandlordBillingStatements,
  listLandlordCurrentBillingCycles,
  openLandlordBillingCycle,
  updateLandlordBillingCycle,
} from '../billing/billing.service';
import {
  createLandlordRoom,
  approveLandlordPendingTenantRequest,
  getLandlordBilling,
  getLandlordDashboard,
  getLandlordRoomDetail,
  getLandlordRoomManagementOptions,
  listLandlordPendingTenantRequests,
  listLandlordDevices,
  listLandlordRooms,
  listLandlordTenants,
  rejectLandlordPendingTenantRequest,
  updateLandlordRoomAlertSettings,
  updateLandlordRoom,
} from './landlord.service';
import {
  createLandlordRoomBodySchema,
  landlordRoomIdParamsSchema,
  landlordTenantRequestIdParamsSchema,
  updateLandlordRoomAlertSettingsBodySchema,
  updateLandlordRoomBodySchema,
} from './landlord.schemas';

export const landlordRouter = Router();

landlordRouter.use(authenticate, authorize('landlord'));

function assertAnyLandlordManagementPermission(userPermissions: string[]) {
  if (
    !userPermissions.includes('landlord.rooms.create')
    && !userPermissions.includes('landlord.rooms.update')
    && !userPermissions.includes('landlord.tenants.assign')
    && !userPermissions.includes('landlord.devices.assign')
  ) {
    throw new AppError(
      403,
      'Room management is currently disabled for your landlord account by the administrator.',
    );
  }
}

landlordRouter.get(
  '/dashboard',
  authorizePermission('landlord.dashboard.view'),
  async (req, res) => {
    const data = await getLandlordDashboard(req.user!);

    res.json({
      data,
    });
  },
);

landlordRouter.get('/rooms', authorizePermission('landlord.rooms.view'), async (req, res) => {
  const data = await listLandlordRooms(req.user!);

  res.json({
    data,
  });
});

landlordRouter.get(
  '/rooms/:id',
  authorizePermission('landlord.rooms.view'),
  validate({ params: landlordRoomIdParamsSchema }),
  async (req, res) => {
    const data = await getLandlordRoomDetail(req.user!, Number(req.params.id));

    res.json({
      data,
    });
  },
);

landlordRouter.post(
  '/rooms',
  authorizePermission('landlord.rooms.create'),
  validate({ body: createLandlordRoomBodySchema }),
  async (req, res) => {
    const data = await createLandlordRoom(req.user!, req.body);

    res.status(201).json({
      message: 'Owned room created successfully.',
      data,
    });
  },
);

landlordRouter.get(
  '/rooms/:id/options',
  authorizePermission('landlord.rooms.view'),
  validate({ params: landlordRoomIdParamsSchema }),
  async (req, res) => {
    assertAnyLandlordManagementPermission(req.user!.permissions);
    const data = await getLandlordRoomManagementOptions(req.user!, Number(req.params.id));

    res.json({
      data,
    });
  },
);

landlordRouter.patch(
  '/rooms/:id',
  authorizePermission('landlord.rooms.view'),
  validate({
    params: landlordRoomIdParamsSchema,
    body: updateLandlordRoomBodySchema,
  }),
  async (req, res) => {
    const data = await updateLandlordRoom(req.user!, Number(req.params.id), req.body);

    res.json({
      message: 'Owned room updated successfully.',
      data,
    });
  },
);

landlordRouter.patch(
  '/rooms/:id/alert-settings',
  authorizePermission('landlord.rooms.view'),
  validate({
    params: landlordRoomIdParamsSchema,
    body: updateLandlordRoomAlertSettingsBodySchema,
  }),
  async (req, res) => {
    const data = await updateLandlordRoomAlertSettings(req.user!, Number(req.params.id), req.body);

    res.json({
      message: 'Room alert settings updated successfully.',
      data,
    });
  },
);

landlordRouter.get('/tenants', authorizePermission('landlord.tenants.view'), async (req, res) => {
  const data = await listLandlordTenants(req.user!);

  res.json({
    data,
  });
});

landlordRouter.get(
  '/tenant-requests',
  authorizePermission('landlord.tenant_requests.view'),
  async (req, res) => {
    const data = await listLandlordPendingTenantRequests(req.user!);

    res.json({
      data,
    });
  },
);

landlordRouter.patch(
  '/tenant-requests/:id/approve',
  authorizePermission('landlord.tenant_requests.approve'),
  validate({ params: landlordTenantRequestIdParamsSchema }),
  async (req, res) => {
    const data = await approveLandlordPendingTenantRequest(req.user!, Number(req.params.id));

    res.json({
      message: 'Tenant registration approved successfully.',
      data,
    });
  },
);

landlordRouter.patch(
  '/tenant-requests/:id/reject',
  authorizePermission('landlord.tenant_requests.approve'),
  validate({ params: landlordTenantRequestIdParamsSchema }),
  async (req, res) => {
    const data = await rejectLandlordPendingTenantRequest(req.user!, Number(req.params.id));

    res.json({
      message: 'Tenant registration rejected successfully.',
      data,
    });
  },
);

landlordRouter.get('/devices', authorizePermission('landlord.devices.view'), async (req, res) => {
  const data = await listLandlordDevices(req.user!);

  res.json({
    data,
  });
});

landlordRouter.get(
  '/billing/current-cycles',
  authorizePermission('landlord.billing.view'),
  async (req, res) => {
    const data = await listLandlordCurrentBillingCycles(req.user!);

    res.json({
      data,
    });
  },
);

landlordRouter.get(
  '/billing/cycles/:id',
  authorizePermission('landlord.billing.view'),
  validate({ params: billingCycleIdParamsSchema }),
  async (req, res) => {
    const data = await getLandlordBillingCycleDetail(req.user!, Number(req.params.id));

    res.json({
      data,
    });
  },
);

landlordRouter.post(
  '/billing/cycles',
  authorizePermission('landlord.billing.manage'),
  validate({ body: createBillingCycleBodySchema }),
  async (req, res) => {
    const data = await openLandlordBillingCycle(req.user!, req.body);

    res.status(201).json({
      message: 'Billing cycle opened successfully.',
      data,
    });
  },
);

landlordRouter.patch(
  '/billing/cycles/:id',
  authorizePermission('landlord.billing.manage'),
  validate({
    params: billingCycleIdParamsSchema,
    body: updateBillingCycleBodySchema,
  }),
  async (req, res) => {
    const data = await updateLandlordBillingCycle(req.user!, Number(req.params.id), req.body);

    res.json({
      message: 'Billing cycle updated successfully.',
      data,
    });
  },
);

landlordRouter.patch(
  '/billing/cycles/:id/close',
  authorizePermission('landlord.billing.manage'),
  validate({
    params: billingCycleIdParamsSchema,
    body: closeBillingCycleBodySchema,
  }),
  async (req, res) => {
    const data = await closeLandlordBillingCycle(req.user!, Number(req.params.id), req.body);

    res.json({
      message: 'Billing cycle closed successfully.',
      data,
    });
  },
);

landlordRouter.get(
  '/billing/statements',
  authorizePermission('landlord.billing.view'),
  async (req, res) => {
    const data = await listLandlordBillingStatements(req.user!);

    res.json({
      data,
    });
  },
);

landlordRouter.get(
  '/billing/statements/:id',
  authorizePermission('landlord.billing.view'),
  validate({ params: billingStatementIdParamsSchema }),
  async (req, res) => {
    const data = await getLandlordBillingStatementDetail(req.user!, Number(req.params.id));

    res.json({
      data,
    });
  },
);

landlordRouter.post(
  '/billing/cycles/:id/statements',
  authorizePermission('landlord.billing.manage'),
  validate({
    params: billingCycleIdParamsSchema,
    body: generateBillingStatementBodySchema,
  }),
  async (req, res) => {
    const data = await generateLandlordBillingStatementDraft(req.user!, Number(req.params.id));

    res.status(201).json({
      message: 'Draft statement generated successfully.',
      data,
    });
  },
);

landlordRouter.patch(
  '/billing/statements/:id/issue',
  authorizePermission('landlord.billing.manage'),
  validate({
    params: billingStatementIdParamsSchema,
    body: issueBillingStatementBodySchema,
  }),
  async (req, res) => {
    const data = await issueLandlordBillingStatement(req.user!, Number(req.params.id), req.body);

    res.json({
      message: 'Billing statement issued successfully.',
      data,
    });
  },
);

landlordRouter.patch(
  '/billing/payments/:id/verify',
  authorizePermission('landlord.billing.manage'),
  validate({
    params: billingPaymentIdParamsSchema,
    body: verifyBillingPaymentBodySchema,
  }),
  async (req, res) => {
    const data = await verifyLandlordBillingPayment(req.user!, Number(req.params.id), req.body);

    res.json({
      message: req.body.action === 'approve'
        ? 'Payment approved successfully.'
        : 'Payment rejected successfully.',
      data,
    });
  },
);

landlordRouter.get('/billing', authorizePermission('landlord.billing.view'), async (req, res) => {
  const data = await getLandlordBilling(req.user!);

  res.json({
    data,
  });
});
