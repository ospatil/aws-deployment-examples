/* @refresh reload */
import { render } from 'solid-js/web'
import { Router } from '@solidjs/router'
import App from './App'
import './index.css'

const root = document.querySelector('#root')

render(
  () => (
    <Router>
      <App />
    </Router>
  ),
  root!,
)
