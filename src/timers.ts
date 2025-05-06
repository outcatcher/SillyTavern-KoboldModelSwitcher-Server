
class TimeoutError extends Error {
    constructor(ms: number) {
        super(`Timeout reached after ${ms.toString()}ms`)
    }
}

export const timeout = async (durationMs: number) =>
    new Promise((_, reject) => { setTimeout(reject, durationMs) })
        .catch(() => new TimeoutError(durationMs))


export const sleep = async (durationMs: number) => new Promise((resolve) => { setTimeout(resolve, durationMs) })
