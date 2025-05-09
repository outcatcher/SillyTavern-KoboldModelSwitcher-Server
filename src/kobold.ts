import { EventEmitter } from 'node:events';

import { ChildProcess, spawn } from 'child_process';
import { existsSync } from 'fs';
import { availableParallelism } from 'os';
import path from 'path';
import sanitize from 'sanitize-filename';

import { config } from './config';
import { allowedContextSizes, binaryRelativePathMap, chalk, isModelChangingState, isModelOffline, knownKoboldRC, koboldAPIEndpoint, LOG_LEVELS, ModelState, MODULE_NAME } from './consts';
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

const modelStartupTimeoutMs = 60000

// Controller stores current execution status.
export class Controller extends EventEmitter {
    private aborter?: AbortController
    private processIO: ChildProcess | null = null

    private modelStatus: ModelStatus

    constructor() {
        super({ captureRejections: true })

        this.modelStatus = { State: 'offline', Independent: false }

        this.on('error', this.handleError)
        this.on('stopping', this.handleStopping)
        this.on('online', Controller.handleOnline)
        // Callbacks can be promises
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        this.on('loading', this.handleLoading)
        this.on('offline', Controller.handleOffline)
    }

    // ================================
    // Event handlers
    // ================================

    private handleError = (err: Error) => {
        this.modelStatus.ErrorMsg = err.message

        globalThis.console.error(chalk.red(MODULE_NAME, koboldCppLogPrefix), err.name, err.message, err.stack)
    }

    private handleStopping = () => this.stopModel

    private static handleOffline = () => {
        globalThis.console.info(chalk.green(MODULE_NAME, koboldCppLogPrefix), 'Offline')
    }

    private static handleOnline = () => {
        globalThis.console.info(chalk.green(MODULE_NAME, koboldCppLogPrefix), 'Online')
    }

    private handleLoading = async (args: KoboldCppArgs) => {
        const status = await this.getModelStatus()

        if (!isModelOffline(status.State)) {
            this.stopModel()
        }

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
            waitForOneOfModelStates(['online', 'offline', 'error'], modelStartupTimeoutMs)
            .then(state => {
                console.warn('Set state after wait', state)

                this.setState(state)
            })
            .catch((err: unknown) => {
                this.setState('error', err)
            })
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

            this.setState('error', new Error(`KoboldCpp (${pidStr}) shut down by ${signal} `))
        }
    }

    // ================================
    // Controller methods
    // ================================

    runKoboldCpp = async (args: KoboldCppArgs) => {
        await this.syncWithKobold()

        if (isModelChangingState(this.modelStatus.State)) {
            throw new ModelStateError('Model in creation. Creation impossible')
        }

        this.setState('loading', args)
    }

    getModelStatus = async () => await this
        .syncWithKobold()
        .then(() => this.modelStatus)

    stopKoboldCpp = async () => {
        const status = await this.getModelStatus()

        if (isModelOffline(status.State)) {
            // Shut down is being already performed
            return
        }

        if (isModelChangingState(status.State)) {
            throw new ModelStateError('Model in creation. Deletion impossible')
        }

        if (this.modelStatus.Independent) {
            throw new ModelStateError('Running model is not managed by controller')
        }

        this.setState('stopping')
    }

    // End of controller workflow
    shutdown() {
        this.aborter?.abort()
    }

    // Stop intiated by Controller
    private get gracefulStop(): boolean {
        return this.modelStatus.State === 'stopping'
    }

    private setState(state: ModelState, eventData?: unknown) {
        this.modelStatus.State = state
        this.emit(state, eventData)
    }

    private stopModel = () => {
        this.aborter?.abort()
    }

    private async syncWithKobold() {
        // Failure here is highly unexpected if model already started.
        await fetch(`${koboldAPIEndpoint}/model`, { method: 'GET' })
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

                // Refresh name, model seems to be started independently
                if (this.modelStatus.Name !== modelName) {
                    globalThis.console.warn(
                        chalk.yellow(MODULE_NAME, 'Unexpected model name, expected'),
                        this.modelStatus.Name, 'got', modelName)

                    this.modelStatus.Name = modelName
                    this.modelStatus.Independent = true
                }

                if (this.modelStatus.State !== 'online') {
                    this.setState('online')
                }
            })
            .catch((err: unknown) => {
                if (isModelOffline(this.modelStatus.State) || isModelChangingState(this.modelStatus.State)) {
                    // Exected, return
                    return
                }

                globalThis.console.info('failed to fetch model from kobold, expected status', err)

                this.setState('error', new Error('kobold is unexpectedly down'))
            });
    }

    private waitForOneOfModelStates = async (states: ModelState[], timeoutMs: number) => {
        const waitItervalMs = 200

        const waitForModel = async () => {
            const currentState = (await this.getModelStatus()).State

            if (states.includes(currentState)) {
                return currentState
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

