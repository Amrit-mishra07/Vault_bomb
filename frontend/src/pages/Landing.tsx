import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

export default function Landing({ wallet, onConnect }: { wallet: string | null, onConnect: () => void }) {
  const navigate = useNavigate();

  const handleAction = () => {
    if (wallet) {
      navigate('/register');
    } else {
      onConnect();
    }
  };

  const steps = [
    {
      num: '01',
      title: 'Encrypt & Arm',
      desc: 'Encrypt evidence locally. Upload ciphertext permanently to Irys. Register your switch on Arbitrum.'
    },
    {
      num: '02',
      title: 'Heartbeat',
      desc: 'Send periodic on-chain transactions to prove you are alive. The countdown resets.'
    },
    {
      num: '03',
      title: 'Vulnerability',
      desc: 'If you fall silent and the grace period expires, anyone can trigger the release to claim the bounty.'
    },
    {
      num: '04',
      title: 'Decryption',
      desc: 'Lit Protocol verifies the on-chain trigger, decrypts the evidence, and publishes it universally.'
    }
  ];

  return (
    <div className="flex flex-col min-h-screen bg-black text-white selection:bg-accent selection:text-white pb-20">
      
      {/* Editorial Navigation */}
      <nav className="w-full max-w-7xl mx-auto px-6 h-24 flex items-center justify-between border-b border-white/10">
        <div className="text-3xl font-bold tracking-tighter">Vault_bomb</div>
        <button 
          onClick={handleAction}
          className="text-sm font-medium uppercase tracking-widest hover:text-accent transition-colors"
        >
          {wallet ? 'Enter App' : 'Connect'}
        </button>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 mt-32">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="max-w-4xl"
        >
          <h1 className="text-6xl md:text-8xl font-bold tracking-tighter leading-none mb-8">
            The unstoppable <br/><span className="text-accent">dead-man's switch.</span>
          </h1>
          <p className="text-2xl md:text-3xl text-gray-400 font-light leading-tight mb-16 max-w-2xl">
            A heartbeat-gated evidence release protocol for whistleblowers, RTI activists, and investigative journalists.
          </p>
          
          <button 
            onClick={handleAction}
            className="group relative inline-flex items-center justify-center px-8 py-4 bg-white text-black font-medium text-lg tracking-wider uppercase overflow-hidden"
          >
            <span className="relative z-10 group-hover:text-white transition-colors duration-300">
              {wallet ? 'Arm Your Switch' : 'Connect Wallet to Arm'}
            </span>
            <div className="absolute inset-0 bg-accent transform scale-y-0 origin-bottom group-hover:scale-y-100 transition-transform duration-300 ease-out" />
          </button>
        </motion.div>

        {/* How it Works Grid */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
          className="mt-48"
        >
          <div className="text-sm font-mono tracking-widest text-gray-500 uppercase mb-12 border-b border-white/10 pb-4">
            System Architecture
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-4 border-l border-white/10">
            {steps.map((step, idx) => (
              <div key={idx} className="pl-6 relative">
                {/* Timeline connector dot */}
                <div className="absolute -left-[5px] top-1 w-[9px] h-[9px] bg-white rounded-full" />
                
                <div className="text-accent font-mono text-xs mb-4">{step.num}</div>
                <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </main>
      
    </div>
  );
}
