import { useEffect } from 'react';

function App() {
  useEffect(() => {
    window.location.replace('/docs');
  }, []);

  return (
    <p>
      SejukGuard API is running. <a href="/docs">Open the API docs</a> ·{' '}
      <a href="/health">health</a>
    </p>
  );
}

export default App;
