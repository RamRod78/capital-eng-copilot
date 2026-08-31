import { pool } from '../db/index.js';
import {
  DISCIPLINE_CODE_MAP,
  formatRequirementCode,
  getDisciplineCode,
  parseRequirementCode,
  assignUniqueRequirementCodes,
} from '../../shared/schemas.js';

/**
 * Queries the database for the current maximum requirement sequence number per discipline
 * and returns the next assignable sequence number for each discipline.
 * 
 * E.g., if max sequence in DB for Mechanical (MEC) is 14, returns { MEC: 15, ... }
 */
export async function getNextRequirementSequences(): Promise<Record<string, number>> {
  const nextSequences: Record<string, number> = {};

  // Initialize baseline of 1 for all known disciplines
  for (const discCode of Object.values(DISCIPLINE_CODE_MAP)) {
    nextSequences[discCode] = 1;
  }

  try {
    const client = await pool.connect();
    try {
      const res = await client.query(`
        SELECT 
          UPPER(substring(requirement_code from 'REQ-([A-Za-z0-9]+)-\\d+')) AS disc_code,
          MAX(NULLIF(substring(requirement_code from '\\d+$'), '')::bigint) AS max_seq
        FROM extractions
        WHERE requirement_code ~ '^REQ-[A-Za-z0-9]+-\\d+$'
        GROUP BY UPPER(substring(requirement_code from 'REQ-([A-Za-z0-9]+)-\\d+'));
      `);

      for (const row of res.rows) {
        if (row.disc_code && row.max_seq !== null && row.max_seq !== undefined) {
          const maxNum = Number(row.max_seq);
          if (!isNaN(maxNum) && maxNum >= 0) {
            nextSequences[row.disc_code] = maxNum + 1;
          }
        }
      }
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.warn(
      `Could not query requirement code sequences from database (${err.message}). Using fallback baseline sequence numbers.`
    );
  }

  return nextSequences;
}

/**
 * Returns the next formatted requirement code for a given discipline.
 * E.g., "REQ-MEC-00000015"
 */
export async function getNextRequirementCode(discipline: string): Promise<string> {
  const discCode = getDisciplineCode(discipline);
  const nextSeqs = await getNextRequirementSequences();
  const nextSeq = nextSeqs[discCode] || 1;
  return formatRequirementCode(discipline, nextSeq);
}

/**
 * Returns a summary map of all disciplines to their next assignable requirement codes.
 */
export async function getNextRequirementCodesMap(): Promise<{
  sequences: Record<string, number>;
  formattedCodes: Record<string, string>;
}> {
  const sequences = await getNextRequirementSequences();
  const formattedCodes: Record<string, string> = {};

  for (const [discName, discCode] of Object.entries(DISCIPLINE_CODE_MAP)) {
    const nextSeq = sequences[discCode] || 1;
    formattedCodes[discName] = formatRequirementCode(discName, nextSeq);
  }

  return {
    sequences,
    formattedCodes,
  };
}

/**
 * Validates and re-sequences a list of items to guarantee global uniqueness against the database.
 * If incoming items have sequence collisions with already-persisted items or between each other,
 * re-assigns them starting from the live database next assignable sequences.
 */
export async function ensureGloballyUniqueCodes<T extends { requirement_code?: string | null; engineering_discipline?: string | null }>(
  items: T[]
): Promise<(T & { requirement_code: string })[]> {
  if (!items || items.length === 0) return [];

  const nextSequences = await getNextRequirementSequences();

  // Check if any incoming item has a collision or is invalid
  const seenCodes = new Set<string>();
  let needsReassignment = false;

  for (const it of items) {
    if (!it.requirement_code) {
      needsReassignment = true;
      break;
    }

    const parsed = parseRequirementCode(it.requirement_code);
    if (!parsed) {
      needsReassignment = true;
      break;
    }

    if (seenCodes.has(it.requirement_code)) {
      needsReassignment = true;
      break;
    }
    seenCodes.add(it.requirement_code);
  }

  if (needsReassignment) {
    return assignUniqueRequirementCodes(items, { startingSequence: nextSequences });
  }

  // Double check against existing codes in the database to prevent overwrites
  try {
    const client = await pool.connect();
    try {
      const codeList = Array.from(seenCodes);
      const res = await client.query(
        `SELECT requirement_code FROM extractions WHERE requirement_code = ANY($1::varchar[])`,
        [codeList]
      );

      if (res.rows.length > 0) {
        // Collisions detected with existing database records! Re-sequence with live offsets.
        return assignUniqueRequirementCodes(items, { startingSequence: nextSequences });
      }
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.warn(`Could not verify duplicate codes against database (${err.message}).`);
  }

  // All codes are valid and unique
  return items as (T & { requirement_code: string })[];
}
