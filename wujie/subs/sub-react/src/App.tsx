import React from 'react';
import { Routes, Route, Link, Navigate } from 'react-router-dom';
import List from './pages/List';
import Detail from './pages/Detail';
import './App.css';

const App: React.FC = () => {
  const jumpToVue = () => {
    // window.$wujie?.props?.jump('/sub-vue'); // 方式一
    window.$wujie.bus.$emit?.('jump', '/sub-vue'); // 方式二
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <Link to="/">列表</Link>
        <Link to="/detail/1">详情</Link>
        <div style={{ cursor: 'pointer' }} onClick={jumpToVue}>
          跳转到Vue子应用
        </div>
      </div>

      <Routes>
        {/* 内部路由重定向：/ -> /list（使用 Navigate，不会修改主应用的 URL） */}
        <Route path="/" element={<Navigate to="/list" replace />} />
        <Route path="/list" element={<List />} />
        <Route path="/detail/:id" element={<Detail />} />
      </Routes>
    </div>
  );
};

export default App;
