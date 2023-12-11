import { Route, Routes } from '@solidjs/router'
import Logos from './components/Logos'
import Home from './pages/Home'
import Protected from './pages/Protected'
import { ProtectedRouteData } from './pages/protected.data'

export default function App() {
  return (
    <div class="flex h-screen flex-col">
      <header class="ml-auto mr-auto overflow-y-auto">
        <h1 class="pb-4 pt-8 text-center text-4xl">AWS Deployment Examples</h1>
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
