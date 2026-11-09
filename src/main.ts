import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { startStopExample } from './core'
import { initApp } from './ui/app.svelte'
import { loadSaved } from './ui/storage'

// Open the last sheet if there is one; a first visit starts with the start/stop example.
const saved = await loadSaved()
const app = initApp(saved ?? startStopExample(), !!saved)

// Save at once when the tab is hidden or closed, so nothing waits on the autosave delay.
addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && app.unsaved) void app.saveNow()
})
addEventListener('pagehide', () => {
  if (app.unsaved) void app.saveNow()
})

export default mount(App, { target: document.getElementById('app')! })
