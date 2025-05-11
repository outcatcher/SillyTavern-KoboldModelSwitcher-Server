import fs from 'node:fs';
import path from 'node:path';

import { chalk, MODULE_NAME } from './consts';
import { ConfigurationError } from './errors';

export interface Config {
    basePath: string
}

const defaultConfig: Config = {
    basePath: '',
}

interface FSError {
    code: string
    path: string
}

const validateConfig = (cfg: Config): Config => {
    if (!path.isAbsolute(cfg.basePath)) {
        throw new ConfigurationError(`basePath must be absolute but is ${cfg.basePath}`)
    }

    return cfg
}

export const loadConfig = (configPath: string): Config => {
    try {
        const configFile = fs.readFileSync(configPath, 'utf8')

        return validateConfig(JSON.parse(configFile.toString()) as Config)
    } catch (err: unknown) {
        if ((err as FSError).code === 'ENOENT') {
            fs.writeFileSync(configPath, JSON.stringify(defaultConfig, undefined, "  "))

            globalThis.console.log(chalk.red(MODULE_NAME),
                `Configuration missing. Configuration template created at ${configPath}`);

            // Noch einmal
            return loadConfig(configPath)
        }

        throw err
    }
}
