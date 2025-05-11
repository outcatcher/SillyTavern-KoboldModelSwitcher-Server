import bodyParser from 'body-parser'
import express from 'express'
import { StatusCodes } from 'http-status-codes'
import { it } from 'mocha'
import request from 'supertest'

import plugin from '../src/index'
import { waitFor } from '../src/timers'

const app = express()
app.use(bodyParser.json());

const modelURL = '/model'

// CURRENT TEST IMPLEMENTATION IS TO BE RUN LOCALLY
// To be set up for CI:
//  1. Some tiny LLM
//  2. KoboldCpp download + unpacking

const expectedModelData = {
    model: 'Qwen3-0.6B-UD-IQ1_S.gguf', // 205Mb
}

const secondModelname = 'Qwen3-0.6B-UD-IQ1_M.gguf' // 211Mb

const waitIntervalStart = 3000,
    waitTimeoutStart = 60000

const waitIntervalStop = 100,
    waitTimeoutStop = 5000

describe('Test Plugin workflow', () => {
    before(() => {
        plugin.init(app)
    });

    // Yes, tests are dependant. What now?

    it('Check plugin running', done => {
        request(app)
            .get('/probe')
            .expect(StatusCodes.NO_CONTENT)
            .end(done)
    })

    it('Check model offline', done => {
        request(app)
            .get(modelURL)
            .expect(StatusCodes.OK, {
                status: 'offline'
            })
            .end(done)
    })

    it('Initial LLM loading', done => {
        request(app)
            .put(modelURL)
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
                .get(modelURL)
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
            .put(modelURL)
            .send({ model: secondModelname })
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
                .get(modelURL)
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
            .delete(modelURL)
            .expect(StatusCodes.NO_CONTENT)
            .end(done)
    })

    it('Wait for stopping', async () => {
        await waitFor(
            async () => await request(app)
                .get(modelURL)
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
})

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
    before(() => {
        plugin.init(app)
    });

    after(() => {
        plugin.exit()
    })

    describe('Model creation validation', () => {
        const tests: koboldCppArgsErr[] = [
            { name: 'missing model', errorText: 'model is required' },
            { name: 'empty model', model: '', errorText: 'model is required' },
            { name: 'invalid contextSize', model: expectedModelData.model, contextSize: 500, errorText: 'contextSize must be one of.+' },
            { name: 'non-number gpuLayers', model: expectedModelData.model, gpuLayers: 'lol', errorText: 'gpuLayers must be positive integer' },
            { name: 'negative gpuLayers', model: expectedModelData.model, gpuLayers: -1, errorText: 'gpuLayers must be positive integer' },
            { name: 'float gpuLayers', model: expectedModelData.model, gpuLayers: 1.5, errorText: 'gpuLayers must be positive integer' },
            { name: 'non-number threads', model: expectedModelData.model, threads: 'lol', errorText: 'threads must be positive integer' },
            { name: 'negative threads', model: expectedModelData.model, threads: -1, errorText: 'threads must be positive integer' },
            { name: 'float threads', model: expectedModelData.model, threads: 1.5, errorText: 'threads must be positive integer' },
            { name: 'tensorSplit not array', model: expectedModelData.model, tensorSplit: -1, errorText: 'tensorSplit must be float array with minimal length of two' },
            { name: 'tensorSplit size in 1', model: expectedModelData.model, tensorSplit: [1], errorText: 'tensorSplit must be float array with minimal length of two' },
            { name: 'tensorSplit had non-float items', model: expectedModelData.model, tensorSplit: [1, 'lol'], errorText: 'tensorSplit values must be valid floats' },
        ]

        tests.forEach(test => {
            it(test.name, done => {
                const args = { ...test, name: undefined, errorText: undefined }

                request(app)
                    .put(modelURL)
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
                .put(modelURL)
                .send(expectedModelData)
                .set('Content-Type', 'application/json')
                .expect(StatusCodes.CREATED)
                .end(done)
        }).timeout(waitTimeoutStop)

        // Not waiting to start

        it('Re-create running LLM', done => {
            request(app)
                .put(modelURL)
                .send(expectedModelData)
                .set('Content-Type', 'application/json')
                .expect(StatusCodes.CONFLICT)
                .end(done)
        })

        // Not waiting to start

        it('Delete running LLM', done => {
            request(app)
                .delete(modelURL)
                .expect(StatusCodes.CONFLICT)
                .end(done)
        })
    })
})