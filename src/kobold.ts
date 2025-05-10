import { EventEmitter } from 'node:events';

import { ChildProcess, spawn } from 'child_process';
import { existsSync } from 'fs';
import { availableParallelism } from 'os';
import path from 'path';
import sanitize from 'sanitize-filename';

import { config } from './config';
import { allowedContextSizes, binaryRelativePathMap, chalk, KoboldState as ChildState, isModelChangingState, knownKoboldRC, koboldAPIEndpoint, LOG_LEVELS, ModelState, MODULE_NAME } from './consts';
import { ModelStateError } from './errors';
import { logStream } from './logging';
import { sleep, timeout } from './timers';

const koboldCppLogPrefix = '[KoboldCpp]'

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

interface ModelStatus {
    State: ModelState
    Name?: string
    ErrorMsg?: string
    // Model started by another process
    Independent: boolean
}

const modelStartupTimeoutMs = 60000,
    modelStopTimeoutMs = 10000

// Controller stores current execution status.
export class Controller extends EventEmitter {
    private aborter?: AbortController
    private processIO: ChildProcess | null = null

    private modelStatus: ModelStatus

    private koboldState: 'online' | 'offline'

    constructor() {
        super({ captureRejections: true })

        this.modelStatus = { State: 'offline', Independent: false }

        this.on('error', this.handleError)
        this.on('stop', this.handleStop)
        this.on('online', Controller.handleOnline)
        // Callbacks can be promises
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        this.on('load', this.handleLoad)
        this.on('reload', this.handleReload)
        this.on('offline', Controller.handleOffline)
    }

    // ================================
    // Event handlers
    // ================================

    private handleError = (err: unknown) => {
        if (err instanceof Error) {
            this.modelStatus.ErrorMsg = err.message

            globalThis.console.error(chalk.red(MODULE_NAME, koboldCppLogPrefix), err.name, err.message, err.stack)
        }

        globalThis.console.error(chalk.red(MODULE_NAME, koboldCppLogPrefix), 'unhandled error', err)
    }

    private handleStop = () => this.stopModel

    private static handleOffline = () => {
        globalThis.console.info(chalk.green(MODULE_NAME, koboldCppLogPrefix), 'Offline')
    }

    private static handleOnline = () => {
        globalThis.console.info(chalk.green(MODULE_NAME, koboldCppLogPrefix), 'Online')
    }

    private handleLoad = async (args: KoboldCppArgs) => {
        const binaryRelativePath = binaryRelativePathMap.get(process.platform)

        if (binaryRelativePath === undefined || !existsSync(path.join(config.basePath, binaryRelativePath))) {
            this.emit('error', new Error('binary missing'))

            return
        }

        globalThis.console.info(
            chalk.yellow(MODULE_NAME),
            'Binary will be started at', binaryRelativePath, 'with flags', args,
        )

        this.aborter = new AbortController()

        this.processIO = spawn(
            binaryRelativePath,
            toArgsArray(args),
            {
                cwd: config.basePath,
                detached: true,
                signal: this.aborter.signal,
                stdio: ['ignore', 'pipe', 'pipe'],
            })
            .on('error', this.handleChildErr)
            .on('exit', this.handleChildExit)

        this.processIO.stdout = logStream(this.processIO.stdout, LOG_LEVELS.INFO)
        this.processIO.stderr = logStream(this.processIO.stderr, LOG_LEVELS.ERROR)

        this.modelStatus.Name = path.basename(args.model, '.gguf')

        this.
            waitForChildState('online', modelStartupTimeoutMs)
            .then(state => {
                // If state already set by some other party, re-setting it can lead to loss of data (e.g. erorr message)
                if (state !== this.modelStatus.State) {
                    this.setState(state)
                }
            })
            .catch((err: unknown) => {
                this.setState('error', err)
            })
    }

    private handleReload = async (args: KoboldCppArgs) => {
        this.handleStop()

        await this.waitForChildState('offline', modelStopTimeoutMs)

        await this.handleLoad(args)
    }

    private handleChildErr = (err: Error) => {
        // We keep model name
        if (this.gracefulStop) {
            return
        }

        this.setState('error', err)
    }

    private handleChildExit = (code: number | null, signal: NodeJS.Signals | null) => {
        if (this.gracefulStop) {
            return
        }

        if (code !== null) {
            this.setState('error', new Error(`KoboldCpp existed with code ${knownKoboldRC.get(code) ?? code.toString()}`))

            return
        }

        if (signal !== null) {
            const pidStr = this.processIO?.pid?.toString() ?? ''

            this.setState('error', new Error(`KoboldCpp (${pidStr}) shut down by ${signal}`))
        }
    }

    // ================================
    // Controller methods
    // ================================

    runKoboldCpp = async (args: KoboldCppArgs) => {
        await this.getChildState()

        if (isModelChangingState(this.modelStatus.State)) {
            throw new ModelStateError('Model is changing state. Creation impossible')
        }

        this.modelStatus.ErrorMsg = undefined

        if (await this.getChildState() === 'offline') {
            this.setState('load', args)
        } else {
            this.setState('reload', args)
        }
    }

    getStatus = () => this.modelStatus

    stopKoboldCpp = async () => {
        if (await this.getChildState() === 'offline') {
            // Shut down is being already performed
            return
        }

        if (isModelChangingState(this.modelStatus.State)) {
            throw new ModelStateError('Model is changing state. Deletion impossible')
        }

        if (this.modelStatus.Independent) {
            throw new ModelStateError('Running model is not managed by controller')
        }

        this.setState('stop')
    }

    // End of controller workflow
    shutdown = () => {
        this.stopModel()
    }

    // Stop intiated by Controller
    private get gracefulStop(): boolean {
        return ['stop', 'reload'].includes(this.modelStatus.State)
    }

    private setState(state: ModelState, eventData?: unknown) {
        this.modelStatus.State = state
        this.emit(state, eventData)
    }

    private stopModel = () => {
        this.aborter?.abort()

        this.waitForChildState('offline', modelStopTimeoutMs)
    }

    private getChildState = async (): Promise<ChildState> => {
        if (this.processIO === undefined || this.processIO?.exitCode !== null) {
            return 'offline'
        }

        return await fetch(`${koboldAPIEndpoint}/model`, { method: 'GET' })
            .then(resp => {
                if (!resp.ok) {
                    return Promise.reject(
                        new Error(`requiest unsuccessfull, received code ${resp.status.toString()} (${resp.statusText})`)
                    )
                }

                return resp.json()
            })
            .then((data: { result: string }) => {
                const [_, modelName] = data.result.split('/')

                if (modelName === undefined) {
                    return 'offline'
                }

                return 'online'
            })
            .catch(() => 'offline')
    }

    private waitForChildState = async (state: ChildState, timeoutMs: number) => {
        const waitItervalMs = 200

        const waitForModel = async () => {
            if (await this.getChildState() === state) {
                return
            }

            // Sleep x_x
            await sleep(waitItervalMs)

            return await waitForModel()
        }

        return await Promise.race([
            waitForModel(),
            timeout(timeoutMs),
        ]) as ModelState
    }
}

