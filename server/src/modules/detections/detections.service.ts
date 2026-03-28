import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { env } from '../../config/env';
import { pool } from '../../config/db';

interface ApplianceProfileRow extends RowDataPacket {
  appliance_type_id: number;
  appliance_type_name: string;
  appliance_type_typical_power_w: number;
  appliance_type_power_factor: number;
  appliance_type_nominal_frequency_hz: number;
  appliance_type_frequency_tolerance: number;
  appliance_type_thd_reference: number;
  appliance_type_power_pattern: string;
  category_name: string;
}

interface DetectionHeaderRow extends RowDataPacket {
  detection_header_id: number;
  detection_header_time: string;
}

interface DetectionDetailRow extends RowDataPacket {
  detection_detail_id: number;
  detection_detail_rank: number;
  detection_header_id: number;
  detection_header_time: string;
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

interface DetectionInput {
  roomId: number;
  deviceId: number;
  readingHeaderId: number;
  timestamp: string;
  powerW: number;
  powerFactor: number;
  frequency: number;
  thdPercentage: number;
}

interface ScoreBreakdown {
  powerSimilarity: number;
  powerFactorSimilarity: number;
  frequencySimilarity: number;
  thdSimilarity: number;
}

interface CombinationCandidate {
  profiles: ApplianceProfileRow[];
  confidence: number;
  totalTypicalPower: number;
  combinedPowerFactor: number;
  combinedFrequency: number;
  combinedThd: number;
  breakdown: ScoreBreakdown;
}

interface DetectedAppliance {
  detectionDetailId?: number;
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
  scoreBreakdown?: ScoreBreakdown;
}

const MAX_DETECTION_COMBINATION_SIZE = 6;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals = 4) {
  return Number(value.toFixed(decimals));
}

function similarity(actual: number, reference: number, tolerance: number) {
  if (tolerance <= 0) {
    return 0;
  }

  return Math.max(0, 1 - Math.abs(actual - reference) / tolerance);
}

function buildCombinations<T>(items: T[], minSize: number, maxSize: number) {
  const combinations: T[][] = [];

  function walk(startIndex: number, current: T[]) {
    if (current.length >= minSize) {
      combinations.push([...current]);
    }

    if (current.length === maxSize) {
      return;
    }

    for (let index = startIndex; index < items.length; index += 1) {
      current.push(items[index]);
      walk(index + 1, current);
      current.pop();
    }
  }

  walk(0, []);
  return combinations;
}

function getTotalTypicalPower(profiles: ApplianceProfileRow[]) {
  return profiles.reduce((sum, profile) => sum + profile.appliance_type_typical_power_w, 0);
}

function getCombinedPowerFactor(profiles: ApplianceProfileRow[]) {
  const totalPower = getTotalTypicalPower(profiles);
  const totalApparentPower = profiles.reduce(
    (sum, profile) =>
      sum + profile.appliance_type_typical_power_w / Math.max(profile.appliance_type_power_factor, 0.1),
    0,
  );

  return totalPower > 0 && totalApparentPower > 0
    ? totalPower / totalApparentPower
    : 0;
}

function getWeightedAverage(
  profiles: ApplianceProfileRow[],
  valueSelector: (profile: ApplianceProfileRow) => number,
) {
  const totalPower = getTotalTypicalPower(profiles);

  if (totalPower <= 0) {
    return 0;
  }

  return profiles.reduce(
    (sum, profile) => sum + valueSelector(profile) * profile.appliance_type_typical_power_w,
    0,
  ) / totalPower;
}

function scoreCombination(profiles: ApplianceProfileRow[], input: DetectionInput): CombinationCandidate {
  const totalTypicalPower = getTotalTypicalPower(profiles);
  const combinedPowerFactor = getCombinedPowerFactor(profiles);
  const combinedFrequency = getWeightedAverage(
    profiles,
    (profile) => profile.appliance_type_nominal_frequency_hz,
  );
  const combinedThd = getWeightedAverage(
    profiles,
    (profile) => profile.appliance_type_thd_reference,
  );

  const powerSimilarity = similarity(
    input.powerW,
    totalTypicalPower,
    Math.max(totalTypicalPower * 0.22, 45 * profiles.length),
  );
  const powerFactorSimilarity = similarity(
    input.powerFactor,
    combinedPowerFactor,
    0.18 + (profiles.length - 1) * 0.03,
  );
  const frequencySimilarity = similarity(
    input.frequency,
    combinedFrequency,
    Math.max(
      Math.min(...profiles.map((profile) => profile.appliance_type_frequency_tolerance)),
      0.12,
    ),
  );
  const thdSimilarity = similarity(
    input.thdPercentage,
    combinedThd,
    Math.max(combinedThd * 0.45, 3 + profiles.length),
  );

  const confidence = clamp(
    powerSimilarity * 0.55 +
      powerFactorSimilarity * 0.2 +
      frequencySimilarity * 0.1 +
      thdSimilarity * 0.15 -
      (profiles.length - 1) * 0.015,
    0,
    0.99,
  );

  return {
    profiles,
    confidence: round(confidence),
    totalTypicalPower,
    combinedPowerFactor: round(combinedPowerFactor),
    combinedFrequency: round(combinedFrequency),
    combinedThd: round(combinedThd),
    breakdown: {
      powerSimilarity: round(powerSimilarity),
      powerFactorSimilarity: round(powerFactorSimilarity),
      frequencySimilarity: round(frequencySimilarity),
      thdSimilarity: round(thdSimilarity),
    },
  };
}

function buildApplianceBreakdown(candidate: CombinationCandidate, input: DetectionInput): DetectedAppliance[] {
  return candidate.profiles
    .map((profile) => {
      const powerShare = profile.appliance_type_typical_power_w / candidate.totalTypicalPower;
      const detectedPower = input.powerW * powerShare;
      const powerSimilarity = similarity(
        detectedPower,
        profile.appliance_type_typical_power_w,
        Math.max(profile.appliance_type_typical_power_w * 0.3, 25),
      );
      const powerFactorSimilarity = similarity(
        input.powerFactor,
        profile.appliance_type_power_factor,
        0.25,
      );
      const frequencySimilarity = similarity(
        input.frequency,
        profile.appliance_type_nominal_frequency_hz,
        Math.max(profile.appliance_type_frequency_tolerance, 0.1),
      );
      const thdSimilarity = similarity(
        input.thdPercentage,
        profile.appliance_type_thd_reference,
        Math.max(profile.appliance_type_thd_reference * 0.7, 4),
      );
      const confidence = clamp(
        powerSimilarity * 0.45 +
          powerFactorSimilarity * 0.15 +
          frequencySimilarity * 0.1 +
          thdSimilarity * 0.1 +
          candidate.confidence * 0.2,
        0,
        0.99,
      );

      return {
        applianceTypeId: profile.appliance_type_id,
        applianceTypeName: profile.appliance_type_name,
        categoryName: profile.category_name,
        powerPattern: profile.appliance_type_power_pattern,
        status: 'ON' as const,
        confidence: round(confidence),
        detectedPower: round(detectedPower, 2),
        detectedFrequency: round(input.frequency, 2),
        detectedThd: round((profile.appliance_type_thd_reference * 0.6) + (input.thdPercentage * 0.4), 2),
        powerShare: round(powerShare),
        scoreBreakdown: {
          powerSimilarity: round(powerSimilarity),
          powerFactorSimilarity: round(powerFactorSimilarity),
          frequencySimilarity: round(frequencySimilarity),
          thdSimilarity: round(thdSimilarity),
        },
        rank: 0,
      };
    })
    .sort((left, right) => right.detectedPower - left.detectedPower)
    .map((appliance, index) => ({
      ...appliance,
      rank: index + 1,
    }));
}

function mapDetectionResult(headerId: number, detectedAt: string, appliances: DetectedAppliance[]) {
  const primaryAppliance = appliances[0] ?? null;

  return {
    detectionHeaderId: headerId,
    detectedAt,
    applianceTypeId: primaryAppliance?.applianceTypeId ?? null,
    applianceTypeName: primaryAppliance?.applianceTypeName ?? null,
    categoryName: primaryAppliance?.categoryName ?? null,
    status: primaryAppliance?.status ?? null,
    confidence: primaryAppliance?.confidence ?? null,
    detectedPower: primaryAppliance?.detectedPower ?? null,
    detectedFrequency: primaryAppliance?.detectedFrequency ?? null,
    detectedThd: primaryAppliance?.detectedThd ?? null,
    appliances,
  };
}

async function getApplianceProfiles(connection: PoolConnection | typeof pool) {
  const [profiles] = await connection.query<ApplianceProfileRow[]>(
    `
      SELECT
        a.appliance_type_id,
        a.appliance_type_name,
        a.appliance_type_typical_power_w,
        a.appliance_type_power_factor,
        a.appliance_type_nominal_frequency_hz,
        a.appliance_type_frequency_tolerance,
        a.appliance_type_thd_reference,
        a.appliance_type_power_pattern,
        c.category_name
      FROM tblappliance_types a
      INNER JOIN tblappliance_categories c ON c.category_id = a.appliance_type_category_id
      ORDER BY a.appliance_type_id
    `,
  );

  return profiles;
}

async function getPoweredProfilesForDevice(
  connection: PoolConnection,
  deviceId: number,
  profiles: ApplianceProfileRow[],
) {
  const [rows] = await connection.query<Array<RowDataPacket & { appliance_type_id: number }>>(
    `
      SELECT DISTINCT dp.device_port_appliance_type_id AS appliance_type_id
      FROM tbldevice_ports dp
      WHERE dp.device_port_device_id = ?
        AND dp.device_port_supply_state = 'on'
      ORDER BY dp.device_port_id
    `,
    [deviceId],
  );

  const poweredApplianceIds = new Set(rows.map((row) => row.appliance_type_id));

  if (poweredApplianceIds.size === 0) {
    return [];
  }

  return profiles.filter((profile) => poweredApplianceIds.has(profile.appliance_type_id));
}

export async function createDetectionForReading(connection: PoolConnection, input: DetectionInput) {
  const profiles = await getPoweredProfilesForDevice(
    connection,
    input.deviceId,
    await getApplianceProfiles(connection),
  );

  const [headerResult] = await connection.query<ResultSetHeader>(
    `
      INSERT INTO tblappliance_detection_headers (
        detection_header_room_id,
        detection_header_reading_header_id,
        detection_header_time
      )
      VALUES (?, ?, ?)
    `,
    [input.roomId, input.readingHeaderId, input.timestamp],
  );

  if (profiles.length === 0 || input.powerW <= 0) {
    return {
      detectionHeaderId: headerResult.insertId,
      appliance: null,
      appliances: [],
    };
  }

  // In this MVP, powered device ports represent the appliances that are actively supplied.
  // We score that exact powered set so the dashboard stays stable across feeder cycles while
  // still producing a real confidence value from the aggregate reading.
  const bestMatch = scoreCombination(
    profiles.slice(0, MAX_DETECTION_COMBINATION_SIZE),
    input,
  );

  if (!bestMatch || bestMatch.confidence < env.DETECTION_MIN_CONFIDENCE) {
    return {
      detectionHeaderId: headerResult.insertId,
      appliance: null,
      appliances: [],
    };
  }

  const appliances = buildApplianceBreakdown(bestMatch, input);

  for (const appliance of appliances) {
    const [detailResult] = await connection.query<ResultSetHeader>(
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
        headerResult.insertId,
        appliance.rank,
        appliance.applianceTypeId,
        appliance.confidence,
        appliance.detectedPower,
        appliance.detectedFrequency,
        appliance.detectedThd,
      ],
    );

    appliance.detectionDetailId = detailResult.insertId;
  }

  const primaryAppliance = appliances[0];

  return {
    detectionHeaderId: headerResult.insertId,
    appliance: primaryAppliance
      ? {
          applianceTypeId: primaryAppliance.applianceTypeId,
          applianceTypeName: primaryAppliance.applianceTypeName,
          categoryName: primaryAppliance.categoryName,
          confidence: primaryAppliance.confidence,
          scoreBreakdown: primaryAppliance.scoreBreakdown,
          powerPattern: primaryAppliance.powerPattern,
        }
      : null,
    appliances,
  };
}

export async function getLatestDetectionByRoomId(roomId: number) {
  const [headerRows] = await pool.query<DetectionHeaderRow[]>(
    `
      SELECT
        detection_header_id,
        detection_header_time
      FROM tblappliance_detection_headers
      WHERE detection_header_room_id = ?
      ORDER BY detection_header_id DESC
      LIMIT 1
    `,
    [roomId],
  );

  const latestHeader = headerRows[0];

  if (!latestHeader) {
    return null;
  }

  const [detailRows] = await pool.query<DetectionDetailRow[]>(
    `
      SELECT
        dd.detection_detail_id,
        dd.detection_detail_rank,
        dh.detection_header_id,
        dh.detection_header_time,
        ap.appliance_type_id,
        ap.appliance_type_name,
        cat.category_name,
        ap.appliance_type_power_pattern,
        dd.detection_detail_status,
        dd.detection_detail_confidence,
        dd.detection_detail_detected_power,
        dd.detection_detail_detected_frequency,
        dd.detection_detail_detected_thd
      FROM tblappliance_detection_details dd
      INNER JOIN tblappliance_detection_headers dh
        ON dh.detection_header_id = dd.detection_detail_header_id
      INNER JOIN tblappliance_types ap
        ON ap.appliance_type_id = dd.detection_detail_appliance_type_id
      INNER JOIN tblappliance_categories cat
        ON cat.category_id = ap.appliance_type_category_id
      WHERE dd.detection_detail_header_id = ?
      ORDER BY dd.detection_detail_rank ASC, dd.detection_detail_id ASC
    `,
    [latestHeader.detection_header_id],
  );

  const appliances = detailRows.map((row) => ({
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
  }));

  const totalDetectedPower = appliances.reduce(
    (sum, appliance) => sum + appliance.detectedPower,
    0,
  );

  return mapDetectionResult(
    latestHeader.detection_header_id,
    latestHeader.detection_header_time,
    appliances.map((appliance) => ({
      ...appliance,
      powerShare: totalDetectedPower > 0
        ? round(appliance.detectedPower / totalDetectedPower)
        : 0,
    })),
  );
}
