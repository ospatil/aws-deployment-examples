/* @refresh reload */
import { HashRouter, Route } from '@solidjs/router'
import { render } from 'solid-js/web'
import Logos from './components/Logos'
import './index.css'
import Home from './pages/Home'
import Protected from './pages/Protected'
import { loadProtectedData } from './pages/protected.data'

const App = (props: any) => {
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
      <Route path="/protected" component={Protected} load={loadProtectedData} />
    </HashRouter>
  ),
  document.querySelector('#root')!,
)
