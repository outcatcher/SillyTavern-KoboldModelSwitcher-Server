/*eslint no-magic-numbers: "off"*/
import { Chalk } from 'chalk';

export const MODULE_NAME = '[KoboldCpp-Switcher]';

export const chalk = new Chalk();

export const maxAllowedContextSize = 262144,
    minAllowedContextSize = 256

export const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
}

export type ModelState = 'offline' | 'loading' | 'online' | 'stopping' | 'failed'

export const knownKoboldRC = new Map([
    [3, 'failed to load model']
])
