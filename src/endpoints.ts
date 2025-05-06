import { RequestHandler, Response } from 'express';
import { ValidationError, validationResult } from 'express-validator';
import { StatusCodes } from 'http-status-codes';

import { ModelState } from './consts';
import { ModelStateError } from './errors';
import { Controller, KoboldCppArgs } from './kobold';

interface getRunningModelResponse {
    status: ModelState
    model?: string
    error?: string
}

const handleError = (response: Response, error: unknown): Response => {
    if (error instanceof ModelStateError) {
        return response
            .status(StatusCodes.CONFLICT)
            .json({ error: error.message })
    }

    if (error instanceof Error) {
        return response
            .status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json({ error: error.message })
    }

    return response
        .status(StatusCodes.INTERNAL_SERVER_ERROR)
        .json({ error })
}

export class Handlers {
    controller: Controller

    constructor(controller: Controller) {
        this.controller = controller
    }

    getRunningModel: RequestHandler = async (_, res) => await this
        .controller
        .getModelStatus()
        .then(status => {
            const data: getRunningModelResponse = {
                status: status.State,
                model: status.Name,
                error: status.ErrorMsg
            }

            return res.json(data)
        })
        .catch((err: unknown) => handleError(res, err))

    postModel: RequestHandler = async (req, res) => {
        const result = validationResult(req);
        if (!result.isEmpty()) {
            const errMsg = result
                .formatWith((err: ValidationError) => err.msg as string)
                .array()

            return res.status(StatusCodes.BAD_REQUEST).json({ error: errMsg })
        }

        const fiveSeconds = 5000

        return await this
            .controller
            .stopKoboldCpp()
            .then(() => this.controller.waitForOneOfModelStates(['offline', 'failed'], fiveSeconds))
            .then(() => { this.controller.runKoboldCpp(req.body as KoboldCppArgs) })
            .then(() => res.status(StatusCodes.CREATED).send())
            .catch((err: unknown) => handleError(res, err))
    }

    deleteModel: RequestHandler = async (_, res) => await this
        .controller
        .stopKoboldCpp()
        .then(() => res.status(StatusCodes.NO_CONTENT).send())
        .catch((err: unknown) => handleError(res, err))

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
