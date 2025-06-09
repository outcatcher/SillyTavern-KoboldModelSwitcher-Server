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
  "modelsDir": "/e/ll_models",
  "koboldBinary": "koboldcpp-linux-x64-cuda1210",
  "defaultArgs": [
    "--quiet",
    "--flashattention",
    "--usemlock",
    "--usecublas",
    "0"
  ]
}
```

### `modelsDir`

Path to directory with models to be used by KoboldCpp.

### `koboldBinary`

Path to KoboldCpp binary. Can be either absolute path to binary or executable in `$PATH`.

Following table shows default binary names to be searched in `$PATH` for different platforms if not set:

| `process.platform` | path                           |
| ------------------ | ------------------------------ |
| `linux`            | `koboldcpp-linux-x64-cuda1210` |
| `darwin`           | `koboldcpp-mac-arm64`          |
| `win32`            | `koboldcpp_cu12.exe`           |

### `defaultArgs`

Default arguments passed to KoboldCpp binary on each execution.
If not specified, default values will be used (see KoboldCpp help for details).

- `--quiet`
- `--flashattention`
- `--usemlock`
- `--usecublas`
- `all`

## API documentation

Model operations include:

- `GET /api/plugins/kobold-switcher/models` - listing GGUF models in `modelsDir` directory
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

1. `defaultArgs` can contain arguments breaking our work with KoboldCpp.
    E.g. `--port` will change port KoboldCpp is listening on, but we will still expect it
    to be available on `localhost:5001`.

## Security considerations

No arguments passed via API are passed to the shell. \
All arguments passed to koboldcpp binary are escaped by standard NodeJS measures. \
Value of `model` contain absolute path or path with parent directory (`..`), potentially allowing koboldcpp to use _any_ model in the system.

## License

AGPLv3
