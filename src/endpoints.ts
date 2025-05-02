import chalk from 'chalk';
import { RequestHandler } from 'express';
import { MODULE_NAME } from './consts';
import { Controller, getLoadedModelName } from './kobold';

interface getRunningModelResponse {
    model: string | undefined
    error: string | undefined
}

export class Handlers {
    controller: Controller

    constructor(controller: Controller) {
        this.controller = controller
    }

    getRunningModel: RequestHandler = async (_, res) => {
        let status = 200
        const data: getRunningModelResponse = { model: undefined, error: undefined }

        await getLoadedModelName()
            .then(name => data.model = name)
            .catch(err => {
                data.error = 'error requesting koboldcpp running model'
                status = 500
                console.error(chalk.redBright(MODULE_NAME), 'KoboldCpp unavailable')
                console.error(err)
            })

        return res.status(status).json(data)
    }

    postModel: RequestHandler = async (req, res) => {
        await this
            .controller
            .runKoboldCpp(req.body)
            .then(() => {
                return res.status(201).send()
            })
            .catch(
                (err) => {
                    console.error(chalk.redBright(MODULE_NAME), 'KoboldCpp unavailable')
                    console.error(err)

                    return res.status(500).json({ error: 'error starting koboldcpp' })
                },
            )
    }

    deleteModel: RequestHandler = async (_, res) => {
        await this
            .controller
            .stopKoboldCpp()
            .catch(/* well, no luck */)

        return res.status(204).send()
    }
}
