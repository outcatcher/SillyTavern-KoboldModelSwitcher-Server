import { Schema } from 'express-validator';

import { maxAllowedContextSize, minAllowedContextSize } from './consts';


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
        isInt: {
            errorMessage: `contextSize must be in range [${minAllowedContextSize.toString()} to ${maxAllowedContextSize.toString()}]`,
            options: {
                min: minAllowedContextSize,
                max: maxAllowedContextSize,
            }
        },
    },
    gpuLayers: {
        optional: true,
        isInt: {
            errorMessage: 'gpuLayers must be >= -1',
            options: {
                min: -1,
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
