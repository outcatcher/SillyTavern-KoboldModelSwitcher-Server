import { ChildProcess, spawn } from 'child_process';
import { existsSync } from 'fs';
import { availableParallelism } from 'os';
import path from 'path';
import sanitize from 'sanitize-filename';

import { Config, loadConfig } from './config';
import { allowedContextSizes, chalk, knownKoboldRC, LOG_LEVELS, ModelState, MODULE_NAME } from './consts';
import { ModelStateError } from './errors';
import { logStream } from './logging';
import { waitFor } from './timers';

const
    binaryRelativePathMap = new Map<string, string>([
        ['win32', './koboldcpp_cu12.exe'],
        ['linux', './koboldcpp-linux-x64-cuda1210'],
        ['darwin', './koboldcpp-mac-arm64'],
    ]),
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

interface ModelStatus {
    State: ModelState
    Name?: string
    ErrorMsg?: string
    // Model started by another process
    Independent: boolean
}

const isModelOffline = (state: ModelState): boolean => ['offline', 'stopping', 'failed'].includes(state)

const isModelChangingState = (state: ModelState): boolean => ['loading', 'stopping'].includes(state)

// Controller stores current execution status.
export class Controller {
    private aborter?: AbortController
    private processIO: ChildProcess | null = null

    private modelStatus: ModelStatus
    private config: Config

    constructor(configPath: string) {
        globalThis.console.info('Config loaded from', configPath)

        this.modelStatus = { State: 'offline', Independent: false }
        this.config = loadConfig(configPath)
    }

    // Shutdown intiated by Controller
    get gracefulShutdown(): boolean {
        return this.modelStatus.State === 'stopping'
    }

    // StartKoboldCpp starts koboldcpp executable and wait before it responds.
    runKoboldCpp(args: KoboldCppArgs) {
        const binaryRelativePath = binaryRelativePathMap.get(process.platform)

        if (binaryRelativePath === undefined || !existsSync(path.join(this.config.basePath, binaryRelativePath))) {
            throw new Error('binary missing')
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
                cwd: this.config.basePath,
                detached: true,
                signal: this.aborter.signal,
                stdio: ['ignore', 'pipe', 'pipe'],
            })
            .on('error', this.handleChildErr)
            .on('exit', this.handleChildExit)

        this.processIO.stdout = logStream(this.processIO.stdout, LOG_LEVELS.INFO)
        this.processIO.stderr = logStream(this.processIO.stderr, LOG_LEVELS.ERROR)

        const modelName = args.model.substring(0, args.model.lastIndexOf('.'))

        this.modelStatus = { Name: modelName, State: 'loading', Independent: false }
    }

    private handleChildErr = (err: Error) => {
        // We keep model name
        this.modelStatus.State = this.gracefulShutdown ? 'offline' : 'failed'
        this.modelStatus.ErrorMsg = err.message

        globalThis.console.info(chalk.yellow(MODULE_NAME, '[KoboldCpp]'), 'returned error:', err.message, err.stack)
    }

    private handleChildExit = (code: number | null, signal: NodeJS.Signals | null) => {
        if (code !== null) {
            this.modelStatus.ErrorMsg = knownKoboldRC.get(code) ?? code.toString()

            // Exit only possible with non-zero code, e.g. if koboldcpp failed to start
            globalThis.console.warn(chalk.yellow(MODULE_NAME, '[KoboldCpp]'),
                this.processIO?.pid, 'exited with code', code)
        }

        if (signal !== null) {
            this.modelStatus.ErrorMsg = signal

            globalThis.console.info(chalk.grey(MODULE_NAME, '[KoboldCpp]'),
                this.processIO?.pid, 'shut down by', signal)
        }

        this.modelStatus.State = this.gracefulShutdown ? 'offline' : 'failed'
    }

    async stopKoboldCpp() {
        await this.syncWithKobold()

        if (isModelOffline(this.modelStatus.State)) {
            // Shut down is being already performed
            return
        }

        if (isModelChangingState(this.modelStatus.State)) {
            throw new ModelStateError('Model in creation. Deletion impossible')
        }

        if (this.modelStatus.Independent) {
            throw new ModelStateError('Running model is not managed by controller')
        }

        this.aborter?.abort()

        this.modelStatus.State = 'stopping'
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

                this.modelStatus.State = 'online'
            })
            .catch((err: unknown) => {
                if (isModelOffline(this.modelStatus.State) || isModelChangingState(this.modelStatus.State)) {
                    // Exected, return
                    return
                }

                globalThis.console.info('failed to fetch model from kobold, expected status', err)

                this.modelStatus.State = 'failed'
                this.modelStatus.ErrorMsg = 'kobold is unexpectedly down'
            });
    }

    async getModelStatus() {
        return await this
            .syncWithKobold()
            .then(() => this.modelStatus)
    }

    async waitForOneOfModelStates(states: ModelState[], timeoutMs: number) {
        const waitItervalMs = 200
        const modelInState = async () => {
            const currentState = (await this.getModelStatus()).State

            return states.includes(currentState)
        }

        await waitFor(modelInState, timeoutMs, waitItervalMs)
    }

    // End of controller workflow
    shutdown() {
        this.aborter?.abort()
    }
}

