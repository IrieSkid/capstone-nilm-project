# Billing Module Design

This document defines a billing module that fits the current NILM data model and separates:

- live monitoring and estimates
- official issued bills
- payments, receipts, and billing notifications

The current `/landlord/billing` screen should be treated as a **billing estimate dashboard** until the module below is implemented.

## Core Billing Principles

1. Official billing must be based on **measured energy consumption**, not NILM appliance detection.
2. NILM appliance detection remains **informational only**.
3. A bill must be **frozen** once generated and issued.
4. The bill must remain transparent:
   - opening reading
   - closing reading
   - billed kWh
   - rate snapshot
   - itemized charges
   - payments
   - receipts
5. Bills must not change on every reload. Only **projected cycle usage** may change.

## Recommended Billing Model

Use 6 new tables:

- `tblbilling_cycles`
- `tblbilling_statements`
- `tblbilling_statement_items`
- `tblbilling_payments`
- `tblbilling_receipts`
- `tblnotifications`

## Exact Schema

```sql
CREATE TABLE tblbilling_cycles (
  billing_cycle_id INT PRIMARY KEY AUTO_INCREMENT,
  billing_cycle_room_id INT NOT NULL,
  billing_cycle_tenant_id INT NOT NULL,
  billing_cycle_landlord_id INT NOT NULL,
  billing_cycle_device_id INT NOT NULL,
  billing_cycle_period_start DATE NOT NULL,
  billing_cycle_period_end DATE NOT NULL,
  billing_cycle_opening_reading_header_id INT NOT NULL,
  billing_cycle_closing_reading_header_id INT NULL,
  billing_cycle_opening_energy_kwh DECIMAL(10, 4) NOT NULL,
  billing_cycle_closing_energy_kwh DECIMAL(10, 4) NULL,
  billing_cycle_status ENUM('open', 'closed', 'statement_issued', 'cancelled') NOT NULL DEFAULT 'open',
  billing_cycle_closed_at DATETIME NULL,
  created_by_user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_billing_cycles_room FOREIGN KEY (billing_cycle_room_id) REFERENCES tblrooms(room_id),
  CONSTRAINT fk_billing_cycles_tenant FOREIGN KEY (billing_cycle_tenant_id) REFERENCES tblusers(user_id),
  CONSTRAINT fk_billing_cycles_landlord FOREIGN KEY (billing_cycle_landlord_id) REFERENCES tblusers(user_id),
  CONSTRAINT fk_billing_cycles_device FOREIGN KEY (billing_cycle_device_id) REFERENCES tbldevices(device_id),
  CONSTRAINT fk_billing_cycles_opening_reading FOREIGN KEY (billing_cycle_opening_reading_header_id) REFERENCES tblreading_headers(reading_header_id),
  CONSTRAINT fk_billing_cycles_closing_reading FOREIGN KEY (billing_cycle_closing_reading_header_id) REFERENCES tblreading_headers(reading_header_id),
  CONSTRAINT fk_billing_cycles_created_by FOREIGN KEY (created_by_user_id) REFERENCES tblusers(user_id),
  CONSTRAINT uq_billing_cycle_room_period UNIQUE (billing_cycle_room_id, billing_cycle_period_start, billing_cycle_period_end)
);

CREATE TABLE tblbilling_statements (
  statement_id INT PRIMARY KEY AUTO_INCREMENT,
  statement_cycle_id INT NOT NULL UNIQUE,
  statement_room_id INT NOT NULL,
  statement_tenant_id INT NOT NULL,
  statement_landlord_id INT NOT NULL,
  statement_device_id INT NOT NULL,
  statement_number VARCHAR(40) NOT NULL UNIQUE,
  statement_period_start DATE NOT NULL,
  statement_period_end DATE NOT NULL,
  statement_opening_reading_header_id INT NOT NULL,
  statement_closing_reading_header_id INT NOT NULL,
  statement_opening_energy_kwh DECIMAL(10, 4) NOT NULL,
  statement_closing_energy_kwh DECIMAL(10, 4) NOT NULL,
  statement_billed_kwh DECIMAL(10, 4) NOT NULL,
  statement_rate_per_kwh_snapshot DECIMAL(10, 2) NOT NULL,
  statement_subtotal_amount DECIMAL(12, 2) NOT NULL,
  statement_adjustments_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  statement_penalties_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  statement_discounts_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  statement_total_amount DECIMAL(12, 2) NOT NULL,
  statement_amount_paid DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  statement_balance_due DECIMAL(12, 2) NOT NULL,
  statement_status ENUM('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void') NOT NULL DEFAULT 'draft',
  statement_issued_at DATETIME NULL,
  statement_due_at DATETIME NULL,
  statement_paid_at DATETIME NULL,
  generated_by_user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_statements_cycle FOREIGN KEY (statement_cycle_id) REFERENCES tblbilling_cycles(billing_cycle_id),
  CONSTRAINT fk_statements_room FOREIGN KEY (statement_room_id) REFERENCES tblrooms(room_id),
  CONSTRAINT fk_statements_tenant FOREIGN KEY (statement_tenant_id) REFERENCES tblusers(user_id),
  CONSTRAINT fk_statements_landlord FOREIGN KEY (statement_landlord_id) REFERENCES tblusers(user_id),
  CONSTRAINT fk_statements_device FOREIGN KEY (statement_device_id) REFERENCES tbldevices(device_id),
  CONSTRAINT fk_statements_opening_reading FOREIGN KEY (statement_opening_reading_header_id) REFERENCES tblreading_headers(reading_header_id),
  CONSTRAINT fk_statements_closing_reading FOREIGN KEY (statement_closing_reading_header_id) REFERENCES tblreading_headers(reading_header_id),
  CONSTRAINT fk_statements_generated_by FOREIGN KEY (generated_by_user_id) REFERENCES tblusers(user_id)
);

CREATE TABLE tblbilling_statement_items (
  statement_item_id INT PRIMARY KEY AUTO_INCREMENT,
  statement_item_statement_id INT NOT NULL,
  statement_item_type ENUM('energy_charge', 'adjustment', 'penalty', 'discount', 'previous_balance', 'other_fee') NOT NULL,
  statement_item_label VARCHAR(100) NOT NULL,
  statement_item_quantity DECIMAL(12, 4) NULL,
  statement_item_unit VARCHAR(20) NULL,
  statement_item_unit_price DECIMAL(12, 2) NULL,
  statement_item_amount DECIMAL(12, 2) NOT NULL,
  statement_item_notes VARCHAR(255) NULL,
  display_order INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_statement_items_statement FOREIGN KEY (statement_item_statement_id) REFERENCES tblbilling_statements(statement_id)
);

CREATE TABLE tblbilling_payments (
  payment_id INT PRIMARY KEY AUTO_INCREMENT,
  payment_statement_id INT NOT NULL,
  payment_tenant_id INT NOT NULL,
  payment_landlord_id INT NOT NULL,
  payment_amount DECIMAL(12, 2) NOT NULL,
  payment_method ENUM('cash', 'gcash', 'bank_transfer', 'manual', 'other') NOT NULL DEFAULT 'manual',
  payment_reference_number VARCHAR(100) NULL,
  payment_notes VARCHAR(255) NULL,
  payment_proof_url VARCHAR(255) NULL,
  payment_status ENUM('pending_verification', 'confirmed', 'rejected') NOT NULL DEFAULT 'pending_verification',
  payment_submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payment_verified_at DATETIME NULL,
  payment_verified_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payments_statement FOREIGN KEY (payment_statement_id) REFERENCES tblbilling_statements(statement_id),
  CONSTRAINT fk_payments_tenant FOREIGN KEY (payment_tenant_id) REFERENCES tblusers(user_id),
  CONSTRAINT fk_payments_landlord FOREIGN KEY (payment_landlord_id) REFERENCES tblusers(user_id),
  CONSTRAINT fk_payments_verified_by FOREIGN KEY (payment_verified_by_user_id) REFERENCES tblusers(user_id)
);

CREATE TABLE tblbilling_receipts (
  receipt_id INT PRIMARY KEY AUTO_INCREMENT,
  receipt_statement_id INT NOT NULL,
  receipt_payment_id INT NOT NULL UNIQUE,
  receipt_number VARCHAR(40) NOT NULL UNIQUE,
  receipt_amount DECIMAL(12, 2) NOT NULL,
  receipt_issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  receipt_issued_by_user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_receipts_statement FOREIGN KEY (receipt_statement_id) REFERENCES tblbilling_statements(statement_id),
  CONSTRAINT fk_receipts_payment FOREIGN KEY (receipt_payment_id) REFERENCES tblbilling_payments(payment_id),
  CONSTRAINT fk_receipts_issued_by FOREIGN KEY (receipt_issued_by_user_id) REFERENCES tblusers(user_id)
);

CREATE TABLE tblnotifications (
  notification_id INT PRIMARY KEY AUTO_INCREMENT,
  notification_user_id INT NOT NULL,
  notification_type ENUM(
    'bill_issued',
    'bill_due_soon',
    'bill_overdue',
    'payment_submitted',
    'payment_confirmed',
    'payment_rejected',
    'receipt_issued'
  ) NOT NULL,
  notification_title VARCHAR(100) NOT NULL,
  notification_message VARCHAR(255) NOT NULL,
  notification_related_statement_id INT NULL,
  notification_related_payment_id INT NULL,
  notification_is_read TINYINT(1) NOT NULL DEFAULT 0,
  notification_read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_user FOREIGN KEY (notification_user_id) REFERENCES tblusers(user_id),
  CONSTRAINT fk_notifications_statement FOREIGN KEY (notification_related_statement_id) REFERENCES tblbilling_statements(statement_id),
  CONSTRAINT fk_notifications_payment FOREIGN KEY (notification_related_payment_id) REFERENCES tblbilling_payments(payment_id)
);

CREATE INDEX idx_billing_cycles_room_status ON tblbilling_cycles (billing_cycle_room_id, billing_cycle_status);
CREATE INDEX idx_billing_cycles_tenant_status ON tblbilling_cycles (billing_cycle_tenant_id, billing_cycle_status);
CREATE INDEX idx_statements_tenant_status ON tblbilling_statements (statement_tenant_id, statement_status);
CREATE INDEX idx_statements_landlord_status ON tblbilling_statements (statement_landlord_id, statement_status);
CREATE INDEX idx_statements_due_at ON tblbilling_statements (statement_due_at);
CREATE INDEX idx_payments_statement_status ON tblbilling_payments (payment_statement_id, payment_status);
CREATE INDEX idx_notifications_user_read ON tblnotifications (notification_user_id, notification_is_read, created_at);
```

## Why This Fits The Current System

It plugs directly into the existing tables:

- `tblrooms`
- `tblusers`
- `tbldevices`
- `tblreading_headers`
- `tblreading_details`

The most important link is:

- `opening_reading_header_id`
- `closing_reading_header_id`

This makes bills auditable against actual stored meter snapshots.

## Billing Lifecycle

### 1. Open billing cycle

Landlord or admin opens a cycle for an occupied room.

Required:

- room must have `room_tenant_id`
- room must have `room_device_id`
- room must have at least one reading

Snapshot saved:

- room
- tenant
- landlord
- device
- opening reading header
- opening cumulative `energy_kwh`

### 2. Monitor current cycle

During the active cycle, the app shows:

- cycle start date
- latest reading date
- opening energy
- current latest energy
- cycle-to-date kWh
- projected current bill

This is a **projection**, not yet an official bill.

### 3. Close billing cycle

At cutoff:

- capture latest reading as closing snapshot
- freeze closing `energy_kwh`
- compute:
  - `billed_kwh = closing_energy_kwh - opening_energy_kwh`

### 4. Generate statement

Generate a draft statement from the closed cycle.

Freeze:

- room/tenant/landlord/device snapshot
- opening and closing reading IDs
- opening and closing energy values
- billed kWh
- rate per kWh snapshot
- subtotal
- itemized charges
- total

### 5. Issue statement

Once issued:

- statement becomes visible to tenant
- due date is set
- tenant receives notification
- totals no longer change automatically

### 6. Payment submission

Tenant submits payment:

- amount
- method
- reference number
- optional proof image later

Payment stays `pending_verification`.

### 7. Payment verification

Landlord or admin:

- confirms payment, or
- rejects payment

If confirmed:

- statement `amount_paid` and `balance_due` update
- statement status becomes `partially_paid` or `paid`
- receipt is created
- tenant gets notification

## Exact Computation Rules

### Official statement usage

```text
billed_kwh = statement_closing_energy_kwh - statement_opening_energy_kwh
```

### Energy charge

```text
energy_charge = billed_kwh * statement_rate_per_kwh_snapshot
```

### Total amount

```text
total_amount =
  subtotal_amount
  + adjustments_amount
  + penalties_amount
  - discounts_amount
```

### Balance due

```text
balance_due = total_amount - amount_paid
```

## Fairness Rules

1. **Official billing must not use NILM appliance estimates.**
2. Statement totals must use **stored meter snapshots** only.
3. Once issued, statement totals must not recalculate on reload.
4. If tenant changes mid-cycle:
   - close the current cycle first
   - issue the bill for the outgoing tenant
   - open a new cycle for the incoming tenant
5. If device changes mid-cycle:
   - close the current cycle first
   - issue the bill using the old device's final reading
   - open a new cycle for the replacement device
6. If cumulative `energy_kwh` resets or decreases:
   - do not auto-generate a bill
   - mark cycle for manual review

## API Design

These endpoints follow the current route structure:

- landlord routes stay under `/api/v1/landlord`
- tenant billing gets its own `/api/v1/tenant/billing`
- admin override gets `/api/v1/admin/billing`

## Landlord Billing Endpoints

### Overview and current cycle

- `GET /api/v1/landlord/billing/overview`
  - returns totals for owned rooms:
    - current cycle projections
    - issued unpaid statements
    - overdue count
    - paid this month

- `GET /api/v1/landlord/billing/current-cycles`
  - list current active cycles for owned rooms

- `GET /api/v1/landlord/billing/current-cycles/:id`
  - returns one cycle with:
    - opening reading
    - latest reading
    - projected cycle bill

### Cycle management

- `POST /api/v1/landlord/billing/cycles`
  - open a new billing cycle for one owned room

Request body:

```json
{
  "room_id": 1,
  "period_start": "2026-04-01",
  "period_end": "2026-04-30"
}
```

- `PATCH /api/v1/landlord/billing/cycles/:id/close`
  - closes the cycle using the latest reading

- `GET /api/v1/landlord/billing/cycles/:id`
  - cycle detail with snapshots and projection

### Statement management

- `POST /api/v1/landlord/billing/cycles/:id/statements`
  - create draft statement from a closed cycle

- `GET /api/v1/landlord/billing/statements`
  - list statements for owned rooms
  - filters:
    - `status`
    - `room_id`
    - `tenant_id`
    - `date_from`
    - `date_to`

- `GET /api/v1/landlord/billing/statements/:id`
  - one statement with items, payments, and receipts

- `POST /api/v1/landlord/billing/statements/:id/items`
  - add adjustment/discount/penalty/other fee item while statement is still `draft`

Request body:

```json
{
  "type": "other_fee",
  "label": "Water service charge",
  "quantity": 1,
  "unit": "fee",
  "unit_price": 150,
  "amount": 150,
  "notes": "Fixed monthly charge"
}
```

- `PATCH /api/v1/landlord/billing/statements/:id/issue`
  - issues the statement and sets due date

Request body:

```json
{
  "due_at": "2026-05-10T17:00:00+08:00"
}
```

- `PATCH /api/v1/landlord/billing/statements/:id/void`
  - voids a draft or issued statement before payment

### Payment verification

- `GET /api/v1/landlord/billing/payments`
  - list payment submissions for owned statements

- `PATCH /api/v1/landlord/billing/payments/:id/confirm`
  - confirms a payment and creates a receipt

- `PATCH /api/v1/landlord/billing/payments/:id/reject`
  - rejects a payment with a reason

Request body:

```json
{
  "reason": "Reference number does not match transfer record."
}
```

## Tenant Billing Endpoints

### Current cycle and bills

- `GET /api/v1/tenant/billing/current`
  - returns active cycle and projected bill for the tenant's current room

- `GET /api/v1/tenant/billing/statements`
  - returns all issued statements for the tenant

- `GET /api/v1/tenant/billing/statements/:id`
  - returns one statement detail with:
    - reading snapshots
    - line items
    - payments
    - receipts

### Payment submission

- `POST /api/v1/tenant/billing/statements/:id/payments`
  - submit a payment for one issued statement

Request body:

```json
{
  "amount": 1500,
  "method": "gcash",
  "reference_number": "GCASH-20260430-ABC123",
  "notes": "April payment"
}
```

- `GET /api/v1/tenant/billing/payments`
  - payment history for the tenant

- `GET /api/v1/tenant/billing/receipts`
  - receipt history for the tenant

### Notifications

- `GET /api/v1/tenant/notifications`
  - unread and recent notifications

- `PATCH /api/v1/tenant/notifications/:id/read`
  - mark one notification as read

- `PATCH /api/v1/tenant/notifications/read-all`
  - mark all as read

## Admin Billing Override Endpoints

Admin should keep emergency override ability.

- `GET /api/v1/admin/billing/statements`
  - global statement list

- `GET /api/v1/admin/billing/payments`
  - global payment list

- `PATCH /api/v1/admin/billing/statements/:id/status`
  - emergency statement override

- `PATCH /api/v1/admin/billing/payments/:id/confirm`
  - emergency payment confirmation

- `PATCH /api/v1/admin/billing/payments/:id/reject`
  - emergency payment rejection

## Suggested RBAC Additions

Add these permissions:

- `tenant.billing.view`
- `tenant.payments.create`
- `tenant.notifications.view`
- `landlord.billing.generate`
- `landlord.billing.issue`
- `landlord.payments.verify`
- `admin.billing.override`

## UI Structure

### Tenant

- `Current Bill`
  - cycle-to-date usage
  - projected current bill
  - due soon badge if issued statement exists

- `Issued Bills`
  - unpaid / paid / overdue

- `Bill Detail`
  - opening and closing reading
  - billed kWh
  - rate
  - line items
  - payments
  - receipt

- `Payment History`
- `Receipts`
- `Notifications`

### Landlord

- `Billing Overview`
- `Current Cycles`
- `Statements`
- `Payment Verification`
- `Billing History`

### Admin

- `Billing Override`
- `Global Statement Monitor`
- `Global Payment Monitor`

## Implementation Order

### Phase 1

1. Add billing tables
2. Open and close billing cycles
3. Show current cycle projected bill

### Phase 2

1. Generate draft statement from closed cycle
2. Add statement items
3. Issue statement

### Phase 3

1. Tenant payment submission
2. Landlord payment confirmation
3. Receipt generation
4. Notification feed

### Phase 4

1. Admin override
2. Overdue automation
3. Receipt export / printable statement

## Recommended Immediate Product Change

Once this module starts, rename the current landlord billing screen from:

- `Billing Summary`

to something clearer like:

- `Billing Estimates`

Then introduce a separate official billing area:

- `Issued Bills`

This avoids confusing live projections with actual frozen statements.
