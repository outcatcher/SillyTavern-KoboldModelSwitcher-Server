import { allowedContextSizes } from "./kobold";

//  {
//     "contextSize": 12288,
//     "gpuLayers": 81,
//     "model": "nvidia_Llama-3_3-Nemotron-Super-49B-v1-Q4_K_S.gguf",
//     "threads": 1,
//     "tensorSplit": [29, 52],
//   }
export const modelSchema = {
    contextSize: {
        isIn: {
            errorMessage: `unsupported context size, must be one of ${allowedContextSizes}`,
            options: [allowedContextSizes],
        }
    },
    gpuLayers: {
        isInt: {
            errorMessage: 'gpuLayers must be positive integer',
            options: {
                min: 0,
            },
        },
    },
    threads: {
        isInt: {
            errorMessage: 'threads must be positive integer',
            options: {
                min: 0,
            },
        }
    },
    'tensorSplit.*': {
        isFloat: {
            errorMessage: 'tensor split values must be valid floats',
            options: {
                min: 0,
            },
        }
    }
}
