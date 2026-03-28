import { RowDataPacket } from 'mysql2';

import { pool } from '../config/db';
import { AppModuleKey } from '../shared/types/auth';

interface ExistsRow extends RowDataPacket {
  total: number;
}

interface IdRow extends RowDataPacket {
  id: number;
}

const BILLING_PERMISSIONS: Array<{
  key: AppModuleKey;
  name: string;
  description: string;
}> = [
  {
    key: 'tenant.billing.view',
    name: 'Tenant Billing View',
    description: 'Allows tenants to view their active billing cycle and projected current bill.',
  },
  {
    key: 'landlord.billing.view',
    name: 'Landlord Billing View',
    description: 'Allows landlords to view billing summaries for their owned rooms.',
  },
  {
    key: 'landlord.billing.manage',
    name: 'Landlord Billing Manage',
    description: 'Allows landlords to open and close billing cycles for their owned rooms.',
  },
];

async function indexExists(tableName: string, indexName: string) {
  const [rows] = await pool.query<ExistsRow[]>(
    `
      SELECT COUNT(*) AS total
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
    `,
    [tableName, indexName],
  );

  return (rows[0]?.total ?? 0) > 0;
}

async function resolveId(table: 'tblroles' | 'tblapp_modules', keyColumn: string, keyValue: string) {
  const idColumn = table === 'tblroles' ? 'role_id' : 'module_id';
  const [rows] = await pool.query<IdRow[]>(
    `SELECT ${idColumn} AS id FROM ${table} WHERE ${keyColumn} = ? LIMIT 1`,
    [keyValue],
  );

  return rows[0]?.id ?? null;
}

async function ensureBillingCyclesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tblbilling_cycles (
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
      billing_cycle_rate_per_kwh_snapshot DECIMAL(10, 2) NOT NULL,
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
    )
  `);

  if (!(await indexExists('tblbilling_cycles', 'idx_billing_cycles_room_status'))) {
    await pool.query(`
      CREATE INDEX idx_billing_cycles_room_status
      ON tblbilling_cycles (billing_cycle_room_id, billing_cycle_status)
    `);
  }

  if (!(await indexExists('tblbilling_cycles', 'idx_billing_cycles_tenant_status'))) {
    await pool.query(`
      CREATE INDEX idx_billing_cycles_tenant_status
      ON tblbilling_cycles (billing_cycle_tenant_id, billing_cycle_status)
    `);
  }

  if (!(await indexExists('tblbilling_cycles', 'idx_billing_cycles_landlord_status'))) {
    await pool.query(`
      CREATE INDEX idx_billing_cycles_landlord_status
      ON tblbilling_cycles (billing_cycle_landlord_id, billing_cycle_status)
    `);
  }
}

async function ensureBillingStatementsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tblbilling_statements (
      billing_statement_id INT PRIMARY KEY AUTO_INCREMENT,
      billing_statement_cycle_id INT NOT NULL UNIQUE,
      billing_statement_room_id INT NOT NULL,
      billing_statement_tenant_id INT NOT NULL,
      billing_statement_landlord_id INT NOT NULL,
      billing_statement_device_id INT NOT NULL,
      billing_statement_period_start DATE NOT NULL,
      billing_statement_period_end DATE NOT NULL,
      billing_statement_opening_reading_header_id INT NOT NULL,
      billing_statement_closing_reading_header_id INT NOT NULL,
      billing_statement_opening_energy_kwh DECIMAL(10, 4) NOT NULL,
      billing_statement_closing_energy_kwh DECIMAL(10, 4) NOT NULL,
      billing_statement_billed_kwh DECIMAL(10, 4) NOT NULL,
      billing_statement_rate_per_kwh_snapshot DECIMAL(10, 2) NOT NULL,
      billing_statement_subtotal_amount DECIMAL(10, 2) NOT NULL,
      billing_statement_adjustments_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
      billing_statement_total_amount DECIMAL(10, 2) NOT NULL,
      billing_statement_status ENUM('draft', 'issued', 'partially_paid', 'paid', 'void') NOT NULL DEFAULT 'draft',
      billing_statement_number VARCHAR(50) NULL UNIQUE,
      billing_statement_due_date DATE NULL,
      billing_statement_issued_at DATETIME NULL,
      billing_statement_notes TEXT NULL,
      created_by_user_id INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_billing_statements_cycle FOREIGN KEY (billing_statement_cycle_id) REFERENCES tblbilling_cycles(billing_cycle_id),
      CONSTRAINT fk_billing_statements_room FOREIGN KEY (billing_statement_room_id) REFERENCES tblrooms(room_id),
      CONSTRAINT fk_billing_statements_tenant FOREIGN KEY (billing_statement_tenant_id) REFERENCES tblusers(user_id),
      CONSTRAINT fk_billing_statements_landlord FOREIGN KEY (billing_statement_landlord_id) REFERENCES tblusers(user_id),
      CONSTRAINT fk_billing_statements_device FOREIGN KEY (billing_statement_device_id) REFERENCES tbldevices(device_id),
      CONSTRAINT fk_billing_statements_opening_reading FOREIGN KEY (billing_statement_opening_reading_header_id) REFERENCES tblreading_headers(reading_header_id),
      CONSTRAINT fk_billing_statements_closing_reading FOREIGN KEY (billing_statement_closing_reading_header_id) REFERENCES tblreading_headers(reading_header_id),
      CONSTRAINT fk_billing_statements_created_by FOREIGN KEY (created_by_user_id) REFERENCES tblusers(user_id)
    )
  `);

  if (!(await indexExists('tblbilling_statements', 'idx_billing_statements_landlord_status'))) {
    await pool.query(`
      CREATE INDEX idx_billing_statements_landlord_status
      ON tblbilling_statements (billing_statement_landlord_id, billing_statement_status)
    `);
  }

  if (!(await indexExists('tblbilling_statements', 'idx_billing_statements_tenant_status'))) {
    await pool.query(`
      CREATE INDEX idx_billing_statements_tenant_status
      ON tblbilling_statements (billing_statement_tenant_id, billing_statement_status)
    `);
  }
}

async function ensureBillingStatementItemsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tblbilling_statement_items (
      billing_statement_item_id INT PRIMARY KEY AUTO_INCREMENT,
      billing_statement_item_statement_id INT NOT NULL,
      billing_statement_item_label VARCHAR(120) NOT NULL,
      billing_statement_item_description VARCHAR(255) NULL,
      billing_statement_item_quantity DECIMAL(10, 4) NOT NULL DEFAULT 1.0000,
      billing_statement_item_unit VARCHAR(20) NULL,
      billing_statement_item_unit_amount DECIMAL(10, 2) NOT NULL,
      billing_statement_item_total_amount DECIMAL(10, 2) NOT NULL,
      billing_statement_item_sort_order INT NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_billing_statement_items_statement FOREIGN KEY (billing_statement_item_statement_id) REFERENCES tblbilling_statements(billing_statement_id)
    )
  `);

  if (!(await indexExists('tblbilling_statement_items', 'idx_billing_statement_items_statement'))) {
    await pool.query(`
      CREATE INDEX idx_billing_statement_items_statement
      ON tblbilling_statement_items (billing_statement_item_statement_id, billing_statement_item_sort_order)
    `);
  }
}

async function ensureBillingPaymentsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tblbilling_payments (
      billing_payment_id INT PRIMARY KEY AUTO_INCREMENT,
      billing_payment_statement_id INT NOT NULL,
      billing_payment_tenant_id INT NOT NULL,
      billing_payment_landlord_id INT NOT NULL,
      billing_payment_amount DECIMAL(10, 2) NOT NULL,
      billing_payment_method VARCHAR(50) NOT NULL,
      billing_payment_reference_number VARCHAR(120) NULL,
      billing_payment_notes TEXT NULL,
      billing_payment_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
      billing_payment_rejection_reason VARCHAR(255) NULL,
      billing_payment_submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      billing_payment_verified_at DATETIME NULL,
      billing_payment_verified_by_user_id INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_billing_payments_statement FOREIGN KEY (billing_payment_statement_id) REFERENCES tblbilling_statements(billing_statement_id),
      CONSTRAINT fk_billing_payments_tenant FOREIGN KEY (billing_payment_tenant_id) REFERENCES tblusers(user_id),
      CONSTRAINT fk_billing_payments_landlord FOREIGN KEY (billing_payment_landlord_id) REFERENCES tblusers(user_id),
      CONSTRAINT fk_billing_payments_verified_by FOREIGN KEY (billing_payment_verified_by_user_id) REFERENCES tblusers(user_id)
    )
  `);

  if (!(await indexExists('tblbilling_payments', 'idx_billing_payments_statement_status'))) {
    await pool.query(`
      CREATE INDEX idx_billing_payments_statement_status
      ON tblbilling_payments (billing_payment_statement_id, billing_payment_status)
    `);
  }

  if (!(await indexExists('tblbilling_payments', 'idx_billing_payments_landlord_status'))) {
    await pool.query(`
      CREATE INDEX idx_billing_payments_landlord_status
      ON tblbilling_payments (billing_payment_landlord_id, billing_payment_status)
    `);
  }

  if (!(await indexExists('tblbilling_payments', 'idx_billing_payments_tenant_status'))) {
    await pool.query(`
      CREATE INDEX idx_billing_payments_tenant_status
      ON tblbilling_payments (billing_payment_tenant_id, billing_payment_status)
    `);
  }
}

async function ensureBillingReceiptsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tblbilling_receipts (
      billing_receipt_id INT PRIMARY KEY AUTO_INCREMENT,
      billing_receipt_payment_id INT NOT NULL UNIQUE,
      billing_receipt_statement_id INT NOT NULL,
      billing_receipt_tenant_id INT NOT NULL,
      billing_receipt_landlord_id INT NOT NULL,
      billing_receipt_number VARCHAR(50) NOT NULL UNIQUE,
      billing_receipt_amount DECIMAL(10, 2) NOT NULL,
      billing_receipt_notes TEXT NULL,
      billing_receipt_issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by_user_id INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_billing_receipts_payment FOREIGN KEY (billing_receipt_payment_id) REFERENCES tblbilling_payments(billing_payment_id),
      CONSTRAINT fk_billing_receipts_statement FOREIGN KEY (billing_receipt_statement_id) REFERENCES tblbilling_statements(billing_statement_id),
      CONSTRAINT fk_billing_receipts_tenant FOREIGN KEY (billing_receipt_tenant_id) REFERENCES tblusers(user_id),
      CONSTRAINT fk_billing_receipts_landlord FOREIGN KEY (billing_receipt_landlord_id) REFERENCES tblusers(user_id),
      CONSTRAINT fk_billing_receipts_created_by FOREIGN KEY (created_by_user_id) REFERENCES tblusers(user_id)
    )
  `);

  if (!(await indexExists('tblbilling_receipts', 'idx_billing_receipts_statement_issued'))) {
    await pool.query(`
      CREATE INDEX idx_billing_receipts_statement_issued
      ON tblbilling_receipts (billing_receipt_statement_id, billing_receipt_issued_at)
    `);
  }
}

async function ensureNotificationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tblnotifications (
      notification_id INT PRIMARY KEY AUTO_INCREMENT,
      notification_user_id INT NOT NULL,
      notification_type VARCHAR(50) NOT NULL,
      notification_title VARCHAR(150) NOT NULL,
      notification_message TEXT NOT NULL,
      notification_reference_type VARCHAR(50) NULL,
      notification_reference_id INT NULL,
      notification_action_path VARCHAR(255) NULL,
      notification_is_read TINYINT(1) NOT NULL DEFAULT 0,
      notification_read_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_notifications_user FOREIGN KEY (notification_user_id) REFERENCES tblusers(user_id)
    )
  `);

  if (!(await indexExists('tblnotifications', 'idx_notifications_user_read_created'))) {
    await pool.query(`
      CREATE INDEX idx_notifications_user_read_created
      ON tblnotifications (notification_user_id, notification_is_read, created_at)
    `);
  }
}

async function ensureBillingPermissionCatalog() {
  for (const permission of BILLING_PERMISSIONS) {
    await pool.query(
      `
        INSERT INTO tblapp_modules (module_key, module_name, module_description)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          module_name = VALUES(module_name),
          module_description = VALUES(module_description)
      `,
      [permission.key, permission.name, permission.description],
    );
  }
}

async function ensureRolePermission(roleId: number, moduleId: number, canAccess = 1) {
  await pool.query(
    `
      INSERT INTO tblrole_module_permissions (
        role_permission_role_id,
        role_permission_module_id,
        can_access
      )
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE can_access = VALUES(can_access)
    `,
    [roleId, moduleId, canAccess],
  );
}

async function ensureBillingRolePermissions() {
  const adminRoleId = await resolveId('tblroles', 'role_name', 'admin');
  const landlordRoleId = await resolveId('tblroles', 'role_name', 'landlord');
  const tenantRoleId = await resolveId('tblroles', 'role_name', 'tenant');

  if (!adminRoleId || !landlordRoleId || !tenantRoleId) {
    throw new Error('Admin, landlord, and tenant roles must exist before running the billing migration.');
  }

  for (const permission of BILLING_PERMISSIONS) {
    const moduleId = await resolveId('tblapp_modules', 'module_key', permission.key);

    if (!moduleId) {
      throw new Error(`Permission ${permission.key} was not found after billing sync.`);
    }

    await ensureRolePermission(adminRoleId, moduleId, 1);

    if (permission.key === 'tenant.billing.view') {
      await ensureRolePermission(tenantRoleId, moduleId, 1);
    }

    if (permission.key.startsWith('landlord.')) {
      await ensureRolePermission(landlordRoleId, moduleId, 1);
    }
  }
}

async function main() {
  await ensureBillingCyclesTable();
  await ensureBillingStatementsTable();
  await ensureBillingStatementItemsTable();
  await ensureBillingPaymentsTable();
  await ensureBillingReceiptsTable();
  await ensureNotificationsTable();
  await ensureBillingPermissionCatalog();
  await ensureBillingRolePermissions();

  console.log('Billing tables, receipts, payments, and billing permissions are ready.');
}

main()
  .catch((error) => {
    console.error('Failed to migrate billing module.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
