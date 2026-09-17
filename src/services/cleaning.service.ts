export interface CleaningOperation {
  type: "DEDUPLICATE" | "IMPUTE_NUMERIC" | "FILL_MISSING_TEXT" | "REMOVE_NEGATIVE_VALUES" | "TRIM_WHITESPACE";
  column?: string;
  strategy?: "MEAN" | "MEDIAN" | "ZERO" | "CONSTANT" | "MODE";
  constantValue?: any;
}

export interface CleaningResult {
  cleanedRows: Record<string, any>[];
  rowsAffected: number;
  operationsApplied: string[];
}

export function executeDataCleaning(
  rows: Record<string, any>[],
  operations: CleaningOperation[]
): CleaningResult {
  let currentRows = rows.map((r) => ({ ...r }));
  const operationsApplied: string[] = [];
  let rowsAffected = 0;

  for (const op of operations) {
    if (op.type === "DEDUPLICATE") {
      const initialCount = currentRows.length;
      const seen = new Set<string>();
      const deduped: Record<string, any>[] = [];

      for (const row of currentRows) {
        const fp = JSON.stringify(row);
        if (!seen.has(fp)) {
          seen.add(fp);
          deduped.push(row);
        }
      }

      const diff = initialCount - deduped.length;
      if (diff > 0) {
        rowsAffected += diff;
        operationsApplied.push(`Removed ${diff} exact duplicate rows.`);
        currentRows = deduped;
      }
    } else if (op.type === "TRIM_WHITESPACE") {
      let count = 0;
      for (const row of currentRows) {
        let changed = false;
        for (const [k, v] of Object.entries(row)) {
          if (typeof v === "string") {
            const trimmed = v.trim();
            if (trimmed !== v) {
              row[k] = trimmed;
              changed = true;
            }
          }
        }
        if (changed) count++;
      }
      if (count > 0) {
        rowsAffected += count;
        operationsApplied.push(`Trimmed leading/trailing whitespace across ${count} records.`);
      }
    } else if (op.type === "IMPUTE_NUMERIC" && op.column) {
      const col = op.column;
      const validNumbers = currentRows
        .map((r) => Number(r[col]))
        .filter((v) => !isNaN(v) && v !== null && v !== undefined);

      let fillValue = 0;
      if (op.strategy === "MEAN" && validNumbers.length > 0) {
        fillValue =
          validNumbers.reduce((a, b) => a + b, 0) / validNumbers.length;
      } else if (op.strategy === "MEDIAN" && validNumbers.length > 0) {
        const sorted = [...validNumbers].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        fillValue =
          sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      } else if (op.strategy === "CONSTANT" && op.constantValue !== undefined) {
        fillValue = Number(op.constantValue);
      }

      fillValue = Math.round(fillValue * 100) / 100;

      let imputedCount = 0;
      for (const row of currentRows) {
        if (
          row[col] === null ||
          row[col] === undefined ||
          row[col] === "" ||
          isNaN(Number(row[col]))
        ) {
          row[col] = fillValue;
          imputedCount++;
        }
      }

      if (imputedCount > 0) {
        rowsAffected += imputedCount;
        operationsApplied.push(
          `Imputed ${imputedCount} missing values in '${col}' with ${op.strategy} (${fillValue}).`
        );
      }
    } else if (op.type === "FILL_MISSING_TEXT" && op.column) {
      const col = op.column;
      const replacement = op.constantValue || "Unknown / Unspecified";
      let filledCount = 0;

      for (const row of currentRows) {
        if (
          row[col] === null ||
          row[col] === undefined ||
          String(row[col]).trim() === ""
        ) {
          row[col] = replacement;
          filledCount++;
        }
      }

      if (filledCount > 0) {
        rowsAffected += filledCount;
        operationsApplied.push(
          `Replaced ${filledCount} blank text entries in '${col}' with '${replacement}'.`
        );
      }
    }
  }

  return {
    cleanedRows: currentRows,
    rowsAffected,
    operationsApplied,
  };
}

