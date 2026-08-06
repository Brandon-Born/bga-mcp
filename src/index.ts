export {
  CliUsageError,
  DEFAULT_SERVER_CONFIG,
  HELP_TEXT,
  parseCliArguments,
  type CliAction,
  type ServerConfig,
} from './config.js';
export {
  BgaMcpError,
  ERROR_CODES,
  ERROR_CONTRACT_VERSION,
  PUBLIC_ERROR_CODES,
  PolicyViolationError,
  PublicErrorSchema,
  getPublicErrorJsonSchema,
  parsePublicError,
  toPublicError,
  type ErrorCode,
  type PublicError,
} from './errors.js';
export {
  DEFAULT_MAX_LISTED_FILES,
  DEFAULT_MAX_LIST_DEPTH,
  DEFAULT_MAX_OUTPUT_BYTES,
  DEFAULT_OPERATION_TIMEOUT_MS,
  DEFAULT_POLICY_CONFIG,
  MAX_OPERATION_TIMEOUT_MS,
  MAX_OUTPUT_BYTES_LIMIT,
  PolicyBoundary,
  createPolicyBoundary,
  type MutationMode,
  type MutationRequest,
  type PolicyConfig,
  type ProjectFile,
  type ProjectListing,
} from './policy.js';
export {
  REDACTED_CONNECTION,
  REDACTED_CREDENTIAL,
  REDACTED_EMAIL,
  REDACTED_PATH,
  REDACTED_PLAYER,
  REDACTED_PRIVATE_KEY,
  REDACTED_SESSION,
  redactPath,
  redactText,
  redactValue,
  type RedactionOptions,
} from './redaction.js';
export {
  DIAGNOSTIC_CONTRACT_VERSION,
  DIAGNOSTIC_SCHEMA_ID,
  DiagnosticCertaintySchema,
  DiagnosticEvidenceSchema,
  DiagnosticFindingSchema,
  DiagnosticHeuristicSchema,
  DiagnosticIssueSchema,
  DiagnosticLocationSchema,
  DiagnosticResultSchema,
  DiagnosticSeveritySchema,
  DiagnosticSuggestionSchema,
  UnsupportedSyntaxSchema,
  getDiagnosticResultJsonSchema,
  parseDiagnosticResult,
  type DiagnosticCertainty,
  type DiagnosticEvidence,
  type DiagnosticFinding,
  type DiagnosticLocation,
  type DiagnosticResult,
  type DiagnosticSeverity,
  type DiagnosticSuggestion,
} from './diagnostics.js';
export { formatErrorLog, formatMessageLog } from './logging.js';
export { SERVER_NAME, SERVER_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from './metadata.js';
export {
  createDefaultServer,
  createServer,
  createServerWithPolicy,
  type ServerDependencies,
} from './server.js';
export {
  INSPECT_PROJECT_TOOL,
  InspectProjectInputSchema,
  InspectProjectOutputSchema,
  registerInspectProject,
  summarize,
  type InspectProjectResult,
} from './tools/inspect-project.js';
export {
  VALIDATE_STATE_MACHINE_TOOL,
  ValidateStateMachineInputSchema,
  ValidateStateMachineOutputSchema,
  registerValidateStateMachine,
  summarizeValidation,
  type ValidateStateMachineResult,
} from './tools/validate-state-machine.js';
export {
  VALIDATE_ACTION_CONTRACTS_TOOL,
  ValidateActionContractsInputSchema,
  ValidateActionContractsOutputSchema,
  registerValidateActionContracts,
  summarizeActionContracts,
  type ValidateActionContractsResult,
} from './tools/validate-action-contracts.js';
export {
  ACTION_CONTRACT_RULES,
  validateActionContracts,
  type ActionContractRule,
  type ActionContractSource,
  type ActionContractTrace,
} from './rules/action-contracts.js';
export {
  parseClientActionCalls,
  parsePhpMethodNames,
  parseServerActionEntries,
  type ClientActionCall,
  type ServerActionEntry,
} from './project/actions.js';
export {
  INITIAL_STATE_ID,
  KNOWN_STATE_TYPES,
  STATE_MACHINE_RULES,
  validateStateMachine,
  type PhpSource,
  type StateMachineRule,
} from './rules/state-machine.js';
export { loadProjectContext, type ProjectContext } from './tools/project-context.js';
export {
  detectLayout,
  type LayoutCertainty,
  type LayoutDetection,
  type LayoutSignal,
  type ProjectLayout,
} from './project/layout.js';
export {
  buildProjectModel,
  type ComponentId,
  type ProjectComponent,
  type ProjectModel,
  type ProjectReader,
  type ProjectStates,
} from './project/model.js';
export {
  parseJsonc,
  parseLegacyMetadata,
  parseLegacyStates,
  parseModernMetadata,
  type GameMetadata,
  type ParseOutcome,
  type StateDefinition,
} from './project/parse.js';
