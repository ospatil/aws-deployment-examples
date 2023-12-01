import { useRouteData } from '@solidjs/router'

export default function Protected() {
  const data = useRouteData
  return (
    <div>
      <p class="text-2xl">
        Message from DynamoDB: <span class="bg-violet-800">{data()}</span>
      </p>
    </div>
  )
}
