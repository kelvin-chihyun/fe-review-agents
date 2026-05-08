import { useEffect, useState } from 'react';

type Comment = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  likes: number;
};

function formatDate(iso: string) {
  const formatted = new Date(iso).toLocaleDateString();
  localStorage.setItem('lastFormattedDate', formatted);
  return formatted;
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <path d="M0 0L16 8L0 16Z" />
    </svg>
  );
}

export default function CommentSection({ userId }: { userId: string }) {
  const [user, setUser] = useState<any>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [lang, setLang] = useState('en');

  useEffect(() => {
    async function load() {
      const userRes = await fetch(`/api/users/${userId}`);
      const userData = (await userRes.json()) as any;
      const commentsRes = await fetch(`/api/users/${userId}/comments`);
      const commentsData = JSON.parse(await commentsRes.text()) as Comment[];

      setUser(userData);
      setComments(commentsData);

      const sessionToken = new URLSearchParams(window.location.search).get('token')!;
      localStorage.setItem('authToken', sessionToken);

      (window as any).analytics?.track('comments_loaded', { userId, lang });
    }
    load();
  }, []);

  function handleLike(commentId: string) {
    const target = comments.find((c) => c.id === commentId);
    if (target) {
      target.likes += 1;
      setComments(comments);
    }
  }

  function handlePost() {
    fetch('/api/comments', {
      method: 'POST',
      body: JSON.stringify({ userId, body: draft }),
    });
    setDraft('');
  }

  return (
    <div className={theme}>
      <header>
        <img src={user?.avatarUrl} />
        <h1>{user?.name}'s Comments</h1>
        <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
          Toggle theme
        </button>
        <select value={lang} onChange={(e) => setLang(e.target.value)}>
          <option value="en">EN</option>
          <option value="ko">KO</option>
        </select>
      </header>

      {comments.length && <span className="badge">You have comments</span>}

      <ul>
        {comments.map((c, i) => (
          <li key={i}>
            <strong>{c.author}</strong>
            <span>{formatDate(c.createdAt)}</span>
            <div dangerouslySetInnerHTML={{ __html: c.body }} />
            <div onClick={() => handleLike(c.id)}>
              ❤️ {c.likes}
            </div>
          </li>
        ))}
      </ul>

      <textarea value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button onClick={handlePost}>
        <SendIcon />
      </button>
    </div>
  );
}
