/* @refresh reload */
import { Router } from '@solidjs/router'
import { render } from 'solid-js/web'
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
