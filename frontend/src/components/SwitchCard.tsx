import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { TriggerButton } from './TriggerButton';
import { HeartbeatButton } from './HeartbeatButton';
import { ClaimBountyButton } from './ClaimBountyButton';

export type SwitchStatus = 'ARMED' | 'GRACE_PERIOD' | 'VULNERABLE' | 'TRIGGERED' | 'PUBLISHED';

export type SwitchInfo = {
  id: string;
  owner: string;
  status: SwitchStatus;
  bounty: string;
  bountyClaimed: boolean;
  lastNonce: number;
  irysTxId?: string;
  remainingBlocks?: number;
};

type SwitchCardProps = {
  sw: SwitchInfo;
  wallet: string | null;
  onTriggered: (switchId: string, arweaveTxId?: string) => void;
  onHeartbeat: (switchId: string) => void;
  onClaimed: (switchId: string) => void;
};

const STATUS_COLORS = {
  ARMED: 'bg-green-500/10 border-green-500/30 text-green-400',
  GRACE_PERIOD: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
  VULNERABLE: 'bg-red-500/10 border-red-500/30 text-red-400',
  TRIGGERED: 'bg-red-900/20 border-red-500 text-red-500',
  PUBLISHED: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
};

export function SwitchCard({ sw, wallet, onTriggered, onHeartbeat, onClaimed }: SwitchCardProps) {
  const isOwner = wallet && wallet.toLowerCase() === sw.owner.toLowerCase();

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-6 border bg-bg-card flex flex-col md:flex-row gap-6 justify-between ${STATUS_COLORS[sw.status]}`}
    >
      <div className="flex-1 space-y-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Owner</div>
          <div className="font-mono text-sm break-all text-white">
            {sw.owner} {isOwner && <span className="text-accent ml-2 font-bold">(You)</span>}
          </div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Switch ID</div>
          <div className="font-mono text-sm break-all text-gray-300">
            <Link to={`/switch/${sw.id}`} className="hover:text-white hover:underline transition-colors">
              {sw.id}
            </Link>
          </div>
        </div>
        <div className="flex gap-8">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Bounty</div>
            <div className="font-mono text-sm text-gray-300">{sw.bounty} ETH {sw.bountyClaimed && '(Claimed)'}</div>
          </div>
          {sw.remainingBlocks !== undefined && (sw.status === 'ARMED' || sw.status === 'GRACE_PERIOD') && (
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Time Remaining</div>
              <div className="font-mono text-sm text-white">
                {sw.remainingBlocks > 0 ? (
                  <>~{((sw.remainingBlocks * 12) / 3600).toFixed(1)} hrs <span className="text-gray-500 text-xs">({sw.remainingBlocks} blk)</span></>
                ) : 'Expired'}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col items-start md:items-end gap-4 min-w-[200px]">
        <div className={`px-3 py-1 text-xs font-bold uppercase tracking-widest border ${STATUS_COLORS[sw.status]}`}>
          {sw.status.replace('_', ' ')}
        </div>
        
        {sw.status === 'VULNERABLE' && (
          <TriggerButton switchId={sw.id} onTriggered={onTriggered} />
        )}
        
        {(sw.status === 'ARMED' || sw.status === 'GRACE_PERIOD') && isOwner && (
          <HeartbeatButton switchId={sw.id} onHeartbeat={onHeartbeat} />
        )}

        {(sw.status === 'TRIGGERED' || sw.status === 'PUBLISHED') && !sw.bountyClaimed && (
          <ClaimBountyButton switchId={sw.id} onClaimed={onClaimed} />
        )}
        
        {(sw.status === 'TRIGGERED' || sw.status === 'PUBLISHED') && sw.irysTxId && (
          <Link 
            to={`/switch/${sw.id}`}
            className="mt-2 text-xs font-medium uppercase tracking-widest hover:text-white text-gray-400 transition-colors"
          >
            View Details & Evidence →
          </Link>
        )}
      </div>
    </motion.div>
  );
}
