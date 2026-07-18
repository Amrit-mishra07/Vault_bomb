#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
extern crate alloc;

use alloy_primitives::{Address, B256, U256, Bytes};
use alloy_sol_types::sol;
use stylus_sdk::{block, evm, msg, prelude::*};

sol! {
    event Triggered(address indexed journalist, string arweaveTxId, address teeEndpoint);
    event SwitchRegistered(address indexed journalist, uint256 heartbeatWindowBlocks);
    event HeartbeatReceived(address indexed journalist, uint256 blockNumber);
}

sol_storage! {
    #[entrypoint]
    pub struct VaultBomb {
        mapping(address => Switch) switches;
    }
    
    pub struct Switch {
        bool is_active;
        bool is_triggered;
        address registered_wallet;
        address duress_wallet;
        uint256 heartbeat_window_blocks;
        uint256 last_heartbeat_block;
        string arweave_tx_id;
        address tee_endpoint;
        bytes32 evidence_hash;
    }
}

#[public]
impl VaultBomb {
    /// Registers a new dead-man's switch.
    /// Requires a signature from the TEE proving it has already received the AES key (three-phase commit).
    /// Stores the Arweave TxID for the encrypted evidence and sets the heartbeat window.
    pub fn register_switch(
        &mut self,
        heartbeat_window_blocks: U256,
        arweave_tx_id: String,
        tee_endpoint: Address,
        evidence_hash: B256,
        duress_wallet: Address,
        tee_signature: Bytes
    ) -> Result<(), Vec<u8>> {
        let caller = msg::sender();
        let mut sw = self.switches.setter(caller);
        
        if sw.is_active.get() {
            return Err("Already registered".as_bytes().to_vec());
        }

        // Three-phase commit check: verify TEE signature
        // In production, we'd use ecrecover. For demo, we just require it's not empty.
        if tee_signature.len() == 0 {
            return Err("Missing TEE signature".as_bytes().to_vec());
        }

        sw.is_active.set(true);
        sw.is_triggered.set(false);
        sw.registered_wallet.set(caller);
        sw.duress_wallet.set(duress_wallet);
        sw.heartbeat_window_blocks.set(heartbeat_window_blocks);
        sw.last_heartbeat_block.set(U256::from(block::number()));
        sw.arweave_tx_id.set_str(arweave_tx_id);
        sw.tee_endpoint.set(tee_endpoint);
        sw.evidence_hash.set(evidence_hash);

        evm::log(SwitchRegistered {
            journalist: caller,
            heartbeatWindowBlocks: heartbeat_window_blocks,
        });

        Ok(())
    }

    /// Sent periodically by the journalist to prove they are safe.
    /// Resets the heartbeat timer. If sent from the duress wallet, immediately triggers the release.
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
            evm::log(Triggered {
                journalist,
                arweaveTxId: sw.arweave_tx_id.get_string(),
                teeEndpoint: sw.tee_endpoint.get(),
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

    /// Chainlink Automation interface: Checks if any heartbeat window has expired.
    pub fn check_upkeep(&self, check_data: Bytes) -> Result<(bool, Bytes), Vec<u8>> {
        if check_data.len() != 32 {
            return Ok((false, Bytes::new()));
        }
        
        let mut addr_bytes = [0u8; 20];
        addr_bytes.copy_from_slice(&check_data[12..32]);
        let journalist = Address::from_slice(&addr_bytes);

        let sw = self.switches.getter(journalist);
        
        if !sw.is_active.get() || sw.is_triggered.get() {
            return Ok((false, Bytes::new()));
        }

        let current_block = U256::from(block::number());
        let last_heartbeat = sw.last_heartbeat_block.get();
        let window = sw.heartbeat_window_blocks.get();

        if current_block > last_heartbeat + window {
            return Ok((true, check_data.clone()));
        }

        Ok((false, Bytes::new()))
    }

    /// Chainlink Automation interface: Executes the trigger if the window has expired.
    /// Once triggered, emits an event that the TEE listens to for decrypting the evidence.
    pub fn perform_upkeep(&mut self, perform_data: Bytes) -> Result<(), Vec<u8>> {
        if perform_data.len() != 32 {
            return Err("Invalid data".as_bytes().to_vec());
        }
        let mut addr_bytes = [0u8; 20];
        addr_bytes.copy_from_slice(&perform_data[12..32]);
        let journalist = Address::from_slice(&addr_bytes);

        let mut sw = self.switches.setter(journalist);
        
        if !sw.is_active.get() || sw.is_triggered.get() {
            return Err("Not eligible".as_bytes().to_vec());
        }

        let current_block = U256::from(block::number());
        let last_heartbeat = sw.last_heartbeat_block.get();
        let window = sw.heartbeat_window_blocks.get();

        if current_block > last_heartbeat + window {
            sw.is_triggered.set(true);
            evm::log(Triggered {
                journalist,
                arweaveTxId: sw.arweave_tx_id.get_string(),
                teeEndpoint: sw.tee_endpoint.get(),
            });
            return Ok(());
        }

        Err("Window not expired".as_bytes().to_vec())
    }

    pub fn is_triggered(&self, journalist: Address) -> Result<bool, Vec<u8>> {
        Ok(self.switches.getter(journalist).is_triggered.get())
    }
}
