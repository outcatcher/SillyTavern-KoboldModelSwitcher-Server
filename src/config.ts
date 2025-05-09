import fs from 'node:fs';
import path from 'node:path';

import { chalk, MODULE_NAME } from './consts';
import { ConfigurationError } from './errors';

const pluginGitName = 'SillyTavern-KoboldModelSwitcher-Server'

interface Config {
    basePath: string
}

const defaultConfig: Config = {
    basePath: '',
}

interface FSError {
    code: string
    path: string
}

const configPath = path.join(process.cwd(), `./plugins/${pluginGitName}/config.json`)

const readConfig = (): Config => {
    try {
        const configFile = fs.readFileSync(configPath, 'utf8')

        return JSON.parse(configFile.toString()) as Config
    } catch (err: unknown) {
        if ((err as FSError).code === 'ENOENT') {
            fs.writeFileSync(configPath, JSON.stringify(defaultConfig, undefined, "  "))

            globalThis.console.log(chalk.red(MODULE_NAME),
                `Configuration missing. Configuration template created at ${  configPath}`);

            return readConfig()
        }

        throw err
    }
}

const validateConfig = (cfg: Config): Config => {
    if (!path.isAbsolute(cfg.basePath)) {
        throw new ConfigurationError('basePath must be absolute')
    }

    return cfg
}

export const config = validateConfig(readConfig())
