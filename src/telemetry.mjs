import { ROOT_CONTEXT, SpanStatusCode, trace } from '@opentelemetry/api';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';

const DEFAULT_ENDPOINT = 'http://localhost:4318';

export const CORRELATION_ATTRIBUTE_KEYS = Object.freeze([
  'run.id',
  'disease.run.id',
  'candidate.id',
  'target.run.id',
  'target.name',
  'axis',
  'source.provider',
  'source.execution.id',
  'brightdata.collector.id',
  'brightdata.dataset.id',
  'port.run.id',
  'sponsor.request.id',
  'sponsor.result.id',
  'action.execution.id',
  'retry.attempt',
  'healing.request.id',
  'diligence.task.id',
  'diligence.decision.id',
  'workflow.id',
  'validation.status',
]);

const CORRELATION_ALIASES = Object.freeze({
  runId: 'run.id',
  diseaseRunId: 'disease.run.id',
  candidateId: 'candidate.id',
  targetRunId: 'target.run.id',
  targetName: 'target.name',
  sourceProvider: 'source.provider',
  sourceExecutionId: 'source.execution.id',
  brightdataCollectorId: 'brightdata.collector.id',
  brightdataDatasetId: 'brightdata.dataset.id',
  portRunId: 'port.run.id',
  sponsorRequestId: 'sponsor.request.id',
  sponsorResultId: 'sponsor.result.id',
  actionExecutionId: 'action.execution.id',
  retryAttempt: 'retry.attempt',
  healingRequestId: 'healing.request.id',
  diligenceTaskId: 'diligence.task.id',
  diligenceDecisionId: 'diligence.decision.id',
  workflowId: 'workflow.id',
  validationStatus: 'validation.status',
});

const SENSITIVE_KEY = /(?:^|[._-])(authorization|cookie|password|passwd|secret|token|credentials?|(?:api|ingestion|signoz)[._-]?key|headers?)(?:$|[._-])/i;
const SENSITIVE_TEXT = /(bearer\s+)[a-z0-9._~+/=-]+|((?:authorization|api[._-]?key|signoz[._-]?ingestion[._-]?key|ingestion[._-]?key|password|secret|token)\s*[=:]\s*)[^\s,;]+/gi;

export function redactSensitiveText(value) {
  return typeof value === 'string'
    ? value.replace(SENSITIVE_TEXT, (_match, bearerPrefix, assignmentPrefix) => `${bearerPrefix ?? assignmentPrefix}[REDACTED]`)
    : value;
}

export function sanitizeTelemetryAttributes(attributes = {}) {
  return Object.fromEntries(Object.entries(attributes)
    .filter(([key, value]) => value !== undefined && value !== null && !SENSITIVE_KEY.test(key))
    .map(([key, value]) => [key, typeof value === 'string' ? redactSensitiveText(value) : value]));
}

export function correlationAttributes(input = {}) {
  const normalized = {};
  for (const [inputKey, value] of Object.entries(input)) {
    const key = CORRELATION_ALIASES[inputKey] ?? inputKey;
    if (CORRELATION_ATTRIBUTE_KEYS.includes(key) && value !== undefined && value !== null && value !== '') {
      normalized[key] = key === 'axis' ? String(value).toUpperCase() : value;
    }
  }
  return sanitizeTelemetryAttributes(normalized);
}

function parseHeaders(value = '') {
  return Object.fromEntries(value.split(',').filter(Boolean).map((entry) => {
    const separator = entry.indexOf('=');
    if (separator < 1) throw new Error('OTEL_EXPORTER_OTLP_HEADERS must contain key=value pairs');
    return [decodeURIComponent(entry.slice(0, separator).trim()), decodeURIComponent(entry.slice(separator + 1).trim())];
  }));
}

function signalUrl(base, signal) {
  const normalized = base.replace(/\/$/, '');
  return normalized.endsWith(`/v1/${signal}`) ? normalized : `${normalized}/v1/${signal}`;
}

export function createTelemetry(options = {}) {
  const endpoint = options.endpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? DEFAULT_ENDPOINT;
  const headers = options.headers ?? parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS);
  const serviceName = options.serviceName ?? process.env.OTEL_SERVICE_NAME ?? 'mend-api';
  const resource = resourceFromAttributes({
    'service.name': serviceName,
    'service.namespace': 'mend',
    'service.version': options.serviceVersion ?? process.env.OTEL_SERVICE_VERSION ?? '0.1.0',
    'deployment.environment.name': options.environment ?? process.env.OTEL_ENVIRONMENT ?? 'local',
  });

  const spanExporter = options.spanExporter ?? new OTLPTraceExporter({ url: signalUrl(endpoint, 'traces'), headers });
  const logExporter = options.logExporter ?? new OTLPLogExporter({ url: signalUrl(endpoint, 'logs'), headers });
  const metricExporter = options.metricExporter ?? new OTLPMetricExporter({ url: signalUrl(endpoint, 'metrics'), headers });

  const tracerProvider = new BasicTracerProvider({
    resource,
    spanProcessors: [new SimpleSpanProcessor(spanExporter)],
  });
  const loggerProvider = new LoggerProvider({
    resource,
    processors: [new SimpleLogRecordProcessor({ exporter: logExporter })],
  });
  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: options.metricExportIntervalMillis ?? 1_000,
  });
  const meterProvider = new MeterProvider({ resource, readers: [metricReader] });
  const tracer = tracerProvider.getTracer('mend');
  const logger = loggerProvider.getLogger('mend');
  const meter = meterProvider.getMeter('mend');
  const baseCorrelation = correlationAttributes(options.correlation);

  const metrics = {
    runs: meter.createCounter('zero_downtime_runs_total', { description: 'Completed workflow runs' }),
    duration: meter.createHistogram('zero_downtime_run_duration_ms', { unit: 'ms', description: 'End-to-end workflow duration' }),
    stages: meter.createCounter('zero_downtime_stage_executions_total', { description: 'Pipeline stage executions' }),
    failures: meter.createCounter('zero_downtime_stage_failures_total', { description: 'Controlled and real pipeline failures' }),
    factoryRuns: meter.createCounter('mend_factory_runs_total', { description: 'Completed Mend X/Y/Z factory runs' }),
    factoryDuration: meter.createHistogram('mend_factory_run_duration_ms', { unit: 'ms', description: 'Mend X/Y/Z runtime duration' }),
    axisRecords: {
      X: meter.createHistogram('mend_x_records', { description: 'X pipeline records produced per run' }),
      Y: meter.createHistogram('mend_y_records', { description: 'Y structure records produced per run' }),
      Z: meter.createHistogram('mend_z_records', { description: 'Z IP activity records produced per run' }),
    },
    validationFailures: meter.createCounter('mend_validation_failures_total', { description: 'Mend validation failures by axis' }),
    repairAttempts: meter.createCounter('mend_repair_attempts_total', { description: 'Mend X integration repair attempts' }),
    repairSuccess: meter.createCounter('mend_repair_success_total', { description: 'Successful Mend X integration repairs' }),
    sourceExecutions: meter.createCounter('mend_source_executions_total', { description: 'Mend source and sponsor executions' }),
    sourceDuration: meter.createHistogram('mend_source_execution_duration_ms', { unit: 'ms', description: 'Mend source and sponsor execution duration' }),
    sourceFailures: meter.createCounter('mend_source_execution_failures_total', { description: 'Failed Mend source and sponsor executions' }),
    sponsorRequests: meter.createCounter('mend_sponsor_requests_total', { description: 'External sponsor requests' }),
    sponsorResults: meter.createCounter('mend_sponsor_results_total', { description: 'External sponsor results' }),
    retries: meter.createCounter('mend_retries_total', { description: 'Bounded axis retry attempts' }),
    healing: meter.createCounter('mend_healing_decisions_total', { description: 'Human source-healing decisions' }),
    diligenceTasks: meter.createCounter('mend_diligence_tasks_total', { description: 'Diligence task lifecycle events' }),
    diligenceDecisions: meter.createCounter('mend_diligence_decisions_total', { description: 'Target diligence decisions' }),
  };

  function contextFor(span) {
    return span ? trace.setSpan(ROOT_CONTEXT, span) : ROOT_CONTEXT;
  }

  function startSpan(name, attributes = {}, parentSpan) {
    return tracer.startSpan(name, {
      attributes: { ...sanitizeTelemetryAttributes(attributes), ...baseCorrelation },
    }, contextFor(parentSpan));
  }

  function log(severityText, body, attributes = {}, span) {
    const severityNumber = SeverityNumber[severityText] ?? SeverityNumber.INFO;
    const safeAttributes = { ...sanitizeTelemetryAttributes(attributes), ...baseCorrelation };
    const safeBody = redactSensitiveText(body);
    const record = { severityText, severityNumber, body: safeBody, attributes: safeAttributes, context: contextFor(span) };
    logger.emit(record);
    if (options.console !== false) {
      const spanContext = span?.spanContext();
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(), severity: severityText, message: safeBody,
        trace_id: spanContext?.traceId, span_id: spanContext?.spanId, ...safeAttributes,
      }));
    }
  }

  function failSpan(span, error) {
    const safeError = new Error(redactSensitiveText(error?.message ?? String(error)));
    safeError.name = error?.name ?? 'Error';
    span.recordException(safeError);
    span.setStatus({ code: SpanStatusCode.ERROR, message: safeError.message });
  }

  function bindCorrelation(correlation = {}) {
    const bound = { ...baseCorrelation, ...correlationAttributes(correlation) };
    return {
      metrics,
      attributes: (attributes = {}) => ({ ...sanitizeTelemetryAttributes(attributes), ...bound }),
      startSpan: (name, attributes = {}, parentSpan) => startSpan(name, { ...attributes, ...bound }, parentSpan),
      log: (severityText, body, attributes = {}, span) => log(severityText, body, { ...attributes, ...bound }, span),
      failSpan,
    };
  }

  async function flush() {
    await Promise.all([tracerProvider.forceFlush(), loggerProvider.forceFlush(), meterProvider.forceFlush()]);
  }

  async function shutdown() {
    await flush();
    await Promise.all([tracerProvider.shutdown(), loggerProvider.shutdown(), meterProvider.shutdown()]);
  }

  return {
    serviceName,
    tracer,
    metrics,
    correlationAttributes,
    bindCorrelation,
    startSpan,
    log,
    failSpan,
    flush,
    shutdown,
  };
}
