import { RequestHandler, Router } from 'express';
import { checkSchema } from 'express-validator';
import { StatusCodes } from 'http-status-codes';

import { chalk, MODULE_NAME } from './consts';
import { Handlers } from './endpoints';
import { Controller } from './kobold';
import { modelSchema } from './validators';


interface PluginInfo {
    id: string;
    name: string;
    description: string;
}

const logRequest: RequestHandler = (req, resp, next) => {
    globalThis.console.log(chalk.white(MODULE_NAME, 'Request', req.method, req.url))

    next()

    resp.on('finish', () => {
        globalThis.console.log(
            chalk.white(MODULE_NAME, 'Response', req.method, req.url, resp.statusCode)
        );
    })
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

        globalThis.console.log(chalk.green(MODULE_NAME), 'Plugin loaded!');
    }

    exit = () => {
        this.controller.shutdown()

        globalThis.console.log(chalk.yellow(MODULE_NAME), 'Plugin exited');
    }
}



const plugin = new KoboldRunnerPlugin()

export default plugin;
