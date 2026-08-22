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
  const serviceName = options.serviceName ?? process.env.OTEL_SERVICE_NAME ?? 'zero-downtime-fixture';
  const resource = resourceFromAttributes({
    'service.name': serviceName,
    'service.version': '0.1.0',
    'deployment.environment.name': process.env.OTEL_ENVIRONMENT ?? 'local',
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
  const tracer = tracerProvider.getTracer('zero-downtime');
  const logger = loggerProvider.getLogger('zero-downtime');
  const meter = meterProvider.getMeter('zero-downtime');

  const metrics = {
    runs: meter.createCounter('zero_downtime_runs_total', { description: 'Completed workflow fixture runs' }),
    duration: meter.createHistogram('zero_downtime_run_duration_ms', { unit: 'ms', description: 'End-to-end workflow duration' }),
    stages: meter.createCounter('zero_downtime_stage_executions_total', { description: 'Pipeline stage executions' }),
    failures: meter.createCounter('zero_downtime_stage_failures_total', { description: 'Controlled and real pipeline failures' }),
  };

  function contextFor(span) {
    return span ? trace.setSpan(ROOT_CONTEXT, span) : ROOT_CONTEXT;
  }

  function startSpan(name, attributes = {}, parentSpan) {
    return tracer.startSpan(name, { attributes }, contextFor(parentSpan));
  }

  function log(severityText, body, attributes = {}, span) {
    const severityNumber = SeverityNumber[severityText] ?? SeverityNumber.INFO;
    const record = { severityText, severityNumber, body, attributes, context: contextFor(span) };
    logger.emit(record);
    if (options.console !== false) {
      const spanContext = span?.spanContext();
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(), severity: severityText, message: body,
        trace_id: spanContext?.traceId, span_id: spanContext?.spanId, ...attributes,
      }));
    }
  }

  function failSpan(span, error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  }

  async function flush() {
    await Promise.all([tracerProvider.forceFlush(), loggerProvider.forceFlush(), meterProvider.forceFlush()]);
  }

  async function shutdown() {
    await flush();
    await Promise.all([tracerProvider.shutdown(), loggerProvider.shutdown(), meterProvider.shutdown()]);
  }

  return { serviceName, tracer, metrics, startSpan, log, failSpan, flush, shutdown };
}
