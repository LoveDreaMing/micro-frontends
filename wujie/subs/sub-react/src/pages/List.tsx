import React from 'react';
import { Link } from 'react-router-dom';

const List: React.FC = () => {
  const items = Array.from({ length: 10 }).map((_, i) => ({ id: i + 1, name: `Item ${i + 1}` }));

  return (
    <div style={{ padding: 16 }}>
      <h2>列表页</h2>
      <ul>
        {items.map((it) => (
          <li key={it.id}>
            <Link to={`/detail/${it.id}`}>{it.name}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default List;
