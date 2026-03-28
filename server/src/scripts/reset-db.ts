import { readFile } from 'node:fs/promises';
import path from 'node:path';

import mysql, { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { env } from '../config/env';
import {
  APPLIANCE_CATALOG,
  APPLIANCE_CATEGORY_NAMES,
} from '../shared/constants/appliance-catalog';
import { generateUniqueLandlordRegistrationCode } from '../shared/utils/landlord-code';
import { hashPassword } from '../shared/utils/password';

interface IdRow extends RowDataPacket {
  id: number;
}

interface SeedDetectedApplianceInput {
  applianceTypeId: number;
  detectedPower: number;
  confidence: number;
}

interface SeedReadingInput {
  roomId: number;
  deviceId: number;
  timestamp: string;
  voltage: number;
  current: number;
  powerW: number;
  frequency: number;
  powerFactor: number;
  thdPercentage: number;
  energyKwh: number;
  detections: SeedDetectedApplianceInput[];
}

const RBAC_PERMISSIONS = [
  {
    key: 'dashboard.view',
    name: 'Dashboard View',
    description: 'Allows access to the main monitoring dashboard.',
  },
  {
    key: 'profile.manage',
    name: 'Profile Manage',
    description: 'Allows users to update their own profile and password.',
  },
  {
    key: 'users.view',
    name: 'Users View',
    description: 'Allows viewing the user management list.',
  },
  {
    key: 'users.create',
    name: 'Users Create',
    description: 'Allows creating new user accounts.',
  },
  {
    key: 'users.update',
    name: 'Users Update',
    description: 'Allows updating existing user accounts.',
  },
  {
    key: 'rooms.view',
    name: 'Rooms View',
    description: 'Allows viewing the room management list.',
  },
  {
    key: 'rooms.create',
    name: 'Rooms Create',
    description: 'Allows creating new rooms.',
  },
  {
    key: 'rooms.update',
    name: 'Rooms Update',
    description: 'Allows updating room details and assignments.',
  },
  {
    key: 'rooms.delete',
    name: 'Rooms Delete',
    description: 'Allows deleting fully unassigned rooms.',
  },
  {
    key: 'devices.view',
    name: 'Devices View',
    description: 'Allows viewing the device registry list.',
  },
  {
    key: 'devices.create',
    name: 'Devices Create',
    description: 'Allows registering new devices.',
  },
  {
    key: 'devices.update',
    name: 'Devices Update',
    description: 'Allows updating existing devices.',
  },
  {
    key: 'tenant.billing.view',
    name: 'Tenant Billing View',
    description: 'Allows tenants to view their active billing cycle and projected current bill.',
  },
  {
    key: 'port_control.use',
    name: 'Port Control Use',
    description: 'Allows remote on/off control of assigned device ports.',
  },
  {
    key: 'landlord.dashboard.view',
    name: 'Landlord Dashboard View',
    description: 'Allows landlords to view their owned-room dashboard.',
  },
  {
    key: 'landlord.rooms.view',
    name: 'Landlord Rooms View',
    description: 'Allows landlords to view rooms assigned to them.',
  },
  {
    key: 'landlord.rooms.create',
    name: 'Landlord Rooms Create',
    description: 'Allows landlords to create new rooms under their own ownership.',
  },
  {
    key: 'landlord.rooms.update',
    name: 'Landlord Rooms Update',
    description: 'Allows landlords to update owned room rate, status, and room details allowed by policy.',
  },
  {
    key: 'landlord.tenants.view',
    name: 'Landlord Tenants View',
    description: 'Allows landlords to view tenants in their owned rooms.',
  },
  {
    key: 'landlord.tenants.assign',
    name: 'Landlord Tenants Assign',
    description: 'Allows landlords to assign or unassign tenants in their owned rooms.',
  },
  {
    key: 'landlord.tenant_requests.view',
    name: 'Landlord Tenant Requests View',
    description: 'Allows landlords to view pending tenant registrations linked to their invite code.',
  },
  {
    key: 'landlord.tenant_requests.approve',
    name: 'Landlord Tenant Requests Approve',
    description: 'Allows landlords to approve or reject pending tenant registrations.',
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
  {
    key: 'landlord.devices.view',
    name: 'Landlord Devices View',
    description: 'Allows landlords to view devices assigned to their owned rooms.',
  },
  {
    key: 'landlord.devices.assign',
    name: 'Landlord Devices Assign',
    description: 'Allows landlords to assign or unassign devices in their owned rooms.',
  },
  {
    key: 'rbac.manage',
    name: 'RBAC Manage',
    description: 'Allows managing role and user access control settings.',
  },
] as const;

async function insertRolePermissions(
  connection: mysql.Connection,
  roleId: number,
  permissionKeys: ReadonlyArray<(typeof RBAC_PERMISSIONS)[number]['key']>,
) {
  const valueClauses: string[] = [];
  const params: number[] = [];

  for (const permissionKey of permissionKeys) {
    const moduleId = await resolveId(connection, 'tblapp_modules', 'module_key', permissionKey);

    if (!moduleId) {
      throw new Error(`RBAC permission ${permissionKey} was not found during seed.`);
    }

    valueClauses.push('(?, ?, 1)');
    params.push(roleId, moduleId);
  }

  if (valueClauses.length === 0) {
    return;
  }

  await connection.query(
    `
      INSERT INTO tblrole_module_permissions (
        role_permission_role_id,
        role_permission_module_id,
        can_access
      )
      VALUES ${valueClauses.join(', ')}
    `,
    params,
  );
}

function escapeIdentifier(identifier: string) {
  return `\`${identifier.replaceAll('`', '``')}\``;
}

async function runSchema() {
  const connection = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    multipleStatements: true,
  });

  try {
    const schemaPath = path.resolve(__dirname, '../../sql/schema.sql');
    const rawSchema = await readFile(schemaPath, 'utf8');
    const schemaSql = rawSchema.replaceAll('__DB_NAME__', escapeIdentifier(env.DB_NAME));
    await connection.query(schemaSql);
  } finally {
    await connection.end();
  }
}

async function resolveId(
  connection: mysql.Connection,
  table: string,
  keyColumn: string,
  keyValue: string,
) {
  const [rows] = await connection.query<IdRow[]>(
    `SELECT ${
      table === 'tblroles'
        ? 'role_id'
        : table === 'tbluser_status'
          ? 'status_id'
          : table === 'tblappliance_categories'
            ? 'category_id'
            : table === 'tblapp_modules'
              ? 'module_id'
              : 'appliance_type_id'
    } AS id FROM ${table} WHERE ${keyColumn} = ? LIMIT 1`,
    [keyValue],
  );

  return rows[0]?.id;
}

async function insertSeedData() {
  const connection = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });

  try {
    await connection.beginTransaction();

    await connection.query(
      `
        INSERT INTO tblroles (role_name)
        VALUES ('admin'), ('landlord'), ('tenant')
      `,
    );

    await connection.query(
      `
        INSERT INTO tbluser_status (status_name)
        VALUES ('active'), ('inactive'), ('suspended'), ('pending_approval'), ('rejected')
      `,
    );

    await connection.query(
      `
        INSERT INTO tblapp_modules (module_key, module_name, module_description)
        VALUES ${RBAC_PERMISSIONS.map(() => '(?, ?, ?)').join(', ')}
      `,
      RBAC_PERMISSIONS.flatMap((permission) => [
        permission.key,
        permission.name,
        permission.description,
      ]),
    );

    await connection.query(
      `
        INSERT INTO tblappliance_categories (category_name)
        VALUES ${APPLIANCE_CATEGORY_NAMES.map(() => '(?)').join(', ')}
      `,
      APPLIANCE_CATEGORY_NAMES,
    );

    const categoryIdByName = new Map<string, number>();

    for (const categoryName of APPLIANCE_CATEGORY_NAMES) {
      const categoryId = await resolveId(
        connection,
        'tblappliance_categories',
        'category_name',
        categoryName,
      );

      if (!categoryId) {
        throw new Error(`Appliance category ${categoryName} was not found during seed.`);
      }

      categoryIdByName.set(categoryName, categoryId);
    }

    await connection.query(
      `
        INSERT INTO tblappliance_types (
          appliance_type_category_id,
          appliance_type_name,
          appliance_type_typical_power_w,
          appliance_type_power_factor,
          appliance_type_nominal_frequency_hz,
          appliance_type_frequency_tolerance,
          appliance_type_thd_reference,
          appliance_type_harmonic_signature,
          appliance_type_power_pattern
        )
        VALUES ${APPLIANCE_CATALOG.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}
      `,
      APPLIANCE_CATALOG.flatMap((entry) => [
        categoryIdByName.get(entry.categoryName),
        entry.applianceTypeName,
        entry.typicalPowerW,
        entry.powerFactor,
        entry.nominalFrequencyHz,
        entry.frequencyTolerance,
        entry.thdReference,
        entry.harmonicSignature,
        entry.powerPattern,
      ]),
    );

    const adminRoleId = await resolveId(connection, 'tblroles', 'role_name', 'admin');
    const landlordRoleId = await resolveId(connection, 'tblroles', 'role_name', 'landlord');
    const tenantRoleId = await resolveId(connection, 'tblroles', 'role_name', 'tenant');
    const activeStatusId = await resolveId(connection, 'tbluser_status', 'status_name', 'active');

    await insertRolePermissions(
      connection,
      adminRoleId!,
      RBAC_PERMISSIONS.map((permission) => permission.key),
    );
    await insertRolePermissions(connection, tenantRoleId!, [
      'dashboard.view',
      'profile.manage',
      'tenant.billing.view',
      'port_control.use',
    ]);
    await insertRolePermissions(connection, landlordRoleId!, [
      'profile.manage',
      'landlord.dashboard.view',
      'landlord.rooms.view',
      'landlord.rooms.create',
      'landlord.rooms.update',
      'landlord.tenants.view',
      'landlord.tenants.assign',
      'landlord.tenant_requests.view',
      'landlord.tenant_requests.approve',
      'landlord.billing.view',
      'landlord.billing.manage',
      'landlord.devices.view',
      'landlord.devices.assign',
    ]);

    const adminPassword = await hashPassword('Admin123!');
    const landlordPassword = await hashPassword('Landlord123!');
    const tenantPassword = await hashPassword('Tenant123!');
    const landlordRegistrationCode = await generateUniqueLandlordRegistrationCode(connection);

    await connection.query(
      `
        INSERT INTO tblusers (
          user_role_id,
          user_status_id,
          user_landlord_id,
          landlord_registration_code,
          user_name,
          user_email,
          user_password,
          user_phone
        )
        VALUES
          (?, ?, NULL, NULL, 'System Admin', 'admin@nilm.local', ?, '09170000001'),
          (?, ?, NULL, ?, 'Boarding House Owner', 'landlord@nilm.local', ?, '09170000002'),
          (?, ?, ?, NULL, 'Juan Dela Cruz', 'juan@nilm.local', ?, '09170000003'),
          (?, ?, ?, NULL, 'Maria Lopez', 'maria@nilm.local', ?, '09170000004')
      `,
      [
        adminRoleId,
        activeStatusId,
        adminPassword,
        landlordRoleId,
        activeStatusId,
        landlordRegistrationCode,
        landlordPassword,
        tenantRoleId,
        activeStatusId,
        null,
        tenantPassword,
        tenantRoleId,
        activeStatusId,
        null,
        tenantPassword,
      ],
    );

    const [userRows] = await connection.query<
      Array<RowDataPacket & { user_id: number; user_email: string }>
    >(
      `
        SELECT user_id, user_email
        FROM tblusers
      `,
    );

    const userIdByEmail = new Map(userRows.map((row) => [row.user_email, row.user_id]));

    await connection.query(
      `
        UPDATE tblusers
        SET user_landlord_id = ?
        WHERE user_email IN ('juan@nilm.local', 'maria@nilm.local')
      `,
      [userIdByEmail.get('landlord@nilm.local')],
    );

    await connection.query(
      `
        INSERT INTO tbldevices (
          device_name,
          device_identifier,
          device_owner_landlord_id,
          device_status,
          device_last_seen
        )
        VALUES
          ('ESP32 Room 101', 'DEV-101', ?, 'online', '2026-03-20 10:30:00'),
          ('ESP32 Room 102', 'DEV-102', ?, 'online', '2026-03-20 10:45:00'),
          ('ESP32 Spare Device', 'DEV-103', NULL, 'offline', NULL)
      `,
      [
        userIdByEmail.get('landlord@nilm.local'),
        userIdByEmail.get('landlord@nilm.local'),
      ],
    );

    const [deviceRows] = await connection.query<
      Array<RowDataPacket & { device_id: number; device_identifier: string }>
    >(
      `
        SELECT device_id, device_identifier
        FROM tbldevices
      `,
    );

    const deviceIdByIdentifier = new Map(
      deviceRows.map((row) => [row.device_identifier, row.device_id]),
    );

    const airConditionerId = await resolveId(
      connection,
      'tblappliance_types',
      'appliance_type_name',
      'Inverter Air Conditioner',
    );
    const electricFanId = await resolveId(
      connection,
      'tblappliance_types',
      'appliance_type_name',
      'Electric Fan',
    );
    const riceCookerId = await resolveId(
      connection,
      'tblappliance_types',
      'appliance_type_name',
      'Rice Cooker',
    );
    const refrigeratorId = await resolveId(
      connection,
      'tblappliance_types',
      'appliance_type_name',
      'Refrigerator',
    );
    const ledTvId = await resolveId(
      connection,
      'tblappliance_types',
      'appliance_type_name',
      'LED TV',
    );

    await connection.query(
      `
        INSERT INTO tblrooms (
          room_name,
          room_landlord_id,
          room_tenant_id,
          room_device_id,
          room_rate_per_kwh,
          room_status
        )
        VALUES
          ('Room 101', ?, ?, ?, 12.50, 'occupied'),
          ('Room 102', ?, ?, ?, 11.75, 'occupied')
      `,
      [
        userIdByEmail.get('landlord@nilm.local'),
        userIdByEmail.get('juan@nilm.local'),
        deviceIdByIdentifier.get('DEV-101'),
        userIdByEmail.get('landlord@nilm.local'),
        userIdByEmail.get('maria@nilm.local'),
        deviceIdByIdentifier.get('DEV-102'),
      ],
    );

    await connection.query(
      `
        INSERT INTO tbldevice_ports (
          device_port_device_id,
          device_port_label,
          device_port_appliance_type_id,
          device_port_supply_state,
          device_port_last_changed_at,
          device_port_last_changed_by_user_id
        )
        VALUES
          (?, 'Port 1', ?, 'on', '2026-03-20 08:00:00', ?),
          (?, 'Port 2', ?, 'on', '2026-03-20 08:00:00', ?),
          (?, 'Port 3', ?, 'on', '2026-03-20 08:00:00', ?),
          (?, 'Port 1', ?, 'on', '2026-03-20 08:05:00', ?),
          (?, 'Port 2', ?, 'on', '2026-03-20 08:05:00', ?),
          (?, 'Port 3', ?, 'on', '2026-03-20 08:05:00', ?)
      `,
      [
        deviceIdByIdentifier.get('DEV-101'),
        airConditionerId,
        userIdByEmail.get('admin@nilm.local'),
        deviceIdByIdentifier.get('DEV-101'),
        electricFanId,
        userIdByEmail.get('admin@nilm.local'),
        deviceIdByIdentifier.get('DEV-101'),
        ledTvId,
        userIdByEmail.get('admin@nilm.local'),
        deviceIdByIdentifier.get('DEV-102'),
        refrigeratorId,
        userIdByEmail.get('admin@nilm.local'),
        deviceIdByIdentifier.get('DEV-102'),
        riceCookerId,
        userIdByEmail.get('admin@nilm.local'),
        deviceIdByIdentifier.get('DEV-102'),
        ledTvId,
        userIdByEmail.get('admin@nilm.local'),
      ],
    );

    const [roomRows] = await connection.query<
      Array<RowDataPacket & { room_id: number; room_name: string }>
    >(
      `
        SELECT room_id, room_name
        FROM tblrooms
      `,
    );

    const roomIdByName = new Map(roomRows.map((row) => [row.room_name, row.room_id]));

    const readings: SeedReadingInput[] = [
      {
        roomId: roomIdByName.get('Room 101')!,
        deviceId: deviceIdByIdentifier.get('DEV-101')!,
        timestamp: '2026-03-20 09:15:00',
        voltage: 220.0,
        current: 5.0,
        powerW: 892.0,
        frequency: 60.01,
        powerFactor: 0.93,
        thdPercentage: 7.1,
        energyKwh: 8.42,
        detections: [
          {
            applianceTypeId: airConditionerId!,
            detectedPower: 818.0,
            confidence: 0.95,
          },
          {
            applianceTypeId: electricFanId!,
            detectedPower: 74.0,
            confidence: 0.84,
          },
        ],
      },
      {
        roomId: roomIdByName.get('Room 101')!,
        deviceId: deviceIdByIdentifier.get('DEV-101')!,
        timestamp: '2026-03-20 10:30:00',
        voltage: 220.0,
        current: 4.95,
        powerW: 1016.0,
        frequency: 60.02,
        powerFactor: 0.94,
        thdPercentage: 7.6,
        energyKwh: 9.01,
        detections: [
          {
            applianceTypeId: airConditionerId!,
            detectedPower: 820.0,
            confidence: 0.96,
          },
          {
            applianceTypeId: electricFanId!,
            detectedPower: 74.0,
            confidence: 0.88,
          },
          {
            applianceTypeId: ledTvId!,
            detectedPower: 122.0,
            confidence: 0.8,
          },
        ],
      },
      {
        roomId: roomIdByName.get('Room 102')!,
        deviceId: deviceIdByIdentifier.get('DEV-102')!,
        timestamp: '2026-03-20 09:30:00',
        voltage: 220.0,
        current: 0.72,
        powerW: 149.0,
        frequency: 59.99,
        powerFactor: 0.8,
        thdPercentage: 10.2,
        energyKwh: 8.14,
        detections: [
          {
            applianceTypeId: refrigeratorId!,
            detectedPower: 149.0,
            confidence: 0.9,
          },
        ],
      },
      {
        roomId: roomIdByName.get('Room 102')!,
        deviceId: deviceIdByIdentifier.get('DEV-102')!,
        timestamp: '2026-03-20 10:45:00',
        voltage: 220.0,
        current: 3.79,
        powerW: 821.0,
        frequency: 60.01,
        powerFactor: 0.92,
        thdPercentage: 4.3,
        energyKwh: 8.73,
        detections: [
          {
            applianceTypeId: riceCookerId!,
            detectedPower: 671.0,
            confidence: 0.91,
          },
          {
            applianceTypeId: refrigeratorId!,
            detectedPower: 150.0,
            confidence: 0.82,
          },
        ],
      },
      {
        roomId: roomIdByName.get('Room 102')!,
        deviceId: deviceIdByIdentifier.get('DEV-102')!,
        timestamp: '2026-03-20 08:10:00',
        voltage: 220.0,
        current: 0.54,
        powerW: 118.0,
        frequency: 60.00,
        powerFactor: 0.71,
        thdPercentage: 17.8,
        energyKwh: 7.92,
        detections: [
          {
            applianceTypeId: ledTvId!,
            detectedPower: 118.0,
            confidence: 0.9,
          },
        ],
      },
    ];

    for (const reading of readings) {
      await insertReadingAndDetection(connection, reading);
    }

    await connection.commit();

    return landlordRegistrationCode;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

async function insertReadingAndDetection(connection: mysql.Connection, reading: SeedReadingInput) {
  const [readingHeaderResult] = await connection.query<ResultSetHeader>(
    `
      INSERT INTO tblreading_headers (
        reading_header_room_id,
        reading_header_device_id,
        reading_header_time
      )
      VALUES (?, ?, ?)
    `,
    [reading.roomId, reading.deviceId, reading.timestamp],
  );

  await connection.query(
    `
      INSERT INTO tblreading_details (
        reading_detail_header_id,
        reading_detail_voltage,
        reading_detail_current,
        reading_detail_power_w,
        reading_detail_frequency,
        reading_detail_power_factor,
        reading_detail_thd_percentage,
        reading_detail_energy_kwh
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      readingHeaderResult.insertId,
      reading.voltage,
      reading.current,
      reading.powerW,
      reading.frequency,
      reading.powerFactor,
      reading.thdPercentage,
      reading.energyKwh,
    ],
  );

  const [detectionHeaderResult] = await connection.query<ResultSetHeader>(
    `
      INSERT INTO tblappliance_detection_headers (
        detection_header_room_id,
        detection_header_reading_header_id,
        detection_header_time
      )
      VALUES (?, ?, ?)
    `,
    [reading.roomId, readingHeaderResult.insertId, reading.timestamp],
  );

  for (const [index, detection] of reading.detections.entries()) {
    await connection.query(
      `
        INSERT INTO tblappliance_detection_details (
          detection_detail_header_id,
          detection_detail_rank,
          detection_detail_appliance_type_id,
          detection_detail_status,
          detection_detail_confidence,
          detection_detail_detected_power,
          detection_detail_detected_frequency,
          detection_detail_detected_thd
        )
        VALUES (?, ?, ?, 'ON', ?, ?, ?, ?)
      `,
      [
        detectionHeaderResult.insertId,
        index + 1,
        detection.applianceTypeId,
        detection.confidence,
        detection.detectedPower,
        reading.frequency,
        reading.thdPercentage,
      ],
    );
  }
}

async function main() {
  await runSchema();
  const landlordRegistrationCode = await insertSeedData();

  console.log(`Database ${env.DB_NAME} has been reset and seeded successfully.`);
  console.log('Demo accounts: admin@nilm.local / Admin123!, juan@nilm.local / Tenant123!');
  console.log(`Seed landlord invite code: ${landlordRegistrationCode}`);
}

main().catch((error) => {
  console.error('Failed to reset database.', error);
  process.exit(1);
});
