export class SseFrameError extends Error {}

export async function* readSseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/gu, '\n')
      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n')
        if (data.length > 0) {
          yield data
        }
        boundary = buffer.indexOf('\n\n')
      }
    }

    buffer += decoder.decode().replace(/\r\n/gu, '\n')
    if (buffer.trim().length > 0) {
      throw new SseFrameError('SSE stream ended with an incomplete frame.')
    }
  } finally {
    reader.releaseLock()
  }
}
