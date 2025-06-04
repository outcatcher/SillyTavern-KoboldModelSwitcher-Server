/*eslint max-lines-per-function: "off"*/

import fs from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import bodyParser from 'body-parser'
import express from 'express'
import { StatusCodes } from 'http-status-codes'
import { it } from 'mocha'
import request from 'supertest'

import plugin from '../src/index'
import { waitFor } from '../src/timers'

const app = express()
app.use(bodyParser.json());

const modelURI = '/model'

// CURRENT TEST IMPLEMENTATION IS TO BE RUN LOCALLY
// To be set up for CI:
//  1. Some tiny LLM
//  2. KoboldCpp download + unpacking

const modelDir = './llms'

const modelFilename = 'all-MiniLM-L6-v2-Q2_K.gguf'

const expectedModelData = {
    // 19.2Mb
    model: path.resolve(path.join(modelDir, modelFilename)),
}

const secondModelname = `copy_${modelFilename}`

const waitIntervalStart = 3000,
    waitTimeoutStart = 60000

const waitIntervalStop = 100,
    waitTimeoutStop = 5000

const downloadTestLLMs = async () => {
    const fullPath1 = path.join(modelDir, modelFilename),
        fullPath2 = path.join(modelDir, secondModelname)

    if (fs.existsSync(fullPath1) && fs.existsSync(fullPath2)) {
        return
    }

    await mkdir(modelDir, { recursive: true })

    // Hotlinking, but will suffice for time being
    const modelURL =
        'https://huggingface.co/second-state/All-MiniLM-L6-v2-Embedding-GGUF'
        +
        `/resolve/main/${modelFilename}?download=true`

    await fetch(modelURL)
        .then(stream => stream.arrayBuffer())
        .then(async buffer => {
            await Promise.all([
                writeFile(fullPath1, Buffer.from(buffer)),
                writeFile(fullPath2, Buffer.from(buffer))
            ])
        })
}

describe('Test Plugin workflow', () => {
    before(async () => {
        plugin.init(app)

        await downloadTestLLMs()
    }).timeout(waitTimeoutStart)

    // Yes, tests are dependant. What now?

    it('Check plugin running', done => {
        request(app)
            .get('/probe')
            .expect(StatusCodes.NO_CONTENT)
            .end(done)
    })

    it('Check model offline', done => {
        request(app)
            .get(modelURI)
            .expect(StatusCodes.OK, {
                status: 'offline'
            })
            .end(done)
    })

    it('Initial LLM loading', done => {
        request(app)
            .put(modelURI)
            .send(expectedModelData)
            .set('Content-Type', 'application/json')
            .expect(StatusCodes.CREATED, (err, resp) => {
                if (!err) { done(); return; }

                globalThis.console.error(resp.body)

                done(err)
            })
    })

    it('Wait for loading', async () => {
        await waitFor(
            async () => await request(app)
                .get(modelURI)
                .expect(StatusCodes.OK)
                .expect((resp) => {
                    const body = resp.body as { status: string }
                    if (body.status !== 'online') {
                        throw new Error(`Not online: ${body.status}`)
                    }
                })
                .then(() => true)
                .catch(() => false),
            waitTimeoutStart,
            waitIntervalStart,
        );
    }).timeout(waitTimeoutStart)


    it('Restart model', done => {
        request(app)
            .put(modelURI)
            .send({ model: path.resolve(path.join(modelDir, secondModelname)) })
            .set('Content-Type', 'application/json')
            .expect(StatusCodes.CREATED, (err, resp) => {
                if (!err) { done(); return; }

                globalThis.console.error(resp.body)

                done(err)
            })
    })

    it('Wait for loading', async () => {
        await waitFor(
            async () => await request(app)
                .get(modelURI)
                .expect(StatusCodes.OK)
                .expect((resp) => {
                    const data = resp.body as { status: string, model: string }

                    if (data.status !== 'online' || (`${data.model}.gguf`) !== secondModelname) {
                        throw new Error(`Not online: ${data.model} ${data.status}`)
                    }
                })
                .then(() => true)
                .catch(() => false),
            waitTimeoutStart,
            waitIntervalStart,
        );
    }).timeout(waitTimeoutStart)

    it('Stop model', done => {
        request(app)
            .delete(modelURI)
            .expect(StatusCodes.NO_CONTENT)
            .end(done)
    })

    it('Wait for stopping', async () => {
        await waitFor(
            async () => await request(app)
                .get(modelURI)
                .expect(StatusCodes.OK)
                .expect((resp) => {
                    if ((resp.body as { status: string }).status === 'online') {
                        throw new Error("Still online")
                    }
                })
                .then(() => true)
                .catch(() => false),
            waitTimeoutStop,
            waitIntervalStop,
        );
    }).timeout(waitTimeoutStop)

    after(() => {
        plugin.exit()
    })
}).bail(true)

interface koboldCppArgsErr {
    model?: unknown
    contextSize?: unknown
    gpuLayers?: unknown
    threads?: unknown
    tensorSplit?: unknown

    name: string
    errorText: string
}

describe('Test plugin errors', () => {
    before(async () => {
        plugin.init(app)

        await downloadTestLLMs()
    });

    after(() => {
        plugin.exit()
    })

    describe('Model creation validation', () => {
        const tests: koboldCppArgsErr[] = [
            { name: 'missing model', errorText: 'model is required' },
            { name: 'empty model', model: '', errorText: 'model is required' },
            { name: 'invalid contextSize', model: expectedModelData.model, contextSize: 200, errorText: 'contextSize must be in range.+' },
            { name: 'non-number gpuLayers', model: expectedModelData.model, gpuLayers: 'lol', errorText: 'gpuLayers must be positive integer' },
            { name: 'negative gpuLayers', model: expectedModelData.model, gpuLayers: -1, errorText: 'gpuLayers must be positive integer' },
            { name: 'float gpuLayers', model: expectedModelData.model, gpuLayers: 1.5, errorText: 'gpuLayers must be positive integer' },
            { name: 'non-number threads', model: expectedModelData.model, threads: 'lol', errorText: 'threads must be positive integer' },
            { name: 'negative threads', model: expectedModelData.model, threads: -2, errorText: 'threads must be positive integer' },
            { name: 'float threads', model: expectedModelData.model, threads: 1.5, errorText: 'threads must be positive integer' },
            { name: 'tensorSplit not array', model: expectedModelData.model, tensorSplit: -1, errorText: 'tensorSplit must be float array with minimal length of two' },
            { name: 'tensorSplit size in 1', model: expectedModelData.model, tensorSplit: [1], errorText: 'tensorSplit must be float array with minimal length of two' },
            { name: 'tensorSplit had non-float items', model: expectedModelData.model, tensorSplit: [1, 'lol'], errorText: 'tensorSplit values must be valid floats' },
        ]

        tests.forEach(test => {
            it(test.name, done => {
                const args = { ...test, name: undefined, errorText: undefined }

                request(app)
                    .put(modelURI)
                    .send(args)
                    .set('Content-Type', 'application/json')
                    .expect(StatusCodes.BAD_REQUEST)
                    .end(done)
            })
        })
    })

    describe('Try re-create or delete model in loading state', () => {
        it('Initial LLM loading', done => {
            request(app)
                .put(modelURI)
                .send(expectedModelData)
                .set('Content-Type', 'application/json')
                .expect(StatusCodes.CREATED)
                .end(done)
        }).timeout(waitTimeoutStop)

        // Not waiting to start

        it('Re-create running LLM', done => {
            request(app)
                .put(modelURI)
                .send(expectedModelData)
                .set('Content-Type', 'application/json')
                .expect(StatusCodes.CONFLICT)
                .end(done)
        })

        // Not waiting to start

        it('Delete running LLM', done => {
            request(app)
                .delete(modelURI)
                .expect(StatusCodes.CONFLICT)
                .end(done)
        })
    })
})
