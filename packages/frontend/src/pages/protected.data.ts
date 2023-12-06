import { createResource } from 'solid-js'

export const ProtectedRouteData = () => {
  const apiUrl = import.meta.env.VITE_API_URL
  const [payload] = createResource(async () => {
    const response = await fetch(apiUrl)
    return response.text()
  })
  return payload
}
