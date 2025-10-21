import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.tsx';

if (window.__POWERED_BY_WUJIE__) {
  let app: ReturnType<typeof createRoot>;
  window.__WUJIE_MOUNT = () => {
    app = createRoot(document.getElementById('root')!);
    app.render(
      <StrictMode>
        {/* 使用 basename 保持子应用路由与主应用路径一致 */}
        <BrowserRouter basename="/sub-react">
          <App />
        </BrowserRouter>
      </StrictMode>
    );
  };
  window.__WUJIE_UNMOUNT = () => {
    app.unmount();
  };
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {/* 使用 basename 保持子应用路由与主应用路径一致 */}
      <BrowserRouter basename="/sub-react">
        <App />
      </BrowserRouter>
    </StrictMode>
  );
}
