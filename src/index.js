import { createRoot } from 'react-dom/client'
import React from 'react'
import './demo/styles.css'
import App from './demo/App'

const rootElement = document.getElementById('root');
const root = createRoot(rootElement);

root.render(<App/>);