#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
extern crate alloc;

use alloc::string::String;
use alloc::vec::Vec;
use alloy_primitives::{Address, B256, U256};
use alloy_sol_types::sol;
use stylus_sdk::{abi::Bytes, block, evm, msg, prelude::*};


sol! {
    event Triggered(bytes32 indexed switchId, address indexed journalist, address indexed triggerer, string arweaveTxId);
    event SwitchRegistered(bytes32 indexed switchId, address indexed journalist, uint256 heartbeatWindowBlocks, uint256 bountyAmount);
    event HeartbeatReceived(bytes32 indexed switchId, address indexed journalist, uint256 blockNumber);
    event BountyClaimed(bytes32 indexed switchId, address indexed journalist, address indexed triggerer, uint256 amount);
}

sol_storage! {
    #[entrypoint]
    pub struct VaultBomb {
        mapping(bytes32 => Switch) switches;
        address lit_action_pubkey;
    }

    pub struct Switch {
        bool is_active;
        bool is_triggered;
        bool bounty_claimed;
        address registered_wallet;
        address duress_wallet;
        address backup_wallet;
        address triggerer_wallet;
        uint256 heartbeat_window_blocks;
        uint256 grace_period_blocks;
        uint256 last_heartbeat_block;
        uint256 last_nonce;
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
        switch_id: B256,
        heartbeat_window_blocks: U256,
        grace_period_blocks: U256,
        arweave_tx_id: String,
        evidence_hash: B256,
        duress_wallet: Address,
        backup_wallet: Address,
    ) -> Result<(), Vec<u8>> {
        if switch_id == B256::ZERO {
            return Err("Switch ID cannot be zero".as_bytes().to_vec());
        }

        let caller = msg::sender();
        let value = msg::value();
        let mut sw = self.switches.setter(switch_id);
        if sw.is_active.get() {
            return Err("Switch ID already registered".as_bytes().to_vec());
        }

        sw.is_active.set(true);
        sw.is_triggered.set(false);
        sw.bounty_claimed.set(false);
        sw.registered_wallet.set(caller);
        sw.duress_wallet.set(duress_wallet);
        sw.backup_wallet.set(backup_wallet);
        sw.heartbeat_window_blocks.set(heartbeat_window_blocks);
        sw.grace_period_blocks.set(grace_period_blocks);
        sw.last_heartbeat_block.set(U256::from(block::number()));
        sw.last_nonce.set(U256::ZERO);
        sw.bounty_amount.set(value);
        sw.arweave_tx_id.set_str(arweave_tx_id);
        sw.evidence_hash.set(evidence_hash);



        evm::log(SwitchRegistered {
            switchId: switch_id,
            journalist: caller,
            heartbeatWindowBlocks: heartbeat_window_blocks,
            bountyAmount: value,
        });
        Ok(())
    }

    pub fn heartbeat(&mut self, switch_id: B256, nonce: U256) -> Result<(), Vec<u8>> {
        let caller = msg::sender();
        let mut sw = self.switches.setter(switch_id);
        if !sw.is_active.get() {
            return Err("Switch not active".as_bytes().to_vec());
        }
        if sw.is_triggered.get() {
            return Err("Already triggered".as_bytes().to_vec());
        }
        if nonce <= sw.last_nonce.get() {
            return Err("Invalid nonce: Must be strictly increasing".as_bytes().to_vec());
        }

        let journalist = sw.registered_wallet.get();
        if caller == sw.duress_wallet.get() {
            sw.is_triggered.set(true);
            sw.triggerer_wallet.set(caller);
            evm::log(Triggered {
                switchId: switch_id,
                journalist,
                triggerer: caller,
                arweaveTxId: sw.arweave_tx_id.get_string(),
            });
            return Ok(());
        }

        if caller != journalist && caller != sw.backup_wallet.get() {
            return Err("Unauthorized".as_bytes().to_vec());
        }

        sw.last_nonce.set(nonce);
        sw.last_heartbeat_block.set(U256::from(block::number()));
        evm::log(HeartbeatReceived {
            switchId: switch_id,
            journalist,
            blockNumber: U256::from(block::number()),
        });
        Ok(())
    }

    pub fn trigger_release(&mut self, switch_id: B256) -> Result<(), Vec<u8>> {
        let mut sw = self.switches.setter(switch_id);
        if !sw.is_active.get() {
            return Err("Not registered".as_bytes().to_vec());
        }
        if sw.is_triggered.get() {
            return Err("Already triggered".as_bytes().to_vec());
        }

        let current_block = U256::from(block::number());
        if current_block <= sw.last_heartbeat_block.get() + sw.heartbeat_window_blocks.get() + sw.grace_period_blocks.get() {
            return Err("Window not expired".as_bytes().to_vec());
        }

        let triggerer = msg::sender();
        let journalist = sw.registered_wallet.get();
        sw.is_triggered.set(true);
        sw.triggerer_wallet.set(triggerer);
        evm::log(Triggered {
            switchId: switch_id,
            journalist,
            triggerer,
            arweaveTxId: sw.arweave_tx_id.get_string(),
        });
        Ok(())
    }

    pub fn claim_bounty(&mut self, switch_id: B256, lit_proof: Bytes) -> Result<(), Vec<u8>> {
        let mut sw = self.switches.setter(switch_id);
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
        if lit_proof.is_empty() {
            return Err("Invalid Lit Action proof".as_bytes().to_vec());
        }

        sw.bounty_claimed.set(true);
        evm::log(BountyClaimed {
            switchId: switch_id,
            journalist: sw.registered_wallet.get(),
            triggerer: caller,
            amount: sw.bounty_amount.get(),
        });
        Ok(())
    }

    pub fn perform_upkeep(&mut self, perform_data: Bytes) -> Result<(), Vec<u8>> {
        if perform_data.len() != 32 {
            return Err("Invalid perform_data length".as_bytes().to_vec());
        }
        let mut bytes = [0u8; 32];
        bytes.copy_from_slice(&perform_data);
        self.trigger_release(B256::from(bytes))
    }

    pub fn get_switch_info(
        &self,
        switch_id: B256,
    ) -> Result<(Address, bool, bool, U256, U256, U256, bool, U256), Vec<u8>> {
        let sw = self.switches.getter(switch_id);
        if !sw.is_active.get() {
            return Err("Switch not active".as_bytes().to_vec());
        }
        Ok((
            sw.registered_wallet.get(),
            sw.is_active.get(),
            sw.is_triggered.get(),
            sw.heartbeat_window_blocks.get(),
            sw.last_heartbeat_block.get(),
            sw.bounty_amount.get(),
            sw.bounty_claimed.get(),
            sw.last_nonce.get(),
        ))
    }
}

