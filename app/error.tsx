'use client';
export default function ErrorPage({reset}:{error:Error;reset:()=>void}){return <main className="auth"><div className="auth-card"><div className="brand-mark">✳</div><h1>Something went wrong.</h1><p>Please try again. If the problem persists, contact your workspace administrator.</p><button className="primary" onClick={reset}>Try again</button></div></main>}
