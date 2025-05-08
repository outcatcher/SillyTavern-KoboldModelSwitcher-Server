/*eslint no-magic-numbers: "off"*/
import { Chalk } from 'chalk';

export const MODULE_NAME = '[KoboldCpp-Switcher]';

export const chalk = new Chalk();

export const allowedContextSizes = [
    256,
    512,
    1024,
    2048,
    3072,
    4096,
    6144,
    8192,
    10240,
    12288,
    14336,
    16384,
    20480,
    24576,
    28672,
    32768,
    40960,
    49152,
    57344,
    65536,
    81920,
    98304,
    114688,
    131072,
]

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
