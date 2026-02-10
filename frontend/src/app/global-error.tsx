'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ background: '#18181b', color: '#fff', fontFamily: 'system-ui', padding: '2rem' }}>
        <h1 style={{ color: '#f87171' }}>Something went wrong</h1>
        <pre style={{
          background: '#27272a',
          padding: '1rem',
          borderRadius: '0.5rem',
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxWidth: '100%',
        }}>
          {error.message}
          {'\n\n'}
          {error.stack}
        </pre>
        {error.digest && (
          <p style={{ color: '#a1a1aa' }}>Digest: {error.digest}</p>
        )}
        <button
          onClick={reset}
          style={{
            marginTop: '1rem',
            padding: '0.5rem 1rem',
            background: '#a12d32',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
