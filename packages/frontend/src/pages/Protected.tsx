import { createAsync } from '@solidjs/router'
import { Show } from 'solid-js/web'

export const loadProtectedData = async () => {
  const apiUrl = import.meta.env.VITE_API_URI_MESSAGES as string
  const response = await fetch(apiUrl)

  return response.text()
}

export default function Protected() {
  // eslint-disable-next-line @typescript-eslint/promise-function-async
  const message = createAsync(() => loadProtectedData())
  return (
    <Show when={message()}>
      <div>
        <p class="text-2xl">
          Message from Server: <span class="bg-violet-800">{message()}</span>
        </p>
      </div>
    </Show>
  )
}
