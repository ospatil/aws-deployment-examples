import { Route, Routes } from '@solidjs/router'
import { createResource } from 'solid-js'
import Logos from './components/Logos'
import Home from './pages/Home'
import Protected from './pages/Protected'

export default function App() {
  const serverData = () => {
    const apiUrl = import.meta.env.VITE_API_URL
    const [payload] = createResource(async () => {
      const response = await fetch(apiUrl)
      return response.text()
    })
    return payload
  }

  return (
    <div class="flex flex-col h-screen">
      <header>
        <h1 class="text-4xl text-center pt-8 pb-4">AWS Deployment Examples</h1>
      </header>
      <main class="overflow-y-auto mr-auto ml-auto">
        <Logos />
        <div class="pt-16 text-center">
          <Routes>
            <Route path="/" component={Home} />
            <Route path="/protected" component={Protected} data={serverData} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
