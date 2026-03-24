import '../styles/globals.css';
import Head from 'next/head';

export default function App({ Component, pageProps }: any) {
  return (
    <>
      <Head>
        <title>AI Visibility Audit | Promptraise</title>
        <meta name="description" content="Discover how AI search engines see your product" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
