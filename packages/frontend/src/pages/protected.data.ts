export const loadProtectedData = async () => {
  const apiUrl = import.meta.env.VITE_API_URL as string

  const response = await fetch(apiUrl)

  console.log(`response.status: ${response.status}`)
  console.log(`response.headers: ${JSON.stringify(response.headers)}`)

  return response.text()
}
