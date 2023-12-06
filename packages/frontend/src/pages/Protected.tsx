import { useRouteData } from '@solidjs/router'
import { Show } from 'solid-js'
import { ProtectedRouteData } from '../protected.data'

export default function Protected() {
  const data = useRouteData<typeof ProtectedRouteData>()
  return (
    <div>
      <Show when={!data.loading}>
        <p class="text-2xl">
          Message from DynamoDB: <span class="bg-violet-800">{data()}</span>
        </p>
      </Show>
    </div>
  )
}
