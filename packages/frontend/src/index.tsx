/* @refresh reload */
import { HashRouter, Route, useNavigate } from '@solidjs/router'
import { render } from 'solid-js/web'
import Logos from './components/Logos'
import './index.css'
import Home from './pages/Home'
import Protected from './pages/Protected'

const App = (props: any) => {
  const navigate = useNavigate()
  // check if 'next' is set in session storage. This is used to navigate to the protected area after authentication
  const next = sessionStorage.getItem('next')
  if (next) {
    sessionStorage.removeItem('next')
    navigate(next, { replace: true })
  }

  return (
    <div class="flex h-screen flex-col">
      <header class="ml-auto mr-auto overflow-y-auto">
        <h1 class="pb-4 pt-8 text-center text-4xl">AWS Deployment Examples</h1>
        <Logos />
      </header>
      <main>
        <div class="pt-16 text-center">{props.children}</div>
      </main>
    </div>
  )
}

render(
  () => (
    <HashRouter root={App}>
      <Route path="/" component={Home} />
      <Route path="/protected" component={Protected} />
    </HashRouter>
  ),
  document.querySelector('#root')!,
)
