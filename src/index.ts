import { json } from 'body-parser';
import { Router } from 'express';
import { checkSchema } from 'express-validator';
import { StatusCodes } from 'http-status-codes';

import { chalk,MODULE_NAME } from './consts';
import { Handlers } from './endpoints';
import { Controller } from './kobold';
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
        const pluginRouter = router.use(json())

        // Used to check if the server plugin is running
        pluginRouter.get('/probe', (_, res) => res.sendStatus(StatusCodes.NO_CONTENT));
        // Doc
        pluginRouter.get('/redoc', Handlers.redoc)
        pluginRouter.get('/openapi.yaml', Handlers.openApiYaml)
        // Models
        pluginRouter.get('/model', Handlers.getRunningModel);
        pluginRouter.post('/model', checkSchema(modelSchema, ['body']), this.handlers.postModel);
        pluginRouter.delete('/model', this.handlers.deleteModel);

        globalThis.console.log(chalk.green(MODULE_NAME), 'Plugin loaded!');
    }

    exit = async () => {
        await this.controller.stopKoboldCpp()

        globalThis.console.log(chalk.yellow(MODULE_NAME), 'Plugin exited');
    }
}

const plugin = new KoboldRunnerPlugin()

export default plugin;
