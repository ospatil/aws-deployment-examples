import { Route, Routes } from '@solidjs/router'
import Logos from './components/Logos'
import Home from './pages/Home'
import Protected from './pages/Protected'
import { ProtectedRouteData } from './pages/protected.data'

export default function App() {
  return (
    <div class="flex flex-col h-screen">
      <header class="overflow-y-auto mr-auto ml-auto">
        <h1 class="text-4xl text-center pt-8 pb-4">AWS Deployment Examples</h1>
        <Logos />
      </header>
      <main>
        <div class="pt-16 text-center">
          <Routes>
            <Route path="/" component={Home} />
            <Route path="/protected" component={Protected} data={ProtectedRouteData} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
