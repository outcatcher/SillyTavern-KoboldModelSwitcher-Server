import { ChalkInstance } from "chalk";
import internal from 'stream';

import { chalk, LOG_LEVELS, MODULE_NAME } from "./consts";

interface logCfg {
    chalk: ChalkInstance
    log: (...args: string[]) => void
}

const logCfgMapByLevel = new Map<number, logCfg>([
    [LOG_LEVELS.DEBUG, {
        chalk: chalk.gray,
        log: globalThis.console.debug,
    }],
    [LOG_LEVELS.INFO, {
        chalk: chalk.white,
        log: globalThis.console.info,
    }],
    [LOG_LEVELS.WARN, {
        chalk: chalk.yellowBright,
        log: globalThis.console.warn,
    }],
    [LOG_LEVELS.ERROR, {
        chalk: chalk.redBright,
        log: globalThis.console.error,
    }]
])

export const logStream = (stream: internal.Readable | null, level: number): internal.Readable | null => {
    if (stream === null) {
        return stream
    }

    stream.setEncoding('utf-8')

    const log = logCfgMapByLevel.get(level)

    let logLine = ''

    stream.on('data', (data: Buffer) => {
        logLine += data.toString()

        const pos = logLine.lastIndexOf('\n')

        // \n not found in the data
        // eslint-disable-next-line no-magic-numbers
        if (pos === -1) {
            return
        }

        // Log all whole output ending with \n.
        // If more than one \n exists, output each line as log entry.
        // The last line considered not finished yet
        // Hope kobold uses 'println' always.
        const output = logLine.substring(0, pos)

        output.
            split('\n').
            forEach((line) => { 
                if (line === '') {
                    return
                }
                log?.log(log.chalk(MODULE_NAME, '[KoboldCpp]'), line) 
            })

        logLine = logLine.substring(pos)
    });

    return stream
}
