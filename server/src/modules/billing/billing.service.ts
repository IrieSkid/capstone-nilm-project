import { ResultSetHeader, RowDataPacket } from 'mysql2';

import { pool, withTransaction } from '../../config/db';
import { AuthenticatedUser } from '../../shared/types/auth';
import { AppError } from '../../shared/utils/app-error';
import { assertRoomAccess, getLandlordRoomIds, getTenantRoomIds } from '../../shared/utils/room-access';
import {
  clearNotificationsByReference,
  createNotification,
  createNotificationIfMissing,
} from '../notifications/notifications.service';
import { getLatestReadingByRoomId } from '../readings/readings.service';

interface BillingContextRow extends RowDataPacket {
  room_id: number;
  room_name: string;
  room_status: 'available' | 'occupied';
  room_rate_per_kwh: number;
  landlord_id: number | null;
  landlord_name: string | null;
  tenant_id: number | null;
  tenant_name: string | null;
  tenant_email: string | null;
  device_id: number | null;
  device_name: string | null;
  device_identifier: string | null;
}

interface BillingCycleRow extends RowDataPacket {
  billing_cycle_id: number;
  billing_cycle_room_id: number;
  billing_cycle_tenant_id: number;
  billing_cycle_landlord_id: number;
  billing_cycle_device_id: number;
  billing_cycle_period_start: string;
  billing_cycle_period_end: string;
  billing_cycle_opening_reading_header_id: number;
  billing_cycle_closing_reading_header_id: number | null;
  billing_cycle_opening_energy_kwh: number;
  billing_cycle_closing_energy_kwh: number | null;
  billing_cycle_rate_per_kwh_snapshot: number;
  billing_cycle_status: 'open' | 'closed' | 'statement_issued' | 'cancelled';
  billing_cycle_closed_at: string | null;
  created_by_user_id: number;
  created_at: string;
  room_name: string;
  room_status: 'available' | 'occupied';
  tenant_name: string | null;
  tenant_email: string | null;
  device_name: string | null;
  device_identifier: string | null;
}

interface BillingStatementRow extends RowDataPacket {
  billing_statement_id: number;
  billing_statement_cycle_id: number;
  billing_statement_room_id: number;
  billing_statement_tenant_id: number;
  billing_statement_landlord_id: number;
  billing_statement_device_id: number;
  billing_statement_period_start: string;
  billing_statement_period_end: string;
  billing_statement_opening_reading_header_id: number;
  billing_statement_closing_reading_header_id: number;
  billing_statement_opening_energy_kwh: number;
  billing_statement_closing_energy_kwh: number;
  billing_statement_billed_kwh: number;
  billing_statement_rate_per_kwh_snapshot: number;
  billing_statement_subtotal_amount: number;
  billing_statement_adjustments_amount: number;
  billing_statement_total_amount: number;
  billing_statement_status: 'draft' | 'issued' | 'partially_paid' | 'paid' | 'void';
  billing_statement_number: string | null;
  billing_statement_due_date: string | null;
  billing_statement_issued_at: string | null;
  billing_statement_notes: string | null;
  created_by_user_id: number;
  created_at: string;
  updated_at: string;
  room_name: string;
  room_status: 'available' | 'occupied';
  tenant_name: string | null;
  tenant_email: string | null;
  device_name: string | null;
  device_identifier: string | null;
}

interface BillingStatementItemRow extends RowDataPacket {
  billing_statement_item_id: number;
  billing_statement_item_statement_id: number;
  billing_statement_item_label: string;
  billing_statement_item_description: string | null;
  billing_statement_item_quantity: number;
  billing_statement_item_unit: string | null;
  billing_statement_item_unit_amount: number;
  billing_statement_item_total_amount: number;
  billing_statement_item_sort_order: number;
  created_at: string;
}

interface BillingPaymentRow extends RowDataPacket {
  billing_payment_id: number;
  billing_payment_statement_id: number;
  billing_payment_tenant_id: number;
  billing_payment_landlord_id: number;
  billing_payment_amount: number;
  billing_payment_method: string;
  billing_payment_reference_number: string | null;
  billing_payment_notes: string | null;
  billing_payment_status: 'pending' | 'approved' | 'rejected';
  billing_payment_rejection_reason: string | null;
  billing_payment_submitted_at: string;
  billing_payment_verified_at: string | null;
  billing_payment_verified_by_user_id: number | null;
  created_at: string;
  updated_at: string;
  statement_number: string | null;
  statement_status: 'draft' | 'issued' | 'partially_paid' | 'paid' | 'void';
  statement_total_amount: number;
  statement_due_date: string | null;
  room_id: number;
  room_name: string;
  tenant_name: string | null;
  landlord_name: string | null;
  verified_by_name: string | null;
  receipt_id: number | null;
  receipt_number: string | null;
  receipt_issued_at: string | null;
}

interface BillingReceiptRow extends RowDataPacket {
  billing_receipt_id: number;
  billing_receipt_payment_id: number;
  billing_receipt_statement_id: number;
  billing_receipt_tenant_id: number;
  billing_receipt_landlord_id: number;
  billing_receipt_number: string;
  billing_receipt_amount: number;
  billing_receipt_notes: string | null;
  billing_receipt_issued_at: string;
  created_at: string;
  statement_number: string | null;
  room_id: number;
  room_name: string;
  tenant_name: string | null;
  landlord_name: string | null;
  payment_method: string | null;
  payment_reference_number: string | null;
}

interface CountRow extends RowDataPacket {
  total: number;
}

interface StatementPaymentSummaryRow extends RowDataPacket {
  approved_amount: number | null;
  pending_amount: number | null;
  rejected_amount: number | null;
  payment_count: number;
  receipt_count: number;
}

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

function roundEnergy(value: number) {
  return Number(value.toFixed(4));
}

function formatDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00`);
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function addOneMonthInclusive(periodStart: string) {
  const startDate = parseDateOnly(periodStart);
  const nextMonth = new Date(startDate);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  nextMonth.setDate(nextMonth.getDate() - 1);
  return formatDateOnly(nextMonth);
}

function resolveAutoBillingPeriod(startDate = new Date()) {
  const periodStart = formatDateOnly(startDate);
  const periodEnd = addOneMonthInclusive(periodStart);

  return {
    periodStart,
    periodEnd,
  };
}

function getDefaultStatementDueDate(issueDate = new Date()) {
  return formatDateOnly(addDays(issueDate, 7));
}

function getProjectedCurrentBill(cycleToDateKwh: number, ratePerKwhSnapshot: number) {
  return roundCurrency(cycleToDateKwh * ratePerKwhSnapshot);
}

function formatDateLabel(value: string | null) {
  if (!value) {
    return 'N/A';
  }

  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parseDateOnly(value));
}

function getStatementNumber(statementId: number, issueDate: string) {
  const normalizedIssueDate = issueDate.replace(/-/g, '').slice(0, 6);
  return `BILL-${normalizedIssueDate}-${String(statementId).padStart(5, '0')}`;
}

function buildStatementAmounts(cycle: BillingCycleRow) {
  if (
    cycle.billing_cycle_closing_reading_header_id === null
    || cycle.billing_cycle_closing_energy_kwh === null
  ) {
    throw new AppError(409, 'This billing cycle is missing a closing snapshot.');
  }

  const billedKwh = roundEnergy(
    Math.max(cycle.billing_cycle_closing_energy_kwh - cycle.billing_cycle_opening_energy_kwh, 0),
  );
  const subtotalAmount = roundCurrency(
    billedKwh * cycle.billing_cycle_rate_per_kwh_snapshot,
  );
  const adjustmentsAmount = 0;
  const totalAmount = roundCurrency(subtotalAmount + adjustmentsAmount);

  return {
    billedKwh,
    subtotalAmount,
    adjustmentsAmount,
    totalAmount,
  };
}

function getDaysUntilDue(dueDate: string | null) {
  if (!dueDate) {
    return null;
  }

  const start = parseDateOnly(formatDateOnly(new Date()));
  const end = parseDateOnly(dueDate);
  const differenceInMs = end.getTime() - start.getTime();

  return Math.floor(differenceInMs / (1000 * 60 * 60 * 24));
}

function getReceiptNumber(paymentId: number, issuedDate: string) {
  const normalizedIssueDate = issuedDate.replace(/-/g, '').slice(0, 6);
  return `RCT-${normalizedIssueDate}-${String(paymentId).padStart(5, '0')}`;
}

function normalizeOptionalText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function getRoomBillingContext(roomId: number) {
  const [rows] = await pool.query<BillingContextRow[]>(
    `
      SELECT
        room.room_id,
        room.room_name,
        room.room_status,
        room.room_rate_per_kwh,
        landlord.user_id AS landlord_id,
        landlord.user_name AS landlord_name,
        tenant.user_id AS tenant_id,
        tenant.user_name AS tenant_name,
        tenant.user_email AS tenant_email,
        device.device_id,
        device.device_name,
        device.device_identifier
      FROM tblrooms room
      LEFT JOIN tblusers landlord ON landlord.user_id = room.room_landlord_id
      LEFT JOIN tblusers tenant ON tenant.user_id = room.room_tenant_id
      LEFT JOIN tbldevices device ON device.device_id = room.room_device_id
      WHERE room.room_id = ?
      LIMIT 1
    `,
    [roomId],
  );

  if (!rows[0]) {
    throw new AppError(404, 'Room not found.');
  }

  return rows[0];
}

async function getBillingCycleRowById(cycleId: number) {
  const [rows] = await pool.query<BillingCycleRow[]>(
    `
      SELECT
        cycle.*,
        room.room_name,
        room.room_status,
        tenant.user_name AS tenant_name,
        tenant.user_email AS tenant_email,
        device.device_name,
        device.device_identifier
      FROM tblbilling_cycles cycle
      INNER JOIN tblrooms room ON room.room_id = cycle.billing_cycle_room_id
      LEFT JOIN tblusers tenant ON tenant.user_id = cycle.billing_cycle_tenant_id
      LEFT JOIN tbldevices device ON device.device_id = cycle.billing_cycle_device_id
      WHERE cycle.billing_cycle_id = ?
      LIMIT 1
    `,
    [cycleId],
  );

  return rows[0] ?? null;
}

async function getBillingStatementRowById(statementId: number) {
  const [rows] = await pool.query<BillingStatementRow[]>(
    `
      SELECT
        statement.*,
        room.room_name,
        room.room_status,
        tenant.user_name AS tenant_name,
        tenant.user_email AS tenant_email,
        device.device_name,
        device.device_identifier
      FROM tblbilling_statements statement
      INNER JOIN tblrooms room ON room.room_id = statement.billing_statement_room_id
      LEFT JOIN tblusers tenant ON tenant.user_id = statement.billing_statement_tenant_id
      LEFT JOIN tbldevices device ON device.device_id = statement.billing_statement_device_id
      WHERE statement.billing_statement_id = ?
      LIMIT 1
    `,
    [statementId],
  );

  return rows[0] ?? null;
}

async function getBillingStatementItems(statementId: number) {
  const [rows] = await pool.query<BillingStatementItemRow[]>(
    `
      SELECT *
      FROM tblbilling_statement_items
      WHERE billing_statement_item_statement_id = ?
      ORDER BY billing_statement_item_sort_order, billing_statement_item_id
    `,
    [statementId],
  );

  return rows;
}

async function getBillingStatementForCycle(cycleId: number) {
  const [rows] = await pool.query<BillingStatementRow[]>(
    `
      SELECT
        statement.*,
        room.room_name,
        room.room_status,
        tenant.user_name AS tenant_name,
        tenant.user_email AS tenant_email,
        device.device_name,
        device.device_identifier
      FROM tblbilling_statements statement
      INNER JOIN tblrooms room ON room.room_id = statement.billing_statement_room_id
      LEFT JOIN tblusers tenant ON tenant.user_id = statement.billing_statement_tenant_id
      LEFT JOIN tbldevices device ON device.device_id = statement.billing_statement_device_id
      WHERE statement.billing_statement_cycle_id = ?
      LIMIT 1
    `,
    [cycleId],
  );

  return rows[0] ?? null;
}

async function getBillingPaymentRowById(paymentId: number) {
  const [rows] = await pool.query<BillingPaymentRow[]>(
    `
      SELECT
        payment.*,
        statement.billing_statement_number AS statement_number,
        statement.billing_statement_status AS statement_status,
        statement.billing_statement_total_amount AS statement_total_amount,
        statement.billing_statement_due_date AS statement_due_date,
        room.room_id,
        room.room_name,
        tenant.user_name AS tenant_name,
        landlord.user_name AS landlord_name,
        verifier.user_name AS verified_by_name,
        receipt.billing_receipt_id AS receipt_id,
        receipt.billing_receipt_number AS receipt_number,
        receipt.billing_receipt_issued_at AS receipt_issued_at
      FROM tblbilling_payments payment
      INNER JOIN tblbilling_statements statement
        ON statement.billing_statement_id = payment.billing_payment_statement_id
      INNER JOIN tblrooms room ON room.room_id = statement.billing_statement_room_id
      LEFT JOIN tblusers tenant ON tenant.user_id = payment.billing_payment_tenant_id
      LEFT JOIN tblusers landlord ON landlord.user_id = payment.billing_payment_landlord_id
      LEFT JOIN tblusers verifier ON verifier.user_id = payment.billing_payment_verified_by_user_id
      LEFT JOIN tblbilling_receipts receipt
        ON receipt.billing_receipt_payment_id = payment.billing_payment_id
      WHERE payment.billing_payment_id = ?
      LIMIT 1
    `,
    [paymentId],
  );

  return rows[0] ?? null;
}

async function getBillingReceiptRowByPaymentId(paymentId: number) {
  const [rows] = await pool.query<BillingReceiptRow[]>(
    `
      SELECT
        receipt.*,
        statement.billing_statement_number AS statement_number,
        room.room_id,
        room.room_name,
        tenant.user_name AS tenant_name,
        landlord.user_name AS landlord_name,
        payment.billing_payment_method AS payment_method,
        payment.billing_payment_reference_number AS payment_reference_number
      FROM tblbilling_receipts receipt
      INNER JOIN tblbilling_statements statement
        ON statement.billing_statement_id = receipt.billing_receipt_statement_id
      INNER JOIN tblrooms room ON room.room_id = statement.billing_statement_room_id
      LEFT JOIN tblusers tenant ON tenant.user_id = receipt.billing_receipt_tenant_id
      LEFT JOIN tblusers landlord ON landlord.user_id = receipt.billing_receipt_landlord_id
      LEFT JOIN tblbilling_payments payment
        ON payment.billing_payment_id = receipt.billing_receipt_payment_id
      WHERE receipt.billing_receipt_payment_id = ?
      LIMIT 1
    `,
    [paymentId],
  );

  return rows[0] ?? null;
}

async function getStatementPaymentSummary(statementId: number) {
  const [rows] = await pool.query<StatementPaymentSummaryRow[]>(
    `
      SELECT
        COALESCE(SUM(CASE WHEN billing_payment_status = 'approved' THEN billing_payment_amount ELSE 0 END), 0) AS approved_amount,
        COALESCE(SUM(CASE WHEN billing_payment_status = 'pending' THEN billing_payment_amount ELSE 0 END), 0) AS pending_amount,
        COALESCE(SUM(CASE WHEN billing_payment_status = 'rejected' THEN billing_payment_amount ELSE 0 END), 0) AS rejected_amount,
        COUNT(*) AS payment_count,
        (
          SELECT COUNT(*)
          FROM tblbilling_receipts receipt
          WHERE receipt.billing_receipt_statement_id = ?
        ) AS receipt_count
      FROM tblbilling_payments
      WHERE billing_payment_statement_id = ?
    `,
    [statementId, statementId],
  );

  return rows[0] ?? {
    approved_amount: 0,
    pending_amount: 0,
    rejected_amount: 0,
    payment_count: 0,
    receipt_count: 0,
  };
}

async function getLatestReadingSnapshot(roomId: number) {
  return getLatestReadingByRoomId(roomId);
}

async function getReadingSnapshotById(roomId: number, readingId: number | null) {
  if (readingId === null) {
    return null;
  }

  const latestReading = await getLatestReadingSnapshot(roomId);

  if (latestReading?.readingId === readingId) {
    return latestReading;
  }

  const [rows] = await pool.query<
    Array<
      RowDataPacket & {
        reading_header_id: number;
        reading_header_time: string;
        reading_detail_voltage: number;
        reading_detail_current: number;
        reading_detail_power_w: number;
        reading_detail_frequency: number;
        reading_detail_power_factor: number;
        reading_detail_thd_percentage: number;
        reading_detail_energy_kwh: number;
        room_name: string;
        room_rate_per_kwh: number;
      }
    >
  >(
    `
      SELECT
        rh.reading_header_id,
        rh.reading_header_time,
        rd.reading_detail_voltage,
        rd.reading_detail_current,
        rd.reading_detail_power_w,
        rd.reading_detail_frequency,
        rd.reading_detail_power_factor,
        rd.reading_detail_thd_percentage,
        rd.reading_detail_energy_kwh,
        room.room_name,
        room.room_rate_per_kwh
      FROM tblreading_headers rh
      INNER JOIN tblreading_details rd ON rd.reading_detail_header_id = rh.reading_header_id
      INNER JOIN tblrooms room ON room.room_id = rh.reading_header_room_id
      WHERE rh.reading_header_room_id = ?
        AND rh.reading_header_id = ?
      LIMIT 1
    `,
    [roomId, readingId],
  );

  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    readingId: row.reading_header_id,
    roomId,
    roomName: row.room_name,
    timestamp: row.reading_header_time,
    voltage: row.reading_detail_voltage,
    current: row.reading_detail_current,
    powerW: row.reading_detail_power_w,
    frequency: row.reading_detail_frequency,
    powerFactor: row.reading_detail_power_factor,
    thdPercentage: row.reading_detail_thd_percentage,
    energyKwh: row.reading_detail_energy_kwh,
    estimatedCost: roundCurrency(row.reading_detail_energy_kwh * row.room_rate_per_kwh),
    likelyActiveAppliance: null,
    detectionConfidence: null,
    detections: [],
  };
}

async function getOpenBillingCycleByRoomId(roomId: number) {
  const [rows] = await pool.query<BillingCycleRow[]>(
    `
      SELECT
        cycle.*,
        room.room_name,
        room.room_status,
        tenant.user_name AS tenant_name,
        tenant.user_email AS tenant_email,
        device.device_name,
        device.device_identifier
      FROM tblbilling_cycles cycle
      INNER JOIN tblrooms room ON room.room_id = cycle.billing_cycle_room_id
      LEFT JOIN tblusers tenant ON tenant.user_id = cycle.billing_cycle_tenant_id
      LEFT JOIN tbldevices device ON device.device_id = cycle.billing_cycle_device_id
      WHERE cycle.billing_cycle_room_id = ?
        AND cycle.billing_cycle_status = 'open'
      ORDER BY cycle.billing_cycle_id DESC
      LIMIT 1
    `,
    [roomId],
  );

  return rows[0] ?? null;
}

async function assertNoOverlappingBillingCycle(roomId: number, periodStart: string, periodEnd: string) {
  const [rows] = await pool.query<CountRow[]>(
    `
      SELECT COUNT(*) AS total
      FROM tblbilling_cycles
      WHERE billing_cycle_room_id = ?
        AND billing_cycle_status <> 'cancelled'
        AND billing_cycle_period_start <= ?
        AND billing_cycle_period_end >= ?
    `,
    [roomId, periodEnd, periodStart],
  );

  if ((rows[0]?.total ?? 0) > 0) {
    throw new AppError(
      409,
      'This room already has a billing cycle that overlaps the selected period.',
    );
  }
}

async function assertNoOverlappingBillingCycleExcludingSelf(
  roomId: number,
  periodStart: string,
  periodEnd: string,
  cycleId: number,
) {
  const [rows] = await pool.query<CountRow[]>(
    `
      SELECT COUNT(*) AS total
      FROM tblbilling_cycles
      WHERE billing_cycle_room_id = ?
        AND billing_cycle_id <> ?
        AND billing_cycle_status <> 'cancelled'
        AND billing_cycle_period_start <= ?
        AND billing_cycle_period_end >= ?
    `,
    [roomId, cycleId, periodEnd, periodStart],
  );

  if ((rows[0]?.total ?? 0) > 0) {
    throw new AppError(
      409,
      'This updated cycle window overlaps another billing cycle for the same room.',
    );
  }
}

function buildBillingCyclePayload(
  cycle: BillingCycleRow,
  latestReading: Awaited<ReturnType<typeof getLatestReadingSnapshot>>,
  lockedClosingReading?: Awaited<ReturnType<typeof getReadingSnapshotById>> | null,
) {
  const effectiveLatestReading =
    cycle.billing_cycle_status === 'open' ? latestReading : lockedClosingReading ?? latestReading;

  const latestReadingId =
    cycle.billing_cycle_status === 'open'
      ? latestReading?.readingId ?? cycle.billing_cycle_opening_reading_header_id
      : cycle.billing_cycle_closing_reading_header_id;

  const latestReadingAt =
    cycle.billing_cycle_status === 'open'
      ? latestReading?.timestamp ?? null
      : effectiveLatestReading?.timestamp ?? cycle.billing_cycle_closed_at;

  const latestPowerW =
    cycle.billing_cycle_status === 'open'
      ? latestReading?.powerW ?? null
      : effectiveLatestReading?.powerW ?? null;

  const latestEnergyKwh = roundEnergy(
    cycle.billing_cycle_status === 'open'
      ? Math.max(
          latestReading?.energyKwh ?? cycle.billing_cycle_opening_energy_kwh,
          cycle.billing_cycle_opening_energy_kwh,
        )
      : Math.max(
          effectiveLatestReading?.energyKwh
            ?? cycle.billing_cycle_closing_energy_kwh
            ?? cycle.billing_cycle_opening_energy_kwh,
          cycle.billing_cycle_opening_energy_kwh,
        ),
  );

  const cycleToDateKwh = roundEnergy(
    Math.max(latestEnergyKwh - cycle.billing_cycle_opening_energy_kwh, 0),
  );

  return {
    cycleId: cycle.billing_cycle_id,
    roomId: cycle.billing_cycle_room_id,
    roomName: cycle.room_name,
    roomStatus: cycle.room_status,
    tenantId: cycle.billing_cycle_tenant_id,
    tenantName: cycle.tenant_name,
    tenantEmail: cycle.tenant_email,
    deviceId: cycle.billing_cycle_device_id,
    deviceName: cycle.device_name,
    deviceIdentifier: cycle.device_identifier,
    periodStart: cycle.billing_cycle_period_start,
    periodEnd: cycle.billing_cycle_period_end,
    status: cycle.billing_cycle_status,
    ratePerKwhSnapshot: cycle.billing_cycle_rate_per_kwh_snapshot,
    openingReadingId: cycle.billing_cycle_opening_reading_header_id,
    openingEnergyKwh: cycle.billing_cycle_opening_energy_kwh,
    latestReadingId,
    latestReadingAt,
    latestPowerW,
    latestEnergyKwh,
    cycleToDateKwh,
    projectedCurrentBill: getProjectedCurrentBill(
      cycleToDateKwh,
      cycle.billing_cycle_rate_per_kwh_snapshot,
    ),
    closedAt: cycle.billing_cycle_closed_at,
    createdAt: cycle.created_at,
  };
}

function buildBillingStatementPayload(
  statement: BillingStatementRow,
  items: BillingStatementItemRow[],
  paymentSummary: StatementPaymentSummaryRow,
) {
  const approvedPaymentsAmount = roundCurrency(paymentSummary.approved_amount ?? 0);
  const pendingPaymentsAmount = roundCurrency(paymentSummary.pending_amount ?? 0);
  const rejectedPaymentsAmount = roundCurrency(paymentSummary.rejected_amount ?? 0);
  const outstandingAmount = roundCurrency(
    Math.max(statement.billing_statement_total_amount - approvedPaymentsAmount, 0),
  );
  const availableToSubmitAmount = roundCurrency(
    Math.max(statement.billing_statement_total_amount - approvedPaymentsAmount - pendingPaymentsAmount, 0),
  );
  const daysUntilDue = getDaysUntilDue(statement.billing_statement_due_date);
  const isOverdue = outstandingAmount > 0 && daysUntilDue !== null && daysUntilDue < 0;
  const isDueSoon =
    outstandingAmount > 0 && daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 3;

  return {
    statementId: statement.billing_statement_id,
    statementNumber: statement.billing_statement_number,
    cycleId: statement.billing_statement_cycle_id,
    roomId: statement.billing_statement_room_id,
    roomName: statement.room_name,
    roomStatus: statement.room_status,
    tenantId: statement.billing_statement_tenant_id,
    tenantName: statement.tenant_name,
    tenantEmail: statement.tenant_email,
    deviceId: statement.billing_statement_device_id,
    deviceName: statement.device_name,
    deviceIdentifier: statement.device_identifier,
    periodStart: statement.billing_statement_period_start,
    periodEnd: statement.billing_statement_period_end,
    status: statement.billing_statement_status,
    openingReadingId: statement.billing_statement_opening_reading_header_id,
    closingReadingId: statement.billing_statement_closing_reading_header_id,
    openingEnergyKwh: statement.billing_statement_opening_energy_kwh,
    closingEnergyKwh: statement.billing_statement_closing_energy_kwh,
    billedKwh: statement.billing_statement_billed_kwh,
    ratePerKwhSnapshot: statement.billing_statement_rate_per_kwh_snapshot,
    subtotalAmount: statement.billing_statement_subtotal_amount,
    adjustmentsAmount: statement.billing_statement_adjustments_amount,
    totalAmount: statement.billing_statement_total_amount,
    approvedPaymentsAmount,
    pendingPaymentsAmount,
    rejectedPaymentsAmount,
    outstandingAmount,
    availableToSubmitAmount,
    paymentCount: paymentSummary.payment_count,
    receiptCount: paymentSummary.receipt_count,
    daysUntilDue,
    isDueSoon,
    isOverdue,
    dueDate: statement.billing_statement_due_date,
    issuedAt: statement.billing_statement_issued_at,
    notes: statement.billing_statement_notes,
    createdAt: statement.created_at,
    updatedAt: statement.updated_at,
    items: items.map((item) => ({
      itemId: item.billing_statement_item_id,
      label: item.billing_statement_item_label,
      description: item.billing_statement_item_description,
      quantity: item.billing_statement_item_quantity,
      unit: item.billing_statement_item_unit,
      unitAmount: item.billing_statement_item_unit_amount,
      totalAmount: item.billing_statement_item_total_amount,
      sortOrder: item.billing_statement_item_sort_order,
    })),
  };
}

function buildBillingPaymentPayload(payment: BillingPaymentRow) {
  return {
    paymentId: payment.billing_payment_id,
    statementId: payment.billing_payment_statement_id,
    statementNumber: payment.statement_number,
    statementStatus: payment.statement_status,
    statementTotalAmount: payment.statement_total_amount,
    statementDueDate: payment.statement_due_date,
    roomId: payment.room_id,
    roomName: payment.room_name,
    tenantId: payment.billing_payment_tenant_id,
    tenantName: payment.tenant_name,
    landlordId: payment.billing_payment_landlord_id,
    landlordName: payment.landlord_name,
    amount: payment.billing_payment_amount,
    paymentMethod: payment.billing_payment_method,
    referenceNumber: payment.billing_payment_reference_number,
    notes: payment.billing_payment_notes,
    status: payment.billing_payment_status,
    rejectionReason: payment.billing_payment_rejection_reason,
    submittedAt: payment.billing_payment_submitted_at,
    verifiedAt: payment.billing_payment_verified_at,
    verifiedByUserId: payment.billing_payment_verified_by_user_id,
    verifiedByName: payment.verified_by_name,
    receiptId: payment.receipt_id,
    receiptNumber: payment.receipt_number,
    receiptIssuedAt: payment.receipt_issued_at,
  };
}

function buildBillingReceiptPayload(receipt: BillingReceiptRow) {
  return {
    receiptId: receipt.billing_receipt_id,
    paymentId: receipt.billing_receipt_payment_id,
    statementId: receipt.billing_receipt_statement_id,
    statementNumber: receipt.statement_number,
    roomId: receipt.room_id,
    roomName: receipt.room_name,
    tenantId: receipt.billing_receipt_tenant_id,
    tenantName: receipt.tenant_name,
    landlordId: receipt.billing_receipt_landlord_id,
    landlordName: receipt.landlord_name,
    receiptNumber: receipt.billing_receipt_number,
    amount: receipt.billing_receipt_amount,
    notes: receipt.billing_receipt_notes,
    paymentMethod: receipt.payment_method,
    referenceNumber: receipt.payment_reference_number,
    issuedAt: receipt.billing_receipt_issued_at,
    createdAt: receipt.created_at,
  };
}

async function mapBillingCycles(rows: BillingCycleRow[]) {
  return Promise.all(
    rows.map(async (cycle) => {
      const latestReading = await getLatestReadingSnapshot(cycle.billing_cycle_room_id);
      const lockedClosingReading =
        cycle.billing_cycle_status === 'open'
          ? null
          : await getReadingSnapshotById(
              cycle.billing_cycle_room_id,
              cycle.billing_cycle_closing_reading_header_id,
            );
      return buildBillingCyclePayload(cycle, latestReading, lockedClosingReading);
    }),
  );
}

async function mapBillingStatements(rows: BillingStatementRow[]) {
  return Promise.all(
    rows.map(async (statement) =>
      buildBillingStatementPayload(
        statement,
        await getBillingStatementItems(statement.billing_statement_id),
        await getStatementPaymentSummary(statement.billing_statement_id),
      )),
  );
}

function mapBillingPayments(rows: BillingPaymentRow[]) {
  return rows.map(buildBillingPaymentPayload);
}

function mapBillingReceipts(rows: BillingReceiptRow[]) {
  return rows.map(buildBillingReceiptPayload);
}

async function listOpenBillingCycleRowsForLandlord(landlordId: number) {
  const [rows] = await pool.query<BillingCycleRow[]>(
    `
      SELECT
        cycle.*,
        room.room_name,
        room.room_status,
        tenant.user_name AS tenant_name,
        tenant.user_email AS tenant_email,
        device.device_name,
        device.device_identifier
      FROM tblbilling_cycles cycle
      INNER JOIN tblrooms room ON room.room_id = cycle.billing_cycle_room_id
      LEFT JOIN tblusers tenant ON tenant.user_id = cycle.billing_cycle_tenant_id
      LEFT JOIN tbldevices device ON device.device_id = cycle.billing_cycle_device_id
      WHERE cycle.billing_cycle_landlord_id = ?
        AND cycle.billing_cycle_status = 'open'
      ORDER BY cycle.created_at DESC, room.room_name
    `,
    [landlordId],
  );

  return rows;
}

async function listOpenBillingCycleRowsForTenant(tenantId: number) {
  const [rows] = await pool.query<BillingCycleRow[]>(
    `
      SELECT
        cycle.*,
        room.room_name,
        room.room_status,
        tenant.user_name AS tenant_name,
        tenant.user_email AS tenant_email,
        device.device_name,
        device.device_identifier
      FROM tblbilling_cycles cycle
      INNER JOIN tblrooms room ON room.room_id = cycle.billing_cycle_room_id
      LEFT JOIN tblusers tenant ON tenant.user_id = cycle.billing_cycle_tenant_id
      LEFT JOIN tbldevices device ON device.device_id = cycle.billing_cycle_device_id
      WHERE cycle.billing_cycle_tenant_id = ?
        AND cycle.billing_cycle_status = 'open'
      ORDER BY cycle.created_at DESC, room.room_name
    `,
    [tenantId],
  );

  return rows;
}

async function listClosedCycleRowsReadyForStatementForLandlord(landlordId: number) {
  const [rows] = await pool.query<BillingCycleRow[]>(
    `
      SELECT
        cycle.*,
        room.room_name,
        room.room_status,
        tenant.user_name AS tenant_name,
        tenant.user_email AS tenant_email,
        device.device_name,
        device.device_identifier
      FROM tblbilling_cycles cycle
      INNER JOIN tblrooms room ON room.room_id = cycle.billing_cycle_room_id
      LEFT JOIN tblusers tenant ON tenant.user_id = cycle.billing_cycle_tenant_id
      LEFT JOIN tbldevices device ON device.device_id = cycle.billing_cycle_device_id
      LEFT JOIN tblbilling_statements statement
        ON statement.billing_statement_cycle_id = cycle.billing_cycle_id
      WHERE cycle.billing_cycle_landlord_id = ?
        AND cycle.billing_cycle_status = 'closed'
        AND statement.billing_statement_id IS NULL
      ORDER BY cycle.billing_cycle_closed_at DESC, room.room_name
    `,
    [landlordId],
  );

  return rows;
}

async function listBillingStatementRowsForLandlord(landlordId: number) {
  const [rows] = await pool.query<BillingStatementRow[]>(
    `
      SELECT
        statement.*,
        room.room_name,
        room.room_status,
        tenant.user_name AS tenant_name,
        tenant.user_email AS tenant_email,
        device.device_name,
        device.device_identifier
      FROM tblbilling_statements statement
      INNER JOIN tblrooms room ON room.room_id = statement.billing_statement_room_id
      LEFT JOIN tblusers tenant ON tenant.user_id = statement.billing_statement_tenant_id
      LEFT JOIN tbldevices device ON device.device_id = statement.billing_statement_device_id
      WHERE statement.billing_statement_landlord_id = ?
        AND statement.billing_statement_status <> 'void'
      ORDER BY statement.created_at DESC, room.room_name
    `,
    [landlordId],
  );

  return rows;
}

async function listBillingStatementRowsForTenant(tenantId: number) {
  const [rows] = await pool.query<BillingStatementRow[]>(
    `
      SELECT
        statement.*,
        room.room_name,
        room.room_status,
        tenant.user_name AS tenant_name,
        tenant.user_email AS tenant_email,
        device.device_name,
        device.device_identifier
      FROM tblbilling_statements statement
      INNER JOIN tblrooms room ON room.room_id = statement.billing_statement_room_id
      LEFT JOIN tblusers tenant ON tenant.user_id = statement.billing_statement_tenant_id
      LEFT JOIN tbldevices device ON device.device_id = statement.billing_statement_device_id
      WHERE statement.billing_statement_tenant_id = ?
        AND statement.billing_statement_status IN ('issued', 'partially_paid', 'paid')
      ORDER BY COALESCE(statement.billing_statement_issued_at, statement.created_at) DESC
    `,
    [tenantId],
  );

  return rows;
}

async function listBillingPaymentRowsForTenant(tenantId: number) {
  const [rows] = await pool.query<BillingPaymentRow[]>(
    `
      SELECT
        payment.*,
        statement.billing_statement_number AS statement_number,
        statement.billing_statement_status AS statement_status,
        statement.billing_statement_total_amount AS statement_total_amount,
        statement.billing_statement_due_date AS statement_due_date,
        room.room_id,
        room.room_name,
        tenant.user_name AS tenant_name,
        landlord.user_name AS landlord_name,
        verifier.user_name AS verified_by_name,
        receipt.billing_receipt_id AS receipt_id,
        receipt.billing_receipt_number AS receipt_number,
        receipt.billing_receipt_issued_at AS receipt_issued_at
      FROM tblbilling_payments payment
      INNER JOIN tblbilling_statements statement
        ON statement.billing_statement_id = payment.billing_payment_statement_id
      INNER JOIN tblrooms room ON room.room_id = statement.billing_statement_room_id
      LEFT JOIN tblusers tenant ON tenant.user_id = payment.billing_payment_tenant_id
      LEFT JOIN tblusers landlord ON landlord.user_id = payment.billing_payment_landlord_id
      LEFT JOIN tblusers verifier ON verifier.user_id = payment.billing_payment_verified_by_user_id
      LEFT JOIN tblbilling_receipts receipt
        ON receipt.billing_receipt_payment_id = payment.billing_payment_id
      WHERE payment.billing_payment_tenant_id = ?
      ORDER BY payment.billing_payment_submitted_at DESC, payment.billing_payment_id DESC
    `,
    [tenantId],
  );

  return rows;
}

async function listBillingPaymentRowsForLandlord(landlordId: number) {
  const [rows] = await pool.query<BillingPaymentRow[]>(
    `
      SELECT
        payment.*,
        statement.billing_statement_number AS statement_number,
        statement.billing_statement_status AS statement_status,
        statement.billing_statement_total_amount AS statement_total_amount,
        statement.billing_statement_due_date AS statement_due_date,
        room.room_id,
        room.room_name,
        tenant.user_name AS tenant_name,
        landlord.user_name AS landlord_name,
        verifier.user_name AS verified_by_name,
        receipt.billing_receipt_id AS receipt_id,
        receipt.billing_receipt_number AS receipt_number,
        receipt.billing_receipt_issued_at AS receipt_issued_at
      FROM tblbilling_payments payment
      INNER JOIN tblbilling_statements statement
        ON statement.billing_statement_id = payment.billing_payment_statement_id
      INNER JOIN tblrooms room ON room.room_id = statement.billing_statement_room_id
      LEFT JOIN tblusers tenant ON tenant.user_id = payment.billing_payment_tenant_id
      LEFT JOIN tblusers landlord ON landlord.user_id = payment.billing_payment_landlord_id
      LEFT JOIN tblusers verifier ON verifier.user_id = payment.billing_payment_verified_by_user_id
      LEFT JOIN tblbilling_receipts receipt
        ON receipt.billing_receipt_payment_id = payment.billing_payment_id
      WHERE payment.billing_payment_landlord_id = ?
      ORDER BY
        CASE payment.billing_payment_status
          WHEN 'pending' THEN 0
          WHEN 'approved' THEN 1
          ELSE 2
        END,
        payment.billing_payment_submitted_at DESC,
        payment.billing_payment_id DESC
    `,
    [landlordId],
  );

  return rows;
}

async function listBillingReceiptRowsForTenant(tenantId: number) {
  const [rows] = await pool.query<BillingReceiptRow[]>(
    `
      SELECT
        receipt.*,
        statement.billing_statement_number AS statement_number,
        room.room_id,
        room.room_name,
        tenant.user_name AS tenant_name,
        landlord.user_name AS landlord_name,
        payment.billing_payment_method AS payment_method,
        payment.billing_payment_reference_number AS payment_reference_number
      FROM tblbilling_receipts receipt
      INNER JOIN tblbilling_statements statement
        ON statement.billing_statement_id = receipt.billing_receipt_statement_id
      INNER JOIN tblrooms room ON room.room_id = statement.billing_statement_room_id
      LEFT JOIN tblusers tenant ON tenant.user_id = receipt.billing_receipt_tenant_id
      LEFT JOIN tblusers landlord ON landlord.user_id = receipt.billing_receipt_landlord_id
      LEFT JOIN tblbilling_payments payment
        ON payment.billing_payment_id = receipt.billing_receipt_payment_id
      WHERE receipt.billing_receipt_tenant_id = ?
      ORDER BY receipt.billing_receipt_issued_at DESC, receipt.billing_receipt_id DESC
    `,
    [tenantId],
  );

  return rows;
}

async function listBillingReceiptRowsForLandlord(landlordId: number) {
  const [rows] = await pool.query<BillingReceiptRow[]>(
    `
      SELECT
        receipt.*,
        statement.billing_statement_number AS statement_number,
        room.room_id,
        room.room_name,
        tenant.user_name AS tenant_name,
        landlord.user_name AS landlord_name,
        payment.billing_payment_method AS payment_method,
        payment.billing_payment_reference_number AS payment_reference_number
      FROM tblbilling_receipts receipt
      INNER JOIN tblbilling_statements statement
        ON statement.billing_statement_id = receipt.billing_receipt_statement_id
      INNER JOIN tblrooms room ON room.room_id = statement.billing_statement_room_id
      LEFT JOIN tblusers tenant ON tenant.user_id = receipt.billing_receipt_tenant_id
      LEFT JOIN tblusers landlord ON landlord.user_id = receipt.billing_receipt_landlord_id
      LEFT JOIN tblbilling_payments payment
        ON payment.billing_payment_id = receipt.billing_receipt_payment_id
      WHERE receipt.billing_receipt_landlord_id = ?
      ORDER BY receipt.billing_receipt_issued_at DESC, receipt.billing_receipt_id DESC
    `,
    [landlordId],
  );

  return rows;
}

export async function syncDueSoonAndOverdueNotificationsForTenant(tenantId: number) {
  const statementRows = await listBillingStatementRowsForTenant(tenantId);

  for (const statement of statementRows) {
    if (!['issued', 'partially_paid'].includes(statement.billing_statement_status)) {
      await clearNotificationsByReference({
        userId: tenantId,
        type: 'billing_due_soon',
        referenceType: 'billing_statement',
        referenceId: statement.billing_statement_id,
      });
      await clearNotificationsByReference({
        userId: tenantId,
        type: 'billing_overdue',
        referenceType: 'billing_statement',
        referenceId: statement.billing_statement_id,
      });
      continue;
    }

    const paymentSummary = await getStatementPaymentSummary(statement.billing_statement_id);
    const approvedAmount = roundCurrency(paymentSummary.approved_amount ?? 0);
    const outstandingAmount = roundCurrency(
      Math.max(statement.billing_statement_total_amount - approvedAmount, 0),
    );

    if (!statement.billing_statement_due_date || outstandingAmount <= 0) {
      await clearNotificationsByReference({
        userId: tenantId,
        type: 'billing_due_soon',
        referenceType: 'billing_statement',
        referenceId: statement.billing_statement_id,
      });
      await clearNotificationsByReference({
        userId: tenantId,
        type: 'billing_overdue',
        referenceType: 'billing_statement',
        referenceId: statement.billing_statement_id,
      });
      continue;
    }

    const daysUntilDue = getDaysUntilDue(statement.billing_statement_due_date);

    if (daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 3) {
      await clearNotificationsByReference({
        userId: tenantId,
        type: 'billing_overdue',
        referenceType: 'billing_statement',
        referenceId: statement.billing_statement_id,
      });
      await createNotificationIfMissing({
        userId: tenantId,
        type: 'billing_due_soon',
        title: 'Bill due soon',
        message: `Your bill for ${statement.room_name} is due on ${formatDateLabel(statement.billing_statement_due_date)}. Outstanding balance: PHP ${outstandingAmount.toFixed(2)}.`,
        referenceType: 'billing_statement',
        referenceId: statement.billing_statement_id,
        actionPath: '/(app)/billing',
      });
      continue;
    }

    if (daysUntilDue !== null && daysUntilDue < 0) {
      await clearNotificationsByReference({
        userId: tenantId,
        type: 'billing_due_soon',
        referenceType: 'billing_statement',
        referenceId: statement.billing_statement_id,
      });
      await createNotificationIfMissing({
        userId: tenantId,
        type: 'billing_overdue',
        title: 'Bill overdue',
        message: `Your bill for ${statement.room_name} is overdue since ${formatDateLabel(statement.billing_statement_due_date)}. Outstanding balance: PHP ${outstandingAmount.toFixed(2)}.`,
        referenceType: 'billing_statement',
        referenceId: statement.billing_statement_id,
        actionPath: '/(app)/billing',
      });
      continue;
    }

    await clearNotificationsByReference({
      userId: tenantId,
      type: 'billing_due_soon',
      referenceType: 'billing_statement',
      referenceId: statement.billing_statement_id,
    });
    await clearNotificationsByReference({
      userId: tenantId,
      type: 'billing_overdue',
      referenceType: 'billing_statement',
      referenceId: statement.billing_statement_id,
    });
  }
}

async function getRoomsWithoutOpenCycleCountForLandlord(landlordId: number) {
  const [rows] = await pool.query<CountRow[]>(
    `
      SELECT COUNT(*) AS total
      FROM tblrooms room
      LEFT JOIN tblbilling_cycles cycle
        ON cycle.billing_cycle_room_id = room.room_id
        AND cycle.billing_cycle_status = 'open'
      WHERE room.room_landlord_id = ?
        AND room.room_tenant_id IS NOT NULL
        AND room.room_device_id IS NOT NULL
        AND cycle.billing_cycle_id IS NULL
    `,
    [landlordId],
  );

  return rows[0]?.total ?? 0;
}

async function syncStatementStatusForConnection(
  connection: { query: (...args: any[]) => Promise<any> },
  statementId: number,
) {
  const [statementRows] = await connection.query(
    `
      SELECT
        billing_statement_total_amount,
        billing_statement_status
      FROM tblbilling_statements
      WHERE billing_statement_id = ?
      LIMIT 1
    `,
    [statementId],
  );
  const statementRow = (statementRows as Array<RowDataPacket & {
    billing_statement_total_amount: number;
    billing_statement_status: string;
  }>)[0];

  if (!statementRow) {
    throw new AppError(404, 'Billing statement not found.');
  }

  if (statementRow.billing_statement_status === 'draft' || statementRow.billing_statement_status === 'void') {
    return statementRow.billing_statement_status;
  }

  const [paymentRows] = await connection.query(
    `
      SELECT
        COALESCE(SUM(CASE WHEN billing_payment_status = 'approved' THEN billing_payment_amount ELSE 0 END), 0) AS approved_amount
      FROM tblbilling_payments
      WHERE billing_payment_statement_id = ?
    `,
    [statementId],
  );
  const approvedAmount = Number(
    ((paymentRows as Array<RowDataPacket & { approved_amount: number | null }>)[0]?.approved_amount ?? 0),
  );
  const nextStatus =
    approvedAmount >= statementRow.billing_statement_total_amount
      ? 'paid'
      : approvedAmount > 0
        ? 'partially_paid'
        : 'issued';

  await connection.query(
    `
      UPDATE tblbilling_statements
      SET billing_statement_status = ?
      WHERE billing_statement_id = ?
    `,
    [nextStatus, statementId],
  );

  return nextStatus;
}

export async function assertRoomHasNoOpenBillingCycle(
  roomId: number,
  message = 'This room has an open billing cycle. Close the cycle before changing tenant, device, landlord, or occupancy.',
) {
  const openCycle = await getOpenBillingCycleByRoomId(roomId);

  if (openCycle) {
    throw new AppError(409, message);
  }
}

export async function openLandlordBillingCycle(
  user: AuthenticatedUser,
  input: {
    room_id: number;
    period_start?: string;
    period_end?: string;
  },
) {
  await assertRoomAccess(user, input.room_id);
  const room = await getRoomBillingContext(input.room_id);
  const resolvedPeriod =
    input.period_start && input.period_end
      ? {
          periodStart: input.period_start,
          periodEnd: input.period_end,
        }
      : resolveAutoBillingPeriod();

  if (room.landlord_id !== user.userId) {
    throw new AppError(403, 'You are not allowed to create a billing cycle for this room.');
  }

  if (room.room_status !== 'occupied') {
    throw new AppError(409, 'Only occupied rooms can open a billing cycle.');
  }

  if (room.tenant_id === null || room.tenant_name === null) {
    throw new AppError(409, 'Assign a tenant before opening a billing cycle.');
  }

  if (room.device_id === null || room.device_identifier === null) {
    throw new AppError(409, 'Assign a device before opening a billing cycle.');
  }

  const latestReading = await getLatestReadingSnapshot(input.room_id);

  if (!latestReading) {
    throw new AppError(409, 'This room needs at least one reading before a billing cycle can begin.');
  }

  await assertNoOverlappingBillingCycle(
    input.room_id,
    resolvedPeriod.periodStart,
    resolvedPeriod.periodEnd,
  );

  const cycleId = await withTransaction(async (connection) => {
    const [openCycleRows] = await connection.query<CountRow[]>(
      `
        SELECT COUNT(*) AS total
        FROM tblbilling_cycles
        WHERE billing_cycle_room_id = ?
          AND billing_cycle_status = 'open'
      `,
      [input.room_id],
    );

    if ((openCycleRows[0]?.total ?? 0) > 0) {
      throw new AppError(409, 'This room already has an active billing cycle.');
    }

    const [overlapRows] = await connection.query<CountRow[]>(
      `
        SELECT COUNT(*) AS total
        FROM tblbilling_cycles
        WHERE billing_cycle_room_id = ?
          AND billing_cycle_status <> 'cancelled'
          AND billing_cycle_period_start <= ?
          AND billing_cycle_period_end >= ?
      `,
      [input.room_id, resolvedPeriod.periodEnd, resolvedPeriod.periodStart],
    );

    if ((overlapRows[0]?.total ?? 0) > 0) {
      throw new AppError(
        409,
        'This room already has a billing cycle that overlaps the selected period.',
      );
    }

    const [result] = await connection.query<ResultSetHeader>(
      `
        INSERT INTO tblbilling_cycles (
          billing_cycle_room_id,
          billing_cycle_tenant_id,
          billing_cycle_landlord_id,
          billing_cycle_device_id,
          billing_cycle_period_start,
          billing_cycle_period_end,
          billing_cycle_opening_reading_header_id,
          billing_cycle_opening_energy_kwh,
          billing_cycle_rate_per_kwh_snapshot,
          created_by_user_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        room.room_id,
        room.tenant_id,
        room.landlord_id,
        room.device_id,
        resolvedPeriod.periodStart,
        resolvedPeriod.periodEnd,
        latestReading.readingId,
        latestReading.energyKwh,
        room.room_rate_per_kwh,
        user.userId,
      ],
    );

    return result.insertId;
  });

  return getLandlordBillingCycleDetail(user, cycleId);
}

export async function closeLandlordBillingCycle(
  user: AuthenticatedUser,
  cycleId: number,
  input?: { open_next_cycle?: boolean },
) {
  const cycle = await getBillingCycleRowById(cycleId);

  if (!cycle || cycle.billing_cycle_landlord_id !== user.userId) {
    throw new AppError(404, 'Billing cycle not found.');
  }

  if (cycle.billing_cycle_status !== 'open') {
    throw new AppError(409, 'Only active billing cycles can be closed.');
  }

  const latestReading = await getLatestReadingSnapshot(cycle.billing_cycle_room_id);

  if (!latestReading) {
    throw new AppError(409, 'No closing reading is available for this billing cycle.');
  }

  const todayDate = formatDateOnly(new Date());

  if (todayDate < cycle.billing_cycle_period_end) {
    throw new AppError(
      409,
      `This cycle can only be closed on or after ${cycle.billing_cycle_period_end}.`,
    );
  }

  const latestReadingDate = latestReading.timestamp.slice(0, 10);

  if (latestReadingDate < cycle.billing_cycle_period_end) {
    throw new AppError(
      409,
      'Wait for a reading on or after the cycle end date before closing this billing cycle.',
    );
  }

  if (latestReading.readingId < cycle.billing_cycle_opening_reading_header_id) {
    throw new AppError(409, 'Latest reading is older than the billing cycle opening snapshot.');
  }

  if (latestReading.energyKwh < cycle.billing_cycle_opening_energy_kwh) {
    throw new AppError(
      409,
      'The latest cumulative energy reading is lower than the opening snapshot. Please review this room manually before closing the cycle.',
    );
  }

  await withTransaction(async (connection) => {
    await connection.query(
      `
        UPDATE tblbilling_cycles
        SET
          billing_cycle_closing_reading_header_id = ?,
          billing_cycle_closing_energy_kwh = ?,
          billing_cycle_status = 'closed',
          billing_cycle_closed_at = NOW()
        WHERE billing_cycle_id = ?
          AND billing_cycle_landlord_id = ?
          AND billing_cycle_status = 'open'
      `,
      [latestReading.readingId, latestReading.energyKwh, cycleId, user.userId],
    );
  });

  const closedCycle = await getLandlordBillingCycleDetail(user, cycleId);

  if (!input?.open_next_cycle) {
    return {
      closedCycle,
      nextCycle: null,
    };
  }

  const nextPeriodStart = formatDateOnly(addDays(parseDateOnly(cycle.billing_cycle_period_end), 1));
  const nextCycle = await openLandlordBillingCycle(user, {
    room_id: cycle.billing_cycle_room_id,
    period_start: nextPeriodStart,
    period_end: addOneMonthInclusive(nextPeriodStart),
  });

  return {
    closedCycle,
    nextCycle,
  };
}

export async function updateLandlordBillingCycle(
  user: AuthenticatedUser,
  cycleId: number,
  input: { period_end: string },
) {
  const cycle = await getBillingCycleRowById(cycleId);

  if (!cycle || cycle.billing_cycle_landlord_id !== user.userId) {
    throw new AppError(404, 'Billing cycle not found.');
  }

  if (cycle.billing_cycle_status !== 'open') {
    throw new AppError(409, 'Only active billing cycles can be updated.');
  }

  if (input.period_end < cycle.billing_cycle_period_start) {
    throw new AppError(400, 'Cycle end date must be on or after the cycle start date.');
  }

  await assertNoOverlappingBillingCycleExcludingSelf(
    cycle.billing_cycle_room_id,
    cycle.billing_cycle_period_start,
    input.period_end,
    cycleId,
  );

  await pool.query(
    `
      UPDATE tblbilling_cycles
      SET billing_cycle_period_end = ?
      WHERE billing_cycle_id = ?
        AND billing_cycle_landlord_id = ?
        AND billing_cycle_status = 'open'
    `,
    [input.period_end, cycleId, user.userId],
  );

  return getLandlordBillingCycleDetail(user, cycleId);
}

export async function getLandlordBillingCycleDetail(user: AuthenticatedUser, cycleId: number) {
  const cycle = await getBillingCycleRowById(cycleId);

  if (!cycle || cycle.billing_cycle_landlord_id !== user.userId) {
    throw new AppError(404, 'Billing cycle not found.');
  }

  const latestReading = await getLatestReadingSnapshot(cycle.billing_cycle_room_id);
  const lockedClosingReading =
    cycle.billing_cycle_status === 'open'
      ? null
      : await getReadingSnapshotById(
          cycle.billing_cycle_room_id,
          cycle.billing_cycle_closing_reading_header_id,
        );

  return buildBillingCyclePayload(cycle, latestReading, lockedClosingReading);
}

export async function listLandlordCurrentBillingCycles(user: AuthenticatedUser) {
  const openCycleRows = await listOpenBillingCycleRowsForLandlord(user.userId);
  const cycles = await mapBillingCycles(openCycleRows);
  const ownedRoomIds = await getLandlordRoomIds(user.userId);

  return {
    summary: {
      ownedRooms: ownedRoomIds.length,
      openCycles: cycles.length,
      roomsWithoutOpenCycle: await getRoomsWithoutOpenCycleCountForLandlord(user.userId),
      totalCycleToDateKwh: roundEnergy(
        cycles.reduce((sum, cycle) => sum + cycle.cycleToDateKwh, 0),
      ),
      totalProjectedCurrentBill: roundCurrency(
        cycles.reduce((sum, cycle) => sum + cycle.projectedCurrentBill, 0),
      ),
    },
    cycles,
  };
}

export async function generateLandlordBillingStatementDraft(
  user: AuthenticatedUser,
  cycleId: number,
) {
  const cycle = await getBillingCycleRowById(cycleId);

  if (!cycle || cycle.billing_cycle_landlord_id !== user.userId) {
    throw new AppError(404, 'Billing cycle not found.');
  }

  if (cycle.billing_cycle_status !== 'closed') {
    throw new AppError(
      409,
      'Only closed billing cycles can be turned into a draft statement.',
    );
  }

  const existingStatement = await getBillingStatementForCycle(cycleId);

  if (existingStatement) {
    throw new AppError(409, 'This billing cycle already has a generated statement.');
  }

  const amounts = buildStatementAmounts(cycle);

  const statementId = await withTransaction(async (connection) => {
    const [insertResult] = await connection.query<ResultSetHeader>(
      `
        INSERT INTO tblbilling_statements (
          billing_statement_cycle_id,
          billing_statement_room_id,
          billing_statement_tenant_id,
          billing_statement_landlord_id,
          billing_statement_device_id,
          billing_statement_period_start,
          billing_statement_period_end,
          billing_statement_opening_reading_header_id,
          billing_statement_closing_reading_header_id,
          billing_statement_opening_energy_kwh,
          billing_statement_closing_energy_kwh,
          billing_statement_billed_kwh,
          billing_statement_rate_per_kwh_snapshot,
          billing_statement_subtotal_amount,
          billing_statement_adjustments_amount,
          billing_statement_total_amount,
          created_by_user_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        cycle.billing_cycle_id,
        cycle.billing_cycle_room_id,
        cycle.billing_cycle_tenant_id,
        cycle.billing_cycle_landlord_id,
        cycle.billing_cycle_device_id,
        cycle.billing_cycle_period_start,
        cycle.billing_cycle_period_end,
        cycle.billing_cycle_opening_reading_header_id,
        cycle.billing_cycle_closing_reading_header_id,
        cycle.billing_cycle_opening_energy_kwh,
        cycle.billing_cycle_closing_energy_kwh,
        amounts.billedKwh,
        cycle.billing_cycle_rate_per_kwh_snapshot,
        amounts.subtotalAmount,
        amounts.adjustmentsAmount,
        amounts.totalAmount,
        user.userId,
      ],
    );

    await connection.query(
      `
        INSERT INTO tblbilling_statement_items (
          billing_statement_item_statement_id,
          billing_statement_item_label,
          billing_statement_item_description,
          billing_statement_item_quantity,
          billing_statement_item_unit,
          billing_statement_item_unit_amount,
          billing_statement_item_total_amount,
          billing_statement_item_sort_order
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        insertResult.insertId,
        'Electricity consumption',
        `Measured room usage from ${formatDateLabel(cycle.billing_cycle_period_start)} to ${formatDateLabel(cycle.billing_cycle_period_end)}.`,
        amounts.billedKwh,
        'kWh',
        cycle.billing_cycle_rate_per_kwh_snapshot,
        amounts.subtotalAmount,
        1,
      ],
    );

    return insertResult.insertId;
  });

  return getLandlordBillingStatementDetail(user, statementId);
}

export async function issueLandlordBillingStatement(
  user: AuthenticatedUser,
  statementId: number,
  input?: { due_date?: string },
) {
  const statement = await getBillingStatementRowById(statementId);

  if (!statement || statement.billing_statement_landlord_id !== user.userId) {
    throw new AppError(404, 'Billing statement not found.');
  }

  if (statement.billing_statement_status !== 'draft') {
    throw new AppError(409, 'Only draft statements can be issued.');
  }

  const dueDate = input?.due_date ?? getDefaultStatementDueDate();
  const todayDate = formatDateOnly(new Date());

  if (dueDate < todayDate) {
    throw new AppError(400, 'Due date must be today or later.');
  }

  await withTransaction(async (connection) => {
    const statementNumber =
      statement.billing_statement_number ?? getStatementNumber(statementId, todayDate);

    await connection.query(
      `
        UPDATE tblbilling_statements
        SET
          billing_statement_status = 'issued',
          billing_statement_number = ?,
          billing_statement_due_date = ?,
          billing_statement_issued_at = NOW()
        WHERE billing_statement_id = ?
          AND billing_statement_landlord_id = ?
          AND billing_statement_status = 'draft'
      `,
      [statementNumber, dueDate, statementId, user.userId],
    );

    await connection.query(
      `
        UPDATE tblbilling_cycles
        SET billing_cycle_status = 'statement_issued'
        WHERE billing_cycle_id = ?
          AND billing_cycle_landlord_id = ?
      `,
      [statement.billing_statement_cycle_id, user.userId],
    );

      await createNotification(
        {
          userId: statement.billing_statement_tenant_id,
          type: 'billing_statement_issued',
          title: 'New bill issued',
          message: `Your electricity bill for ${statement.room_name} covering ${formatDateLabel(statement.billing_statement_period_start)} to ${formatDateLabel(statement.billing_statement_period_end)} is now available. Total due: PHP ${statement.billing_statement_total_amount.toFixed(2)}. Due date: ${formatDateLabel(dueDate)}.`,
          referenceType: 'billing_statement',
          referenceId: statementId,
          actionPath: '/(app)/billing',
        },
        connection as { query: <T = unknown>(sql: string, values?: unknown[]) => Promise<[T, unknown]> },
      );
    });

  return getLandlordBillingStatementDetail(user, statementId);
}

export async function getLandlordBillingStatementDetail(user: AuthenticatedUser, statementId: number) {
  const statement = await getBillingStatementRowById(statementId);

  if (!statement || statement.billing_statement_landlord_id !== user.userId) {
    throw new AppError(404, 'Billing statement not found.');
  }

  return buildBillingStatementPayload(
    statement,
    await getBillingStatementItems(statement.billing_statement_id),
    await getStatementPaymentSummary(statement.billing_statement_id),
  );
}

export async function submitTenantBillingPayment(
  user: AuthenticatedUser,
  statementId: number,
  input: {
    amount: number;
    payment_method: string;
    reference_number?: string;
    notes?: string;
  },
) {
  const statement = await getBillingStatementRowById(statementId);

  if (!statement || statement.billing_statement_tenant_id !== user.userId) {
    throw new AppError(404, 'Billing statement not found.');
  }

  if (!['issued', 'partially_paid'].includes(statement.billing_statement_status)) {
    throw new AppError(409, 'This statement is not currently accepting payments.');
  }

  const paymentSummary = await getStatementPaymentSummary(statementId);
  const approvedAmount = roundCurrency(paymentSummary.approved_amount ?? 0);
  const pendingAmount = roundCurrency(paymentSummary.pending_amount ?? 0);
  const availableToSubmitAmount = roundCurrency(
    Math.max(statement.billing_statement_total_amount - approvedAmount - pendingAmount, 0),
  );

  if (availableToSubmitAmount <= 0) {
    throw new AppError(
      409,
      'This bill already has enough approved or pending payments recorded.',
    );
  }

  if (input.amount > availableToSubmitAmount) {
    throw new AppError(
      409,
      `Payment amount cannot exceed the remaining unpaid balance of PHP ${availableToSubmitAmount.toFixed(2)}.`,
    );
  }

  const paymentId = await withTransaction(async (connection) => {
    const [insertResult] = await connection.query<ResultSetHeader>(
      `
        INSERT INTO tblbilling_payments (
          billing_payment_statement_id,
          billing_payment_tenant_id,
          billing_payment_landlord_id,
          billing_payment_amount,
          billing_payment_method,
          billing_payment_reference_number,
          billing_payment_notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        statement.billing_statement_id,
        statement.billing_statement_tenant_id,
        statement.billing_statement_landlord_id,
        roundCurrency(input.amount),
        input.payment_method,
        normalizeOptionalText(input.reference_number),
        normalizeOptionalText(input.notes),
      ],
    );

    await createNotification(
      {
        userId: statement.billing_statement_landlord_id,
        type: 'billing_payment_submitted',
        title: 'New payment submitted',
        message: `${statement.tenant_name ?? 'A tenant'} submitted a ${input.payment_method.replace(/_/g, ' ')} payment of PHP ${roundCurrency(input.amount).toFixed(2)} for ${statement.room_name}.`,
        referenceType: 'billing_payment',
        referenceId: insertResult.insertId,
        actionPath: '/(app)/landlord-billing',
      },
      connection as { query: <T = unknown>(sql: string, values?: unknown[]) => Promise<[T, unknown]> },
    );

    return insertResult.insertId;
  });

  const payment = await getBillingPaymentRowById(paymentId);

  if (!payment) {
    throw new AppError(500, 'Payment was submitted but could not be loaded afterward.');
  }

  return buildBillingPaymentPayload(payment);
}

export async function verifyLandlordBillingPayment(
  user: AuthenticatedUser,
  paymentId: number,
  input: {
    action: 'approve' | 'reject';
    rejection_reason?: string;
  },
) {
  const payment = await getBillingPaymentRowById(paymentId);

  if (!payment || payment.billing_payment_landlord_id !== user.userId) {
    throw new AppError(404, 'Billing payment not found.');
  }

  if (payment.billing_payment_status !== 'pending') {
    throw new AppError(409, 'Only pending payments can be verified.');
  }

  await withTransaction(async (connection) => {
    if (input.action === 'approve') {
      await connection.query(
        `
          UPDATE tblbilling_payments
          SET
            billing_payment_status = 'approved',
            billing_payment_rejection_reason = NULL,
            billing_payment_verified_at = NOW(),
            billing_payment_verified_by_user_id = ?
          WHERE billing_payment_id = ?
            AND billing_payment_landlord_id = ?
            AND billing_payment_status = 'pending'
        `,
        [user.userId, paymentId, user.userId],
      );

      const receiptNumber = getReceiptNumber(paymentId, formatDateOnly(new Date()));

      await connection.query(
        `
          INSERT INTO tblbilling_receipts (
            billing_receipt_payment_id,
            billing_receipt_statement_id,
            billing_receipt_tenant_id,
            billing_receipt_landlord_id,
            billing_receipt_number,
            billing_receipt_amount,
            billing_receipt_notes,
            created_by_user_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          payment.billing_payment_id,
          payment.billing_payment_statement_id,
          payment.billing_payment_tenant_id,
          payment.billing_payment_landlord_id,
          receiptNumber,
          payment.billing_payment_amount,
          normalizeOptionalText(payment.billing_payment_notes),
          user.userId,
        ],
      );

      await syncStatementStatusForConnection(
        connection as { query: (...args: any[]) => Promise<any> },
        payment.billing_payment_statement_id,
      );

      await createNotification(
        {
          userId: payment.billing_payment_tenant_id,
          type: 'billing_payment_approved',
          title: 'Payment approved',
          message: `Your payment of PHP ${payment.billing_payment_amount.toFixed(2)} for ${payment.room_name} was approved. Receipt ${receiptNumber} is now available in your billing history.`,
          referenceType: 'billing_payment',
          referenceId: payment.billing_payment_id,
          actionPath: '/(app)/billing',
        },
        connection as { query: <T = unknown>(sql: string, values?: unknown[]) => Promise<[T, unknown]> },
      );
    } else {
      await connection.query(
        `
          UPDATE tblbilling_payments
          SET
            billing_payment_status = 'rejected',
            billing_payment_rejection_reason = ?,
            billing_payment_verified_at = NOW(),
            billing_payment_verified_by_user_id = ?
          WHERE billing_payment_id = ?
            AND billing_payment_landlord_id = ?
            AND billing_payment_status = 'pending'
        `,
        [
          normalizeOptionalText(input.rejection_reason),
          user.userId,
          paymentId,
          user.userId,
        ],
      );

      await syncStatementStatusForConnection(
        connection as { query: (...args: any[]) => Promise<any> },
        payment.billing_payment_statement_id,
      );

      await createNotification(
        {
          userId: payment.billing_payment_tenant_id,
          type: 'billing_payment_rejected',
          title: 'Payment rejected',
          message: `Your payment of PHP ${payment.billing_payment_amount.toFixed(2)} for ${payment.room_name} was rejected. Reason: ${normalizeOptionalText(input.rejection_reason) ?? 'Please contact your landlord for clarification.'}`,
          referenceType: 'billing_payment',
          referenceId: payment.billing_payment_id,
          actionPath: '/(app)/billing',
        },
        connection as { query: <T = unknown>(sql: string, values?: unknown[]) => Promise<[T, unknown]> },
      );
    }
  });

  const verifiedPayment = await getBillingPaymentRowById(paymentId);

  if (!verifiedPayment) {
    throw new AppError(500, 'Payment was updated but could not be loaded afterward.');
  }

  return buildBillingPaymentPayload(verifiedPayment);
}

export async function listLandlordBillingStatements(user: AuthenticatedUser) {
  const [readyCycleRows, statementRows, paymentRows, receiptRows] = await Promise.all([
    listClosedCycleRowsReadyForStatementForLandlord(user.userId),
    listBillingStatementRowsForLandlord(user.userId),
    listBillingPaymentRowsForLandlord(user.userId),
    listBillingReceiptRowsForLandlord(user.userId),
  ]);

  const readyCycles = await mapBillingCycles(readyCycleRows);
  const statements = await mapBillingStatements(statementRows);
  const payments = mapBillingPayments(paymentRows);
  const receipts = mapBillingReceipts(receiptRows);
  const pendingPayments = payments.filter((payment) => payment.status === 'pending');
  const dueSoonStatements = statements.filter((statement) => statement.isDueSoon);
  const overdueStatements = statements.filter((statement) => statement.isOverdue);

  return {
    summary: {
      readyCycles: readyCycles.length,
      draftStatements: statements.filter((statement) => statement.status === 'draft').length,
      issuedStatements: statements.filter((statement) =>
        ['issued', 'partially_paid', 'paid'].includes(statement.status)
      ).length,
      totalDraftAmount: roundCurrency(
        statements
          .filter((statement) => statement.status === 'draft')
          .reduce((sum, statement) => sum + statement.totalAmount, 0),
      ),
      totalIssuedAmount: roundCurrency(
        statements
          .filter((statement) => ['issued', 'partially_paid', 'paid'].includes(statement.status))
          .reduce((sum, statement) => sum + statement.totalAmount, 0),
      ),
      pendingPayments: pendingPayments.length,
      collectedAmount: roundCurrency(
        payments
          .filter((payment) => payment.status === 'approved')
          .reduce((sum, payment) => sum + payment.amount, 0),
      ),
      outstandingAmount: roundCurrency(
        statements.reduce((sum, statement) => sum + statement.outstandingAmount, 0),
      ),
      dueSoonStatements: dueSoonStatements.length,
      overdueStatements: overdueStatements.length,
      receiptsIssued: receipts.length,
    },
    readyCycles,
    statements,
    payments,
    receipts,
    pendingPayments,
    dueSoonStatements,
    overdueStatements,
  };
}

export async function getTenantCurrentBilling(user: AuthenticatedUser) {
  const assignedRoomIds = await getTenantRoomIds(user.userId);
  const [openCycleRows, statementRows, paymentRows, receiptRows] = await Promise.all([
    listOpenBillingCycleRowsForTenant(user.userId),
    listBillingStatementRowsForTenant(user.userId),
    listBillingPaymentRowsForTenant(user.userId),
    listBillingReceiptRowsForTenant(user.userId),
  ]);
  const cycles = await mapBillingCycles(openCycleRows);
  const statements = await mapBillingStatements(statementRows);
  const payments = mapBillingPayments(paymentRows);
  const receipts = mapBillingReceipts(receiptRows);

  return {
    summary: {
      assignedRooms: assignedRoomIds.length,
      activeCycles: cycles.length,
      roomsWithoutOpenCycle: Math.max(assignedRoomIds.length - cycles.length, 0),
      totalCycleToDateKwh: roundEnergy(
        cycles.reduce((sum, cycle) => sum + cycle.cycleToDateKwh, 0),
      ),
      totalProjectedCurrentBill: roundCurrency(
        cycles.reduce((sum, cycle) => sum + cycle.projectedCurrentBill, 0),
      ),
      issuedStatements: statements.length,
      totalOutstandingAmount: roundCurrency(
        statements.reduce((sum, statement) => sum + statement.outstandingAmount, 0),
      ),
      totalApprovedPayments: roundCurrency(
        payments
          .filter((payment) => payment.status === 'approved')
          .reduce((sum, payment) => sum + payment.amount, 0),
      ),
      pendingPayments: payments.filter((payment) => payment.status === 'pending').length,
      receiptsIssued: receipts.length,
    },
    cycles,
    statements,
    payments,
    receipts,
  };
}
