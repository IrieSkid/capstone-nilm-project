import { readFile } from 'node:fs/promises';
import path from 'node:path';

import mysql, { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { env } from '../config/env';
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
    `SELECT ${table === 'tblroles' ? 'role_id' : table === 'tbluser_status' ? 'status_id' : table === 'tblappliance_categories' ? 'category_id' : 'appliance_type_id'} AS id FROM ${table} WHERE ${keyColumn} = ? LIMIT 1`,
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
        VALUES ('active'), ('inactive'), ('suspended')
      `,
    );

    await connection.query(
      `
        INSERT INTO tblappliance_categories (category_name)
        VALUES ('Cooling'), ('Kitchen'), ('Entertainment'), ('Lighting'), ('Computing')
      `,
    );

    const coolingCategoryId = await resolveId(
      connection,
      'tblappliance_categories',
      'category_name',
      'Cooling',
    );
    const kitchenCategoryId = await resolveId(
      connection,
      'tblappliance_categories',
      'category_name',
      'Kitchen',
    );
    const entertainmentCategoryId = await resolveId(
      connection,
      'tblappliance_categories',
      'category_name',
      'Entertainment',
    );

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
        VALUES
          (?, 'Air Conditioner', 1200, 0.85, 60.00, 0.50, 12.50, '{"3rd":0.12,"5th":0.08}', 'cyclic'),
          (?, 'Electric Fan', 75, 0.90, 60.00, 0.50, 5.00, '{"3rd":0.03}', 'constant'),
          (?, 'Refrigerator', 150, 0.80, 60.00, 0.50, 10.00, '{"3rd":0.09,"5th":0.05}', 'cyclic'),
          (?, 'Rice Cooker', 700, 0.99, 60.00, 0.40, 3.00, '{"3rd":0.02}', 'variable'),
          (?, 'LED TV', 120, 0.70, 60.00, 0.50, 18.00, '{"3rd":0.15,"5th":0.10}', 'constant')
      `,
      [
        coolingCategoryId,
        coolingCategoryId,
        kitchenCategoryId,
        kitchenCategoryId,
        entertainmentCategoryId,
      ],
    );

    const adminRoleId = await resolveId(connection, 'tblroles', 'role_name', 'admin');
    const landlordRoleId = await resolveId(connection, 'tblroles', 'role_name', 'landlord');
    const tenantRoleId = await resolveId(connection, 'tblroles', 'role_name', 'tenant');
    const activeStatusId = await resolveId(connection, 'tbluser_status', 'status_name', 'active');

    const adminPassword = await hashPassword('Admin123!');
    const landlordPassword = await hashPassword('Landlord123!');
    const tenantPassword = await hashPassword('Tenant123!');

    await connection.query(
      `
        INSERT INTO tblusers (
          user_role_id,
          user_status_id,
          user_name,
          user_email,
          user_password,
          user_phone
        )
        VALUES
          (?, ?, 'System Admin', 'admin@nilm.local', ?, '09170000001'),
          (?, ?, 'Boarding House Owner', 'landlord@nilm.local', ?, '09170000002'),
          (?, ?, 'Juan Dela Cruz', 'juan@nilm.local', ?, '09170000003'),
          (?, ?, 'Maria Lopez', 'maria@nilm.local', ?, '09170000004')
      `,
      [
        adminRoleId,
        activeStatusId,
        adminPassword,
        landlordRoleId,
        activeStatusId,
        landlordPassword,
        tenantRoleId,
        activeStatusId,
        tenantPassword,
        tenantRoleId,
        activeStatusId,
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
        INSERT INTO tbldevices (
          device_name,
          device_identifier,
          device_status,
          device_last_seen
        )
        VALUES
          ('ESP32 Room 101', 'DEV-101', 'online', '2026-03-20 10:30:00'),
          ('ESP32 Room 102', 'DEV-102', 'online', '2026-03-20 10:45:00'),
          ('ESP32 Spare Device', 'DEV-103', 'offline', NULL)
      `,
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
      'Air Conditioner',
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
          room_tenant_id,
          room_device_id,
          room_rate_per_kwh,
          room_status
        )
        VALUES
          ('Room 101', ?, ?, 12.50, 'occupied'),
          ('Room 102', ?, ?, 11.75, 'occupied')
      `,
      [
        userIdByEmail.get('juan@nilm.local'),
        deviceIdByIdentifier.get('DEV-101'),
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
        powerW: 1210.0,
        frequency: 60.01,
        powerFactor: 0.85,
        thdPercentage: 11.9,
        energyKwh: 11.42,
        detections: [
          {
            applianceTypeId: airConditionerId!,
            detectedPower: 1138.0,
            confidence: 0.95,
          },
          {
            applianceTypeId: electricFanId!,
            detectedPower: 72.0,
            confidence: 0.84,
          },
        ],
      },
      {
        roomId: roomIdByName.get('Room 101')!,
        deviceId: deviceIdByIdentifier.get('DEV-101')!,
        timestamp: '2026-03-20 10:30:00',
        voltage: 220.0,
        current: 6.28,
        powerW: 1368.0,
        frequency: 60.02,
        powerFactor: 0.86,
        thdPercentage: 12.6,
        energyKwh: 12.01,
        detections: [
          {
            applianceTypeId: airConditionerId!,
            detectedPower: 1172.0,
            confidence: 0.96,
          },
          {
            applianceTypeId: electricFanId!,
            detectedPower: 76.0,
            confidence: 0.88,
          },
          {
            applianceTypeId: ledTvId!,
            detectedPower: 120.0,
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
  await insertSeedData();

  console.log(`Database ${env.DB_NAME} has been reset and seeded successfully.`);
  console.log('Demo accounts: admin@nilm.local / Admin123!, juan@nilm.local / Tenant123!');
}

main().catch((error) => {
  console.error('Failed to reset database.', error);
  process.exit(1);
});
