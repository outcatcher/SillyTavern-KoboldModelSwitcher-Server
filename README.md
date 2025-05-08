# Plugin-KoboldCpp-Model-Switcher

SillyTavern server plugin for running LLMs using KoboldCpp on server

## Configuration

Plugin configuration (`config.json`) located at plugin root.
Plugin contains example configuration.

### `basePath`

Kobold binary for execution chosen depending on OS (`process.platform`):

| `process.platform` | path                                       |
| ------------------ | ------------------------------------------ |
| `linux`            | `${basePath}/koboldcpp-linux-x64-cuda1210` |
| `darwin`           | `${basePath}/koboldcpp-mac-arm64`          |
| `win32`            | `${basePath}\koboldcpp_cu12.exe`           |
