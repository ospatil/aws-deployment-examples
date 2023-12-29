import { createAsync } from '@solidjs/router'
import { Show } from 'solid-js/web'

type ReturnDataType = {
  message: string
  user: {
    given_name: string
  }
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
          Hello <span class="bg-violet-800">{data()?.user?.given_name}!</span> Message from
          DynamoDB: <span class="bg-violet-800">{data()?.message}</span>
        </p>
      </div>
    </Show>
  )
}
