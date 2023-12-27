import { createAsync } from '@solidjs/router'

export const loadProtectedData = async (pathName: string) => {
  const apiUrl = import.meta.env.VITE_API_URI_MESSAGES as string
  const response = await fetch(apiUrl)

  if (response.status === 401) {
    // Unauthorized - trigger the login flow. It simply calls the login endpoint with the current URL as a redirect_uri
    // the actual authentication is triggered by ALB
    window.location.href = `${import.meta.env.VITE_API_URI_LOGIN}?redirect_uri=${
      window.location.origin
    }?next=${pathName}`
  }

  return response.text()
}

export default function Protected(props: any) {
  // eslint-disable-next-line @typescript-eslint/promise-function-async
  const message = createAsync(() => loadProtectedData(props.location.pathname as string))
  return (
    <div>
      <p class="text-2xl">
        Message from DynamoDB: <span class="bg-violet-800">{message()}</span>
      </p>
    </div>
  )
}
