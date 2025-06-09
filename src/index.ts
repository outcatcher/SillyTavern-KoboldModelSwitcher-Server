import path from 'node:path';
import { env } from 'node:process';

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { checkSchema } from 'express-validator';
import { StatusCodes } from 'http-status-codes';

import { version } from '../package.json'
import { chalk, MODULE_NAME } from './consts';
import { Handlers } from './endpoints';
import { Controller } from './kobold';
import { handleErrors, logRequest } from './middlewares';
import { modelSchema } from './validators';

interface PluginInfo {
    id: string;
    name: string;
    description: string;
}

const pluginGitName = 'SillyTavern-KoboldModelSwitcher-Server'

// Would be nice to pass config path
const configPath = (() => {
    if (env.NODE_ENV === 'test') {
        return env.CONFIG_PATH ?? './config.json'
    }

    return path.join(process.cwd(), `./plugins/${pluginGitName}/config.json`)
})

const limiter = rateLimit({
    // eslint-disable-next-line no-magic-numbers
    windowMs: 15 * 60 * 1000,

    max: 100,
});

class KoboldRunnerPlugin {
    info: PluginInfo = {
        id: 'kobold-switcher',
        name: 'Koboldcpp Model switch Plugin',
        description: 'A plugin to reload locally running koboldcpp with different flags.',
    };

    controller?: Controller

    /**
    * Initialize the plugin.
    * @param router Express Router
    */
    init = (router: Router) => {
        // JSON parsed by ST base router
        const pluginRouter = router.use(logRequest)

        // Later initialization of controller allows to change CONFIG_PATH before initialization
        this.controller = new Controller(configPath())

        const handlers = new Handlers(this.controller)

        // Used to check if the server plugin is running
        pluginRouter.get('/probe', (_, res) => res.status(StatusCodes.NO_CONTENT).send());
        // Doc
        pluginRouter.get('/redoc', Handlers.redoc)
        pluginRouter.get('/openapi.yaml', limiter, Handlers.openApiYaml)
        // Models
        pluginRouter.get('/models', handlers.getModels);
        pluginRouter.get('/model', handlers.getRunningModel);
        pluginRouter.put('/model', checkSchema(modelSchema, ['body']), handlers.putModel);
        pluginRouter.delete('/model', handlers.deleteModel);

        pluginRouter.use(handleErrors)

        globalThis.console.log(chalk.green(MODULE_NAME), `Plugin version ${version} loaded!`);
    }

    exit = () => {
        this.controller?.shutdown()

        globalThis.console.log(chalk.yellow(MODULE_NAME), `Plugin version ${version} exited`);
    }
}



const plugin = new KoboldRunnerPlugin()

export default plugin;
