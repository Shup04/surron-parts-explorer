'use client';

import dynamic from 'next/dynamic';

const Editor = dynamic(() => import('@/editor/Editor'), {
  ssr: false,
  loading: () => (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#101519',
        color: '#dae5e4',
      }}
    >
      Loading model mapping studio…
    </main>
  ),
});

export default function EditorPage() {
  return <Editor />;
}
