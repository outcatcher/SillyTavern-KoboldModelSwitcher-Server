import { ChildProcess, spawn } from 'child_process';
import { existsSync } from 'fs';
import { availableParallelism } from 'os';
import sanitize from 'sanitize-filename';
import { MODULE_NAME, chalk } from './consts';

const koboldAPIEndpoint = 'http://127.0.0.1:5001/api/v1' //todo: take from current connection if possible
const basePath = '/e/ll_models'  // todo: fix
const binaryRelativePathMap = new Map<string, string>([
    ['win32', './koboldcpp_cu12.exe'],
    ['linux', './koboldcpp-linux-x64-cuda1210'],
    ['darwin', './koboldcpp-mac-arm64']
]) // constant for now, arbitrary values are insecure

interface KoboldCppArgs {
    binaryPath?: string // will be ignored for now
    model: string
    contextSize?: number
    gpuLayers?: number
    threads?: number
    tensorSplit?: Array<number>
}

const defaultArgs = ['--quiet', '--flashattention', '--usemlock', '--usecublas', 'all']

function toArgsArray(args: KoboldCppArgs): Array<string> {
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
        execArgs.push('--gpulayers', args.tensorSplit.toString())
    }

    if (args.tensorSplit !== undefined) {
        execArgs.push('--tensor_split', ...args.tensorSplit.map(String))
    }

    // making sure none of execArgs contains spaces
    execArgs.map((v) => v.split(' ')).flat()

    return execArgs
}


const allowedContextSizes = [
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

// Controller stores current execution status.
export class Controller {
    private aborter?: AbortController
    private processIO: ChildProcess | null = null

    // startKoboldCpp starts koboldcpp executable and wait before it responds.
    async runKoboldCpp(args: KoboldCppArgs) {
        if (this.processIO !== null) {
            await this.stopKoboldCpp()
        }

        this.aborter = new AbortController()

        const binaryRelativePath = binaryRelativePathMap.get(process.platform)

        if (binaryRelativePath === undefined || !existsSync(basePath + '/' + binaryRelativePath)) {
            throw new Error('binary missing')
        }

        const strArgs = toArgsArray(args)

        console.info(chalk.yellow(MODULE_NAME), 'Binary will be started at', binaryRelativePath, 'with flags', strArgs)

        this.processIO = spawn(
            binaryRelativePath!,
            strArgs,
            {
                cwd: basePath,
                detached: true,
                signal: this.aborter.signal,
                stdio: ['ignore', 'pipe', 'pipe'],
            })
            .on('error', (err) => {
                console.warn('koboldcpp returned error:', err.message)
            })
            .on('exit', () => {
                console.info('koboldcpp exited')
            })

        this.processIO.stdout?.setEncoding('utf-8')

        let stdOutLine = ''
        this.processIO.stdout?.on('data', function (data) {
            stdOutLine += data

            if (stdErrLine.indexOf('\n') === -1) {
                return
            }

            stdOutLine.
                split('\n').
                map((line) => console.info(chalk.grey(MODULE_NAME), '[KoboldCpp]', line))

            stdOutLine = ''
        });

        this.processIO.stderr?.setEncoding('utf-8')

        let stdErrLine = ''
        this.processIO.stderr?.on('data', function (data) {
            stdErrLine += data

            if (stdErrLine.indexOf('\n') === -1) {
                return
            }

            stdErrLine.
                split('\n').
                map((line) => console.error(chalk.redBright(MODULE_NAME), '[KoboldCpp]', line))

            stdErrLine = ''
        });

        while (1) {  // wait for model to be available
            try {
                await getLoadedModelName()
            } catch {
                continue
            }

            break
        }
    }

    async stopKoboldCpp() {
        if (this.processIO === null) {
            return
        }

        this.aborter?.abort()

        console.info('Start waiting for Kobold to stop...')

        while (1) {  // wait for process ot be aborted
            try {
                await getLoadedModelName()
            } catch {
                break
            }
        }

        this.processIO = null

        console.info('KoboldCpp execution stopped')
    }
}

export async function getLoadedModelName() {
    const resp = await fetch(koboldAPIEndpoint + '/model', { method: 'GET' })
    const data: { result: string } = await resp.json()

    // e.g. koboldcpp/nvidia_Llama-3_3-Nemotron-Super-49B-v1-Q4_K_S
    return data.result.split('/', 2)[1]
}
