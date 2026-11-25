import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerWebPWA } from './services/pwaRegister';

registerWebPWA();

createRoot(document.getElementById('root')!).render(<App />);

