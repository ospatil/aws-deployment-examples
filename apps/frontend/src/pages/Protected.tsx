import { useRouteData } from '@solidjs/router'
import { Show } from 'solid-js'

export default function Protected() {
  const data = useRouteData()
  return (
    <div>
      <Show
        when={!data.loading}
        fallback={<div class="text-2xl text-red-300">Something went wrong!</div>}
      >
        <p class="text-2xl">
          Message from DynamoDB: <span class="bg-violet-800">{data()}</span>
        </p>
      </Show>
    </div>
  )
}
