import fs from 'node:fs';
import path from 'node:path';

import { chalk, MODULE_NAME } from './consts';
import { ConfigurationError } from './errors';

export interface Config {
    /*
    * @deprecated Use `modelsDir` and `koboldBinaryPath` instead
    */
    basePath?: string
    modelsDir: string
    koboldBinary: string
    defaultArgs: string[]
}

const defaultFallbackBinary = 'koboldcpp'

const defaultKoboldExecutables = new Map<string, string>([
    ['win32', 'koboldcpp_cu12.exe'],
    ['linux', 'koboldcpp-linux-x64-cuda1210'],
    ['darwin', 'koboldcpp-mac-arm64'],
])

const defaultConfig: Config = {
    modelsDir: '',
    koboldBinary: defaultKoboldExecutables.get(process.platform) ?? '',
    defaultArgs: ['--quiet', '--flashattention', '--usemlock', '--usecublas', 'all'],
}

interface FSError {
    code: string
    path: string
}

// Validating configuration after loading. As data is loaded from JSON, we have to check of undefined values.
const validateConfig = (cfg: Config): Config => {
    // Legacy config
    if (cfg.basePath !== undefined) {
        if (!path.isAbsolute(cfg.basePath)) {
            throw new ConfigurationError(`basePath must be absolute if defined but is ${cfg.basePath}`)
        }

        cfg.modelsDir = cfg.modelsDir
            ? cfg.modelsDir
            : cfg.basePath
        cfg.koboldBinary = cfg.koboldBinary
            ? cfg.koboldBinary
            : path.join(cfg.basePath, defaultKoboldExecutables.get(process.platform) ?? defaultFallbackBinary)

        globalThis.console.warn(
            chalk.redBright(MODULE_NAME),
            'Legacy config detected, please update your config file to use `modelsDir` and `koboldBinaryPath`',
        )
    }

    if (cfg.modelsDir === undefined || !path.isAbsolute(cfg.modelsDir)) {
        throw new ConfigurationError(`modelsDir must be absolute but is ${cfg.modelsDir}`)
    }

    if (cfg.koboldBinary === undefined || cfg.koboldBinary === '') {
        cfg.koboldBinary = defaultConfig.koboldBinary
    }

    cfg.defaultArgs ??= defaultConfig.defaultArgs

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
