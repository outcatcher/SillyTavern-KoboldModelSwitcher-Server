import { ErrorRequestHandler, RequestHandler } from "express";
import { StatusCodes } from "http-status-codes";

import { chalk, MODULE_NAME } from "./consts";
import { ModelStateError, RequestValidationError } from "./errors";

export const logRequest: RequestHandler = (req, resp, next) => {
    globalThis.console.log(chalk.white(MODULE_NAME, 'Request', req.method, req.url))

    next('route')

    resp.on('finish', () => {
        globalThis.console.log(
            chalk.white(MODULE_NAME, 'Response', req.method, req.url, resp.statusCode)
        );
    })
}


export const handleErrors: ErrorRequestHandler = (error, _req, response, _next) => {
    switch (true) {
        case error instanceof RequestValidationError:
            return response
                .status(StatusCodes.BAD_REQUEST)
                .json({ errors: error.messages })
        case error instanceof ModelStateError:
            return response
                .status(StatusCodes.CONFLICT)
                .json({ error: error.message })
        case error instanceof Error:
            return response
                .status(StatusCodes.INTERNAL_SERVER_ERROR)
                .json({ error: error.message })
        default:
            return response
                .status(StatusCodes.INTERNAL_SERVER_ERROR)
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                .json({ error })
    }
}