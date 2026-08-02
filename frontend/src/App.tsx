import { useState, useEffect } from 'react';
import { Publisher } from './components/Publisher';
import { WatcherDashboard } from './components/WatcherDashboard';
import './App.css';

function App() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'publisher' | 'watcher'>('publisher');

  useEffect(() => {
    // Check if already connected
    if (window.ethereum) {
      window.ethereum.request({ method: 'eth_accounts' })
        .then((accounts: string[]) => {
          if (accounts && accounts.length > 0) setWallet(accounts[0]);
        })
        .catch(console.error);
    }
  }, []);

  const connectWallet = async () => {
    if (!window.ethereum) return alert("Install MetaMask to use Vault Bomb.");
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setWallet(accounts[0]);
    } catch (e) {
      console.error(e);
    }
  };

  if (!wallet) {
    return (
      <div className="landing-page">
        <h1>Vault Bomb</h1>
        <p>Unstoppable Dead-Man's Switch powered by Lit Protocol and Irys</p>
        <button onClick={connectWallet} className="primary-btn">Connect Wallet</button>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', gap: '1rem' }}>
        <h1 style={{ fontSize: '3rem', margin: 0 }}>Vault Bomb</h1>
        <nav className="header-nav" style={{ display: 'flex', gap: '2rem' }}>
          <button 
            onClick={() => setActiveTab('publisher')}
            className={activeTab === 'publisher' ? 'nav-active' : 'nav-inactive'}
            style={{ background: 'none', border: 'none', color: activeTab === 'publisher' ? 'white' : '#8a8a9d', fontSize: '1.2rem', cursor: 'pointer', borderBottom: activeTab === 'publisher' ? '2px solid var(--accent)' : 'none', paddingBottom: '0.4rem', fontWeight: activeTab === 'publisher' ? 'bold' : 'normal' }}
          >
            Publisher
          </button>
          <button 
            onClick={() => setActiveTab('watcher')}
            className={activeTab === 'watcher' ? 'nav-active' : 'nav-inactive'}
            style={{ background: 'none', border: 'none', color: activeTab === 'watcher' ? 'white' : '#8a8a9d', fontSize: '1.2rem', cursor: 'pointer', borderBottom: activeTab === 'watcher' ? '2px solid var(--accent)' : 'none', paddingBottom: '0.4rem', fontWeight: activeTab === 'watcher' ? 'bold' : 'normal' }}
          >
            Watcher Dashboard
          </button>
        </nav>
        <div className="wallet-badge" style={{ position: 'absolute', right: 0, top: '10px' }}>
          {wallet.slice(0, 6)}...{wallet.slice(-4)}
        </div>
      </header>
      <main className="main-content">
        {activeTab === 'publisher' ? (
          <section>
            <Publisher />
          </section>
        ) : (
          <section>
            <WatcherDashboard />
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
