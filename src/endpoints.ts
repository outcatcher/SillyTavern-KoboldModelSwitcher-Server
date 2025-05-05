import chalk from 'chalk';
import { RequestHandler } from 'express';
import { ValidationError, validationResult } from 'express-validator';
import { StatusCodes } from 'http-status-codes';

import { MODULE_NAME } from './consts';
import { Controller, getLoadedModelName, KoboldCppArgs } from './kobold';

interface getRunningModelResponse {
    status: 'offline' | 'loading' | 'online' | 'stopping' | 'failed'
    model?: string
    error?: string
}

export class Handlers {
    controller: Controller

    constructor(controller: Controller) {
        this.controller = controller
    }

    getRunningModel: RequestHandler = async (_, res) => {
        const data = await getLoadedModelName()
            .then((name: string): getRunningModelResponse => { return { status: 'online', model: name } })
            .catch((err: unknown): getRunningModelResponse => {
                globalThis.console.info(chalk.white(MODULE_NAME, 'KoboldCpp unavailable', err))

                if (this.controller.shutdownError !== null) {
                    return {
                        status: 'failed',
                        error: this.controller.shutdownError,
                    }
                }

                return {
                    status: 'offline',
                }
            })

        return res.json(data)

    }

    postModel: RequestHandler = async (req, res) => {
        const result = validationResult(req);
        if (!result.isEmpty()) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                error: result
                    .formatWith((err: ValidationError) => err.msg as string)
                    .array(),
            })
        }

        return await this
            .controller
            .runKoboldCpp(req.body as KoboldCppArgs)
            .then(() => res.status(StatusCodes.CREATED).send())
            .catch(
                (err: unknown) => {
                    globalThis.console.error(chalk.redBright(MODULE_NAME), 'KoboldCpp unavailable')
                    globalThis.console.error(err)

                    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: 'error starting koboldcpp' })
                },
            )
    }

    deleteModel: RequestHandler = async (_, res) => {
        await this
            .controller
            .stopKoboldCpp()
            // Well, no luck
            .catch()

        return res.status(StatusCodes.NO_CONTENT).send()
    }

    static openApiYaml: RequestHandler = (_, res) => { res.sendFile('openapi.yaml', { root: `${__dirname}/..` }) }

    static redoc: RequestHandler = (req, res) => {
        const htmlBody = '<html><body>' +
            `<redoc spec-url="${req.baseUrl}/openapi.yaml"></redoc>` +
            '<script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"> </script>' +
            '</html>'

        return res
            .status(StatusCodes.OK)
            .setHeader('content-type', 'text/html')
            .send(htmlBody)
    }
}
