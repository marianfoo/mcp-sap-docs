// In stdio mode, stdout is reserved for MCP messages. Route console diagnostics
// to stderr before loading server dependencies, including their startup logs.
console.log = console.error;
console.info = console.error;
console.debug = console.error;
