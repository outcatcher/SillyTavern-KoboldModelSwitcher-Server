import { Router } from 'express';
import { checkSchema } from 'express-validator';
import { StatusCodes } from 'http-status-codes';

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


class KoboldRunnerPlugin {
    info: PluginInfo = {
        id: 'kobold-switcher',
        name: 'Koboldcpp Model switch Plugin',
        description: 'A plugin to reload locally running koboldcpp with different flags.',
    };

    controller = new Controller()
    handlers = new Handlers(this.controller)

    /**
    * Initialize the plugin.
    * @param router Express Router
    */
    init = (router: Router) => {
        // JSON parsed by ST base router
        const pluginRouter = router.use(logRequest)

        // Used to check if the server plugin is running
        pluginRouter.get('/probe', (_, res) => res.status(StatusCodes.NO_CONTENT).send());
        // Doc
        pluginRouter.get('/redoc', Handlers.redoc)
        pluginRouter.get('/openapi.yaml', Handlers.openApiYaml)
        // Models
        pluginRouter.get('/model', this.handlers.getRunningModel);
        pluginRouter.put('/model', checkSchema(modelSchema, ['body']), this.handlers.postModel);
        pluginRouter.delete('/model', this.handlers.deleteModel);

        pluginRouter.use(handleErrors)

        globalThis.console.log(chalk.green(MODULE_NAME), 'Plugin loaded!');
    }

    exit = () => {
        this.controller.shutdown()

        globalThis.console.log(chalk.yellow(MODULE_NAME), 'Plugin exited');
    }
}



const plugin = new KoboldRunnerPlugin()

export default plugin;
