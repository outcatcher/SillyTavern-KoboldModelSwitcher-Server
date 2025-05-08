/*eslint max-classes-per-file: "off"*/

export class ModelStateError extends Error { }
export class RequestValidationError extends Error {
    messages: string[]

    constructor(messages: string[]) {
        super(messages.join('\n'))

        this.messages = messages
    }
}