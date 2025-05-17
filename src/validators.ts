import { normalize } from 'node:path';

import { Schema } from 'express-validator';

import { allowedContextSizes } from './consts';


//  {
//    "contextSize": 12288,
//    "gpuLayers": 81,
//    "model": "nvidia_Llama-3_3-Nemotron-Super-49B-v1-Q4_K_S.gguf",
//    "threads": 1,
//    "tensorSplit": [29, 52],
//  }
export const modelSchema: Schema = {
    contextSize: {
        optional: true,
        isIn: {
            errorMessage: `contextSize must be one of [${allowedContextSizes.join(', ')}]`,
            options: [allowedContextSizes],
        },
    },
    gpuLayers: {
        optional: true,
        isInt: {
            errorMessage: 'gpuLayers must be positive integer',
            options: {
                min: 0,
            },
        },
    },
    model: {
        notEmpty: {
            errorMessage: 'model is required',
        },
    },
    tensorSplit: {
        optional: true,
        isArray: {
            errorMessage: 'tensorSplit must be float array with minimal length of two',
            options: {
                min: 2,
            },
        },
    },
    'tensorSplit.*': {
        isFloat: {
            errorMessage: 'tensorSplit values must be valid floats',
            options: {
                min: 0,
            },
        },
    },
    threads: {
        optional: true,
        isInt: {
            errorMessage: 'threads must be >= -1',
            options: {
                min: -1,
            },
        },
    },
}
