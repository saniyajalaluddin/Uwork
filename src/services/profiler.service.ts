import Papa from "papaparse";
import * as XLSX from "xlsx";
import fs from "fs";
import { Readable } from "stream";
import { sanitizeSpreadsheetCell } from "../lib/security/sanitize";
import { containsFormulaInjection } from "../lib/security/file-validator";
import { incrementCounter, recordDuration } from "../lib/observability/metrics";
import { logger } from "../lib/observability/logger";

export interface ColumnProfile {
  name: string;
  originalName: string;
  dataType: "NUMERIC" | "TEXT" | "DATE" | "BOOLEAN" | "CATEGORICAL";
  inferredBusinessRole:
    | "REVENUE"
    | "SALES_VOLUME"
    | "PROFIT"
    | "COST"
    | "DISCOUNT"
    | "CUSTOMER_ID"
    | "PRODUCT_ID"
    | "DATE_TIME"
    | "REGION"
    | "GENERIC_DIMENSION"
    | "GENERIC_METRIC";
  nullCount: number;
  uniqueCount: number;
  sampleValues: string[];
  summaryStats: {
    min?: number;
    max?: number;
    mean?: number;
    median?: number;
    std?: number;
  };
}

export interface ProfilingMemoryStats {
  initialHeapMB: number;
  peakHeapMB: number;
  finalHeapMB: number;
  heapDeltaMB: number;
  durationMs: number;
  chunksProcessed: number;
}

export interface ProfilingResult {
  rowCount: number;
  columnCount: number;
  columns: ColumnProfile[];
  qualityScore: number;
  duplicateRows: number;
  issues: Array<{
    code: string;
    column?: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    message: string;
  }>;
  parsedRows: Record<string, any>[];
  memoryStats?: ProfilingMemoryStats;
}

export interface ChunkedProfilerOptions {
  chunkSize?: number;
  sampleRowsLimit?: number;
  onProgress?: (progress: { rowsProcessed: number; estimatedTotalRows?: number }) => void;
  trackMemory?: boolean;
}

/**
 * Online accumulator for column statistics to stream datasets with bounded O(1) memory.
 */
interface ColumnAccumulator {
  originalName: string;
  cleanName: string;
  nullCount: number;
  nonNullCount: number;
  sampleValues: string[];
  uniqueSet: Set<string>;
  hasFormulaInjection: boolean;
  typeSampleValues: any[];

  // Welford's algorithm variables for numerically stable mean & variance
  numericCount: number;
  dateCount: number;
  boolCount: number;
  minVal: number;
  maxVal: number;
  welfordM: number;
  welfordS: number;
  numericReservoir: number[]; // Reservoir sample (max 2,000) for exact/near-exact median calculation
}

export class StreamingStatsAccumulator {
  public totalRows = 0;
  public columns = new Map<string, ColumnAccumulator>();
  public columnKeys: string[] = [];
  public previewRows: Record<string, any>[] = [];
  public sampleRowsLimit: number;
  public seenFingerprints = new Set<string>();
  public duplicateSampleCount = 0;
  public duplicateSampleSize = 0;
  public chunksCount = 0;
  public peakHeapUsed = 0;
  public initialHeapUsed = 0;
  public startTime = performance.now();

  constructor(sampleRowsLimit = 100) {
    this.sampleRowsLimit = sampleRowsLimit;
    this.initialHeapUsed = process.memoryUsage().heapUsed;
    this.peakHeapUsed = this.initialHeapUsed;
  }

  private getOrInitColumn(key: string): ColumnAccumulator {
    let col = this.columns.get(key);
    if (!col) {
      col = {
        originalName: key,
        cleanName: key.trim(),
        nullCount: 0,
        nonNullCount: 0,
        sampleValues: [],
        uniqueSet: new Set<string>(),
        hasFormulaInjection: false,
        typeSampleValues: [],
        numericCount: 0,
        dateCount: 0,
        boolCount: 0,
        minVal: Infinity,
        maxVal: -Infinity,
        welfordM: 0,
        welfordS: 0,
        numericReservoir: [],
      };
      this.columns.set(key, col);
      this.columnKeys.push(key);
    }
    return col;
  }

  public processRow(row: Record<string, any>): void {
    this.totalRows++;

    // Preview buffer (capped to avoid memory bloat)
    if (this.previewRows.length < this.sampleRowsLimit) {
      this.previewRows.push({ ...row });
    }

    // Rolling duplicate fingerprinting (first 2,000 rows sample)
    if (this.totalRows <= 2000) {
      this.duplicateSampleSize++;
      const fingerprint = JSON.stringify(row);
      if (this.seenFingerprints.has(fingerprint)) {
        this.duplicateSampleCount++;
      } else {
        this.seenFingerprints.add(fingerprint);
      }
    }

    const rowKeys = Object.keys(row);
    // Ensure all discovered keys are tracked
    for (const key of rowKeys) {
      if (!this.columns.has(key)) {
        this.getOrInitColumn(key);
      }
    }

    for (const key of this.columnKeys) {
      const col = this.getOrInitColumn(key);
      const val = row[key];

      const isNull =
        val === null ||
        val === undefined ||
        val === "" ||
        (typeof val === "string" && val.trim() === "");

      if (isNull) {
        col.nullCount++;
      } else {
        col.nonNullCount++;

        // Formula injection check
        if (!col.hasFormulaInjection && containsFormulaInjection(val)) {
          col.hasFormulaInjection = true;
        }

        // Distinct sample values for UI preview
        const sanitizedVal = String(sanitizeSpreadsheetCell(val));
        if (col.sampleValues.length < 10 && !col.sampleValues.includes(sanitizedVal)) {
          col.sampleValues.push(sanitizedVal);
        }

        // Bounded unique set (capped at 5,000 to prevent OOM on high-cardinality keys)
        if (col.uniqueSet.size < 5000) {
          col.uniqueSet.add(String(val).trim().toLowerCase());
        }

        // Type sampling (first 100 non-null values)
        if (col.typeSampleValues.length < 100) {
          col.typeSampleValues.push(val);
        }

        // Value parsing & Welford algorithm
        if (typeof val === "number" && !isNaN(val)) {
          col.numericCount++;
          this.updateNumericStats(col, val);
        } else if (typeof val === "boolean") {
          col.boolCount++;
        } else if (val instanceof Date) {
          col.dateCount++;
        } else if (typeof val === "string") {
          const trimmed = val.trim();
          const num = Number(trimmed);
          if (trimmed !== "" && !isNaN(num)) {
            col.numericCount++;
            this.updateNumericStats(col, num);
          } else if (
            (trimmed.includes("-") || trimmed.includes("/")) &&
            !isNaN(Date.parse(trimmed))
          ) {
            col.dateCount++;
          }
        }
      }
    }
  }

  private updateNumericStats(col: ColumnAccumulator, val: number): void {
    if (val < col.minVal) col.minVal = val;
    if (val > col.maxVal) col.maxVal = val;

    const count = col.numericCount;
    const delta = val - col.welfordM;
    col.welfordM += delta / count;
    const delta2 = val - col.welfordM;
    col.welfordS += delta * delta2;

    // Reservoir sampling for median (capacity: 2,000 values)
    if (col.numericReservoir.length < 2000) {
      col.numericReservoir.push(val);
    } else {
      const j = Math.floor(Math.random() * count);
      if (j < 2000) {
        col.numericReservoir[j] = val;
      }
    }
  }

  public processChunk(rows: Record<string, any>[]): void {
    this.chunksCount++;
    for (let i = 0; i < rows.length; i++) {
      this.processRow(rows[i]);
    }

    const currentHeap = process.memoryUsage().heapUsed;
    if (currentHeap > this.peakHeapUsed) {
      this.peakHeapUsed = currentHeap;
    }
  }

  public finalize(memoryStatsOverride?: ProfilingMemoryStats): ProfilingResult {
    if (this.totalRows === 0) {
      return {
        rowCount: 0,
        columnCount: 0,
        columns: [],
        qualityScore: 0,
        duplicateRows: 0,
        issues: [
          {
            code: "EMPTY_DATASET",
            severity: "CRITICAL",
            message: "The dataset contains no data rows.",
          },
        ],
        parsedRows: [],
      };
    }

    const columnProfiles: ColumnProfile[] = [];
    const issues: ProfilingResult["issues"] = [];
    let totalDeductions = 0;

    // Estimate duplicate rows
    let estimatedDuplicates = 0;
    if (this.duplicateSampleSize > 0 && this.duplicateSampleCount > 0) {
      estimatedDuplicates = Math.round(
        (this.duplicateSampleCount / this.duplicateSampleSize) * this.totalRows
      );
      const dupPct = (estimatedDuplicates / this.totalRows) * 100;
      totalDeductions += Math.min(15, dupPct * 2);
      issues.push({
        code: "DUPLICATE_ROWS",
        severity: dupPct > 5 ? "HIGH" : "MEDIUM",
        message: `Detected approximately ${estimatedDuplicates} duplicate rows (${dupPct.toFixed(1)}%).`,
      });
    }

    for (const key of this.columnKeys) {
      const col = this.columns.get(key)!;
      const cleanName = col.cleanName;
      const nullCount = col.nullCount;
      const nullPct = (nullCount / this.totalRows) * 100;
      const uniqueCount = col.uniqueSet.size;

      // Detect Data Type from sample
      const testSampleSize = Math.max(1, col.typeSampleValues.length);
      let dataType: ColumnProfile["dataType"] = "TEXT";

      if (col.numericCount / testSampleSize > 0.8) {
        dataType = "NUMERIC";
      } else if (col.dateCount / testSampleSize > 0.8) {
        dataType = "DATE";
      } else if (col.boolCount / testSampleSize > 0.8) {
        dataType = "BOOLEAN";
      } else if (uniqueCount < 50 && uniqueCount / this.totalRows < 0.2) {
        dataType = "CATEGORICAL";
      }

      // Infer Business Role
      const lowerKey = cleanName.toLowerCase();
      let inferredBusinessRole: ColumnProfile["inferredBusinessRole"] =
        dataType === "NUMERIC" ? "GENERIC_METRIC" : "GENERIC_DIMENSION";

      if (
        lowerKey.includes("date") ||
        lowerKey.includes("time") ||
        lowerKey.includes("day") ||
        lowerKey.includes("month") ||
        dataType === "DATE"
      ) {
        inferredBusinessRole = "DATE_TIME";
      } else if (
        lowerKey.includes("revenue") ||
        lowerKey.includes("sales") ||
        lowerKey.includes("total") ||
        lowerKey.includes("turnover") ||
        lowerKey.includes("amount")
      ) {
        inferredBusinessRole = "REVENUE";
      } else if (
        lowerKey.includes("profit") ||
        lowerKey.includes("margin") ||
        lowerKey.includes("ebitda")
      ) {
        inferredBusinessRole = "PROFIT";
      } else if (
        lowerKey.includes("cost") ||
        lowerKey.includes("cogs") ||
        lowerKey.includes("expense")
      ) {
        inferredBusinessRole = "COST";
      } else if (
        lowerKey.includes("unit") ||
        lowerKey.includes("qty") ||
        lowerKey.includes("quantity") ||
        lowerKey.includes("volume")
      ) {
        inferredBusinessRole = "SALES_VOLUME";
      } else if (lowerKey.includes("discount")) {
        inferredBusinessRole = "DISCOUNT";
      } else if (
        lowerKey.includes("customer") ||
        lowerKey.includes("client") ||
        lowerKey.includes("user_id") ||
        lowerKey.includes("buyer")
      ) {
        inferredBusinessRole = "CUSTOMER_ID";
      } else if (
        lowerKey.includes("product") ||
        lowerKey.includes("item") ||
        lowerKey.includes("sku")
      ) {
        inferredBusinessRole = "PRODUCT_ID";
      } else if (
        lowerKey.includes("region") ||
        lowerKey.includes("country") ||
        lowerKey.includes("territory") ||
        lowerKey.includes("state") ||
        lowerKey.includes("city")
      ) {
        inferredBusinessRole = "REGION";
      }

      // Compute summary statistics if NUMERIC
      const summaryStats: ColumnProfile["summaryStats"] = {};
      if (dataType === "NUMERIC" && col.numericCount > 0) {
        summaryStats.min = col.minVal !== Infinity ? col.minVal : 0;
        summaryStats.max = col.maxVal !== -Infinity ? col.maxVal : 0;
        summaryStats.mean = Math.round(col.welfordM * 100) / 100;

        const variance = col.numericCount > 0 ? col.welfordS / col.numericCount : 0;
        summaryStats.std = Math.round(Math.sqrt(Math.max(0, variance)) * 100) / 100;

        // Calculate median from reservoir sample
        if (col.numericReservoir.length > 0) {
          const sorted = [...col.numericReservoir].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          summaryStats.median =
            sorted.length % 2 !== 0
              ? sorted[mid]
              : (sorted[mid - 1] + sorted[mid]) / 2;
        }

        // Check for negative values in revenue/sales metrics
        if (
          (inferredBusinessRole === "REVENUE" || inferredBusinessRole === "SALES_VOLUME") &&
          summaryStats.min !== undefined &&
          summaryStats.min < 0
        ) {
          totalDeductions += 5;
          issues.push({
            code: "NEGATIVE_METRIC_VALUES",
            column: cleanName,
            severity: "MEDIUM",
            message: `Negative values found in metric column '${cleanName}' (min: ${summaryStats.min}).`,
          });
        }
      }

      // Check missing values
      if (nullPct > 0) {
        if (nullPct > 10) {
          totalDeductions += Math.min(10, nullPct * 0.5);
          issues.push({
            code: "HIGH_NULL_COUNT",
            column: cleanName,
            severity: nullPct > 30 ? "HIGH" : "MEDIUM",
            message: `${nullPct.toFixed(1)}% missing values in column '${cleanName}'.`,
          });
        } else {
          totalDeductions += nullPct * 0.2;
        }
      }

      // Formula injection deduction
      if (col.hasFormulaInjection) {
        totalDeductions += 10;
        issues.push({
          code: "FORMULA_INJECTION_DETECTED",
          column: cleanName,
          severity: "HIGH",
          message: `Potential spreadsheet formula injection detected in column '${cleanName}' (=, +, -, @). Values sanitized.`,
        });
      }

      columnProfiles.push({
        name: cleanName,
        originalName: col.originalName,
        dataType,
        inferredBusinessRole,
        nullCount,
        uniqueCount,
        sampleValues: col.sampleValues.slice(0, 5),
        summaryStats,
      });
    }

    // Role completeness validation
    const hasDate = columnProfiles.some((c) => c.inferredBusinessRole === "DATE_TIME");
    const hasMetric = columnProfiles.some(
      (c) =>
        c.inferredBusinessRole === "REVENUE" ||
        c.inferredBusinessRole === "SALES_VOLUME" ||
        c.dataType === "NUMERIC"
    );

    if (!hasDate) {
      totalDeductions += 15;
      issues.push({
        code: "NO_DATE_COLUMN",
        severity: "HIGH",
        message: "No date or timestamp dimension automatically detected. Forecasting requires a temporal axis.",
      });
    }

    if (!hasMetric) {
      totalDeductions += 20;
      issues.push({
        code: "NO_METRIC_COLUMN",
        severity: "CRITICAL",
        message: "No quantitative numerical metric detected to aggregate or forecast.",
      });
    }

    const qualityScore = Math.max(10, Math.round(100 - totalDeductions));
    const finalMemory = process.memoryUsage();
    const durationMs = Math.round((performance.now() - this.startTime) * 100) / 100;

    const memoryStats: ProfilingMemoryStats = memoryStatsOverride || {
      initialHeapMB: Math.round((this.initialHeapUsed / (1024 * 1024)) * 100) / 100,
      peakHeapMB: Math.round((this.peakHeapUsed / (1024 * 1024)) * 100) / 100,
      finalHeapMB: Math.round((finalMemory.heapUsed / (1024 * 1024)) * 100) / 100,
      heapDeltaMB:
        Math.round(((this.peakHeapUsed - this.initialHeapUsed) / (1024 * 1024)) * 100) / 100,
      durationMs,
      chunksProcessed: Math.max(1, this.chunksCount),
    };

    return {
      rowCount: this.totalRows,
      columnCount: this.columnKeys.length,
      columns: columnProfiles,
      qualityScore,
      duplicateRows: estimatedDuplicates,
      issues,
      parsedRows: this.previewRows,
      memoryStats,
    };
  }
}

/**
 * Parses file buffer into memory (retained for backward compatibility).
 */
export function parseFileBuffer(
  buffer: Buffer,
  fileName: string
): Record<string, any>[] {
  const isXlsx = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");

  if (isXlsx) {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    return XLSX.utils.sheet_to_json(sheet, { defval: null });
  } else {
    const text = buffer.toString("utf-8");
    const parsed = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
    });
    return parsed.data as Record<string, any>[];
  }
}

/**
 * Standard in-memory profiling function (backward compatible, now enhanced with memory metrics).
 */
export function profileDataset(
  rows: Record<string, any>[],
  options?: ChunkedProfilerOptions
): ProfilingResult {
  if (!rows || rows.length === 0) {
    return {
      rowCount: 0,
      columnCount: 0,
      columns: [],
      qualityScore: 0,
      duplicateRows: 0,
      issues: [
        {
          code: "EMPTY_DATASET",
          severity: "CRITICAL",
          message: "The dataset contains no data rows.",
        },
      ],
      parsedRows: [],
    };
  }

  // When called on an in-memory array, keep all rows in parsedRows unless explicitly capped
  const sampleLimit = options?.sampleRowsLimit ?? rows.length;
  const chunkSize = options?.chunkSize ?? 2500;
  const accumulator = new StreamingStatsAccumulator(sampleLimit);

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    accumulator.processChunk(chunk);
    if (options?.onProgress) {
      options.onProgress({ rowsProcessed: accumulator.totalRows, estimatedTotalRows: rows.length });
    }
  }

  const result = accumulator.finalize();
  // Ensure parsedRows has complete in-memory rows if requested
  if (options?.sampleRowsLimit === undefined) {
    result.parsedRows = rows;
  }
  return result;
}

/**
 * High-performance chunked file profiler streaming directly from disk or stream.
 * Employs PapaParse chunk streaming for CSV and chunked worksheet iteration for XLSX,
 * preventing V8 Heap Out-Of-Memory exceptions on large 50MB+ datasets.
 */
export async function profileFileChunked(
  source: string | Buffer | Readable,
  fileName: string,
  options?: ChunkedProfilerOptions
): Promise<ProfilingResult> {
  const isXlsx = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");
  const chunkSize = options?.chunkSize || 2500;
  const sampleRowsLimit = options?.sampleRowsLimit ?? 100;
  const accumulator = new StreamingStatsAccumulator(sampleRowsLimit);
  const startTimer = performance.now();

  if (isXlsx) {
    // Process XLSX workbook in bounded memory chunks
    let buffer: Buffer;
    if (typeof source === "string") {
      buffer = await fs.promises.readFile(source);
    } else if (Buffer.isBuffer(source)) {
      buffer = source;
    } else {
      // Readable stream
      const chunks: Buffer[] = [];
      for await (const chunk of source) {
        chunks.push(Buffer.from(chunk));
      }
      buffer = Buffer.concat(chunks);
    }

    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, dense: true });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    if (!sheet) {
      return accumulator.finalize();
    }

    const allRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: null });
    for (let i = 0; i < allRows.length; i += chunkSize) {
      const slice = allRows.slice(i, i + chunkSize);
      accumulator.processChunk(slice);
      if (options?.onProgress) {
        options.onProgress({
          rowsProcessed: accumulator.totalRows,
          estimatedTotalRows: allRows.length,
        });
      }
    }

    const duration = performance.now() - startTimer;
    incrementCounter("profiling_files_total", 1, { format: "xlsx" });
    recordDuration("profiling_duration_ms", duration, { format: "xlsx" });
    return accumulator.finalize();
  }

  // CSV Stream Processing using PapaParse chunk streaming
  return new Promise<ProfilingResult>((resolve, reject) => {
    let inputStream: NodeJS.ReadableStream;

    if (typeof source === "string") {
      inputStream = fs.createReadStream(source, { encoding: "utf-8" });
    } else if (Buffer.isBuffer(source)) {
      inputStream = Readable.from(source.toString("utf-8"));
    } else {
      inputStream = source;
    }

    Papa.parse(inputStream, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      chunkSize: chunkSize * 100, // Character buffer size
      chunk: (results, parser) => {
        if (results.data && results.data.length > 0) {
          const rows = results.data as Record<string, any>[];
          for (let i = 0; i < rows.length; i += chunkSize) {
            accumulator.processChunk(rows.slice(i, i + chunkSize));
          }
          if (options?.onProgress) {
            options.onProgress({ rowsProcessed: accumulator.totalRows });
          }
        }
      },
      complete: () => {
        const duration = performance.now() - startTimer;
        incrementCounter("profiling_files_total", 1, { format: "csv" });
        recordDuration("profiling_duration_ms", duration, { format: "csv" });
        resolve(accumulator.finalize());
      },
      error: (err) => {
        logger.error("Streaming profiler encountered CSV parsing failure", err);
        reject(err);
      },
    });
  });
}
