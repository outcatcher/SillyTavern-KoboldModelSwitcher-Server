# Plugin-KoboldCpp-Model-Switcher

SillyTavern server plugin for running LLMs using KoboldCpp on server

## Installation

1. Before you begin, make sure you set a config `enableServerPlugins` to `true` in the `config.yaml` file of SillyTavern.

2. Open a terminal in your SillyTavern directory, then run the following:

```bash
cd plugins
git clone https://github.com/outcatcher/SillyTavern-KoboldModelSwitcher-Server
```

**Designed to be used together with [UI Extension](https://github.com/outcatcher/SillyTavern-KoboldModelSwitcher-UI)**

## Configuration

Plugin configuration (`config.json`) located at plugin root (`SillyTavern/plugins/SillyTavern-KoboldModelSwitcher-Server`).

Example:

```json
{
  "basePath": "/e/ll_models"
}
```

### `basePath`

Kobold binary for execution chosen depending on OS (`process.platform`):

| `process.platform` | path                                       |
| ------------------ | ------------------------------------------ |
| `linux`            | `${basePath}/koboldcpp-linux-x64-cuda1210` |
| `darwin`           | `${basePath}/koboldcpp-mac-arm64`          |
| `win32`            | `${basePath}\koboldcpp_cu12.exe`           |

## API documentation

Model operations include:

- `GET /api/plugins/kobold-switcher/models` - listing GGUF models in `basePath` directory
- `GET /api/plugins/kobold-switcher/model`- model currently run by KoboldCpp
- `PUT /api/plugins/kobold-switcher/model`- starts or restarts KoboldCpp instance with given configuration

    Body example:
    ```json
    {
        "contextSize": 12288,
        "gpuLayers": 81,
        "model": "nvidia_Llama-3_3-Nemotron-Super-49B-v1-Q4_K_S.gguf",
        "threads": 1,
        "tensorSplit": [29, 52]
    }
    ```
- `DELETE /api/plugins/kobold-switcher/model`- stops currently running KoboldCpp instance (only if started by plugin)

**Complete API documentation available with running ST (open ST main page before opening)
http://localhost:8000/api/plugins/kobold-switcher/redoc**

## Known limitations

1. We expect `basePath` to contain both kobold executable and models (for `GET /models` endpoint)

    Will be changed in future to search for executable in PATH first OR/AND make binary path configurable.

## Security considerations

No arguments passed via API are passed to the shell. \
All arguments passed to koboldcpp binary are escaped by standard NodeJS measures. \
Value of `model` contain absolute path or path with parent directory (`..`), potentially allowing koboldcpp to use *any* model in the system.

## License

AGPLv3
