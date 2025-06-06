import { RequestHandler } from 'express';
import { ValidationError, validationResult } from 'express-validator';
import { StatusCodes } from 'http-status-codes';

import { ModelState } from './consts';
import { RequestValidationError } from './errors';
import { Controller, KoboldCppArgs } from './kobold';

const fiveSeconds = 5000

interface getRunningModelResponse {
    status: ModelState
    model?: string
    error?: string
}

export class Handlers {
    controller: Controller

    constructor(controller: Controller) {
        this.controller = controller
    }

    getModels: RequestHandler = async (_, res, next) => await this
        .controller
        .listGGUFModels()
        .then(models => res.json({ models }))
        .catch(next)

    getRunningModel: RequestHandler = async (_, res, next) => await this
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
        .catch(next)

    putModel: RequestHandler = async (req, res, next) => {
        globalThis.console.info('body:', req.body)

        const result = validationResult(req);
        if (!result.isEmpty()) {
            const errMsg = result
                .formatWith((err: ValidationError) => err.msg as string)
                .array()

            next(new RequestValidationError(errMsg)); return;
        }

        await this
            .controller
            .stopKoboldCpp()
            .then(() => this.controller.waitForOneOfModelStates(['offline', 'failed'], fiveSeconds))
            .then(() => { this.controller.runKoboldCpp(req.body as KoboldCppArgs) })
            .then(() => res.status(StatusCodes.CREATED).send())
            .catch(next)
    }

    deleteModel: RequestHandler = async (_, res, next) => await this
        .controller
        .stopKoboldCpp()
        .then(() => res.status(StatusCodes.NO_CONTENT).send())
        .catch(next)

    static openApiYaml: RequestHandler = (_, res) => {
        res.
            sendFile('openapi.yaml', { root: `${__dirname}/..` });
    };


    static redoc: RequestHandler = (req, res) =>
        res
            .status(StatusCodes.OK)
            .setHeader('content-type', 'text/html')
            .send('<html><body>' +
                `<redoc spec-url="${req.baseUrl}/openapi.yaml"></redoc>` +
                '<script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"> </script>' +
                '</html>')
}
