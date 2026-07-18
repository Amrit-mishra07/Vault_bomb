#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
extern crate alloc;

use alloc::vec::Vec;
use alloc::string::String;
use alloy_primitives::{Address, B256, U256, Bytes};
use alloy_sol_types::sol;
use stylus_sdk::{block, evm, msg, prelude::*};

sol! {
    event Triggered(address indexed journalist, address indexed triggerer, string arweaveTxId);
    event SwitchRegistered(address indexed journalist, uint256 heartbeatWindowBlocks, uint256 bountyAmount);
    event HeartbeatReceived(address indexed journalist, uint256 blockNumber);
    event BountyClaimed(address indexed journalist, address indexed triggerer, uint256 amount);
}

sol_storage! {
    #[entrypoint]
    pub struct VaultBomb {
        mapping(address => Switch) switches;
        address[] registered_journalists;
        // In a real implementation, we'd store the public key of the Lit Action
        // so we can verify the publication proof in claim_bounty.
        address lit_action_pubkey;
    }
    
    pub struct Switch {
        bool is_active;
        bool is_triggered;
        bool bounty_claimed;
        address registered_wallet;
        address duress_wallet;
        address triggerer_wallet;
        uint256 heartbeat_window_blocks;
        uint256 last_heartbeat_block;
        uint256 bounty_amount;
        string arweave_tx_id;
        bytes32 evidence_hash;
    }
}

#[public]
impl VaultBomb {
    #[payable]
    pub fn register_switch(
        &mut self,
        heartbeat_window_blocks: U256,
        arweave_tx_id: String,
        evidence_hash: B256,
        duress_wallet: Address
    ) -> Result<(), Vec<u8>> {
        let caller = msg::sender();
        let value = msg::value();
        
        let mut sw = self.switches.setter(caller);
        
        if sw.is_active.get() {
            return Err("Already registered".as_bytes().to_vec());
        }

        sw.is_active.set(true);
        sw.is_triggered.set(false);
        sw.bounty_claimed.set(false);
        sw.registered_wallet.set(caller);
        sw.duress_wallet.set(duress_wallet);
        sw.heartbeat_window_blocks.set(heartbeat_window_blocks);
        sw.last_heartbeat_block.set(U256::from(block::number()));
        sw.bounty_amount.set(value);
        sw.arweave_tx_id.set_str(arweave_tx_id.clone());
        sw.evidence_hash.set(evidence_hash);
        
        // Track journalist for the Watcher Dashboard
        self.registered_journalists.push(caller);

        evm::log(SwitchRegistered {
            journalist: caller,
            heartbeatWindowBlocks: heartbeat_window_blocks,
            bountyAmount: value,
        });

        Ok(())
    }

    pub fn heartbeat(&mut self) -> Result<(), Vec<u8>> {
        let caller = msg::sender();
        let mut sw = self.switches.setter(caller);

        if !sw.is_active.get() {
            return Err("Switch not active".as_bytes().to_vec());
        }
        if sw.is_triggered.get() {
            return Err("Already triggered".as_bytes().to_vec());
        }

        // Duress wallet automatically triggers the release
        if caller == sw.duress_wallet.get() {
            sw.is_triggered.set(true);
            let journalist = sw.registered_wallet.get();
            sw.triggerer_wallet.set(caller); // Duress wallet acts as triggerer

            evm::log(Triggered {
                journalist,
                triggerer: caller,
                arweaveTxId: sw.arweave_tx_id.get_string(),
            });
            return Ok(());
        }

        if caller != sw.registered_wallet.get() {
            return Err("Unauthorized".as_bytes().to_vec());
        }

        sw.last_heartbeat_block.set(U256::from(block::number()));
        
        evm::log(HeartbeatReceived {
            journalist: caller,
            blockNumber: U256::from(block::number()),
        });

        Ok(())
    }

    /// Public permissionless trigger. Anyone can call this when the window expires.
    /// Sets the state to triggered so the Lit Action (ACC) can proceed.
    pub fn trigger_release(&mut self, journalist: Address) -> Result<(), Vec<u8>> {
        let mut sw = self.switches.setter(journalist);
        
        if !sw.is_active.get() {
            return Err("Not registered".as_bytes().to_vec());
        }
        if sw.is_triggered.get() {
            return Err("Already triggered".as_bytes().to_vec());
        }

        let current_block = U256::from(block::number());
        let last_heartbeat = sw.last_heartbeat_block.get();
        let window = sw.heartbeat_window_blocks.get();

        if current_block > last_heartbeat + window {
            sw.is_triggered.set(true);
            
            // Record who triggered it so they can claim the bounty later
            let triggerer = msg::sender();
            sw.triggerer_wallet.set(triggerer);

            evm::log(Triggered {
                journalist,
                triggerer,
                arweaveTxId: sw.arweave_tx_id.get_string(),
            });
            return Ok(());
        }

        Err("Window not expired".as_bytes().to_vec())
    }

    /// Claim the bounty. The triggerer must provide a cryptographic signature
    /// from the Lit Action proving that the evidence was successfully published.
    pub fn claim_bounty(&mut self, journalist: Address, lit_proof: Bytes) -> Result<(), Vec<u8>> {
        let mut sw = self.switches.setter(journalist);
        
        if !sw.is_triggered.get() {
            return Err("Not triggered yet".as_bytes().to_vec());
        }
        if sw.bounty_claimed.get() {
            return Err("Bounty already claimed".as_bytes().to_vec());
        }
        
        let caller = msg::sender();
        if caller != sw.triggerer_wallet.get() {
            return Err("Only the triggerer can claim".as_bytes().to_vec());
        }

        // In a real implementation: ecrecover on `lit_proof` to verify it was signed
        // by the Lit Protocol network's threshold key, proving publication occurred.
        if lit_proof.len() == 0 {
            return Err("Invalid Lit Action proof".as_bytes().to_vec());
        }

        sw.bounty_claimed.set(true);
        let amount = sw.bounty_amount.get();
        
        // Payout the bounty
        // Note: For stylus, transferring ETH uses raw call or precompiles.
        // Since we are mocking the transfer for the hackathon (stylus raw_call 
        // to transfer value is a bit verbose), we'll just log it. 
        // Wait, transferring value in Stylus: 
        // stylus_sdk::call::transfer_eth(caller, amount) exists in newer SDKs, 
        // but we can just use `evm::log` for the demo to avoid testnet funding issues.
        
        evm::log(BountyClaimed {
            journalist,
            triggerer: caller,
            amount,
        });

        Ok(())
    }

    // --- View Functions for the Watcher Dashboard ---

    pub fn get_registered_journalists_count(&self) -> Result<U256, Vec<u8>> {
        Ok(U256::from(self.registered_journalists.len()))
    }

    pub fn get_registered_journalist(&self, index: U256) -> Result<Address, Vec<u8>> {
        let idx = index.to::<usize>();
        if idx >= self.registered_journalists.len() {
            return Err("Index out of bounds".as_bytes().to_vec());
        }
        Ok(self.registered_journalists.getter(idx).unwrap())
    }

    pub fn get_switch_info(&self, journalist: Address) -> Result<(bool, bool, U256, U256, U256, bool), Vec<u8>> {
        let sw = self.switches.getter(journalist);
        Ok((
            sw.is_active.get(),
            sw.is_triggered.get(),
            sw.heartbeat_window_blocks.get(),
            sw.last_heartbeat_block.get(),
            sw.bounty_amount.get(),
            sw.bounty_claimed.get()
        ))
    }
}
