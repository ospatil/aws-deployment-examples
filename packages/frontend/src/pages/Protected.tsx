import { createAsync } from '@solidjs/router'
import { Show } from 'solid-js/web'

type ReturnDataType = {
  message: string
  user: Record<string, unknown>
}

export const loadProtectedData = async () => {
  const apiUrl = import.meta.env.VITE_API_URI_MESSAGES as string
  const response = await fetch(apiUrl)

  return response.json() as Promise<ReturnDataType>
}

export default function Protected() {
  // eslint-disable-next-line @typescript-eslint/promise-function-async
  const data = createAsync(() => loadProtectedData())
  return (
    <Show when={data()}>
      <div>
        <p class="text-2xl">
          Message from DynamoDB: <span class="bg-violet-800">{data()?.message}</span>
        </p>
      </div>
      <pre>{JSON.stringify(data()?.user, null, 2)}</pre>
    </Show>
  )
}
