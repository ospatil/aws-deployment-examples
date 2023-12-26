import { createAsync } from '@solidjs/router'
import { loadProtectedData } from './protected.data'

const message = createAsync(() => loadProtectedData())

export default function Protected() {
  return (
    <div>
      {/* <Show when={!data.loading}> */}
      <p class="text-2xl">
        Message from DynamoDB: <span class="bg-violet-800">{message()}</span>
      </p>
      {/* </Show> */}
    </div>
  )
}
