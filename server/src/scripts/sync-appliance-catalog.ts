import { RowDataPacket } from 'mysql2';

import { pool } from '../config/db';
import {
  APPLIANCE_CATALOG,
  APPLIANCE_CATEGORY_NAMES,
} from '../shared/constants/appliance-catalog';

interface CategoryRow extends RowDataPacket {
  category_id: number;
  category_name: string;
}

async function main() {
  await pool.query(
    `
      INSERT IGNORE INTO tblappliance_categories (category_name)
      VALUES ${APPLIANCE_CATEGORY_NAMES.map(() => '(?)').join(', ')}
    `,
    APPLIANCE_CATEGORY_NAMES,
  );

  const [categoryRows] = await pool.query<CategoryRow[]>(
    `
      SELECT category_id, category_name
      FROM tblappliance_categories
      WHERE category_name IN (${APPLIANCE_CATEGORY_NAMES.map(() => '?').join(', ')})
    `,
    APPLIANCE_CATEGORY_NAMES,
  );

  const categoryIdByName = new Map(
    categoryRows.map((row) => [row.category_name, row.category_id]),
  );

  await pool.query(
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
      ON DUPLICATE KEY UPDATE
        appliance_type_category_id = VALUES(appliance_type_category_id),
        appliance_type_typical_power_w = VALUES(appliance_type_typical_power_w),
        appliance_type_power_factor = VALUES(appliance_type_power_factor),
        appliance_type_nominal_frequency_hz = VALUES(appliance_type_nominal_frequency_hz),
        appliance_type_frequency_tolerance = VALUES(appliance_type_frequency_tolerance),
        appliance_type_thd_reference = VALUES(appliance_type_thd_reference),
        appliance_type_harmonic_signature = VALUES(appliance_type_harmonic_signature),
        appliance_type_power_pattern = VALUES(appliance_type_power_pattern)
    `,
    APPLIANCE_CATALOG.flatMap((entry) => {
      const categoryId = categoryIdByName.get(entry.categoryName);

      if (!categoryId) {
        throw new Error(`Missing appliance category: ${entry.categoryName}`);
      }

      return [
        categoryId,
        entry.applianceTypeName,
        entry.typicalPowerW,
        entry.powerFactor,
        entry.nominalFrequencyHz,
        entry.frequencyTolerance,
        entry.thdReference,
        entry.harmonicSignature,
        entry.powerPattern,
      ];
    }),
  );

  console.log(`Appliance catalog synced successfully. ${APPLIANCE_CATALOG.length} appliance types are available.`);
}

main()
  .catch((error) => {
    console.error('Failed to sync appliance catalog.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
