/**
 * abaplint integration for ABAP code linting
 * Accepts ABAP code directly as string input for analysis
 * 
 * SAFETY MEASURES:
 * - Input size limit: Prevents memory exhaustion from large payloads
 * - Execution timeout: Prevents indefinite hangs from complex/malicious code
 */

// Safety limits for server deployment
export const MAX_CODE_BYTES = 50 * 1024; // 50KB max input size
export const LINT_TIMEOUT_MS = 10000;    // 10 second timeout

// abaplint types for our return format
export interface LintFinding {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  ruleKey: string;
}

export interface LintResult {
  findings: LintFinding[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  success: boolean;
  error?: string;
}

// Default abaplint configuration for ABAP Cloud
const DEFAULT_CONFIG = {
  global: {
    files: "/**/*.*"
  },
  syntax: {
    version: "Cloud",
    errorNamespace: "^(Z|Y|LCL_|TY_|LIF_)"
  },
  rules: {
    // Core syntax and parsing rules
    "parser_error": true,
    "check_syntax": true,
    "unknown_types": true,
    
    // Code quality rules
    "7bit_ascii": true,
    "begin_end_names": true,
    "cloud_types": true,
    "empty_statement": true,
    "empty_structure": true,
    "exit_or_check": true,
    "functional_writing": true,
    "if_in_if": true,
    "implement_methods": true,
    "indentation": true,
    "keyword_case": true,
    "line_length": { "length": 120 },
    "max_one_statement": true,
    "method_length": { "statements": 100 },
    "nesting": { "depth": 5 },
    "obsolete_statement": true,
    "prefer_is_not": true,
    "prefer_returning_to_exporting": true,
    "prefer_xsdbool": true,
    "preferred_compare_operator": true,
    "sequential_blank": true,
    "short_case": true,
    "space_before_colon": true,
    "space_before_dot": true,
    "sql_escape_host_variables": true,
    "try_without_catch": true,
    "unreachable_code": true,
    "unused_variables": true,
    "use_bool_expression": true,
    "use_new": true,
    "when_others_last": true,
    "whitespace_end": true,
    
    // Naming conventions
    "class_attribute_names": true,
    "local_class_naming": true,
    "local_variable_names": true,
    "method_parameter_names": true,
    "object_naming": true,
    "types_naming": true,
    
    // Disabled rules (too strict for snippets or generate noise)
    "abapdoc": false,
    "double_space": false,
    "empty_line_in_statement": false,
    "in_statement_indentation": false,
    "line_break_multiple_parameters": false,
    "line_only_punc": false,
    "max_one_method_parameter_per_line": false,
    "no_public_attributes": false,
    "prefer_inline": false,
    "remove_descriptions": false,
    "downport": false,
    "start_at_tab": false,
    "newline_between_methods": false,
    "colon_missing_space": false,
    "contains_tab": false,
    "definitions_top": false,
    "global_class": false,
    "main_file_contents": false
  }
};

/**
 * Detect the ABAP file type from code content and return appropriate filename
 * abaplint uses filename extensions to determine how to parse and analyze code
 */
function detectFilename(code: string, providedFilename: string): string {
  // If user provided a specific filename with proper extension, use it
  if (providedFilename && /\.(clas|intf|fugr|prog|ddls|dcls|bdef|srvd|srvb)\.abap$/i.test(providedFilename)) {
    return providedFilename;
  }
  
  const upperCode = code.toUpperCase();
  
  // Try to extract a name from the code for more meaningful filenames
  let name = 'code';
  
  // Detect CLASS
  const classMatch = code.match(/CLASS\s+(\w+)\s+DEFINITION/i);
  if (classMatch) {
    name = classMatch[1].toLowerCase();
    return `${name}.clas.abap`;
  }
  
  // Detect INTERFACE  
  const intfMatch = code.match(/INTERFACE\s+(\w+)\s*\./i);
  if (intfMatch) {
    name = intfMatch[1].toLowerCase();
    return `${name}.intf.abap`;
  }
  
  // Detect FUNCTION-POOL or FUNCTION
  if (upperCode.includes('FUNCTION-POOL') || upperCode.includes('FUNCTION ')) {
    const funcMatch = code.match(/FUNCTION\s+(\w+)/i);
    if (funcMatch) {
      name = funcMatch[1].toLowerCase();
    }
    return `${name}.fugr.abap`;
  }
  
  // Detect REPORT or PROGRAM
  const reportMatch = code.match(/REPORT\s+(\w+)/i);
  if (reportMatch) {
    name = reportMatch[1].toLowerCase();
    return `${name}.prog.abap`;
  }
  
  // Detect TYPE-POOL
  const typePoolMatch = code.match(/TYPE-POOL\s+(\w+)/i);
  if (typePoolMatch) {
    name = typePoolMatch[1].toLowerCase();
    return `${name}.type.abap`;
  }
  
  // Detect INCLUDE (treat as program)
  const includeMatch = code.match(/^\s*\*.*INCLUDE/im) || upperCode.includes('INCLUDE ');
  if (includeMatch && !upperCode.includes('CLASS ') && !upperCode.includes('INTERFACE ')) {
    // Only treat as include if it's clearly an include file (no class/interface)
    return `${name}.prog.abap`;
  }
  
  // Detect CDS data definition (DEFINE VIEW, DEFINE TABLE FUNCTION, etc.)
  if (upperCode.includes('DEFINE VIEW') || upperCode.includes('@ACCESSCONTROL') || 
      upperCode.includes('DEFINE TABLE FUNCTION')) {
    const cdsMatch = code.match(/DEFINE\s+(?:ROOT\s+)?VIEW\s+(?:ENTITY\s+)?(\w+)/i);
    if (cdsMatch) {
      name = cdsMatch[1].toLowerCase();
    }
    return `${name}.ddls.asddls`;
  }
  
  // Detect behavior definition
  if (upperCode.includes('MANAGED IMPLEMENTATION') || upperCode.includes('UNMANAGED IMPLEMENTATION') ||
      upperCode.includes('DEFINE BEHAVIOR FOR')) {
    const bdefMatch = code.match(/DEFINE\s+BEHAVIOR\s+FOR\s+(\w+)/i);
    if (bdefMatch) {
      name = bdefMatch[1].toLowerCase();
    }
    return `${name}.bdef.asbdef`;
  }
  
  // Detect access control (DCL)
  if (upperCode.includes('@MAPPINGROLE') || upperCode.includes('DEFINE ROLE')) {
    return `${name}.dcls.asdcls`;
  }
  
  // Default: treat as class file since that's most common for code snippets
  // and enables most lint rules
  return `${name}.clas.abap`;
}

/**
 * Execute linting with timeout protection
 * Prevents indefinite hangs from complex or malicious code patterns
 */
async function lintWithTimeout<T>(
  lintPromise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Lint operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  try {
    const result = await Promise.race([lintPromise, timeoutPromise]);
    clearTimeout(timeoutHandle!);
    return result;
  } catch (error) {
    clearTimeout(timeoutHandle!);
    throw error;
  }
}

/**
 * Core linting logic - separated for timeout wrapping
 */
async function performLint(
  code: string,
  effectiveFilename: string,
  version: "Cloud" | "Standard"
): Promise<LintFinding[]> {
  // Dynamically import abaplint (it's a large module)
  const abaplint = await import('@abaplint/core');
  
  // Create config based on version
  const config = {
    ...DEFAULT_CONFIG,
    syntax: {
      ...DEFAULT_CONFIG.syntax,
      version: version
    }
  };
  
  // Create abaplint registry with configuration
  const reg = new abaplint.Registry(new abaplint.Config(JSON.stringify(config)));
  
  // Add the code as a virtual file with detected filename
  reg.addFile(new abaplint.MemoryFile(effectiveFilename, code));
  
  // Parse and run analysis
  await reg.parseAsync();
  const issues = reg.findIssues();
  
  // Convert abaplint issues to our format
  return issues.map(issue => ({
    line: issue.getStart().getRow(),
    column: issue.getStart().getCol(),
    endLine: issue.getEnd().getRow(),
    endColumn: issue.getEnd().getCol(),
    message: issue.getMessage(),
    severity: mapSeverity(issue.getSeverity()),
    ruleKey: issue.getKey()
  }));
}

/**
 * Lint ABAP code directly
 * 
 * This function performs static analysis on ABAP source code passed as a string
 * and returns structured findings.
 * 
 * SAFETY MEASURES:
 * - Input size limit: Code exceeding MAX_CODE_BYTES (50KB) is rejected
 * - Execution timeout: Linting is aborted after LINT_TIMEOUT_MS (10s)
 * 
 * @param code - ABAP source code to analyze
 * @param filename - Optional filename hint (helps with file type detection, e.g., "test.clas.abap")
 * @param version - ABAP version: "Cloud" (default) or "Standard"
 * @returns LintResult with findings array
 */
export async function lintAbapCode(
  code: string,
  filename: string = "code.abap",
  version: "Cloud" | "Standard" = "Cloud"
): Promise<LintResult> {
  try {
    // Safety check: empty code
    if (!code || code.trim().length === 0) {
      return {
        findings: [],
        errorCount: 0,
        warningCount: 0,
        infoCount: 0,
        success: true
      };
    }
    
    // Safety check: input size limit (use byte length for accurate size)
    const codeByteLength = Buffer.byteLength(code, 'utf8');
    if (codeByteLength > MAX_CODE_BYTES) {
      return {
        findings: [],
        errorCount: 0,
        warningCount: 0,
        infoCount: 0,
        success: false,
        error: `Code size (${Math.round(codeByteLength / 1024)}KB) exceeds maximum allowed size (${Math.round(MAX_CODE_BYTES / 1024)}KB). Please reduce the code size.`
      };
    }
    
    // Auto-detect filename from code content for proper abaplint analysis
    const effectiveFilename = detectFilename(code, filename);
    
    // Execute linting with timeout protection
    const findings = await lintWithTimeout(
      performLint(code, effectiveFilename, version),
      LINT_TIMEOUT_MS
    );
    
    // Count by severity
    const errorCount = findings.filter(f => f.severity === 'error').length;
    const warningCount = findings.filter(f => f.severity === 'warning').length;
    const infoCount = findings.filter(f => f.severity === 'info').length;
    
    return {
      findings,
      errorCount,
      warningCount,
      infoCount,
      success: true
    };
    
  } catch (error: any) {
    return {
      findings: [],
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      success: false,
      error: `Lint failed: ${error.message}`
    };
  }
}

/**
 * Map abaplint severity to our format
 */
function mapSeverity(severity: any): 'error' | 'warning' | 'info' {
  const severityStr = String(severity).toLowerCase();
  if (severityStr.includes('error')) return 'error';
  if (severityStr.includes('warning')) return 'warning';
  return 'info';
}

