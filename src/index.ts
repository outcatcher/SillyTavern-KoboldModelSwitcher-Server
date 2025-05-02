import bodyParser from 'body-parser';
import { Router } from 'express';
import { chalk, MODULE_NAME } from './consts';
import { Handlers } from './endpoints';
import { Controller } from './kobold';


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

    jsonParser = bodyParser.json()
    controller = new Controller()
    handlers = new Handlers(this.controller)

    /**
    * Initialize the plugin.
    * @param router Express Router
    */
    init = async (router: Router) => {
        // Used to check if the server plugin is running
        router.get('/probe', (_, res) => {
            return res.sendStatus(204);
        });
        // doc
        router.get('/redoc', this.handlers.redoc)
        router.get('/openapi.yaml', this.handlers.openApiYaml)
        // models
        router.get('/model', this.handlers.getRunningModel);
        router.post('/model', this.jsonParser, this.handlers.postModel);
        router.delete('/model', this.jsonParser, this.handlers.deleteModel);

        console.log(chalk.green(MODULE_NAME), 'Plugin loaded!');
    }

    exit = async () => {
        await this.controller.stopKoboldCpp()

        console.log(chalk.yellow(MODULE_NAME), 'Plugin exited');
    }
}

const plugin = new KoboldRunnerPlugin()

export default plugin;
