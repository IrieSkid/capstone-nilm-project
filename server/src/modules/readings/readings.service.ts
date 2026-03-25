import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { pool, withTransaction } from '../../config/db';
import { AppError } from '../../shared/utils/app-error';
import { toMySqlDateTime } from '../../shared/utils/date';
import { createDetectionForReading } from '../detections/detections.service';

interface DeviceRoomRow extends RowDataPacket {
  device_id: number;
  device_name: string;
  device_identifier: string;
  device_status: 'online' | 'offline';
  room_id: number | null;
  room_name: string | null;
  room_rate_per_kwh: number | null;
}

interface ReadingRow extends RowDataPacket {
  reading_header_id: number;
  room_id: number;
  room_name: string;
  reading_header_time: string;
  reading_detail_voltage: number;
  reading_detail_current: number;
  reading_detail_power_w: number;
  reading_detail_frequency: number;
  reading_detail_power_factor: number;
  reading_detail_thd_percentage: number;
  reading_detail_energy_kwh: number;
  room_rate_per_kwh: number;
  appliance_type_name: string | null;
  detection_detail_confidence: number | null;
}

interface ReadingDetectionRow extends RowDataPacket {
  reading_header_id: number;
  detection_detail_id: number;
  detection_detail_rank: number;
  appliance_type_id: number;
  appliance_type_name: string;
  category_name: string;
  appliance_type_power_pattern: string;
  detection_detail_status: 'ON' | 'OFF';
  detection_detail_confidence: number;
  detection_detail_detected_power: number;
  detection_detail_detected_frequency: number;
  detection_detail_detected_thd: number;
}

function mapReadingRow(row: ReadingRow) {
  return {
    readingId: row.reading_header_id,
    roomId: row.room_id,
    roomName: row.room_name,
    timestamp: row.reading_header_time,
    voltage: row.reading_detail_voltage,
    current: row.reading_detail_current,
    powerW: row.reading_detail_power_w,
    frequency: row.reading_detail_frequency,
    powerFactor: row.reading_detail_power_factor,
    thdPercentage: row.reading_detail_thd_percentage,
    energyKwh: row.reading_detail_energy_kwh,
    estimatedCost: Number((row.reading_detail_energy_kwh * row.room_rate_per_kwh).toFixed(2)),
    likelyActiveAppliance: row.appliance_type_name,
    detectionConfidence: row.detection_detail_confidence,
    detections: [],
  };
}

async function attachReadingDetections(
  readings: Array<ReturnType<typeof mapReadingRow>>,
) {
  if (readings.length === 0) {
    return readings;
  }

  const readingIds = readings.map((reading) => reading.readingId);
  const placeholders = readingIds.map(() => '?').join(', ');

  const [rows] = await pool.query<ReadingDetectionRow[]>(
    `
      SELECT
        dh.detection_header_reading_header_id AS reading_header_id,
        dd.detection_detail_id,
        dd.detection_detail_rank,
        ap.appliance_type_id,
        ap.appliance_type_name,
        cat.category_name,
        ap.appliance_type_power_pattern,
        dd.detection_detail_status,
        dd.detection_detail_confidence,
        dd.detection_detail_detected_power,
        dd.detection_detail_detected_frequency,
        dd.detection_detail_detected_thd
      FROM tblappliance_detection_headers dh
      INNER JOIN tblappliance_detection_details dd
        ON dd.detection_detail_header_id = dh.detection_header_id
      INNER JOIN tblappliance_types ap
        ON ap.appliance_type_id = dd.detection_detail_appliance_type_id
      INNER JOIN tblappliance_categories cat
        ON cat.category_id = ap.appliance_type_category_id
      WHERE dh.detection_header_reading_header_id IN (${placeholders})
      ORDER BY dh.detection_header_reading_header_id DESC, dd.detection_detail_rank ASC, dd.detection_detail_id ASC
    `,
    readingIds,
  );

  const detectionsByReadingId = new Map<number, Array<{
    detectionDetailId: number;
    rank: number;
    applianceTypeId: number;
    applianceTypeName: string;
    categoryName: string;
    powerPattern: string;
    status: 'ON' | 'OFF';
    confidence: number;
    detectedPower: number;
    detectedFrequency: number;
    detectedThd: number;
    powerShare: number;
  }>>();

  for (const row of rows) {
    const detections = detectionsByReadingId.get(row.reading_header_id) ?? [];
    detections.push({
      detectionDetailId: row.detection_detail_id,
      rank: row.detection_detail_rank,
      applianceTypeId: row.appliance_type_id,
      applianceTypeName: row.appliance_type_name,
      categoryName: row.category_name,
      powerPattern: row.appliance_type_power_pattern,
      status: row.detection_detail_status,
      confidence: row.detection_detail_confidence,
      detectedPower: row.detection_detail_detected_power,
      detectedFrequency: row.detection_detail_detected_frequency,
      detectedThd: row.detection_detail_detected_thd,
      powerShare: 0,
    });
    detectionsByReadingId.set(row.reading_header_id, detections);
  }

  return readings.map((reading) => {
    const detections = detectionsByReadingId.get(reading.readingId) ?? [];
    const totalDetectedPower = detections.reduce(
      (sum, detection) => sum + detection.detectedPower,
      0,
    );
    const normalizedDetections = detections.map((detection) => ({
      ...detection,
      powerShare: totalDetectedPower > 0
        ? Number((detection.detectedPower / totalDetectedPower).toFixed(4))
        : 0,
    }));
    const primaryDetection = normalizedDetections[0];

    return {
      ...reading,
      likelyActiveAppliance: primaryDetection?.applianceTypeName ?? reading.likelyActiveAppliance,
      detectionConfidence: primaryDetection?.confidence ?? reading.detectionConfidence,
      detections: normalizedDetections,
    };
  });
}

async function insertReadingDetail(
  connection: PoolConnection,
  readingHeaderId: number,
  input: {
    voltage: number;
    current: number;
    power_w: number;
    frequency: number;
    power_factor: number;
    thd_percentage: number;
    energy_kwh: number;
  },
) {
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
      readingHeaderId,
      input.voltage,
      input.current,
      input.power_w,
      input.frequency,
      input.power_factor,
      input.thd_percentage,
      input.energy_kwh,
    ],
  );
}

async function getDeviceRoomContext(deviceIdentifier: string) {
  const [rows] = await pool.query<DeviceRoomRow[]>(
    `
      SELECT
        d.device_id,
        d.device_name,
        d.device_identifier,
        d.device_status,
        room.room_id,
        room.room_name,
        room.room_rate_per_kwh
      FROM tbldevices d
      LEFT JOIN tblrooms room ON room.room_device_id = d.device_id
      WHERE d.device_identifier = ?
      LIMIT 1
    `,
    [deviceIdentifier],
  );

  if (!rows[0]) {
    throw new AppError(404, 'Reading ingest only accepts registered devices.');
  }

  const roomId = rows[0].room_id;
  const roomRatePerKwh = rows[0].room_rate_per_kwh;

  if (roomId === null || roomRatePerKwh === null) {
    throw new AppError(400, 'Reading must map to a valid room through the device.');
  }

  return {
    ...rows[0],
    room_id: roomId,
    room_rate_per_kwh: roomRatePerKwh,
  };
}

export async function ingestReading(input: {
  device_identifier: string;
  timestamp: string;
  voltage: number;
  current: number;
  power_w: number;
  frequency: number;
  power_factor: number;
  thd_percentage: number;
  energy_kwh: number;
}) {
  const context = await getDeviceRoomContext(input.device_identifier);
  const readingTimestamp = toMySqlDateTime(input.timestamp);

  return withTransaction(async (connection) => {
    await connection.query(
      `
        UPDATE tbldevices
        SET
          device_status = 'online',
          device_last_seen = NOW()
        WHERE device_id = ?
      `,
      [context.device_id],
    );

    const [readingHeaderResult] = await connection.query<ResultSetHeader>(
      `
        INSERT INTO tblreading_headers (
          reading_header_room_id,
          reading_header_device_id,
          reading_header_time
        )
        VALUES (?, ?, ?)
      `,
      [context.room_id, context.device_id, readingTimestamp],
    );

    await insertReadingDetail(connection, readingHeaderResult.insertId, input);

    const detection = await createDetectionForReading(connection, {
      roomId: context.room_id,
      deviceId: context.device_id,
      readingHeaderId: readingHeaderResult.insertId,
      timestamp: readingTimestamp,
      powerW: input.power_w,
      powerFactor: input.power_factor,
      frequency: input.frequency,
      thdPercentage: input.thd_percentage,
    });

    const estimatedCost = Number((input.energy_kwh * context.room_rate_per_kwh).toFixed(2));

    return {
      reading: {
        readingId: readingHeaderResult.insertId,
        roomId: context.room_id,
        roomName: context.room_name,
        deviceId: context.device_id,
        deviceIdentifier: context.device_identifier,
        timestamp: readingTimestamp,
        voltage: input.voltage,
        current: input.current,
        powerW: input.power_w,
        frequency: input.frequency,
        powerFactor: input.power_factor,
        thdPercentage: input.thd_percentage,
        energyKwh: input.energy_kwh,
      },
      detection: detection.appliance,
      detections: detection.appliances,
      estimatedCost,
    };
  });
}

export async function getLatestReadingByRoomId(roomId: number) {
  const [rows] = await pool.query<ReadingRow[]>(
    `
      SELECT
        rh.reading_header_id,
        room.room_id,
        room.room_name,
        rh.reading_header_time,
        rd.reading_detail_voltage,
        rd.reading_detail_current,
        rd.reading_detail_power_w,
        rd.reading_detail_frequency,
        rd.reading_detail_power_factor,
        rd.reading_detail_thd_percentage,
        rd.reading_detail_energy_kwh,
        room.room_rate_per_kwh,
        ap.appliance_type_name,
        dd.detection_detail_confidence
      FROM tblreading_headers rh
      INNER JOIN tblreading_details rd ON rd.reading_detail_header_id = rh.reading_header_id
      INNER JOIN tblrooms room ON room.room_id = rh.reading_header_room_id
      LEFT JOIN tblappliance_detection_headers dh
        ON dh.detection_header_reading_header_id = rh.reading_header_id
      LEFT JOIN tblappliance_detection_details dd
        ON dd.detection_detail_header_id = dh.detection_header_id
        AND dd.detection_detail_rank = 1
      LEFT JOIN tblappliance_types ap
        ON ap.appliance_type_id = dd.detection_detail_appliance_type_id
      WHERE room.room_id = ?
      ORDER BY rh.reading_header_id DESC
      LIMIT 1
    `,
    [roomId],
  );

  if (!rows[0]) {
    return null;
  }

  const [reading] = await attachReadingDetections([mapReadingRow(rows[0])]);
  return reading ?? null;
}

export async function getReadingHistoryByRoomId(roomId: number, limit = 10) {
  const [rows] = await pool.query<ReadingRow[]>(
    `
      SELECT
        rh.reading_header_id,
        room.room_id,
        room.room_name,
        rh.reading_header_time,
        rd.reading_detail_voltage,
        rd.reading_detail_current,
        rd.reading_detail_power_w,
        rd.reading_detail_frequency,
        rd.reading_detail_power_factor,
        rd.reading_detail_thd_percentage,
        rd.reading_detail_energy_kwh,
        room.room_rate_per_kwh,
        ap.appliance_type_name,
        dd.detection_detail_confidence
      FROM tblreading_headers rh
      INNER JOIN tblreading_details rd ON rd.reading_detail_header_id = rh.reading_header_id
      INNER JOIN tblrooms room ON room.room_id = rh.reading_header_room_id
      LEFT JOIN tblappliance_detection_headers dh
        ON dh.detection_header_reading_header_id = rh.reading_header_id
      LEFT JOIN tblappliance_detection_details dd
        ON dd.detection_detail_header_id = dh.detection_header_id
        AND dd.detection_detail_rank = 1
      LEFT JOIN tblappliance_types ap
        ON ap.appliance_type_id = dd.detection_detail_appliance_type_id
      WHERE room.room_id = ?
      ORDER BY rh.reading_header_id DESC
      LIMIT ?
    `,
    [roomId, limit],
  );

  return attachReadingDetections(rows.map(mapReadingRow));
}
