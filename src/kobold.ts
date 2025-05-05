import { ChildProcess, spawn } from 'child_process';
import { existsSync } from 'fs';
import { availableParallelism } from 'os';
import sanitize from 'sanitize-filename';

import { allowedContextSizes, chalk, LOG_LEVELS, MODULE_NAME } from './consts';
import { logStream } from './logging';

// Todo: make definable
const basePath = '/e/ll_models',
    binaryRelativePathMap = new Map<string, string>([
        ['win32', './koboldcpp_cu12.exe'],
        ['linux', './koboldcpp-linux-x64-cuda1210'],
        ['darwin', './koboldcpp-mac-arm64'],
    ]),
    //Todo: take from current connection if possible
    koboldAPIEndpoint = 'http://127.0.0.1:5001/api/v1'

export interface KoboldCppArgs {
    // BinaryPath will be ignored for now (huuuge security considerations)
    binaryPath?: string
    model: string
    contextSize?: number
    gpuLayers?: number
    threads?: number
    tensorSplit?: number[]
}

const defaultArgs = ['--quiet', '--flashattention', '--usemlock', '--usecublas', 'all']

const toArgsArray = (args: KoboldCppArgs): string[] => {
    const execArgs = defaultArgs.concat(
        '--model', sanitize(args.model),
        '--threads', (args.threads ?? availableParallelism()).toString(),
    )

    if (args.contextSize !== undefined) {
        if (!allowedContextSizes.includes(args.contextSize)) {
            throw new Error('unsupported context size')
        }

        execArgs.push('--contextsize', args.contextSize.toString())
    }

    if (args.gpuLayers !== undefined) {
        execArgs.push('--gpulayers', args.gpuLayers.toString())
    }

    if (args.tensorSplit !== undefined) {
        execArgs.push('--tensor_split', ...args.tensorSplit.map(String))
    }

    // Making sure none of execArgs contains spaces
    execArgs.map((arg) => arg.split(' ')).flat()

    return execArgs
}


export const getLoadedModelName = async () => {
    const resp = await fetch(`${koboldAPIEndpoint}/model`, { method: 'GET' })
    const data = await resp.json() as { result: string }

    // Do koboldcpp/nvidia_Llama-3_3-Nemotron-Super-49B-v1-Q4_K_S => nvidia_Llama-3_3-Nemotron-Super-49B-v1-Q4_K_S
    const [_, modeName] = data.result.split('/')

    return modeName
}


// Controller stores current execution status.
export class Controller {
    private aborter?: AbortController
    private processIO: ChildProcess | null = null
    private isProcessRunning = false

    // StartKoboldCpp starts koboldcpp executable and wait before it responds.
    async runKoboldCpp(args: KoboldCppArgs) {
        if (this.processIO !== null) {
            await this.stopKoboldCpp()
        }

        const binaryRelativePath = binaryRelativePathMap.get(process.platform)

        if (binaryRelativePath === undefined || !existsSync(`${basePath}/${binaryRelativePath}`)) {
            throw new Error('binary missing')
        }

        this.spawnKoboldCpp(binaryRelativePath, toArgsArray(args))

        let acceptingConnections = false

        // Wait for model to be available. this.isProcessRunning is set asyncronously
        while (this.isProcessRunning && !acceptingConnections) {
            // eslint-disable-next-line no-await-in-loop
            acceptingConnections = await getLoadedModelName()
                .then(() => true)
                .catch(() => false)
        }

        if (!this.isProcessRunning) {
            throw new Error('Failed to run KoboldCpp')
        }
    }

    private spawnKoboldCpp = (binaryPath: string, args: string[]) => {
        globalThis.console.info(
            chalk.yellow(MODULE_NAME),
            'Binary will be started at', binaryPath, 'with flags', args,
        )

        this.aborter = new AbortController()

        this.processIO = spawn(
            binaryPath,
            args,
            {
                cwd: basePath,
                detached: true,
                signal: this.aborter.signal,
                stdio: ['ignore', 'pipe', 'pipe'],
            })
            .on('error', (err) => {
                this.isProcessRunning = false
                globalThis.console.warn('koboldcpp returned error:', err.message)
            })
            .on('exit', () => {
                this.isProcessRunning = false
                globalThis.console.info('koboldcpp exited')
            })

        this.isProcessRunning = true

        this.processIO.stdout = logStream(this.processIO.stdout, LOG_LEVELS.INFO)
        this.processIO.stderr = logStream(this.processIO.stderr, LOG_LEVELS.ERROR)
    }

    async stopKoboldCpp() {
        if (this.processIO === null) {
            return
        }

        this.aborter?.abort()

        globalThis.console.info('Waiting for Kobold to stop...')

        const waitIntervalMs = 100

        // Wait for process ot be aborted
        while (this.isProcessRunning) {
            // Sleep for 100ms before recheck
            // eslint-disable-next-line no-await-in-loop
            await new Promise(resolve => { setTimeout(resolve, waitIntervalMs) });
        }

        this.processIO = null
    }
}

