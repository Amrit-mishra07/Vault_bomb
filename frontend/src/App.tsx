import { useState, useEffect } from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import Landing from './pages/Landing';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import SwitchDetail from './pages/SwitchDetail';

function App() {
  const [wallet, setWallet] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Check if already connected
    if (window.ethereum) {
      window.ethereum.request({ method: 'eth_accounts' })
        .then((accounts: string[]) => {
          if (accounts && accounts.length > 0) setWallet(accounts[0]);
        })
        .catch(console.error);
        
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length > 0) {
          setWallet(accounts[0]);
        } else {
          setWallet(null);
          navigate('/');
        }
      };

      const handleDisconnect = () => {
        setWallet(null);
        navigate('/');
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('disconnect', handleDisconnect);

      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('disconnect', handleDisconnect);
      };
    }
  }, [navigate]);

  useEffect(() => {
    // Wake up the Lit Simulator Render instance on app mount
    const simulatorUrl = import.meta.env.VITE_LIT_SIMULATOR_URL || 'https://vault-bomb-simulator.onrender.com';
    fetch(`${simulatorUrl}/health`).catch(() => {
      console.warn("Failed to ping lit-simulator health endpoint");
    });
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

  const isLanding = location.pathname === '/';

  return (
    <div className="min-h-screen flex flex-col font-sans bg-black text-white selection:bg-accent selection:text-white">
      {/* Editorial Header */}
      {!isLanding && (
        <header className="border-b border-white/10 sticky top-0 bg-black/80 backdrop-blur-md z-50">
          <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
            <Link to="/" className="text-2xl font-bold tracking-tight hover:text-accent transition-colors">
              Vault_bomb
            </Link>
            
            <nav className="flex items-center gap-8">
              <Link 
                to="/register" 
                className={`text-sm tracking-widest uppercase font-medium transition-colors hover:text-white ${location.pathname === '/register' ? 'text-accent' : 'text-gray-400'}`}
              >
                Arm Switch
              </Link>
              <Link 
                to="/dashboard" 
                className={`text-sm tracking-widest uppercase font-medium transition-colors hover:text-white ${location.pathname === '/dashboard' ? 'text-accent' : 'text-gray-400'}`}
              >
                Dashboard
              </Link>
              
              {wallet ? (
                <div className="px-4 py-2 rounded bg-white/5 border border-white/10 text-sm font-mono text-gray-300">
                  {wallet.slice(0, 6)}...{wallet.slice(-4)}
                </div>
              ) : (
                <button 
                  onClick={connectWallet}
                  className="px-6 py-2 bg-accent text-white font-medium text-sm tracking-wider uppercase hover:bg-accent-hover transition-colors"
                >
                  Connect
                </button>
              )}
            </nav>
          </div>
        </header>
      )}

      <main className="flex-1 w-full max-w-5xl mx-auto">
        <Routes>
          <Route path="/" element={<Landing wallet={wallet} onConnect={connectWallet} />} />
          <Route path="/register" element={<Register wallet={wallet} />} />
          <Route path="/dashboard" element={<Dashboard wallet={wallet} />} />
          <Route path="/switch/:id" element={<SwitchDetail wallet={wallet} />} />
        </Routes>
      </main>

      {!isLanding && (
        <footer className="border-t border-white/10 mt-20">
          <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-sm text-gray-500">
              Unstoppable Dead-Man's Switch. Built for Arbitrum Builder Pods.
            </div>
            <div className="text-xs text-gray-600 bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
              Simulated Lit Protocol node — Phase 2 will use real threshold custody.
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}

export default App;
