import React from 'react';
import { useParams, Link } from 'react-router-dom';

const Detail: React.FC = () => {
  const params = useParams();
  const id = params.id || 'unknown';

  return (
    <div style={{ padding: 16 }}>
      <h2>详情页</h2>
      <p>当前项 ID: {id}</p>
      <Link to="/">返回列表</Link>
    </div>
  );
};

export default Detail;
