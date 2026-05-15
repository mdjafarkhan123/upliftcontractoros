type Level = 'debug' | 'info' | 'warn' | 'error';

type Fields = Record<string, unknown>;

function emit(level: Level, scope: string, fields: Fields): void {
	const line = JSON.stringify({
		ts: new Date().toISOString(),
		level,
		scope,
		...fields
	});
	if (level === 'error') console.error(line);
	else if (level === 'warn') console.warn(line);
	else console.log(line);
}

export function createLogger(scope: string) {
	return {
		debug: (fields: Fields) => emit('debug', scope, fields),
		info: (fields: Fields) => emit('info', scope, fields),
		warn: (fields: Fields) => emit('warn', scope, fields),
		error: (fields: Fields) => emit('error', scope, fields)
	};
}

export type Logger = ReturnType<typeof createLogger>;
