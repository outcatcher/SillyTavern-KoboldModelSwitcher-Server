
class TimeoutError extends Error {
    constructor(ms: number) {
        super(`Timeout reached after ${ms.toString()}ms`)
    }
}

const timeout = async (durationMs: number) =>
    new Promise((_, reject) => { setTimeout(reject, durationMs) })
        .catch(() => new TimeoutError(durationMs))

export const sleep = async (durationMs: number) => new Promise((resolve) => { setTimeout(resolve, durationMs) })

export const waitFor = async (predicate: () => Promise<boolean>, timeoutMs: number, retryInterval: number) => {
    const waitForPredicate = async () => {
        if (await predicate()) {
            return
        }

        // Sleep x_x
        await sleep(retryInterval)

        await waitForPredicate()
    }

    await Promise.race([
        waitForPredicate(),
        timeout(timeoutMs),
    ])
}
