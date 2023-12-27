/* @refresh reload */
import { HashRouter, Route, useNavigate, useSearchParams } from '@solidjs/router'
import { onMount } from 'solid-js'
import { render } from 'solid-js/web'
import Logos from './components/Logos'
import './index.css'
import Home from './pages/Home'
import Protected from './pages/Protected'

const App = (props: any) => {
  const navigate = useNavigate()
  // check if there are query params, if so, extract the next path and navigate to it
  // this is used to navigate to the protected area after authentication
  // eslint-disable-next-line unicorn/prevent-abbreviations
  const [searchParams, setSearchParams] = useSearchParams()
  const next = searchParams.next
  console.log(`Received next: ${next}`)

  onMount(() => {
    if (next) {
      setSearchParams({ next: undefined })
      navigate(next, { replace: true })
    }
  })

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
