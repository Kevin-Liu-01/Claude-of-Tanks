/** JSON-lines structured logger for the match service. One object per line, never a credential. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogFields = Record<string, string | number | boolean | null | undefined>;

export interface Logger {
  readonly level: LogLevel;
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function parseLogLevel(value: string | undefined, fallback: LogLevel = 'info'): LogLevel {
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error' ? value : fallback;
}

export function createLogger({
  level = 'info',
  sink = (line: string) => { process.stdout.write(`${line}\n`); },
  now = () => Date.now(),
  bound = {},
}: { level?: LogLevel; sink?: (line: string) => void; now?: () => number; bound?: LogFields } = {}): Logger {
  const threshold = LEVEL_RANK[level];
  const write = (entryLevel: LogLevel, message: string, fields?: LogFields): void => {
    if (LEVEL_RANK[entryLevel] < threshold) return;
    sink(JSON.stringify({ ts: new Date(now()).toISOString(), level: entryLevel, msg: message, ...bound, ...fields }));
  };
  return {
    level,
    debug: (message, fields) => write('debug', message, fields),
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields),
    child: (fields) => createLogger({ level, sink, now, bound: { ...bound, ...fields } }),
  };
}

/** A logger that records nothing (tests, receipts). */
export const silentLogger: Logger = createLogger({ level: 'error', sink: () => {} });
