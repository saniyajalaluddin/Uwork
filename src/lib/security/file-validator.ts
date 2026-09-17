/**
 * UWORK Enterprise File & MIME Validator
 * 
 * Inspects binary magic bytes and file content signatures to prevent:
 * 1. File extension spoofing (e.g. executable/ELF/PE binaries disguised as .xlsx or .csv)
 * 2. Null byte injection
 * 3. Corrupted or empty file payloads
 * 4. Formula injection detection
 */

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  fileType?: "CSV" | "XLSX" | "XLS";
  mimeType?: string;
}

// Magic byte signatures
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK.. (XLSX, DOCX, ZIP)
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // Compound File Binary (.xls)
const PE_MAGIC = [0x4d, 0x5a]; // MZ (Windows .exe, .dll, .scr)
const ELF_MAGIC = [0x7f, 0x45, 0x4c, 0x46]; // \x7fELF (Linux binaries)
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF

function matchesSignature(buffer: Buffer, signature: number[]): boolean {
  if (buffer.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (buffer[i] !== signature[i]) return false;
  }
  return true;
}

/**
 * Validate uploaded file buffer against declared file extension and magic byte signatures
 */
export function validateFileBuffer(
  buffer: Buffer,
  declaredFileName: string
): FileValidationResult {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: "The uploaded file is empty (0 bytes)." };
  }

  const lowerName = declaredFileName.toLowerCase().trim();
  const isXlsxExt = lowerName.endsWith(".xlsx");
  const isXlsExt = lowerName.endsWith(".xls");
  const isCsvExt = lowerName.endsWith(".csv");

  if (!isXlsxExt && !isXlsExt && !isCsvExt) {
    return {
      valid: false,
      error: "Unsupported file extension. Only .csv, .xlsx, and .xls files are allowed.",
    };
  }

  // 1. Check for dangerous executable signatures
  if (matchesSignature(buffer, PE_MAGIC)) {
    return {
      valid: false,
      error: "Security Violation: Windows executable/binary detected (PE/MZ magic header).",
    };
  }

  if (matchesSignature(buffer, ELF_MAGIC)) {
    return {
      valid: false,
      error: "Security Violation: Executable Linux binary detected (ELF magic header).",
    };
  }

  if (matchesSignature(buffer, PDF_MAGIC)) {
    return {
      valid: false,
      error: "MIME Mismatch: PDF document uploaded where a spreadsheet was expected.",
    };
  }

  // 2. Validate XLSX
  if (isXlsxExt) {
    if (!matchesSignature(buffer, ZIP_MAGIC)) {
      return {
        valid: false,
        error: "File corruption: Declared .xlsx file is missing the standard PK Zip magic header.",
      };
    }
    return {
      valid: true,
      fileType: "XLSX",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }

  // 3. Validate legacy XLS
  if (isXlsExt) {
    if (!matchesSignature(buffer, OLE_MAGIC)) {
      return {
        valid: false,
        error: "File corruption: Declared .xls file is missing the standard OLE compound file header.",
      };
    }
    return {
      valid: true,
      fileType: "XLS",
      mimeType: "application/vnd.ms-excel",
    };
  }

  // 4. Validate CSV
  if (isCsvExt) {
    // Check first 2048 bytes for raw null bytes (text CSVs never contain raw \x00)
    const scanLength = Math.min(buffer.length, 2048);
    for (let i = 0; i < scanLength; i++) {
      if (buffer[i] === 0x00) {
        return {
          valid: false,
          error: "Security Violation: Non-text binary data or null bytes detected in CSV file.",
        };
      }
    }

    // Check if buffer is decodable UTF-8 string
    try {
      const sampleText = buffer.subarray(0, scanLength).toString("utf-8");
      // Must contain printable characters or line breaks
      if (!/[\w\r\n\t,;"']/.test(sampleText)) {
        return {
          valid: false,
          error: "Invalid CSV format: File contains no recognizable delimited text structure.",
        };
      }
    } catch {
      return {
        valid: false,
        error: "Encoding Error: CSV file could not be parsed as valid UTF-8 text.",
      };
    }

    return {
      valid: true,
      fileType: "CSV",
      mimeType: "text/csv",
    };
  }

  return { valid: false, error: "Unrecognized file format." };
}

/**
 * Detect spreadsheet formula injection in a string
 */
export function containsFormulaInjection(cellValue: unknown): boolean {
  if (typeof cellValue !== "string") return false;
  const trimmed = cellValue.trim();
  const triggerChars = ["=", "+", "-", "@", "\t", "\r"];
  return triggerChars.some((char) => trimmed.startsWith(char));
}

